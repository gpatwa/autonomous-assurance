/**
 * Deployed-polling smoke test.
 *
 * Verifies the full cloud path from a `poll-tenant` Service Bus message through
 * both deployed Container Apps to an Incident row in Postgres:
 *
 *   1. Seed a platform tenant pointing at patwainc.onmicrosoft.com
 *   2. Enqueue a `poll-tenant` message session-keyed by tenantId
 *   3. KEDA scales `ca-polling-worker-dev` from 0 → 1 (scale-from-zero)
 *   4. Polling-worker consumes the message → calls pollTenantBatch
 *      → fetches Graph audit events → archives to Blob → inserts raw_events
 *      → normalizes memberAdded events → enqueues `process-events`
 *   5. KEDA scales `ca-pipeline-worker-dev` (or it's already running)
 *   6. Pipeline-worker processes → correlates → detects → writes Incident
 *
 * Checks:
 *   - raw_events > 0 in Postgres (polling-worker ran)
 *   - polling_state cursor advanced (polling-worker completed cleanly)
 *   - incidents > 0 in Postgres (pipeline-worker ran; memberAdded events present)
 *
 * Required env (same as smoke-polling + DATABASE_URL):
 *   SERVICE_BUS_CONNECTION_STRING
 *   STORAGE_CONNECTION_STRING  — Blob archive writes from inside the cluster
 *                                 only need this for teardown peek; omit OK
 *   SP_READ_TENANT_ID, SP_READ_CLIENT_ID, SP_READ_CLIENT_SECRET
 *     — patwainc test-tenant credentials (from platform/.env.local)
 *
 * Usage:
 *   npx tsx scripts/smoke-deployed-polling.ts
 */

import { randomUUID } from "node:crypto";
import { ServiceBusClient } from "@azure/service-bus";
import type { PollTenantMessage } from "@kavachiq/workers";
import {
  closePool,
  getPollingState,
  seedTenantCredentials,
  withAdminContext,
  withTenantContext,
} from "@kavachiq/storage";

// ─── Config ─────────────────────────────────────────────────────────────

const SB_CONN = required("SERVICE_BUS_CONNECTION_STRING");
required("DATABASE_URL");
required("SP_READ_TENANT_ID");
required("SP_READ_CLIENT_ID");
required("SP_READ_CLIENT_SECRET");

const TENANT_ID = randomUUID();
const MS_TENANT_ID = process.env.SP_READ_TENANT_ID!;
const CLIENT_ID = process.env.SP_READ_CLIENT_ID!;
const CLIENT_SECRET = process.env.SP_READ_CLIENT_SECRET!;

// Scale-from-zero + poll + pipeline latency. 150s covers:
//   KEDA detection (~30s), container start (~15s), pollTenantBatch (~15s),
//   KEDA scale pipeline-worker (~30s), pipeline-worker processing (~15s).
const POLL_TIMEOUT_MS = 150_000;
const POLL_INTERVAL_MS = 3_000;

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

async function seed(): Promise<void> {
  await withAdminContext(async (client) => {
    await client.query(
      `INSERT INTO tenants (tenant_id, microsoft_tenant_id, display_name, status, consented_at, consent_admin_email)
       VALUES ($1, $2, 'Smoke deployed-polling tenant (patwainc)', 'active', now(), 'smoke-dp@example.com')`,
      [TENANT_ID, MS_TENANT_ID],
    );
    await client.query(
      `INSERT INTO sensitivity_lists (tenant_id, list_type, object_id, display_name)
       VALUES ($1, 'high-sensitivity-group', '45a4b187-c7c6-422a-b82b-48e199f63bb3', 'Finance-Privileged-Access'),
              ($1, 'agent-identified-sp',   'bf131def-02b5-4e90-8f32-ec4b3abf96db', 'test-agent')`,
      [TENANT_ID],
    );
  });
  await withTenantContext(TENANT_ID, async (client) => {
    await seedTenantCredentials(client, {
      microsoftTenantId: MS_TENANT_ID,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      consentedScopes: ["AuditLog.Read.All", "Directory.Read.All"],
    });
  });
}

async function teardown(): Promise<void> {
  // Delete tenant — FK cascades clear raw_events, incidents, outbox, etc.
  await withAdminContext(async (client) => {
    await client.query("DELETE FROM tenants WHERE tenant_id = $1", [TENANT_ID]);
  });
  // Drain any leftover poll-tenant / process-events session messages.
  const sb = new ServiceBusClient(SB_CONN);
  try {
    for (const queue of ["poll-tenant", "process-events"]) {
      try {
        const recv = await sb.acceptSession(queue, TENANT_ID, { maxAutoLockRenewalDurationInMs: 5000 });
        try {
          const msgs = await recv.receiveMessages(50, { maxWaitTimeInMs: 2000 });
          for (const m of msgs) await recv.completeMessage(m);
        } finally {
          await recv.close();
        }
      } catch {
        /* no session — fine */
      }
    }
  } finally {
    await sb.close();
  }
  await closePool();
}

async function pollUntil<T>(
  label: string,
  fn: () => Promise<T | null>,
): Promise<T> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null) return result;
    const remaining = Math.round((deadline - Date.now()) / 1000);
    process.stdout.write(`\r    ⏳ ${label} — ${remaining}s remaining   `);
    await sleep(POLL_INTERVAL_MS);
  }
  process.stdout.write("\n");
  throw new Error(`timed out after ${POLL_TIMEOUT_MS / 1000}s waiting for: ${label}`);
}

async function main() {
  console.log("\n🔍 deployed-polling smoke test\n");
  console.log(`  Platform tenant ID:  ${TENANT_ID}`);
  console.log(`  Microsoft tenant ID: ${MS_TENANT_ID}`);
  console.log(`  polling-worker:      ca-polling-worker-dev`);
  console.log(`  pipeline-worker:     ca-pipeline-worker-dev`);
  console.log(`  Test deadline:       ${POLL_TIMEOUT_MS / 1000}s\n`);

  await seed();

  try {
    await check("Enqueue poll-tenant message session-keyed by tenantId", async () => {
      const sb = new ServiceBusClient(SB_CONN);
      const sender = sb.createSender("poll-tenant");
      try {
        const body: PollTenantMessage = {
          schemaVersion: 1,
          tenantId: TENANT_ID,
          // Look back 30 days to capture the WI-05 events from April 2026.
          initialLookbackHours: 24 * 30,
        };
        await sender.sendMessages({
          body,
          contentType: "application/json",
          sessionId: TENANT_ID,
        });
      } finally {
        await sender.close();
        await sb.close();
      }
    });

    let rawEventCount = 0;
    await check(
      `Deployed polling-worker processes poll-tenant → raw_events in Postgres within ${POLL_TIMEOUT_MS / 1000}s`,
      async () => {
        const count = await pollUntil("raw_events > 0", async () => {
          const c = await withTenantContext(TENANT_ID, async (client) => {
            const r = await client.query<{ c: string }>(
              "SELECT count(*)::text AS c FROM raw_events",
            );
            return parseInt(r.rows[0]!.c, 10);
          });
          return c > 0 ? c : null;
        });
        rawEventCount = count;
        console.log(`\n    (fetched ${rawEventCount} raw events from Graph)`);
      },
    );

    await check("polling_state cursor advanced (poll completed cleanly)", async () => {
      const state = await withTenantContext(TENANT_ID, getPollingState);
      if (!state) throw new Error("polling_state row not written");
      if (!state.lastEventObservedAt) throw new Error("last_event_observed_at not set");
      if (!state.lastPollCompletedAt) throw new Error("last_poll_completed_at not set");
      if (state.consecutiveFailures !== 0) {
        throw new Error(`consecutive_failures=${state.consecutiveFailures}, expected 0`);
      }
    });

    await check(
      `Deployed pipeline-worker processes normalized changes → Incident in Postgres within ${POLL_TIMEOUT_MS / 1000}s`,
      async () => {
        const count = await pollUntil("incidents > 0", async () => {
          const c = await withTenantContext(TENANT_ID, async (client) => {
            const r = await client.query<{ c: string }>(
              "SELECT count(*)::text AS c FROM incidents",
            );
            return parseInt(r.rows[0]!.c, 10);
          });
          return c > 0 ? c : null;
        });
        console.log(`\n    (found ${count} incident(s))`);
      },
    );

    await check("Incident has expected fields (high severity, score 95, status new)", async () => {
      const row = await withTenantContext(TENANT_ID, async (client) => {
        const r = await client.query<{
          severity: string;
          classification_score: number;
          status: string;
        }>("SELECT severity, classification_score, status FROM incidents LIMIT 1");
        return r.rows[0]!;
      });
      if (row.severity !== "high") throw new Error(`severity=${row.severity}`);
      if (row.classification_score !== 95) throw new Error(`score=${row.classification_score}`);
      if (row.status !== "new") throw new Error(`status=${row.status}`);
    });

    await check("Outbox row written + published (drainer ran inside the cluster)", async () => {
      const row = await withTenantContext(TENANT_ID, async (client) => {
        const r = await client.query<{ event_type: string; published_at: string | null }>(
          "SELECT event_type, published_at::text FROM outbox WHERE event_type = 'incident-created'",
        );
        return r.rows[0];
      });
      if (!row) throw new Error("no outbox row for incident-created");
      if (!row.published_at) throw new Error("outbox row not marked published");
    });
  } finally {
    await teardown();
  }

  console.log(`\n  ${failed === 0 ? "✅ PASS" : `❌ FAIL (${failed} of ${passed + failed})`}\n`);
  if (failed > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke-deployed-polling crashed:", err);
  process.exit(2);
});
