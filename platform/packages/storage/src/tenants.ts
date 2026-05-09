/**
 * Tenant read + write operations.
 *
 * Secretless design (Week 5 Day 3):
 *   - No client secrets stored per tenant.
 *   - KavachIQ is a multi-tenant Entra app; customer admins grant consent.
 *   - The polling worker reads only `microsoft_tenant_id` here and uses
 *     platform-level credentials (KAVACHIQ_APP_CLIENT_ID / _CLIENT_SECRET)
 *     to call Graph on behalf of any consenting tenant.
 *
 * `loadTenantMicrosoftId` — RLS-scoped; call inside withTenantContext.
 * `insertOnboardedTenant`  — admin write; call inside withAdminContext.
 */

import type { PoolClient } from "pg";

export interface TenantMicrosoftId {
  microsoftTenantId: string;
}

export interface InsertOnboardedTenantArgs {
  /** KavachIQ-internal tenant UUID (pre-generated before consent redirect). */
  tenantId: string;
  /** Customer's Microsoft Entra tenant ID (from admin consent callback). */
  microsoftTenantId: string;
  /** Human-readable name for the tenant. */
  displayName: string;
  /** ISO timestamp of consent. */
  consentedAt: string;
  /** Object ID of the admin who granted consent (may be null in v1). */
  adminObjectId?: string;
}

/**
 * Load the Microsoft tenant ID for the current RLS tenant context.
 * Call inside withTenantContext.
 */
export async function loadTenantMicrosoftId(
  client: PoolClient,
): Promise<TenantMicrosoftId> {
  const result = await client.query<{ microsoft_tenant_id: string }>(
    `SELECT microsoft_tenant_id::text
     FROM tenants
     WHERE tenant_id = current_setting('app.tenant_id')::uuid`,
  );
  if (result.rows.length === 0) {
    throw new Error("loadTenantMicrosoftId: tenant not found");
  }
  return { microsoftTenantId: result.rows[0]!.microsoft_tenant_id };
}

/**
 * Insert a newly onboarded tenant after admin consent.
 * Requires the kavachiq_admin role — call inside withAdminContext.
 *
 * Idempotent on (microsoft_tenant_id): if the admin re-grants consent,
 * the row is updated rather than duplicated.
 */
export async function insertOnboardedTenant(
  client: PoolClient,
  args: InsertOnboardedTenantArgs,
): Promise<void> {
  await client.query(
    `INSERT INTO tenants (
       tenant_id, microsoft_tenant_id, display_name, status,
       consented_at, consent_admin_object_id
     ) VALUES ($1, $2::uuid, $3, 'active', $4::timestamptz, $5::uuid)
     ON CONFLICT (microsoft_tenant_id) DO UPDATE SET
       display_name            = EXCLUDED.display_name,
       status                  = 'active',
       consented_at            = EXCLUDED.consented_at,
       consent_admin_object_id = EXCLUDED.consent_admin_object_id,
       updated_at              = now()`,
    [
      args.tenantId,
      args.microsoftTenantId,
      args.displayName,
      args.consentedAt,
      args.adminObjectId ?? null,
    ],
  );
}
