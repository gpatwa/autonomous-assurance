/**
 * WI-11: generate canonical scenario fixtures from real WI-05 audit artifacts.
 *
 * Single-purpose generator (NOT a framework). Reads wi05/raw-events.json,
 * filters to the 12 "Add member to group" events that constitute the
 * canonical scenario trigger, and emits four schema-conforming fixtures:
 *
 *   fixtures/canonical/raw-events.json           RawEvent[]           (12)
 *   fixtures/canonical/normalized-changes.json   NormalizedChange[]   (12)
 *   fixtures/canonical/correlated-bundle.json    CorrelatedChangeBundle (1)
 *   fixtures/canonical/incident.json             Incident             (1)
 *
 * Scope: the canonical scenario is specifically the 12-member-add event
 * described in docs/CANONICAL_SCENARIO_FIXTURE.md §1-7. M2 / M3 / M4
 * evidence from WI-05 is useful for other tests but not part of this
 * canonical fixture set.
 *
 * Confidence tagging follows WI-05 final findings
 * (docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §7):
 *   - Group membership: afterState authoritative; beforeState reconstructed
 *   - Overall NormalizedChange.confidence.level = "high" (authoritative
 *     audit event exists, even though before-state requires snapshot)
 *
 * Fields derived from the canonical scenario definition (not raw audit):
 *   - incident.severity / urgency / confidence
 *   - incident.classificationRationale (non-human actor +30, high-sensitivity
 *     group +35, bulk magnitude +20, membership modification +10 = 95)
 *   - sensitivityContext.targetSensitivity = "high"
 *   - correlationSignals (computed from the real events + canonical rules)
 *
 * Run:
 *   npm run generate-canonical-fixtures
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ActorInfo,
  ConfidenceInfo,
  CorrelatedChangeBundle,
  Incident,
  NormalizedChange,
  ProvenanceInfo,
  RawEvent,
  StateSnapshot,
  TargetInfo,
} from "@kavachiq/schema";

const SCHEMA_VERSION = 1;
const TENANT_ID = "3725cec5-3e2d-402c-a5a6-460c325d8f87";
const PRIVILEGED_GROUP_ID = "45a4b187-c7c6-422a-b82b-48e199f63bb3";
const PRIVILEGED_GROUP_NAME = "Finance-Privileged-Access";
const SP_EXECUTE_OBJECT_ID = "bf131def-02b5-4e90-8f32-ec4b3abf96db";
const SP_EXECUTE_DISPLAY = "SP-Execute";

// ─── IO paths ──────────────────────────────────────────────────────────────
// Script is expected to run from platform/ (via `npm run …`).
const PLATFORM_DIR = process.cwd();
const WI05_RAW_EVENTS = resolve(PLATFORM_DIR, "wi05/raw-events.json");
const FIXTURES_DIR = resolve(PLATFORM_DIR, "fixtures/canonical");
const OUT_RAW = resolve(FIXTURES_DIR, "raw-events.json");
const OUT_NORMALIZED = resolve(FIXTURES_DIR, "normalized-changes.json");
const OUT_BUNDLE = resolve(FIXTURES_DIR, "correlated-bundle.json");
const OUT_INCIDENT = resolve(FIXTURES_DIR, "incident.json");

// ─── Raw event shape (subset; the fields we actually read) ─────────────────

interface RawM1Event {
  id: string;
  category: "GroupManagement";
  correlationId: string;
  result: "success";
  activityDisplayName: "Add member to group";
  activityDateTime: string;
  loggedByService: "Core Directory";
  operationType: "Assign";
  initiatedBy: {
    user: null;
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
    type: "User" | "Group";
    userPrincipalName: string | null;
    groupType: string | null;
    modifiedProperties: Array<{ displayName: string; oldValue: string | null; newValue: string | null }>;
  }>;
  additionalDetails: Array<{ key: string; value: string }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function unwrapJsonEncodedScalar(value: string | null): string | null {
  if (value === null) return null;
  // Entra convention for scalar strings: "\"actual\""
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function ingestedAt(activityDateTime: string): string {
  // Deterministic: add 1 second (simulate the ingestion pipeline picking it up).
  const t = new Date(activityDateTime).getTime() + 1000;
  return new Date(t).toISOString();
}

// ─── Transform: raw Graph event → RawEvent ─────────────────────────────────

function toRawEvent(ev: RawM1Event, normalizedChangeId: string): RawEvent {
  return {
    rawEventId: newId("raw"),
    tenantId: TENANT_ID,
    sourceSystem: "entra-audit",
    rawPayload: ev as unknown as Record<string, unknown>,
    ingestedAt: ingestedAt(ev.activityDateTime),
    processingStatus: "normalized",
    normalizedChangeIds: [normalizedChangeId],
    schemaVersion: SCHEMA_VERSION,
  };
}

// ─── Transform: raw Graph event → NormalizedChange ─────────────────────────

function toNormalizedChange(
  ev: RawM1Event,
  rawEventId: string,
  changeId: string,
  bundleId: string,
): NormalizedChange {
  const userTarget = ev.targetResources.find((t) => t.type === "User");
  if (!userTarget) throw new Error(`event ${ev.id} missing User target`);
  const userId = userTarget.id;
  const upn = userTarget.userPrincipalName ?? "";

  // Actor: SP-Execute per the event's initiatedBy.app.
  const actor: ActorInfo = {
    type: "service-principal",
    id: ev.initiatedBy.app.servicePrincipalId,
    displayName: ev.initiatedBy.app.displayName,
    agentIdentified: true, // known test-agent SP; canonical scenario treats this as "agent"
    sessionId: null, // Microsoft does not issue a per-call session ID for client-credentials auth
  };

  // Target: the USER being added. The canonical scenario's "target" is
  // arguably the group, but the audit event's modifiedProperties are on
  // the User target; keep alignment with the evidence.
  const target: TargetInfo = {
    objectType: "user",
    objectId: userId,
    externalId: userId,
    displayName: upn,
  };

  // Provenance: the audit event's correlationId + activityDisplayName.
  const source: ProvenanceInfo = {
    primarySource: "entra-audit",
    corroboratingSources: [],
    conflictingSources: [],
    rawEventIds: [rawEventId],
  };

  // Before-state: RECONSTRUCTED per WI-05 §7 — audit has no oldValue for
  // group membership. We emit the plain "user was not in the group" state;
  // a real implementation pulls this from the trusted baseline snapshot.
  const beforeStateObj = {
    groupId: PRIVILEGED_GROUP_ID,
    groupDisplayName: PRIVILEGED_GROUP_NAME,
    userId,
    isMember: false,
  };
  const beforeState: StateSnapshot = {
    state: beforeStateObj,
    capturedAt: ev.activityDateTime, // approximation; a real snapshot predates
    captureSource: "snapshot-diff",
    confidence: "reconstructed",
    stateHash: sha256(JSON.stringify(beforeStateObj)),
  };

  // After-state: AUTHORITATIVE per WI-05 §7 — from the audit newValues.
  const newValues: Record<string, unknown> = {};
  for (const mp of userTarget.modifiedProperties) {
    newValues[mp.displayName] = unwrapJsonEncodedScalar(mp.newValue);
  }
  const afterStateObj = {
    groupId: PRIVILEGED_GROUP_ID,
    groupDisplayName: PRIVILEGED_GROUP_NAME,
    userId,
    userPrincipalName: upn,
    isMember: true,
    auditNewValues: newValues,
  };
  const afterState: StateSnapshot = {
    state: afterStateObj,
    capturedAt: ev.activityDateTime,
    captureSource: "entra-audit",
    confidence: "authoritative",
    stateHash: sha256(JSON.stringify(afterStateObj)),
  };

  const confidence: ConfidenceInfo = {
    level: "high",
    reasons: [
      "authoritative-audit-event-observed",
      "authoritative-after-state-from-audit-newValue",
      "reconstructed-before-state-from-snapshot (WI-05 finding: audit has no oldValue for group-membership)",
    ],
    missingFields: ["authoritative-before-state"],
  };

  return {
    changeId,
    tenantId: TENANT_ID,
    source,
    actor,
    target,
    changeType: "memberAdded",
    beforeState,
    afterState,
    confidence,
    correlationHints: {
      actorSessionId: null,
      operationBatchId: null, // WI-05 found NO Microsoft batch correlation
      timeCluster: ev.activityDateTime.slice(0, 19) + "Z", // second-precision cluster key
    },
    selfAction: false,
    observedAt: ev.activityDateTime,
    ingestedAt: ingestedAt(ev.activityDateTime),
    bundleId,
    schemaVersion: SCHEMA_VERSION,
  };
}

// ─── Transform: 12 NormalizedChanges → CorrelatedChangeBundle ──────────────

function toCorrelatedBundle(
  bundleId: string,
  changes: NormalizedChange[],
): CorrelatedChangeBundle {
  const timestamps = changes.map((c) => c.observedAt).sort();
  const primaryActor = changes[0]!.actor;

  // Affected object IDs: logically the privileged group. Per-user targets
  // are captured inside each NormalizedChange.target.
  const affectedObjectIds = [PRIVILEGED_GROUP_ID];

  return {
    bundleId,
    tenantId: TENANT_ID,
    changeIds: changes.map((c) => c.changeId),
    primaryActor,
    affectedObjectIds,
    changeTypes: ["memberAdded"],
    timeRange: {
      start: timestamps[0]!,
      end: timestamps[timestamps.length - 1]!,
    },
    correlationSignals: [
      "same-actor-service-principal",
      "same-target-group",
      "time-cluster-within-3s",
      // Explicitly NOT "microsoft-batch-correlation" — WI-05 observed
      // distinct Microsoft correlationId per member-add (§6).
    ],
    incidentCandidateScore: 95, // canonical scenario §7
    status: "finalized",
    finalizedAt: timestamps[timestamps.length - 1]!,
    schemaVersion: SCHEMA_VERSION,
  };
}

// ─── Transform: bundle → Incident ──────────────────────────────────────────

function toIncident(
  bundleId: string,
  changes: NormalizedChange[],
): Incident {
  const createdAt = new Date(
    new Date(changes[changes.length - 1]!.observedAt).getTime() + 2000,
  ).toISOString();
  const incidentId = newId("inc");

  const confidence: ConfidenceInfo = {
    level: "high",
    reasons: [
      "12-authoritative-audit-events-observed",
      "agent-identified-service-principal-actor",
      "high-sensitivity-target-group (canonical scenario)",
      "bulk-membership-modification-magnitude-12",
    ],
    missingFields: [],
  };

  return {
    incidentId,
    tenantId: TENANT_ID,
    title: `Privileged group membership expansion by agent (${PRIVILEGED_GROUP_NAME} +12)`,
    severity: "high",
    urgency: "immediate",
    confidence,
    status: "new",
    rootChangeIds: changes.map((c) => c.changeId),
    correlatedChangeIds: changes.map((c) => c.changeId),
    classificationRationale: {
      signals: [
        {
          signalType: "non-human-actor",
          value: "service-principal",
          weight: 30,
          source: "entra-audit.initiatedBy.app",
        },
        {
          signalType: "target-sensitivity",
          value: "high",
          weight: 35,
          source: "canonical-scenario.sensitivity-list",
        },
        {
          signalType: "bulk-magnitude",
          value: 12,
          weight: 20,
          source: "derived.correlated-bundle.changeCount",
        },
        {
          signalType: "change-type",
          value: "memberAdded",
          weight: 10,
          source: "derived.normalized-change.changeType",
        },
      ],
      scoreAtCreation: 95,
      scoreAtPromotion: null, // immediate creation; not promoted from candidate
      immediateCreationCriteria: [
        "score-95-exceeds-immediate-threshold-80",
        "non-human-actor-AND-high-sensitivity-target",
      ],
      promotionEvidence: null,
      narrative:
        `A service principal ('${SP_EXECUTE_DISPLAY}', id ${SP_EXECUTE_OBJECT_ID}) added 12 users to the ` +
        `high-sensitivity group '${PRIVILEGED_GROUP_NAME}' within a 3-second window. Matches the canonical ` +
        `'Privileged group membership expansion by agent' scenario. Incident created immediately per the ` +
        `non-human-actor × high-sensitivity-target × bulk-magnitude classification rule.`,
    },
    sensitivityContext: {
      targetSensitivity: "high",
      actorClassification: "service-principal:test-agent",
      sensitivityListMatches: [PRIVILEGED_GROUP_NAME],
    },
    creationType: "immediate",
    candidateId: null,
    currentBlastRadiusId: null,
    currentPlanId: null,
    currentPlanVersion: null,
    mergedFrom: [],
    detectedAt: changes[changes.length - 1]!.observedAt,
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
    schemaVersion: SCHEMA_VERSION,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main(): void {
  const all = JSON.parse(readFileSync(WI05_RAW_EVENTS, "utf-8")) as Array<{
    activityDisplayName?: string;
  }>;
  const m1 = all.filter(
    (e): e is RawM1Event => e.activityDisplayName === "Add member to group",
  );
  if (m1.length !== 12) {
    throw new Error(
      `Expected 12 'Add member to group' events in wi05/raw-events.json; found ${m1.length}. ` +
        `Re-run the canonical mutations via \`npm run trigger-canonical-mutations -- --apply\``,
    );
  }
  // Sort by time so the 12 slots are deterministic (kq-test-05 → kq-test-16).
  m1.sort((a, b) => a.activityDateTime.localeCompare(b.activityDateTime));

  // Generate all IDs up-front so cross-references are consistent.
  const bundleId = newId("bnd");
  const pairs = m1.map((ev) => ({
    ev,
    rawEventId: newId("raw"),
    changeId: newId("chg"),
  }));

  const rawEvents: RawEvent[] = pairs.map(({ ev, rawEventId, changeId }) => {
    const re = toRawEvent(ev, changeId);
    // Replace the auto-gen id with the pre-generated one so cross-refs line up.
    re.rawEventId = rawEventId;
    return re;
  });

  const normalizedChanges: NormalizedChange[] = pairs.map(
    ({ ev, rawEventId, changeId }) =>
      toNormalizedChange(ev, rawEventId, changeId, bundleId),
  );

  const bundle = toCorrelatedBundle(bundleId, normalizedChanges);
  const incident = toIncident(bundleId, normalizedChanges);

  writeFileSync(OUT_RAW, JSON.stringify(rawEvents, null, 2) + "\n", "utf-8");
  writeFileSync(
    OUT_NORMALIZED,
    JSON.stringify(normalizedChanges, null, 2) + "\n",
    "utf-8",
  );
  writeFileSync(OUT_BUNDLE, JSON.stringify(bundle, null, 2) + "\n", "utf-8");
  writeFileSync(OUT_INCIDENT, JSON.stringify(incident, null, 2) + "\n", "utf-8");

  process.stdout.write(
    JSON.stringify(
      {
        tenantId: TENANT_ID,
        privilegedGroupId: PRIVILEGED_GROUP_ID,
        counts: {
          rawEvents: rawEvents.length,
          normalizedChanges: normalizedChanges.length,
          bundles: 1,
          incidents: 1,
        },
        bundleId,
        incidentId: incident.incidentId,
        outputs: [OUT_RAW, OUT_NORMALIZED, OUT_BUNDLE, OUT_INCIDENT],
      },
      null,
      2,
    ) + "\n",
  );
}

main();
