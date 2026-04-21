/**
 * Phase 1 correlation-slice test.
 *
 * Loads the canonical normalized-changes fixture (12 memberAdded records
 * derived from real WI-05 evidence), runs the correlator, and compares
 * the single produced bundle against the canonical correlated-bundle
 * fixture byte-for-byte — modulo `bundleId` (random UUID per run).
 *
 * Run from platform/ root:
 *   npm test --workspace=@kavachiq/core
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CorrelatedChangeBundle,
  NormalizedChange,
} from "@kavachiq/schema";
import {
  correlateNormalizedChanges,
  type ScoringPolicy,
} from "./index.js";

// ─── Fixture loading (see normalize.test.ts for the path rationale) ───────

const FIXTURE_DIR = resolve(__dirname, "../../../..", "fixtures/canonical");
const normalizedChanges = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "normalized-changes.json"), "utf-8"),
) as NormalizedChange[];
const expectedBundle = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "correlated-bundle.json"), "utf-8"),
) as CorrelatedChangeBundle;

const PRIVILEGED_GROUP_ID = "45a4b187-c7c6-422a-b82b-48e199f63bb3";

const scoringPolicy: ScoringPolicy = {
  highSensitivityGroupIds: new Set([PRIVILEGED_GROUP_ID]),
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function stripBundleId(b: CorrelatedChangeBundle): Omit<CorrelatedChangeBundle, "bundleId"> {
  const { bundleId: _bundleId, ...rest } = b;
  return rest;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test("correlate: fixtures load", () => {
  assert.equal(normalizedChanges.length, 12);
  assert.equal(expectedBundle.changeIds.length, 12);
});

test("correlate: produces exactly one bundle, zero unbundled", () => {
  const { bundles, unbundled } = correlateNormalizedChanges(
    normalizedChanges,
    { scoringPolicy },
  );
  assert.equal(bundles.length, 1, "12 memberAdded changes should collapse to 1 bundle");
  assert.equal(unbundled.length, 0);
});

test("correlate: output matches canonical fixture byte-for-byte (modulo bundleId)", () => {
  const { bundles } = correlateNormalizedChanges(normalizedChanges, {
    scoringPolicy,
  });
  assert.deepEqual(
    stripBundleId(bundles[0]!),
    stripBundleId(expectedBundle),
    "bundle should match canonical fixture outside of the bundleId UUID",
  );
});

test("correlate: changeIds preserved in time order", () => {
  const { bundles } = correlateNormalizedChanges(normalizedChanges, {
    scoringPolicy,
  });
  assert.deepEqual(bundles[0]!.changeIds, expectedBundle.changeIds);
});

test("correlate: primaryActor is the agent SP", () => {
  const { bundles } = correlateNormalizedChanges(normalizedChanges, {
    scoringPolicy,
  });
  assert.deepEqual(bundles[0]!.primaryActor, expectedBundle.primaryActor);
});

test("correlate: affectedObjectIds is [groupId] derived from afterState", () => {
  const { bundles } = correlateNormalizedChanges(normalizedChanges, {
    scoringPolicy,
  });
  assert.deepEqual(bundles[0]!.affectedObjectIds, [PRIVILEGED_GROUP_ID]);
});

test("correlate: correlationSignals exclude Microsoft batch correlation", () => {
  const { bundles } = correlateNormalizedChanges(normalizedChanges, {
    scoringPolicy,
  });
  const signals = bundles[0]!.correlationSignals;
  assert.ok(signals.includes("same-actor-service-principal"));
  assert.ok(signals.includes("same-target-group"));
  assert.ok(signals.some((s) => s.startsWith("time-cluster-within-")));
  assert.ok(
    !signals.includes("microsoft-batch-correlation"),
    "WI-05 §23.E: no reliable Microsoft batch correlation for member-adds",
  );
});

test("correlate: incidentCandidateScore = 95 per canonical scenario", () => {
  const { bundles } = correlateNormalizedChanges(normalizedChanges, {
    scoringPolicy,
  });
  assert.equal(bundles[0]!.incidentCandidateScore, 95);
});

test("correlate: status finalized; finalizedAt = max observedAt", () => {
  const { bundles } = correlateNormalizedChanges(normalizedChanges, {
    scoringPolicy,
  });
  const maxObservedAt = normalizedChanges
    .map((c) => c.observedAt)
    .sort()
    .at(-1);
  assert.equal(bundles[0]!.status, "finalized");
  assert.equal(bundles[0]!.finalizedAt, maxObservedAt);
});

test("correlate: timeRange spans the full 12-event burst", () => {
  const { bundles } = correlateNormalizedChanges(normalizedChanges, {
    scoringPolicy,
  });
  const sorted = normalizedChanges.map((c) => c.observedAt).sort();
  assert.equal(bundles[0]!.timeRange.start, sorted[0]);
  assert.equal(bundles[0]!.timeRange.end, sorted.at(-1));
});

// ─── Scoring edge cases ────────────────────────────────────────────────────

test("correlate: low-sensitivity group produces score 60 (drops -35)", () => {
  const { bundles } = correlateNormalizedChanges(normalizedChanges, {
    scoringPolicy: { highSensitivityGroupIds: new Set() }, // not sensitive
  });
  assert.equal(bundles[0]!.incidentCandidateScore, 60); // 30 + 20 + 10
});

test("correlate: small burst (<=5) drops the +20 bulk-magnitude signal", () => {
  const small = normalizedChanges.slice(0, 5);
  const { bundles } = correlateNormalizedChanges(small, { scoringPolicy });
  assert.equal(bundles[0]!.incidentCandidateScore, 75); // 30 + 35 + 10
  assert.equal(bundles[0]!.changeIds.length, 5);
});

// ─── Unbundled transparency ────────────────────────────────────────────────

test("correlate: non-memberAdded changes go to unbundled with a reason", () => {
  const hybrid = [
    normalizedChanges[0]!,
    { ...normalizedChanges[0]!, changeId: "chg_test_policy", changeType: "policyModified" as const },
  ];
  const { bundles, unbundled } = correlateNormalizedChanges(hybrid, {
    scoringPolicy,
  });
  assert.equal(bundles.length, 1);
  assert.equal(unbundled.length, 1);
  assert.equal(unbundled[0]!.changeId, "chg_test_policy");
  assert.match(unbundled[0]!.reason, /memberAdded/);
});

// ─── Window boundary ───────────────────────────────────────────────────────

test("correlate: events spanning a bucket boundary split into two bundles (fixed-bucket known limitation)", () => {
  // Take the first event as-is; shift the second to a time one hour later.
  // A 60-second window will put them in different buckets, producing 2 bundles.
  const first = normalizedChanges[0]!;
  const second = { ...normalizedChanges[1]!, observedAt: "2026-04-17T08:40:50.5302996Z" };
  const { bundles } = correlateNormalizedChanges([first, second], { scoringPolicy });
  assert.equal(bundles.length, 2);
});
