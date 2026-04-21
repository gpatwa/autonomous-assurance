/**
 * Build a CorrelatedChangeBundle from a group of memberAdded NormalizedChanges
 * that already share a group key (see `group-key.ts`).
 *
 * Scoring follows the canonical scenario definition
 * (`docs/CANONICAL_SCENARIO_FIXTURE.md §7`): non-human actor +30,
 * high-sensitivity target +35, bulk magnitude >5 +20, membership
 * modification +10 = 95 for the canonical burst. The sensitivity lookup
 * is passed in by the caller so the scorer stays narrow — no
 * sensitivity-list subsystem is invented here.
 *
 * Correlation signals recorded on the bundle mirror what drove the
 * grouping: same-actor, same-target-group, and a time-cluster tag
 * reporting the *observed* spread (ceil to whole seconds) rather than
 * the correlation window. The observed spread is what the canonical
 * fixture records ("time-cluster-within-3s" for a 2.978 s burst).
 */

import type {
  CorrelatedChangeBundle,
  NormalizedChange,
} from "@kavachiq/schema";

const SCHEMA_VERSION = 1;

export interface ScoringPolicy {
  /** Group IDs that count as high-sensitivity for incident-candidate scoring. */
  highSensitivityGroupIds: ReadonlySet<string>;
}

export interface BuildMemberAddedBundleArgs {
  changes: NormalizedChange[];
  groupId: string;
  bundleId: string;
  scoringPolicy: ScoringPolicy;
}

export function buildMemberAddedBundle(
  args: BuildMemberAddedBundleArgs,
): CorrelatedChangeBundle {
  const { changes, groupId, bundleId, scoringPolicy } = args;

  // Sorted in observation order — canonical fixture is time-sorted.
  const sorted = [...changes].sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt),
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const startMs = new Date(first.observedAt).getTime();
  const endMs = new Date(last.observedAt).getTime();
  const spreadSec = Math.max(1, Math.ceil((endMs - startMs) / 1000));

  const score = scoreBundle(sorted, groupId, scoringPolicy);

  return {
    bundleId,
    tenantId: first.tenantId,
    changeIds: sorted.map((c) => c.changeId),
    primaryActor: first.actor,
    affectedObjectIds: [groupId],
    changeTypes: ["memberAdded"],
    timeRange: { start: first.observedAt, end: last.observedAt },
    correlationSignals: [
      "same-actor-service-principal",
      "same-target-group",
      `time-cluster-within-${spreadSec}s`,
    ],
    incidentCandidateScore: score,
    status: "finalized",
    finalizedAt: last.observedAt,
    schemaVersion: SCHEMA_VERSION,
  };
}

function scoreBundle(
  changes: NormalizedChange[],
  groupId: string,
  policy: ScoringPolicy,
): number {
  let score = 0;

  // Non-human actor: service-principal (+30). memberAdded changes in this
  // slice are always service-principal-initiated; if ingestion produced
  // a user-initiated memberAdded, it would not appear here because the
  // grouping key rejects non-service-principal actors.
  if (changes[0]!.actor.type === "service-principal") score += 30;

  // High-sensitivity target (+35). Defaults to 0 if the group is not on
  // the sensitivity list; the caller supplies the list.
  if (policy.highSensitivityGroupIds.has(groupId)) score += 35;

  // Bulk magnitude > 5 (+20).
  if (changes.length > 5) score += 20;

  // Change type is membership modification (+10).
  score += 10;

  return score;
}
