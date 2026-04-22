/**
 * Normalize an Entra `Update conditional access policy` audit event
 * into a `NormalizedChange`.
 *
 * WI-05 (`docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §4.2 / §7`)
 * established that CA policy edits are **audit-authoritative on both
 * sides**: the single `modifiedProperties[0]` entry carries
 * `displayName: "ConditionalAccessPolicy"` with the complete pre-edit
 * policy JSON in `oldValue` and the complete post-edit policy JSON in
 * `newValue`. No baseline snapshot is required to reconstruct the
 * before-state.
 *
 * Encoding is the M2 "single-JSON full-policy-object" convention — a
 * single `JSON.parse` call returns the whole policy. Do NOT pipe
 * through `unwrapScalar` (that is the M1/M3/M4 double-encoding path).
 *
 * The companion `Update policy` events (loggedByService "Core Directory")
 * are explicitly ignored by the narrow CA discriminator (WI-05 §6.3);
 * only `Update conditional access policy` reaches this mapper.
 *
 * Provenance note: M2 events are user-initiated (portal operator),
 * unlike M1's agent-initiated events. Actor type is `"user"`, not
 * `"service-principal"`.
 *
 * Scope of this slice: normalization only. No correlation, no detection.
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
import { parsePolicyJsonObject } from "./decoder.js";
import { sha256 } from "./snapshot-provider.js";

const SCHEMA_VERSION = 1;
const INGEST_LATENCY_MS = 1000;

// ─── Raw Graph event shape (subset; fields we actually read) ───────────────

interface RawGraphEvent {
  id: string;
  category: string;
  activityDisplayName: string;
  activityDateTime: string;
  initiatedBy: {
    user: {
      id: string;
      displayName: string | null;
      userPrincipalName: string | null;
      ipAddress: string | null;
      userType: string | null;
      agentType: string | null;
    } | null;
    app: {
      appId: string | null;
      displayName: string | null;
      servicePrincipalId: string | null;
      servicePrincipalName: string | null;
    } | null;
  };
  targetResources: Array<{
    id: string;
    displayName: string | null;
    type: string;
    modifiedProperties: Array<{
      displayName: string;
      oldValue: string | null;
      newValue: string | null;
    }>;
  }>;
}

export interface CaPolicyUpdateMapperOptions {
  tenantId: string;
  /** Factory for NormalizedChange.changeId. Injected for tests; defaults to a random-UUID-prefixed id. */
  newChangeId: () => string;
  /** Current bundle id if correlation has already assigned one. This slice leaves it null. */
  bundleIdFor: (event: RawGraphEvent) => string | null;
}

// ─── Mapper ────────────────────────────────────────────────────────────────

export function mapCaPolicyUpdateEvent(
  rawEvent: RawEvent,
  opts: CaPolicyUpdateMapperOptions,
): NormalizedChange {
  const payload = rawEvent.rawPayload as unknown as RawGraphEvent;
  const policyTarget = findPolicyTarget(payload);
  const caProperty = findCaProperty(policyTarget, payload.id);

  const oldPolicy = parsePolicyJsonObject(caProperty.oldValue, {
    field: "ConditionalAccessPolicy.oldValue",
    eventId: payload.id,
  });
  const newPolicy = parsePolicyJsonObject(caProperty.newValue, {
    field: "ConditionalAccessPolicy.newValue",
    eventId: payload.id,
  });

  const actor = toActorInfo(payload);
  const target = toTargetInfo(policyTarget);
  const source = toProvenanceInfo(rawEvent);

  const beforeState = buildAuthoritativeState(payload, target, oldPolicy);
  const afterState = buildAuthoritativeState(payload, target, newPolicy);
  const confidence = buildConfidence();

  return {
    changeId: opts.newChangeId(),
    tenantId: opts.tenantId,
    source,
    actor,
    target,
    changeType: "policyModified",
    beforeState,
    afterState,
    confidence,
    correlationHints: {
      actorSessionId: null,
      operationBatchId: null,
      timeCluster: payload.activityDateTime.slice(0, 19) + "Z",
    },
    selfAction: false,
    observedAt: payload.activityDateTime,
    ingestedAt: computeIngestedAt(payload.activityDateTime),
    bundleId: opts.bundleIdFor(payload),
    schemaVersion: SCHEMA_VERSION,
  };
}

// ─── Payload accessors ────────────────────────────────────────────────────

function findPolicyTarget(payload: RawGraphEvent): RawGraphEvent["targetResources"][number] {
  const policy = payload.targetResources.find((t) => t.type === "Policy");
  if (!policy) {
    throw new Error(
      `Update-conditional-access-policy event ${payload.id} missing Policy-type target resource`,
    );
  }
  return policy;
}

function findCaProperty(
  target: RawGraphEvent["targetResources"][number],
  eventId: string,
): RawGraphEvent["targetResources"][number]["modifiedProperties"][number] {
  const prop = target.modifiedProperties.find(
    (p) => p.displayName === "ConditionalAccessPolicy",
  );
  if (!prop) {
    throw new Error(
      `Update-conditional-access-policy event ${eventId} missing the 'ConditionalAccessPolicy' modifiedProperty`,
    );
  }
  return prop;
}

// ─── Field builders ────────────────────────────────────────────────────────

function toActorInfo(payload: RawGraphEvent): ActorInfo {
  const user = payload.initiatedBy.user;
  if (user) {
    return {
      type: "user",
      id: user.id,
      displayName: user.displayName ?? user.userPrincipalName,
      // WI-05 §4.2: CA edits via the Azure portal report agentType="notAgentic".
      // agentIdentified here means "KavachIQ's per-tenant agent allowlist matched" —
      // a portal-initiated user never does.
      agentIdentified: false,
      sessionId: null,
    };
  }
  // Fallback: if a future CA edit is initiated by an app with no user,
  // surface the app context rather than fabricating a user.
  const app = payload.initiatedBy.app;
  return {
    type: app?.servicePrincipalId ? "service-principal" : "unknown",
    id: app?.servicePrincipalId ?? null,
    displayName: app?.displayName ?? null,
    agentIdentified: false,
    sessionId: null,
  };
}

function toTargetInfo(
  policyTarget: RawGraphEvent["targetResources"][number],
): TargetInfo {
  return {
    objectType: "conditionalAccessPolicy",
    objectId: policyTarget.id,
    externalId: policyTarget.id,
    displayName: policyTarget.displayName ?? "",
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

function buildAuthoritativeState(
  payload: RawGraphEvent,
  target: TargetInfo,
  parsedPolicy: Record<string, unknown>,
): StateSnapshot {
  // Keep identifying fields at the top level (parallels M1's after-state
  // shape) and nest the full parsed policy under `auditPolicyJson` so
  // operators and downstream code can navigate either way without
  // duplicating identifier parsing.
  const state = {
    policyId: target.objectId,
    policyDisplayName: target.displayName,
    auditPolicyJson: parsedPolicy,
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
      "authoritative-before-state-from-audit-oldValue",
      "authoritative-after-state-from-audit-newValue",
    ],
    missingFields: [],
  };
}

function computeIngestedAt(activityDateTime: string): string {
  return new Date(
    new Date(activityDateTime).getTime() + INGEST_LATENCY_MS,
  ).toISOString();
}
