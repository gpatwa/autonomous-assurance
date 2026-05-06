/**
 * Deployed-worker smoke test.
 *
 * Same shape as scripts/smoke-e2e.ts but DOES NOT spawn a local worker.
 * Trusts the Container App `ca-pipeline-worker-dev` is running. Enqueues
 * a session-keyed message and polls Postgres for the resulting Incident.
 *
 * Verifies that:
 *   - the deployed image consumes process-events sessions
 *   - the deployed worker has correct DATABASE_URL + SERVICE_BUS secrets
 *   - the pipeline-driver writes to Postgres from inside the cluster
 *   - the outbox drainer pushes to notify-operator from inside the cluster
 *
 * Usage:
 *   PG_PASSWORD=$(az keyvault secret show --vault-name kv-kavachiq-platform-dev \
 *     --name postgres-admin-password --query value -o tsv)
 *   DATABASE_URL="postgresql://kavachiqadmin:$PG_PASSWORD@…?sslmode=require" \
 *   SERVICE_BUS_CONNECTION_STRING="$(az servicebus namespace authorization-rule keys list …)" \
 *     npx tsx scripts/smoke-deployed-worker.ts
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ServiceBusClient } from "@azure/service-bus";
import type { NormalizedChange } from "@kavachiq/schema";
import {
  closePool,
  withAdminContext,
  withTenantContext,
} from "@kavachiq/storage";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SB_CONN = required("SERVICE_BUS_CONNECTION_STRING");
required("DATABASE_URL");

const TENANT_ID = randomUUID();
const PRIVILEGED_GROUP_ID = "45a4b187-c7c6-422a-b82b-48e199f63bb3";
const SP_EXECUTE_ID = "bf131def-02b5-4e90-8f32-ec4b3abf96db";
const FIXTURE_DIR = resolve(__dirname, "../fixtures/canonical");
const POLL_TIMEOUT_MS = 90_000; // deployed worker scale-from-zero adds latency
const POLL_INTERVAL_MS = 2_000;

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
       VALUES ($1, $2, 'Smoke deployed-worker tenant', 'active', now(), 'smoke-dw@example.com')`,
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

async function teardown(): Promise<void> {
  await withAdminContext(async (client) => {
    await client.query("DELETE FROM tenants WHERE tenant_id = $1", [TENANT_ID]);
  });
  await closePool();
}

async function main() {
  console.log("\n🔍 deployed-worker smoke test\n");
  console.log(`  Tenant:           ${TENANT_ID}`);
  console.log(`  Container App:    ca-pipeline-worker-dev`);
  console.log(`  Test deadline:    ${POLL_TIMEOUT_MS / 1000}s\n`);

  await seed();

  try {
    const canonical = JSON.parse(
      readFileSync(resolve(FIXTURE_DIR, "normalized-changes.json"), "utf-8"),
    ) as NormalizedChange[];
    const changes = canonical.map((c, i) => ({
      ...c,
      tenantId: TENANT_ID,
      changeId: `chg_dw_${i}`,
      bundleId: null,
      source: { ...c.source, rawEventIds: [`raw_dw_${i}`] },
    }));

    await check("Enqueue session-keyed message on process-events", async () => {
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
      `Deployed worker processes message → Incident in Postgres within ${POLL_TIMEOUT_MS / 1000}s`,
      async () => {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          const found = await withTenantContext(TENANT_ID, async (client) => {
            const r = await client.query<{ c: string }>("SELECT count(*)::text AS c FROM incidents");
            return parseInt(r.rows[0]!.c, 10);
          });
          if (found === 1) return;
          if (found > 1) throw new Error(`expected 1 incident, got ${found}`);
          await sleep(POLL_INTERVAL_MS);
        }
        throw new Error("timed out waiting for incident");
      },
    );

    await check("Incident has expected fields (high severity, score 95)", async () => {
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

    await check("Outbox row written + marked published (drainer ran from inside the cluster)", async () => {
      const row = await withTenantContext(TENANT_ID, async (client) => {
        const r = await client.query<{ event_type: string; published_at: string | null }>(
          "SELECT event_type, published_at::text FROM outbox WHERE event_type = 'incident-created'",
        );
        return r.rows[0];
      });
      if (!row) throw new Error("no outbox row");
      if (!row.published_at) throw new Error("outbox row not marked published");
    });

    await check("notify-operator queue received the incident-created event", async () => {
      const sb = new ServiceBusClient(SB_CONN);
      const recv = sb.createReceiver("notify-operator");
      try {
        const msgs = await recv.receiveMessages(5, { maxWaitTimeInMs: 10_000 });
        if (msgs.length === 0) throw new Error("no message");
        const found = msgs.find((m) => {
          const body = m.body as { eventType?: string; tenantId?: string };
          return body?.eventType === "incident-created" && body?.tenantId === TENANT_ID;
        });
        if (!found) throw new Error("no matching event for our tenant");
        for (const m of msgs) await recv.completeMessage(m);
      } finally {
        await recv.close();
        await sb.close();
      }
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
  console.error("smoke-deployed-worker crashed:", err);
  process.exit(2);
});
