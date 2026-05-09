/**
 * Deployed-polling smoke test.
 *
 * Verifies both deployed workers end-to-end in two independent sub-flows:
 *
 * Sub-flow A — Polling path (real Graph poll):
 *   Enqueue poll-tenant → ca-polling-worker-dev polls patwainc Graph →
 *   raw_events in Postgres + Blob archive + polling_state cursor advanced.
 *   Does NOT assert on incidents — the live audit log may have no memberAdded
 *   events in the current window; that is correct behaviour, not a failure.
 *   (Live poll → Incident requires memberAdded events in the tenant's audit
 *   log; tested end-to-end when those events are present.)
 *
 * Sub-flow B — Pipeline path (synthetic process-events message):
 *   Directly enqueue a canonical NormalizedChange[] on process-events →
 *   ca-pipeline-worker-dev correlates → detects → writes Incident + outbox.
 *   This verifies the pipeline-worker is correctly deployed regardless of
 *   what the live audit log contains.
 *
 * Required env:
 *   SERVICE_BUS_CONNECTION_STRING
 *   DATABASE_URL
 *   SP_READ_TENANT_ID, SP_READ_CLIENT_ID, SP_READ_CLIENT_SECRET
 *     — patwainc test-tenant credentials (from platform/.env.local)
 *
 * Usage:
 *   npx tsx scripts/smoke-deployed-polling.ts
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ServiceBusClient } from "@azure/service-bus";
import type { NormalizedChange } from "@kavachiq/schema";
import type { PollTenantMessage } from "@kavachiq/workers";
import {
  closePool,
  getPollingState,
  withAdminContext,
  withTenantContext,
} from "@kavachiq/storage";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ─────────────────────────────────────────────────────────────
// Secretless: KAVACHIQ_APP_CLIENT_ID + _SECRET are platform-level credentials.
// SP_READ_TENANT_ID is the customer Microsoft tenant ID under test.

const SB_CONN = required("SERVICE_BUS_CONNECTION_STRING");
required("DATABASE_URL");
required("SP_READ_TENANT_ID");
required("KAVACHIQ_APP_CLIENT_ID");
required("KAVACHIQ_APP_CLIENT_SECRET");

const TENANT_ID = randomUUID();
const MS_TENANT_ID = process.env.SP_READ_TENANT_ID!;

// Both workers are always-on (minReplicas=1). Polling timeout covers the
// Graph fetch + Blob + DB insert. Pipeline timeout covers message delivery
// + correlate + detect + persist.
const POLL_TIMEOUT_MS = 90_000;
const PIPELINE_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 3_000;

const PRIVILEGED_GROUP_ID = "45a4b187-c7c6-422a-b82b-48e199f63bb3";
const SP_EXECUTE_ID = "bf131def-02b5-4e90-8f32-ec4b3abf96db";
const FIXTURE_DIR = resolve(__dirname, "../fixtures/canonical");

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
  if (!v) { console.error(`Required env ${k} not set`); process.exit(2); }
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
       VALUES ($1, 'high-sensitivity-group', $2, 'Finance-Privileged-Access'),
              ($1, 'agent-identified-sp',   $3, 'test-agent')`,
      [TENANT_ID, PRIVILEGED_GROUP_ID, SP_EXECUTE_ID],
    );
  });
  // Secretless: no per-tenant credentials to seed; Graph creds come from env.
}

async function teardown(): Promise<void> {
  await withAdminContext(async (client) => {
    await client.query("DELETE FROM tenants WHERE tenant_id = $1", [TENANT_ID]);
  });
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
      } catch { /* no session — fine */ }
    }
  } finally {
    await sb.close();
  }
  await closePool();
}

async function pollUntil<T>(label: string, timeoutMs: number, fn: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null) return result;
    const remaining = Math.round((deadline - Date.now()) / 1000);
    process.stdout.write(`\r    ⏳ ${label} — ${remaining}s remaining   `);
    await sleep(POLL_INTERVAL_MS);
  }
  process.stdout.write("\n");
  throw new Error(`timed out after ${timeoutMs / 1000}s waiting for: ${label}`);
}

async function main() {
  console.log("\n🔍 deployed-polling smoke test\n");
  console.log(`  Platform tenant ID:  ${TENANT_ID}`);
  console.log(`  Microsoft tenant ID: ${MS_TENANT_ID}`);
  console.log(`  polling-worker:      ca-polling-worker-dev`);
  console.log(`  pipeline-worker:     ca-pipeline-worker-dev\n`);

  await seed();

  try {
    // ── Sub-flow A: Polling path ─────────────────────────────────────────
    console.log("  ── Sub-flow A: polling path (real Graph poll) ──\n");

    await check("Enqueue poll-tenant message session-keyed by tenantId", async () => {
      const sb = new ServiceBusClient(SB_CONN);
      const sender = sb.createSender("poll-tenant");
      try {
        const body: PollTenantMessage = {
          schemaVersion: 1,
          tenantId: TENANT_ID,
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
      `Polling-worker processes poll-tenant → raw_events in Postgres within ${POLL_TIMEOUT_MS / 1000}s`,
      async () => {
        const count = await pollUntil("raw_events > 0", POLL_TIMEOUT_MS, async () => {
          const c = await withTenantContext(TENANT_ID, async (client) => {
            const r = await client.query<{ c: string }>("SELECT count(*)::text AS c FROM raw_events");
            return parseInt(r.rows[0]!.c, 10);
          });
          return c > 0 ? c : null;
        });
        rawEventCount = count;
        console.log(`\n    (${rawEventCount} raw events fetched from Graph)`);
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

    // ── Sub-flow B: Pipeline path ────────────────────────────────────────
    // Verify the pipeline-worker independently of live audit log content.
    // The live audit log may have no memberAdded events today (all 21 events
    // in the test tenant are CA-policy and unmatched); that is correct behaviour.
    // We always verify the pipeline-worker with a canonical synthetic message.
    console.log("\n  ── Sub-flow B: pipeline path (canonical synthetic message) ──\n");

    await check("Enqueue canonical process-events message session-keyed by tenantId", async () => {
      const canonical = JSON.parse(
        readFileSync(resolve(FIXTURE_DIR, "normalized-changes.json"), "utf-8"),
      ) as NormalizedChange[];
      const changes = canonical.map((c, i) => ({
        ...c,
        tenantId: TENANT_ID,
        changeId: `chg_dp_${i}`,
        bundleId: null,
        source: { ...c.source, rawEventIds: [`raw_dp_${i}`] },
      }));
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
      `Pipeline-worker processes → Incident in Postgres within ${PIPELINE_TIMEOUT_MS / 1000}s`,
      async () => {
        const count = await pollUntil("incidents > 0", PIPELINE_TIMEOUT_MS, async () => {
          const c = await withTenantContext(TENANT_ID, async (client) => {
            const r = await client.query<{ c: string }>("SELECT count(*)::text AS c FROM incidents");
            return parseInt(r.rows[0]!.c, 10);
          });
          return c > 0 ? c : null;
        });
        console.log(`\n    (${count} incident(s) written)`);
      },
    );

    await check("Incident has expected fields (high severity, score 95, status new)", async () => {
      const row = await withTenantContext(TENANT_ID, async (client) => {
        const r = await client.query<{ severity: string; classification_score: number; status: string }>(
          "SELECT severity, classification_score, status FROM incidents LIMIT 1",
        );
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
