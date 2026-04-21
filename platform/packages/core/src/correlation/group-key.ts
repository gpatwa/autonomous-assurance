/**
 * Grouping key for Phase 1 correlation.
 *
 * The Phase 1 slice handles ONE correlation case: the canonical
 * memberAdded burst. The grouping key for that case is a deterministic
 * tuple derived from the NormalizedChange, and two changes with the
 * same key land in the same bundle.
 *
 * Per WI-05 §23.E, the key does NOT depend on Microsoft `correlationId`
 * (every member-add carries a distinct one; it is not a useful batch
 * signal). Instead:
 *
 *   tenantId  : scope
 *   actor.id  : same service principal
 *   groupId   : same target group (extracted from afterState.state.groupId
 *               — for memberAdded the NormalizedChange.target points to
 *               the user being added; the group is under afterState)
 *   changeType: same class
 *   bucket    : time bucket of observedAt, floor-rounded to windowMs
 *
 * Fixed buckets (not sliding windows) are used deliberately — simplest
 * workable approach for the canonical burst (12 events within 3 s; any
 * window >= 3 s catches them). A sliding implementation is a later
 * improvement if buckets prove too coarse.
 *
 * Returns null if the change cannot be bucketed under this slice
 * (wrong change type, missing actor ID, missing group ID). The caller
 * records such changes in the `unbundled` output rather than silently
 * dropping them.
 */

import type { NormalizedChange } from "@kavachiq/schema";

export interface GroupKeyContext {
  key: string;
  groupId: string;
  actorId: string;
  bucketMs: number;
}

export function computeMemberAddedGroupKey(
  change: NormalizedChange,
  windowMs: number,
): GroupKeyContext | null {
  if (change.changeType !== "memberAdded") return null;
  if (change.actor.type !== "service-principal") return null;
  const actorId = change.actor.id;
  if (!actorId) return null;

  const groupId = readGroupId(change);
  if (!groupId) return null;

  const ts = new Date(change.observedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  const bucketMs = Math.floor(ts / windowMs) * windowMs;

  return {
    key: [change.tenantId, actorId, groupId, change.changeType, String(bucketMs)].join("|"),
    groupId,
    actorId,
    bucketMs,
  };
}

/**
 * For memberAdded, the Group ID is in afterState.state.groupId (set by
 * the normalizer from the audit event's modifiedProperties[Group.ObjectID]).
 * Hardening against a missing field keeps malformed inputs surfaced in
 * `unbundled` instead of producing wrong groupings.
 */
function readGroupId(change: NormalizedChange): string | null {
  const state = change.afterState.state as { groupId?: unknown };
  return typeof state.groupId === "string" ? state.groupId : null;
}
