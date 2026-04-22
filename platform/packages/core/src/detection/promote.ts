/**
 * Phase 1 detection slice — CorrelatedChangeBundle → Incident.
 *
 * Pure function over (bundle, changes, policy). Matches the canonical
 * scenario in `platform/fixtures/canonical/incident.json` byte-for-byte
 * modulo fields that are genuinely now()-driven (`incidentId`,
 * `createdAt`, `updatedAt`). `detectedAt` is deterministic — it equals
 * `bundle.timeRange.end`.
 *
 * Scoring is not recomputed. The four weighted DetectionSignals that
 * summed to `bundle.incidentCandidateScore` are re-emitted via
 * `computeMemberAddedDetectionSignals` from correlation. Invariant:
 * sum(signals.weight) === bundle.incidentCandidateScore.
 *
 * Narrow slice: only the immediate-creation path for memberAdded bundles
 * (the canonical class). Sub-threshold bundles and non-memberAdded
 * bundles are rejected with an explicit error — candidate-state
 * workflows are a later slice.
 *
 * See docs/NEXT_SESSION.md "Task 1 — Detection slice" for the contract.
 */

import { randomUUID } from "node:crypto";
import { rootLogger, type Logger } from "@kavachiq/platform";
import type {
  ActorInfo,
  CorrelatedChangeBundle,
  DetectionSignal,
  Incident,
  NormalizedChange,
} from "@kavachiq/schema";
import {
  computeMemberAddedDetectionSignals,
  type ScoringPolicy,
} from "../correlation/index.js";

const SCHEMA_VERSION = 1;

/** Score threshold at or above which a bundle becomes an incident immediately. */
export const IMMEDIATE_CREATION_THRESHOLD = 80;

export interface DetectionPolicy extends ScoringPolicy {
  /**
   * actor.id → classification label (e.g., "test-agent", "admin-agent").
   * The final `sensitivityContext.actorClassification` is `${actor.type}:${label}`.
   * An actor that isn't in this map classifies as `${actor.type}:unclassified`.
   */
  actorClassifications: ReadonlyMap<string, string>;
}

export interface PromoteBundleOptions {
  policy: DetectionPolicy;
  /** IncidentId factory; default `inc_<uuid>`. */
  newIncidentId?: () => string;
  /** Clock injection for `createdAt` / `updatedAt`. Default `() => new Date()`. */
  now?: () => Date;
  logger?: Logger;
}

export class UnsupportedBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedBundleError";
  }
}

export function promoteBundleToIncident(
  bundle: CorrelatedChangeBundle,
  changes: NormalizedChange[],
  opts: PromoteBundleOptions,
): Incident {
  const log = opts.logger ?? rootLogger;
  const now = opts.now ?? (() => new Date());
  const newIncidentId = opts.newIncidentId ?? (() => `inc_${randomUUID()}`);

  assertSupportedBundle(bundle);
  const bundleChanges = selectBundleChanges(bundle, changes);

  const groupId = bundle.affectedObjectIds[0]!;
  const signals = computeMemberAddedDetectionSignals(
    bundleChanges,
    groupId,
    opts.policy,
  );

  const incident = buildIncident({
    bundle,
    changes: bundleChanges,
    signals,
    policy: opts.policy,
    incidentId: newIncidentId(),
    now: now(),
  });

  log.info("detection: immediate incident", {
    incidentId: incident.incidentId,
    bundleId: bundle.bundleId,
    score: bundle.incidentCandidateScore,
  });
  return incident;
}

function assertSupportedBundle(bundle: CorrelatedChangeBundle): void {
  if (
    bundle.changeTypes.length !== 1 ||
    bundle.changeTypes[0] !== "memberAdded"
  ) {
    throw new UnsupportedBundleError(
      `Phase 1 detection slice only handles memberAdded bundles; got changeTypes=${JSON.stringify(bundle.changeTypes)}`,
    );
  }
  if (bundle.affectedObjectIds.length !== 1) {
    throw new UnsupportedBundleError(
      `memberAdded bundle must have exactly one affectedObjectId (the group); got ${bundle.affectedObjectIds.length}`,
    );
  }
  if (bundle.status !== "finalized") {
    throw new UnsupportedBundleError(
      `Cannot promote a non-finalized bundle; got status=${bundle.status}`,
    );
  }
  if (bundle.incidentCandidateScore < IMMEDIATE_CREATION_THRESHOLD) {
    throw new UnsupportedBundleError(
      `Phase 1 detection slice only handles the immediate-creation path (score ≥ ${IMMEDIATE_CREATION_THRESHOLD}); ` +
        `got score=${bundle.incidentCandidateScore}. Candidate-state workflows arrive in a later slice.`,
    );
  }
}

/** Find each bundle.changeIds entry in the provided changes, preserving bundle order. */
function selectBundleChanges(
  bundle: CorrelatedChangeBundle,
  changes: NormalizedChange[],
): NormalizedChange[] {
  const byId = new Map(changes.map((c) => [c.changeId, c]));
  const selected: NormalizedChange[] = [];
  for (const id of bundle.changeIds) {
    const c = byId.get(id);
    if (!c) {
      throw new UnsupportedBundleError(
        `bundle.changeIds references unknown changeId: ${id}`,
      );
    }
    selected.push(c);
  }
  return selected;
}

interface BuildIncidentArgs {
  bundle: CorrelatedChangeBundle;
  changes: NormalizedChange[];
  signals: DetectionSignal[];
  policy: DetectionPolicy;
  incidentId: string;
  now: Date;
}

function buildIncident(args: BuildIncidentArgs): Incident {
  const { bundle, changes, signals, policy, incidentId, now } = args;

  const groupId = bundle.affectedObjectIds[0]!;
  const groupDisplayName = readGroupDisplayName(changes[0]!) ?? groupId;
  const memberCount = bundle.changeIds.length;
  const actor = bundle.primaryActor;
  const nonHuman = signals.find((s) => s.signalType === "non-human-actor");
  const highSensitivity = signals.find((s) => s.signalType === "target-sensitivity");
  const bulk = signals.find((s) => s.signalType === "bulk-magnitude");
  const spreadSec = extractTimeClusterSpread(bundle.correlationSignals);
  const createdAtIso = now.toISOString();

  return {
    incidentId,
    tenantId: bundle.tenantId,
    title: `Privileged group membership expansion by agent (${groupDisplayName} +${memberCount})`,
    severity: "high",
    urgency: "immediate",
    confidence: {
      level: "high",
      reasons: [
        `${memberCount}-authoritative-audit-events-observed`,
        ...(actor.type === "service-principal" && actor.agentIdentified
          ? ["agent-identified-service-principal-actor"]
          : []),
        ...(highSensitivity
          ? ["high-sensitivity-target-group (canonical scenario)"]
          : []),
        ...(bulk ? [`bulk-membership-modification-magnitude-${memberCount}`] : []),
      ],
      missingFields: [],
    },
    status: "new",
    rootChangeIds: bundle.changeIds.slice(),
    correlatedChangeIds: bundle.changeIds.slice(),
    classificationRationale: {
      signals,
      scoreAtCreation: bundle.incidentCandidateScore,
      scoreAtPromotion: null,
      immediateCreationCriteria: [
        `score-${bundle.incidentCandidateScore}-exceeds-immediate-threshold-${IMMEDIATE_CREATION_THRESHOLD}`,
        ...(nonHuman && highSensitivity
          ? ["non-human-actor-AND-high-sensitivity-target"]
          : []),
      ],
      promotionEvidence: null,
      narrative: buildNarrative({
        actor,
        memberCount,
        groupDisplayName,
        spreadSec,
      }),
    },
    sensitivityContext: {
      targetSensitivity: highSensitivity ? "high" : "low",
      actorClassification: classifyActor(actor, policy),
      sensitivityListMatches: highSensitivity ? [groupDisplayName] : [],
    },
    creationType: "immediate",
    candidateId: null,
    currentBlastRadiusId: null,
    currentPlanId: null,
    currentPlanVersion: null,
    mergedFrom: [],
    detectedAt: bundle.timeRange.end,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
    closedAt: null,
    schemaVersion: SCHEMA_VERSION,
  };
}

function readGroupDisplayName(change: NormalizedChange): string | null {
  const state = change.afterState.state as { groupDisplayName?: unknown };
  return typeof state.groupDisplayName === "string" ? state.groupDisplayName : null;
}

function extractTimeClusterSpread(signals: string[]): number | null {
  for (const s of signals) {
    const m = /^time-cluster-within-(\d+)s$/.exec(s);
    if (m) return Number(m[1]);
  }
  return null;
}

function classifyActor(actor: ActorInfo, policy: DetectionPolicy): string {
  const label =
    (actor.id && policy.actorClassifications.get(actor.id)) ?? "unclassified";
  return `${actor.type}:${label}`;
}

interface NarrativeArgs {
  actor: ActorInfo;
  memberCount: number;
  groupDisplayName: string;
  spreadSec: number | null;
}

function buildNarrative(args: NarrativeArgs): string {
  const { actor, memberCount, groupDisplayName, spreadSec } = args;
  const window = spreadSec !== null ? `a ${spreadSec}-second window` : "a brief window";
  return (
    `A service principal ('${actor.displayName ?? "unknown"}', id ${actor.id ?? "unknown"}) ` +
    `added ${memberCount} users to the high-sensitivity group '${groupDisplayName}' within ${window}. ` +
    `Matches the canonical 'Privileged group membership expansion by agent' scenario. ` +
    `Incident created immediately per the non-human-actor × high-sensitivity-target × bulk-magnitude classification rule.`
  );
}
