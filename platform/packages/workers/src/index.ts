/**
 * @kavachiq/workers — Service Bus consumers + entry points.
 *
 * v1 surface:
 *   - createPipelineWorker — Service Bus session-keyed consumer for
 *     `process-events`; runs the @kavachiq/orchestration pipeline driver.
 *   - startHealthServer — N9 liveness/readiness for Container Apps probes.
 *   - runPipelineWorker — convenience entrypoint for `tsx` / Container Apps
 *     image. Wires SIGTERM → graceful shutdown.
 *
 * Future:
 *   - polling-worker (Phase 2 — Microsoft Graph audit polling)
 *   - notification-worker (consumes notify-operator queue, fans out to
 *     Slack/email)
 */

export {
  createPipelineWorker,
  type PipelineWorker,
  type PipelineWorkerOptions,
} from "./pipeline-worker.js";

export {
  startHealthServer,
  type HealthServer,
  type HealthState,
} from "./health.js";

export { runPipelineWorker } from "./run-pipeline-worker.js";
