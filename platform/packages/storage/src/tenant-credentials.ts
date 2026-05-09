/**
 * Per-tenant Microsoft Graph credentials persistence.
 *
 * D2 / N1: encrypted_client_secret is stored as bytea. For v1 the cipher
 * is a no-op (plaintext bytes). The dek_key_vault_uri field carries the
 * intended DEK reference so callers can detect "noop://dev" and warn in
 * non-dev environments. A KeyVaultCipher implementation lands in week-4
 * hardening; the table layout doesn't change.
 *
 * `loadTenantCredentials` is RLS-scoped — caller MUST be inside
 * `withTenantContext`. The decrypted secret is held in memory only for
 * the duration of the call.
 */

import type { PoolClient } from "pg";
import { encryptWithDek, decryptWithDek } from "./keyvault-cipher.js";

const NOOP_DEK_URI = "noop://dev";

export interface TenantGraphCredentials {
  /** Microsoft Entra tenant ID (the customer's tenant). */
  microsoftTenantId: string;
  /** App registration / SP client ID. */
  clientId: string;
  /** Decrypted client secret (plaintext at the boundary; treat as ephemeral). */
  clientSecret: string;
  /** Granted scopes (per consent). */
  consentedScopes: readonly string[];
}

export interface SeedTenantCredentialsArgs {
  microsoftTenantId: string;
  clientId: string;
  clientSecret: string;
  consentedScopes?: readonly string[];
  dekKeyVaultUri?: string;
}

/**
 * Load + decrypt credentials for the current tenant context.
 * Throws if no credentials row exists.
 */
export async function loadTenantCredentials(
  client: PoolClient,
): Promise<TenantGraphCredentials> {
  const result = await client.query<{
    client_id: string;
    encrypted_client_secret: Buffer;
    dek_key_vault_uri: string;
    consented_scopes: string[];
    ms_tenant_id: string;
  }>(
    `SELECT
       tc.client_id,
       tc.encrypted_client_secret,
       tc.dek_key_vault_uri,
       tc.consented_scopes,
       t.microsoft_tenant_id::text AS ms_tenant_id
     FROM tenant_credentials tc
     JOIN tenants t ON t.tenant_id = tc.tenant_id
     WHERE tc.tenant_id = current_setting('app.tenant_id')::uuid
     LIMIT 1`,
  );
  if (result.rows.length === 0) {
    throw new Error("loadTenantCredentials: no credentials for current tenant");
  }
  const row = result.rows[0]!;
  const clientSecret = await decryptSecret(row.encrypted_client_secret, row.dek_key_vault_uri);
  return {
    microsoftTenantId: row.ms_tenant_id,
    clientId: row.client_id,
    clientSecret,
    consentedScopes: row.consented_scopes,
  };
}

/**
 * Insert or replace credentials for the current tenant context. Used by:
 *   - the onboarding callback (week 5)
 *   - smoke tests / replay tooling
 *
 * For v1: dekKeyVaultUri defaults to "noop://dev" and the secret is
 * stored as plaintext bytes.
 */
export async function seedTenantCredentials(
  client: PoolClient,
  args: SeedTenantCredentialsArgs,
): Promise<void> {
  const dek = args.dekKeyVaultUri ?? NOOP_DEK_URI;
  const ciphertext = await encryptSecret(args.clientSecret, dek);
  await client.query(
    `INSERT INTO tenant_credentials (
       tenant_id, client_id, encrypted_client_secret, dek_key_vault_uri, consented_scopes
     ) VALUES (
       current_setting('app.tenant_id')::uuid, $1, $2, $3, $4
     )
     ON CONFLICT (tenant_id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       encrypted_client_secret = EXCLUDED.encrypted_client_secret,
       dek_key_vault_uri = EXCLUDED.dek_key_vault_uri,
       consented_scopes = EXCLUDED.consented_scopes,
       rotated_at = now()`,
    [args.clientId, ciphertext, dek, args.consentedScopes ?? []],
  );
}

// ─── Cipher ───────────────────────────────────────────────────────────────────

async function encryptSecret(plaintext: string, dekUri: string): Promise<Buffer> {
  if (dekUri === NOOP_DEK_URI) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("noop DEK is not permitted in production — provision a Key Vault DEK and set dekKeyVaultUri");
    }
    return Buffer.from(plaintext, "utf8");
  }
  return encryptWithDek(plaintext, dekUri);
}

async function decryptSecret(ciphertext: Buffer, dekUri: string): Promise<string> {
  if (dekUri === NOOP_DEK_URI) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("noop DEK is not permitted in production — provision a Key Vault DEK and set dekKeyVaultUri");
    }
    return ciphertext.toString("utf8");
  }
  return decryptWithDek(ciphertext, dekUri);
}
