# Canonical Scenario Fixture

**Purpose:** Single reference-truth scenario used by all engineering, QA, demo, and product work throughout MVP development.

**Important:** This scenario definition is fixed. It is not waiting for spike results to be finalized. Spikes validate *how* we implement the scenario, not *what* the scenario is. JSON fixture files generated from real audit events (WI-11) are derived artifacts that conform to this definition.

**Phase scope note:** Sections 1-7 (actor through incident) are Phase 0-1 validation targets. Sections 8-9 (blast radius and recovery plan) are Phase 2-3 product targets. Sections 10-11 (validation outcomes and audit checkpoints) describe the full MVP end-state. Not all downstream expectations need to be validated in Phase 0. Phase 0 focuses on the core Entra-centric truth path: change capture, normalization, correlation, and incident creation.

---

## Scenario Identity

**Name:** Privileged Group Membership Expansion by Agent  
**Scenario ID:** CANONICAL-001  
**Version:** 1.0

---

## 1. Actor

| Field | Value |
|-------|-------|
| Actor type | Application (service principal) |
| Display name | Access Lifecycle Agent |
| App ID | `app-lifecycle-agent-001` |
| Object ID | `sp-obj-a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| Classification | Known agent (non-human automation) |
| Session ID | `ses-7f2a-4e91-b3c8` |

## 2. Target Object

| Field | Value |
|-------|-------|
| Object type | Entra security group |
| Display name | Finance-Privileged-Access |
| Object ID | `grp-8c1f-4a2e-9d7b-finance-priv` |
| Sensitivity | High (on tenant sensitivity list) |

## 3. Change

| Field | Value |
|-------|-------|
| Change type | memberAdded (x12) |
| Timestamp | `2026-04-11T14:23:17Z` |
| Members before | 4 |
| Members after | 16 |
| Members added | 12 |

### Before-State Members (4)

| Name | UPN | Role |
|------|-----|------|
| Sarah Chen | schen@contoso.com | Finance Director |
| Michael Torres | mtorres@contoso.com | CFO |
| Priya Sharma | psharma@contoso.com | Controller |
| James Wilson | jwilson@contoso.com | Treasury Lead |

### Added Members (12)

| Name | UPN | Role |
|------|-----|------|
| Alex Rivera | arivera@contoso.com | Financial Analyst |
| Jordan Lee | jlee@contoso.com | AP Coordinator |
| Casey Morgan | cmorgan@contoso.com | Budget Analyst |
| Taylor Brooks | tbrooks@contoso.com | Payroll Specialist |
| Morgan Chen | mchen@contoso.com | Contract Admin |
| Riley Adams | radams@contoso.com | Financial Analyst |
| Jamie Parker | jparker@contoso.com | Tax Analyst |
| Drew Thompson | dthompson@contoso.com | Revenue Analyst |
| Quinn Foster | qfoster@contoso.com | Audit Associate |
| Blake Martinez | bmartinez@contoso.com | Compliance Analyst |
| Avery Johnson | ajohnson@contoso.com | FP&A Analyst |
| Dakota Williams | dwilliams@contoso.com | GL Accountant |

## 4. Expected Raw Events

12 individual Entra audit events:

| Event | Activity | Target | Modified Property |
|-------|----------|--------|-------------------|
| 1-12 | Add member to group | Finance-Privileged-Access | members (oldValue: prior list, newValue: +1 member) |

All events share:
- `initiatedBy.app.appId` = `app-lifecycle-agent-001`
- `correlationId` from Microsoft = single batch operation ID
- Timestamps within ~3 seconds of each other

## 5. Expected Normalized Changes

12 NormalizedChange records, all with:
- `changeType`: `memberAdded`
- `actor.type`: `application`
- `actor.agentIdentified`: `true`
- `target.objectType`: `group`
- `target.externalId`: `grp-8c1f-4a2e-9d7b-finance-priv`
- `confidence.level`: `high` (audit log with before/after)
- `selfAction`: `false`

## 6. Expected Correlated Bundle

One CorrelatedChangeBundle:
- 12 changeIds
- `primaryActor`: Access Lifecycle Agent
- `affectedObjectIds`: [`grp-8c1f-4a2e-9d7b-finance-priv`]
- `timeRange`: 3-second window
- `correlationSignals`: [`same-actor-session`, `same-target-object`, `time-cluster`, `microsoft-batch-correlation`]
- `incidentCandidateScore`: >= 85 (non-human actor + high-sensitivity target + bulk magnitude + membership change)

## 7. Expected Incident

| Field | Expected Value |
|-------|---------------|
| Severity | High |
| Urgency | Immediate |
| Confidence | High |
| Creation type | Immediate (score >= 80) |
| Status | New |
| Root change | Finance-Privileged-Access membership +12 |
| Classification rationale | Non-human actor (+30), high-sensitivity group (+35), bulk magnitude >5 (+20), membership modification (+10) = 95 |

## 8. Expected Blast Radius *(Phase 2 product target)*

### Categories and Counts

| Category | Count | Objects |
|----------|-------|---------|
| Identities | 12 | 12 users gained privileged group membership |
| SharePoint | 3 | Finance-Confidential, Treasury-Operations, Audit-Working-Papers |
| Exchange | 3 | CFO mailbox delegation, Treasury shared mailbox, Finance-Exec DL |
| Teams | 1 | Finance-Leadership workspace |
| Applications | 1 | SAP Finance (ERP) — GL and AP module access |
| Conditional Access | 2 | Finance-MFA-Bypass, Finance-Data-Restriction |

### Total impacted objects: 22

### Confidence Profile

| Category | Confidence | Basis |
|----------|-----------|-------|
| Identities | High | Direct from audit event |
| SharePoint | Medium-High | Structural edge (group-based permission) |
| Exchange | Medium | Structural edge (group-based delegation) |
| Teams | Medium | Structural edge (group-linked team) |
| Applications | High | Authoritative edge (app role assignment via group) |
| Conditional Access | High | Authoritative edge (policy group targeting) |

## 9. Expected Recovery Plan *(Phase 3 product target)*

### Tier 0: Identity Rollback

| Step | Action Type | Target | Approval | Execution |
|------|-----------|--------|----------|-----------|
| 1 | Rollback | Remove 12 members from Finance-Privileged-Access | Required | System (v1) |

### Tier 1: Identity Validation

| Step | Action Type | Target | Approval | Execution |
|------|-----------|--------|----------|-----------|
| 2 | Validation | Validate Finance-MFA-Bypass scope contracted | No | System (read) |
| 3 | Validation | Validate Finance-Data-Restriction scope contracted | No | System (read) |

### Tier 2: Data Compensating Actions

| Step | Action Type | Target | Approval | Execution |
|------|-----------|--------|----------|-----------|
| 4 | Compensating | Revoke SharePoint access for 12 users | No | Manual/recommendation |
| 5 | Restoration | Restore Exchange delegation state | No | Manual/recommendation |
| 6 | Compensating | Confirm Teams membership restored | No | Manual/recommendation |

### Tier 3: Downstream Validation

| Step | Action Type | Target | Approval | Execution |
|------|-----------|--------|----------|-----------|
| 7 | Validation | Verify SAP Finance entitlement rollback | Required | Manual/recommendation |

### Tier 4: Trusted-State Declaration

| Step | Action Type | Target | Approval | Execution |
|------|-----------|--------|----------|-----------|
| 8 | Validation | Mark trusted operational state restored | Required | Operator confirms |

## 10. Expected Validation Outcomes *(Phase 4 product target)*

| Check | Expected Result | Timing |
|-------|----------------|--------|
| Group membership = 4 | Verified (high) | Immediate after rollback |
| CA Finance-MFA-Bypass scope = 4 users | Verified (medium) | T + 5 minutes |
| CA Finance-Data-Restriction scope = 4 users | Verified (medium) | T + 5 minutes |
| SharePoint access revoked for 12 users | Verified (medium) | T + 15 minutes |
| Exchange delegation restored | Verified (medium) | T + 15 minutes (operator confirms) |
| Teams membership = 4 | Verified (medium) | T + 5 minutes |
| SAP Finance entitlements revoked | Verified (medium) | T + 60 minutes (operator confirms) |

### Trusted-State Declaration

All 7 checks verified → "Trusted operational state restored"

## 11. Expected Audit Trail Checkpoints *(progressively validated across Phases 1-4)*

| Checkpoint | Event Type | Immutable |
|-----------|-----------|-----------|
| 12 raw events ingested | `raw-event-ingested` | Yes |
| 12 normalized changes created | `change-normalized` | Yes |
| 1 correlated bundle created | `bundle-correlated` | Yes |
| 1 incident created (immediate) | `incident-created` | Yes |
| 1 blast-radius computed | `blast-radius-computed` | Yes |
| 1 recovery plan generated | `plan-generated` | Yes |
| Step 1 approved | `step-approved` | Yes |
| Step 1 executed (12 sub-actions) | `action-executed` | Yes |
| Step 1 validated | `validation-completed` | Yes |
| Steps 2-7 validated | `validation-completed` (each) | Yes |
| Incident closed: trusted state restored | `incident-status-changed` | Yes |

## 12. Test Data Setup Requirements

To reproduce this scenario in a test tenant:

1. Create group `Finance-Privileged-Access` with 4 members (Sarah, Michael, Priya, James)
2. Create 12 test users matching the Added Members table
3. Create 3 SharePoint site collections with group-based permissions
4. Create 2 CA policies targeting the group
5. Create 1 app role assignment from the group to a test app
6. Create 1 Teams team linked to the group
7. Register `Access Lifecycle Agent` as a test service principal
8. Use the test SP to add 12 members to the group via Graph API
9. Observe the resulting audit events
