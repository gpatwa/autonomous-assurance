/**
 * Polling-worker entrypoint — wires SIGTERM, health server, and worker loop.
 *
 * Usage in Container Apps Dockerfile:
 *   CMD ["node", "-e", "require('@kavachiq/workers').runPollingWorker()"]
 *
 * Required env:
 *   SERVICE_BUS_CONNECTION_STRING — full SAS connection string (consumes
 *     poll-tenant; also forwarded to pollTenantBatch to enqueue process-events)
 *   DATABASE_URL                  — Postgres URL with sslmode
 *
 * Optional env:
 *   HEALTH_PORT                   — default 8080
 *   SESSION_IDLE_TIMEOUT_MS       — default 30000
 *   POLL_PAGE_SIZE                — Graph page size, default 250
 */

import { initTelemetry, rootLogger } from "@kavachiq/platform";
initTelemetry("polling-worker");

import { closePool } from "@kavachiq/storage";
import { createPollingWorker } from "./polling-worker.js";
import { createScheduler } from "./scheduler.js";
import { startHealthServer } from "./health.js";

export async function runPollingWorker(): Promise<void> {
  const log = rootLogger.child({ worker: "polling-worker" });

  const sbConn = process.env.SERVICE_BUS_CONNECTION_STRING;
  if (!sbConn) {
    log.error("run-polling-worker: SERVICE_BUS_CONNECTION_STRING not set");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    log.error("run-polling-worker: DATABASE_URL not set");
    process.exit(2);
  }

  const health = startHealthServer({ ready: false, reason: "starting" });

  const worker = createPollingWorker({
    serviceBusConnectionString: sbConn,
    sessionIdleTimeoutMs: numEnv("SESSION_IDLE_TIMEOUT_MS", 30_000),
    pageSize: numEnv("POLL_PAGE_SIZE", 250),
    logger: log,
  });

  const scheduler = createScheduler({
    serviceBusConnectionString: sbConn,
    intervalMs: numEnv("POLL_INTERVAL_MS", 15 * 60 * 1000),
    logger: log,
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("run-polling-worker: shutdown signal received; exiting", { signal });
    health.setReady(false, "shutting-down");
    scheduler.stop();
    setTimeout(() => {
      void closePool().finally(() => {
        void health.close().finally(() => process.exit(0));
      });
    }, 250);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  scheduler.start();
  health.setReady(true);
  log.info("run-polling-worker: ready");

  try {
    await worker.run();
  } catch (err) {
    log.error("run-polling-worker: crashed", { err: String(err) });
    health.setReady(false, "crashed");
    await closePool().catch(() => undefined);
    await health.close().catch(() => undefined);
    process.exit(1);
  }
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
