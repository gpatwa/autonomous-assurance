/**
 * @kavachiq/storage smoke test — runs against live Azure Postgres.
 *
 * Verifies the contracts that matter end-to-end:
 *   1. Pool connects via TLS
 *   2. withTenantContext sets app.tenant_id; RLS isolates between tenants
 *   3. insertIncident is idempotent: same (tenant_id, bundle_id) twice → one row
 *   4. Tenant mismatch throws (defense-in-depth above RLS)
 *   5. enqueueOutboxEvent writes a row scoped to the current tenant
 *   6. withAdminContext (BYPASSRLS) sees rows from all tenants
 *   7. Connection-pool reuse does not leak app.tenant_id between leases
 *
 * Usage:
 *   DATABASE_URL="postgresql://kavachiqadmin:$PG_PASSWORD@pg-kavachiq-platform-dev.postgres.database.azure.com:5432/kavachiq?sslmode=require" \
 *     npx tsx scripts/smoke-storage.ts
 *
 * The script seeds two synthetic tenants, runs the contracts, and cleans up
 * after itself. CASCADE on tenants → child rows go with it.
 */

import { randomUUID } from "node:crypto";
import {
  closePool,
  enqueueOutboxEvent,
  findIncidentById,
  insertIncident,
  withAdminContext,
  withTenantContext,
} from "@kavachiq/storage";
import type { Incident } from "@kavachiq/schema";

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
const MS_TENANT_A = randomUUID();
const MS_TENANT_B = randomUUID();

function makeIncident(tenantId: string, bundleId: string, suffix: string): Incident {
  return {
    incidentId: `inc_smoke_${suffix}`,
    tenantId,
    title: `Smoke test incident ${suffix}`,
    severity: "high",
    urgency: "immediate",
    confidence: { level: "high", reasons: ["smoke-test"], missingFields: [] },
    status: "new",
    rootChangeIds: [],
    correlatedChangeIds: [],
    classificationRationale: {
      signals: [],
      scoreAtCreation: 95,
      scoreAtPromotion: null,
      immediateCreationCriteria: ["smoke-test"],
      promotionEvidence: null,
      narrative: "smoke test",
    },
    sensitivityContext: {
      targetSensitivity: "high",
      actorClassification: "smoke",
      sensitivityListMatches: [],
    },
    creationType: "immediate",
    candidateId: null,
    currentBlastRadiusId: null,
    currentPlanId: null,
    currentPlanVersion: null,
    mergedFrom: [],
    detectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    schemaVersion: 1,
    // bundleId carried as an extra property; insertIncident reads it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...({ bundleId } as any),
  };
}

// ─── Setup / teardown ────────────────────────────────────────────────────

async function seed() {
  await withAdminContext(async (client) => {
    await client.query(
      `INSERT INTO tenants (tenant_id, microsoft_tenant_id, display_name, status, consented_at, consent_admin_email)
       VALUES ($1, $2, 'Smoke Tenant A', 'active', now(), 'smoke-a@example.com'),
              ($3, $4, 'Smoke Tenant B', 'active', now(), 'smoke-b@example.com')`,
      [TENANT_A, MS_TENANT_A, TENANT_B, MS_TENANT_B],
    );
    await client.query(
      `INSERT INTO correlated_change_bundles (
         bundle_id, tenant_id, primary_actor_id, primary_actor_type, affected_object_ids, change_types,
         time_range_start, time_range_end, incident_candidate_score, status, finalized_at, payload, schema_version
       ) VALUES
         ('bnd_smoke_a', $1, 'sp-a', 'service-principal', ARRAY['grp-a'], ARRAY['memberAdded'], now(), now(), 95, 'finalized', now(), '{}'::jsonb, 1),
         ('bnd_smoke_b', $2, 'sp-b', 'service-principal', ARRAY['grp-b'], ARRAY['memberAdded'], now(), now(), 90, 'finalized', now(), '{}'::jsonb, 1)`,
      [TENANT_A, TENANT_B],
    );
  });
}

async function teardown() {
  await withAdminContext(async (client) => {
    await client.query("DELETE FROM tenants WHERE tenant_id = ANY($1::uuid[])", [
      [TENANT_A, TENANT_B],
    ]);
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔍 @kavachiq/storage smoke test\n");
  console.log(`  Tenant A: ${TENANT_A}`);
  console.log(`  Tenant B: ${TENANT_B}\n`);

  await seed();

  try {
    await check("withTenantContext sets app.tenant_id", async () => {
      const got = await withTenantContext(TENANT_A, async (client) => {
        const r = await client.query<{ t: string }>("SELECT current_setting('app.tenant_id') AS t");
        return r.rows[0]?.t;
      });
      if (got !== TENANT_A) throw new Error(`expected ${TENANT_A}, got ${got}`);
    });

    await check("insertIncident writes Incident under tenant A", async () => {
      const incident = makeIncident(TENANT_A, "bnd_smoke_a", "a1");
      const r = await withTenantContext(TENANT_A, (c) => insertIncident(c, incident));
      if (!r.inserted) throw new Error("expected new row to be inserted");
    });

    await check("insertIncident is idempotent (same bundle → no second row)", async () => {
      const incident = makeIncident(TENANT_A, "bnd_smoke_a", "a1-dup");
      const r = await withTenantContext(TENANT_A, (c) => insertIncident(c, incident));
      if (r.inserted) throw new Error("expected duplicate to be no-op (inserted=false)");
    });

    await check("RLS hides tenant A's incident from tenant B's session", async () => {
      const found = await withTenantContext(TENANT_B, (c) => findIncidentById(c, "inc_smoke_a1"));
      if (found !== null) throw new Error(`tenant B should not see tenant A's incident; got ${found.incidentId}`);
    });

    await check("Tenant A can find its own incident", async () => {
      const found = await withTenantContext(TENANT_A, (c) => findIncidentById(c, "inc_smoke_a1"));
      if (found === null) throw new Error("tenant A should see its own incident");
      if (found.tenantId !== TENANT_A) throw new Error(`tenant_id mismatch: ${found.tenantId}`);
    });

    await check("Tenant mismatch (A's session, B's incident) → throws", async () => {
      let threw = false;
      try {
        const wrongIncident = makeIncident(TENANT_B, "bnd_smoke_b", "b1");
        await withTenantContext(TENANT_A, (c) => insertIncident(c, wrongIncident));
      } catch {
        threw = true;
      }
      if (!threw) throw new Error("expected throw on tenant mismatch");
    });

    await check("enqueueOutboxEvent writes an outbox row in current tenant", async () => {
      const r = await withTenantContext(TENANT_A, (c) =>
        enqueueOutboxEvent(c, { eventType: "incident-created", payload: { incidentId: "inc_smoke_a1" } }),
      );
      if (!r.outboxId) throw new Error("expected outboxId returned");
    });

    await check("withAdminContext (BYPASSRLS) sees both tenants' incidents", async () => {
      const incidentB = makeIncident(TENANT_B, "bnd_smoke_b", "b1");
      await withTenantContext(TENANT_B, (c) => insertIncident(c, incidentB));

      const count = await withAdminContext(async (client) => {
        const r = await client.query<{ c: string }>(
          "SELECT count(*)::text AS c FROM incidents WHERE incident_id LIKE 'inc_smoke_%'",
        );
        return parseInt(r.rows[0]!.c, 10);
      });
      if (count < 2) throw new Error(`admin should see >=2 smoke incidents; got ${count}`);
    });

    await check("Connection-pool reuse: app.tenant_id does not leak between leases", async () => {
      const a = await withTenantContext(TENANT_A, async (c) => {
        const r = await c.query<{ t: string }>("SELECT current_setting('app.tenant_id') AS t");
        return r.rows[0]?.t;
      });
      const b = await withTenantContext(TENANT_B, async (c) => {
        const r = await c.query<{ t: string }>("SELECT current_setting('app.tenant_id') AS t");
        return r.rows[0]?.t;
      });
      if (a !== TENANT_A || b !== TENANT_B) {
        throw new Error(`expected (${TENANT_A}, ${TENANT_B}); got (${a}, ${b})`);
      }
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
  console.error("smoke test crashed:", err);
  process.exit(2);
});
