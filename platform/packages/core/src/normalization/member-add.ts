/**
 * Normalize an Entra `Add member to group` audit event into a
 * `NormalizedChange`.
 *
 * This is the only change class implemented in the Phase 1 ingestion
 * slice. Other classes (CA policy, app role assignment, SP credential)
 * return "unmatched" from the discriminator today and will have their
 * own mappers added in later passes.
 *
 * Confidence tagging follows DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §8
 * per-class defaults:
 *
 *   beforeState.confidence  = "reconstructed"  (snapshot-diff; WI-05:
 *                              0/12 oldValue observed)
 *   afterState.confidence   = "authoritative"  (from audit newValue)
 *   ConfidenceInfo.level    = "high"           (an authoritative audit
 *                              event confirms the change itself)
 *
 * Encoding: the four modifiedProperties fields on the User target
 * (Group.ObjectID, Group.DisplayName, ActorId.ServicePrincipalNames,
 * SPN) use double-JSON-encoded scalars per WI-05 §23.B. We decode with
 * `unwrapScalar`.
 */

import type {
  ActorInfo,
  ConfidenceInfo,
  NormalizedChange,
  ProvenanceInfo,
  RawEvent,
  StateSnapshot,
  TargetInfo,
} from "@kavachiq/schema";
import { unwrapScalar } from "./decoder.js";
import { sha256, type SnapshotProvider } from "./snapshot-provider.js";

const SCHEMA_VERSION = 1;
const INGEST_LATENCY_MS = 1000; // deterministic offset matching the canonical fixture generator

// ─── Raw Graph event shape (subset; fields we actually read) ───────────────

interface RawGraphEvent {
  id: string;
  category: string;
  activityDisplayName: string;
  activityDateTime: string;
  initiatedBy: {
    user: unknown;
    app: {
      appId: string | null;
      displayName: string;
      servicePrincipalId: string;
      servicePrincipalName: string | null;
    };
  };
  targetResources: Array<{
    id: string;
    displayName: string | null;
    type: string;
    userPrincipalName: string | null;
    modifiedProperties: Array<{
      displayName: string;
      oldValue: string | null;
      newValue: string | null;
    }>;
  }>;
}

export interface MemberAddMapperOptions {
  tenantId: string;
  snapshotProvider: SnapshotProvider;
  /** Service principal IDs to tag as agent-identified. Per-tenant allowlist in real ingestion. */
  agentIdentifiedActorIds: ReadonlySet<string>;
  /** Factory for NormalizedChange.changeId. Injected for tests; defaults to crypto.randomUUID. */
  newChangeId: () => string;
  /** Current bundle id, if correlation has already assigned one. Phase 1 slice leaves this null. */
  bundleIdFor: (event: RawGraphEvent) => string | null;
}

// ─── Mapper ────────────────────────────────────────────────────────────────

export async function mapMemberAddEvent(
  rawEvent: RawEvent,
  opts: MemberAddMapperOptions,
): Promise<NormalizedChange> {
  const payload = rawEvent.rawPayload as unknown as RawGraphEvent;
  const { userTarget, decoded } = decodeMemberAddPayload(payload);

  const actor = toActorInfo(payload, opts.agentIdentifiedActorIds);
  const target = toTargetInfo(userTarget);
  const source = toProvenanceInfo(rawEvent);

  const beforeState = await opts.snapshotProvider.getGroupMembershipBefore({
    tenantId: opts.tenantId,
    groupId: decoded.groupId,
    groupDisplayName: decoded.groupDisplayName,
    userId: target.objectId,
    asOf: payload.activityDateTime,
  });
  const afterState = buildAuthoritativeAfterState(payload, target, decoded);
  const confidence = buildConfidence();

  return {
    changeId: opts.newChangeId(),
    tenantId: opts.tenantId,
    source,
    actor,
    target,
    changeType: "memberAdded",
    beforeState,
    afterState,
    confidence,
    correlationHints: {
      actorSessionId: null,
      operationBatchId: null, // WI-05 §23.E: no reliable batch correlation for member-adds
      timeCluster: payload.activityDateTime.slice(0, 19) + "Z", // second-precision cluster key
    },
    selfAction: false,
    observedAt: payload.activityDateTime,
    ingestedAt: computeIngestedAt(payload.activityDateTime),
    bundleId: opts.bundleIdFor(payload),
    schemaVersion: SCHEMA_VERSION,
  };
}

// ─── Decoding ──────────────────────────────────────────────────────────────

interface DecodedMemberAdd {
  groupId: string;
  groupDisplayName: string;
  spnA: string | null; // ActorId.ServicePrincipalNames
  spnB: string | null; // SPN
  rawNewValues: Record<string, string | null>;
}

function decodeMemberAddPayload(payload: RawGraphEvent): {
  userTarget: RawGraphEvent["targetResources"][number];
  decoded: DecodedMemberAdd;
} {
  const userTarget = payload.targetResources.find((t) => t.type === "User");
  if (!userTarget) {
    throw new Error(
      `Add-member-to-group event ${payload.id} missing User-type target resource`,
    );
  }
  const mp = Object.fromEntries(
    userTarget.modifiedProperties.map((p) => [p.displayName, unwrapScalar(p.newValue)]),
  );
  const groupId = mp["Group.ObjectID"];
  const groupDisplayName = mp["Group.DisplayName"];
  if (!groupId || !groupDisplayName) {
    throw new Error(
      `Add-member-to-group event ${payload.id} missing Group.ObjectID or Group.DisplayName in modifiedProperties`,
    );
  }
  return {
    userTarget,
    decoded: {
      groupId,
      groupDisplayName,
      spnA: mp["ActorId.ServicePrincipalNames"] ?? null,
      spnB: mp["SPN"] ?? null,
      rawNewValues: mp,
    },
  };
}

// ─── Field builders ────────────────────────────────────────────────────────

function toActorInfo(
  payload: RawGraphEvent,
  agentIds: ReadonlySet<string>,
): ActorInfo {
  const app = payload.initiatedBy.app;
  return {
    type: "service-principal",
    id: app.servicePrincipalId,
    displayName: app.displayName,
    agentIdentified: agentIds.has(app.servicePrincipalId),
    sessionId: null, // Microsoft does not issue a per-call session ID for client-credentials auth
  };
}

function toTargetInfo(userTarget: RawGraphEvent["targetResources"][number]): TargetInfo {
  return {
    objectType: "user",
    objectId: userTarget.id,
    externalId: userTarget.id,
    displayName: userTarget.userPrincipalName ?? "",
  };
}

function toProvenanceInfo(rawEvent: RawEvent): ProvenanceInfo {
  return {
    primarySource: "entra-audit",
    corroboratingSources: [],
    conflictingSources: [],
    rawEventIds: [rawEvent.rawEventId],
  };
}

function buildAuthoritativeAfterState(
  payload: RawGraphEvent,
  target: TargetInfo,
  decoded: DecodedMemberAdd,
): StateSnapshot {
  // The after-state captures what the audit event told us. Keep the
  // decoded newValues visible under `auditNewValues` so downstream code
  // has the raw-but-unwrapped view too. Preserve the ORIGINAL
  // modifiedProperties key set — WI-05 observed that member-add events
  // can carry {Group.ObjectID, Group.DisplayName} alone OR those plus
  // {ActorId.ServicePrincipalNames, SPN}. Hardcoding all four would
  // inflate the state, change the hash, and misrepresent the evidence.
  const state = {
    groupId: decoded.groupId,
    groupDisplayName: decoded.groupDisplayName,
    userId: target.objectId,
    userPrincipalName: target.displayName,
    isMember: true,
    auditNewValues: decoded.rawNewValues,
  };
  return {
    state,
    capturedAt: payload.activityDateTime,
    captureSource: "entra-audit",
    confidence: "authoritative",
    stateHash: sha256(JSON.stringify(state)),
  };
}

function buildConfidence(): ConfidenceInfo {
  return {
    level: "high",
    reasons: [
      "authoritative-audit-event-observed",
      "authoritative-after-state-from-audit-newValue",
      "reconstructed-before-state-from-snapshot (WI-05 finding: audit has no oldValue for group-membership)",
    ],
    missingFields: ["authoritative-before-state"],
  };
}

function computeIngestedAt(activityDateTime: string): string {
  return new Date(
    new Date(activityDateTime).getTime() + INGEST_LATENCY_MS,
  ).toISOString();
}
