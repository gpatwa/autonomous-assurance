/**
 * Canonical entity definitions for the KavachIQ platform.
 * Source of truth: docs/DATA_MODEL_AND_SCHEMA_SPECIFICATION.md §9-14
 *
 * These types are the shared contract between all services.
 * Every entity has tenantId and schemaVersion.
 */

import type {
  ActionStatus,
  ActionType,
  AuditEventType,
  BaselineApprovalStatus,
  CandidateStatus,
  ChangeType,
  ImpactClassification,
  IncidentStatus,
  ObjectType,
  SeverityLevel,
  SourceSystem,
  StepStatus,
  SubActionStatus,
  TrustedStateStatus,
  UrgencyLevel,
  ValidationResult,
} from "./enums.js";

import type {
  ActorInfo,
  ConfidenceInfo,
  ProvenanceInfo,
  StateSnapshot,
  TargetInfo,
} from "./shared-types.js";

// ─── Ingestion layer ─────────────────────────────────────────────────────────

/** IMMUTABLE. Original event from Microsoft API, preserved verbatim. */
export interface RawEvent {
  rawEventId: string;
  tenantId: string;
  sourceSystem: SourceSystem;
  rawPayload: Record<string, unknown>;
  ingestedAt: string;
  processingStatus: "pending" | "normalized" | "dead-lettered";
  normalizedChangeIds: string[];
  schemaVersion: number;
}

/** IMMUTABLE. Deduplicated, schema-normalized change record. */
export interface NormalizedChange {
  changeId: string;
  tenantId: string;
  source: ProvenanceInfo;
  actor: ActorInfo;
  target: TargetInfo;
  changeType: ChangeType;
  beforeState: StateSnapshot | null;
  afterState: StateSnapshot;
  confidence: ConfidenceInfo;
  correlationHints: {
    actorSessionId: string | null;
    operationBatchId: string | null;
    timeCluster: string;
  };
  selfAction: boolean;
  observedAt: string;
  ingestedAt: string;
  bundleId: string | null;
  schemaVersion: number;
}

/** IMMUTABLE after finalization. Group of related changes. */
export interface CorrelatedChangeBundle {
  bundleId: string;
  tenantId: string;
  changeIds: string[];
  primaryActor: ActorInfo;
  affectedObjectIds: string[];
  changeTypes: ChangeType[];
  timeRange: { start: string; end: string };
  correlationSignals: string[];
  incidentCandidateScore: number;
  status: "open" | "finalized";
  finalizedAt: string | null;
  schemaVersion: number;
}

/** IMMUTABLE. Record of a suppressed change bundle. */
export interface SuppressionRecord {
  suppressionId: string;
  tenantId: string;
  bundleId: string;
  rule: string;
  score: number;
  reason: string;
  suppressedAt: string;
  schemaVersion: number;
}

// ─── Incident layer ──────────────────────────────────────────────────────────

/** Detection signal contributing to incident classification. */
export interface DetectionSignal {
  signalType: string;
  value: string | number | boolean;
  weight: number;
  source: string;
}

/** Classification rationale embedded in an incident. IMMUTABLE per creation. */
export interface ClassificationRationale {
  signals: DetectionSignal[];
  scoreAtCreation: number;
  scoreAtPromotion: number | null;
  immediateCreationCriteria: string[] | null;
  promotionEvidence: string[] | null;
  narrative: string;
}

/** MUTABLE (status transitions). Change bundle under evaluation. */
export interface IncidentCandidate {
  candidateId: string;
  tenantId: string;
  bundleId: string;
  score: number;
  signals: DetectionSignal[];
  status: CandidateStatus;
  correlationWindowExpiresAt: string;
  promotedToIncidentId: string | null;
  suppressionReason: string | null;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

/** MUTABLE (lifecycle status). Confirmed operator-visible event. */
export interface Incident {
  incidentId: string;
  tenantId: string;
  title: string;
  severity: SeverityLevel;
  urgency: UrgencyLevel;
  confidence: ConfidenceInfo;
  status: IncidentStatus;
  rootChangeIds: string[];
  correlatedChangeIds: string[];
  classificationRationale: ClassificationRationale;
  sensitivityContext: {
    targetSensitivity: "high" | "medium" | "low";
    actorClassification: string;
    sensitivityListMatches: string[];
  };
  creationType: "immediate" | "promoted";
  candidateId: string | null;
  currentBlastRadiusId: string | null;
  currentPlanId: string | null;
  currentPlanVersion: number | null;
  mergedFrom: string[];
  detectedAt: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  schemaVersion: number;
}

// ─── Analysis layer ──────────────────────────────────────────────────────────

/** Single step in a dependency chain. */
export interface DependencyChainStep {
  fromObjectId: string;
  fromObjectType: ObjectType;
  edgeType: string;
  toObjectId: string;
  toObjectType: ObjectType;
  edgeConfidence: "authoritative" | "inferred" | "stale";
  edgeSource: SourceSystem;
}

/** Single object identified as affected. Embedded in BlastRadiusResult. */
export interface ImpactedObject {
  objectId: string;
  objectType: ObjectType;
  displayName: string;
  category: string;
  impactClassification: ImpactClassification;
  confidence: ConfidenceInfo;
  dependencyChain: DependencyChainStep[];
  beforeState: StateSnapshot | null;
  afterState: StateSnapshot | null;
  recommendedActionType: ActionType;
  recommendedAction: string;
  propagationDelay: number | null;
  recoveryTier: number;
}

/** IMMUTABLE per computation. Full blast-radius output for an incident. */
export interface BlastRadiusResult {
  resultId: string;
  tenantId: string;
  incidentId: string;
  computedAt: string;
  rootChangeIds: string[];
  totalImpactedObjects: number;
  impactedObjects: ImpactedObject[];
  overallConfidence: ConfidenceInfo;
  graphRefreshAge: number;
  computationDuration: number;
  schemaVersion: number;
}

/** IMMUTABLE content; mutable approval status. */
export interface BaselineVersion {
  tenantId: string;
  versionId: number;
  capturedAt: string;
  approvalStatus: BaselineApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  pinnedUntil: string | null;
  changeSummary: { added: number; removed: number; modified: number };
  objectCount: number;
  objectSnapshotBlobRef: string;
  schemaVersion: number;
}

/** IMMUTABLE. State of one object within a baseline. Stored in blob. */
export interface ObjectSnapshot {
  objectId: string;
  objectType: ObjectType;
  displayName: string;
  state: Record<string, unknown>;
  stateHash: string;
  captureSource: SourceSystem;
  capturedAt: string;
  confidence: "high" | "medium" | "low";
  reviewFlag: string | null;
}

// ─── Recovery layer ──────────────────────────────────────────────────────────

/** Outcome assessment embedded in a recovery plan. */
export interface TrustedStateOutcome {
  status: TrustedStateStatus;
  evaluatedAt: string;
  verifiedSteps: number;
  failedSteps: number;
  unresolvedSteps: number;
  approvedBy: string | null;
  notes: string | null;
}

/** Single action in a recovery plan. Embedded in RecoveryPlan. */
export interface RecoveryStep {
  stepId: string;
  order: number;
  tier: number;
  actionType: ActionType;
  targetObjectId: string;
  targetObjectType: ObjectType;
  targetObjectName: string;
  targetState: StateSnapshot;
  currentStateAtPlan: StateSnapshot;
  dependsOn: string[];
  approvalRequired: boolean;
  executionMode: "system" | "manual" | "recommendation-only";
  status: StepStatus;
  rationale: string;
  dependencyChain: string;
  confidence: ConfidenceInfo;
  propagationDelay: number | null;
  approvalId: string | null;
  actionInstanceId: string | null;
  validationRecordId: string | null;
}

/** IMMUTABLE per version. Versioned recovery plan for an incident. */
export interface RecoveryPlan {
  planId: string;
  tenantId: string;
  incidentId: string;
  version: number;
  status: "draft" | "pending-approval" | "executing" | "completed" | "partial" | "failed" | "cancelled" | "superseded";
  baselineVersionId: number;
  steps: RecoveryStep[];
  trustedStateOutcome: TrustedStateOutcome | null;
  generatedAt: string;
  supersededBy: { planId: string; version: number } | null;
  schemaVersion: number;
}

/** IMMUTABLE. Operator approval decision for a recovery step. */
export interface ApprovalRecord {
  approvalId: string;
  tenantId: string;
  incidentId: string;
  planId: string;
  planVersion: number;
  stepId: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  stateHashAtApproval: string;
  targetObjectId: string;
  targetState: Record<string, unknown>;
  signature: string;
  invalidated: boolean;
  invalidatedReason: string | null;
  schemaVersion: number;
}

/** IMMUTABLE. Record of one execution attempt for a sub-action. */
export interface ExecutionAttempt {
  attemptNumber: number;
  startedAt: string;
  completedAt: string;
  httpStatus: number | null;
  graphCorrelationId: string | null;
  outcome: "success" | "already-absent" | "rate-limited" | "server-error" | "timeout" | "permission-denied" | "bad-request";
  retryAfter: number | null;
  errorDetail: string | null;
}

/** MUTABLE (lifecycle status). Individual sub-operation within an action. */
export interface SubAction {
  subActionId: string;
  actionInstanceId: string;
  memberId: string;
  memberUPN: string;
  status: SubActionStatus;
  preReadResult: "present" | "absent" | "read-failed";
  attempts: ExecutionAttempt[];
  postReadResult: "present" | "absent" | "read-failed" | null;
  completedAt: string | null;
}

/** MUTABLE (lifecycle status). Concrete execution instance. */
export interface ActionInstance {
  instanceId: string;
  tenantId: string;
  templateId: string;
  incidentId: string;
  planId: string;
  planVersion: number;
  stepId: string;
  approvalId: string;
  targetObjectId: string;
  targetObjectName: string;
  membersToRemove: Array<{ memberId: string; memberUPN: string; memberDisplayName: string; removalReason: string }>;
  expectedPostState: StateSnapshot;
  status: ActionStatus;
  subActions: SubAction[];
  preExecutionState: StateSnapshot | null;
  postExecutionState: StateSnapshot | null;
  circuitBroken: boolean;
  validationHandoffId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  schemaVersion: number;
}

/** IMMUTABLE. Post-execution validation check result. */
export interface ValidationRecord {
  validationId: string;
  tenantId: string;
  incidentId: string;
  stepId: string;
  objectId: string;
  targetState: StateSnapshot;
  observedState: StateSnapshot;
  result: ValidationResult;
  confidence: ConfidenceInfo;
  validatedAt: string;
  revalidateAt: string | null;
  revalidationId: string | null;
  schemaVersion: number;
}

// ─── Audit layer ─────────────────────────────────────────────────────────────

/** IMMUTABLE, append-only. Log of any system or operator action. */
export interface AuditRecord {
  auditRecordId: string;
  tenantId: string;
  eventType: AuditEventType;
  actor: ActorInfo;
  entityType: string;
  entityId: string;
  action: string;
  detail: Record<string, unknown>;
  previousHash: string;
  recordHash: string;
  timestamp: string;
  schemaVersion: number;
}

// ─── Platform layer ──────────────────────────────────────────────────────────

/** MUTABLE. Tenant registration and configuration. */
export interface Tenant {
  tenantId: string;
  displayName: string;
  entraeTenantId: string;
  status: "provisioning" | "active" | "paused" | "safe-mode" | "deprovisioning";
  spReadAppId: string;
  spExecuteAppId: string | null;
  storageAccountName: string;
  keyVaultName: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}
