/**
 * @kavachiq/storage — Postgres + Blob clients with multi-tenant isolation.
 *
 * D2: every Postgres query runs with `app.tenant_id` set; RLS enforces
 *     tenant isolation at the database layer. The `withTenantContext`
 *     helper is the only supported way for application code to obtain a
 *     connection. Direct `pool.connect()` is reserved for migrations and
 *     the BYPASSRLS admin role (`withAdminContext`).
 * D3: Postgres for state; Blob for raw event archive + large baselines
 *     (Blob client added in a follow-up).
 * N1 + N2: deterministic IDs + ON CONFLICT DO NOTHING patterns. Caller
 *     constructs IDs from immutable inputs (per @kavachiq/schema) and
 *     this layer never silently overrides; duplicates are no-ops.
 * N3: outbox publisher loop reads `outbox WHERE published_at IS NULL`
 *     and emits to Service Bus; lives in @kavachiq/orchestration.
 *
 * Migrations live under `migrations/000N_*.sql`. Apply via `psql -f` for
 * v1; a runner is forthcoming.
 */

export {
  buildPoolConfig,
  closePool,
  getPool,
  type PoolEnv,
} from "./pool.js";

export {
  TenantContextError,
  withAdminContext,
  withTenantContext,
  type TenantId,
} from "./tenant-context.js";

export {
  findIncidentById,
  insertIncident,
  type InsertIncidentResult,
} from "./incidents.js";

export {
  enqueueOutboxEvent,
  type EnqueueOutboxArgs,
  type EnqueueOutboxResult,
  type OutboxEventType,
} from "./outbox.js";
