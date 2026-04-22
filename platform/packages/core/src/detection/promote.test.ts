/**
 * Phase 1 detection-slice test.
 *
 * Loads the canonical correlated-bundle + normalized-changes fixtures,
 * runs `promoteBundleToIncident`, and compares the produced Incident
 * against the canonical `incident.json` fixture. Fields that are
 * genuinely now()-driven (`incidentId`, `createdAt`, `updatedAt`) are
 * stripped before comparison. `detectedAt` is deterministic (= bundle
 * timeRange.end) and asserted separately.
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
  Incident,
  NormalizedChange,
} from "@kavachiq/schema";
import {
  IMMEDIATE_CREATION_THRESHOLD,
  promoteBundleToIncident,
  UnsupportedBundleError,
  type DetectionPolicy,
} from "./index.js";

// ─── Fixture loading (same path rationale as normalize.test.ts) ───────────

const FIXTURE_DIR = resolve(__dirname, "../../../..", "fixtures/canonical");
const bundle = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "correlated-bundle.json"), "utf-8"),
) as CorrelatedChangeBundle;
const changes = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "normalized-changes.json"), "utf-8"),
) as NormalizedChange[];
const expectedIncident = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "incident.json"), "utf-8"),
) as Incident;

const PRIVILEGED_GROUP_ID = "45a4b187-c7c6-422a-b82b-48e199f63bb3";
const SP_EXECUTE_ID = "bf131def-02b5-4e90-8f32-ec4b3abf96db";

const policy: DetectionPolicy = {
  highSensitivityGroupIds: new Set([PRIVILEGED_GROUP_ID]),
  actorClassifications: new Map([[SP_EXECUTE_ID, "test-agent"]]),
};

// ─── Helpers ──────────────────────────────────────────────────────────────

type TimeVarying = "incidentId" | "createdAt" | "updatedAt";

function stripTimeVarying(i: Incident): Omit<Incident, TimeVarying> {
  const { incidentId: _id, createdAt: _c, updatedAt: _u, ...rest } = i;
  return rest;
}

const FIXED_NOW = new Date("2026-04-17T07:40:55.097Z");
const FIXED_INCIDENT_ID = "inc_fixed-id-for-tests";
const deterministicOpts = {
  policy,
  newIncidentId: () => FIXED_INCIDENT_ID,
  now: () => FIXED_NOW,
};

// ─── Tests ────────────────────────────────────────────────────────────────

test("promote: fixtures load", () => {
  assert.equal(bundle.changeIds.length, 12);
  assert.equal(changes.length, 12);
  assert.equal(expectedIncident.correlatedChangeIds.length, 12);
  assert.equal(bundle.incidentCandidateScore, 95);
});

test("promote: canonical bundle → incident matches fixture (modulo time-varying fields)", () => {
  const incident = promoteBundleToIncident(bundle, changes, deterministicOpts);
  assert.deepEqual(
    stripTimeVarying(incident),
    stripTimeVarying(expectedIncident),
    "incident should match canonical fixture outside of incidentId/createdAt/updatedAt",
  );
});

test("promote: severity / urgency / confidence align with canonical expectations", () => {
  const incident = promoteBundleToIncident(bundle, changes, deterministicOpts);
  assert.equal(incident.severity, "high");
  assert.equal(incident.urgency, "immediate");
  assert.equal(incident.confidence.level, "high");
  assert.deepEqual(incident.confidence, expectedIncident.confidence);
});

test("promote: detectedAt === bundle.timeRange.end (deterministic)", () => {
  const incident = promoteBundleToIncident(bundle, changes, deterministicOpts);
  assert.equal(incident.detectedAt, bundle.timeRange.end);
});

test("promote: createdAt === updatedAt === injected now()", () => {
  const incident = promoteBundleToIncident(bundle, changes, deterministicOpts);
  assert.equal(incident.createdAt, FIXED_NOW.toISOString());
  assert.equal(incident.updatedAt, FIXED_NOW.toISOString());
});

test("promote: incidentId uses injected factory", () => {
  const incident = promoteBundleToIncident(bundle, changes, deterministicOpts);
  assert.equal(incident.incidentId, FIXED_INCIDENT_ID);
});

test("promote: classificationRationale.signals carried forward verbatim from correlation", () => {
  const incident = promoteBundleToIncident(bundle, changes, deterministicOpts);
  const signals = incident.classificationRationale.signals;
  assert.equal(signals.length, 4);
  const totalWeight = signals.reduce((s, sig) => sig.weight + s, 0);
  assert.equal(
    totalWeight,
    bundle.incidentCandidateScore,
    "sum(signals.weight) must equal bundle.incidentCandidateScore — invariant",
  );
  assert.deepEqual(signals, expectedIncident.classificationRationale.signals);
});

test("promote: creationType=immediate; candidateId=null", () => {
  const incident = promoteBundleToIncident(bundle, changes, deterministicOpts);
  assert.equal(incident.creationType, "immediate");
  assert.equal(incident.candidateId, null);
  assert.equal(incident.classificationRationale.scoreAtPromotion, null);
  assert.equal(incident.classificationRationale.promotionEvidence, null);
});

test("promote: sensitivityContext derived from policy + actor map", () => {
  const incident = promoteBundleToIncident(bundle, changes, deterministicOpts);
  assert.deepEqual(incident.sensitivityContext, expectedIncident.sensitivityContext);
});

// ─── Unsupported bundle shapes — candidate workflow is a later slice ──────

test("promote: sub-threshold bundle is rejected (candidate workflow deferred)", () => {
  const subThreshold: CorrelatedChangeBundle = {
    ...bundle,
    incidentCandidateScore: IMMEDIATE_CREATION_THRESHOLD - 1,
  };
  assert.throws(
    () => promoteBundleToIncident(subThreshold, changes, deterministicOpts),
    UnsupportedBundleError,
  );
});

test("promote: non-memberAdded bundle is rejected", () => {
  const bad: CorrelatedChangeBundle = {
    ...bundle,
    changeTypes: ["policyModified"],
  };
  assert.throws(
    () => promoteBundleToIncident(bad, changes, deterministicOpts),
    UnsupportedBundleError,
  );
});

test("promote: non-finalized bundle is rejected", () => {
  const bad: CorrelatedChangeBundle = { ...bundle, status: "open" };
  assert.throws(
    () => promoteBundleToIncident(bad, changes, deterministicOpts),
    UnsupportedBundleError,
  );
});

test("promote: missing change from bundle.changeIds throws", () => {
  const missingOne = changes.slice(1);
  assert.throws(
    () => promoteBundleToIncident(bundle, missingOne, deterministicOpts),
    UnsupportedBundleError,
  );
});
