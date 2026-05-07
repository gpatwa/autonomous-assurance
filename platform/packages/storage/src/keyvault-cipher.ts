/**
 * KeyVault envelope cipher for tenant credentials.
 *
 * Design (envelope encryption):
 *   - A per-tenant Data Encryption Key (DEK) is a 32-byte random AES-256 key.
 *   - The DEK is stored as a Key Vault Secret (hex-encoded).
 *   - The client secret is encrypted locally with AES-256-GCM using the DEK.
 *   - encrypted_client_secret = [12-byte IV | ciphertext | 16-byte auth tag]
 *   - dek_key_vault_uri = Key Vault secret URI including version
 *
 * Why AES-GCM locally instead of Key Vault encrypt/decrypt:
 *   - Key Vault RSA encrypt is bounded by key size (~245 bytes for RSA-2048).
 *   - AES-GCM is unbounded, fast, and authenticated.
 *   - The DEK is still Key Vault-managed (rotatable, auditable, deletable).
 *
 * Permission required: Key Vault Secrets Officer (get + set).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const ALGORITHM = "aes-256-gcm" as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEK_HEX_LENGTH = 64; // 32 bytes * 2

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Provision a new DEK for a tenant: generate a random 256-bit key, store it
 * as a versioned Key Vault Secret, and return the secret's full versioned URI.
 *
 * Call once at tenant onboarding. Re-call for key rotation (old versions
 * remain in Key Vault for decryption of existing rows until rotated out).
 *
 * @param vaultUrl   e.g. "https://kv-kavachiq-platform-dev.vault.azure.net"
 * @param tenantId   KavachIQ tenant UUID (used as secret name)
 */
export async function provisionTenantDek(vaultUrl: string, tenantId: string): Promise<string> {
  const dek = randomBytes(32).toString("hex");
  const secretName = `dek-tenant-${tenantId}`;
  const client = secretClient(vaultUrl);
  const secret = await client.setSecret(secretName, dek, {
    contentType: "application/octet-stream; encoding=hex",
    tags: { purpose: "tenant-credential-dek", tenantId },
  });
  // Return the full versioned URI so we pin the version used for this ciphertext.
  return secret.properties.id!;
}

/**
 * Encrypt a plaintext string using the DEK at the given Key Vault Secret URI.
 * Returns a Buffer suitable for `bytea` storage.
 */
export async function encryptWithDek(plaintext: string, dekUri: string): Promise<Buffer> {
  const dek = await fetchDek(dekUri);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [IV (12)] [ciphertext (variable)] [auth tag (16)]
  return Buffer.concat([iv, ct, tag]);
}

/**
 * Decrypt a Buffer produced by `encryptWithDek` using the DEK at the given URI.
 */
export async function decryptWithDek(ciphertext: Buffer, dekUri: string): Promise<string> {
  if (ciphertext.length < IV_BYTES + TAG_BYTES) {
    throw new Error("keyvault-cipher: ciphertext too short to be valid");
  }
  const dek = await fetchDek(dekUri);
  const iv = ciphertext.subarray(0, IV_BYTES);
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
  const ct = ciphertext.subarray(IV_BYTES, ciphertext.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct) + decipher.final("utf8");
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function secretClient(vaultUrl: string): SecretClient {
  return new SecretClient(vaultUrl, new DefaultAzureCredential());
}

/** Retrieve and validate a DEK from Key Vault by its versioned secret URI. */
async function fetchDek(dekUri: string): Promise<Buffer> {
  // dekUri is a full versioned URI:
  //   https://<vault>.vault.azure.net/secrets/<name>/<version>
  const url = new URL(dekUri);
  const vaultUrl = `${url.protocol}//${url.host}`;
  // Strip leading "/secrets/" and split name/version
  const [, , secretName, secretVersion] = url.pathname.split("/");
  if (!secretName) throw new Error(`keyvault-cipher: cannot parse secret name from URI ${dekUri}`);

  const client = secretClient(vaultUrl);
  const secret = await client.getSecret(secretName, { version: secretVersion });
  const hexKey = secret.value;
  if (!hexKey || hexKey.length !== DEK_HEX_LENGTH) {
    throw new Error(`keyvault-cipher: DEK at ${dekUri} is invalid (expected ${DEK_HEX_LENGTH} hex chars)`);
  }
  return Buffer.from(hexKey, "hex");
}
