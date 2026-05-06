/**
 * @kavachiq/orchestration — per-tenant pipeline driver.
 *
 * Strangler Fig (D8): wraps the existing pure-function pipeline in
 * `@kavachiq/core` (normalize → correlate → detect) with multi-tenant
 * orchestration. The core stays unchanged.
 *
 * What this module owns:
 *   - `loadTenantContext(tenant_id)` — fetch creds, baselines, sensitivity
 *     list, scoring policy from `@kavachiq/storage`.
 *   - Pipeline driver: dequeue Service Bus message → set `app.tenant_id` →
 *     run core pipeline → write Incident + outbox row in same TX (N3).
 *   - Outbox publisher loop.
 *   - Stateless batch correlator (N5).
 *
 * Entry points:
 *   - `runPipelineForMessage(msg)` — main worker handler
 *   - `publishOutbox()` — outbox draining loop
 *   - `correlateRecentChanges(tenant_id)` — batch correlator tick
 *
 * This module is a skeleton awaiting week 2 implementation per
 * docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md §6.
 */

export {};
