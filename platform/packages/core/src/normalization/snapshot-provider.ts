/**
 * Snapshot provider interface + filesystem-backed implementation.
 *
 * WI-05 established that two change classes carry no usable `oldValue`
 * and must reconstruct before-state from a baseline snapshot
 * (DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8 per-class defaults;
 * CONNECTOR_AND_INGESTION_DESIGN.md §23.A):
 *
 *   - **group-membership** (M1): baseline keyed by `{groupId}`; answers
 *     "was this user a member of this group at time asOf?".
 *   - **app-role-assignment** (M3): baseline keyed by
 *     `{servicePrincipalId}`; answers "was this
 *     (principal, appRole) assignment present on this SP at time asOf?".
 *
 * The other two classes — M2 Conditional Access and M4 SP-credential —
 * are audit-authoritative on both sides and do not call this provider.
 *
 * Scope:
 *   - filesystem reads only (Azure-Storage-backed provider deferred)
 *   - two methods: `getGroupMembershipBefore` and
 *     `getAppRoleAssignmentBefore`. No history; one baseline per
 *     (kind, tenant, subject).
 *
 * Applicability errors (`BaselineNotFoundError`, `BaselineTooNewError`,
 * `BaselineMismatchError`) are shared across both kinds, carrying
 * `subjectKind` so callers can disambiguate without re-reading
 * `err.details`.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PlatformError } from "@kavachiq/platform";
import type { StateSnapshot } from "@kavachiq/schema";

export type BaselineSubjectKind = "group-membership" | "app-role-assignment";

export interface GroupMembershipBeforeArgs {
  tenantId: string;
  groupId: string;
  groupDisplayName: string;
  userId: string;
  /** ISO-8601 timestamp at or before which the snapshot state applies. */
  asOf: string;
}

export interface AppRoleAssignmentBeforeArgs {
  tenantId: string;
  servicePrincipalId: string;
  servicePrincipalDisplayName: string;
  appRoleId: string;
  principalId: string;
  /** `User` today; others deferred. */
  principalType: "User" | "Group" | "ServicePrincipal";
  /** ISO-8601 timestamp at or before which the snapshot state applies. */
  asOf: string;
}

export interface SnapshotProvider {
  getGroupMembershipBefore(args: GroupMembershipBeforeArgs): Promise<StateSnapshot>;
  getAppRoleAssignmentBefore(args: AppRoleAssignmentBeforeArgs): Promise<StateSnapshot>;
}

// ─── Errors ──────────────────────────────────────────────────────────────

export class BaselineNotFoundError extends PlatformError {
  constructor(subjectKind: BaselineSubjectKind, tenantId: string, subjectId: string, path: string) {
    super(
      "BASELINE_NOT_FOUND",
      `No ${subjectKind} baseline for tenant=${tenantId} subject=${subjectId} at ${path}`,
      { details: { subjectKind, tenantId, subjectId, path } },
    );
  }
}

export class BaselineTooNewError extends PlatformError {
  constructor(
    subjectKind: BaselineSubjectKind,
    tenantId: string,
    subjectId: string,
    asOf: string,
    capturedAt: string,
  ) {
    super(
      "BASELINE_TOO_NEW",
      `${subjectKind} baseline for tenant=${tenantId} subject=${subjectId} captured at ${capturedAt} cannot answer asOf=${asOf} (asOf precedes capture)`,
      { details: { subjectKind, tenantId, subjectId, asOf, capturedAt } },
    );
  }
}

export class BaselineMismatchError extends PlatformError {
  constructor(
    subjectKind: BaselineSubjectKind,
    expected: { tenantId: string; subjectId: string },
    actual: { tenantId: string; subjectId: string },
    path: string,
  ) {
    super(
      "BASELINE_MISMATCH",
      `${subjectKind} baseline file at ${path} has tenantId=${actual.tenantId}/subjectId=${actual.subjectId} but was read for tenantId=${expected.tenantId}/subjectId=${expected.subjectId}`,
      { details: { subjectKind, expected, actual, path } },
    );
  }
}

// ─── Filesystem provider ─────────────────────────────────────────────────

export interface FilesystemSnapshotProviderOptions {
  /**
   * Root directory containing both:
   *   `{tenantId}/group-memberships/{groupId}.json`
   *   `{tenantId}/app-role-assignments/{servicePrincipalId}.json`
   */
  rootDir: string;
}

interface GroupMembershipBaselineFile {
  tenantId: string;
  groupId: string;
  groupDisplayName: string;
  capturedAt: string;
  memberUserIds: string[];
}

interface AppRoleAssignmentBaselineFile {
  tenantId: string;
  servicePrincipalId: string;
  servicePrincipalDisplayName: string;
  capturedAt: string;
  /** Each assignment keyed by the `(appRoleId, principalId)` pair present on the SP. */
  assignments: Array<{
    appRoleId: string;
    principalId: string;
    principalType: "User" | "Group" | "ServicePrincipal";
  }>;
}

interface CachedGroupMembershipBaseline {
  capturedAtMs: number;
  members: Set<string>;
}

interface CachedAppRoleAssignmentBaseline {
  capturedAtMs: number;
  /** Keys of the form `${appRoleId}|${principalId}` for O(1) lookup. */
  assignmentKeys: Set<string>;
}

function assignmentKey(appRoleId: string, principalId: string): string {
  return `${appRoleId}|${principalId}`;
}

export function createFilesystemSnapshotProvider(
  opts: FilesystemSnapshotProviderOptions,
): SnapshotProvider {
  const groupCache = new Map<string, CachedGroupMembershipBaseline>();
  const assignmentCache = new Map<string, CachedAppRoleAssignmentBaseline>();

  async function readBaselineFile(path: string): Promise<string> {
    try {
      return await readFile(path, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw err;
      }
      throw err;
    }
  }

  async function loadGroupBaseline(
    tenantId: string,
    groupId: string,
  ): Promise<CachedGroupMembershipBaseline> {
    const cacheKey = `${tenantId}/${groupId}`;
    const cached = groupCache.get(cacheKey);
    if (cached) return cached;

    const path = resolve(opts.rootDir, tenantId, "group-memberships", `${groupId}.json`);
    let raw: string;
    try {
      raw = await readBaselineFile(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new BaselineNotFoundError("group-membership", tenantId, groupId, path);
      }
      throw err;
    }

    const parsed = JSON.parse(raw) as GroupMembershipBaselineFile;
    if (parsed.tenantId !== tenantId || parsed.groupId !== groupId) {
      throw new BaselineMismatchError(
        "group-membership",
        { tenantId, subjectId: groupId },
        { tenantId: parsed.tenantId, subjectId: parsed.groupId },
        path,
      );
    }

    const loaded: CachedGroupMembershipBaseline = {
      capturedAtMs: new Date(parsed.capturedAt).getTime(),
      members: new Set(parsed.memberUserIds),
    };
    groupCache.set(cacheKey, loaded);
    return loaded;
  }

  async function loadAssignmentBaseline(
    tenantId: string,
    servicePrincipalId: string,
  ): Promise<CachedAppRoleAssignmentBaseline> {
    const cacheKey = `${tenantId}/${servicePrincipalId}`;
    const cached = assignmentCache.get(cacheKey);
    if (cached) return cached;

    const path = resolve(opts.rootDir, tenantId, "app-role-assignments", `${servicePrincipalId}.json`);
    let raw: string;
    try {
      raw = await readBaselineFile(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new BaselineNotFoundError(
          "app-role-assignment",
          tenantId,
          servicePrincipalId,
          path,
        );
      }
      throw err;
    }

    const parsed = JSON.parse(raw) as AppRoleAssignmentBaselineFile;
    if (parsed.tenantId !== tenantId || parsed.servicePrincipalId !== servicePrincipalId) {
      throw new BaselineMismatchError(
        "app-role-assignment",
        { tenantId, subjectId: servicePrincipalId },
        { tenantId: parsed.tenantId, subjectId: parsed.servicePrincipalId },
        path,
      );
    }

    const loaded: CachedAppRoleAssignmentBaseline = {
      capturedAtMs: new Date(parsed.capturedAt).getTime(),
      assignmentKeys: new Set(
        parsed.assignments.map((a) => assignmentKey(a.appRoleId, a.principalId)),
      ),
    };
    assignmentCache.set(cacheKey, loaded);
    return loaded;
  }

  return {
    async getGroupMembershipBefore(args) {
      const baseline = await loadGroupBaseline(args.tenantId, args.groupId);
      const asOfMs = new Date(args.asOf).getTime();
      if (asOfMs < baseline.capturedAtMs) {
        throw new BaselineTooNewError(
          "group-membership",
          args.tenantId,
          args.groupId,
          args.asOf,
          new Date(baseline.capturedAtMs).toISOString(),
        );
      }

      const state = {
        groupId: args.groupId,
        groupDisplayName: args.groupDisplayName,
        userId: args.userId,
        isMember: baseline.members.has(args.userId),
      };
      return {
        state,
        capturedAt: args.asOf,
        captureSource: "snapshot-diff",
        confidence: "reconstructed",
        stateHash: sha256(JSON.stringify(state)),
      };
    },

    async getAppRoleAssignmentBefore(args) {
      const baseline = await loadAssignmentBaseline(args.tenantId, args.servicePrincipalId);
      const asOfMs = new Date(args.asOf).getTime();
      if (asOfMs < baseline.capturedAtMs) {
        throw new BaselineTooNewError(
          "app-role-assignment",
          args.tenantId,
          args.servicePrincipalId,
          args.asOf,
          new Date(baseline.capturedAtMs).toISOString(),
        );
      }

      const state = {
        servicePrincipalId: args.servicePrincipalId,
        servicePrincipalDisplayName: args.servicePrincipalDisplayName,
        appRoleId: args.appRoleId,
        principalId: args.principalId,
        principalType: args.principalType,
        isAssigned: baseline.assignmentKeys.has(
          assignmentKey(args.appRoleId, args.principalId),
        ),
      };
      return {
        state,
        capturedAt: args.asOf,
        captureSource: "snapshot-diff",
        confidence: "reconstructed",
        stateHash: sha256(JSON.stringify(state)),
      };
    },
  };
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
