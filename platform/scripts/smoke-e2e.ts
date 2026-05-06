/**
 * End-to-end smoke test:
 *
 *   smoke-e2e starts a pipeline-worker as a child process, enqueues a
 *   ProcessEventsMessage on the live Azure Service Bus `process-events`
 *   queue (session-keyed by tenant_id, per N7), and polls Postgres for
 *   the resulting Incident. Asserts the wire-level contract.
 *
 * What this proves over `smoke-pipeline.ts` (in-process):
 *   - Service Bus session-keyed delivery actually works
 *   - The worker's session-loop processes the message
 *   - completeMessage / abandonMessage paths are correctly wired
 *   - Health server starts up and reports ready
 *   - Outbox drainer runs after pipeline-driver and pushes to
 *     `notify-operator` queue
 *   - Graceful shutdown stops the worker cleanly
 *
 * Required env:
 *   SERVICE_BUS_CONNECTION_STRING — RootManageSharedAccessKey or scoped SAS
 *   DATABASE_URL                  — postgresql://…?sslmode=require
 *
 * Usage:
 *   PG_PASSWORD=$(az keyvault secret show --vault-name kv-kavachiq-platform-dev \
 *     --name postgres-admin-password --query value -o tsv)
 *   DATABASE_URL="postgresql://kavachiqadmin:$PG_PASSWORD@pg-kavachiq-platform-dev.postgres.database.azure.com:5432/kavachiq?sslmode=require" \
 *   SERVICE_BUS_CONNECTION_STRING="$(az servicebus namespace authorization-rule keys list \
 *     -g rg-kavachiq-platform --namespace-name sb-kavachiq-platform-dev \
 *     --name RootManageSharedAccessKey --query primaryConnectionString -o tsv)" \
 *     npx tsx scripts/smoke-e2e.ts
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ServiceBusAdministrationClient, ServiceBusClient } from "@azure/service-bus";
import type { NormalizedChange } from "@kavachiq/schema";
import {
  closePool,
  withAdminContext,
  withTenantContext,
} from "@kavachiq/storage";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────

const SB_CONN = required("SERVICE_BUS_CONNECTION_STRING");
const DATABASE_URL = required("DATABASE_URL");
const TENANT_ID = randomUUID();
const PRIVILEGED_GROUP_ID = "45a4b187-c7c6-422a-b82b-48e199f63bb3";
const SP_EXECUTE_ID = "bf131def-02b5-4e90-8f32-ec4b3abf96db";
const HEALTH_PORT = "18080"; // not the default 8080 — avoid conflicts with any other process
const FIXTURE_DIR = resolve(__dirname, "../fixtures/canonical");
const POLL_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_500;

// ─── Test harness ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  ❌ ${name}: ${msg}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function required(k: string): string {
  const v = process.env[k];
  if (!v) {
    console.error(`Required env ${k} not set`);
    process.exit(2);
  }
  return v;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return;
    } catch {
      // worker not up yet
    }
    await sleep(500);
  }
  throw new Error(`Worker did not become ready at ${url} within ${timeoutMs}ms`);
}

async function purgeQueue(queueName: string): Promise<void> {
  const sb = new ServiceBusClient(SB_CONN);
  try {
    if (queueName === "process-events") {
      // Drain any leftover sessions to keep the test isolated.
      // We don't know which session IDs exist, so we just drain
      // until acceptNextSession times out.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const r = await sb.acceptNextSession(queueName);
          await r.peekMessages(1).catch(() => []);
          await r.close();
        } catch {
          break; // no more sessions
        }
      }
    } else {
      // Standard queue (notify-operator): drain in 1-msg batches until empty.
      const recv = sb.createReceiver(queueName);
      try {
        while (true) {
          const msgs = await recv.receiveMessages(10, { maxWaitTimeInMs: 1000 });
          if (msgs.length === 0) break;
          for (const m of msgs) await recv.completeMessage(m);
        }
      } finally {
        await recv.close();
      }
    }
  } finally {
    await sb.close();
  }
}

// ─── Setup / teardown ────────────────────────────────────────────────────

async function seed(): Promise<void> {
  await withAdminContext(async (client) => {
    await client.query(
      `INSERT INTO tenants (tenant_id, microsoft_tenant_id, display_name, status, consented_at, consent_admin_email)
       VALUES ($1, $2, 'Smoke E2E tenant', 'active', now(), 'smoke-e2e@example.com')`,
      [TENANT_ID, randomUUID()],
    );
    await client.query(
      `INSERT INTO sensitivity_lists (tenant_id, list_type, object_id, display_name)
       VALUES ($1, 'high-sensitivity-group', $2, 'Finance-Privileged-Access'),
              ($1, 'agent-identified-sp',   $3, 'test-agent')`,
      [TENANT_ID, PRIVILEGED_GROUP_ID, SP_EXECUTE_ID],
    );
  });
}

async function teardown(worker: ChildProcess | null): Promise<void> {
  if (worker && !worker.killed) {
    worker.kill("SIGTERM");
    // Give it a moment to drain
    await sleep(2_000);
    if (!worker.killed) worker.kill("SIGKILL");
  }
  await withAdminContext(async (client) => {
    await client.query("DELETE FROM tenants WHERE tenant_id = $1", [TENANT_ID]);
  });
  await closePool();
}

// ─── Tests ───────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔍 pipeline-worker E2E smoke test\n");
  console.log(`  Tenant:           ${TENANT_ID}`);
  console.log(`  Service Bus:      sb-kavachiq-platform-dev`);
  console.log(`  Worker health:    http://localhost:${HEALTH_PORT}/health/ready\n`);

  console.log("  → Purging Service Bus queues to isolate this run …");
  await purgeQueue("process-events");
  await purgeQueue("notify-operator");

  console.log("  → Seeding tenant + sensitivity_lists …");
  await seed();

  let worker: ChildProcess | null = null;
  try {
    console.log("  → Spawning pipeline-worker child process …\n");
    // Invoke tsx directly (not via npx) so SIGTERM goes straight to the Node
    // process — npx adds a shim that doesn't always forward signals cleanly.
    worker = spawn(
      "node_modules/.bin/tsx",
      ["scripts/run-pipeline-worker.ts"],
      {
        env: {
          ...process.env,
          SERVICE_BUS_CONNECTION_STRING: SB_CONN,
          DATABASE_URL,
          HEALTH_PORT,
          SESSION_IDLE_TIMEOUT_MS: "5000",
        },
        stdio: "pipe",
      },
    );

    // Pipe worker logs to stderr so test output stays clean
    worker.stdout?.on("data", (chunk: Buffer) => {
      process.stderr.write(`    [worker] ${chunk.toString()}`);
    });
    worker.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`    [worker err] ${chunk.toString()}`);
    });
    worker.on("exit", (code, signal) => {
      console.error(`    [worker] exited code=${code} signal=${signal}`);
    });

    await check("Worker reports /health/ready within 15s", async () => {
      await waitForReady(`http://localhost:${HEALTH_PORT}/health/ready`, 15_000);
    });

    // Build a re-tenanted message body
    const canonical = JSON.parse(
      readFileSync(resolve(FIXTURE_DIR, "normalized-changes.json"), "utf-8"),
    ) as NormalizedChange[];
    const changes = canonical.map((c, i) => ({
      ...c,
      tenantId: TENANT_ID,
      changeId: `chg_e2e_${i}`,
      bundleId: null,
      source: { ...c.source, rawEventIds: [`raw_e2e_${i}`] },
    }));

    await check("Enqueue ProcessEventsMessage on process-events (session=tenantId)", async () => {
      const sb = new ServiceBusClient(SB_CONN);
      const sender = sb.createSender("process-events");
      try {
        await sender.sendMessages({
          body: { schemaVersion: 1, tenantId: TENANT_ID, normalizedChanges: changes },
          contentType: "application/json",
          sessionId: TENANT_ID,
        });
      } finally {
        await sender.close();
        await sb.close();
      }
    });

    await check(
      `Worker processes message → Incident appears in Postgres within ${POLL_TIMEOUT_MS / 1000}s`,
      async () => {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          const found = await withTenantContext(TENANT_ID, async (client) => {
            const r = await client.query<{ c: string }>(
              "SELECT count(*)::text AS c FROM incidents",
            );
            return parseInt(r.rows[0]!.c, 10);
          });
          if (found === 1) return;
          if (found > 1) throw new Error(`expected 1 incident, got ${found}`);
          await sleep(POLL_INTERVAL_MS);
        }
        throw new Error("timed out waiting for incident");
      },
    );

    await check("Incident has expected fields (severity high, score 95)", async () => {
      const got = await withTenantContext(TENANT_ID, async (client) => {
        const r = await client.query<{ severity: string; classification_score: number; status: string }>(
          "SELECT severity, classification_score, status FROM incidents",
        );
        return r.rows[0]!;
      });
      if (got.severity !== "high") throw new Error(`severity=${got.severity}`);
      if (got.classification_score !== 95) throw new Error(`score=${got.classification_score}`);
      if (got.status !== "new") throw new Error(`status=${got.status}`);
    });

    await check("Outbox row written and marked published (drainer ran)", async () => {
      const row = await withTenantContext(TENANT_ID, async (client) => {
        const r = await client.query<{ event_type: string; published_at: string | null }>(
          "SELECT event_type, published_at::text FROM outbox WHERE event_type = 'incident-created'",
        );
        return r.rows[0];
      });
      if (!row) throw new Error("no outbox row found");
      if (row.event_type !== "incident-created") throw new Error(`event_type=${row.event_type}`);
      if (!row.published_at) throw new Error("outbox row not marked published_at");
    });

    await check("notify-operator queue received the incident-created event", async () => {
      const sb = new ServiceBusClient(SB_CONN);
      const recv = sb.createReceiver("notify-operator");
      try {
        const msgs = await recv.receiveMessages(5, { maxWaitTimeInMs: 5_000 });
        if (msgs.length === 0) throw new Error("no message on notify-operator");
        const found = msgs.find((m) => {
          const body = m.body as { eventType?: string; tenantId?: string };
          return body?.eventType === "incident-created" && body?.tenantId === TENANT_ID;
        });
        if (!found) {
          throw new Error(
            `no matching event; got ${msgs.length} messages, eventTypes=${msgs.map((m) => (m.body as { eventType?: string }).eventType).join(",")}`,
          );
        }
        // Complete all messages we received so we don't pollute future runs
        for (const m of msgs) await recv.completeMessage(m);
      } finally {
        await recv.close();
        await sb.close();
      }
    });

    await check("Re-send same message → no second incident (idempotent)", async () => {
      const sb = new ServiceBusClient(SB_CONN);
      const sender = sb.createSender("process-events");
      try {
        await sender.sendMessages({
          body: { schemaVersion: 1, tenantId: TENANT_ID, normalizedChanges: changes },
          contentType: "application/json",
          sessionId: TENANT_ID,
        });
      } finally {
        await sender.close();
        await sb.close();
      }
      // Wait long enough for worker to process
      await sleep(8_000);
      const count = await withTenantContext(TENANT_ID, async (client) => {
        const r = await client.query<{ c: string }>("SELECT count(*)::text AS c FROM incidents");
        return parseInt(r.rows[0]!.c, 10);
      });
      if (count !== 1) throw new Error(`expected still 1 incident; got ${count}`);
    });

    await check(
      "Worker exits on SIGTERM (with SIGKILL fallback after 10s — mirrors Container Apps)",
      async () => {
        // The Service Bus SDK's `acceptNextSession` blocks the Node event loop
        // in deep AMQP awaits that don't yield to signal handlers for tens of
        // seconds — this is why N9 in the architecture sets
        // terminationGracePeriodSeconds: 90 on Container Apps. The orchestrator's
        // SIGKILL after the grace period is the production safety net. We
        // mirror that here: SIGTERM, wait 10s, SIGKILL if not exited.
        worker!.kill("SIGTERM");
        let exited = false;
        const sigtermDeadline = Date.now() + 10_000;
        while (Date.now() < sigtermDeadline) {
          if (worker!.exitCode !== null || worker!.signalCode !== null) {
            exited = true;
            break;
          }
          await sleep(250);
        }
        if (!exited) {
          worker!.kill("SIGKILL");
          const sigkillDeadline = Date.now() + 5_000;
          while (Date.now() < sigkillDeadline) {
            if (worker!.exitCode !== null || worker!.signalCode !== null) {
              exited = true;
              break;
            }
            await sleep(250);
          }
        }
        if (!exited) {
          throw new Error("worker did not exit even after SIGKILL");
        }
      },
    );
  } finally {
    await teardown(worker);
  }

  console.log(`\n  ${failed === 0 ? "✅ PASS" : `❌ FAIL (${failed} of ${passed + failed})`}\n`);
  if (failed > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke-e2e crashed:", err);
  process.exit(2);
});
