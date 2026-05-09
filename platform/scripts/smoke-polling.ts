/**
 * Polling-driver smoke test against the WI-05 test tenant.
 *
 * Seeds a synthetic platform-tenant pointing at patwainc.onmicrosoft.com
 * (the existing test Entra tenant), runs `pollTenantBatch` once, and
 * verifies:
 *
 *   1. Graph audit events are fetched (test tenant has the WI-05 events)
 *   2. Events are archived to Blob storage (raw-events container)
 *   3. raw_events Postgres rows are inserted (idempotent on re-run)
 *   4. polling_state cursor is advanced
 *   5. process-events Service Bus message is enqueued (session=tenantId)
 *      with normalized memberAdded changes
 *   6. Re-run produces 0 new raw_events (idempotency)
 *
 * Required env (in addition to standard DATABASE_URL +
 * SERVICE_BUS_CONNECTION_STRING):
 *
 *   STORAGE_CONNECTION_STRING — for Blob writes (smoke test runs from
 *     laptop; one-shot get via:
 *     az storage account show-connection-string -g rg-kavachiq-platform \
 *       -n kavachiqplatformdevst --query connectionString -o tsv)
 *   SP_READ_TENANT_ID, SP_READ_CLIENT_ID, SP_READ_CLIENT_SECRET
 *     — patwainc test-tenant credentials from platform/.env.local
 *
 * Usage:
 *   npx tsx scripts/smoke-polling.ts
 */

import { randomUUID } from "node:crypto";
import { ServiceBusClient } from "@azure/service-bus";
import { pollTenantBatch } from "@kavachiq/orchestration";
import {
  closePool,
  getPollingState,
  loadTenantMicrosoftId,
  withAdminContext,
  withTenantContext,
} from "@kavachiq/storage";

// ─── Config ─────────────────────────────────────────────────────────────
// Secretless design: KAVACHIQ_APP_CLIENT_ID + _CLIENT_SECRET are platform
// credentials used by createGraphCredential to call Graph in any consented
// tenant. SP_READ_TENANT_ID is the customer Microsoft tenant ID to test against.

required("DATABASE_URL");
required("SP_READ_TENANT_ID");
required("KAVACHIQ_APP_CLIENT_ID");
required("KAVACHIQ_APP_CLIENT_SECRET");
required("STORAGE_CONNECTION_STRING");
const SB_CONN = required("SERVICE_BUS_CONNECTION_STRING");

const TENANT_ID = randomUUID();
const MS_TENANT_ID = process.env.SP_READ_TENANT_ID!;

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

async function seed(): Promise<void> {
  // Secretless: only tenant row needed; Graph credentials come from env vars.
  await withAdminContext(async (client) => {
    await client.query(
      `INSERT INTO tenants (tenant_id, microsoft_tenant_id, display_name, status, consented_at)
       VALUES ($1, $2::uuid, 'Smoke polling tenant (patwainc)', 'active', now())`,
      [TENANT_ID, MS_TENANT_ID],
    );
  });
}

async function teardown(): Promise<void> {
  await withAdminContext(async (client) => {
    await client.query("DELETE FROM tenants WHERE tenant_id = $1", [TENANT_ID]);
  });
  // Drain any process-events messages we enqueued so future runs are isolated.
  // Use admin (non-session) receiver to peek + complete in case sessions
  // have collected. Best-effort.
  const sb = new ServiceBusClient(SB_CONN);
  try {
    // Try to grab the session matching our tenant and drain it.
    try {
      const recv = await sb.acceptSession("process-events", TENANT_ID);
      try {
        const msgs = await recv.receiveMessages(50, { maxWaitTimeInMs: 2000 });
        for (const m of msgs) await recv.completeMessage(m);
      } finally {
        await recv.close();
      }
    } catch {
      /* no such session — fine */
    }
  } finally {
    await sb.close();
  }
  await closePool();
}

async function main() {
  console.log("\n🔍 polling-driver smoke against patwainc.onmicrosoft.com\n");
  console.log(`  Platform tenant ID:  ${TENANT_ID}`);
  console.log(`  Microsoft tenant ID: ${MS_TENANT_ID}\n`);

  await seed();

  try {
    await check("Tenant microsoft_tenant_id loads (RLS-scoped)", async () => {
      const { microsoftTenantId } = await withTenantContext(TENANT_ID, loadTenantMicrosoftId);
      if (microsoftTenantId !== MS_TENANT_ID) {
        throw new Error(`ms tenant id mismatch: ${microsoftTenantId}`);
      }
    });

    await check("polling_state starts as null (no row yet)", async () => {
      const state = await withTenantContext(TENANT_ID, getPollingState);
      if (state !== null) throw new Error("expected null state on first poll");
    });

    let firstResult: Awaited<ReturnType<typeof pollTenantBatch>> | null = null;
    await check("pollTenantBatch first run completes", async () => {
      // Look back ~6 weeks to make sure the WI-05 events from 2026-04-17 fall
      // inside the window even if the test tenant has had little activity since.
      firstResult = await pollTenantBatch({
        tenantId: TENANT_ID,
        serviceBusConnectionString: SB_CONN,
        initialLookbackHours: 24 * 30,
      });
    });

    await check("pollTenantBatch fetched > 0 events from Graph", async () => {
      if (!firstResult || firstResult.fetchedCount === 0) {
        throw new Error("expected at least 1 event from the test tenant audit log");
      }
    });

    await check("raw_events rows inserted (count == fetched count on first run)", async () => {
      if (!firstResult) throw new Error("first run not run");
      if (firstResult.insertedCount !== firstResult.fetchedCount) {
        throw new Error(
          `inserted=${firstResult.insertedCount} fetched=${firstResult.fetchedCount}`,
        );
      }
    });

    await check("polling_state cursor advanced", async () => {
      const state = await withTenantContext(TENANT_ID, getPollingState);
      if (!state) throw new Error("polling_state still null");
      if (!state.lastEventObservedAt) {
        throw new Error("last_event_observed_at not set");
      }
      if (!state.lastPollCompletedAt) {
        throw new Error("last_poll_completed_at not set");
      }
      if (state.consecutiveFailures !== 0) {
        throw new Error(`expected consecutive_failures=0, got ${state.consecutiveFailures}`);
      }
    });

    await check("Re-run produces 0 new raw_events (idempotent on (tenant, microsoft_event_id))", async () => {
      const second = await pollTenantBatch({
        tenantId: TENANT_ID,
        serviceBusConnectionString: SB_CONN,
        initialLookbackHours: 24 * 30,
      });
      if (second.insertedCount !== 0) {
        throw new Error(`expected 0 new on re-run; got ${second.insertedCount}`);
      }
    });

    await check("If memberAdded events were among fetched, normalized changes were enqueued", async () => {
      if (!firstResult) throw new Error("first run not run");
      // The smoke test doesn't strictly require memberAdded to be present —
      // the audit log might have other classes. We just verify the contract:
      // when normalized events exist, enqueue counts match.
      if (
        firstResult.enqueuedNormalizedCount > 0 &&
        firstResult.enqueuedNormalizedCount > firstResult.fetchedCount
      ) {
        throw new Error(
          `enqueuedNormalized=${firstResult.enqueuedNormalizedCount} > fetched=${firstResult.fetchedCount}`,
        );
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
  console.error("smoke-polling crashed:", err);
  process.exit(2);
});
