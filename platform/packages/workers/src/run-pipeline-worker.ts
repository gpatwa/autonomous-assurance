/**
 * Pipeline-worker entrypoint — wires SIGTERM, health server, and worker loop.
 *
 * Usage in Container Apps Dockerfile:
 *   ENTRYPOINT ["node", "dist/run-pipeline-worker.js"]
 *
 * Usage for local dev / smoke tests:
 *   tsx packages/workers/src/run-pipeline-worker.ts
 *
 * Required env:
 *   SERVICE_BUS_CONNECTION_STRING — full SAS connection string
 *   DATABASE_URL                  — Postgres URL with sslmode
 *
 * Optional env:
 *   HEALTH_PORT                   — default 8080
 *   SESSION_IDLE_TIMEOUT_MS       — default 30000
 *   OUTBOX_BATCH_SIZE             — default 50
 */

import { initTelemetry, rootLogger } from "@kavachiq/platform";
initTelemetry("pipeline-worker");

import { closePool } from "@kavachiq/storage";
import { createPipelineWorker } from "./pipeline-worker.js";
import { startHealthServer } from "./health.js";

export async function runPipelineWorker(): Promise<void> {
  const log = rootLogger.child({ worker: "pipeline-worker" });

  const sbConn = process.env.SERVICE_BUS_CONNECTION_STRING;
  if (!sbConn) {
    log.error("run-pipeline-worker: SERVICE_BUS_CONNECTION_STRING not set");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    log.error("run-pipeline-worker: DATABASE_URL not set");
    process.exit(2);
  }

  const health = startHealthServer({ ready: false, reason: "starting" });

  const worker = createPipelineWorker({
    serviceBusConnectionString: sbConn,
    sessionIdleTimeoutMs: numEnv("SESSION_IDLE_TIMEOUT_MS", 30_000),
    outboxBatchSize: numEnv("OUTBOX_BATCH_SIZE", 50),
    logger: log,
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("run-pipeline-worker: shutdown signal received; exiting", { signal });
    health.setReady(false, "shutting-down");
    // The Service Bus SDK's `acceptNextSession` blocks the Node event loop
    // in deep AMQP awaits that don't yield to signal handlers for 30+ seconds.
    // Trying to await a graceful drain hangs the process past the orchestrator's
    // grace period anyway. Better: exit immediately on SIGTERM. Service Bus
    // redelivers any in-flight message after the lock expires; N2 idempotency
    // makes redelivery a safe no-op.
    //
    // We give the runtime ~250ms to flush logs + the health server's
    // current connection, then exit hard. Container Apps is fine with this
    // — clean exit code 0, no SIGKILL needed.
    setTimeout(() => {
      void closePool().finally(() => {
        void health.close().finally(() => process.exit(0));
      });
    }, 250);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Mark ready before entering the consume loop so health probes pass.
  health.setReady(true);
  log.info("run-pipeline-worker: ready");

  try {
    await worker.run();
  } catch (err) {
    log.error("run-pipeline-worker: crashed", { err: String(err) });
    health.setReady(false, "crashed");
    await closePool().catch(() => undefined);
    await health.close().catch(() => undefined);
    process.exit(1);
  }
  // worker.run() returns after stop()
  await closePool().catch(() => undefined);
  await health.close();
  process.exit(0);
}

function numEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

// Auto-start removed — call `runPipelineWorker()` explicitly from a wrapper
// script. Compat with both CommonJS and ESM emit; no `import.meta`/`require.main`
// branching needed. See `platform/scripts/run-pipeline-worker.ts`.
