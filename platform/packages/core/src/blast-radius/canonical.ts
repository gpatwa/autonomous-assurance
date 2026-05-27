/**
 * Minimal blast-radius slice for CANONICAL-001.
 *
 * This is deliberately narrow: it turns the Phase 1 memberAdded incident
 * into the MVP blast-radius result needed for the live recovery demo. The
 * identity impact is platform-derived from NormalizedChange records. The
 * downstream M365 objects are canonical-scenario fixtures until Phase 2
 * graph expansion is implemented.
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  ActionType,
  BlastRadiusResult,
  ConfidenceInfo,
  DependencyChainStep,
  ImpactClassification,
  ImpactedObject,
  Incident,
  NormalizedChange,
  ObjectType,
  StateSnapshot,
} from "@kavachiq/schema";

const SCHEMA_VERSION = 1;

export interface ComputeCanonicalBlastRadiusOptions {
  resultId?: string;
  computedAt?: string;
  graphRefreshAge?: number;
  computationDuration?: number;
}

export class UnsupportedBlastRadiusInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedBlastRadiusInputError";
  }
}

interface CanonicalContext {
  tenantId: string;
  incidentId: string;
  rootChangeIds: string[];
  groupId: string;
  groupDisplayName: string;
  detectedAt: string;
  computedAt: string;
  addedMemberCount: number;
}

export function computeCanonicalBlastRadius(
  incident: Incident,
  changes: NormalizedChange[],
  opts: ComputeCanonicalBlastRadiusOptions = {},
): BlastRadiusResult {
  const computedAt = opts.computedAt ?? new Date().toISOString();
  assertSupportedIncident(incident, changes);

  const selected = selectIncidentChanges(incident, changes);
  const groupId = readRequiredString(
    selected[0]!.afterState.state.groupId,
    "afterState.state.groupId",
  );
  const groupDisplayName = readRequiredString(
    selected[0]!.afterState.state.groupDisplayName,
    "afterState.state.groupDisplayName",
  );

  const ctx: CanonicalContext = {
    tenantId: incident.tenantId,
    incidentId: incident.incidentId,
    rootChangeIds: incident.rootChangeIds.slice(),
    groupId,
    groupDisplayName,
    detectedAt: incident.detectedAt,
    computedAt,
    addedMemberCount: selected.length,
  };

  const identityObjects = selected.map((change, idx) =>
    buildIdentityImpact(change, idx, ctx),
  );
  const downstreamObjects = buildCanonicalDownstreamImpacts(ctx);
  const impactedObjects = [...identityObjects, ...downstreamObjects];

  return {
    resultId: opts.resultId ?? `br_${randomUUID()}`,
    tenantId: incident.tenantId,
    incidentId: incident.incidentId,
    computedAt,
    rootChangeIds: incident.rootChangeIds.slice(),
    totalImpactedObjects: impactedObjects.length,
    impactedObjects,
    overallConfidence: {
      level: "high",
      reasons: [
        `${selected.length}-identity-impacts-derived-from-normalized-changes`,
        "canonical-downstream-dependency-fixture",
        "high-sensitivity-privileged-group",
      ],
      missingFields: [],
    },
    graphRefreshAge: opts.graphRefreshAge ?? 0,
    computationDuration: opts.computationDuration ?? 0,
    schemaVersion: SCHEMA_VERSION,
  };
}

function assertSupportedIncident(incident: Incident, changes: NormalizedChange[]): void {
  if (incident.rootChangeIds.length === 0) {
    throw new UnsupportedBlastRadiusInputError("incident has no rootChangeIds");
  }
  const selected = selectIncidentChanges(incident, changes);
  if (selected.length !== incident.rootChangeIds.length) {
    throw new UnsupportedBlastRadiusInputError(
      "not every incident rootChangeId has a matching NormalizedChange",
    );
  }
  for (const change of selected) {
    if (change.changeType !== "memberAdded") {
      throw new UnsupportedBlastRadiusInputError(
        `canonical blast-radius slice only handles memberAdded changes; got ${change.changeType}`,
      );
    }
    if (!change.beforeState) {
      throw new UnsupportedBlastRadiusInputError(
        `change ${change.changeId} has no beforeState; cannot compute rollback target`,
      );
    }
    if (change.afterState.state.groupId !== selected[0]!.afterState.state.groupId) {
      throw new UnsupportedBlastRadiusInputError(
        "canonical blast-radius slice expects all memberAdded changes to target one group",
      );
    }
  }
}

function selectIncidentChanges(
  incident: Incident,
  changes: NormalizedChange[],
): NormalizedChange[] {
  const byId = new Map(changes.map((change) => [change.changeId, change]));
  return incident.rootChangeIds.map((id) => {
    const change = byId.get(id);
    if (!change) {
      throw new UnsupportedBlastRadiusInputError(
        `incident.rootChangeIds references unknown changeId: ${id}`,
      );
    }
    return change;
  });
}

function buildIdentityImpact(
  change: NormalizedChange,
  index: number,
  ctx: CanonicalContext,
): ImpactedObject {
  return {
    objectId: change.target.objectId,
    objectType: "user",
    displayName: change.target.displayName,
    category: "Identities",
    impactClassification: "direct",
    confidence: {
      level: "high",
      reasons: [
        "authoritative-normalized-memberAdded-change",
        "before-and-after-membership-state-present",
      ],
      missingFields: [],
    },
    dependencyChain: [],
    beforeState: change.beforeState,
    afterState: change.afterState,
    recommendedActionType: "rollback",
    recommendedAction:
      `Remove ${change.target.displayName} from ${ctx.groupDisplayName}; ` +
      "this user was added by the incident-triggering agent action.",
    propagationDelay: null,
    recoveryTier: 0,
  };
}

function buildCanonicalDownstreamImpacts(ctx: CanonicalContext): ImpactedObject[] {
  return [
    downstreamImpact({
      objectId: "spo_finance_confidential",
      objectType: "sharepointSite",
      displayName: "Finance-Confidential",
      category: "SharePoint",
      impactClassification: "structural",
      confidence: mediumConfidence("group-based SharePoint permission edge"),
      recommendedActionType: "compensating-action",
      recommendedAction: "Review and revoke inherited SharePoint access after identity rollback.",
      propagationDelay: 900,
      recoveryTier: 2,
      edgeType: "group grants site collection access",
      ctx,
    }),
    downstreamImpact({
      objectId: "spo_treasury_operations",
      objectType: "sharepointSite",
      displayName: "Treasury-Operations",
      category: "SharePoint",
      impactClassification: "structural",
      confidence: mediumConfidence("group-based SharePoint permission edge"),
      recommendedActionType: "compensating-action",
      recommendedAction: "Review and revoke inherited SharePoint access after identity rollback.",
      propagationDelay: 900,
      recoveryTier: 2,
      edgeType: "group grants site collection access",
      ctx,
    }),
    downstreamImpact({
      objectId: "spo_audit_working_papers",
      objectType: "sharepointSite",
      displayName: "Audit-Working-Papers",
      category: "SharePoint",
      impactClassification: "structural",
      confidence: mediumConfidence("group-based SharePoint permission edge"),
      recommendedActionType: "compensating-action",
      recommendedAction: "Review and revoke inherited SharePoint access after identity rollback.",
      propagationDelay: 900,
      recoveryTier: 2,
      edgeType: "group grants site collection access",
      ctx,
    }),
    downstreamImpact({
      objectId: "ex_cfo_mailbox_delegation",
      objectType: "mailbox",
      displayName: "CFO mailbox delegation",
      category: "Exchange",
      impactClassification: "structural",
      confidence: mediumConfidence("group-based mailbox delegation edge"),
      recommendedActionType: "restoration",
      recommendedAction: "Restore mailbox delegation state after identity rollback.",
      propagationDelay: 900,
      recoveryTier: 2,
      edgeType: "group grants mailbox delegation",
      ctx,
    }),
    downstreamImpact({
      objectId: "ex_treasury_shared_mailbox",
      objectType: "mailbox",
      displayName: "Treasury shared mailbox",
      category: "Exchange",
      impactClassification: "structural",
      confidence: mediumConfidence("group-based mailbox delegation edge"),
      recommendedActionType: "restoration",
      recommendedAction: "Restore mailbox delegation state after identity rollback.",
      propagationDelay: 900,
      recoveryTier: 2,
      edgeType: "group grants mailbox delegation",
      ctx,
    }),
    downstreamImpact({
      objectId: "ex_finance_exec_distribution_list",
      objectType: "group",
      displayName: "Finance-Exec distribution list",
      category: "Exchange",
      impactClassification: "structural",
      confidence: mediumConfidence("group-linked distribution-list edge"),
      recommendedActionType: "restoration",
      recommendedAction: "Confirm distribution-list scope after identity rollback.",
      propagationDelay: 900,
      recoveryTier: 2,
      edgeType: "group expands distribution-list scope",
      ctx,
    }),
    downstreamImpact({
      objectId: "team_finance_leadership",
      objectType: "team",
      displayName: "Finance-Leadership workspace",
      category: "Teams",
      impactClassification: "structural",
      confidence: mediumConfidence("group-linked Teams membership edge"),
      recommendedActionType: "compensating-action",
      recommendedAction: "Confirm Teams membership sync after identity rollback.",
      propagationDelay: 300,
      recoveryTier: 2,
      edgeType: "group controls team membership",
      ctx,
    }),
    downstreamImpact({
      objectId: "app_sap_finance",
      objectType: "application",
      displayName: "SAP Finance (ERP)",
      category: "Applications",
      impactClassification: "structural",
      confidence: {
        level: "high",
        reasons: ["authoritative-app-role-edge-in-canonical-fixture"],
        missingFields: [],
      },
      recommendedActionType: "validation",
      recommendedAction: "Verify downstream ERP entitlement rollback externally.",
      propagationDelay: 3600,
      recoveryTier: 3,
      edgeType: "group grants downstream app role",
      ctx,
    }),
    downstreamImpact({
      objectId: "ca_finance_mfa_bypass",
      objectType: "conditionalAccessPolicy",
      displayName: "Finance-MFA-Bypass policy",
      category: "Conditional Access",
      impactClassification: "behavioral",
      confidence: {
        level: "high",
        reasons: ["authoritative-conditional-access-group-targeting-fixture"],
        missingFields: [],
      },
      recommendedActionType: "validation",
      recommendedAction: "Validate Conditional Access scope contracted after identity rollback.",
      propagationDelay: 300,
      recoveryTier: 1,
      edgeType: "group is included in conditional-access policy scope",
      ctx,
    }),
    downstreamImpact({
      objectId: "ca_finance_data_restriction",
      objectType: "conditionalAccessPolicy",
      displayName: "Finance-Data-Restriction policy",
      category: "Conditional Access",
      impactClassification: "behavioral",
      confidence: {
        level: "high",
        reasons: ["authoritative-conditional-access-group-targeting-fixture"],
        missingFields: [],
      },
      recommendedActionType: "validation",
      recommendedAction: "Validate DLP/CA exception scope after identity rollback.",
      propagationDelay: 300,
      recoveryTier: 1,
      edgeType: "group is included in conditional-access policy scope",
      ctx,
    }),
  ];
}

function downstreamImpact(args: {
  objectId: string;
  objectType: ObjectType;
  displayName: string;
  category: string;
  impactClassification: ImpactClassification;
  confidence: ConfidenceInfo;
  recommendedActionType: ActionType;
  recommendedAction: string;
  propagationDelay: number;
  recoveryTier: number;
  edgeType: string;
  ctx: CanonicalContext;
}): ImpactedObject {
  const { ctx } = args;
  return {
    objectId: args.objectId,
    objectType: args.objectType,
    displayName: args.displayName,
    category: args.category,
    impactClassification: args.impactClassification,
    confidence: args.confidence,
    dependencyChain: [dependencyFromGroup(args.objectId, args.objectType, args.edgeType, ctx)],
    beforeState: syntheticState(
      {
        sourceGroupId: ctx.groupId,
        sourceGroupDisplayName: ctx.groupDisplayName,
        affectedMemberCount: 0,
        canonicalFixture: true,
      },
      ctx.detectedAt,
    ),
    afterState: syntheticState(
      {
        sourceGroupId: ctx.groupId,
        sourceGroupDisplayName: ctx.groupDisplayName,
        affectedMemberCount: ctx.addedMemberCount,
        canonicalFixture: true,
      },
      ctx.computedAt,
    ),
    recommendedActionType: args.recommendedActionType,
    recommendedAction: args.recommendedAction,
    propagationDelay: args.propagationDelay,
    recoveryTier: args.recoveryTier,
  };
}

function dependencyFromGroup(
  objectId: string,
  objectType: ObjectType,
  edgeType: string,
  ctx: CanonicalContext,
): DependencyChainStep {
  return {
    fromObjectId: ctx.groupId,
    fromObjectType: "group",
    edgeType,
    toObjectId: objectId,
    toObjectType: objectType,
    edgeConfidence: "inferred",
    edgeSource: "kavachiq-system",
  };
}

function syntheticState(state: Record<string, unknown>, capturedAt: string): StateSnapshot {
  return {
    state,
    capturedAt,
    captureSource: "kavachiq-system",
    confidence: "best-effort",
    stateHash: sha256(stableStringify(state)),
  };
}

function mediumConfidence(reason: string): ConfidenceInfo {
  return {
    level: "medium",
    reasons: [`canonical-fixture-${reason}`],
    missingFields: ["live-graph-edge-expansion-not-yet-enabled"],
  };
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new UnsupportedBlastRadiusInputError(`missing required ${field}`);
  }
  return value;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
