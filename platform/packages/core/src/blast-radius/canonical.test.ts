import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Incident, NormalizedChange } from "@kavachiq/schema";
import {
  computeCanonicalBlastRadius,
  UnsupportedBlastRadiusInputError,
} from "./index.js";

const FIXTURE_DIR = resolve(__dirname, "../../../..", "fixtures/canonical");
const incident = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "incident.json"), "utf-8"),
) as Incident;
const changes = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "normalized-changes.json"), "utf-8"),
) as NormalizedChange[];

const deterministicOpts = {
  resultId: "br_fixed-id-for-tests",
  computedAt: "2026-04-17T07:41:00.000Z",
  graphRefreshAge: 0,
  computationDuration: 12,
};

test("blast radius: canonical result has the expected 22 impacted objects", () => {
  const result = computeCanonicalBlastRadius(incident, changes, deterministicOpts);

  assert.equal(result.resultId, deterministicOpts.resultId);
  assert.equal(result.tenantId, incident.tenantId);
  assert.equal(result.incidentId, incident.incidentId);
  assert.equal(result.totalImpactedObjects, 22);
  assert.equal(result.impactedObjects.length, 22);
});

test("blast radius: direct identity impacts are platform-derived from normalized changes", () => {
  const result = computeCanonicalBlastRadius(incident, changes, deterministicOpts);
  const identities = result.impactedObjects.filter((item) => item.category === "Identities");

  assert.equal(identities.length, 12);
  assert.deepEqual(
    identities.map((item) => item.objectId),
    changes.map((change) => change.target.objectId),
  );
  assert.ok(identities.every((item) => item.impactClassification === "direct"));
  assert.ok(identities.every((item) => item.recommendedActionType === "rollback"));
  assert.ok(identities.every((item) => item.recoveryTier === 0));
});

test("blast radius: downstream counts match the canonical fixture contract", () => {
  const result = computeCanonicalBlastRadius(incident, changes, deterministicOpts);
  const counts = countByCategory(result.impactedObjects.map((item) => item.category));

  assert.equal(counts.get("Identities"), 12);
  assert.equal(counts.get("SharePoint"), 3);
  assert.equal(counts.get("Exchange"), 3);
  assert.equal(counts.get("Teams"), 1);
  assert.equal(counts.get("Applications"), 1);
  assert.equal(counts.get("Conditional Access"), 2);
});

test("blast radius: CA validations are tier 1 and data/app follow later tiers", () => {
  const result = computeCanonicalBlastRadius(incident, changes, deterministicOpts);
  const ca = result.impactedObjects.filter((item) => item.category === "Conditional Access");
  const sharePoint = result.impactedObjects.filter((item) => item.category === "SharePoint");
  const apps = result.impactedObjects.filter((item) => item.category === "Applications");

  assert.ok(ca.every((item) => item.recommendedActionType === "validation"));
  assert.ok(ca.every((item) => item.recoveryTier === 1));
  assert.ok(sharePoint.every((item) => item.recoveryTier === 2));
  assert.ok(apps.every((item) => item.recoveryTier === 3));
});

test("blast radius: rejects non-memberAdded changes", () => {
  const bad = [{ ...changes[0]!, changeType: "policyModified" as const }];
  const badIncident: Incident = {
    ...incident,
    rootChangeIds: [bad[0]!.changeId],
  };

  assert.throws(
    () => computeCanonicalBlastRadius(badIncident, bad, deterministicOpts),
    UnsupportedBlastRadiusInputError,
  );
});

function countByCategory(categories: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const category of categories) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}
