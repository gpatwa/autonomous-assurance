/**
 * Normalize an Entra `Update application – Certificates and secrets management`
 * audit event into a `NormalizedChange`.
 *
 * WI-05 (`docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §4.4 / §7`)
 * established that SP credential events are **audit-authoritative on both
 * sides**: the `KeyDescription` modifiedProperty carries the complete
 * set of credential metadata before and after the change.
 *
 * Encoding is the M1/M3/M4 "double-JSON-encoded array" convention. The
 * `KeyDescription` value is a JSON-encoded array string, where each element
 * is a bracket-delimited key=value entry string. Use `parseKeyDescriptionArray`
 * (do NOT use `parsePolicyJsonObject`, that is the M2 path).
 *
 * `secretText` is intentionally absent from Entra audit events and is NEVER
 * stored, reconstructed, or surfaced by the platform. The `missingFields`
 * confidence entry documents this explicitly.
 *
 * Low-signal companion events (`Update service principal`, `Update application`
 * with empty `modifiedProperties`) are not matched by the discriminator; this
 * mapper only receives the high-signal `certificates and secrets management`
 * events.
 *
 * Scope: normalization only. No correlation, no detection.
 */

import type {
  ActorInfo,
  ChangeType,
  ConfidenceInfo,
  NormalizedChange,
  ProvenanceInfo,
  RawEvent,
  StateSnapshot,
  TargetInfo,
} from "@kavachiq/schema";
import { parseKeyDescriptionArray, type ParsedKeyDescriptionEntry } from "./decoder.js";
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
    user: unknown;
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

export interface SpCredentialChangeMapperOptions {
  tenantId: string;
  /** Service principal IDs to tag as agent-identified. Per-tenant allowlist in real ingestion. */
  agentIdentifiedActorIds: ReadonlySet<string>;
  /** Factory for NormalizedChange.changeId. Injected for tests; defaults to a uuid-prefixed id. */
  newChangeId: () => string;
  /** Current bundle id if correlation has already assigned one. This slice leaves it null. */
  bundleIdFor: (event: RawGraphEvent) => string | null;
}

// ─── Mapper ────────────────────────────────────────────────────────────────

export function mapSpCredentialChangeEvent(
  rawEvent: RawEvent,
  opts: SpCredentialChangeMapperOptions,
): NormalizedChange {
  const payload = rawEvent.rawPayload as unknown as RawGraphEvent;
  const appTarget = findApplicationTarget(payload);
  const keyDescProp = findKeyDescriptionProperty(appTarget, payload.id);

  const oldKeys = parseKeyDescriptionArray(keyDescProp.oldValue, {
    field: "KeyDescription.oldValue",
    eventId: payload.id,
  });
  const newKeys = parseKeyDescriptionArray(keyDescProp.newValue, {
    field: "KeyDescription.newValue",
    eventId: payload.id,
  });

  const changeType = deriveChangeType(oldKeys, newKeys);
  const actor = toActorInfo(payload, opts.agentIdentifiedActorIds);
  const target = toTargetInfo(appTarget);
  const source = toProvenanceInfo(rawEvent);

  const beforeState = buildAuthoritativeState(payload, target, oldKeys);
  const afterState = buildAuthoritativeState(payload, target, newKeys);
  const confidence = buildConfidence();

  return {
    changeId: opts.newChangeId(),
    tenantId: opts.tenantId,
    source,
    actor,
    target,
    changeType,
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

function findApplicationTarget(
  payload: RawGraphEvent,
): RawGraphEvent["targetResources"][number] {
  // Primary signal: type "Application" (the app whose credentials changed).
  // Fall back to the first target if Microsoft changes the type label.
  const app = payload.targetResources.find((t) => t.type === "Application")
    ?? payload.targetResources[0];
  if (!app) {
    throw new Error(
      `SP-credential event ${payload.id} has no targetResources`,
    );
  }
  return app;
}

function findKeyDescriptionProperty(
  target: RawGraphEvent["targetResources"][number],
  eventId: string,
): RawGraphEvent["targetResources"][number]["modifiedProperties"][number] {
  const prop = target.modifiedProperties.find(
    (p) => p.displayName === "KeyDescription",
  );
  if (!prop) {
    throw new Error(
      `SP-credential event ${eventId} missing 'KeyDescription' modifiedProperty`,
    );
  }
  return prop;
}

// ─── Field builders ────────────────────────────────────────────────────────

function deriveChangeType(
  oldKeys: ParsedKeyDescriptionEntry[],
  newKeys: ParsedKeyDescriptionEntry[],
): ChangeType {
  if (newKeys.length > oldKeys.length) return "credentialAdded";
  if (newKeys.length < oldKeys.length) return "credentialRemoved";
  // Same count: credential was rotated (remove + add in the same operation).
  // Surface as credentialAdded (the net effect is a new key was introduced).
  return "credentialAdded";
}

function toActorInfo(
  payload: RawGraphEvent,
  agentIdentifiedActorIds: ReadonlySet<string>,
): ActorInfo {
  // WI-05 §6.1: M4 events are initiated by SP-Setup (an app, no user).
  const app = payload.initiatedBy.app;
  const spId = app?.servicePrincipalId ?? null;
  return {
    type: spId ? "service-principal" : "unknown",
    id: spId,
    displayName: app?.displayName ?? null,
    agentIdentified: spId !== null && agentIdentifiedActorIds.has(spId),
    sessionId: null,
  };
}

function toTargetInfo(
  target: RawGraphEvent["targetResources"][number],
): TargetInfo {
  return {
    objectType: "application",
    objectId: target.id,
    externalId: target.id,
    displayName: target.displayName ?? "",
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
  keys: ParsedKeyDescriptionEntry[],
): StateSnapshot {
  const state = {
    applicationId: target.objectId,
    applicationDisplayName: target.displayName,
    // secretText is intentionally absent from audit events and is never stored.
    credentials: keys.map((k) => ({
      keyIdentifier: k.keyIdentifier,
      keyType: k.keyType,
      keyUsage: k.keyUsage,
      displayName: k.displayName,
    })),
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
    // secretText is legitimately absent from audit events — this is by design,
    // not a gap. Document explicitly so operators understand the missing field.
    missingFields: ["secretText"],
  };
}

function computeIngestedAt(activityDateTime: string): string {
  return new Date(
    new Date(activityDateTime).getTime() + INGEST_LATENCY_MS,
  ).toISOString();
}
