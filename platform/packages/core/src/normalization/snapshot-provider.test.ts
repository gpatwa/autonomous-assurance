/**
 * Filesystem snapshot-provider tests.
 *
 * Exercises the real baseline adapter against
 * `platform/fixtures/canonical/baselines/`. Covers:
 *   Group membership (M1):
 *     - isMember: false (canonical privileged group — empty member set)
 *     - isMember: true  (synthetic pre-member group — idempotent re-add path)
 *     - missing / too-new / mismatched baseline errors
 *     - per-(tenant, group) cache
 *   App-role assignment (M3):
 *     - isAssigned: false (canonical target SP — no prior assignment)
 *     - isAssigned: true  (synthetic pre-assigned app — idempotent re-grant path)
 *     - missing baseline file → BaselineNotFoundError (subjectKind tag)
 *
 * Run from platform/ root:
 *   npm test --workspace=@kavachiq/core
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  BaselineMismatchError,
  BaselineNotFoundError,
  BaselineTooNewError,
  createFilesystemSnapshotProvider,
  sha256,
} from "./index.js";

// ─── Fixture roots ────────────────────────────────────────────────────────

const BASELINE_ROOT = resolve(
  __dirname,
  "../../../..",
  "fixtures/canonical/baselines",
);

const TENANT_ID = "3725cec5-3e2d-402c-a5a6-460c325d8f87";
const PRIVILEGED_GROUP_ID = "45a4b187-c7c6-422a-b82b-48e199f63bb3";
const PRE_MEMBER_GROUP_ID = "00000000-0000-0000-0000-000000000099";
const KQ_TEST_05_USER_ID = "af81a798-4a5a-41ff-bd5b-6ff594d6ceef";
const UNKNOWN_USER_ID = "99999999-9999-9999-9999-999999999999";

// ─── Happy path: isMember false (canonical) ──────────────────────────────

test("snapshot-provider: canonical privileged group → isMember=false for every kq-test user", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  const snap = await provider.getGroupMembershipBefore({
    tenantId: TENANT_ID,
    groupId: PRIVILEGED_GROUP_ID,
    groupDisplayName: "Finance-Privileged-Access",
    userId: KQ_TEST_05_USER_ID,
    asOf: "2026-04-17T07:40:50.1190533Z",
  });
  assert.equal(snap.confidence, "reconstructed");
  assert.equal(snap.captureSource, "snapshot-diff");
  assert.equal(snap.capturedAt, "2026-04-17T07:40:50.1190533Z"); // tracks asOf, not baseline capture time
  assert.deepEqual(snap.state, {
    groupId: PRIVILEGED_GROUP_ID,
    groupDisplayName: "Finance-Privileged-Access",
    userId: KQ_TEST_05_USER_ID,
    isMember: false,
  });
});

test("snapshot-provider: canonical stateHash for isMember=false matches canonical fixture byte-for-byte", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  const snap = await provider.getGroupMembershipBefore({
    tenantId: TENANT_ID,
    groupId: PRIVILEGED_GROUP_ID,
    groupDisplayName: "Finance-Privileged-Access",
    userId: KQ_TEST_05_USER_ID,
    asOf: "2026-04-17T07:40:50.1190533Z",
  });
  // This hash is what appears in platform/fixtures/canonical/normalized-changes.json
  // for the first event's beforeState; unchanged semantics must preserve it.
  assert.equal(
    snap.stateHash,
    "02aeb8dbc23699553f499f25d996e6f8a6b7edc9d8ccb4922f85f0a394164428",
  );
});

// ─── Non-trivial path: isMember true (idempotent re-add) ─────────────────

test("snapshot-provider: synthetic pre-member group → isMember=true for a known prior member", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  const snap = await provider.getGroupMembershipBefore({
    tenantId: TENANT_ID,
    groupId: PRE_MEMBER_GROUP_ID,
    groupDisplayName: "Synthetic-Pre-Member-Group",
    userId: KQ_TEST_05_USER_ID, // listed in memberUserIds for this group
    asOf: "2026-04-17T08:00:00.000Z",
  });
  assert.equal(snap.state.isMember, true);
  assert.equal(snap.confidence, "reconstructed");
  assert.equal(snap.captureSource, "snapshot-diff");
  // Hash independently computed for the isMember=true state shape.
  const expected = sha256(
    JSON.stringify({
      groupId: PRE_MEMBER_GROUP_ID,
      groupDisplayName: "Synthetic-Pre-Member-Group",
      userId: KQ_TEST_05_USER_ID,
      isMember: true,
    }),
  );
  assert.equal(snap.stateHash, expected);
});

test("snapshot-provider: synthetic pre-member group → isMember=false for a user NOT in the baseline", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  const snap = await provider.getGroupMembershipBefore({
    tenantId: TENANT_ID,
    groupId: PRE_MEMBER_GROUP_ID,
    groupDisplayName: "Synthetic-Pre-Member-Group",
    userId: UNKNOWN_USER_ID,
    asOf: "2026-04-17T08:00:00.000Z",
  });
  assert.equal(snap.state.isMember, false);
});

// ─── Applicability errors ────────────────────────────────────────────────

test("snapshot-provider: missing baseline file throws BaselineNotFoundError", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  await assert.rejects(
    () =>
      provider.getGroupMembershipBefore({
        tenantId: TENANT_ID,
        groupId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        groupDisplayName: "Does-Not-Exist",
        userId: KQ_TEST_05_USER_ID,
        asOf: "2026-04-17T08:00:00.000Z",
      }),
    BaselineNotFoundError,
  );
});

test("snapshot-provider: asOf before capturedAt throws BaselineTooNewError", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  await assert.rejects(
    () =>
      provider.getGroupMembershipBefore({
        tenantId: TENANT_ID,
        groupId: PRIVILEGED_GROUP_ID, // capturedAt = 2026-04-17T07:40:00Z
        groupDisplayName: "Finance-Privileged-Access",
        userId: KQ_TEST_05_USER_ID,
        asOf: "2026-04-17T07:30:00.000Z", // 10 minutes before baseline
      }),
    BaselineTooNewError,
  );
});

// ─── Integrity guards (temp-dir fixtures for malformed cases) ────────────

test("snapshot-provider: mismatched tenant/group in the file throws BaselineMismatchError", async () => {
  const tmp = mkdtempSync(resolve(tmpdir(), "kavachiq-snap-"));
  try {
    const tenant = "aaaaaaaa-0000-0000-0000-000000000000";
    const groupOnDisk = "bbbbbbbb-0000-0000-0000-000000000000";
    const dir = resolve(tmp, tenant, "group-memberships");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, `${groupOnDisk}.json`),
      JSON.stringify({
        tenantId: "WRONG",
        groupId: groupOnDisk,
        groupDisplayName: "X",
        capturedAt: "2026-01-01T00:00:00Z",
        memberUserIds: [],
      }),
    );
    const provider = createFilesystemSnapshotProvider({ rootDir: tmp });
    await assert.rejects(
      () =>
        provider.getGroupMembershipBefore({
          tenantId: tenant,
          groupId: groupOnDisk,
          groupDisplayName: "X",
          userId: KQ_TEST_05_USER_ID,
          asOf: "2026-04-01T00:00:00Z",
        }),
      BaselineMismatchError,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("snapshot-provider: caches file reads per (tenant, group)", async () => {
  const tmp = mkdtempSync(resolve(tmpdir(), "kavachiq-snap-cache-"));
  try {
    const tenant = "aaaaaaaa-1111-0000-0000-000000000000";
    const group = "bbbbbbbb-1111-0000-0000-000000000000";
    const dir = resolve(tmp, tenant, "group-memberships");
    mkdirSync(dir, { recursive: true });
    const path = resolve(dir, `${group}.json`);
    writeFileSync(
      path,
      JSON.stringify({
        tenantId: tenant,
        groupId: group,
        groupDisplayName: "Cached-Group",
        capturedAt: "2026-01-01T00:00:00Z",
        memberUserIds: [KQ_TEST_05_USER_ID],
      }),
    );

    const provider = createFilesystemSnapshotProvider({ rootDir: tmp });
    const args = {
      tenantId: tenant,
      groupId: group,
      groupDisplayName: "Cached-Group",
      userId: KQ_TEST_05_USER_ID,
      asOf: "2026-04-01T00:00:00Z",
    };

    // Warm the cache.
    const first = await provider.getGroupMembershipBefore(args);
    assert.equal(first.state.isMember, true);

    // Mutate the file on disk to remove the member. A cached provider should
    // still return the original membership — proving the second read hit the
    // in-memory cache, not disk.
    writeFileSync(
      path,
      JSON.stringify({
        tenantId: tenant,
        groupId: group,
        groupDisplayName: "Cached-Group",
        capturedAt: "2026-01-01T00:00:00Z",
        memberUserIds: [],
      }),
    );
    const second = await provider.getGroupMembershipBefore(args);
    assert.equal(
      second.state.isMember,
      true,
      "cached baseline should be used on repeat reads — not a fresh disk read",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── M3: app-role-assignment ──────────────────────────────────────────────

const M3_CANONICAL_SP_ID = "cb9d0b62-9b5a-4614-8e0f-cb73f57f23b0"; // KavachiqTest-App-01
const M3_PRE_ASSIGNED_SP_ID = "00000000-0000-0000-0000-000000000098"; // synthetic
const M3_USER_ID = "82238b1d-1f1f-478d-b8db-76314cdeaae9"; // kq-test-17
const DEFAULT_ACCESS_ROLE_ID = "00000000-0000-0000-0000-000000000000";

test("snapshot-provider: canonical target SP → isAssigned=false (no prior assignment)", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  const snap = await provider.getAppRoleAssignmentBefore({
    tenantId: TENANT_ID,
    servicePrincipalId: M3_CANONICAL_SP_ID,
    servicePrincipalDisplayName: "KavachiqTest-App-01",
    appRoleId: DEFAULT_ACCESS_ROLE_ID,
    principalId: M3_USER_ID,
    principalType: "User",
    asOf: "2026-04-17T07:43:06.4437897Z",
  });
  assert.equal(snap.confidence, "reconstructed");
  assert.equal(snap.captureSource, "snapshot-diff");
  assert.deepEqual(snap.state, {
    servicePrincipalId: M3_CANONICAL_SP_ID,
    servicePrincipalDisplayName: "KavachiqTest-App-01",
    appRoleId: DEFAULT_ACCESS_ROLE_ID,
    principalId: M3_USER_ID,
    principalType: "User",
    isAssigned: false,
  });
});

test("snapshot-provider: synthetic pre-assigned SP → isAssigned=true (idempotent re-grant path)", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  const snap = await provider.getAppRoleAssignmentBefore({
    tenantId: TENANT_ID,
    servicePrincipalId: M3_PRE_ASSIGNED_SP_ID,
    servicePrincipalDisplayName: "Synthetic-Pre-Assigned-App",
    appRoleId: DEFAULT_ACCESS_ROLE_ID,
    principalId: M3_USER_ID, // listed in this baseline's assignments
    principalType: "User",
    asOf: "2026-04-17T08:00:00.000Z",
  });
  assert.equal(snap.state.isAssigned, true);
  assert.equal(snap.confidence, "reconstructed");
  const expectedHash = sha256(
    JSON.stringify({
      servicePrincipalId: M3_PRE_ASSIGNED_SP_ID,
      servicePrincipalDisplayName: "Synthetic-Pre-Assigned-App",
      appRoleId: DEFAULT_ACCESS_ROLE_ID,
      principalId: M3_USER_ID,
      principalType: "User",
      isAssigned: true,
    }),
  );
  assert.equal(snap.stateHash, expectedHash);
});

test("snapshot-provider: synthetic pre-assigned SP → isAssigned=false for a different (appRole, principal) pair", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  const snap = await provider.getAppRoleAssignmentBefore({
    tenantId: TENANT_ID,
    servicePrincipalId: M3_PRE_ASSIGNED_SP_ID,
    servicePrincipalDisplayName: "Synthetic-Pre-Assigned-App",
    appRoleId: "11111111-1111-1111-1111-111111111111", // different role
    principalId: M3_USER_ID,
    principalType: "User",
    asOf: "2026-04-17T08:00:00.000Z",
  });
  assert.equal(snap.state.isAssigned, false);
});

test("snapshot-provider: missing app-role-assignment baseline throws BaselineNotFoundError (with subjectKind)", async () => {
  const provider = createFilesystemSnapshotProvider({ rootDir: BASELINE_ROOT });
  try {
    await provider.getAppRoleAssignmentBefore({
      tenantId: TENANT_ID,
      servicePrincipalId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      servicePrincipalDisplayName: "Does-Not-Exist",
      appRoleId: DEFAULT_ACCESS_ROLE_ID,
      principalId: M3_USER_ID,
      principalType: "User",
      asOf: "2026-04-17T08:00:00.000Z",
    });
    assert.fail("expected BaselineNotFoundError");
  } catch (err) {
    assert.ok(err instanceof BaselineNotFoundError);
    // subjectKind disambiguates which class the missing baseline was for.
    const details = (err as BaselineNotFoundError & { details?: { subjectKind?: string } }).details;
    assert.equal(details?.subjectKind, "app-role-assignment");
  }
});
