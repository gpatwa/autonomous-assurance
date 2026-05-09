/**
 * pending_onboarding — server-side state for the admin-consent flow.
 *
 * The OAuth `state` parameter carries only an opaque token. The real payload
 * (tenant_id, display_name) lives in this table with a 1-hour TTL.
 *
 * All functions run under withAdminContext (kavachiq_admin role, BYPASSRLS).
 */

import type { PoolClient } from "pg";

export interface InsertPendingOnboardingArgs {
  token: string;
  tenantId: string;
  displayName: string;
  /** Operator email from session — stored for audit only, never required. */
  initiatedBy?: string;
  /** Defaults to now() + 1 hour if omitted. */
  expiresAt?: Date;
}

export interface PendingOnboardingRow {
  tenantId: string;
  displayName: string;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Store a pending onboarding intent.
 * Also lazily purges expired rows so no background job is needed.
 */
export async function insertPendingOnboarding(
  client: PoolClient,
  args: InsertPendingOnboardingArgs,
): Promise<void> {
  const expiresAt = args.expiresAt ?? new Date(Date.now() + TTL_MS);

  // Lazy cleanup: evict expired rows on each insert. The expires_at index
  // makes this a cheap index scan; at low onboarding volume it's free.
  await client.query("DELETE FROM pending_onboarding WHERE expires_at < now()");

  await client.query(
    `INSERT INTO pending_onboarding
       (token, tenant_id, display_name, initiated_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [args.token, args.tenantId, args.displayName, args.initiatedBy ?? null, expiresAt],
  );
}

/**
 * Atomically consume a token and return its payload.
 *
 * Uses DELETE ... RETURNING so:
 *   - The row is gone after the first successful call (no replay).
 *   - Two concurrent requests for the same token: exactly one wins.
 *   - Expired tokens are rejected by the `expires_at > now()` predicate.
 *
 * Returns null if the token is unknown or expired.
 */
export async function redeemPendingOnboarding(
  client: PoolClient,
  token: string,
): Promise<PendingOnboardingRow | null> {
  const result = await client.query<{ tenant_id: string; display_name: string }>(
    `DELETE FROM pending_onboarding
     WHERE token = $1 AND expires_at > now()
     RETURNING tenant_id, display_name`,
    [token],
  );
  if (result.rows.length === 0) return null;
  return {
    tenantId: result.rows[0]!.tenant_id,
    displayName: result.rows[0]!.display_name,
  };
}
