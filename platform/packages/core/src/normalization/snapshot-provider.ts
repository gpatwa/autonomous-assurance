/**
 * Snapshot provider interface + filesystem-backed implementation for
 * group-membership pre-state reconstruction.
 *
 * WI-05 established that group-membership audit events carry no
 * `oldValue`; before-state must be reconstructed from a baseline
 * snapshot (DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8 per-class
 * defaults; CONNECTOR_AND_INGESTION_DESIGN.md §23.A).
 *
 * This module defines the interface the normalizer calls and the
 * filesystem-backed adapter. The Azure-Storage-backed provider, history
 * (multiple snapshots per group), and missing-baseline soft-fallbacks
 * are all deferred — today a missing or too-new baseline throws.
 *
 * Scope:
 *   - group-membership pre-state only
 *   - filesystem reads only
 *   - boundary unchanged: `SnapshotProvider.getGroupMembershipBefore`
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PlatformError } from "@kavachiq/platform";
import type { StateSnapshot } from "@kavachiq/schema";

export interface GroupMembershipBeforeArgs {
  tenantId: string;
  groupId: string;
  groupDisplayName: string;
  userId: string;
  /** ISO-8601 timestamp at or before which the snapshot state applies. */
  asOf: string;
}

export interface SnapshotProvider {
  getGroupMembershipBefore(args: GroupMembershipBeforeArgs): Promise<StateSnapshot>;
}

// ─── Errors ──────────────────────────────────────────────────────────────

export class BaselineNotFoundError extends PlatformError {
  constructor(tenantId: string, groupId: string, path: string) {
    super(
      "BASELINE_NOT_FOUND",
      `No group-membership baseline for tenant=${tenantId} group=${groupId} at ${path}`,
      { details: { tenantId, groupId, path } },
    );
  }
}

export class BaselineTooNewError extends PlatformError {
  constructor(
    tenantId: string,
    groupId: string,
    asOf: string,
    capturedAt: string,
  ) {
    super(
      "BASELINE_TOO_NEW",
      `Baseline for tenant=${tenantId} group=${groupId} captured at ${capturedAt} cannot answer asOf=${asOf} (asOf precedes capture)`,
      { details: { tenantId, groupId, asOf, capturedAt } },
    );
  }
}

export class BaselineMismatchError extends PlatformError {
  constructor(
    expected: { tenantId: string; groupId: string },
    actual: { tenantId: string; groupId: string },
    path: string,
  ) {
    super(
      "BASELINE_MISMATCH",
      `Baseline file at ${path} has tenantId=${actual.tenantId}/groupId=${actual.groupId} but was read for tenantId=${expected.tenantId}/groupId=${expected.groupId}`,
      { details: { expected, actual, path } },
    );
  }
}

// ─── Filesystem provider ─────────────────────────────────────────────────

export interface FilesystemSnapshotProviderOptions {
  /** Root directory containing `{tenantId}/group-memberships/{groupId}.json` files. */
  rootDir: string;
}

interface BaselineFile {
  tenantId: string;
  groupId: string;
  groupDisplayName: string;
  capturedAt: string;
  memberUserIds: string[];
}

interface CachedBaseline {
  capturedAtMs: number;
  members: Set<string>;
}

export function createFilesystemSnapshotProvider(
  opts: FilesystemSnapshotProviderOptions,
): SnapshotProvider {
  const cache = new Map<string, CachedBaseline>();

  async function loadBaseline(
    tenantId: string,
    groupId: string,
  ): Promise<CachedBaseline> {
    const cacheKey = `${tenantId}/${groupId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const path = resolve(opts.rootDir, tenantId, "group-memberships", `${groupId}.json`);
    let raw: string;
    try {
      raw = await readFile(path, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new BaselineNotFoundError(tenantId, groupId, path);
      }
      throw err;
    }

    const parsed = JSON.parse(raw) as BaselineFile;
    if (parsed.tenantId !== tenantId || parsed.groupId !== groupId) {
      throw new BaselineMismatchError(
        { tenantId, groupId },
        { tenantId: parsed.tenantId, groupId: parsed.groupId },
        path,
      );
    }

    const loaded: CachedBaseline = {
      capturedAtMs: new Date(parsed.capturedAt).getTime(),
      members: new Set(parsed.memberUserIds),
    };
    cache.set(cacheKey, loaded);
    return loaded;
  }

  return {
    async getGroupMembershipBefore(args) {
      const baseline = await loadBaseline(args.tenantId, args.groupId);
      const asOfMs = new Date(args.asOf).getTime();
      if (asOfMs < baseline.capturedAtMs) {
        throw new BaselineTooNewError(
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
  };
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
