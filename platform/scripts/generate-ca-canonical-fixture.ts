/**
 * Single-purpose generator for the Conditional Access canonical fixture.
 *
 * Reads `platform/wi05/raw-events.json`, finds the single real
 * `Update conditional access policy` event captured during WI-05
 * (evidence per `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §4.2`),
 * and emits two schema-conforming fixture files:
 *
 *   fixtures/canonical/ca-policy-update/raw-event.json         RawEvent
 *   fixtures/canonical/ca-policy-update/normalized-change.json NormalizedChange
 *
 * The normalized change is produced by invoking the real CA mapper —
 * `mapCaPolicyUpdateEvent` — so the fixture is exactly what the
 * normalizer would produce in production. The fixture is not invented;
 * it is the mapper's deterministic output over a real audit event.
 *
 * Deterministic IDs (stable fixtures):
 *   rawEventId / changeId are seeded from the real event's correlationId
 *   so the fixture regenerates byte-for-byte given the same WI-05 input.
 *
 * Run:
 *   npm run generate-ca-canonical-fixture
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedChange, RawEvent } from "@kavachiq/schema";
import { normalization } from "@kavachiq/core";
const { mapCaPolicyUpdateEvent } = normalization;

const SCHEMA_VERSION = 1;
const TENANT_ID = "3725cec5-3e2d-402c-a5a6-460c325d8f87";

// ─── IO paths ──────────────────────────────────────────────────────────────

const PLATFORM_DIR = process.cwd();
const WI05_RAW_EVENTS = resolve(PLATFORM_DIR, "wi05/raw-events.json");
const FIXTURE_DIR = resolve(
  PLATFORM_DIR,
  "fixtures/canonical/ca-policy-update",
);
const OUT_RAW = resolve(FIXTURE_DIR, "raw-event.json");
const OUT_NORMALIZED = resolve(FIXTURE_DIR, "normalized-change.json");

// ─── Main ──────────────────────────────────────────────────────────────────

interface RawCaEvent {
  id: string;
  activityDisplayName: string;
  activityDateTime: string;
  correlationId: string;
}

function main(): void {
  const all = JSON.parse(readFileSync(WI05_RAW_EVENTS, "utf-8")) as RawCaEvent[];
  const caEvents = all.filter(
    (e) => e.activityDisplayName === "Update conditional access policy",
  );
  if (caEvents.length !== 1) {
    throw new Error(
      `Expected exactly 1 'Update conditional access policy' event in wi05/raw-events.json; found ${caEvents.length}. ` +
        `Re-run the M2 capture via the WI-05 runbook.`,
    );
  }
  const real = caEvents[0]!;

  // Deterministic IDs: seeded from correlationId so reruns produce byte-for-byte output.
  const rawEventId = `raw_ca_${real.correlationId}`;
  const changeId = `chg_ca_${real.correlationId}`;

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

  const normalized: NormalizedChange = mapCaPolicyUpdateEvent(rawEvent, {
    tenantId: TENANT_ID,
    newChangeId: () => changeId,
    bundleIdFor: () => null,
  });

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

main();
