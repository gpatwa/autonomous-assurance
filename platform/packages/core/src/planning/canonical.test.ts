import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Incident, NormalizedChange } from "@kavachiq/schema";
import { computeCanonicalBlastRadius } from "../blast-radius/index.js";
import {
  generateCanonicalRecoveryPlan,
  UnsupportedPlanningInputError,
} from "./index.js";

const FIXTURE_DIR = resolve(__dirname, "../../../..", "fixtures/canonical");
const incident = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "incident.json"), "utf-8"),
) as Incident;
const changes = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "normalized-changes.json"), "utf-8"),
) as NormalizedChange[];

const blastRadius = computeCanonicalBlastRadius(incident, changes, {
  resultId: "br_fixed-id-for-planning-tests",
  computedAt: "2026-04-17T07:41:00.000Z",
});

const deterministicOpts = {
  planId: "plan_fixed-id-for-tests",
  version: 1,
  baselineVersionId: 7,
  generatedAt: "2026-04-17T07:42:00.000Z",
  newStepId: (slug: string, order: number) => `step_${order}_${slug}`,
};

test("planning: canonical plan has 8 ordered steps", () => {
  const plan = generateCanonicalRecoveryPlan(blastRadius, deterministicOpts);

  assert.equal(plan.planId, deterministicOpts.planId);
  assert.equal(plan.tenantId, incident.tenantId);
  assert.equal(plan.incidentId, incident.incidentId);
  assert.equal(plan.version, 1);
  assert.equal(plan.baselineVersionId, 7);
  assert.equal(plan.status, "pending-approval");
  assert.equal(plan.steps.length, 8);
  assert.deepEqual(plan.steps.map((step) => step.order), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("planning: step 1 is the only system-write rollback and requires approval", () => {
  const plan = generateCanonicalRecoveryPlan(blastRadius, deterministicOpts);
  const step = plan.steps[0]!;

  assert.equal(step.actionType, "rollback");
  assert.equal(step.targetObjectType, "group");
  assert.equal(step.targetObjectName, "Finance-Privileged-Access");
  assert.equal(step.executionMode, "system");
  assert.equal(step.approvalRequired, true);
  assert.equal(step.status, "pending-approval");
  assert.equal(step.dependsOn.length, 0);
  assert.equal(step.targetState.state.expectedMemberCountAfterRollback, 4);
  assert.equal(step.currentStateAtPlan.state.incidentAddedMemberCount, 12);
});

test("planning: CA validation steps depend on identity rollback and do not require approval", () => {
  const plan = generateCanonicalRecoveryPlan(blastRadius, deterministicOpts);
  const identityStep = plan.steps[0]!;
  const caSteps = plan.steps.filter((step) => step.tier === 1);

  assert.equal(caSteps.length, 2);
  assert.ok(caSteps.every((step) => step.actionType === "validation"));
  assert.ok(caSteps.every((step) => step.executionMode === "system"));
  assert.ok(caSteps.every((step) => step.approvalRequired === false));
  assert.ok(caSteps.every((step) => step.dependsOn.includes(identityStep.stepId)));
});

test("planning: downstream data steps are recommendation-only except manual app validation", () => {
  const plan = generateCanonicalRecoveryPlan(blastRadius, deterministicOpts);
  const byOrder = new Map(plan.steps.map((step) => [step.order, step]));

  assert.equal(byOrder.get(4)?.executionMode, "recommendation-only");
  assert.equal(byOrder.get(5)?.executionMode, "recommendation-only");
  assert.equal(byOrder.get(6)?.executionMode, "recommendation-only");
  assert.equal(byOrder.get(7)?.executionMode, "manual");
  assert.equal(byOrder.get(7)?.approvalRequired, true);
});

test("planning: final trusted-state declaration depends on every prior step", () => {
  const plan = generateCanonicalRecoveryPlan(blastRadius, deterministicOpts);
  const final = plan.steps[7]!;

  assert.equal(final.tier, 4);
  assert.equal(final.executionMode, "manual");
  assert.equal(final.approvalRequired, true);
  assert.deepEqual(final.dependsOn, plan.steps.slice(0, 7).map((step) => step.stepId));
});

test("planning: rejects blast radius without full canonical identity impact", () => {
  const bad = {
    ...blastRadius,
    impactedObjects: blastRadius.impactedObjects.filter(
      (item) => item.category !== "Identities" || item.objectId !== changes[0]!.target.objectId,
    ),
  };

  assert.throws(
    () => generateCanonicalRecoveryPlan(bad, deterministicOpts),
    UnsupportedPlanningInputError,
  );
});
