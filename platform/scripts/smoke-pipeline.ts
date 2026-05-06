/**
 * In-process pipeline-driver smoke test.
 *
 * Calls @kavachiq/orchestration's `processEventsMessage` directly against
 * live Azure Postgres. Skips Service Bus to keep iteration fast and isolate
 * pipeline-driver issues from Service Bus integration issues.
 *
 * Coverage:
 *   1. Tenant policy load (sensitivity_lists → ScoringPolicy + DetectionPolicy)
 *   2. Correlation produces 1 bundle from 12 canonical changes
 *   3. Bundle is persisted; same call twice = idempotent (N1+N2)
 *   4. Detection promotes bundle (score 95 ≥ 80 threshold)
 *   5. Incident is persisted with bundle_id linkage
 *   6. Outbox row written in same transaction as Incident (N3)
 *   7. RLS isolates: tenant B can't see tenant A's incident
 *
 * Usage:
 *   DATABASE_URL="postgresql://kavachiqadmin:$PG_PASSWORD@…?sslmode=require" \
 *     npx tsx scripts/smoke-pipeline.ts
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import type { NormalizedChange } from "@kavachiq/schema";
import { processEventsMessage } from "@kavachiq/orchestration";
import {
  closePool,
  findIncidentById,
  withAdminContext,
  withTenantContext,
} from "@kavachiq/storage";

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

// ─── Fixtures ────────────────────────────────────────────────────────────

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();

// Canonical 12-event memberAdded burst from WI-05 evidence.
const FIXTURE_DIR = resolve(__dirname, "../fixtures/canonical");
const canonicalChanges = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "normalized-changes.json"), "utf-8"),
) as NormalizedChange[];

const PRIVILEGED_GROUP_ID = "45a4b187-c7c6-422a-b82b-48e199f63bb3";
const SP_EXECUTE_ID = "bf131def-02b5-4e90-8f32-ec4b3abf96db";

/** Re-tenant the canonical changes onto our smoke test tenant. */
function retenant(changes: NormalizedChange[], tenantId: string, prefix: string): NormalizedChange[] {
  return changes.map((c, i) => ({
    ...c,
    tenantId,
    changeId: `chg_smoke_${prefix}_${i}`,
    bundleId: null,
    source: {
      ...c.source,
      rawEventIds: [`raw_smoke_${prefix}_${i}`],
    },
  }));
}

async function seed(tenantId: string): Promise<void> {
  await withAdminContext(async (client) => {
    await client.query(
      `INSERT INTO tenants (tenant_id, microsoft_tenant_id, display_name, status, consented_at, consent_admin_email)
       VALUES ($1, $2, 'Smoke pipeline tenant', 'active', now(), 'smoke@example.com')
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId, randomUUID()],
    );
    // Seed sensitivity list — high-sensitivity group + agent SP — so the pipeline
    // computes the canonical 95 score.
    await client.query(
      `INSERT INTO sensitivity_lists (tenant_id, list_type, object_id, display_name)
       VALUES ($1, 'high-sensitivity-group', $2, 'Finance-Privileged-Access'),
              ($1, 'agent-identified-sp',   $3, 'test-agent')
       ON CONFLICT DO NOTHING`,
      [tenantId, PRIVILEGED_GROUP_ID, SP_EXECUTE_ID],
    );
  });
}

async function teardown(): Promise<void> {
  await withAdminContext(async (client) => {
    await client.query("DELETE FROM tenants WHERE tenant_id = ANY($1::uuid[])", [
      [TENANT_A, TENANT_B],
    ]);
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔍 pipeline-driver smoke test (in-process, against live Azure Postgres)\n");
  console.log(`  Tenant A: ${TENANT_A}`);
  console.log(`  Tenant B: ${TENANT_B}\n`);

  await seed(TENANT_A);
  await seed(TENANT_B);

  try {
    const changesA = retenant(canonicalChanges, TENANT_A, "a");
    const incidentIdA: string[] = []; // captured via DB lookup after run

    await check("First run: 1 bundle created, 1 incident created (score 95)", async () => {
      const r = await processEventsMessage({
        schemaVersion: 1,
        tenantId: TENANT_A,
        normalizedChanges: changesA,
      });
      if (r.bundlesCreated !== 1) throw new Error(`bundles: expected 1, got ${r.bundlesCreated}`);
      if (r.incidentsCreated !== 1) throw new Error(`incidents: expected 1, got ${r.incidentsCreated}`);
      if (r.unbundledChanges !== 0) throw new Error(`unbundled: expected 0, got ${r.unbundledChanges}`);
    });

    await check("Idempotent re-run: 0 bundles created, 0 incidents created", async () => {
      const r = await processEventsMessage({
        schemaVersion: 1,
        tenantId: TENANT_A,
        normalizedChanges: changesA,
      });
      if (r.bundlesCreated !== 0) throw new Error(`bundles: expected 0, got ${r.bundlesCreated}`);
      if (r.bundlesAlreadyPresent !== 1) throw new Error(`already present: expected 1, got ${r.bundlesAlreadyPresent}`);
      if (r.incidentsCreated !== 0) throw new Error(`incidents: expected 0, got ${r.incidentsCreated}`);
    });

    await check("Tenant A's incident exists in DB and is RLS-visible to A", async () => {
      const found = await withTenantContext(TENANT_A, async (client) => {
        const r = await client.query<{ incident_id: string; severity: string; classification_score: number; bundle_id: string }>(
          `SELECT incident_id, severity, classification_score, bundle_id
             FROM incidents
            WHERE tenant_id = current_setting('app.tenant_id')::uuid`,
        );
        return r.rows;
      });
      if (found.length !== 1) throw new Error(`expected 1 incident; got ${found.length}`);
      if (found[0]!.severity !== "high") throw new Error(`severity: expected high, got ${found[0]!.severity}`);
      if (found[0]!.classification_score !== 95) throw new Error(`score: expected 95, got ${found[0]!.classification_score}`);
      incidentIdA.push(found[0]!.incident_id);
    });

    await check("Tenant B (no events processed) sees zero incidents under RLS", async () => {
      const visible = await withTenantContext(TENANT_B, async (client) => {
        const r = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM incidents`,
        );
        return parseInt(r.rows[0]!.c, 10);
      });
      if (visible !== 0) throw new Error(`tenant B should see 0 incidents; got ${visible}`);
    });

    await check("Tenant B cannot find tenant A's incident by ID", async () => {
      const found = await withTenantContext(TENANT_B, (c) => findIncidentById(c, incidentIdA[0]!));
      if (found !== null) throw new Error(`tenant B should not see A's incident`);
    });

    await check("Outbox has 1 incident-created event for tenant A", async () => {
      const count = await withTenantContext(TENANT_A, async (client) => {
        const r = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM outbox WHERE event_type = 'incident-created'`,
        );
        return parseInt(r.rows[0]!.c, 10);
      });
      if (count !== 1) throw new Error(`expected 1 outbox event for tenant A; got ${count}`);
    });

    await check("Bundle persisted with score 95 + finalized status", async () => {
      const bundles = await withTenantContext(TENANT_A, async (client) => {
        const r = await client.query<{ score: number; status: string; change_count: number }>(
          `SELECT incident_candidate_score AS score, status,
                  array_length(affected_object_ids, 1) AS change_count
             FROM correlated_change_bundles`,
        );
        return r.rows;
      });
      if (bundles.length !== 1) throw new Error(`expected 1 bundle; got ${bundles.length}`);
      if (bundles[0]!.score !== 95) throw new Error(`score: expected 95, got ${bundles[0]!.score}`);
      if (bundles[0]!.status !== "finalized") throw new Error(`status: expected finalized, got ${bundles[0]!.status}`);
    });

    await check("Normalized changes persisted with bundle_id linkage", async () => {
      const linked = await withTenantContext(TENANT_A, async (client) => {
        const r = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM normalized_changes WHERE bundle_id IS NOT NULL`,
        );
        return parseInt(r.rows[0]!.c, 10);
      });
      if (linked !== 12) throw new Error(`expected 12 changes linked to bundle; got ${linked}`);
    });
  } finally {
    await teardown();
    await closePool();
  }

  console.log(`\n  ${failed === 0 ? "✅ PASS" : `❌ FAIL (${failed} of ${passed + failed})`}\n`);
  if (failed > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke-pipeline crashed:", err);
  process.exit(2);
});
