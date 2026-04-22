/**
 * Normalize an Entra `Add app role assignment grant to user` audit
 * event into a `NormalizedChange`.
 *
 * WI-05 (`docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §4.3 / §7`)
 * established that app-role-assignment events have the same shape as
 * M1 group-membership: rich `newValue`, no `oldValue`. Before-state
 * must therefore be reconstructed from a baseline snapshot;
 * after-state is audit-authoritative.
 *
 * Encoding is the M1/M3/M4 "double-JSON-encoded scalar" convention —
 * re-use `unwrapScalar` (do NOT use `parsePolicyJsonObject`, that's M2).
 *
 * Target semantics: `targetResources[0]` is type "ServicePrincipal"
 * (the app whose role is being granted). `targetResources[1]` is the
 * User principal, with empty modifiedProperties. The primary target is
 * therefore the SP, with the user surfaced inside `state` as
 * `principalId`.
 *
 * Category caveat (WI-05 §6.1): M3 lives under `UserManagement`, not
 * `ApplicationManagement`. The discriminator uses `activityDisplayName`
 * (already implemented); this mapper does not trust category.
 *
 * Scope: normalization only. No correlation, no detection.
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
      displayName: string;
      servicePrincipalId: string;
      servicePrincipalName: string | null;
    } | null;
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

export interface AppRoleAssignmentMapperOptions {
  tenantId: string;
  snapshotProvider: SnapshotProvider;
  /** Service principal IDs to tag as agent-identified. Per-tenant allowlist in real ingestion. */
  agentIdentifiedActorIds: ReadonlySet<string>;
  /** Factory for NormalizedChange.changeId. Injected for tests; defaults to a uuid prefix. */
  newChangeId: () => string;
  /** Current bundle id if correlation already ran. Phase 1 slice leaves this null. */
  bundleIdFor: (event: RawGraphEvent) => string | null;
}

// ─── Mapper ────────────────────────────────────────────────────────────────

export async function mapAppRoleAssignmentAddEvent(
  rawEvent: RawEvent,
  opts: AppRoleAssignmentMapperOptions,
): Promise<NormalizedChange> {
  const payload = rawEvent.rawPayload as unknown as RawGraphEvent;
  const { spTarget, userTarget, decoded } = decodePayload(payload);

  const actor = toActorInfo(payload, opts.agentIdentifiedActorIds);
  const target = toTargetInfo(spTarget);
  const source = toProvenanceInfo(rawEvent);

  const beforeState = await opts.snapshotProvider.getAppRoleAssignmentBefore({
    tenantId: opts.tenantId,
    servicePrincipalId: target.objectId,
    servicePrincipalDisplayName: target.displayName,
    appRoleId: decoded.appRoleId,
    principalId: decoded.principalId,
    principalType: "User", // WI-05 M3 fired a grant-to-user; extend when other types land
    asOf: payload.activityDateTime,
  });
  const afterState = buildAuthoritativeAfterState({
    payload,
    target,
    userTarget,
    decoded,
  });
  const confidence = buildConfidence();

  return {
    changeId: opts.newChangeId(),
    tenantId: opts.tenantId,
    source,
    actor,
    target,
    changeType: "assignmentAdded",
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

// ─── Decoding ──────────────────────────────────────────────────────────────

interface DecodedAssignment {
  appRoleId: string;
  appRoleValue: string | null;          // empty string for default-access role
  appRoleDisplayName: string | null;    // empty string for default-access role
  principalId: string;                  // User.ObjectID
  principalUpn: string | null;          // User.UPN
  targetAppId: string | null;           // TargetId.ServicePrincipalNames
  rawNewValues: Record<string, string | null>;
}

function decodePayload(payload: RawGraphEvent): {
  spTarget: RawGraphEvent["targetResources"][number];
  userTarget: RawGraphEvent["targetResources"][number] | null;
  decoded: DecodedAssignment;
} {
  const spTarget = payload.targetResources.find((t) => t.type === "ServicePrincipal");
  if (!spTarget) {
    throw new Error(
      `Add-app-role-assignment event ${payload.id} missing ServicePrincipal-type target resource`,
    );
  }
  const userTarget =
    payload.targetResources.find((t) => t.type === "User") ?? null;

  const mp = Object.fromEntries(
    spTarget.modifiedProperties.map((p) => [p.displayName, unwrapScalar(p.newValue)]),
  );

  const appRoleId = mp["AppRole.Id"];
  const principalId = mp["User.ObjectID"];
  if (!appRoleId || !principalId) {
    throw new Error(
      `Add-app-role-assignment event ${payload.id} missing AppRole.Id or User.ObjectID in modifiedProperties`,
    );
  }

  return {
    spTarget,
    userTarget,
    decoded: {
      appRoleId,
      // WI-05 §4.3: empty string is the documented value for default-access roles.
      appRoleValue: mp["AppRole.Value"] ?? null,
      appRoleDisplayName: mp["AppRole.DisplayName"] ?? null,
      principalId,
      principalUpn: mp["User.UPN"] ?? null,
      targetAppId: mp["TargetId.ServicePrincipalNames"] ?? null,
      rawNewValues: mp,
    },
  };
}

// ─── Field builders ────────────────────────────────────────────────────────

function toActorInfo(
  payload: RawGraphEvent,
  agentIds: ReadonlySet<string>,
): ActorInfo {
  // WI-05 M3 fired initiatedBy.app=SP-Setup, initiatedBy.user=null — same
  // SP-initiated shape as M1. If a future M3 variant carries a user-
  // initiated event we'll add the branch; no need to fabricate it now.
  const app = payload.initiatedBy.app;
  if (!app || !app.servicePrincipalId) {
    throw new Error(
      `Add-app-role-assignment event ${payload.id} missing initiatedBy.app.servicePrincipalId`,
    );
  }
  return {
    type: "service-principal",
    id: app.servicePrincipalId,
    displayName: app.displayName,
    agentIdentified: agentIds.has(app.servicePrincipalId),
    sessionId: null,
  };
}

function toTargetInfo(
  spTarget: RawGraphEvent["targetResources"][number],
): TargetInfo {
  return {
    objectType: "servicePrincipal",
    objectId: spTarget.id,
    externalId: spTarget.id,
    displayName: spTarget.displayName ?? "",
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

function buildAuthoritativeAfterState(args: {
  payload: RawGraphEvent;
  target: TargetInfo;
  userTarget: RawGraphEvent["targetResources"][number] | null;
  decoded: DecodedAssignment;
}): StateSnapshot {
  const { payload, target, userTarget, decoded } = args;
  // Parallels M1's after-state: identifying fields at top, raw-decoded
  // audit values under `auditNewValues`. The `auditNewValues` bag keeps
  // the less-common fields (AppRoleAssignment.CreatedDateTime, etc.)
  // accessible without expanding the top-level schema.
  const state = {
    servicePrincipalId: target.objectId,
    servicePrincipalDisplayName: target.displayName,
    principalId: decoded.principalId,
    principalType: "User" as const,
    principalDisplayName: userTarget?.userPrincipalName ?? decoded.principalUpn ?? "",
    appRoleId: decoded.appRoleId,
    isAssigned: true,
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
      "reconstructed-before-state-from-snapshot (WI-05 finding: audit has no oldValue for app-role-assignment)",
    ],
    missingFields: ["authoritative-before-state"],
  };
}

function computeIngestedAt(activityDateTime: string): string {
  return new Date(
    new Date(activityDateTime).getTime() + INGEST_LATENCY_MS,
  ).toISOString();
}
