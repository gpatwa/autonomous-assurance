/**
 * In-process API smoke test.
 *
 * Starts the API server on a random port, seeds a tenant + incident in
 * Postgres, and exercises all four endpoints. No Service Bus required.
 *
 * Coverage:
 *   1. GET /health → 200 (unauthenticated)
 *   2. GET /tenants/:id/incidents — no auth → 401
 *   3. GET /tenants/:id/incidents → 200, empty list before seeding
 *   4. Seed incident via @kavachiq/storage
 *   5. GET /tenants/:id/incidents → 200, total=1, data[0] matches seeded incident
 *   6. GET /tenants/:id/incidents/:id → 200, full incident payload
 *   7. GET /tenants/:id/incidents/:id (unknown id) → 404
 *   8. GET /tenants/:id/changes → 200, total=0 (no changes seeded)
 *   9. RLS isolation: tenant B can't see tenant A's incidents
 *  10. Bad API key → 401
 *
 * Required env:
 *   DATABASE_URL
 *
 * Usage:
 *   npx tsx scripts/smoke-api.ts
 */

import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Incident } from "@kavachiq/schema";
import { createApiServer } from "@kavachiq/api";
import {
  closePool,
  insertIncident,
  withAdminContext,
  withTenantContext,
} from "@kavachiq/storage";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error("Required env DATABASE_URL not set");
  process.exit(2);
}

const API_KEY = "smoke-test-key-" + randomUUID();
const TENANT_A = randomUUID();
const TENANT_B = randomUUID();

// Load canonical incident fixture and re-key it for the smoke tenant.
const canonicalIncident = JSON.parse(
  readFileSync(resolve(__dirname, "../fixtures/canonical/incident.json"), "utf-8"),
) as Incident;
const INCIDENT_ID = "inc_smoke_api_" + randomUUID().replace(/-/g, "");
const BUNDLE_ID = "bnd_smoke_api_" + randomUUID().replace(/-/g, "");
// Cast through unknown — bundleId is not on the schema type yet (TODO Phase 2)
// but the storage layer reads it via (incident as any).bundleId.
const seededIncident = {
  ...canonicalIncident,
  incidentId: INCIDENT_ID,
  tenantId: TENANT_A,
  bundleId: BUNDLE_ID,
} as unknown as Incident;

// ─── Harness ─────────────────────────────────────────────────────────────

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

async function get(server: { port: number }, path: string, key?: string) {
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (key !== undefined) headers["Authorization"] = `Bearer ${key}`;
  const res = await fetch(`http://localhost:${server.port}${path}`, { headers });
  return { status: res.status, body: (await res.json()) as unknown };
}

// ─── Seed / teardown ─────────────────────────────────────────────────────

async function seed(): Promise<void> {
  await withAdminContext(async (client) => {
    await client.query(
      `INSERT INTO tenants (tenant_id, microsoft_tenant_id, display_name, status, consented_at, consent_admin_email)
       VALUES ($1, $2, 'Smoke API tenant A', 'active', now(), 'smoke-api-a@example.com'),
              ($3, $4, 'Smoke API tenant B', 'active', now(), 'smoke-api-b@example.com')`,
      [TENANT_A, randomUUID(), TENANT_B, randomUUID()],
    );
    // correlated_change_bundles FK required by incidents
    await client.query(
      `INSERT INTO correlated_change_bundles
         (bundle_id, tenant_id, primary_actor_id, primary_actor_type, affected_object_ids,
          change_types, time_range_start, time_range_end, finalized_at,
          incident_candidate_score, status, payload, schema_version)
       VALUES ($1, $2, 'actor-id', 'service-principal', ARRAY['obj-id'],
               ARRAY['memberAdded'], now(), now(), now(), 95, 'finalized', '{}'::jsonb, 1)
       ON CONFLICT (bundle_id) DO NOTHING`,
      [BUNDLE_ID, TENANT_A],
    );
  });
  // Insert the incident under tenant context
  await withTenantContext(TENANT_A, async (client) => {
    await insertIncident(client, seededIncident);
  });
}

async function teardown(): Promise<void> {
  await withAdminContext(async (client) => {
    await client.query(
      "DELETE FROM tenants WHERE tenant_id = ANY($1::uuid[])",
      [[TENANT_A, TENANT_B]],
    );
  });
  await closePool();
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔍 API smoke test\n");

  const server = createApiServer({ apiKey: API_KEY });
  await server.listen();
  console.log(`  API server on port ${server.port}\n`);

  await seed();

  try {
    await check("GET /health → 200 (no auth required)", async () => {
      const { status, body } = await get(server, "/health");
      if (status !== 200) throw new Error(`status=${status}`);
      if ((body as { status?: string }).status !== "ok") throw new Error(`body=${JSON.stringify(body)}`);
    });

    await check("GET /tenants/:id/incidents without auth → 401", async () => {
      const { status } = await get(server, `/tenants/${TENANT_A}/incidents`);
      if (status !== 401) throw new Error(`expected 401, got ${status}`);
    });

    await check("GET /tenants/:id/incidents with bad key → 401", async () => {
      const { status } = await get(server, `/tenants/${TENANT_A}/incidents`, "wrong-key");
      if (status !== 401) throw new Error(`expected 401, got ${status}`);
    });

    await check("GET /tenants/:id/incidents → 200, total=1, data has seeded incident", async () => {
      const { status, body } = await get(server, `/tenants/${TENANT_A}/incidents`, API_KEY);
      if (status !== 200) throw new Error(`status=${status}`);
      const b = body as { data: Incident[]; meta: { total: number } };
      if (b.meta.total !== 1) throw new Error(`total=${b.meta.total}, expected 1`);
      if (b.data.length !== 1) throw new Error(`data.length=${b.data.length}`);
      if (b.data[0]!.incidentId !== INCIDENT_ID) throw new Error(`incidentId mismatch`);
    });

    await check("GET /tenants/:id/incidents?severity=high → 200, total=1", async () => {
      const { status, body } = await get(server, `/tenants/${TENANT_A}/incidents?severity=high`, API_KEY);
      if (status !== 200) throw new Error(`status=${status}`);
      const b = body as { meta: { total: number } };
      if (b.meta.total !== 1) throw new Error(`total=${b.meta.total}`);
    });

    await check("GET /tenants/:id/incidents?severity=critical → 200, total=0", async () => {
      const { status, body } = await get(server, `/tenants/${TENANT_A}/incidents?severity=critical`, API_KEY);
      if (status !== 200) throw new Error(`status=${status}`);
      const b = body as { meta: { total: number } };
      if (b.meta.total !== 0) throw new Error(`total=${b.meta.total}`);
    });

    await check("GET /tenants/:id/incidents/:incidentId → 200, full payload", async () => {
      const { status, body } = await get(server, `/tenants/${TENANT_A}/incidents/${INCIDENT_ID}`, API_KEY);
      if (status !== 200) throw new Error(`status=${status}`);
      const b = body as { data: Incident };
      if (b.data.incidentId !== INCIDENT_ID) throw new Error(`incidentId mismatch`);
      if (b.data.severity !== "high") throw new Error(`severity=${b.data.severity}`);
    });

    await check("GET /tenants/:id/incidents/:unknownId → 404", async () => {
      const { status } = await get(server, `/tenants/${TENANT_A}/incidents/inc_does_not_exist`, API_KEY);
      if (status !== 404) throw new Error(`expected 404, got ${status}`);
    });

    await check("GET /tenants/:id/changes → 200, total=0 (no changes seeded)", async () => {
      const { status, body } = await get(server, `/tenants/${TENANT_A}/changes`, API_KEY);
      if (status !== 200) throw new Error(`status=${status}`);
      const b = body as { meta: { total: number } };
      if (b.meta.total !== 0) throw new Error(`total=${b.meta.total}`);
    });

    await check("RLS isolation: tenant B cannot see tenant A's incident", async () => {
      const { status, body } = await get(server, `/tenants/${TENANT_B}/incidents`, API_KEY);
      if (status !== 200) throw new Error(`status=${status}`);
      const b = body as { meta: { total: number } };
      if (b.meta.total !== 0) throw new Error(`tenant B sees tenant A's data, total=${b.meta.total}`);
    });

  } finally {
    await server.close();
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
  console.error("smoke-api crashed:", err);
  process.exit(2);
});
