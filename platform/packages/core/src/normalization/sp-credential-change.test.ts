/**
 * Phase 1 M4 (SP credential) normalization-slice test.
 *
 * Loads the real canonical M4 RawEvent fixtures derived from the two
 * high-signal WI-05 events captured in `platform/wi05/raw-events.json`:
 *   ADD:    Directory_e03bcb0a-1ddc-464c-8b06-ae1925455351_JL2EI_22074709
 *   REMOVE: Directory_9c774394-f42a-4e95-a05d-ea3da13d89ad_2OLP4_35211402
 *
 * WI-05 §4.4: both sides are audit-authoritative. The `KeyDescription`
 * modifiedProperty carries the complete credential metadata before AND
 * after the change as a double-JSON-encoded array string. `secretText`
 * is intentionally absent from audit events and is NEVER stored.
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
  mapSpCredentialChangeEvent,
  normalizeRawEvents,
} from "./index.js";

// ─── Fixture loading ──────────────────────────────────────────────────────

const ADD_DIR = resolve(__dirname, "../../../..", "fixtures/canonical/sp-credential-add");
const REMOVE_DIR = resolve(__dirname, "../../../..", "fixtures/canonical/sp-credential-remove");

const rawEventAdd = JSON.parse(
  readFileSync(resolve(ADD_DIR, "raw-event.json"), "utf-8"),
) as RawEvent;
const expectedAdd = JSON.parse(
  readFileSync(resolve(ADD_DIR, "normalized-change.json"), "utf-8"),
) as NormalizedChange;

const rawEventRemove = JSON.parse(
  readFileSync(resolve(REMOVE_DIR, "raw-event.json"), "utf-8"),
) as RawEvent;
const expectedRemove = JSON.parse(
  readFileSync(resolve(REMOVE_DIR, "normalized-change.json"), "utf-8"),
) as NormalizedChange;

const TENANT_ID = "3725cec5-3e2d-402c-a5a6-460c325d8f87";
const SP_SETUP_ID = "5b459613-2158-484f-a28a-61fd04b1b595";
const APP_ID = "14579378-8d77-4b37-af78-baf5db8269d9";
const KEY_IDENTIFIER = "c7890f61-2f17-478f-bc60-60fd19c09588";

// agentIdentifiedActorIds matches the canonical test scenario (SP-Setup is agent-identified).
const AGENT_IDS = new Set([SP_SETUP_ID]);

// ─── Helpers ──────────────────────────────────────────────────────────────

function stripVariableFields(c: NormalizedChange): Omit<NormalizedChange, "changeId" | "bundleId" | "source"> & {
  source: Omit<NormalizedChange["source"], "rawEventIds">;
} {
  const { changeId: _changeId, bundleId: _bundleId, source, ...rest } = c;
  const { rawEventIds: _rawEventIds, ...sourceRest } = source;
  return { ...rest, source: sourceRest };
}

// ─── ADD event tests ──────────────────────────────────────────────────────

test("sp-credential-add: fixture loads", () => {
  const payload = rawEventAdd.rawPayload as { activityDisplayName?: string };
  assert.ok(
    payload.activityDisplayName?.includes("Certificates and secrets management"),
    "activityDisplayName should contain 'Certificates and secrets management'",
  );
  assert.equal(expectedAdd.changeType, "credentialAdded");
});

test("sp-credential-add: mapper output matches canonical fixture (modulo changeId / bundleId / rawEventIds)", () => {
  const produced = mapSpCredentialChangeEvent(rawEventAdd, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_add_stable_test_id",
    bundleIdFor: () => null,
  });
  assert.deepEqual(
    stripVariableFields(produced),
    stripVariableFields(expectedAdd),
    "ADD NormalizedChange should match the fixture outside of changeId/bundleId/rawEventIds",
  );
});

test("sp-credential-add: changeType is credentialAdded (newValue has keys, oldValue is empty)", () => {
  const produced = mapSpCredentialChangeEvent(rawEventAdd, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_add_stable_test_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.changeType, "credentialAdded");
});

test("sp-credential-add: beforeState is authoritative with empty credentials (oldValue was [])", () => {
  const produced = mapSpCredentialChangeEvent(rawEventAdd, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_add_stable_test_id",
    bundleIdFor: () => null,
  });
  const before = produced.beforeState!;
  assert.equal(before.confidence, "authoritative");
  assert.equal(before.captureSource, "entra-audit");
  const state = before.state as { credentials: unknown[] };
  assert.deepEqual(state.credentials, [], "before-state credentials must be empty for an ADD event");
});

test("sp-credential-add: afterState is authoritative with the newly-added credential", () => {
  const produced = mapSpCredentialChangeEvent(rawEventAdd, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_add_stable_test_id",
    bundleIdFor: () => null,
  });
  const after = produced.afterState;
  assert.equal(after.confidence, "authoritative");
  assert.equal(after.captureSource, "entra-audit");
  const state = after.state as {
    applicationId: string;
    credentials: Array<{ keyIdentifier: string; keyType: string; keyUsage: string; displayName: string }>;
  };
  assert.equal(state.applicationId, APP_ID);
  assert.equal(state.credentials.length, 1);
  const cred = state.credentials[0]!;
  assert.equal(cred.keyIdentifier, KEY_IDENTIFIER);
  assert.equal(cred.keyType, "Password");
  assert.equal(cred.keyUsage, "Verify");
  assert.equal(cred.displayName, "kavachiq-wi05-spike");
  // WI-05 §4.4: secretText is intentionally absent — must never appear in output.
  assert.ok(!("secretText" in cred), "secretText must not appear in credential output");
});

test("sp-credential-add: beforeState and afterState hashes differ", () => {
  const produced = mapSpCredentialChangeEvent(rawEventAdd, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_add_stable_test_id",
    bundleIdFor: () => null,
  });
  assert.notEqual(produced.beforeState!.stateHash, produced.afterState.stateHash);
});

test("sp-credential-add: confidence block has high level and missingFields: [secretText]", () => {
  const produced = mapSpCredentialChangeEvent(rawEventAdd, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_add_stable_test_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.confidence.level, "high");
  assert.ok(produced.confidence.reasons.includes("authoritative-before-state-from-audit-oldValue"));
  assert.ok(produced.confidence.reasons.includes("authoritative-after-state-from-audit-newValue"));
  // secretText is legitimately absent from audit events — not a data-quality gap.
  assert.deepEqual(produced.confidence.missingFields, ["secretText"]);
});

test("sp-credential-add: actor is SP-Setup (agent-identified service principal)", () => {
  const produced = mapSpCredentialChangeEvent(rawEventAdd, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_add_stable_test_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.actor.type, "service-principal");
  assert.equal(produced.actor.id, SP_SETUP_ID);
  assert.equal(produced.actor.displayName, "SP-Setup");
  assert.equal(produced.actor.agentIdentified, true);
});

// ─── REMOVE event tests ───────────────────────────────────────────────────

test("sp-credential-remove: changeType is credentialRemoved (newValue is [], oldValue has keys)", () => {
  const produced = mapSpCredentialChangeEvent(rawEventRemove, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_remove_stable_test_id",
    bundleIdFor: () => null,
  });
  assert.equal(produced.changeType, "credentialRemoved");
});

test("sp-credential-remove: beforeState has the removed credential, afterState is empty", () => {
  const produced = mapSpCredentialChangeEvent(rawEventRemove, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_remove_stable_test_id",
    bundleIdFor: () => null,
  });
  const before = produced.beforeState!.state as { credentials: Array<{ keyIdentifier: string }> };
  const after = produced.afterState.state as { credentials: unknown[] };
  assert.equal(before.credentials.length, 1);
  assert.equal(before.credentials[0]!.keyIdentifier, KEY_IDENTIFIER);
  assert.deepEqual(after.credentials, []);
});

test("sp-credential-remove: mapper output matches canonical fixture (modulo changeId / bundleId / rawEventIds)", () => {
  const produced = mapSpCredentialChangeEvent(rawEventRemove, {
    tenantId: TENANT_ID,
    agentIdentifiedActorIds: AGENT_IDS,
    newChangeId: () => "chg_m4_remove_stable_test_id",
    bundleIdFor: () => null,
  });
  assert.deepEqual(
    stripVariableFields(produced),
    stripVariableFields(expectedRemove),
    "REMOVE NormalizedChange should match the fixture outside of changeId/bundleId/rawEventIds",
  );
});

// ─── Integration via the top-level normalizer ─────────────────────────────

test("normalizeRawEvents: SP-credential ADD flows through top-level normalizer without being skipped", async () => {
  const { normalized, skipped } = await normalizeRawEvents([rawEventAdd], {
    tenantId: TENANT_ID,
    snapshotProvider: createFilesystemSnapshotProvider({
      rootDir: resolve(__dirname, "../../../..", "fixtures/canonical/baselines"),
    }),
    agentIdentifiedActorIds: AGENT_IDS,
  });
  assert.equal(normalized.length, 1);
  assert.equal(skipped.length, 0);
  assert.equal(normalized[0]!.changeType, "credentialAdded");
  assert.equal(normalized[0]!.target.objectType, "application");
});
