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
  DetectionSignal,
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

  const signals = computeMemberAddedDetectionSignals(
    sorted,
    groupId,
    scoringPolicy,
  );
  const score = signals.reduce((sum, s) => sum + s.weight, 0);

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

/**
 * The four weighted detection signals that a memberAdded bundle carries.
 * Shared with detection so the incident's classificationRationale.signals
 * match what drove the bundle's incidentCandidateScore — "carry forward
 * verbatim, do not recompute".
 *
 * Invariant: sum(signals.weight) === bundle.incidentCandidateScore.
 */
export function computeMemberAddedDetectionSignals(
  changes: NormalizedChange[],
  groupId: string,
  policy: ScoringPolicy,
): DetectionSignal[] {
  const signals: DetectionSignal[] = [];

  // Non-human actor (+30). The group-key filter guarantees
  // actor.type === "service-principal" for every change that reached a
  // memberAdded bundle, so this signal always fires in this slice.
  if (changes[0]!.actor.type === "service-principal") {
    signals.push({
      signalType: "non-human-actor",
      value: "service-principal",
      weight: 30,
      source: "entra-audit.initiatedBy.app",
    });
  }

  // High-sensitivity target (+35).
  if (policy.highSensitivityGroupIds.has(groupId)) {
    signals.push({
      signalType: "target-sensitivity",
      value: "high",
      weight: 35,
      source: "canonical-scenario.sensitivity-list",
    });
  }

  // Bulk magnitude > 5 (+20).
  if (changes.length > 5) {
    signals.push({
      signalType: "bulk-magnitude",
      value: changes.length,
      weight: 20,
      source: "derived.correlated-bundle.changeCount",
    });
  }

  // Change type is membership modification (+10). Always present in this
  // slice — the group-key filter rejects non-memberAdded changes upstream.
  signals.push({
    signalType: "change-type",
    value: "memberAdded",
    weight: 10,
    source: "derived.normalized-change.changeType",
  });

  return signals;
}
