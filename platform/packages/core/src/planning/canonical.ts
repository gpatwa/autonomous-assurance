/**
 * Minimal recovery-plan slice for CANONICAL-001.
 *
 * Converts the canonical blast-radius result into the 8-step MVP recovery
 * plan. Only the Entra group rollback is system-executable in this slice;
 * downstream Microsoft 365 work stays validation, recommendation, or manual
 * confirmation until the later execution phases are built.
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  BlastRadiusResult,
  ImpactedObject,
  RecoveryPlan,
  RecoveryStep,
  StateSnapshot,
} from "@kavachiq/schema";

const SCHEMA_VERSION = 1;

export interface GenerateCanonicalRecoveryPlanOptions {
  planId?: string;
  version?: number;
  baselineVersionId?: number;
  generatedAt?: string;
  newStepId?: (slug: string, order: number) => string;
}

export class UnsupportedPlanningInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPlanningInputError";
  }
}

interface CanonicalPlanContext {
  blastRadius: BlastRadiusResult;
  generatedAt: string;
  stepIdFor: (slug: string, order: number) => string;
  identityRollbackStepId: string;
  caMfaStepId: string;
  caDataStepId: string;
  sharePointStepId: string;
  exchangeStepId: string;
  teamsStepId: string;
  appStepId: string;
  finalStepId: string;
}

export function generateCanonicalRecoveryPlan(
  blastRadius: BlastRadiusResult,
  opts: GenerateCanonicalRecoveryPlanOptions = {},
): RecoveryPlan {
  assertSupportedBlastRadius(blastRadius);

  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const stepIdFor =
    opts.newStepId ?? ((slug: string) => `step_${slug}_${randomUUID()}`);
  const ctx: CanonicalPlanContext = {
    blastRadius,
    generatedAt,
    stepIdFor,
    identityRollbackStepId: stepIdFor("identity-rollback", 1),
    caMfaStepId: stepIdFor("ca-mfa-validation", 2),
    caDataStepId: stepIdFor("ca-data-validation", 3),
    sharePointStepId: stepIdFor("sharepoint-compensating-action", 4),
    exchangeStepId: stepIdFor("exchange-restoration", 5),
    teamsStepId: stepIdFor("teams-compensating-action", 6),
    appStepId: stepIdFor("sap-validation", 7),
    finalStepId: stepIdFor("trusted-state-declaration", 8),
  };

  const steps = [
    buildIdentityRollbackStep(ctx),
    buildCaValidationStep(ctx, {
      stepId: ctx.caMfaStepId,
      order: 2,
      targetName: "Finance-MFA-Bypass policy",
      rationale:
        "Conditional Access scope is behaviorally downstream of the privileged group. " +
        "Validate that MFA bypass no longer applies to the 12 incident-added users after identity rollback.",
    }),
    buildCaValidationStep(ctx, {
      stepId: ctx.caDataStepId,
      order: 3,
      targetName: "Finance-Data-Restriction policy",
      rationale:
        "DLP/Conditional Access exception scope must contract after the group rollback. " +
        "This is a read validation, not a policy write.",
    }),
    buildAggregateStep(ctx, {
      stepId: ctx.sharePointStepId,
      order: 4,
      tier: 2,
      category: "SharePoint",
      targetObjectId: "sharepoint-canonical-sites",
      targetObjectType: "sharepointSite",
      targetObjectName: "Finance SharePoint site collections",
      actionType: "compensating-action",
      executionMode: "recommendation-only",
      approvalRequired: false,
      dependsOn: [ctx.identityRollbackStepId],
      rationale:
        "SharePoint access is structurally downstream of the privileged group. " +
        "MVP recommends explicit review/revocation after identity rollback; no SharePoint write is executed.",
    }),
    buildAggregateStep(ctx, {
      stepId: ctx.exchangeStepId,
      order: 5,
      tier: 2,
      category: "Exchange",
      targetObjectId: "exchange-canonical-delegations",
      targetObjectType: "mailbox",
      targetObjectName: "Finance Exchange delegations",
      actionType: "restoration",
      executionMode: "recommendation-only",
      approvalRequired: false,
      dependsOn: [ctx.identityRollbackStepId],
      rationale:
        "Exchange mailbox and distribution-list effects are downstream recovery items. " +
        "MVP records the recommendation and leaves execution to the operator.",
    }),
    buildAggregateStep(ctx, {
      stepId: ctx.teamsStepId,
      order: 6,
      tier: 2,
      category: "Teams",
      targetObjectId: "teams-finance-leadership",
      targetObjectType: "team",
      targetObjectName: "Finance-Leadership workspace",
      actionType: "compensating-action",
      executionMode: "recommendation-only",
      approvalRequired: false,
      dependsOn: [ctx.identityRollbackStepId],
      rationale:
        "Teams membership should converge after group rollback, but the MVP does not force sync. " +
        "Operator confirms the workspace scope.",
    }),
    buildAggregateStep(ctx, {
      stepId: ctx.appStepId,
      order: 7,
      tier: 3,
      category: "Applications",
      targetObjectId: "app-sap-finance",
      targetObjectType: "application",
      targetObjectName: "SAP Finance (ERP)",
      actionType: "validation",
      executionMode: "manual",
      approvalRequired: true,
      dependsOn: [ctx.identityRollbackStepId],
      rationale:
        "Downstream ERP entitlement risk requires explicit operator confirmation. " +
        "The MVP records the validation request; it does not write to the downstream application.",
    }),
    buildFinalTrustedStateStep(ctx),
  ];

  return {
    planId: opts.planId ?? `plan_${randomUUID()}`,
    tenantId: blastRadius.tenantId,
    incidentId: blastRadius.incidentId,
    version: opts.version ?? 1,
    status: "pending-approval",
    baselineVersionId: opts.baselineVersionId ?? 0,
    steps,
    trustedStateOutcome: null,
    generatedAt,
    supersededBy: null,
    schemaVersion: SCHEMA_VERSION,
  };
}

function assertSupportedBlastRadius(blastRadius: BlastRadiusResult): void {
  const identityCount = itemsByCategory(blastRadius, "Identities").length;
  if (identityCount !== 12) {
    throw new UnsupportedPlanningInputError(
      `canonical plan expects 12 identity impacts; got ${identityCount}`,
    );
  }
  for (const category of [
    "SharePoint",
    "Exchange",
    "Teams",
    "Applications",
    "Conditional Access",
  ]) {
    if (itemsByCategory(blastRadius, category).length === 0) {
      throw new UnsupportedPlanningInputError(
        `canonical plan requires ${category} impacts from blast radius`,
      );
    }
  }
}

function buildIdentityRollbackStep(ctx: CanonicalPlanContext): RecoveryStep {
  const identities = itemsByCategory(ctx.blastRadius, "Identities");
  const first = identities[0]!;
  const groupId = readString(first.afterState?.state.groupId, "groupId");
  const groupDisplayName = readString(first.afterState?.state.groupDisplayName, "groupDisplayName");
  const membersToRemove = identities.map((identity) => ({
    memberId: identity.objectId,
    memberUPN: identity.displayName,
    removalReason: "added-by-incident-triggering-agent-action",
  }));

  const targetState = snapshot({
    groupId,
    groupDisplayName,
    incidentAddedMemberIds: [],
    incidentAddedMemberCount: 0,
    expectedMemberCountAfterRollback: 4,
  }, ctx.generatedAt);
  const currentStateAtPlan = snapshot({
    groupId,
    groupDisplayName,
    incidentAddedMemberIds: membersToRemove.map((member) => member.memberId),
    incidentAddedMemberUPNs: membersToRemove.map((member) => member.memberUPN),
    incidentAddedMemberCount: membersToRemove.length,
    expectedMemberCountAfterRollback: 4,
  }, ctx.generatedAt);

  return {
    stepId: ctx.identityRollbackStepId,
    order: 1,
    tier: 0,
    actionType: "rollback",
    targetObjectId: groupId,
    targetObjectType: "group",
    targetObjectName: groupDisplayName,
    targetState,
    currentStateAtPlan,
    dependsOn: [],
    approvalRequired: true,
    executionMode: "system",
    status: "pending-approval",
    rationale:
      "Identity is the root of trust. Remove only the 12 members added by the incident-triggering agent " +
      "before validating or recommending downstream Microsoft 365 recovery.",
    dependencyChain: "incident memberAdded changes -> privileged Entra group membership",
    confidence: {
      level: "high",
      reasons: [
        "12-direct-identity-impacts-from-normalized-changes",
        "before-state-shows-users-were-not-members",
        "after-state-shows-users-became-members",
      ],
      missingFields: [],
    },
    propagationDelay: null,
    approvalId: null,
    actionInstanceId: null,
    validationRecordId: null,
  };
}

function buildCaValidationStep(
  ctx: CanonicalPlanContext,
  args: {
    stepId: string;
    order: number;
    targetName: string;
    rationale: string;
  },
): RecoveryStep {
  const target = requireItemByDisplayName(ctx.blastRadius, args.targetName);
  return {
    stepId: args.stepId,
    order: args.order,
    tier: 1,
    actionType: "validation",
    targetObjectId: target.objectId,
    targetObjectType: target.objectType,
    targetObjectName: target.displayName,
    targetState: target.beforeState ?? target.afterState ?? emptySnapshot(ctx.generatedAt),
    currentStateAtPlan: target.afterState ?? target.beforeState ?? emptySnapshot(ctx.generatedAt),
    dependsOn: [ctx.identityRollbackStepId],
    approvalRequired: false,
    executionMode: "system",
    status: "blocked",
    rationale: args.rationale,
    dependencyChain: describeDependencyChain(target),
    confidence: target.confidence,
    propagationDelay: target.propagationDelay,
    approvalId: null,
    actionInstanceId: null,
    validationRecordId: null,
  };
}

function buildAggregateStep(
  ctx: CanonicalPlanContext,
  args: {
    stepId: string;
    order: number;
    tier: number;
    category: string;
    targetObjectId: string;
    targetObjectType: RecoveryStep["targetObjectType"];
    targetObjectName: string;
    actionType: RecoveryStep["actionType"];
    executionMode: RecoveryStep["executionMode"];
    approvalRequired: boolean;
    dependsOn: string[];
    rationale: string;
  },
): RecoveryStep {
  const items = itemsByCategory(ctx.blastRadius, args.category);
  const names = items.map((item) => item.displayName);
  return {
    stepId: args.stepId,
    order: args.order,
    tier: args.tier,
    actionType: args.actionType,
    targetObjectId: args.targetObjectId,
    targetObjectType: args.targetObjectType,
    targetObjectName: args.targetObjectName,
    targetState: snapshot({
      impactedObjects: names,
      affectedMemberCount: 0,
      expectedAfterIdentityRollback: true,
    }, ctx.generatedAt),
    currentStateAtPlan: snapshot({
      impactedObjects: names,
      affectedMemberCount: 12,
      source: "canonical-blast-radius",
    }, ctx.generatedAt),
    dependsOn: args.dependsOn,
    approvalRequired: args.approvalRequired,
    executionMode: args.executionMode,
    status: "blocked",
    rationale: args.rationale,
    dependencyChain: `${args.category} impacts depend on ${ctx.identityRollbackStepId}`,
    confidence: mergeConfidence(items),
    propagationDelay: maxPropagationDelay(items),
    approvalId: null,
    actionInstanceId: null,
    validationRecordId: null,
  };
}

function buildFinalTrustedStateStep(ctx: CanonicalPlanContext): RecoveryStep {
  const dependsOn = [
    ctx.identityRollbackStepId,
    ctx.caMfaStepId,
    ctx.caDataStepId,
    ctx.sharePointStepId,
    ctx.exchangeStepId,
    ctx.teamsStepId,
    ctx.appStepId,
  ];
  return {
    stepId: ctx.finalStepId,
    order: 8,
    tier: 4,
    actionType: "validation",
    targetObjectId: ctx.blastRadius.incidentId,
    targetObjectType: "application",
    targetObjectName: "Trusted state declaration",
    targetState: snapshot({
      trustedStateStatus: "restored",
      requiredCompletedStepIds: dependsOn,
    }, ctx.generatedAt),
    currentStateAtPlan: snapshot({
      trustedStateStatus: "pending",
      requiredCompletedStepIds: dependsOn,
    }, ctx.generatedAt),
    dependsOn,
    approvalRequired: true,
    executionMode: "manual",
    status: "blocked",
    rationale:
      "Final operator sign-off is required before KavachIQ declares trusted state restored. " +
      "All critical validations and manual confirmations must be complete first.",
    dependencyChain: "all recovery steps -> operator trusted-state declaration",
    confidence: {
      level: "high",
      reasons: ["all-prior-step-outcomes-required-before-final-declaration"],
      missingFields: [],
    },
    propagationDelay: null,
    approvalId: null,
    actionInstanceId: null,
    validationRecordId: null,
  };
}

function itemsByCategory(blastRadius: BlastRadiusResult, category: string): ImpactedObject[] {
  return blastRadius.impactedObjects.filter((item) => item.category === category);
}

function requireItemByDisplayName(
  blastRadius: BlastRadiusResult,
  displayName: string,
): ImpactedObject {
  const item = blastRadius.impactedObjects.find((i) => i.displayName === displayName);
  if (!item) {
    throw new UnsupportedPlanningInputError(`missing blast-radius object: ${displayName}`);
  }
  return item;
}

function describeDependencyChain(item: ImpactedObject): string {
  if (item.dependencyChain.length === 0) return "direct incident impact";
  return item.dependencyChain
    .map((edge) => `${edge.fromObjectType}:${edge.fromObjectId} -> ${edge.edgeType} -> ${edge.toObjectType}:${edge.toObjectId}`)
    .join(" | ");
}

function mergeConfidence(items: ImpactedObject[]): RecoveryStep["confidence"] {
  if (items.length === 0) {
    return { level: "unknown", reasons: [], missingFields: ["no-impacted-objects"] };
  }
  const levels = items.map((item) => item.confidence.level);
  const level = levels.includes("unknown")
    ? "unknown"
    : levels.includes("low")
      ? "low"
      : levels.includes("medium")
        ? "medium"
        : "high";
  return {
    level,
    reasons: [...new Set(items.flatMap((item) => item.confidence.reasons))],
    missingFields: [...new Set(items.flatMap((item) => item.confidence.missingFields))],
  };
}

function maxPropagationDelay(items: ImpactedObject[]): number | null {
  const delays = items
    .map((item) => item.propagationDelay)
    .filter((delay): delay is number => typeof delay === "number");
  return delays.length > 0 ? Math.max(...delays) : null;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new UnsupportedPlanningInputError(`missing required ${field}`);
  }
  return value;
}

function emptySnapshot(capturedAt: string): StateSnapshot {
  return snapshot({}, capturedAt);
}

function snapshot(state: Record<string, unknown>, capturedAt: string): StateSnapshot {
  return {
    state,
    capturedAt,
    captureSource: "kavachiq-system",
    confidence: "best-effort",
    stateHash: sha256(stableStringify(state)),
  };
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
