/**
 * Phase 1 M3 (app-role-assignment) normalization-slice test.
 *
 * Loads the real canonical M3 RawEvent fixture (derived from the single
 * `Add app role assignment grant to user` event captured in WI-05 —
 * `Directory_74c794fb-6e3f-4f04-848c-3fd432db28f1_425JC_33677233`) and
 * asserts the mapper produces a NormalizedChange matching the canonical
 * `normalized-change.json` fixture byte-for-byte modulo fields that
 * later pipeline stages populate (`changeId`, `bundleId`,
 * `rawEventIds`).
 *
 * WI-05 §4.3 / §7: same shape as M1 — rich `newValue`, no `oldValue`.
 * Before-state is snapshot-reconstructed; after-state is
 * audit-authoritative. This test demonstrates both via the real
 * filesystem snapshot provider rooted at
 * `platform/fixtures/canonical/baselines/`.
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
  createFilesystemSnapshotProvider,
  mapAppRoleAssignmentAddEvent,
  normalizeRawEvents,
  type SnapshotProvider,
} from "./index.js";

// ─── Fixture loading ──────────────────────────────────────────────────────

const FIXTURE_DIR = resolve(
  __dirname,
  "../../../..",
  "fixtures/canonical/app-role-assignment-add",
);
const BASELINE_ROOT = resolve(
  __dirname,
  "../../../..",
  "fixtures/canonical/baselines",
);
const rawEvent = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "raw-event.json"), "utf-8"),
) as RawEvent;
const expectedNormalized = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "normalized-change.json"), "utf-8"),
) as NormalizedChange;

const SP_TARGET_ID = "cb9d0b62-9b5a-4614-8e0f-cb73f57f23b0"; // KavachiqTest-App-01
const SP_SETUP_ACTOR_ID = "5b459613-2158-484f-a28a-61fd04b1b595";
const DEFAULT_ACCESS_ROLE_ID = "00000000-0000-0000-0000-000000000000";
const PRINCIPAL_USER_ID = "82238b1d-1f1f-478d-b8db-76314cdeaae9"; // kq-test-17

// ─── Helpers ──────────────────────────────────────────────────────────────

function newSnapshotProvider(): SnapshotProvider {
  return createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
}

function stripVariableFields(c: NormalizedChange): Omit<NormalizedChange, "changeId" | "bundleId" | "source"> & {
  source: Omit<NormalizedChange["source"], "rawEventIds">;
} {
  const { changeId: _changeId, bundleId: _bundleId, source, ...rest } = c;
  const { rawEventIds: _rawEventIds, ...sourceRest } = source;
  return { ...rest, source: sourceRest };
}

// ─── Tests ────────────────────────────────────────────────────────────────

test("app-role-assignment: fixture loads", () => {
  const payload = rawEvent.rawPayload as { activityDisplayName?: string };
  assert.equal(payload.activityDisplayName, "Add app role assignment grant to user");
  assert.equal(expectedNormalized.changeType, "assignmentAdded");
});

test("app-role-assignment: mapper output matches canonical fixture (modulo changeId / bundleId / rawEventIds)", async () => {
  const produced = await mapAppRoleAssignmentAddEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    snapshotProvider: newSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_SETUP_ACTOR_ID]),
    newChangeId: () => "chg_m3_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.deepEqual(
    stripVariableFields(produced),
    stripVariableFields(expectedNormalized),
    "M3 NormalizedChange should match the fixture outside of changeId/bundleId/rawEventIds",
  );
});

test("app-role-assignment: beforeState reconstructed from snapshot (isAssigned=false, canonical baseline empty)", async () => {
  const produced = await mapAppRoleAssignmentAddEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    snapshotProvider: newSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_SETUP_ACTOR_ID]),
    newChangeId: () => "chg_m3_test_stable_id",
    bundleIdFor: () => null,
  });
  const before = produced.beforeState!;
  assert.equal(before.confidence, "reconstructed");
  assert.equal(before.captureSource, "snapshot-diff");
  const state = before.state as {
    servicePrincipalId: string;
    appRoleId: string;
    principalId: string;
    principalType: string;
    isAssigned: boolean;
  };
  assert.equal(state.isAssigned, false, "WI-05 set up a fresh SP; no prior assignment");
  assert.equal(state.servicePrincipalId, SP_TARGET_ID);
  assert.equal(state.appRoleId, DEFAULT_ACCESS_ROLE_ID);
  assert.equal(state.principalId, PRINCIPAL_USER_ID);
  assert.equal(state.principalType, "User");
});

test("app-role-assignment: afterState authoritative from audit newValue", async () => {
  const produced = await mapAppRoleAssignmentAddEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    snapshotProvider: newSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_SETUP_ACTOR_ID]),
    newChangeId: () => "chg_m3_test_stable_id",
    bundleIdFor: () => null,
  });
  const after = produced.afterState;
  assert.equal(after.confidence, "authoritative");
  assert.equal(after.captureSource, "entra-audit");
  const state = after.state as {
    isAssigned: boolean;
    appRoleId: string;
    principalDisplayName: string;
    auditNewValues: Record<string, string | null>;
  };
  assert.equal(state.isAssigned, true);
  assert.equal(state.appRoleId, DEFAULT_ACCESS_ROLE_ID);
  assert.equal(state.principalDisplayName, "kq-test-17@patwainc.onmicrosoft.com");
  // WI-05 §4.3: all 9 modifiedProperty fields populated, even when the
  // role itself is the default-access role (AppRole.Value/DisplayName are
  // legitimately empty strings for that role, not missing).
  const av = state.auditNewValues;
  assert.equal(av["AppRole.Id"], DEFAULT_ACCESS_ROLE_ID);
  assert.equal(av["AppRole.Value"], "");
  assert.equal(av["AppRole.DisplayName"], "");
  assert.equal(av["User.ObjectID"], PRINCIPAL_USER_ID);
  assert.equal(av["User.UPN"], "kq-test-17@patwainc.onmicrosoft.com");
});

test("app-role-assignment: overall confidence records reconstructed-before / authoritative-after split", async () => {
  const produced = await mapAppRoleAssignmentAddEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    snapshotProvider: newSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_SETUP_ACTOR_ID]),
    newChangeId: () => "chg_m3_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.confidence.level, "high");
  assert.deepEqual(produced.confidence.missingFields, ["authoritative-before-state"]);
  assert.ok(
    produced.confidence.reasons.some((r) => r.startsWith("reconstructed-before-state-from-snapshot")),
  );
  assert.ok(
    produced.confidence.reasons.includes("authoritative-after-state-from-audit-newValue"),
  );
});

test("app-role-assignment: actor is SP-Setup (service-principal), agent-identified via allowlist", async () => {
  const produced = await mapAppRoleAssignmentAddEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    snapshotProvider: newSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_SETUP_ACTOR_ID]),
    newChangeId: () => "chg_m3_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.actor.type, "service-principal");
  assert.equal(produced.actor.id, SP_SETUP_ACTOR_ID);
  assert.equal(produced.actor.agentIdentified, true);
});

test("app-role-assignment: target is a servicePrincipal (the app), not the user", async () => {
  const produced = await mapAppRoleAssignmentAddEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    snapshotProvider: newSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_SETUP_ACTOR_ID]),
    newChangeId: () => "chg_m3_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.target.objectType, "servicePrincipal");
  assert.equal(produced.target.objectId, SP_TARGET_ID);
  assert.equal(produced.target.externalId, SP_TARGET_ID);
  assert.equal(produced.target.displayName, "KavachiqTest-App-01");
});

test("app-role-assignment: changeType is assignmentAdded", async () => {
  const produced = await mapAppRoleAssignmentAddEvent(rawEvent, {
    tenantId: rawEvent.tenantId,
    snapshotProvider: newSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_SETUP_ACTOR_ID]),
    newChangeId: () => "chg_m3_test_stable_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.changeType, "assignmentAdded");
});

// ─── Non-trivial before-state: isAssigned=true (idempotent re-grant) ──────
// Exercises the reconstructed before-state path end-to-end through the
// mapper, against a baseline that already lists the principal as assigned
// to the target role on the target SP.

test("app-role-assignment: idempotent re-grant → beforeState.isAssigned=true when baseline already lists the assignment", async () => {
  // Synthesize a RawEvent by retargeting the canonical event at the
  // synthetic pre-assigned SP (id ends in …098; kq-test-17 is already
  // assigned there per fixtures/canonical/baselines).
  const retargeted = retargetEventToSp(rawEvent, {
    spId: "00000000-0000-0000-0000-000000000098",
    spDisplayName: "Synthetic-Pre-Assigned-App",
  });

  const produced = await mapAppRoleAssignmentAddEvent(retargeted, {
    tenantId: rawEvent.tenantId,
    snapshotProvider: newSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_SETUP_ACTOR_ID]),
    newChangeId: () => "chg_m3_reassign_stable_id",
    bundleIdFor: () => null,
  });

  const beforeState = produced.beforeState!.state as {
    isAssigned: boolean;
    servicePrincipalId: string;
  };
  assert.equal(
    beforeState.isAssigned,
    true,
    "baseline lists (appRoleId=default-access, principalId=kq-test-17) on this SP",
  );
  assert.equal(beforeState.servicePrincipalId, "00000000-0000-0000-0000-000000000098");
  assert.equal(produced.beforeState!.confidence, "reconstructed");
  // After-state still derives from audit newValue and says isAssigned=true.
  assert.equal((produced.afterState.state as { isAssigned: boolean }).isAssigned, true);
});

// ─── Integration via the top-level normalizer ─────────────────────────────

test("normalizeRawEvents: M3 event flows through top-level normalizer without being skipped", async () => {
  const { normalized, skipped } = await normalizeRawEvents([rawEvent], {
    tenantId: rawEvent.tenantId,
    snapshotProvider: newSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_SETUP_ACTOR_ID]),
  });
  assert.equal(normalized.length, 1);
  assert.equal(skipped.length, 0);
  assert.equal(normalized[0]!.changeType, "assignmentAdded");
  assert.equal(normalized[0]!.target.objectType, "servicePrincipal");
});

// ─── Synthesis helper ──────────────────────────────────────────────────────

/** Clone a RawEvent and rewrite its SP target id + displayName. */
function retargetEventToSp(
  source: RawEvent,
  target: { spId: string; spDisplayName: string },
): RawEvent {
  const payload = source.rawPayload as Record<string, unknown>;
  const targetResources = (payload.targetResources as Array<Record<string, unknown>>).map(
    (tr) => {
      if (tr.type !== "ServicePrincipal") return tr;
      return { ...tr, id: target.spId, displayName: target.spDisplayName };
    },
  );
  return {
    ...source,
    rawEventId: `raw_synthetic_m3_${target.spId}`,
    rawPayload: { ...payload, targetResources },
    normalizedChangeIds: [],
  };
}
