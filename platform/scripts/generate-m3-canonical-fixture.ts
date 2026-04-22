/**
 * Single-purpose generator for the M3 (app-role-assignment) canonical fixture.
 *
 * Reads `platform/wi05/raw-events.json`, finds the single real
 * `Add app role assignment grant to user` event captured during WI-05
 * (evidence per `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §4.3`),
 * and emits two schema-conforming fixture files:
 *
 *   fixtures/canonical/app-role-assignment-add/raw-event.json         RawEvent
 *   fixtures/canonical/app-role-assignment-add/normalized-change.json NormalizedChange
 *
 * The normalized change is produced by invoking the real mapper —
 * `mapAppRoleAssignmentAddEvent` — against the real baseline file at
 * `fixtures/canonical/baselines/{tenant}/app-role-assignments/{sp}.json`.
 * Fixture is therefore the mapper's deterministic output, not invented.
 *
 * Deterministic IDs (stable fixtures):
 *   rawEventId / changeId are seeded from the real event's correlationId.
 *
 * Run:
 *   npm run build --workspace=@kavachiq/core
 *   npm run generate-m3-canonical-fixture
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedChange, RawEvent } from "@kavachiq/schema";
import { normalization } from "@kavachiq/core";
const { createFilesystemSnapshotProvider, mapAppRoleAssignmentAddEvent } =
  normalization;

const SCHEMA_VERSION = 1;
const TENANT_ID = "3725cec5-3e2d-402c-a5a6-460c325d8f87";
const SP_SETUP_OBJECT_ID = "5b459613-2158-484f-a28a-61fd04b1b595";

// ─── IO paths ──────────────────────────────────────────────────────────────

const PLATFORM_DIR = process.cwd();
const WI05_RAW_EVENTS = resolve(PLATFORM_DIR, "wi05/raw-events.json");
const FIXTURE_DIR = resolve(
  PLATFORM_DIR,
  "fixtures/canonical/app-role-assignment-add",
);
const BASELINE_ROOT = resolve(PLATFORM_DIR, "fixtures/canonical/baselines");
const OUT_RAW = resolve(FIXTURE_DIR, "raw-event.json");
const OUT_NORMALIZED = resolve(FIXTURE_DIR, "normalized-change.json");

// ─── Main ──────────────────────────────────────────────────────────────────

interface RawM3Event {
  id: string;
  activityDisplayName: string;
  activityDateTime: string;
  correlationId: string;
}

async function main(): Promise<void> {
  const all = JSON.parse(readFileSync(WI05_RAW_EVENTS, "utf-8")) as RawM3Event[];
  const m3Events = all.filter(
    (e) => e.activityDisplayName === "Add app role assignment grant to user",
  );
  if (m3Events.length !== 1) {
    throw new Error(
      `Expected exactly 1 'Add app role assignment grant to user' event in wi05/raw-events.json; found ${m3Events.length}. ` +
        `Re-run the M3 capture via the WI-05 runbook.`,
    );
  }
  const real = m3Events[0]!;

  // Deterministic IDs — seeded from correlationId.
  const rawEventId = `raw_m3_${real.correlationId}`;
  const changeId = `chg_m3_${real.correlationId}`;

  const rawEvent: RawEvent = {
    rawEventId,
    tenantId: TENANT_ID,
    sourceSystem: "entra-audit",
    rawPayload: real as unknown as Record<string, unknown>,
    ingestedAt: new Date(
      new Date(real.activityDateTime).getTime() + 1000,
    ).toISOString(),
    processingStatus: "normalized",
    normalizedChangeIds: [changeId],
    schemaVersion: SCHEMA_VERSION,
  };

  const snapshotProvider = createFilesystemSnapshotProvider({
    rootDir: BASELINE_ROOT,
  });
  const normalized: NormalizedChange = await mapAppRoleAssignmentAddEvent(
    rawEvent,
    {
      tenantId: TENANT_ID,
      snapshotProvider,
      // SP-Setup fired this grant. Agent-identified for the test tenant.
      agentIdentifiedActorIds: new Set([SP_SETUP_OBJECT_ID]),
      newChangeId: () => changeId,
      bundleIdFor: () => null,
    },
  );

  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(OUT_RAW, JSON.stringify(rawEvent, null, 2) + "\n", "utf-8");
  writeFileSync(
    OUT_NORMALIZED,
    JSON.stringify(normalized, null, 2) + "\n",
    "utf-8",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceEventId: real.id,
        sourceCorrelationId: real.correlationId,
        output: { raw: OUT_RAW, normalized: OUT_NORMALIZED },
      },
      null,
      2,
    ),
  );
}

void main();
