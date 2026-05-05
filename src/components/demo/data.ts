// ─── Demo data: hybrid sourcing ──────────────────────────────────────────────
//
// This module powers the /demo interactive walkthrough. It is intentionally
// a hybrid of TWO sources:
//
//   1. **Platform-derived (real WI-05 evidence).** Imported directly from
//      `platform/fixtures/canonical/`, which are the deterministic outputs
//      of the @kavachiq/core Phase 1 pipeline (normalization → correlation
//      → detection) run against 12 real Microsoft Entra audit events
//      captured during the WI-05 spike. Anything tagged FROM_PLATFORM here
//      is byte-for-byte what the live pipeline emits today.
//
//   2. **UI augmentation (buyer-friendly narrative).** Hand-built downstream
//      context — user display names, SharePoint/Exchange/Teams/SAP
//      cross-system blast radius, the recovery sequence, the resolution
//      checks. Tagged UI_AUGMENTATION. These represent Phase 2 (blast
//      radius), Phase 3 (recovery planning), and Phase 4 (execution +
//      validation), which are on the roadmap but not yet implemented.
//
// The demo's visual narrative is unchanged from the previous hand-written
// version — same Sarah Chen / Alex Rivera / Finance-Privileged-Access
// story. What changed: the structural backbone (incident ID, title,
// classification rationale, change count, timing window, primary actor,
// target group ID) now comes from the real pipeline output, not invented
// constants. A technical buyer drilling into "where do these numbers come
// from?" gets a defensible answer.
//
// See `docs/AGENTS_SUBDOMAIN_SEO_PLAN.md` for the parent IA, and
// `docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md` for the WI-05 evidence
// summary surfaced at /evidence.

import incidentJson from "../../../platform/fixtures/canonical/incident.json";
import bundleJson from "../../../platform/fixtures/canonical/correlated-bundle.json";
import normalizedChangesJson from "../../../platform/fixtures/canonical/normalized-changes.json";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ActionType = "rollback" | "restoration" | "compensating-action" | "validation";
export type StepStatus = "pending" | "in-progress" | "completed" | "requires-approval";
export type EventStatus = "detected" | "analyzed" | "recommended" | "approved" | "executed" | "verified";

export interface Incident {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  status: string;
  agent: string;
  sessionId: string;
  timestamp: string;
  summary: string;
  affectedSystemsCount: number;
}

export interface ChangedObject {
  type: string;
  name: string;
  objectId: string;
  changeType: string;
  before: { members: string[]; count: number };
  after: { members: string[]; count: number };
  addedMembers: { name: string; upn: string; role: string }[];
}

export interface BlastRadiusItem {
  category: string;
  icon: string;
  count: number;
  items: { name: string; detail: string }[];
}

export interface RecoveryStep {
  id: number;
  order: number;
  action: string;
  type: ActionType;
  target: string;
  status: StepStatus;
  approvalRequired: boolean;
  rationale: string;
}

export interface TimelineEvent {
  timestamp: string;
  action: string;
  actor: string;
  status: EventStatus;
  detail: string;
}

export interface AffectedObject {
  id: string;
  name: string;
  type: string;
  category: string;
  impactReason: string;
  before: { label: string; value: string }[];
  after: { label: string; value: string }[];
  affectedIdentities: number;
  dependencyNote: string;
  recommendedAction: string;
  actionType: ActionType;
}

export interface ResolutionCheck {
  area: string;
  status: "verified" | "pending" | "warning";
  detail: string;
}

// ─── Provenance helpers ──────────────────────────────────────────────────────
// `dataProvenance` exposes the real-vs-augmented split to UI components and
// to a small footer the demo can render. Update this list when more of the
// demo becomes platform-driven (Phase 2 blast radius, Phase 3 recovery plan).

export const dataProvenance = {
  platformDriven: [
    "Incident identifier, title, severity, urgency, confidence",
    "Classification rationale + the 4 weighted signals (score 95)",
    "Change count (12), correlation signals, time-cluster spread",
    "Target group identifier, primary actor (service-principal)",
    "Detected-at timestamp",
  ],
  uiAugmentation: [
    "User display names (Phase 2/3 baseline + identity enrichment)",
    "Cross-system blast radius (Phase 2 not yet built)",
    "Recovery plan steps + sequencing (Phase 3 not yet built)",
    "Resolution checks (Phase 4 not yet built)",
  ],
  evidenceLink: "/evidence",
} as const;

// ─── Derived structural fields (FROM_PLATFORM) ───────────────────────────────

const PLATFORM_INCIDENT = incidentJson as {
  incidentId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  detectedAt: string;
  rootChangeIds: string[];
  classificationRationale: { scoreAtCreation: number };
};
const PLATFORM_BUNDLE = bundleJson as {
  bundleId: string;
  primaryActor: { id: string; displayName: string };
  affectedObjectIds: string[];
  timeRange: { start: string; end: string };
  correlationSignals: string[];
  incidentCandidateScore: number;
};
const PLATFORM_CHANGES = normalizedChangesJson as Array<{
  changeId: string;
  observedAt: string;
  afterState: { state: { groupId: string; groupDisplayName: string; userId: string; userPrincipalName?: string } };
  target: { displayName: string };
}>;

const TARGET_GROUP_ID = PLATFORM_BUNDLE.affectedObjectIds[0]!;
const TARGET_GROUP_NAME = PLATFORM_CHANGES[0]!.afterState.state.groupDisplayName;
const REAL_CHANGE_COUNT = PLATFORM_INCIDENT.rootChangeIds.length;
const REAL_DETECTED_AT = PLATFORM_INCIDENT.detectedAt;
const REAL_SCORE = PLATFORM_BUNDLE.incidentCandidateScore;

// Helper: shorten the canonical inc_<uuid> id into a buyer-friendly form
// while preserving the real identifier as the source of truth.
function formatIncidentId(realId: string, detectedAt: string): string {
  const datePart = detectedAt.slice(0, 10).replace(/-/g, "");
  const shortHash = realId.replace(/^inc_/, "").slice(0, 4).toUpperCase();
  return `INC-${datePart}-${shortHash}`;
}

function offsetSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

// ─── Mock data ───────────────────────────────────────────────────────────────

// FROM_PLATFORM: id (derived from real), title (verbatim), severity,
//   timestamp (real detected-at), agent display name (real SP).
// UI_AUGMENTATION: status string, sessionId placeholder (Microsoft does not
//   issue per-call session IDs for client-credentials auth), buyer-friendly
//   summary, affected systems count (Phase 2 not built; manually set to 5
//   to match the hand-built blast radius below).
export const incident: Incident = {
  id: formatIncidentId(PLATFORM_INCIDENT.incidentId, REAL_DETECTED_AT),
  title: PLATFORM_INCIDENT.title,
  severity: PLATFORM_INCIDENT.severity,
  status: "Resolved — trusted state restored",
  agent: PLATFORM_BUNDLE.primaryActor.displayName,
  sessionId: "n/a (client-credentials auth — no per-call session ID)",
  timestamp: REAL_DETECTED_AT,
  summary:
    `A service-principal-initiated workflow added ${REAL_CHANGE_COUNT} users to the ` +
    `${TARGET_GROUP_NAME} security group in Microsoft Entra within a 3-second window. ` +
    `KavachIQ classified the change with score ${REAL_SCORE}/100 — high severity, ` +
    `immediate creation — and traced inherited access into SharePoint site collections, ` +
    `Exchange mailbox delegations, a Teams workspace, a downstream ERP application, and ` +
    `Conditional Access policy scope.`,
  affectedSystemsCount: 5,
};

// FROM_PLATFORM: name (real groupDisplayName), objectId (real Entra GUID),
//   after.count (derived from real change count + before baseline),
//   addedMembers length (12, matches real change count).
// UI_AUGMENTATION: before-state member names (Phase 2 baseline + identity
//   enrichment not built), addedMembers display names + roles + UPNs
//   (real WI-05 has kq-test-05@patwainc.onmicrosoft.com — replaced here
//   with buyer-friendly names; UPNs derive from the same display names).
const HAND_BUILT_BEFORE_MEMBERS = [
  "Sarah Chen (Finance Director)",
  "Michael Torres (CFO)",
  "Priya Sharma (Controller)",
  "James Wilson (Treasury Lead)",
];
const HAND_BUILT_ADDED_MEMBERS = [
  { name: "Alex Rivera", upn: "arivera@contoso.com", role: "Financial Analyst" },
  { name: "Jordan Lee", upn: "jlee@contoso.com", role: "AP Coordinator" },
  { name: "Casey Morgan", upn: "cmorgan@contoso.com", role: "Budget Analyst" },
  { name: "Taylor Brooks", upn: "tbrooks@contoso.com", role: "Payroll Specialist" },
  { name: "Morgan Chen", upn: "mchen@contoso.com", role: "Contract Admin" },
  { name: "Riley Adams", upn: "radams@contoso.com", role: "Financial Analyst" },
  { name: "Jamie Parker", upn: "jparker@contoso.com", role: "Tax Analyst" },
  { name: "Drew Thompson", upn: "dthompson@contoso.com", role: "Revenue Analyst" },
  { name: "Quinn Foster", upn: "qfoster@contoso.com", role: "Audit Associate" },
  { name: "Blake Martinez", upn: "bmartinez@contoso.com", role: "Compliance Analyst" },
  { name: "Avery Johnson", upn: "ajohnson@contoso.com", role: "FP&A Analyst" },
  { name: "Dakota Williams", upn: "dwilliams@contoso.com", role: "GL Accountant" },
];

export const changedObject: ChangedObject = {
  type: "Entra security group",
  name: TARGET_GROUP_NAME,
  objectId: TARGET_GROUP_ID,
  changeType: "Membership modification",
  before: {
    members: HAND_BUILT_BEFORE_MEMBERS,
    count: HAND_BUILT_BEFORE_MEMBERS.length,
  },
  after: {
    members: [
      ...HAND_BUILT_BEFORE_MEMBERS,
      ...HAND_BUILT_ADDED_MEMBERS.map((m) => m.name),
    ],
    count: HAND_BUILT_BEFORE_MEMBERS.length + REAL_CHANGE_COUNT,
  },
  addedMembers: HAND_BUILT_ADDED_MEMBERS.slice(0, REAL_CHANGE_COUNT),
};

// UI_AUGMENTATION: blast radius is Phase 2 work (not built). All entries
// hand-curated to match the canonical scenario story. Counts add up to the
// `incident.affectedSystemsCount` above.
export const blastRadius: BlastRadiusItem[] = [
  {
    category: "Identities",
    icon: "users",
    count: REAL_CHANGE_COUNT,
    items: [
      { name: `${REAL_CHANGE_COUNT} users added to privileged group`, detail: `Gained ${TARGET_GROUP_NAME} membership and all downstream entitlements` },
    ],
  },
  {
    category: "SharePoint",
    icon: "files",
    count: 3,
    items: [
      { name: "Finance-Confidential", detail: "Site collection with board materials and M&A documents" },
      { name: "Treasury-Operations", detail: "Site collection with banking credentials and wire procedures" },
      { name: "Audit-Working-Papers", detail: "Site collection with active audit workpapers and findings" },
    ],
  },
  {
    category: "Exchange",
    icon: "mail",
    count: REAL_CHANGE_COUNT,
    items: [
      { name: "CFO mailbox delegation", detail: `Full access delegation granted to ${REAL_CHANGE_COUNT} users` },
      { name: "Treasury shared mailbox", detail: "Send-as and read permissions inherited" },
      { name: "Finance-Exec distribution list", detail: "Membership expanded to include new group members" },
    ],
  },
  {
    category: "Teams",
    icon: "team",
    count: 1,
    items: [
      { name: "Finance-Leadership workspace", detail: "Team membership expanded; access to private channels and shared files inherited" },
    ],
  },
  {
    category: "Applications",
    icon: "app",
    count: 1,
    items: [
      { name: "SAP Finance (ERP)", detail: "Privileged app role assignment inherited through group membership; read/write access to GL and AP modules" },
    ],
  },
  {
    category: "Conditional Access",
    icon: "shield",
    count: 2,
    items: [
      { name: "Finance-MFA-Bypass policy", detail: `${REAL_CHANGE_COUNT} users now in scope for MFA bypass on trusted devices` },
      { name: "Finance-Data-Restriction policy", detail: "DLP exceptions expanded to include new group members" },
    ],
  },
];

// UI_AUGMENTATION: recovery plan is Phase 3 work (not built). Hand-built to
// represent the identity-first recovery sequence the platform will generate.
export const recoveryPlan: RecoveryStep[] = [
  {
    id: 1, order: 1,
    action: "Revert Entra group membership to pre-incident state",
    type: "rollback",
    target: `${TARGET_GROUP_NAME} (Entra group)`,
    status: "completed",
    approvalRequired: true,
    rationale: "Identity is the root of trust. Group membership must be reverted before any downstream recovery to prevent re-inheritance of access.",
  },
  {
    id: 2, order: 2,
    action: "Revoke inherited SharePoint site collection access",
    type: "compensating-action",
    target: "Finance-Confidential, Treasury-Operations, Audit-Working-Papers",
    status: "completed",
    approvalRequired: false,
    rationale: "SharePoint permissions inherited through group membership must be explicitly revoked to prevent cached or stale access tokens from persisting.",
  },
  {
    id: 3, order: 3,
    action: "Restore previous Exchange mailbox delegation state",
    type: "restoration",
    target: "CFO mailbox, Treasury shared mailbox, Finance-Exec DL",
    status: "completed",
    approvalRequired: false,
    rationale: "Mailbox delegations and distribution list membership must be restored to pre-incident state to prevent unauthorized mail access.",
  },
  {
    id: 4, order: 4,
    action: "Validate Conditional Access policy scope",
    type: "validation",
    target: "Finance-MFA-Bypass, Finance-Data-Restriction",
    status: "completed",
    approvalRequired: false,
    rationale: "Conditional Access policies must be validated to confirm that MFA bypass and DLP exception scope no longer includes the 12 reverted users.",
  },
  {
    id: 5, order: 5,
    action: "Confirm Teams workspace membership restored",
    type: "compensating-action",
    target: "Finance-Leadership workspace",
    status: "completed",
    approvalRequired: false,
    rationale: "Teams workspace membership inherited through group must be verified as reverted to prevent continued access to private channels and shared files.",
  },
  {
    id: 6, order: 6,
    action: "Verify downstream ERP entitlement rollback",
    type: "validation",
    target: "SAP Finance — GL and AP module access",
    status: "completed",
    approvalRequired: true,
    rationale: "Downstream application entitlements must be verified as revoked. ERP access carries financial transaction risk and requires explicit confirmation.",
  },
  {
    id: 7, order: 7,
    action: "Mark environment returned to trusted operational state",
    type: "validation",
    target: "Full incident scope",
    status: "completed",
    approvalRequired: true,
    rationale: "Final verification that all identity, data, and downstream system states match pre-incident baseline. Audit trail preserved.",
  },
];

// FROM_PLATFORM: detected event timestamp + change count come from real
//   incident.detectedAt and the bundle's change count.
// UI_AUGMENTATION: subsequent timeline events are Phase 2-4 outputs not yet
//   produced by the platform; their timestamps are derived as offsets from
//   the real detection time so the narrative reads coherently.
export const timeline: TimelineEvent[] = [
  {
    timestamp: REAL_DETECTED_AT,
    action: "Agent-driven change detected",
    actor: "KavachIQ — Change Monitor",
    status: "detected",
    detail: `${PLATFORM_BUNDLE.primaryActor.displayName} (service-principal, agent-identified) modified ${TARGET_GROUP_NAME} group membership. ${REAL_CHANGE_COUNT} users added in a 3-second window.`,
  },
  {
    timestamp: offsetSeconds(REAL_DETECTED_AT, 2),
    action: "Blast radius analysis initiated",
    actor: "KavachIQ — Impact Analyzer",
    status: "analyzed",
    detail: "Mapped downstream impact across 3 SharePoint sites, 12 Exchange delegations, 1 Teams workspace, 1 ERP application, and 2 Conditional Access policies.",
  },
  {
    timestamp: offsetSeconds(REAL_DETECTED_AT, 7),
    action: "Recovery plan generated",
    actor: "KavachIQ — Recovery Engine",
    status: "recommended",
    detail: "7-step identity-first recovery plan recommended. Entra group rollback prioritized before downstream compensating actions.",
  },
  {
    timestamp: offsetSeconds(REAL_DETECTED_AT, 104),
    action: "Recovery plan approved",
    actor: "Sarah Chen (Identity Admin)",
    status: "approved",
    detail: "Operator reviewed blast radius and recovery sequence. Approved rollback of Entra group membership and downstream recovery.",
  },
  {
    timestamp: offsetSeconds(REAL_DETECTED_AT, 106),
    action: "Entra group membership reverted",
    actor: "KavachIQ — Recovery Engine",
    status: "executed",
    detail: `${REAL_CHANGE_COUNT} users removed from ${TARGET_GROUP_NAME}. Group membership restored to ${HAND_BUILT_BEFORE_MEMBERS.length} original members.`,
  },
  {
    timestamp: offsetSeconds(REAL_DETECTED_AT, 150),
    action: "Downstream access revoked and validated",
    actor: "KavachIQ — Recovery Engine",
    status: "executed",
    detail: "SharePoint access revoked. Exchange delegations restored. Teams membership verified. Conditional Access scope validated. ERP entitlements confirmed revoked.",
  },
  {
    timestamp: offsetSeconds(REAL_DETECTED_AT, 175),
    action: "Trusted operational state confirmed",
    actor: "Sarah Chen (Identity Admin)",
    status: "verified",
    detail: "All identity, data, and downstream system states match pre-incident baseline. Incident closed with full audit trail.",
  },
];

// UI_AUGMENTATION: resolution checks are Phase 4 work (not built).
export const resolution: ResolutionCheck[] = [
  { area: "Entra group membership", status: "verified", detail: `${TARGET_GROUP_NAME} restored to ${HAND_BUILT_BEFORE_MEMBERS.length} original members` },
  { area: "SharePoint site access", status: "verified", detail: `All 3 site collections access reverted for ${REAL_CHANGE_COUNT} users` },
  { area: "Exchange delegations", status: "verified", detail: "CFO mailbox, Treasury shared mailbox, and Finance-Exec DL restored" },
  { area: "Teams collaboration", status: "verified", detail: "Finance-Leadership workspace membership restored to original scope" },
  { area: "Conditional Access policies", status: "verified", detail: "MFA bypass and DLP exception scope no longer includes reverted users" },
  { area: "Downstream application (SAP)", status: "verified", detail: "GL and AP module privileged access confirmed revoked" },
  { area: "Audit trail", status: "verified", detail: "Full incident timeline, blast radius, recovery actions, and operator approvals preserved" },
];

// ─── Affected objects (for blast-radius drill-down) — UI_AUGMENTATION ────────
// Phase 2 (blast radius) is not yet implemented; these are hand-curated to
// match the canonical scenario story. References to TARGET_GROUP_NAME and
// the real change count are pulled in so updates to the underlying scenario
// fixtures propagate here.

export const affectedObjects: AffectedObject[] = [
  {
    id: "obj-sp-fin-conf",
    name: "Finance-Confidential",
    type: "SharePoint site collection",
    category: "SharePoint",
    impactReason: `Permission inheritance through ${TARGET_GROUP_NAME} group membership`,
    before: [
      { label: "Authorized users", value: `${HAND_BUILT_BEFORE_MEMBERS.length} (finance leadership only)` },
      { label: "Permission source", value: "Direct group assignment" },
      { label: "Access level", value: "Full control" },
    ],
    after: [
      { label: "Authorized users", value: `${HAND_BUILT_BEFORE_MEMBERS.length + REAL_CHANGE_COUNT} (including ${REAL_CHANGE_COUNT} unauthorized)` },
      { label: "Permission source", value: "Inherited through expanded group" },
      { label: "Access level", value: "Full control — board materials and M&A documents exposed" },
    ],
    affectedIdentities: REAL_CHANGE_COUNT,
    dependencyNote: "Entra group membership must be reverted before SharePoint access revocation to prevent re-inheritance",
    recommendedAction: `Revoke inherited site collection permissions for ${REAL_CHANGE_COUNT} added users after group rollback`,
    actionType: "compensating-action",
  },
  {
    id: "obj-sp-treasury",
    name: "Treasury-Operations",
    type: "SharePoint site collection",
    category: "SharePoint",
    impactReason: `Permission inheritance through ${TARGET_GROUP_NAME} group membership`,
    before: [
      { label: "Authorized users", value: `${HAND_BUILT_BEFORE_MEMBERS.length} (treasury and finance leadership)` },
      { label: "Content sensitivity", value: "Banking credentials, wire transfer procedures" },
    ],
    after: [
      { label: "Authorized users", value: `${HAND_BUILT_BEFORE_MEMBERS.length + REAL_CHANGE_COUNT} (including ${REAL_CHANGE_COUNT} unauthorized)` },
      { label: "Content sensitivity", value: `Banking credentials and wire procedures exposed to ${REAL_CHANGE_COUNT} additional users` },
    ],
    affectedIdentities: REAL_CHANGE_COUNT,
    dependencyNote: "Depends on Entra group rollback (step 1)",
    recommendedAction: "Revoke inherited permissions and verify no cached access tokens remain",
    actionType: "compensating-action",
  },
  {
    id: "obj-ca-mfa",
    name: "Finance-MFA-Bypass",
    type: "Conditional Access policy",
    category: "Conditional Access",
    impactReason: "Policy group assignment scope expanded by agent-driven membership change",
    before: [
      { label: "Assignment scope", value: `${TARGET_GROUP_NAME} (${HAND_BUILT_BEFORE_MEMBERS.length} users)` },
      { label: "Policy effect", value: "MFA bypass on trusted devices for finance leadership" },
      { label: "Risk level", value: "Acceptable — limited to senior finance roles" },
    ],
    after: [
      { label: "Assignment scope", value: `${TARGET_GROUP_NAME} (${HAND_BUILT_BEFORE_MEMBERS.length + REAL_CHANGE_COUNT} users)` },
      { label: "Policy effect", value: `MFA bypass now applies to ${REAL_CHANGE_COUNT} additional users on any trusted device` },
      { label: "Risk level", value: "High — MFA bypass extended to non-privileged roles" },
    ],
    affectedIdentities: REAL_CHANGE_COUNT,
    dependencyNote: "Scope automatically corrects after group membership rollback, but must be explicitly validated",
    recommendedAction: "Validate that policy assignment scope matches pre-incident baseline after group rollback",
    actionType: "validation",
  },
  {
    id: "obj-ca-dlp",
    name: "Finance-Data-Restriction",
    type: "Conditional Access policy",
    category: "Conditional Access",
    impactReason: "DLP exception scope expanded through group membership",
    before: [
      { label: "DLP exception scope", value: `${HAND_BUILT_BEFORE_MEMBERS.length} finance leadership users` },
      { label: "Exception type", value: "External sharing allowed for board communications" },
    ],
    after: [
      { label: "DLP exception scope", value: `${HAND_BUILT_BEFORE_MEMBERS.length + REAL_CHANGE_COUNT} users including ${REAL_CHANGE_COUNT} non-leadership roles` },
      { label: "Exception type", value: "External sharing exception now includes analysts and coordinators" },
    ],
    affectedIdentities: REAL_CHANGE_COUNT,
    dependencyNote: "Depends on Entra group rollback (step 1)",
    recommendedAction: "Validate DLP exception scope no longer includes reverted users",
    actionType: "validation",
  },
  {
    id: "obj-app-sap",
    name: "SAP Finance (ERP)",
    type: "Enterprise application",
    category: "Applications",
    impactReason: "Privileged app role inherited through Entra group-based access assignment",
    before: [
      { label: "Privileged access", value: `${HAND_BUILT_BEFORE_MEMBERS.length} users with GL and AP module read/write` },
      { label: "Access path", value: `${TARGET_GROUP_NAME} → SAP Finance app role` },
      { label: "Transaction capability", value: "Journal entries, payment approvals, vendor management" },
    ],
    after: [
      { label: "Privileged access", value: `${HAND_BUILT_BEFORE_MEMBERS.length + REAL_CHANGE_COUNT} users with GL and AP module read/write` },
      { label: "Access path", value: "Inherited through expanded group membership" },
      { label: "Transaction capability", value: `${REAL_CHANGE_COUNT} unauthorized users can now create journal entries and approve payments` },
    ],
    affectedIdentities: REAL_CHANGE_COUNT,
    dependencyNote: "ERP entitlements may be cached. Requires explicit verification after group rollback, not just group reversion.",
    recommendedAction: "Verify app role assignment revocation and confirm no active ERP sessions for reverted users",
    actionType: "validation",
  },
  {
    id: "obj-teams-fin",
    name: "Finance-Leadership workspace",
    type: "Teams team",
    category: "Teams",
    impactReason: "Team membership inherited through Entra security group used as team owner/member source",
    before: [
      { label: "Team members", value: `${HAND_BUILT_BEFORE_MEMBERS.length} finance leadership users` },
      { label: "Private channels", value: "3 (Board-Prep, M&A-Active, Compensation-Review)" },
      { label: "Shared files", value: "Accessible only to current team members" },
    ],
    after: [
      { label: "Team members", value: `${HAND_BUILT_BEFORE_MEMBERS.length + REAL_CHANGE_COUNT} users including ${REAL_CHANGE_COUNT} non-leadership roles` },
      { label: "Private channels", value: "All 3 private channels now accessible to expanded membership" },
      { label: "Shared files", value: `Board prep documents and compensation data exposed to ${REAL_CHANGE_COUNT} additional users` },
    ],
    affectedIdentities: REAL_CHANGE_COUNT,
    dependencyNote: "Teams membership syncs from Entra group. Reversion should propagate, but must be confirmed due to sync delays.",
    recommendedAction: "Verify team membership restored and confirm no cached access to private channel content",
    actionType: "compensating-action",
  },
  {
    id: "obj-exch-cfo",
    name: "CFO mailbox delegation",
    type: "Exchange mailbox",
    category: "Exchange",
    impactReason: "Full-access mailbox delegation inherited through group membership",
    before: [
      { label: "Delegated access", value: `${HAND_BUILT_BEFORE_MEMBERS.length} finance leadership users` },
      { label: "Permission level", value: "Full access (read, send-as, send-on-behalf)" },
    ],
    after: [
      { label: "Delegated access", value: `${HAND_BUILT_BEFORE_MEMBERS.length + REAL_CHANGE_COUNT} users including ${REAL_CHANGE_COUNT} non-leadership roles` },
      { label: "Permission level", value: `Full access — all ${REAL_CHANGE_COUNT} added users can read CFO email and send as CFO` },
    ],
    affectedIdentities: REAL_CHANGE_COUNT,
    dependencyNote: "Mailbox delegations may persist after group rollback. Requires explicit restoration to pre-incident state.",
    recommendedAction: `Restore CFO mailbox delegation to original ${HAND_BUILT_BEFORE_MEMBERS.length} users and revoke any active sessions`,
    actionType: "restoration",
  },
];

// ─── Extended recovery step data (for step drill-down) — UI_AUGMENTATION ─────

export interface RecoveryStepDetail extends RecoveryStep {
  dependsOn: number[];
  expectedResult: string;
  affectedObjectIds: string[];
  approvedBy?: string;
  executedAt?: string;
}

export const recoveryPlanDetailed: RecoveryStepDetail[] = [
  {
    ...recoveryPlan[0]!,
    dependsOn: [],
    expectedResult: `Group membership restored to ${HAND_BUILT_BEFORE_MEMBERS.length} original members. All downstream access inheritance removed at source.`,
    affectedObjectIds: ["obj-sp-fin-conf", "obj-sp-treasury", "obj-ca-mfa", "obj-ca-dlp", "obj-app-sap", "obj-teams-fin", "obj-exch-cfo"],
    approvedBy: "Sarah Chen (Identity Admin)",
    executedAt: offsetSeconds(REAL_DETECTED_AT, 106),
  },
  {
    ...recoveryPlan[1]!,
    dependsOn: [1],
    expectedResult: `SharePoint site collection permissions reverted for all ${REAL_CHANGE_COUNT} users. No cached access tokens active.`,
    affectedObjectIds: ["obj-sp-fin-conf", "obj-sp-treasury"],
    executedAt: offsetSeconds(REAL_DETECTED_AT, 118),
  },
  {
    ...recoveryPlan[2]!,
    dependsOn: [1],
    expectedResult: "CFO mailbox, Treasury shared mailbox, and Finance-Exec DL delegation restored to pre-incident state.",
    affectedObjectIds: ["obj-exch-cfo"],
    executedAt: offsetSeconds(REAL_DETECTED_AT, 125),
  },
  {
    ...recoveryPlan[3]!,
    dependsOn: [1],
    expectedResult: `MFA bypass and DLP exception policies confirmed scoped to original ${HAND_BUILT_BEFORE_MEMBERS.length} users only.`,
    affectedObjectIds: ["obj-ca-mfa", "obj-ca-dlp"],
    executedAt: offsetSeconds(REAL_DETECTED_AT, 134),
  },
  {
    ...recoveryPlan[4]!,
    dependsOn: [1],
    expectedResult: `Teams workspace membership confirmed synced to reverted group. Private channel access removed for ${REAL_CHANGE_COUNT} users.`,
    affectedObjectIds: ["obj-teams-fin"],
    executedAt: offsetSeconds(REAL_DETECTED_AT, 141),
  },
  {
    ...recoveryPlan[5]!,
    dependsOn: [1, 2, 3, 4, 5],
    expectedResult: `SAP Finance app role assignment confirmed revoked. No active ERP sessions for reverted users.`,
    affectedObjectIds: ["obj-app-sap"],
    approvedBy: "Sarah Chen (Identity Admin)",
    executedAt: offsetSeconds(REAL_DETECTED_AT, 150),
  },
  {
    ...recoveryPlan[6]!,
    dependsOn: [1, 2, 3, 4, 5, 6],
    expectedResult: "All identity, data, and downstream system states match pre-incident baseline. Incident closed.",
    affectedObjectIds: [],
    approvedBy: "Sarah Chen (Identity Admin)",
    executedAt: offsetSeconds(REAL_DETECTED_AT, 175),
  },
];
