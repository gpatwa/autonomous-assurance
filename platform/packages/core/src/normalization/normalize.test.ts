/**
 * Phase 1 ingestion-slice test.
 *
 * Loads the real canonical raw-events fixture (generated from WI-05
 * evidence), runs the normalizer, and compares the result against the
 * canonical normalized-changes fixture byte-for-byte, modulo fields
 * that only a later pass populates (changeId random UUID; bundleId
 * populated by correlation, which does not run in this slice).
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
  createStubSnapshotProvider,
  normalizeRawEvents,
} from "./index.js";

// ─── Fixture loading ───────────────────────────────────────────────────────
// Resolve from the test file's directory so the test works whether run via
// `npm test` at platform root (cwd=platform/) or via `npm test -w @kavachiq/core`
// (cwd=platform/packages/core). Four dirs up from this file lands at platform/.
// tsx emits CJS for this package (no `"type": "module"` in core/package.json),
// so __dirname is defined here.

const FIXTURE_DIR = resolve(
  __dirname,
  "../../../..",
  "fixtures/canonical",
);
const rawEvents = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "raw-events.json"), "utf-8"),
) as RawEvent[];
const expectedNormalized = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "normalized-changes.json"), "utf-8"),
) as NormalizedChange[];

// The test-tenant SP-Execute object ID, from WI-05 / the canonical fixtures.
// Real ingestion resolves this from a per-tenant allowlist; here it is
// hard-coded to the agent SP that produced the canonical events.
const SP_EXECUTE_ID = "bf131def-02b5-4e90-8f32-ec4b3abf96db";

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Strip fields that only a later pipeline stage populates. */
function stripVariableFields(c: NormalizedChange): Omit<NormalizedChange, "changeId" | "bundleId" | "source"> & {
  source: Omit<NormalizedChange["source"], "rawEventIds">;
} {
  const { changeId: _changeId, bundleId: _bundleId, source, ...rest } = c;
  const { rawEventIds: _rawEventIds, ...sourceRest } = source;
  return { ...rest, source: sourceRest };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test("normalizeRawEvents: loads 12 canonical RawEvents", () => {
  assert.equal(rawEvents.length, 12, "fixture must have 12 raw events");
  assert.equal(
    expectedNormalized.length,
    12,
    "fixture must have 12 normalized changes",
  );
});

test("normalizeRawEvents: produces 12 NormalizedChanges, 0 skipped", async () => {
  const { normalized, skipped } = await normalizeRawEvents(rawEvents, {
    tenantId: rawEvents[0]!.tenantId,
    snapshotProvider: createStubSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_EXECUTE_ID]),
  });
  assert.equal(normalized.length, 12);
  assert.equal(skipped.length, 0);
});

test("normalizeRawEvents: output matches canonical fixture (modulo variable IDs)", async () => {
  const { normalized } = await normalizeRawEvents(rawEvents, {
    tenantId: rawEvents[0]!.tenantId,
    snapshotProvider: createStubSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_EXECUTE_ID]),
  });

  // Order must match (both fixtures and normalizer output are sorted by
  // activityDateTime; canonical generator also sorts before emitting).
  for (let i = 0; i < 12; i += 1) {
    const actual = stripVariableFields(normalized[i]!);
    const expected = stripVariableFields(expectedNormalized[i]!);
    assert.deepEqual(
      actual,
      expected,
      `NormalizedChange[${i}] should match fixture byte-for-byte outside of changeId / bundleId / rawEventIds`,
    );
  }
});

test("normalizeRawEvents: bundleId is null in the Phase 1 slice (correlation not run)", async () => {
  const { normalized } = await normalizeRawEvents(rawEvents, {
    tenantId: rawEvents[0]!.tenantId,
    snapshotProvider: createStubSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_EXECUTE_ID]),
  });
  for (const c of normalized) {
    assert.equal(
      c.bundleId,
      null,
      "bundleId must be null — correlation is the next slice, not this one",
    );
  }
});

test("normalizeRawEvents: rawEventIds reference the input RawEvents", async () => {
  const { normalized } = await normalizeRawEvents(rawEvents, {
    tenantId: rawEvents[0]!.tenantId,
    snapshotProvider: createStubSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_EXECUTE_ID]),
  });
  // Each NormalizedChange must reference exactly one RawEvent, and it
  // must be the RawEvent at the same sorted index.
  for (let i = 0; i < 12; i += 1) {
    assert.deepEqual(normalized[i]!.source.rawEventIds, [rawEvents[i]!.rawEventId]);
  }
});

test("normalizeRawEvents: before-state is reconstructed from snapshot, after-state is authoritative from audit", async () => {
  const { normalized } = await normalizeRawEvents(rawEvents, {
    tenantId: rawEvents[0]!.tenantId,
    snapshotProvider: createStubSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_EXECUTE_ID]),
  });
  for (const c of normalized) {
    assert.equal(c.beforeState?.confidence, "reconstructed");
    assert.equal(c.beforeState?.captureSource, "snapshot-diff");
    assert.equal(c.afterState.confidence, "authoritative");
    assert.equal(c.afterState.captureSource, "entra-audit");
    assert.equal(c.confidence.level, "high");
    assert.deepEqual(c.confidence.missingFields, ["authoritative-before-state"]);
  }
});

test("normalizeRawEvents: actor is agent-identified SP-Execute; selfAction=false", async () => {
  const { normalized } = await normalizeRawEvents(rawEvents, {
    tenantId: rawEvents[0]!.tenantId,
    snapshotProvider: createStubSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_EXECUTE_ID]),
  });
  for (const c of normalized) {
    assert.equal(c.actor.type, "service-principal");
    assert.equal(c.actor.id, SP_EXECUTE_ID);
    assert.equal(c.actor.agentIdentified, true);
    assert.equal(c.selfAction, false);
  }
});

test("normalizeRawEvents: correlationHints.operationBatchId is null (WI-05 §23.E)", async () => {
  const { normalized } = await normalizeRawEvents(rawEvents, {
    tenantId: rawEvents[0]!.tenantId,
    snapshotProvider: createStubSnapshotProvider(),
    agentIdentifiedActorIds: new Set([SP_EXECUTE_ID]),
  });
  for (const c of normalized) {
    assert.equal(
      c.correlationHints.operationBatchId,
      null,
      "no reliable Microsoft batch correlation for member-adds",
    );
  }
});
