/**
 * @kavachiq/orchestration — per-tenant pipeline driver.
 *
 * Strangler Fig (D8): wraps the existing pure-function pipeline in
 * `@kavachiq/core` (normalize → correlate → detect) with multi-tenant
 * orchestration. The core stays unchanged.
 */

export {
  processEventsMessage,
  type ProcessEventsMessage,
  type ProcessEventsResult,
} from "./pipeline-driver.js";

export {
  loadTenantPolicy,
  type TenantPolicyContext,
} from "./tenant-context-loader.js";

export {
  drainOutboxBatch,
  type DrainOutboxOptions,
  type DrainOutboxResult,
} from "./outbox-drainer.js";

export {
  deterministicBundleId,
  deterministicIncidentId,
} from "./ids.js";

export {
  pollTenantBatch,
  type PollTenantBatchOptions,
  type PollTenantBatchResult,
} from "./polling-driver.js";

export {
  createGraphCredential,
  fetchAuditEvents,
  GraphAuthError,
  GraphThrottleError,
  type AuditEvent,
  type FetchAuditEventsArgs,
  type FetchAuditEventsResult,
} from "./graph-client.js";
