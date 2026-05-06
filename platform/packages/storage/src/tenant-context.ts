/**
 * Tenant-context middleware for Postgres connections.
 *
 * D2 enforcement: every application query runs against a connection where
 * `app.tenant_id` is set. RLS policies on every multi-tenant table compare
 * row-level `tenant_id` against `current_setting('app.tenant_id')`. A
 * connection acquired without setting `app.tenant_id` returns zero rows
 * for SELECTs and rejects INSERTs with a tenant_id check — so missing
 * context fails closed, never leaks across tenants.
 *
 * `withTenantContext(tenantId, fn)` is the only supported way for
 * application code to obtain a connection. Direct `pool.connect()` is
 * reserved for migrations and the BYPASSRLS admin role.
 *
 * Implementation:
 *   1. Acquire a client from the pool.
 *   2. SET LOCAL ROLE kavachiq_app + SET LOCAL app.tenant_id inside a
 *      transaction so the setting is automatically reset on COMMIT/ROLLBACK
 *      and cannot leak to a subsequent caller via the connection pool's
 *      lease cycle.
 *   3. Run fn(client) inside the transaction.
 *   4. COMMIT on success, ROLLBACK on throw.
 *   5. Release the connection.
 *
 * Idempotency: `fn` is responsible for using `INSERT … ON CONFLICT DO NOTHING`
 * patterns (N1 + N2). This middleware does not retry failed transactions —
 * Service Bus redelivers on nack, and the database UNIQUE constraints make
 * retries safe.
 */

import type { PoolClient } from "pg";
import { getPool } from "./pool.js";

export type TenantId = string; // uuid

/**
 * Run `fn` against a tenant-scoped connection. Setup + commit/rollback +
 * release happen automatically. Throwing from `fn` triggers ROLLBACK.
 *
 * Important: `app.tenant_id` is set as a transaction-local setting (`SET LOCAL`).
 * It is automatically cleared at COMMIT/ROLLBACK so the setting cannot
 * outlive the transaction or leak when the client is returned to the pool.
 */
export async function withTenantContext<T>(
  tenantId: TenantId,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!isValidUuid(tenantId)) {
    throw new TenantContextError(
      `withTenantContext: tenantId must be a valid uuid; got ${JSON.stringify(tenantId)}`,
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // SET LOCAL — bound to this transaction; cleared at COMMIT/ROLLBACK.
    // ROLE is the kavachiq_app role created in the migration; subject to RLS.
    await client.query("SET LOCAL ROLE kavachiq_app");
    // SET LOCAL app.tenant_id is the exact key RLS policies read.
    // pg parameterizes with $1; but SET LOCAL doesn't accept parameters,
    // so we use set_config() which does.
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failures; outer error wins
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run `fn` as the BYPASSRLS admin role. Use sparingly — for outbox publisher,
 * cross-tenant analytics queries, ops scripts. NEVER from request-scoped
 * code paths. Audit log entries that record cross-tenant access should be
 * written here (with operator identity in the row).
 */
export async function withAdminContext<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE kavachiq_admin");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}
