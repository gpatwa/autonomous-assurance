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
 * N3: outbox publisher (in @kavachiq/orchestration) reads pending rows
 *     via fetchPendingOutbox() under withAdminContext, emits, marks
 *     markOutboxPublished. Survives every component-level failure.
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
  listIncidents,
  type InsertIncidentResult,
  type ListIncidentsOpts,
  type ListIncidentsResult,
} from "./incidents.js";

export {
  enqueueOutboxEvent,
  fetchPendingOutbox,
  markOutboxFailure,
  markOutboxPublished,
  type EnqueueOutboxArgs,
  type EnqueueOutboxResult,
  type OutboxEventType,
  type PendingOutboxRow,
} from "./outbox.js";

export {
  insertCorrelatedChangeBundle,
  type InsertBundleResult,
} from "./bundles.js";

export {
  insertNormalizedChange,
  listNormalizedChanges,
  type InsertChangeResult,
  type ListChangesOpts,
  type ListChangesResult,
} from "./normalized-changes.js";

export {
  insertRawEvent,
  type InsertRawEventArgs,
  type InsertRawEventResult,
} from "./raw-events.js";

// Secretless design (Week 5 Day 3): no per-tenant credentials stored.
// KavachIQ uses platform-level Entra app credentials (env vars) + the
// customer's microsoft_tenant_id obtained at admin consent time.
export {
  loadTenantMicrosoftId,
  insertOnboardedTenant,
  type TenantMicrosoftId,
  type InsertOnboardedTenantArgs,
} from "./tenants.js";

// Key Vault envelope cipher — generic utility for platform-level secret
// encryption (e.g. future key rotation). No longer used for per-tenant creds.
export { provisionTenantDek, encryptWithDek, decryptWithDek } from "./keyvault-cipher.js";

export {
  getPollingState,
  recordPollStarted,
  recordPollSuccess,
  recordPollFailure,
  type PollingState,
  type PollingStartArgs,
  type PollingSuccessArgs,
  type PollingFailureArgs,
} from "./polling-state.js";

export {
  insertPendingOnboarding,
  redeemPendingOnboarding,
  type InsertPendingOnboardingArgs,
  type PendingOnboardingRow,
} from "./pending-onboarding.js";

export {
  archiveRawEvents,
  getBlobService,
  getRawEventsContainer,
  getBaselinesContainer,
  type ArchiveRawEventsArgs,
  type ArchiveRawEventsResult,
} from "./blob.js";
