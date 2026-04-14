# Operator UI and API Design

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisites:** Architecture Memo, Trusted-State Baseline Design, Blast-Radius Engine Design, Recovery Orchestration Design, Connector and Ingestion Design, Tenant Security Architecture  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

KavachIQ's value is delivered through the operator experience. The blast-radius engine, recovery orchestrator, and trusted-state model are internal systems. What the operator sees is the product. The UI must transform complex internal reasoning into decisions the operator can make safely and quickly. The API must support the same semantics so the product can be automated and integrated.

**Core problem:** The system's internal model includes dependency graphs, confidence scores, multiple state versions, approval tokens, and deferred validations. Exposing all of this raw creates an unusable product. Hiding it creates a black box that operators will not trust. The UI must practice progressive disclosure: the right level of detail at the right moment, with deeper inspection always available.

**Recommended model:** An incident-centered product experience organized around a single incident workspace. The workspace exposes six primary views (Overview, Blast Radius, Recovery Plan, Execution, Validation, Audit) as tabs within the incident. Each view practices progressive disclosure: summary first, drill-down on demand. Confidence and uncertainty are surfaced honestly but without overwhelming. The approval flow is inline with the recovery plan, not a separate modal workflow. The API mirrors the UI's resource model and supports both human-interactive and automation use cases.

**Key trade-offs:**
- Progressive disclosure vs always-visible complexity: default to summary, expand on demand
- Inline approval vs separate approval page: inline reduces context-switching but must prevent accidental approvals
- Confidence visibility vs operator fatigue: show confidence indicators on every object but use progressive disclosure for the reasoning behind them

---

## 2. Problem Statement

### Why UI/API design is hard for this product

**The system reasons about complex dependencies.** A single incident can involve 50+ impacted objects across 6 system categories with multi-level dependency chains. Showing a full graph is technically accurate but unusable. Showing only a summary hides critical context.

**Operators need to make safety-critical decisions.** Approving a recovery step is not a routine click. It is a decision that will modify production identity objects. The UI must slow the operator down enough to make informed decisions without creating so much friction that urgent incidents cannot be addressed quickly.

**Confidence varies across the output.** Some blast-radius findings are high-confidence (authoritative graph edge from a recent refresh). Others are inferred (behavioral rule based on a stale snapshot). The UI must expose this without turning every view into a confidence-scoring exercise.

**State is multi-dimensional.** For any object, there are potentially five relevant states: current, pre-incident, baseline, recovery target, and post-recovery. The UI must help operators compare the right pair at the right moment without drowning them in state tables.

**Incidents evolve.** New data arrives (late audit events, propagation effects). Plans may be replanned. Approvals may be invalidated by state changes. The UI must handle live updates without confusing the operator about what they already reviewed.

**The same product serves different personas.** An identity admin investigating blast radius needs different detail than a CISO reviewing the trusted-state outcome. A single UI must serve both without forcing the CISO through the admin's workflow.

---

## 3. Design Goals

1. **Help operators make safe decisions quickly.** The default path through the product should guide the operator from incident awareness to trusted-state validation with minimum unnecessary friction.
2. **Practice progressive disclosure.** Summary first. Detail on demand. Full reasoning always available for inspection.
3. **Surface confidence and uncertainty honestly.** Never present low-confidence findings as certainty. Always let the operator see why the system is confident or not.
4. **Make identity-first sequencing obvious.** The UI must visually reinforce that identity objects are recovered before data surfaces.
5. **Support both fast triage and deep investigation.** A 2-minute triage and a 30-minute deep investigation should both feel natural in the same product.
6. **Align UI and API semantics.** Every resource visible in the UI is available through the API. Every action possible in the UI is possible through the API. The API is the product; the UI is one client.
7. **Enforce RBAC visibly.** Roles constrain what actions are available. Disabled buttons, not hidden buttons, so operators understand what they cannot do and why.
8. **Support auditability.** Every operator action (view, approve, reject, execute, close) is logged and reviewable.

---

## 4. Non-Goals and Boundaries

- **Not a general-purpose SIEM dashboard.** No log search, no alert management, no detection rule builder.
- **Not a fully autonomous remediation console.** The UI supports operator-in-the-loop decision-making, not hands-off automation monitoring.
- **Not a customizable workflow builder.** v1 has a fixed incident → blast radius → plan → approval → execution → validation flow. Custom workflow steps are future.
- **Not a deep Microsoft admin console.** The product shows Entra and M365 state relevant to recovery. It does not replicate the Entra portal or SharePoint admin center.
- **Not pixel-perfect design spec.** This document defines information architecture, interaction model, and API structure. Visual design is a separate deliverable.

---

## 5. Primary Operator Personas

| Persona | Cares About | Key Decisions | Detail Level |
|---------|------------|---------------|-------------|
| **Identity / Entra Admin** | Which identity objects changed, what downstream access was affected, whether the control plane is secure | Approve group rollback, validate CA policy scope, confirm service principal state | High detail on identity objects; medium on downstream |
| **Security / Incident Responder** | Scope of impact, blast radius completeness, whether the incident is contained, forensic audit trail | Triage severity, verify blast radius is complete, validate that no residual access persists | High detail on blast radius and audit; medium on execution mechanics |
| **Microsoft 365 Admin** | Which M365 workloads were affected, SharePoint permissions, Exchange delegations, Teams membership | Verify data-surface recovery, confirm collaboration state is restored | High detail on M365 objects; medium on identity |
| **Recovery Approver (CISO/VP)** | Is the plan safe? Is the blast radius understood? Is the risk contained? | Approve the plan, approve high-risk steps, sign off on trusted-state declaration | Summary level; drill-down for high-risk items only |
| **Tenant Admin** | System configuration, baseline management, policy settings, user role management | Configure sensitivity lists, manage baseline approval cadence, assign roles | Settings and configuration; low incident detail |

---

## 6. Core Operator Workflows

### 6.1 Workflow Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Incident    │────▶│  Blast      │────▶│  Recovery   │
│  Triage      │     │  Radius     │     │  Plan       │
└─────────────┘     │  Review     │     │  Review     │
                    └─────────────┘     └──────┬──────┘
                                               │
                    ┌─────────────┐     ┌──────▼──────┐
                    │  Validation │◀────│  Approval + │
                    │  + Closure  │     │  Execution  │
                    └─────────────┘     └─────────────┘
```

### 6.2 Workflow Details

**Incident Triage (30 seconds - 2 minutes)**
- Operator sees incident in the inbox
- Reviews: severity, initiating agent, changed object, affected system count
- Decision: investigate now, acknowledge later, or dismiss (if false positive)
- Goal: quickly understand whether this needs attention

**Blast-Radius Review (2-5 minutes)**
- Operator inspects the impact map by category (Identity, SharePoint, Exchange, Teams, Applications, CA)
- Drills into objects of concern to see before/after state and dependency chains
- Reviews confidence indicators
- Decision: is the blast radius complete enough to plan recovery?

**Recovery Plan Review (2-5 minutes)**
- Operator reviews the ordered plan with tier-based grouping
- For each step: reads action type, target, rationale, dependencies
- Checks for steps requiring approval
- Decision: approve the plan (or specific tiers/steps), request modification, or reject

**Approval and Execution (1-5 minutes)**
- Operator approves steps (tier-based or per-step)
- System executes approved system-executable steps (group rollback in v1)
- Operator executes recommendation-only steps manually and confirms in the UI
- Tracks execution progress in real-time

**Validation and Closure (2-10 minutes)**
- Reviews validation results per step (verified, pending propagation, mismatch)
- Waits for deferred re-validations
- Reviews final trusted-state summary
- Decision: close incident as restored, or flag residual unresolved risk

---

## 7. Product Information Architecture

### Primary Navigation

```
┌────────────────────────────────────────────────────────┐
│  KavachIQ                              [User] [Tenant] │
├──────────┬─────────────────────────────────────────────┤
│ Incidents│  Incident Workspace                         │
│ Baselines│  ┌──────────────────────────────────────┐   │
│ Policies │  │ Incident Header (title, severity,     │   │
│ Audit    │  │ status, agent, timestamp)             │   │
│ Settings │  ├──────────────────────────────────────┤   │
│          │  │ Overview│Blast│Plan│Exec│Valid│Audit  │   │
│          │  │─────────┴─────┴────┴────┴─────┴──────│   │
│          │  │                                       │   │
│          │  │  [Active Tab Content]                  │   │
│          │  │                                       │   │
│          │  └──────────────────────────────────────┘   │
└──────────┴─────────────────────────────────────────────┘
```

### Navigation Model

**Left sidebar:** Global navigation across incidents, baselines, policies, audit, and settings. Always visible. Does not change per incident.

**Incident workspace:** The primary work surface. Opened from the incident list. Contains the incident header (persistent across tabs) and a tabbed view with 6 tabs: Overview, Blast Radius, Recovery Plan, Execution, Validation, Audit.

**Object detail panel:** A right-side slide-over drawer for inspecting any object. Triggered from any tab. Shows full object detail, before/after state, dependency chain, confidence, and recommended action. Closes on dismiss without losing tab context.

### Why This Architecture

- **Incident-centered** because the product's core workflow is per-incident, not per-object or per-system.
- **Tabbed workspace** because the operator needs to move between views (blast radius → plan → execution) without losing context.
- **Persistent header** because the operator must always know which incident they are in, its severity, and its current status.
- **Drawer for detail** because drilling into an object should not navigate away from the current view. The operator should be able to inspect an object in the blast radius and then return to the same scroll position.

---

## 8. Incident Detail Design

### Incident Header (Always Visible)

| Element | Source | Purpose |
|---------|--------|---------|
| Incident ID | System-generated | Unique reference for audit and communication |
| Title | Generated from root change description | Quick identification |
| Severity badge | Rule-based from incident scoring | Visual priority |
| Status | Incident lifecycle state | Current phase (new, investigating, recovering, validating, restored, partial, closed) |
| Initiating agent | From normalized change actor | Who/what caused this |
| Root object | From normalized change target | What was changed |
| Timestamp | From first observed change | When it started |
| Affected systems count | From blast-radius summary | Scope at a glance |

### Overview Tab

The default landing view when opening an incident. Optimized for 30-second triage.

**Layout:**
1. **Narrative summary** (2-3 sentences generated from incident data): "The Access Lifecycle Agent added 12 users to the Finance-Privileged-Access security group in Microsoft Entra. The change affected 3 SharePoint sites, 12 Exchange delegations, 1 Teams workspace, 1 ERP application, and 2 Conditional Access policies."

2. **Impact snapshot** (3 metric cards): Users affected | Systems impacted | Recovery steps

3. **Confidence summary** (compact bar): X% high confidence | Y% medium | Z% low or unknown

4. **Recovery status** (progress indicator): Plan generated | Awaiting approval | In progress | Validated | Trusted state restored

5. **Quick actions**: "Review blast radius" | "Review recovery plan" | "View audit trail"

### What the Operator Sees First

The overview tab deliberately does not show the full blast radius or recovery plan. It shows enough for the operator to decide whether to dig deeper. This prevents information overload during triage.

---

## 9. Blast-Radius Experience Design

### Summary View

Grouped by impact category. Each category is a card showing:
- Category name (Identities, SharePoint, Exchange, Teams, Applications, Conditional Access)
- Count of affected objects
- Highest confidence level in the category
- Indicator: confirmed / inferred / low-confidence

### Card Click → Category Expansion

Clicking a category card expands it to show the individual objects:
- Object name
- Object type
- Impact classification: direct / structural / behavioral / transitive
- Confidence indicator (dot: green/yellow/orange/gray)
- Arrow icon indicating drill-down available

### Object Click → Detail Drawer

Clicking an object opens the right-side drawer showing:

| Section | Content |
|---------|---------|
| **Identity** | Object name, type, ID |
| **Impact reason** | Why this object is in the blast radius (free text, generated from dependency chain) |
| **Dependency chain** | Visual breadcrumb: Root change → Group membership → SharePoint inheritance → This site |
| **Before / After** | Two-panel comparison of relevant state fields |
| **Confidence** | Level + reasoning ("High: authoritative edge from graph refresh 4 hours ago") |
| **Recommended action** | Action type badge + description |

### Confidence Representation

| Level | Visual | Meaning |
|-------|--------|---------|
| High | Green dot | Confirmed by authoritative source |
| Medium | Yellow dot | Inferred from structural or behavioral rule |
| Low | Orange dot | Based on stale data or weak inference |
| Unknown | Gray dot | Cannot determine; requires manual verification |

**Default view shows dots only.** The reasoning text is visible in the drill-down drawer, not in the summary. This prevents confidence fatigue.

---

## 10. State Comparison Experience

### Where Comparisons Appear

State comparisons appear in two places:

1. **Object detail drawer** (blast-radius drill-down): Shows before/after for the specific object.
2. **Recovery step detail** (recovery plan drill-down): Shows current state vs recovery target.

### Comparison Layout

Two-panel side-by-side on desktop. Stacked on mobile. Labels are clear:

```
┌─────────────────────┐  ┌─────────────────────┐
│  BEFORE              │  │  AFTER               │
│  (pre-incident)      │  │  (current observed)   │
│                      │  │                       │
│  Members: 4          │  │  Members: 16          │
│  - Sarah Chen        │  │  - Sarah Chen         │
│  - Michael Torres    │  │  - Michael Torres     │
│  - Priya Sharma      │  │  - Priya Sharma       │
│  - James Wilson      │  │  - James Wilson       │
│                      │  │  + Alex Rivera     ← │
│                      │  │  + Jordan Lee      ← │
│                      │  │  ... (10 more)     ← │
│                      │  │                       │
│  Confidence: High    │  │  Confidence: High     │
│  (audit log oldValue)│  │  (live Graph read)    │
└─────────────────────┘  └─────────────────────┘
```

### When Pre-Incident Differs from Baseline

The system shows a warning banner:

> "Pre-incident state differs from approved baseline. Member E was added after baseline v47 was approved. Review both states before selecting a recovery target."

Two comparison options are presented:
- Compare current vs pre-incident (shows what the incident changed)
- Compare current vs baseline (shows drift from known-good state)

The operator selects the recovery target. The system does not auto-select when they conflict.

---

## 11. Recovery Plan Experience Design

### Plan Summary

Top-level view showing:
- Plan version (with version history link)
- Generated timestamp
- Total steps: X (Y require approval)
- Baseline version used: v47 (approved 2026-04-10)
- Stale plan warning (if applicable): "Plan was generated 25 minutes ago. State may have changed."

### Tier-Based Display

Steps are grouped by tier with visual hierarchy:

```
── TIER 0: IDENTITY ROLLBACK ──────────────────────────
  ✅ 1. [Rollback] Revert Entra group membership
       Target: Finance-Privileged-Access
       🔒 Approval required
       Status: Completed

── TIER 1: IDENTITY VALIDATION ────────────────────────
  ✅ 2. [Validation] Validate CA policy scope
       Target: Finance-MFA-Bypass, Finance-Data-Restriction
       Status: Verified

── TIER 2: DATA COMPENSATING ACTIONS ──────────────────
  ⏳ 3. [Compensating] Revoke SharePoint access
       Target: Finance-Confidential, Treasury-Operations
       Status: Pending propagation (re-check at 14:40)
  ✅ 4. [Restoration] Restore Exchange delegation
       Target: CFO mailbox, Treasury shared mailbox
       Status: Verified

── TIER 3: DOWNSTREAM VALIDATION ──────────────────────
  🔒 5. [Validation] Verify ERP entitlement rollback
       Target: SAP Finance — GL and AP modules
       🔒 Approval required
       Status: Awaiting approval

── TIER 4: TRUSTED-STATE DECLARATION ──────────────────
  ⬜ 6. [Validation] Mark trusted state restored
       🔒 Approval required
       Status: Blocked (waiting for tier 3)
```

### Step Click → Expansion

Clicking a step reveals:
- **Rationale:** "Identity is the root of trust. Group membership must be reverted before any downstream recovery."
- **Dependencies:** "Depends on: (none — this is the root action)"
- **Target state:** "Group membership: [Sarah Chen, Michael Torres, Priya Sharma, James Wilson]"
- **Current state at plan time:** "Group membership: 16 members"
- **Confidence:** "High — based on approved baseline v47"
- **Action type explanation:** "Rollback: revert the specific change to the pre-incident/baseline state"

### Stale Plan Handling

If the plan was generated more than 15 minutes ago:
- Yellow banner: "This plan was generated at [time]. Run pre-execution validation before approving."
- "Refresh plan" button that triggers revalidation against current state.

---

## 12. Approval UX Model

### Approval Surface

Approvals are inline within the Recovery Plan tab. Each step requiring approval shows an "Approve" button (or "Approve Tier" for tier-based approval).

### Approval Interaction

```
1. Operator clicks "Approve" on a step or tier
2. Confirmation dialog appears:
   ┌──────────────────────────────────────────────┐
   │  Approve recovery action?                     │
   │                                               │
   │  Action: Revert Entra group membership        │
   │  Target: Finance-Privileged-Access            │
   │  Effect: Remove 12 members, restore to 4      │
   │  Execution: System-assisted (Graph API write)  │
   │                                               │
   │  ⚠ This action will modify production Entra.  │
   │                                               │
   │  Current state verified: ✅ (checked 12s ago)  │
   │                                               │
   │        [Cancel]  [Approve and Execute]         │
   └──────────────────────────────────────────────┘
3. On approval: signed token is issued, execution begins
4. Step status updates in real-time
```

### Anti-Rubber-Stamping

- Confirmation dialog shows the specific effect, not just "approve step 1"
- High-risk steps (CA policy, directory roles) show a double-confirmation: type the object name to confirm
- Approval requires viewing the blast radius at least once (tracked per session; approval button is disabled with tooltip "Review blast radius first" until the operator has visited the Blast Radius tab)
- Approval metrics are logged: time spent reviewing before approving, whether blast radius was viewed

### Approval Staleness

If state changes after approval but before execution:
- The step reverts to "Approval invalidated" status
- The operator sees: "State changed since approval. The group now has 14 members (was 16 at approval). Re-approve with updated context."
- The "Approve" button reappears with the updated state.

---

## 13. Execution and Validation Experience

### Execution Tab

Shows a real-time timeline of step execution:

| Time | Step | Action | Status | Actor |
|------|------|--------|--------|-------|
| 14:25:03 | 1 | Revert group membership | Completed | KavachIQ (system) |
| 14:25:03 | 1 | Validation: group has 4 members | Verified ✅ | KavachIQ (system) |
| 14:25:15 | 2 | Validate CA policy scope | Verified ✅ | KavachIQ (system) |
| 14:25:22 | 3 | Revoke SharePoint access | Pending propagation ⏳ | Manual (operator) |
| — | 3 | Deferred re-check scheduled | T+15 min | KavachIQ (system) |
| 14:25:30 | 4 | Restore Exchange delegation | Verified ✅ | Manual (operator) |

### Step State Indicators

| State | Icon | Meaning |
|-------|------|---------|
| Generated | ⬜ | Step created, not yet actionable |
| Blocked | 🔒 | Waiting for prerequisites |
| Awaiting approval | 🔒 | Requires operator approval |
| Ready | ▶ | Approved, pre-execution checks passing |
| Executing | ⏳ | In progress |
| Completed | ✅ | Executed successfully |
| Pending propagation | ⏳ | Awaiting downstream consistency |
| Verified | ✅✅ | Post-execution validation passed |
| Failed | ❌ | Execution or validation failed |
| Skipped | ⏭ | Operator chose to skip |

### Validation Tab

Shows the per-object validation status for the entire incident:

```
RECOVERY VALIDATION STATUS

Identity Layer (Tier 0-1)
  ✅ Entra group membership: Verified (high confidence)
  ✅ CA policy scope: Verified (medium — re-checked at T+5 min)

Data Layer (Tier 2)
  ⏳ SharePoint access: Pending propagation (re-check at 14:40)
  ✅ Exchange delegation: Verified (high confidence)
  ✅ Teams membership: Verified (medium — group sync confirmed)

Downstream (Tier 3)
  🔒 SAP Finance entitlements: Awaiting approval for verification
  
OVERALL STATUS: Partial restoration
  5 of 7 checks verified
  1 pending propagation
  1 awaiting approval
  
  ❌ Cannot declare "Trusted operational state restored" yet.
```

### Trusted-State Declaration

When all checks pass:

```
┌──────────────────────────────────────────────────────┐
│  ✅ TRUSTED OPERATIONAL STATE RESTORED               │
│                                                      │
│  All 7 verification checks passed.                   │
│  Identity layer: verified (high confidence)          │
│  Data layer: verified (high confidence)              │
│  Downstream: verified (medium — operator confirmed)  │
│                                                      │
│  Incident INC-2026-0419 resolved at 14:26:12.       │
│  Full audit trail preserved.                         │
│                                                      │
│  [Close Incident]  [View Audit Trail]                │
└──────────────────────────────────────────────────────┘
```

If partial:
```
  ⚠ PARTIAL RESTORATION
  5 of 7 checks verified. 2 unresolved.
  
  Unresolved items:
  - SharePoint propagation: re-check failed (manual verification recommended)
  - SAP Finance: operator has not confirmed entitlement rollback
  
  [Mark as partial and close]  [Continue recovery]
```

---

## 14. Audit and Explainability Experience

### Audit Tab (Per-Incident)

Shows the complete history of the incident:
- Change detection events
- Blast-radius computation records
- Plan generation and version history
- Approval decisions (who, when, what they saw)
- Execution records (what was done, pre/post state)
- Validation results
- Self-action records
- Operator comments/notes

### Global Audit View

Accessible from the left sidebar. Shows all system activity across incidents:
- Filterable by: tenant, incident, actor, time range, event type
- Exportable as JSON or CSV
- Immutable: no edit/delete capability in the UI

### Explainability in Context

Blast-radius reasoning is visible in the object detail drawer (dependency chain explanation). Recovery step rationale is visible in the step expansion. These are always available, not hidden behind developer tools.

---

## 15. API Design Principles

### Posture

- **Product-grade, not internal-only.** The API should be clean enough that customers and partners can build on it.
- **Resource-oriented.** REST-style resources that mirror the UI's information model.
- **Versioned.** All endpoints prefixed with `/api/v1/`. Breaking changes require a new version.
- **Tenant-scoped.** All requests are implicitly scoped to the authenticated tenant.
- **Paginated.** List endpoints use cursor-based pagination.
- **Filterable.** List endpoints support query parameters for common filters (status, severity, time range).
- **Idempotent mutations.** POST operations that create resources use idempotency keys. PUT operations are inherently idempotent.
- **Audited.** All mutating operations (approvals, execution triggers, settings changes) are logged to the audit trail.
- **RBAC-enforced.** The API enforces the same role permissions as the UI. A Viewer cannot approve. An Incident Responder cannot execute.

---

## 16. Core API Resources and Endpoints

### Resource Map

```
/api/v1/incidents
  ├── GET    /                         List incidents (filterable, paginated)
  ├── GET    /{id}                     Get incident detail
  ├── GET    /{id}/changes             List normalized changes for incident
  ├── GET    /{id}/blast-radius        Get blast-radius result
  ├── GET    /{id}/blast-radius/objects/{objectId}  Get impacted object detail
  ├── GET    /{id}/plans               List recovery plan versions
  ├── GET    /{id}/plans/{version}     Get specific plan version
  ├── GET    /{id}/plans/{version}/steps  List recovery steps
  ├── GET    /{id}/plans/{version}/steps/{stepId}  Get step detail
  ├── POST   /{id}/plans/{version}/steps/{stepId}/approve  Approve a step
  ├── POST   /{id}/plans/{version}/steps/{stepId}/reject   Reject a step
  ├── POST   /{id}/plans/{version}/steps/{stepId}/confirm  Confirm manual execution
  ├── GET    /{id}/validation          Get validation summary
  ├── POST   /{id}/close               Close incident
  └── GET    /{id}/audit               Get audit trail for incident

/api/v1/baselines
  ├── GET    /                         List baseline versions
  ├── GET    /{versionId}              Get baseline version detail
  ├── POST   /{versionId}/approve      Approve baseline
  └── GET    /{versionId}/objects/{objectId}  Get object snapshot

/api/v1/audit
  ├── GET    /                         Global audit trail (filterable, paginated)
  └── GET    /export                   Export audit data

/api/v1/settings
  ├── GET    /policies                 Get tenant policies
  ├── PUT    /policies                 Update tenant policies
  ├── GET    /sensitivity-lists        Get sensitivity classifications
  └── PUT    /sensitivity-lists        Update sensitivity classifications
```

### Key Endpoint Behaviors

**Approval endpoint:** `POST /incidents/{id}/plans/{version}/steps/{stepId}/approve`
- Requires: Recovery Approver or higher role
- Body: `{ "confirmTarget": true, "stateHashAtApproval": "..." }`
- Returns: `{ "approvalId": "...", "token": "...", "expiresAt": "..." }`
- Idempotent: re-approving a step with the same state hash returns the existing approval

**Execution confirmation:** `POST /incidents/{id}/plans/{version}/steps/{stepId}/confirm`
- Used for manual steps: operator confirms they executed the recommended action externally
- Body: `{ "outcome": "succeeded" | "failed", "notes": "..." }`
- Requires: Recovery Executor or higher role

---

## 17. API Support for Operator Workflows

### Triage

```
GET /api/v1/incidents?status=new&sort=-severity&limit=10
→ Returns: top 10 new incidents by severity

GET /api/v1/incidents/{id}
→ Returns: full incident detail with summary counts
```

### Investigation

```
GET /api/v1/incidents/{id}/blast-radius
→ Returns: categorized impact summary with object counts

GET /api/v1/incidents/{id}/blast-radius/objects/{objectId}
→ Returns: full object detail with before/after, confidence, dependency chain
```

### Approval

```
GET /api/v1/incidents/{id}/plans/latest/steps?approvalRequired=true
→ Returns: steps awaiting approval

POST /api/v1/incidents/{id}/plans/latest/steps/{stepId}/approve
→ Triggers: approval token generation, execution (if system-executable)
```

### Monitoring

```
GET /api/v1/incidents/{id}/plans/latest/steps?status=executing,pending-propagation
→ Returns: in-flight steps for progress monitoring

GET /api/v1/incidents/{id}/validation
→ Returns: overall validation status, per-object checks, residual risk
```

### Integration / Automation

The API supports webhook callbacks for incident lifecycle events:
- `incident.created`
- `incident.blast-radius-ready`
- `incident.plan-generated`
- `incident.approval-required`
- `incident.step-completed`
- `incident.validated`
- `incident.closed`

---

## 18. Permission and RBAC Behavior in UI/API

### UI Behavior by Role

| UI Element | Viewer | Incident Responder | Recovery Approver | Recovery Executor | Tenant Admin |
|-----------|:---:|:---:|:---:|:---:|:---:|
| View incident list | ✅ | ✅ | ✅ | ✅ | ✅ |
| View blast radius | ✅ | ✅ | ✅ | ✅ | ✅ |
| View recovery plan | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve steps | Hidden | Disabled | ✅ | ✅ | ✅ |
| Confirm manual execution | Hidden | Hidden | Disabled | ✅ | ✅ |
| Close incident | Hidden | Hidden | Disabled | ✅ | ✅ |
| Manage baselines | Hidden | Hidden | Hidden | Hidden | ✅ |
| Manage settings | Hidden | Hidden | Hidden | Hidden | ✅ |

**Disabled vs Hidden:** Actions above the operator's role are hidden (not shown at all). Actions one level above are shown as disabled with a tooltip: "Requires Recovery Approver role." This helps operators understand the workflow without creating confusion about what they can do.

### API Enforcement

The API returns `403 Forbidden` with a message indicating the required role when an operator attempts an action above their permission level. Read-only endpoints return full data regardless of role (all roles can see everything).

---

## 19. Safety and Usability Trade-offs

| Trade-off | Decision | Reasoning |
|-----------|----------|-----------|
| Show all confidence detail vs summary only | **Summary by default.** Confidence dot on every object. Reasoning text in drawer only. | Full confidence detail on every object overwhelms operators during triage. |
| Inline approval vs separate page | **Inline with confirmation dialog.** | Reduces context switching. Confirmation dialog prevents accidental approval. |
| Auto-advance to next tier vs manual advance | **Manual advance.** Operator must acknowledge tier completion. | Prevents blind advancement through multi-tier plans. |
| Show replanned steps vs hide old versions | **Show current plan. Link to version history.** | Current plan is what matters. Version history is for audit/forensics. |
| Always show before/after vs on-demand | **On-demand via object drawer.** Overview and plan show summaries only. | Before/after comparisons are data-heavy and only needed for specific objects. |
| Require blast-radius review before approval | **Yes, in v1.** Approval button disabled until Blast Radius tab visited. | Prevents rubber-stamping without understanding impact. Friction is intentional. |
| Show execution timeline in real-time vs on-refresh | **Real-time updates via server-sent events.** | Operators need to know immediately when a step completes or fails. |

---

## 20. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Operator overwhelmed by detail | Ignores important findings; makes wrong decisions | High | Progressive disclosure; summary-first views; confidence dots, not walls of text |
| Low-confidence findings mistaken as confirmed | Recovery plan based on wrong blast radius | High | Distinct confidence indicators; reasoning in drill-down; low-confidence items visually demoted |
| Approval rubber-stamping | Operator approves without understanding | High | Blast-radius review requirement; confirmation dialog with effect summary; high-risk double-confirm |
| Stale plan not visibly stale | Operator approves plan based on outdated state | High | Stale-plan banner with timestamp; pre-execution validation; "Refresh plan" button |
| Partial restoration misread as fully restored | Residual access persists; incident closed prematurely | High | Explicit partial restoration status; cannot close as "restored" with unresolved items; unresolved items require operator acknowledgment |
| API drift from UI semantics | Integrations break or behave differently than UI | Medium | API and UI share the same resource model and business logic layer |
| Role confusion in approval vs execution | Wrong person approves or executes | Medium | RBAC enforcement with clear role labels; disabled buttons with role explanation |
| Real-time updates cause confusion | UI state changes while operator is reading | Medium | Non-destructive updates (new information appended, not replaced); highlight changed items |

---

## 21. Open Questions

1. **Should the UI support collaborative incident review?** Multiple operators viewing the same incident simultaneously, with shared state (who is viewing, who approved what). Useful for team incident response but adds real-time state complexity.

2. **Should the incident inbox support saved views/filters?** Identity admins may want to filter to "identity incidents only." M365 admins may want to filter to "SharePoint/Exchange only." Is this v1 or v2?

3. **Should the API support long-polling or SSE for step execution updates?** Real-time execution tracking is important for operator experience. SSE (server-sent events) is simpler than WebSockets but has reconnection edge cases.

4. **How should the product handle incidents that span days?** If a recovery plan is generated but the operator does not approve for 24 hours, the plan is almost certainly stale. Should the system auto-expire plans, or just warn?

5. **Should the UI show the dependency graph visually?** A visual graph of dependency chains is compelling in demos but may be overwhelming in practice. Is a breadcrumb trail sufficient, or do operators need a full graph view?

6. **Should there be a mobile experience?** Operators receiving an alert at 2 AM may need to triage from their phone. A read-only mobile view for triage and approval may be valuable but adds a development surface.

7. **How should the product surface self-action events?** Self-actions (KavachIQ's own recovery writes) should be visible in the audit trail but should be visually distinct from external changes. What visual treatment is appropriate?

---

## 22. Recommendation Summary

### Build for v1

- **Incident-centered workspace** with persistent header and 6 tabs (Overview, Blast Radius, Recovery Plan, Execution, Validation, Audit)
- **Progressive disclosure everywhere:** summary views by default, detail in drawers and expansions
- **Confidence indicators** as colored dots on every object (green/yellow/orange/gray), reasoning in drill-down drawer
- **Tier-based recovery plan display** with inline approval buttons, confirmation dialogs, and anti-rubber-stamping (blast-radius review required before approval)
- **Real-time execution tracking** with step state indicators and deferred re-validation visibility
- **Clear partial vs full restoration status** with explicit blockers for trusted-state declaration
- **Resource-oriented API** mirroring UI semantics with RBAC enforcement, pagination, filtering, and webhook callbacks for integration
- **RBAC enforcement** with 5 roles, disabled-with-tooltip for above-role actions, hidden for far-above-role actions

### Defer to v2+

- Collaborative multi-operator incident view
- Saved views and custom filters
- Visual dependency graph (tree/network) view
- Mobile experience
- Custom workflow steps
- Embeddable components for third-party dashboards
- GraphQL API (REST is sufficient for v1)

### Assumptions That Must Hold

1. Operators are willing to use a web-based product console (not just API or CLI).
2. The tab-based incident workspace provides enough context without requiring multiple browser windows.
3. Progressive disclosure reduces cognitive load without hiding critical information.
4. Real-time step updates via SSE are technically feasible with the Azure deployment model.

### Prototype/Validate Next

1. **Triage-to-approval workflow test.** Walk 3-5 enterprise operators (identity admin, security responder, CISO) through the mock incident using the interactive demo at `/demo`. Measure: time to triage, time to understand blast radius, time to approve, questions asked, confusion points.
2. **Confidence indicator comprehension test.** Show operators objects with different confidence levels. Measure whether they correctly interpret the distinction between confirmed and inferred impact.
3. **Approval friction calibration.** Test the "blast-radius review required before approval" rule with real operators. Measure whether it prevents rubber-stamping or just adds annoying clicks.
