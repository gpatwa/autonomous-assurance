/**
 * Canonical enums for the KavachIQ platform.
 * Source of truth: docs/DATA_MODEL_AND_SCHEMA_SPECIFICATION.md
 */

// ─── Object and change types ─────────────────────────────────────────────────

export type ObjectType =
  | "user"
  | "group"
  | "application"
  | "servicePrincipal"
  | "conditionalAccessPolicy"
  | "roleAssignment"
  | "sharepointSite"
  | "team"
  | "mailbox";

export type ChangeType =
  | "memberAdded"
  | "memberRemoved"
  | "propertyModified"
  | "objectCreated"
  | "objectDeleted"
  | "assignmentAdded"
  | "assignmentRemoved"
  | "policyModified"
  | "permissionChanged";

export type SourceSystem =
  | "entra-audit"
  | "m365-audit"
  | "graph-webhook"
  | "graph-api-read"
  | "snapshot-diff"
  | "operator"
  | "kavachiq-system";

// ─── Severity, urgency, confidence ───────────────────────────────────────────

export type SeverityLevel = "critical" | "high" | "medium" | "low";
export type UrgencyLevel = "immediate" | "within-hour" | "within-day" | "informational";
export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

// ─── Action and impact ───────────────────────────────────────────────────────

export type ActionType =
  | "rollback"
  | "restoration"
  | "compensating-action"
  | "validation"
  | "manual";

export type ImpactClassification =
  | "direct"
  | "structural"
  | "behavioral"
  | "transitive"
  | "adjacent";

// ─── Lifecycle states ────────────────────────────────────────────────────────

export type IncidentStatus =
  | "new"
  | "investigating"
  | "recovery-planning"
  | "recovering"
  | "validating"
  | "restored"
  | "partial"
  | "closed"
  | "merged";

export type CandidateStatus = "open" | "promoted" | "suppressed" | "expired";

export type StepStatus =
  | "generated"
  | "blocked"
  | "pending-approval"
  | "ready"
  | "executing"
  | "completed"
  | "partially-completed"
  | "failed"
  | "verified"
  | "skipped"
  | "deferred";

export type ActionStatus =
  | "created"
  | "validating"
  | "ready"
  | "blocked"
  | "executing"
  | "partially-completed"
  | "completed"
  | "failed"
  | "cancelled";

export type SubActionStatus =
  | "pending"
  | "pre-reading"
  | "already-absent"
  | "executing"
  | "removed"
  | "failed"
  | "retrying"
  | "not-attempted";

export type ValidationResult = "match" | "mismatch" | "pending-propagation" | "unknown";

export type BaselineApprovalStatus =
  | "pending"
  | "approved"
  | "flagged"
  | "invalidated"
  | "superseded";

export type TrustedStateStatus = "restored" | "partial" | "failed" | "pending";

export type AuditEventType =
  | "raw-event-ingested"
  | "change-normalized"
  | "bundle-correlated"
  | "candidate-created"
  | "candidate-promoted"
  | "candidate-suppressed"
  | "incident-created"
  | "incident-status-changed"
  | "incident-closed"
  | "blast-radius-computed"
  | "baseline-captured"
  | "baseline-approved"
  | "plan-generated"
  | "step-approved"
  | "step-rejected"
  | "action-executed"
  | "action-failed"
  | "validation-completed"
  | "safe-mode-activated"
  | "credential-rotated"
  | "operator-login"
  | "self-action-detected"
  | "unauthorized-write-detected";
