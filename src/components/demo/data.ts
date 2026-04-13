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

export interface ResolutionCheck {
  area: string;
  status: "verified" | "pending" | "warning";
  detail: string;
}

// ─── Mock data ───────────────────────────────────────────────────────────────

export const incident: Incident = {
  id: "INC-2026-0419",
  title: "Privileged group membership modified by agent workflow",
  severity: "high",
  status: "Resolved — trusted state restored",
  agent: "Access Lifecycle Agent",
  sessionId: "ses-7f2a-4e91-b3c8",
  timestamp: "2026-04-11T14:23:17Z",
  summary:
    "The Access Lifecycle Agent added 12 users to the Finance-Privileged-Access security group in Microsoft Entra as part of an automated quarterly review workflow. The change was not expected and granted those users access to sensitive SharePoint site collections, Exchange mailbox delegations, a Teams-connected finance workspace, and a downstream ERP application. Conditional Access policy scope was also affected.",
  affectedSystemsCount: 5,
};

export const changedObject: ChangedObject = {
  type: "Entra security group",
  name: "Finance-Privileged-Access",
  objectId: "aad-grp-8c1f-4a2e-9d7b",
  changeType: "Membership modification",
  before: {
    members: [
      "Sarah Chen (Finance Director)",
      "Michael Torres (CFO)",
      "Priya Sharma (Controller)",
      "James Wilson (Treasury Lead)",
    ],
    count: 4,
  },
  after: {
    members: [
      "Sarah Chen (Finance Director)",
      "Michael Torres (CFO)",
      "Priya Sharma (Controller)",
      "James Wilson (Treasury Lead)",
      "Alex Rivera", "Jordan Lee", "Casey Morgan",
      "Taylor Brooks", "Morgan Chen", "Riley Adams",
      "Jamie Parker", "Drew Thompson", "Quinn Foster",
      "Blake Martinez", "Avery Johnson", "Dakota Williams",
    ],
    count: 16,
  },
  addedMembers: [
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
  ],
};

export const blastRadius: BlastRadiusItem[] = [
  {
    category: "Identities",
    icon: "users",
    count: 12,
    items: [
      { name: "12 users added to privileged group", detail: "Gained Finance-Privileged-Access membership and all downstream entitlements" },
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
    count: 12,
    items: [
      { name: "CFO mailbox delegation", detail: "Full access delegation granted to 12 users" },
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
      { name: "Finance-MFA-Bypass policy", detail: "12 users now in scope for MFA bypass on trusted devices" },
      { name: "Finance-Data-Restriction policy", detail: "DLP exceptions expanded to include new group members" },
    ],
  },
];

export const recoveryPlan: RecoveryStep[] = [
  {
    id: 1, order: 1,
    action: "Revert Entra group membership to pre-incident state",
    type: "rollback",
    target: "Finance-Privileged-Access (Entra group)",
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

export const timeline: TimelineEvent[] = [
  {
    timestamp: "2026-04-11T14:23:17Z",
    action: "Agent-driven change detected",
    actor: "KavachIQ — Change Monitor",
    status: "detected",
    detail: "Access Lifecycle Agent modified Finance-Privileged-Access group membership. 12 users added.",
  },
  {
    timestamp: "2026-04-11T14:23:19Z",
    action: "Blast radius analysis initiated",
    actor: "KavachIQ — Impact Analyzer",
    status: "analyzed",
    detail: "Mapped downstream impact across 3 SharePoint sites, 12 Exchange delegations, 1 Teams workspace, 1 ERP application, and 2 Conditional Access policies.",
  },
  {
    timestamp: "2026-04-11T14:23:24Z",
    action: "Recovery plan generated",
    actor: "KavachIQ — Recovery Engine",
    status: "recommended",
    detail: "7-step identity-first recovery plan recommended. Entra group rollback prioritized before downstream compensating actions.",
  },
  {
    timestamp: "2026-04-11T14:25:01Z",
    action: "Recovery plan approved",
    actor: "Sarah Chen (Identity Admin)",
    status: "approved",
    detail: "Operator reviewed blast radius and recovery sequence. Approved rollback of Entra group membership and downstream recovery.",
  },
  {
    timestamp: "2026-04-11T14:25:03Z",
    action: "Entra group membership reverted",
    actor: "KavachIQ — Recovery Engine",
    status: "executed",
    detail: "12 users removed from Finance-Privileged-Access. Group membership restored to 4 original members.",
  },
  {
    timestamp: "2026-04-11T14:25:47Z",
    action: "Downstream access revoked and validated",
    actor: "KavachIQ — Recovery Engine",
    status: "executed",
    detail: "SharePoint access revoked. Exchange delegations restored. Teams membership verified. Conditional Access scope validated. ERP entitlements confirmed revoked.",
  },
  {
    timestamp: "2026-04-11T14:26:12Z",
    action: "Trusted operational state confirmed",
    actor: "Sarah Chen (Identity Admin)",
    status: "verified",
    detail: "All identity, data, and downstream system states match pre-incident baseline. Incident closed with full audit trail.",
  },
];

export const resolution: ResolutionCheck[] = [
  { area: "Entra group membership", status: "verified", detail: "Finance-Privileged-Access restored to 4 original members" },
  { area: "SharePoint site access", status: "verified", detail: "All 3 site collections access reverted for 12 users" },
  { area: "Exchange delegations", status: "verified", detail: "CFO mailbox, Treasury shared mailbox, and Finance-Exec DL restored" },
  { area: "Teams collaboration", status: "verified", detail: "Finance-Leadership workspace membership restored to original scope" },
  { area: "Conditional Access policies", status: "verified", detail: "MFA bypass and DLP exception scope no longer includes reverted users" },
  { area: "Downstream application (SAP)", status: "verified", detail: "GL and AP module privileged access confirmed revoked" },
  { area: "Audit trail", status: "verified", detail: "Full incident timeline, blast radius, recovery actions, and operator approvals preserved" },
];
