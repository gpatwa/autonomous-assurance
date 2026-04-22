/**
 * Phase 1 CA-normalization slice test.
 *
 * Loads the real canonical CA RawEvent fixture (derived from the single
 * `Update conditional access policy` event captured in WI-05 —
 * `IPCGraph_e442af57-2eaf-4478-8afa-901c4cf0464d_7G376_5282903`) and
 * asserts the mapper produces a NormalizedChange matching the canonical
 * `normalized-change.json` fixture byte-for-byte modulo fields that
 * later pipeline stages populate (`changeId`, `bundleId`, `rawEventIds`).
 *
 * The canonical expectation here is WI-05 §4.2: both `beforeState` and
 * `afterState` are authoritative and come from the audit event itself
 * (no snapshot required).
 *
 * Run from platform/ root:
 *   npm test --workspace=@kavachiq/core
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NormalizedChange, RawEvent } from "@kavachiq/schema";
import {
  mapCaPolicyUpdateEvent,
  normalizeRawEvents,
  createFilesystemSnapshotProvider,
} from "./index.js";

// ─── Fixture loading ──────────────────────────────────────────────────────

const FIXTURE_DIR = resolve(
  __dirname,
  "../../../..",
  "fixtures/canonical/ca-policy-update",
);
const rawEvent = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "raw-event.json"), "utf-8"),
) as RawEvent;
const expectedNormalized = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "normalized-change.json"), "utf-8"),
) as NormalizedChange;

const CA_POLICY_ID = "62eb2eec-6157-45f4-abb5-21b2d85b4e29";
const CA_POLICY_DISPLAY_NAME = "Finance-MFA-Bypass";
const OPERATOR_USER_ID = "cdd19489-8aee-4264-ac7d-ed544d97d343";

// ─── Helpers ──────────────────────────────────────────────────────────────

function stripVariableFields(c: NormalizedChange): Omit<NormalizedChange, "changeId" | "bundleId" | "source"> & {
  source: Omit<NormalizedChange["source"], "rawEventIds">;
} {
  const { changeId: _changeId, bundleId: _bundleId, source, ...rest } = c;
  const { rawEventIds: _rawEventIds, ...sourceRest } = source;
  return { ...rest, source: sourceRest };
}

// ─── Mapper-level tests ───────────────────────────────────────────────────

test("ca-policy-update: fixture loads", () => {
  const payload = rawEvent.rawPayload as { activityDisplayName?: string };
  assert.equal(payload.activityDisplayName, "Update conditional access policy");
  assert.equal(expectedNormalized.changeType, "policyModified");
});

test("ca-policy-update: mapper output matches canonical fixture (modulo changeId / bundleId / rawEventIds)", () => {
  const produced = mapCaPolicyUpdateEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    newChangeId: () => "chg_ca_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.deepEqual(
    stripVariableFields(produced),
    stripVariableFields(expectedNormalized),
    "CA NormalizedChange should match the fixture outside of changeId/bundleId/rawEventIds",
  );
});

test("ca-policy-update: beforeState authoritative from audit oldValue", () => {
  const produced = mapCaPolicyUpdateEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    newChangeId: () => "chg_ca_test_stable_id",
    bundleIdFor: () => null,
  });
  const before = produced.beforeState!;
  assert.equal(before.confidence, "authoritative");
  assert.equal(before.captureSource, "entra-audit");
  const state = before.state as {
    policyId: string;
    policyDisplayName: string;
    auditPolicyJson: Record<string, unknown>;
  };
  assert.equal(state.policyId, CA_POLICY_ID);
  assert.equal(state.policyDisplayName, CA_POLICY_DISPLAY_NAME);
  // WI-05 §4.2: oldValue carries the complete pre-edit policy JSON.
  assert.equal(state.auditPolicyJson.id, CA_POLICY_ID);
  assert.equal(state.auditPolicyJson.state, "enabledForReportingButNotEnforced");
  // Before-state predates the locations condition — that's the delta this
  // edit introduced.
  const conditions = state.auditPolicyJson.conditions as Record<string, unknown>;
  assert.equal(
    conditions.locations,
    undefined,
    "pre-edit policy does not contain a locations condition",
  );
});

test("ca-policy-update: afterState authoritative from audit newValue", () => {
  const produced = mapCaPolicyUpdateEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    newChangeId: () => "chg_ca_test_stable_id",
    bundleIdFor: () => null,
  });
  const after = produced.afterState;
  assert.equal(after.confidence, "authoritative");
  assert.equal(after.captureSource, "entra-audit");
  const state = after.state as {
    auditPolicyJson: { conditions: { locations?: unknown }; modifiedDateTime?: string };
  };
  // WI-05 observed: the edit adds a `locations` condition (All) and sets
  // `modifiedDateTime`. Confirming both show up exactly once.
  assert.ok(
    state.auditPolicyJson.conditions.locations,
    "post-edit policy includes the newly-added locations condition",
  );
  assert.equal(
    state.auditPolicyJson.modifiedDateTime,
    "2026-04-18T05:35:31.2097538+00:00",
  );
});

test("ca-policy-update: beforeState and afterState hashes differ (real policy delta)", () => {
  const produced = mapCaPolicyUpdateEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    newChangeId: () => "chg_ca_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.notEqual(
    produced.beforeState!.stateHash,
    produced.afterState.stateHash,
    "the canonical WI-05 edit changes the policy JSON — hashes must not match",
  );
});

test("ca-policy-update: confidence block records both-sides-authoritative and no missingFields", () => {
  const produced = mapCaPolicyUpdateEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    newChangeId: () => "chg_ca_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.confidence.level, "high");
  assert.ok(
    produced.confidence.reasons.includes("authoritative-before-state-from-audit-oldValue"),
  );
  assert.ok(
    produced.confidence.reasons.includes("authoritative-after-state-from-audit-newValue"),
  );
  assert.deepEqual(produced.confidence.missingFields, []);
});

test("ca-policy-update: actor is the portal-operator user (not a service principal)", () => {
  const produced = mapCaPolicyUpdateEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    newChangeId: () => "chg_ca_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.actor.type, "user");
  assert.equal(produced.actor.id, OPERATOR_USER_ID);
  assert.equal(
    produced.actor.agentIdentified,
    false,
    "portal-initiated edits are never agent-identified (WI-05 §4.2: agentType=notAgentic)",
  );
});

test("ca-policy-update: target is a conditional-access-policy object", () => {
  const produced = mapCaPolicyUpdateEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    newChangeId: () => "chg_ca_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.target.objectType, "conditionalAccessPolicy");
  assert.equal(produced.target.objectId, CA_POLICY_ID);
  assert.equal(produced.target.externalId, CA_POLICY_ID);
  assert.equal(produced.target.displayName, CA_POLICY_DISPLAY_NAME);
});

// ─── Integration via the top-level normalizer ─────────────────────────────
// Confirms the discriminator → mapper wiring works end-to-end.

test("normalizeRawEvents: CA event flows through top-level normalizer without being skipped", async () => {
  const { normalized, skipped } = await normalizeRawEvents([rawEvent], {
    tenantId: rawEvent.tenantId,
    // The CA mapper does not use a snapshot provider, but the top-level
    // normalize function requires one. Pass a filesystem provider rooted
    // at a path that won't be read (no group-membership events here).
    snapshotProvider: createFilesystemSnapshotProvider({
      rootDir: resolve(__dirname, "../../../..", "fixtures/canonical/baselines"),
    }),
    agentIdentifiedActorIds: new Set(),
  });
  assert.equal(normalized.length, 1);
  assert.equal(skipped.length, 0);
  assert.equal(normalized[0]!.changeType, "policyModified");
  assert.equal(normalized[0]!.target.objectType, "conditionalAccessPolicy");
});
