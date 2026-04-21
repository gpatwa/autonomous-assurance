/**
 * Snapshot provider interface + Phase 1 test stub.
 *
 * WI-05 established that group-membership audit events carry no
 * `oldValue`; before-state must be reconstructed from a baseline
 * snapshot (DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8 per-class
 * defaults; CONNECTOR_AND_INGESTION_DESIGN.md §23.A).
 *
 * This module defines the interface the normalizer calls, plus a
 * deterministic stub suitable for the Phase 1 ingestion-slice test.
 * The real baseline provider (reading from the snapshot store) lands
 * in a later Phase 1 pass.
 */

import { createHash } from "node:crypto";
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

/**
 * Phase 1 TEST STUB.
 *
 * Assumes every user being added by the current event was NOT a prior
 * member of the target group. This is the correct before-state for the
 * canonical 12-member-add scenario (kq-test-05..16 start outside the
 * privileged group, per setup-test-tenant and WI-05 evidence).
 *
 * Not suitable for production. A real provider must query the baseline
 * snapshot store to answer "was this user a member at time asOf?" for
 * arbitrary events, not assume false.
 */
export function createStubSnapshotProvider(): SnapshotProvider {
  return {
    async getGroupMembershipBefore(args) {
      const state = {
        groupId: args.groupId,
        groupDisplayName: args.groupDisplayName,
        userId: args.userId,
        isMember: false,
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
