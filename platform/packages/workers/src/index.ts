/**
 * @kavachiq/workers — Service Bus consumers + entry points.
 *
 * v1 surface:
 *   - createPipelineWorker — Service Bus session-keyed consumer for
 *     `process-events`; runs the @kavachiq/orchestration pipeline driver.
 *   - createPollingWorker — Service Bus session-keyed consumer for
 *     `poll-tenant`; calls pollTenantBatch per message.
 *   - startHealthServer — N9 liveness/readiness for Container Apps probes.
 *   - runPipelineWorker — convenience entrypoint for `tsx` / Container Apps
 *     image. Wires SIGTERM → graceful shutdown.
 *   - runPollingWorker — same pattern for the polling-worker image.
 *
 * Future:
 *   - notification-worker (consumes notify-operator queue, fans out to
 *     Slack/email)
 */

export {
  createPipelineWorker,
  type PipelineWorker,
  type PipelineWorkerOptions,
} from "./pipeline-worker.js";

export {
  createPollingWorker,
  type PollingWorker,
  type PollingWorkerOptions,
  type PollTenantMessage,
} from "./polling-worker.js";

export {
  startHealthServer,
  type HealthServer,
  type HealthState,
} from "./health.js";

export { runPipelineWorker } from "./run-pipeline-worker.js";
export { runPollingWorker } from "./run-polling-worker.js";
