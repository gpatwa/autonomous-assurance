# Data Model and Schema Specification

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisites:** All prior design documents  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

This document consolidates the distributed pseudo-schemas from nine prior design documents into one authoritative data model for KavachIQ. It defines canonical entities, their fields, relationships, lifecycle states, versioning strategy, and mutability boundaries.

**Core challenge:** The system has 25+ entity types spanning ingestion, incident detection, blast-radius analysis, baseline management, recovery orchestration, execution, validation, and audit. These entities were defined in different docs at different times. Some field names overlap, some lifecycle states conflict, and the boundary between mutable operational records and immutable audit records is not consistently drawn.

**Recommended approach:** A layered entity model organized around the incident lifecycle. Five entity layers: Ingestion (raw → normalized → correlated), Incident (candidate → incident → lifecycle), Analysis (blast-radius → baseline comparison), Recovery (plan → step → approval → execution → validation), and Audit (immutable event log). Every entity carries `tenantId` and `createdAt`. Entities that can change state carry explicit lifecycle enums. Entities that must not change after creation are marked immutable. Versioned entities (baselines, recovery plans) use version numbers, not in-place mutation.

**Key decisions:**
- All IDs are UUIDs, globally unique, system-generated
- External Microsoft object IDs are stored as reference fields, never used as primary keys
- Confidence and provenance are embedded structs on every entity that makes claims about external state
- Audit records reference other entities by ID but are independently immutable
- API resources map 1:1 to canonical entities where possible; aggregated views are separate computed resources

---

## 2. Problem Statement

**Many subsystems define overlapping entities.** The ingestion doc defines `NormalizedChange`. The incident detection doc defines `Incident` which references changes. The blast-radius doc defines `ImpactedObject`. The recovery doc defines `RecoveryStep` which targets impacted objects. The execution doc defines `ActionInstance` which implements recovery steps. Without a unified model, each subsystem risks divergent field names, ID schemes, and lifecycle semantics.

**The same external object appears in multiple contexts.** An Entra group appears as a target in `NormalizedChange`, an impacted object in `BlastRadiusResult`, an object snapshot in `BaselineVersion`, and a target in `RecoveryStep`. The data model must make clear that these are different views of the same external object, not duplicated records.

**Mutable and immutable records coexist.** An `Incident` has mutable status (new → investigating → recovering → restored). An `AuditRecord` is immutable once written. A `RecoveryPlan` is versioned (v1, v2) with each version immutable but the "current" pointer mutable. These patterns must be explicitly defined, not left to implementation convention.

---

## 3. Design Goals

1. **Canonical entity definitions.** One authoritative definition per entity type.
2. **Cross-system consistency.** Shared types (ActorInfo, ConfidenceInfo, etc.) are defined once and reused.
3. **Tenant scoping everywhere.** `tenantId` is a required field on every entity.
4. **Immutable where audit matters.** RawEvents, AuditRecords, ApprovalRecords, and BaselineVersion snapshots are immutable.
5. **Explicit versioning.** Baselines and RecoveryPlans use version numbers. Each version is a new record.
6. **Confidence and provenance first-class.** Embedded on every entity that makes claims about external state.
7. **Stable, globally unique IDs.** UUIDs for all system-generated identifiers.
8. **API alignment.** Canonical entities map cleanly to API resources.
9. **Schema evolution support.** All records carry a `schemaVersion` field.

---

## 4. Non-Goals and Boundaries

- **Not a physical DDL spec.** This document defines logical entities. Physical storage (Table, Blob, Cosmos partition keys) is a separate implementation decision.
- **Not locking to one storage engine.** Entities may be stored across Azure Table Storage, Blob Storage, and Cosmos DB as defined in the deployment doc.
- **Not designing every index.** Query patterns and indexes are implementation-phase decisions.
- **Not solving analytics schema.** A data warehouse for reporting is future work.
- **Not finalizing external integration schemas.** SIEM export and ITSM ticket schemas are future docs.

---

## 5. Data Modeling Principles

1. **Tenant-scoped by default.** Every entity has `tenantId` as the first field. No entity exists without a tenant.
2. **Immutable where history matters.** Records that represent decisions, observations, or approvals are never modified after creation. New state = new record.
3. **Mutable for current operational state.** Active incidents, plan status, and tenant config are mutable. Changes are tracked via lifecycle transitions and audit records.
4. **Append-only event lineage.** Raw events → normalized changes → correlated bundles. Each stage appends; no stage modifies an upstream record.
5. **Version explicit, not implicit.** Baselines and recovery plans carry version numbers. "Latest" is a pointer, not an in-place update.
6. **Confidence and provenance first-class.** Not optional metadata; required embedded structs on any entity that asserts something about external system state.
7. **IDs are stable and globally unique.** UUIDv7 (time-ordered) for system-generated IDs. External Microsoft IDs stored as `externalId` reference fields.
8. **API resources = canonical entities.** The API exposes canonical entities directly. Aggregated views (incident summary, blast-radius overview) are computed, not stored separately.

---

## 6. Canonical Entity Inventory

### Ingestion Layer

| Entity | Role | Immutable |
|--------|------|-----------|
| **RawEvent** | Original event from Microsoft API, preserved verbatim | Yes |
| **NormalizedChange** | Deduplicated, schema-normalized change record | Yes |
| **CorrelatedChangeBundle** | Group of related changes clustered by actor/session/time | Yes (after finalization) |
| **SuppressionRecord** | Record of a change bundle that was evaluated and suppressed | Yes |

### Incident Layer

| Entity | Role | Immutable |
|--------|------|-----------|
| **IncidentCandidate** | Change bundle under evaluation (may become incident or be suppressed) | Mutable (status transitions) |
| **Incident** | Confirmed, operator-visible event requiring investigation/recovery | Mutable (lifecycle status) |
| **IncidentLifecycleTransition** | Record of each status change on an incident | Yes |
| **ClassificationRationale** | Signals and scoring that led to incident creation | Yes |

### Analysis Layer

| Entity | Role | Immutable |
|--------|------|-----------|
| **BlastRadiusResult** | Computed impact map for a specific incident | Yes (per computation; may be recomputed as new version) |
| **ImpactedObject** | Single object identified as affected, with impact classification | Yes (within a result) |
| **BaselineVersion** | Point-in-time tenant baseline snapshot with approval state | Immutable content; mutable approval status |
| **ObjectSnapshot** | State of one Entra/M365 object within a baseline | Yes |
| **DriftRecord** | Detected difference between current state and approved baseline | Yes |

### Recovery Layer

| Entity | Role | Immutable |
|--------|------|-----------|
| **RecoveryPlan** | Versioned recovery plan for an incident | Yes per version; "current" pointer is mutable |
| **RecoveryStep** | Single action in a plan with ordering, classification, and dependencies | Yes (within a plan version) |
| **ApprovalRecord** | Operator approval decision for a recovery step | Yes |
| **ActionInstance** | Concrete execution instance derived from an approved step | Mutable (lifecycle status) |
| **SubAction** | Individual sub-operation within an action (e.g., one member removal) | Mutable (lifecycle status) |
| **ExecutionAttempt** | Record of one execution try for a sub-action | Yes |
| **ValidationRecord** | Post-execution validation check result | Yes |
| **ValidationHandoff** | Structured handoff from execution to validation service | Yes |

### Platform Layer

| Entity | Role | Immutable |
|--------|------|-----------|
| **AuditRecord** | Immutable log of any system or operator action | Yes |
| **Tenant** | Tenant registration and configuration | Mutable (config changes) |
| **TenantPolicy** | Tenant-specific detection and recovery policies | Mutable |
| **SensitivityList** | Tenant-configured object sensitivity classifications | Mutable |
| **NotificationRecord** | Record of notification sent to operator | Yes |

---

## 7. Identifier and Reference Strategy

### ID Format

All system-generated IDs use **UUIDv7** (RFC 9562). UUIDv7 is time-ordered, which provides natural sort order and is compatible with all storage engines.

### ID Types

| ID Type | Format | Scope | Example |
|---------|--------|-------|---------|
| `tenantId` | UUIDv7 | Global | `019069a4-...` |
| `incidentId` | UUIDv7 | Global | `019069b2-...` |
| `changeId` | UUIDv7 | Global | `019069c1-...` |
| `planId` | UUIDv7 | Global | `019069d3-...` |
| `stepId` | UUIDv7 | Global | `019069e5-...` |
| `approvalId` | UUIDv7 | Global | `019069f7-...` |
| `actionInstanceId` | UUIDv7 | Global | `01906a08-...` |
| `auditRecordId` | UUIDv7 | Global | `01906a1a-...` |
| `baselineVersionId` | Integer (monotonic per tenant) | Tenant-scoped | `47` |
| `planVersion` | Integer (monotonic per incident) | Incident-scoped | `2` |
| `externalObjectId` | String (Microsoft object ID) | External reference | `aad-grp-8c1f-4a2e-9d7b` |

### Reference Convention

Entities reference other entities by their ID fields. Example: `RecoveryStep.incidentId` references `Incident.incidentId`. References are always by ID, never by embedding the full referenced entity (except for denormalized API response views).

### Correlation IDs

| ID | Purpose | Set By |
|----|---------|--------|
| `correlationId` | Distributed tracing across services | System (propagated through all processing) |
| `microsoftCorrelationId` | Microsoft Graph API correlation header | Captured from `x-ms-correlation-id` response |
| `operationBatchId` | Microsoft audit log correlation for batched operations | Captured from audit event |
| `agentSessionId` | Agent/workflow session identifier if available | Extracted from audit event `initiatedBy` |

---

## 8. Core Shared Types

These embedded types are reused across multiple entities.

```
ActorInfo
  ├── type: "user" | "application" | "service-principal" | "system" | "kavachiq" | "unknown"
  ├── id: string | null
  ├── displayName: string | null
  ├── agentIdentified: boolean
  └── sessionId: string | null

TargetInfo
  ├── objectType: ObjectType
  ├── objectId: string              // KavachIQ internal ID (if tracked) or external ID
  ├── externalId: string            // Microsoft Entra/M365 object ID
  └── displayName: string

ConfidenceInfo
  ├── level: "high" | "medium" | "low" | "unknown"
  ├── reasons: string[]
  └── missingFields: string[]

ProvenanceInfo
  ├── primarySource: SourceSystem
  ├── corroboratingSources: SourceSystem[]
  ├── conflictingSources: SourceSystem[]
  └── rawEventIds: string[]

StateSnapshot
  ├── state: object                 // serialized state (members, properties, config)
  ├── capturedAt: timestamp
  ├── captureSource: SourceSystem
  ├── confidence: "authoritative" | "reconstructed" | "best-effort" | "unavailable"
  └── stateHash: string             // SHA-256 of normalized state

TimeMetadata
  ├── createdAt: timestamp
  ├── updatedAt: timestamp | null   // null for immutable entities
  └── schemaVersion: number         // for evolution compatibility
```

### Canonical Enums

```
ObjectType: "user" | "group" | "application" | "servicePrincipal"
           | "conditionalAccessPolicy" | "roleAssignment"
           | "sharepointSite" | "team" | "mailbox"

SourceSystem: "entra-audit" | "m365-audit" | "graph-webhook"
             | "graph-api-read" | "snapshot-diff" | "operator" | "kavachiq-system"

ChangeType: "memberAdded" | "memberRemoved" | "propertyModified"
           | "objectCreated" | "objectDeleted" | "assignmentAdded"
           | "assignmentRemoved" | "policyModified" | "permissionChanged"

ActionType: "rollback" | "restoration" | "compensating-action" | "validation" | "manual"

ImpactClassification: "direct" | "structural" | "behavioral" | "transitive" | "adjacent"

SeverityLevel: "critical" | "high" | "medium" | "low"

UrgencyLevel: "immediate" | "within-hour" | "within-day" | "informational"
```

---

## 9. Entity Schemas: Ingestion Layer

### RawEvent

```
RawEvent (IMMUTABLE)
  ├── rawEventId: UUIDv7
  ├── tenantId: UUIDv7
  ├── sourceSystem: SourceSystem
  ├── rawPayload: object            // original JSON from Microsoft API
  ├── ingestedAt: timestamp
  ├── processingStatus: "pending" | "normalized" | "dead-lettered"
  ├── normalizedChangeIds: string[] // populated after normalization
  └── schemaVersion: number
```

### NormalizedChange

```
NormalizedChange (IMMUTABLE)
  ├── changeId: UUIDv7
  ├── tenantId: UUIDv7
  ├── source: ProvenanceInfo
  ├── actor: ActorInfo
  ├── target: TargetInfo
  ├── changeType: ChangeType
  ├── beforeState: StateSnapshot | null
  ├── afterState: StateSnapshot
  ├── confidence: ConfidenceInfo
  ├── correlationHints: {
  │     actorSessionId: string | null,
  │     operationBatchId: string | null,
  │     timeCluster: timestamp
  │   }
  ├── selfAction: boolean
  ├── observedAt: timestamp         // when the source reported it
  ├── ingestedAt: timestamp         // when KavachIQ processed it
  ├── bundleId: UUIDv7 | null       // set when correlated
  └── schemaVersion: number
```

### CorrelatedChangeBundle

```
CorrelatedChangeBundle (IMMUTABLE after finalization)
  ├── bundleId: UUIDv7
  ├── tenantId: UUIDv7
  ├── changeIds: UUIDv7[]
  ├── primaryActor: ActorInfo
  ├── affectedObjectIds: string[]
  ├── changeTypes: ChangeType[]
  ├── timeRange: { start: timestamp, end: timestamp }
  ├── correlationSignals: string[]
  ├── incidentCandidateScore: number  // 0-100
  ├── status: "open" | "finalized"
  ├── finalizedAt: timestamp | null
  └── schemaVersion: number
```

### SuppressionRecord

```
SuppressionRecord (IMMUTABLE)
  ├── suppressionId: UUIDv7
  ├── tenantId: UUIDv7
  ├── bundleId: UUIDv7
  ├── rule: string
  ├── score: number
  ├── reason: string
  ├── suppressedAt: timestamp
  └── schemaVersion: number
```

---

## 10. Entity Schemas: Incident Layer

### IncidentCandidate

```
IncidentCandidate (MUTABLE — status transitions)
  ├── candidateId: UUIDv7
  ├── tenantId: UUIDv7
  ├── bundleId: UUIDv7
  ├── score: number
  ├── signals: DetectionSignal[]
  ├── status: "open" | "promoted" | "suppressed" | "expired"
  ├── correlationWindowExpiresAt: timestamp
  ├── promotedToIncidentId: UUIDv7 | null
  ├── suppressionReason: string | null
  ├── createdAt: timestamp
  ├── updatedAt: timestamp
  └── schemaVersion: number

DetectionSignal (embedded)
  ├── signalType: string
  ├── value: string | number | boolean
  ├── weight: number
  └── source: string
```

### Incident

```
Incident (MUTABLE — lifecycle status)
  ├── incidentId: UUIDv7
  ├── tenantId: UUIDv7
  ├── title: string
  ├── severity: SeverityLevel
  ├── urgency: UrgencyLevel
  ├── confidence: ConfidenceInfo
  ├── status: IncidentStatus
  ├── rootChangeIds: UUIDv7[]
  ├── correlatedChangeIds: UUIDv7[]
  ├── classificationRationale: ClassificationRationale
  ├── sensitivityContext: {
  │     targetSensitivity: "high" | "medium" | "low",
  │     actorClassification: string,
  │     sensitivityListMatches: string[]
  │   }
  ├── creationType: "immediate" | "promoted"
  ├── candidateId: UUIDv7 | null
  ├── currentBlastRadiusId: UUIDv7 | null
  ├── currentPlanId: UUIDv7 | null
  ├── currentPlanVersion: number | null
  ├── mergedFrom: UUIDv7[]
  ├── detectedAt: timestamp
  ├── createdAt: timestamp
  ├── updatedAt: timestamp
  ├── closedAt: timestamp | null
  └── schemaVersion: number

IncidentStatus: "new" | "investigating" | "recovery-planning"
              | "recovering" | "validating" | "restored"
              | "partial" | "closed" | "merged"
```

### ClassificationRationale (embedded, immutable per incident creation)

```
ClassificationRationale
  ├── signals: DetectionSignal[]
  ├── scoreAtCreation: number
  ├── scoreAtPromotion: number | null
  ├── immediateCreationCriteria: string[] | null
  ├── promotionEvidence: string[] | null
  └── narrative: string
```

### IncidentLifecycleTransition (IMMUTABLE)

```
IncidentLifecycleTransition
  ├── transitionId: UUIDv7
  ├── tenantId: UUIDv7
  ├── incidentId: UUIDv7
  ├── fromStatus: IncidentStatus
  ├── toStatus: IncidentStatus
  ├── triggeredBy: ActorInfo
  ├── reason: string
  ├── timestamp: timestamp
  └── schemaVersion: number
```

---

## 11. Entity Schemas: Blast-Radius Layer

### BlastRadiusResult

```
BlastRadiusResult (IMMUTABLE per computation)
  ├── resultId: UUIDv7
  ├── tenantId: UUIDv7
  ├── incidentId: UUIDv7
  ├── computedAt: timestamp
  ├── rootChangeIds: UUIDv7[]
  ├── totalImpactedObjects: number
  ├── impactedObjects: ImpactedObject[]
  ├── overallConfidence: ConfidenceInfo
  ├── graphRefreshAge: duration
  ├── computationDuration: duration
  └── schemaVersion: number
```

### ImpactedObject (embedded in BlastRadiusResult)

```
ImpactedObject
  ├── objectId: string              // external Microsoft ID
  ├── objectType: ObjectType
  ├── displayName: string
  ├── category: string              // "Identities" | "SharePoint" | "Exchange" | "Teams" | "Applications" | "Conditional Access"
  ├── impactClassification: ImpactClassification
  ├── confidence: ConfidenceInfo
  ├── dependencyChain: DependencyChainStep[]
  ├── beforeState: StateSnapshot | null
  ├── afterState: StateSnapshot | null
  ├── recommendedActionType: ActionType
  ├── recommendedAction: string
  ├── propagationDelay: duration | null
  └── recoveryTier: number          // 0=identity, 1=identity-validation, 2=data, 3=downstream, 4=final
```

### DependencyChainStep (embedded)

```
DependencyChainStep
  ├── fromObjectId: string
  ├── fromObjectType: ObjectType
  ├── edgeType: string              // "MEMBER_OF", "ASSIGNED_TO", "INHERITS_ACCESS_FROM", etc.
  ├── toObjectId: string
  ├── toObjectType: ObjectType
  ├── edgeConfidence: "authoritative" | "inferred" | "stale"
  └── edgeSource: SourceSystem
```

---

## 12. Entity Schemas: Baseline Layer

### BaselineVersion

```
BaselineVersion (IMMUTABLE content; MUTABLE approval status)
  ├── tenantId: UUIDv7
  ├── versionId: number             // monotonic per tenant
  ├── capturedAt: timestamp
  ├── approvalStatus: "pending" | "approved" | "flagged" | "invalidated" | "superseded"
  ├── approvedBy: string | null
  ├── approvedAt: timestamp | null
  ├── pinnedUntil: timestamp | null
  ├── changeSummary: { added: number, removed: number, modified: number }
  ├── objectCount: number
  ├── objectSnapshotBlobRef: string  // reference to blob storage location
  └── schemaVersion: number
```

### ObjectSnapshot (stored in blob, referenced by BaselineVersion)

```
ObjectSnapshot (IMMUTABLE)
  ├── objectId: string              // external Microsoft ID
  ├── objectType: ObjectType
  ├── displayName: string
  ├── state: object                 // full serialized state
  ├── stateHash: string             // SHA-256
  ├── captureSource: SourceSystem
  ├── capturedAt: timestamp
  ├── confidence: "high" | "medium" | "low"
  └── reviewFlag: string | null
```

### DriftRecord (IMMUTABLE)

```
DriftRecord
  ├── driftId: UUIDv7
  ├── tenantId: UUIDv7
  ├── detectedAt: timestamp
  ├── objectId: string
  ├── objectType: ObjectType
  ├── baselineVersionId: number
  ├── baselineState: StateSnapshot
  ├── observedState: StateSnapshot
  ├── driftType: "added" | "removed" | "modified"
  ├── severity: SeverityLevel
  ├── resolution: "pending" | "acknowledged" | "absorbed" | "incident-created"
  ├── resolvedBy: string | null
  └── schemaVersion: number
```

---

## 13. Entity Schemas: Recovery and Execution Layer

### RecoveryPlan

```
RecoveryPlan (IMMUTABLE per version)
  ├── planId: UUIDv7
  ├── tenantId: UUIDv7
  ├── incidentId: UUIDv7
  ├── version: number               // monotonic per incident
  ├── status: "draft" | "pending-approval" | "executing" | "completed" | "partial" | "failed" | "cancelled" | "superseded"
  ├── baselineVersionId: number
  ├── steps: RecoveryStep[]
  ├── trustedStateOutcome: TrustedStateOutcome | null
  ├── generatedAt: timestamp
  ├── supersededBy: { planId, version } | null
  └── schemaVersion: number
```

### RecoveryStep (embedded in RecoveryPlan)

```
RecoveryStep
  ├── stepId: UUIDv7
  ├── order: number
  ├── tier: number
  ├── actionType: ActionType
  ├── targetObjectId: string
  ├── targetObjectType: ObjectType
  ├── targetObjectName: string
  ├── targetState: StateSnapshot
  ├── currentStateAtPlan: StateSnapshot
  ├── dependsOn: UUIDv7[]           // stepIds
  ├── approvalRequired: boolean
  ├── executionMode: "system" | "manual" | "recommendation-only"
  ├── status: StepStatus
  ├── rationale: string
  ├── dependencyChain: string
  ├── confidence: ConfidenceInfo
  ├── propagationDelay: duration | null
  ├── approvalId: UUIDv7 | null
  ├── actionInstanceId: UUIDv7 | null
  └── validationRecordId: UUIDv7 | null

StepStatus: "generated" | "blocked" | "pending-approval" | "ready"
          | "executing" | "completed" | "partially-completed"
          | "failed" | "verified" | "skipped" | "deferred"
```

### ApprovalRecord (IMMUTABLE)

```
ApprovalRecord
  ├── approvalId: UUIDv7
  ├── tenantId: UUIDv7
  ├── incidentId: UUIDv7
  ├── planId: UUIDv7
  ├── planVersion: number
  ├── stepId: UUIDv7
  ├── approvedBy: string
  ├── approvedAt: timestamp
  ├── expiresAt: timestamp
  ├── stateHashAtApproval: string
  ├── targetObjectId: string
  ├── targetState: object
  ├── signature: string
  ├── invalidated: boolean
  ├── invalidatedReason: string | null
  └── schemaVersion: number
```

### ActionInstance (MUTABLE — lifecycle status)

```
ActionInstance
  ├── instanceId: UUIDv7
  ├── tenantId: UUIDv7
  ├── templateId: string
  ├── incidentId: UUIDv7
  ├── planId: UUIDv7
  ├── planVersion: number
  ├── stepId: UUIDv7
  ├── approvalId: UUIDv7
  ├── targetObjectId: string
  ├── targetObjectName: string
  ├── membersToRemove: MemberTarget[]     // v1-specific for group rollback
  ├── expectedPostState: StateSnapshot
  ├── status: ActionStatus
  ├── subActions: SubAction[]
  ├── preExecutionState: StateSnapshot | null
  ├── postExecutionState: StateSnapshot | null
  ├── circuitBroken: boolean
  ├── validationHandoffId: UUIDv7 | null
  ├── createdAt: timestamp
  ├── startedAt: timestamp | null
  ├── completedAt: timestamp | null
  └── schemaVersion: number

ActionStatus: "created" | "validating" | "ready" | "blocked"
            | "executing" | "partially-completed" | "completed"
            | "failed" | "cancelled"
```

### SubAction (MUTABLE — lifecycle status)

```
SubAction
  ├── subActionId: UUIDv7
  ├── actionInstanceId: UUIDv7
  ├── memberId: string
  ├── memberUPN: string
  ├── status: SubActionStatus
  ├── preReadResult: "present" | "absent" | "read-failed"
  ├── attempts: ExecutionAttempt[]
  ├── postReadResult: "present" | "absent" | "read-failed" | null
  └── completedAt: timestamp | null

SubActionStatus: "pending" | "pre-reading" | "already-absent"
               | "executing" | "removed" | "failed" | "retrying" | "not-attempted"
```

### ExecutionAttempt (IMMUTABLE)

```
ExecutionAttempt
  ├── attemptNumber: number
  ├── startedAt: timestamp
  ├── completedAt: timestamp
  ├── httpStatus: number | null
  ├── graphCorrelationId: string | null
  ├── outcome: "success" | "already-absent" | "rate-limited" | "server-error" | "timeout" | "permission-denied" | "bad-request"
  ├── retryAfter: number | null
  └── errorDetail: string | null
```

### ValidationRecord (IMMUTABLE)

```
ValidationRecord
  ├── validationId: UUIDv7
  ├── tenantId: UUIDv7
  ├── incidentId: UUIDv7
  ├── stepId: UUIDv7
  ├── objectId: string
  ├── targetState: StateSnapshot
  ├── observedState: StateSnapshot
  ├── result: "match" | "mismatch" | "pending-propagation" | "unknown"
  ├── confidence: ConfidenceInfo
  ├── validatedAt: timestamp
  ├── revalidateAt: timestamp | null
  ├── revalidationId: UUIDv7 | null
  └── schemaVersion: number
```

### TrustedStateOutcome (embedded in RecoveryPlan)

```
TrustedStateOutcome
  ├── status: "restored" | "partial" | "failed" | "pending"
  ├── evaluatedAt: timestamp
  ├── verifiedSteps: number
  ├── failedSteps: number
  ├── unresolvedSteps: number
  ├── approvedBy: string | null
  └── notes: string | null
```

---

## 14. Entity Schemas: Audit Layer

### AuditRecord (IMMUTABLE, append-only)

```
AuditRecord
  ├── auditRecordId: UUIDv7
  ├── tenantId: UUIDv7
  ├── eventType: AuditEventType
  ├── actor: ActorInfo
  ├── entityType: string            // which entity was affected
  ├── entityId: string              // ID of the affected entity
  ├── action: string                // "created" | "approved" | "executed" | "status-changed" | "suppressed" | etc.
  ├── detail: object                // event-specific payload
  ├── previousHash: string          // SHA-256 of previous record (hash chain)
  ├── recordHash: string            // SHA-256 of this record
  ├── timestamp: timestamp
  └── schemaVersion: number

AuditEventType: "raw-event-ingested" | "change-normalized" | "bundle-correlated"
              | "candidate-created" | "candidate-promoted" | "candidate-suppressed"
              | "incident-created" | "incident-status-changed" | "incident-closed"
              | "blast-radius-computed" | "baseline-captured" | "baseline-approved"
              | "plan-generated" | "step-approved" | "step-rejected"
              | "action-executed" | "action-failed" | "validation-completed"
              | "safe-mode-activated" | "credential-rotated" | "operator-login"
              | "self-action-detected" | "unauthorized-write-detected"
```

---

## 15. Relationship Model

```
Tenant
  │
  ├── 1:N → RawEvent
  ├── 1:N → NormalizedChange
  ├── 1:N → CorrelatedChangeBundle
  ├── 1:N → IncidentCandidate
  ├── 1:N → Incident
  ├── 1:N → BaselineVersion
  ├── 1:N → AuditRecord
  ├── 1:1 → TenantPolicy
  └── 1:N → SensitivityList
  
RawEvent ──(1:N)──▶ NormalizedChange   (via rawEventIds)
NormalizedChange ──(N:1)──▶ CorrelatedChangeBundle (via bundleId)
CorrelatedChangeBundle ──(1:0..1)──▶ IncidentCandidate
IncidentCandidate ──(0..1:1)──▶ Incident (via promotedToIncidentId)

Incident ──(1:0..1)──▶ BlastRadiusResult (via currentBlastRadiusId)
Incident ──(1:0..N)──▶ RecoveryPlan (multiple versions)
BlastRadiusResult ──(1:N)──▶ ImpactedObject (embedded)

RecoveryPlan ──(1:N)──▶ RecoveryStep (embedded)
RecoveryStep ──(0..1:1)──▶ ApprovalRecord (via approvalId)
RecoveryStep ──(0..1:1)──▶ ActionInstance (via actionInstanceId)
RecoveryStep ──(0..1:1)──▶ ValidationRecord (via validationRecordId)

ActionInstance ──(1:N)──▶ SubAction (embedded)
SubAction ──(1:N)──▶ ExecutionAttempt (embedded)

BaselineVersion ──(1:N)──▶ ObjectSnapshot (via blob reference)

All entities ──(N:N)──▶ AuditRecord (via entityType + entityId)
```

---

## 16. Versioning Strategy

| Entity | Versioning Model | How "Current" Is Tracked |
|--------|-----------------|-------------------------|
| **BaselineVersion** | New record per version (versionId increments) | `Incident.baselineVersionId` or "latest approved" query |
| **RecoveryPlan** | New record per version (planId stable, version increments) | `Incident.currentPlanVersion` pointer |
| **BlastRadiusResult** | New record per computation (resultId changes) | `Incident.currentBlastRadiusId` pointer |
| **Incident** | Single record, mutable status | In-place update + `IncidentLifecycleTransition` history |
| **ActionInstance** | Single record, mutable status | In-place update + `ExecutionAttempt` history |
| **ApprovalRecord** | Immutable per decision | `invalidated` flag can be set (only addition, never deletion of approval) |

### What Gets Versioned as New Record vs Updated In Place

| Entity | New Record | Updated In Place |
|--------|-----------|-----------------|
| Baseline | ✅ (new version) | Approval status only |
| Recovery plan | ✅ (new version when replanned) | Plan status on current version |
| Blast-radius result | ✅ (new computation) | Never |
| Incident | Never (single record) | Status, severity, confidence, currentPlanVersion |
| Action instance | Never | Status, subAction statuses |

---

## 17. Mutable vs Immutable Boundaries

| Category | Entities | Rule |
|----------|---------|------|
| **Always immutable** | RawEvent, NormalizedChange, SuppressionRecord, ExecutionAttempt, AuditRecord, ApprovalRecord, ValidationRecord, IncidentLifecycleTransition, ClassificationRationale | Created once, never modified |
| **Immutable per version** | BaselineVersion (content), RecoveryPlan, RecoveryStep, BlastRadiusResult, ImpactedObject | Each version is immutable; new version = new record |
| **Mutable status, immutable content** | BaselineVersion (approval status), ApprovalRecord (invalidated flag) | Content fields frozen; only status/flag fields change |
| **Mutable current state** | Incident, IncidentCandidate, ActionInstance, SubAction, Tenant, TenantPolicy, SensitivityList | Status and operational fields change; changes tracked via transitions or audit |

---

## 18. Lifecycle and State Enums (Consolidated)

| Enum | Values | Used By |
|------|--------|---------|
| **IncidentStatus** | new, investigating, recovery-planning, recovering, validating, restored, partial, closed, merged | Incident |
| **CandidateStatus** | open, promoted, suppressed, expired | IncidentCandidate |
| **StepStatus** | generated, blocked, pending-approval, ready, executing, completed, partially-completed, failed, verified, skipped, deferred | RecoveryStep |
| **ActionStatus** | created, validating, ready, blocked, executing, partially-completed, completed, failed, cancelled | ActionInstance |
| **SubActionStatus** | pending, pre-reading, already-absent, executing, removed, failed, retrying, not-attempted | SubAction |
| **ValidationResult** | match, mismatch, pending-propagation, unknown | ValidationRecord |
| **BaselineApproval** | pending, approved, flagged, invalidated, superseded | BaselineVersion |
| **TrustedStateStatus** | restored, partial, failed, pending | TrustedStateOutcome |
| **SeverityLevel** | critical, high, medium, low | Incident, DriftRecord |
| **UrgencyLevel** | immediate, within-hour, within-day, informational | Incident |
| **ConfidenceLevel** | high, medium, low, unknown | ConfidenceInfo |
| **ActionType** | rollback, restoration, compensating-action, validation, manual | RecoveryStep, ImpactedObject |
| **ImpactClassification** | direct, structural, behavioral, transitive, adjacent | ImpactedObject |

---

## 19. Storage and Access Considerations

| Entity | Storage Target | Access Pattern | Partition Strategy |
|--------|---------------|---------------|-------------------|
| RawEvent | Blob (per-tenant) | Append-only write; rare read (forensics/replay) | Date-partitioned blobs |
| NormalizedChange | Table (per-tenant) | Write once; query by tenant+time, tenant+objectId | Tenant + date partition |
| Incident | Table (per-tenant) | Frequent read/write; query by status, severity | Tenant + status partition |
| BlastRadiusResult | Blob (per-tenant) | Write per computation; read by incident | Incident-keyed blob |
| BaselineVersion | Blob (per-tenant, snapshots) + Table (metadata) | Blob for snapshot data; Table for version metadata | Version-keyed |
| RecoveryPlan | Table (per-tenant) | Query by incident; read/write during recovery | Incident + version key |
| ApprovalRecord | Table (per-tenant) | Write once; query by incident/step | Incident-keyed |
| ActionInstance | Table (per-tenant) | Read/write during execution; query by incident | Incident-keyed |
| AuditRecord | Immutable Blob (per-tenant) | Append-only; read for forensics/compliance | Date-partitioned, hash-chained |
| Tenant/Config | Cosmos DB (shared) | Frequent read; rare write | TenantId partition |

---

## 20. API / Resource Mapping

| API Resource | Canonical Entity | Notes |
|-------------|-----------------|-------|
| `GET /incidents` | Incident | Direct mapping; list with filters |
| `GET /incidents/{id}` | Incident | Direct + embedded summary fields |
| `GET /incidents/{id}/changes` | NormalizedChange (filtered) | Filtered by incident's changeIds |
| `GET /incidents/{id}/blast-radius` | BlastRadiusResult | Current result for incident |
| `GET /incidents/{id}/blast-radius/objects/{objId}` | ImpactedObject | Single object from result |
| `GET /incidents/{id}/plans/{version}` | RecoveryPlan | Specific version |
| `GET /incidents/{id}/plans/{version}/steps` | RecoveryStep[] | Steps within plan |
| `POST /.../steps/{stepId}/approve` | Creates ApprovalRecord | Returns approval token |
| `GET /incidents/{id}/validation` | Computed from ValidationRecord[] | Aggregated validation view |
| `GET /incidents/{id}/audit` | AuditRecord (filtered) | Filtered by entityId = incidentId |
| `GET /baselines` | BaselineVersion (metadata) | List with approval status filter |
| `GET /baselines/{versionId}` | BaselineVersion + ObjectSnapshot[] | Version detail with snapshots |
| `GET /audit` | AuditRecord | Global audit with filters |

API views that aggregate multiple entities (e.g., incident overview combining Incident + BlastRadiusResult summary + RecoveryPlan status) are computed at the API layer, not stored as separate entities.

---

## 21. Schema Evolution and Compatibility

### `schemaVersion` Field

Every entity carries a `schemaVersion: number` field. This is set at creation time and never changes for immutable records.

### Evolution Rules

1. **New optional fields:** Adding an optional field to an entity schema is a backward-compatible change. Existing records without the field are valid. Schema version increments.
2. **New required fields:** Adding a required field requires a migration. Historical records receive a default value. Schema version increments.
3. **Removing fields:** Fields are never removed. They are deprecated (ignored by new code) but retained in storage for historical records.
4. **Changing field types:** Not permitted. Create a new field with the new type; deprecate the old field.
5. **Changing enum values:** New values can be added. Existing values cannot be removed or renamed.

### Replay Compatibility

The normalization pipeline must be able to re-process historical RawEvents using the current schema. This means the normalizer must handle all historical `schemaVersion` values. Missing fields in old records are filled with defaults during replay.

---

## 22. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Schema drift across services | Services disagree on field names/types; data corruption | High | Shared schema package imported by all services; CI schema validation |
| Duplicate representations of same concept | Conflicting definitions of "severity" or "confidence" | Medium | This document as single source of truth; shared types defined once |
| Mutable records lose history | Status changes on Incident or ActionInstance overwrite previous state | High | IncidentLifecycleTransition records every change; AuditRecord logs all mutations |
| Poor versioning causes audit ambiguity | "Which plan version was approved?" becomes unanswerable | High | Explicit version numbers; ApprovalRecord references planVersion; immutable plan versions |
| API/resource mismatch with storage | API returns computed views that silently diverge from canonical entities | Medium | API resources map 1:1 to entities where possible; aggregated views explicitly documented |
| Tenant scoping bug in shared types | ActorInfo or ConfidenceInfo missing tenantId in context | Medium | TenantId required on every entity; shared types are embedded, not standalone |
| Confidence/provenance inconsistently modeled | Some entities carry confidence, others do not | Medium | ConfidenceInfo and ProvenanceInfo are required on all entities asserting external state |
| Schema migration breaks audit replay | Historical records cannot be re-processed after schema change | High | schemaVersion field on every record; normalizer handles all versions; never remove fields |

---

## 23. Open Questions

1. **Should RecoveryStep be an embedded sub-document of RecoveryPlan or a separate entity?** Embedding simplifies versioning (plan + steps are one atomic unit). Separate entities enable step-level querying. Current recommendation: embedded, with step-level API access via computed views.

2. **Should ImpactedObject carry its own ID or be identified only by position within BlastRadiusResult?** A stable ID per impacted object enables cross-reference from RecoveryStep. Current recommendation: use a composite key (resultId + externalObjectId).

3. **Should the system maintain a persistent "object registry" mapping external Microsoft IDs to KavachIQ tracking metadata?** This would enable cross-incident object history (e.g., "this group was involved in 3 incidents in the last 90 days"). Useful but adds storage and consistency complexity.

4. **Should DriftRecord be a first-class entity or an embedded observation within a baseline comparison?** First-class enables drift querying and alerting independently of baselines. Current recommendation: first-class.

5. **What is the maximum acceptable blob size for a BaselineVersion's ObjectSnapshot collection?** A large tenant might have 50,000 object snapshots. At ~1KB per snapshot, that is ~50MB per baseline version. Is this acceptable as a single blob, or should snapshots be sharded?

6. **Should the audit hash chain be per-tenant or global?** Per-tenant is simpler and aligns with tenant isolation. Global provides stronger tamper evidence (harder to rewrite one tenant's chain without affecting others). Current recommendation: per-tenant.

---

## 24. Recommendation Summary

### Build for v1

- **25 canonical entities** organized in 5 layers (Ingestion, Incident, Analysis, Recovery, Audit)
- **UUIDv7** for all system-generated IDs; external Microsoft IDs as reference fields
- **6 shared embedded types** (ActorInfo, TargetInfo, ConfidenceInfo, ProvenanceInfo, StateSnapshot, TimeMetadata) reused across entities
- **14 canonical enums** consolidated from all prior design docs
- **Explicit immutability:** 12 entity types are always-immutable; 5 are mutable current-state; 3 are immutable-per-version
- **`schemaVersion`** on every entity for forward-compatible evolution
- **Hash-chained audit records** in immutable blob storage

### Defer to v2+

- Persistent object registry for cross-incident object history
- Analytics/warehouse schema
- External integration schemas (SIEM export, ITSM ticket)
- Customer-visible schema documentation / API specification (OpenAPI)
- Schema auto-generation from canonical definitions

### Assumptions That Must Hold

1. UUIDv7 is supported by all target storage engines (Azure Table, Blob, Cosmos DB) without performance issues.
2. Embedded entities (RecoveryStep within RecoveryPlan, ImpactedObject within BlastRadiusResult) do not exceed storage engine document-size limits.
3. Per-tenant Table Storage supports the query patterns needed for operational hot-path entities (incidents, plans, actions) without requiring a relational database.
4. The `schemaVersion` + backward-compatible evolution strategy is sufficient for the first 12-18 months without requiring a full migration framework.

### Prototype/Validate Next

1. **Entity size validation.** Create a realistic BlastRadiusResult with 50 ImpactedObjects, each with 3-step dependency chains. Measure serialized size. Confirm it fits within Azure Table Storage entity limits (1MB) or validate that blob storage is needed.
2. **Query performance.** Populate Azure Table Storage with 10,000 NormalizedChange records for one tenant. Measure query latency for: changes-by-date, changes-by-objectId, changes-by-bundleId. Confirm sub-second response for operational queries.
3. **Schema package prototype.** Create the shared TypeScript schema package defining all canonical types and enums. Import it into two test services. Verify that schema drift is caught at compile time.
