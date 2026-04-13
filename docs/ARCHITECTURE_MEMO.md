# KavachIQ Autonomous Assurance: Architecture Memo

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

KavachIQ must build a system that ingests identity and data control-plane changes from Microsoft Entra and Microsoft 365, models the downstream blast radius of those changes, generates sequenced recovery plans with identity-first ordering, supports operator-approved execution of rollback/restoration/compensating actions, and validates return to a trusted operational state.

**The hardest problems are:**
1. Building a correct dependency graph across Entra objects, M365 workloads, and downstream app entitlements
2. Determining "trusted state" when no clean baseline snapshot may exist
3. Sequencing recovery safely when partial information, eventual consistency, and cascading side effects are the norm
4. Executing recovery actions that are themselves high-risk without making things worse

**Recommended direction:** A hybrid architecture combining event-sourced change capture with periodic baseline snapshots, a graph-based dependency model for blast-radius analysis, and an operator-in-the-loop recovery orchestrator that recommends and sequences actions but requires human approval for high-risk steps. The system should ship as recommendation-first, execution-capable-later.

**Key trade-off:** Building a recommendation-only system first is slower to demonstrate value but dramatically reduces the risk of the product itself causing harm. This is the right trade-off for enterprise trust.

---

## 2. Product and System Goals

The architecture must support these capabilities:

1. **Ingest changes** from Microsoft Entra and Microsoft 365 control planes in near-real-time
2. **Normalize changes** into a unified change model that represents identity objects, permissions, policies, and data access in a common schema
3. **Model dependencies** between identity objects and downstream systems (groups → apps, groups → SharePoint, CA policies → users, etc.)
4. **Compute blast radius** for any given change by traversing the dependency graph
5. **Maintain trusted-state baselines** so the system knows what "correct" looks like
6. **Generate recovery plans** with correct ordering: identity first, then data surfaces, then downstream systems
7. **Classify recovery actions** as rollback, restoration, compensating action, or validation
8. **Support operator review and approval** before executing high-risk recovery steps
9. **Execute recovery actions** through Microsoft Graph and partner APIs when approved
10. **Validate trusted state** after recovery by comparing current state against baseline
11. **Preserve full audit trail** of incidents, blast radius, recovery plans, approvals, and execution results
12. **Operate in enterprise environments** with strong tenant isolation, least-privilege access, and compliance expectations

---

## 3. Non-Goals and Boundaries

The system should **not** attempt the following in v1:

- **Not a SIEM.** KavachIQ does not detect threats or classify malicious intent. It ingests changes and helps recover from them regardless of cause.
- **Not a full backup platform.** It does not back up file content, email bodies, or database records. It operates at the identity and permission control plane, not the data plane.
- **Not an identity governance platform.** It does not define access policies, conduct access reviews, or enforce approval workflows for provisioning. It recovers when those policies fail or are bypassed.
- **Not a fully autonomous remediation engine.** The system recommends recovery actions but requires operator approval for execution, especially in v1. Autonomous execution is a future capability gated by trust.
- **Not universal SaaS coverage.** v1 covers Entra and Microsoft 365. Other SaaS platforms are a future extension, not an initial requirement.
- **Not Teams message-level recovery.** Teams coverage is limited to membership, channel structure, and permission impact. Individual message or chat recovery is out of scope.

---

## 4. Core Product Workflows

### 4.1 Change Capture and Ingestion

```
Entra Audit Logs  ─┐
M365 Audit Logs   ─┤──▶ Ingestion Pipeline ──▶ Normalized Change Store
Graph Webhooks    ─┘
```

The system monitors Microsoft Entra and M365 audit logs (and optionally Graph change notifications) for identity and permission mutations. Changes are normalized into a common schema: who/what initiated the change, what object was modified, what the before/after state is, and when it occurred.

### 4.2 Incident Creation

Not every change is an incident. The system must decide which changes warrant investigation. Initial approach: operator-defined rules (severity thresholds, object sensitivity, agent source). Future: anomaly detection and risk scoring.

A change becomes an incident when it crosses a threshold. The incident bundles the triggering change(s) with metadata: initiating agent, session, severity, and timestamp.

### 4.3 Blast-Radius Analysis

The core differentiator. Given a change (e.g., "12 users added to Finance-Privileged-Access group"), the system traverses its dependency graph to identify:

- Direct downstream effects (SharePoint permissions inherited, Exchange delegations expanded, CA policy scope widened)
- Transitive downstream effects (app provisioning flows triggered, Teams membership inherited)
- Policy implications (MFA bypass scope expanded, DLP exceptions broadened)

Output: a structured blast-radius map with affected objects, categories, counts, and per-object before/after state.

### 4.4 Recovery Plan Generation

Given a blast-radius map, the system generates an ordered recovery plan. The ordering algorithm must respect:

1. **Identity before data.** Entra objects must be reverted before downstream M365 permissions are touched, to prevent re-inheritance.
2. **Dependencies.** Some actions depend on others completing first (e.g., app entitlement verification depends on group rollback).
3. **Action classification.** Each step is classified as rollback (revert to prior state), restoration (restore from baseline), compensating action (explicit countermeasure for inherited state), or validation (confirm expected state holds).
4. **Risk level.** High-risk steps require operator approval. Low-risk steps may be auto-approved by policy.

### 4.5 Operator Review and Approval

The system presents the blast radius and recovery plan to an operator (identity admin, security admin, or platform owner). The operator reviews:

- What changed and why
- What systems are affected
- What the proposed recovery sequence is
- Which steps require approval

The operator can approve, modify, or reject individual steps or the full plan.

### 4.6 Execution Tracking

Approved actions are executed through Microsoft Graph APIs (and potentially partner APIs for downstream apps). Each action's execution is tracked: pending, executing, completed, failed, or rolled back.

### 4.7 Trusted-State Validation

After execution, the system compares the current state of affected objects against the pre-incident baseline. If all objects match baseline, the incident is marked "trusted operational state restored." If discrepancies remain, they are flagged for operator review.

### 4.8 Audit Trail

Every step is logged: change detection, blast-radius computation, recovery plan generation, operator decisions, execution results, and validation outcomes. The audit trail is immutable and retained per enterprise policy.

---

## 5. High-Level System Architecture

### Component Overview

| Component | Responsibility | Critical Dependencies | Key Risks |
|-----------|---------------|----------------------|-----------|
| **Ingestion Service** | Poll/receive audit logs and change notifications from Entra + M365 | Microsoft Graph API, audit log availability | Rate limits, log delivery delays (up to 15 min) |
| **Change Normalizer** | Parse raw audit events into normalized change objects with before/after state | Schema knowledge of Entra + M365 object models | Object model changes, undocumented fields |
| **Dependency Graph** | Model relationships between identity objects, permissions, policies, apps, and data surfaces | Periodic graph refresh from live tenant state | Graph correctness, stale edges, scale |
| **Baseline Store** | Maintain point-in-time snapshots of object states for comparison | Periodic snapshots via Graph API | Snapshot freshness, storage cost, drift detection |
| **Blast-Radius Engine** | Traverse dependency graph from a change event to compute full impact | Dependency Graph, Baseline Store | Graph completeness, traversal performance |
| **Recovery Planner** | Generate ordered recovery plans with action classification and dependency sequencing | Blast-Radius Engine, action templates | Sequencing correctness, edge cases |
| **Approval Service** | Manage operator review, approval, and rejection workflows | Operator UI, notification system | Latency between detection and approval |
| **Execution Engine** | Execute approved recovery actions via Graph API and partner APIs | Microsoft Graph write permissions, partner APIs | Write failures, partial execution, side effects |
| **Validation Service** | Compare post-recovery state against baseline to confirm trusted state | Baseline Store, live Graph API reads | Eventual consistency, propagation delays |
| **Audit Logger** | Immutable event log of all system activity | Append-only storage | Retention, compliance, tamper resistance |
| **Operator UI** | Incident dashboard, blast radius visualization, recovery plan management, approval workflow | All backend services via API | Usability, real-time state rendering |

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Entra Audit  │────▶│  Ingestion   │────▶│  Change      │
│ M365 Audit   │     │  Service     │     │  Normalizer  │
│ Graph Notify │     └──────────────┘     └──────┬───────┘
└──────────────┘                                  │
                                                  ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  Dependency  │◀───▶│  Baseline    │
                     │  Graph       │     │  Store       │
                     └──────┬───────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  Blast-Radius│
                     │  Engine      │
                     └──────┬───────┘
                            │
                            ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  Recovery    │────▶│  Approval    │
                     │  Planner    │     │  Service     │
                     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  Execution   │────▶│  Validation  │
                     │  Engine      │     │  Service     │
                     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────────────────────────┐
                     │         Audit Logger             │
                     └──────────────────────────────────┘
```

---

## 6. Microsoft-First Integration Surface

### 6.1 Entra Identity Objects

| Object Type | Graph API Surface | Read | Write (for recovery) | Notes |
|-------------|------------------|------|---------------------|-------|
| Users | `/users` | Yes | Limited (property updates, not creation/deletion in v1) | User lifecycle is complex; focus on membership and access |
| Groups | `/groups`, `/groups/{id}/members` | Yes | Yes (add/remove members) | Core blast-radius source; group-based access is the primary cascade mechanism |
| Applications | `/applications` | Yes | Limited (app role assignments) | App registrations are read-heavy; service principal assignments are the write target |
| Service Principals | `/servicePrincipals`, `/appRoleAssignments` | Yes | Yes (role assignment management) | Key for downstream app access recovery |
| Conditional Access | `/identity/conditionalAccess/policies` | Yes | Yes (policy targeting updates) | Sensitive; changes can lock out users if wrong |
| Role Assignments | `/roleManagement/directory/roleAssignments` | Yes | Yes (assignment management) | Directory-level role changes are high severity |

### 6.2 Microsoft 365 Workloads

| Workload | Graph API Surface | Read | Write | Notes |
|----------|------------------|------|-------|-------|
| SharePoint | `/sites`, `/sites/{id}/permissions` | Yes | Yes (permission management) | Site collection permissions are the primary recovery target; file-level is out of scope for v1 |
| OneDrive | `/drives`, `/drives/{id}/root/permissions` | Yes | Limited | Inherits from user identity; usually recovers when identity is fixed |
| Exchange | `/users/{id}/mailboxes`, EWS for delegations | Partial | Partial | Mailbox delegation management is not fully exposed in Graph; may need EWS or PowerShell |
| Teams | `/teams`, `/teams/{id}/members`, `/teams/{id}/channels` | Yes | Yes (membership management) | Channel permissions are derived from team membership; private channel access is nuanced |

### 6.3 Key Integration Realities

**Audit log latency.** Entra audit logs can be delayed 2-15 minutes. M365 unified audit log can be delayed up to 24 hours for some event types. The system cannot guarantee real-time detection.

**Graph API rate limits.** Microsoft Graph enforces per-tenant rate limits (typically 10,000 requests per 10 minutes for application permissions). Blast-radius computation and baseline snapshots must be designed to stay within limits.

**Eventual consistency.** Group membership changes may take minutes to propagate to downstream services. A group rollback does not instantly revoke SharePoint access. The system must account for propagation delays in validation.

**Exchange limitations.** Full mailbox delegation management is not fully available through Graph API. Some operations require Exchange Online PowerShell or EWS. This adds deployment complexity.

**Conditional Access write risk.** Modifying CA policies programmatically is high-risk. A misconfigured policy can lock out administrators. The system should treat CA policy modification as always requiring manual approval in v1.

---

## 7. Hard Technical Problems

### 7.1 Blast-Radius Graph Correctness

**The problem:** The dependency graph must correctly represent how Entra identity changes cascade into M365 and downstream systems. Group membership is the primary cascade mechanism, but the real dependency topology is complex: nested groups, dynamic groups, app role assignments through groups, CA policy group targeting, SharePoint permission inheritance, Teams group-linked teams, and provisioning connectors.

**Why it is hard:** Microsoft does not expose a single "dependency graph" API. The system must infer dependencies by combining multiple data sources: group memberships, app role assignments, CA policy assignments, SharePoint permission inheritance models, Teams-group linkages, and provisioning connector configurations. Some of these relationships are not directly queryable and must be discovered through enumeration.

**Risk:** An incomplete graph means the blast radius is underestimated, and recovery is incomplete. An incorrect graph means the system recommends wrong actions.

### 7.2 Trusted-State Baseline

**The problem:** To validate recovery, the system needs to know what "correct" looks like. This requires maintaining a baseline snapshot of identity objects, permissions, policies, and downstream access states.

**Why it is hard:** Enterprises have thousands of users, groups, applications, and policies. The state space is large and changes constantly through legitimate operations. The system must distinguish between the baseline (what should be true) and the current state (what is true), and it must keep the baseline fresh without overwhelming Graph API rate limits.

**Options:**
- **Periodic full snapshots.** Simple but expensive in API calls and storage. Stale between snapshots.
- **Event-sourced incremental model.** Ingest all changes and derive current state from the event stream. More efficient but requires complete event capture and correct event processing.
- **Hybrid.** Periodic snapshots supplemented by incremental change tracking. Best balance of freshness and cost.

**Recommendation:** Hybrid approach. Take daily full snapshots of critical objects (groups, CA policies, app role assignments). Use audit-log-driven incremental updates between snapshots. Accept that baseline freshness is "best effort" and design validation to flag discrepancies rather than assume perfection.

### 7.3 Recovery Sequencing Safety

**The problem:** Recovery actions have dependencies and side effects. Reverting a group membership before revoking downstream SharePoint access is correct. But what if the SharePoint site has since had independent permission changes? What if the group membership revert triggers a provisioning connector that makes additional downstream changes?

**Why it is hard:** The system is operating in a live, multi-actor environment. Between incident detection and recovery execution, other changes may have occurred. The recovery plan must be validated against current state, not just the state at detection time.

**Mitigation:** Always re-validate current state before executing each recovery step. If the current state has diverged from expectations, pause and escalate to operator review. Never execute a recovery step blindly.

### 7.4 Action Classification

**The problem:** Not every recovery action is a simple rollback. Some require compensating actions (explicitly revoking permissions that were inherited, not just reverting the source). Some require restoration (returning to a baseline state that differs from "undo the last change"). Some require validation only (confirming that a cascading effect has self-corrected).

**Why it is hard:** Classifying the right action type requires understanding the semantics of each object type and its downstream inheritance model. SharePoint permissions inherited through a group may persist in a cached state even after group membership is reverted. The system must know when a simple rollback is sufficient versus when an explicit compensating action is needed.

### 7.5 Partial Information

**The problem:** The system will not always have complete information. Audit logs may be delayed or missing. The dependency graph may have gaps. Downstream app integrations may not expose their internal state.

**Why it is hard:** The system must still provide useful blast-radius estimates and recovery recommendations even with incomplete data. It must clearly communicate confidence levels and known gaps to operators rather than presenting partial analysis as complete.

### 7.6 Avoiding Self-Inflicted Harm

**The problem:** The system itself has write access to identity and permission control planes. A bug in recovery execution could cause more damage than the original incident.

**Why it is hard:** Enterprise identity systems are fragile. Removing a user from the wrong group, modifying the wrong CA policy, or revoking the wrong app role assignment can cause outages, data loss, or security incidents.

**Mitigation:** Operator approval for all high-risk actions. Pre-execution validation ("dry run" mode). Execution logging with rollback capability for the system's own actions. Circuit breakers that halt execution if unexpected errors accumulate. v1 should bias heavily toward recommendation over automation.

---

## 8. Architectural Options and Trade-offs

### Option A: Graph-Based Blast-Radius Engine

**How it works:** Build an in-memory or persistent graph database (e.g., Neo4j, or a custom adjacency model) representing the relationships between Entra objects, M365 resources, and downstream apps. When a change occurs, traverse the graph from the changed node to identify all affected downstream nodes.

| Dimension | Assessment |
|-----------|-----------|
| Correctness | High, if the graph is complete. Graph traversal naturally models cascading dependencies. |
| Performance | Fast for queries. Graph traversal is O(V+E) for the affected subgraph. |
| Complexity | High initial build cost. Graph must be kept in sync with live tenant state. |
| Risk | Graph staleness. If the graph is not refreshed frequently, blast radius may be wrong. |
| Product impact | Strongest blast-radius visualization. Enables path analysis and dependency chain display. |

### Option B: Rules-Based Blast-Radius Engine

**How it works:** Define a set of rules mapping change types to known downstream effects (e.g., "group membership change → check SharePoint sites with that group in their permission model"). Rules are maintained by engineers and updated as new integration patterns are discovered.

| Dimension | Assessment |
|-----------|-----------|
| Correctness | Depends entirely on rule completeness. Easy to miss edge cases. |
| Performance | Fast. Rule evaluation is simple pattern matching. |
| Complexity | Low initial build cost. But maintenance grows linearly with scope. |
| Risk | Brittleness. New patterns require new rules. Does not generalize. |
| Product impact | Adequate for v1 with a known set of scenarios. Does not support arbitrary graph queries. |

### Option C: Hybrid (Recommended)

**How it works:** Use a graph model as the primary blast-radius engine, but supplement with rules for edge cases, known propagation behaviors, and situations where the graph is incomplete. Rules serve as "override" or "enrichment" on top of the graph traversal.

| Dimension | Assessment |
|-----------|-----------|
| Correctness | Best of both. Graph covers structural dependencies; rules cover behavioral knowledge. |
| Performance | Comparable to graph-only. Rule evaluation adds minimal overhead. |
| Complexity | Medium. Must maintain both the graph and the rule set, but they serve different purposes. |
| Risk | Most manageable. Graph gaps are partially covered by rules. Rules are not the sole source of truth. |
| Product impact | Strongest overall. Supports both visualization and edge-case handling. |

### Recovery Orchestration: Recommendation-First vs Execution-First

| Approach | Strengths | Weaknesses | Recommendation |
|----------|-----------|------------|---------------|
| **Recommendation only** | Zero execution risk. Builds trust. Ships faster. | Operators must execute manually. Value perception may be lower. | **v1 default.** |
| **Execution-capable with approval** | Full workflow automation. Higher value. Operator still controls. | Execution bugs are high-severity. Requires robust error handling. | **v1.1 or v2.** |
| **Fully autonomous** | Maximum speed. Minimal operator burden. | Maximum risk. Enterprise buyers will not trust this initially. | **Not before significant trust is established.** |

### Deployment Model

| Approach | Strengths | Weaknesses |
|----------|-----------|------------|
| **Multi-tenant SaaS** | Lower ops cost. Faster iteration. Standard SaaS economics. | Enterprise buyers may resist shared infrastructure for identity workloads. |
| **Tenant-isolated SaaS** | Each customer gets isolated compute/storage. Satisfies enterprise security requirements. | Higher ops cost. More complex provisioning. |
| **Customer-deployed** | Maximum control for customer. No data leaves their environment. | Highest ops cost. Slowest iteration. Hardest to support. |

**Recommendation:** Tenant-isolated SaaS for v1. Each customer's data (snapshots, graphs, audit trails) is stored in isolated resources. Compute can be shared with logical isolation. This balances enterprise trust with operational efficiency.

---

## 9. Recommended Architecture

### Direction

Build a **hybrid graph + rules blast-radius engine** with an **event-sourced change capture pipeline**, **periodic baseline snapshots**, and a **recommendation-first recovery orchestrator** with operator approval gates.

### Why This Fits v1

1. **Graph + rules** provides the strongest blast-radius analysis with manageable complexity. Pure rules would limit us too quickly. Pure graph without rules would miss behavioral edge cases.

2. **Event-sourced change capture** is the right ingestion model because it preserves the full history of changes, supports replay, and enables before/after state reconstruction without depending solely on snapshots.

3. **Periodic baselines** provide the trusted-state anchor. We cannot rely purely on event sourcing because audit logs have gaps and the initial state of a new customer's tenant is unknown.

4. **Recommendation-first** is essential for enterprise trust. The product must demonstrate that it understands blast radius and recovery sequencing before being trusted with execution. Manual operator execution of recommended actions is the right v1 posture.

### What Remains Manual in v1

- **Incident classification.** Operators decide whether a flagged change warrants investigation. The system surfaces candidates.
- **Recovery execution.** The system generates the plan and sequences the steps. Operators approve and (in v1) execute most actions manually using the system's guidance. Selected low-risk actions (e.g., group membership revert) can be system-executed with approval.
- **Baseline approval.** Operators confirm that the baseline snapshot represents the intended state, not just the current state.

### What Is Automated in v1

- Change capture and normalization
- Blast-radius computation
- Recovery plan generation and sequencing
- Before/after state display
- Validation checks against baseline
- Audit trail

---

## 10. MVP / v1 Scoping Recommendation

### Minimum Connector Scope

- Entra audit logs (user, group, application, service principal, CA policy, role assignment changes)
- Microsoft Graph API for live state reads (groups, members, app role assignments, CA policies)
- SharePoint permission reads (site collection level, not item level)

### Deferred Connectors (v2+)

- Exchange mailbox delegation (requires EWS/PowerShell; complex to automate)
- Teams membership management (can be inferred from group membership in v1)
- Downstream LOB app entitlements (requires per-app integration)

### Minimum Blast-Radius Scope

- Group membership changes → downstream SharePoint, CA policy, app role effects
- Service principal / app registration changes → downstream access effects
- CA policy changes → user scope effects

### Minimum Recovery Capability

- Recovery plan generation with correct ordering and action classification
- Recommendation display with rationale and dependencies
- System-assisted execution for group membership rollback (with approval)
- Validation against baseline for group membership and CA policy scope
- All other actions: recommendation only, operator executes manually

### What Waits

- Autonomous execution of high-risk actions (CA policy changes, app role modifications)
- Multi-step orchestration without per-step approval
- Anomaly-based incident detection (v1 uses rule-based flagging)
- Non-Microsoft SaaS coverage
- File-level or message-level recovery

---

## 11. Security, Compliance, and Enterprise Constraints

### Tenant Isolation

Each customer's data must be logically (and preferably physically) isolated. Snapshots, dependency graphs, audit logs, and incident data must not leak across tenants. Encryption at rest with per-tenant keys is recommended.

### Least-Privilege Integration

The system requires broad read access to Entra and M365 (to build the dependency graph and baselines) but should request write access only for the specific recovery actions it will execute. Scoped application permissions, not delegated user permissions. Customers should be able to review and approve the permission set before granting.

Required Graph API application permissions (v1 read scope):
- `Directory.Read.All` (Entra objects)
- `Policy.Read.All` (CA policies)
- `Sites.Read.All` (SharePoint)
- `Group.Read.All` (groups and membership)
- `Application.Read.All` (app registrations and service principals)

Required write permissions (v1 execution scope, optional):
- `GroupMember.ReadWrite.All` (group membership rollback)
- `Policy.ReadWrite.ConditionalAccess` (only if CA execution is enabled)

### Audit Retention

All audit data should be retained for a minimum of 1 year by default, configurable per customer. Audit logs must be immutable (append-only). Customers should be able to export audit data.

### Action Safety Controls

- All write operations must be preceded by a pre-execution state check
- All write operations must be logged before and after
- High-risk actions require explicit operator approval
- Circuit breaker: if more than N actions fail in sequence, halt execution and alert
- Dry-run mode: generate the plan and validate preconditions without executing

---

## 12. Operational Considerations

### Performance and Scale

- **Graph size.** A mid-size enterprise tenant may have 10K-50K users, 5K-20K groups, 500-2K applications, and 50-200 CA policies. The dependency graph for a single tenant is manageable in memory (< 100MB).
- **Blast-radius computation.** Graph traversal for a single incident should complete in < 1 second for typical tenant sizes.
- **Baseline snapshots.** Full tenant snapshot may require 10K-50K Graph API calls. At default rate limits, this takes 10-50 minutes. Must be scheduled during off-peak hours or rate-limited to avoid impacting customer operations.

### Data Freshness

- Audit logs: 2-15 minute latency (Entra), up to 24 hours (some M365 events)
- Baseline snapshots: daily refresh as default; critical objects can be refreshed more frequently
- Dependency graph: refreshed from live state every 4-6 hours, with incremental updates from audit events

### Failure Modes

- **Audit log gap.** If audit logs are delayed or missing, the system may miss a change. Mitigation: periodic state comparison against baseline to detect drift.
- **Graph API outage.** If Microsoft Graph is unavailable, the system cannot capture changes or execute recovery. Mitigation: queue and retry; alert operator.
- **Partial execution failure.** If a recovery step fails mid-sequence, the system must not proceed to dependent steps. Mitigation: halt-on-failure with operator escalation.

### Rate Limits

Microsoft Graph rate limits are the binding constraint for baseline refresh and blast-radius live queries. The system must implement adaptive throttling, request batching, and caching to stay within limits.

---

## 13. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Incomplete dependency graph | Blast radius underestimated; recovery plan misses affected systems | High | Hybrid graph + rules; periodic validation against live state; operator review |
| Audit log latency/gaps | Changes detected late or missed entirely | Medium | Periodic baseline comparison; drift detection; alert on gaps |
| Recovery action causes harm | System-executed rollback breaks something worse | Critical | Recommendation-first; pre-execution validation; operator approval; circuit breakers |
| Graph API rate limits block operations | Baseline refresh or blast-radius query fails | Medium | Adaptive throttling; batching; off-peak scheduling; caching |
| CA policy modification error | Lockout of administrators or users | Critical | CA policy changes always require manual approval in v1; dry-run validation |
| Baseline represents wrong state | System validates against a compromised baseline | High | Operator baseline approval; anomaly flagging; multiple baseline versions |
| Eventual consistency delays | Validation reports false success because propagation is incomplete | Medium | Delayed validation checks; recheck after propagation window; operator notification |
| Microsoft API surface changes | Breaking changes in Graph API or audit log schema | Medium | Schema versioning; integration tests; monitoring for deprecations |
| Enterprise customers reject shared infrastructure | Multi-tenant model blocked by security review | Medium | Tenant-isolated deployment option from day one |

---

## 14. Open Questions

1. **What is the initial incident detection model?** Rule-based flagging (e.g., "privileged group modified by non-human identity") vs operator-initiated investigation vs both?

2. **How do we handle dynamic groups?** Dynamic membership groups change based on user attributes, not explicit add/remove operations. The system may not see audit events for these changes.

3. **How do we handle nested groups?** Group-in-group membership creates transitive access paths. How deep does the dependency graph traverse?

4. **What is the baseline approval workflow?** When a customer first connects, the current state becomes the baseline. But current state may already contain drift or compromise. How does the operator validate the initial baseline?

5. **What is the execution permission model?** Do we require a dedicated service principal with write access, or do we support delegated operator credentials for execution?

6. **How do we handle multi-tenant downstream apps?** If a downstream application (e.g., SAP) has its own identity and entitlement model, how deep does the system go?

7. **What is the right freshness SLA for blast-radius data?** Is "within 15 minutes of the audit event" sufficient, or do customers expect near-real-time?

8. **What happens when two incidents overlap?** If a second high-impact change occurs while recovery from the first is in progress, how does the system handle conflicting recovery plans?

---

## 15. Suggested Next Design Documents

### Priority 1 (before engineering starts)

1. **Blast-Radius Engine Design** — Graph model schema, dependency types, traversal algorithms, refresh strategy, rules engine integration, and performance targets.

2. **Trusted-State Baseline Design** — Snapshot strategy, storage model, freshness guarantees, drift detection, operator approval workflow, and baseline versioning.

3. **Recovery Orchestration Design** — Recovery plan generation algorithm, action classification logic, dependency sequencing, approval gates, execution model, and failure handling.

### Priority 2 (before v1 launch)

4. **Connector and Ingestion Design** — Entra audit log ingestion, M365 audit log integration, Graph webhook vs polling strategy, normalization schema, and rate-limit management.

5. **Tenant Security Architecture** — Isolation model, encryption, key management, permission scoping, credential handling, and compliance controls.

6. **Operator UI and API Design** — Incident dashboard, blast-radius visualization, recovery plan management, approval workflow, and API surface for automation.

---

## Appendix: Traced Example Scenario

**Trigger:** Access Lifecycle Agent adds 12 users to Finance-Privileged-Access group in Entra.

**Ingestion:** Entra audit log event captured within 2-5 minutes. Normalized to: GroupMembershipChange, target=Finance-Privileged-Access, added=12 users, initiator=Access Lifecycle Agent, session=ses-7f2a-4e91-b3c8.

**Incident creation:** Rule fires: "privileged group membership changed by non-human identity, >5 members added." Severity: High. Incident INC-2026-0419 created.

**Blast-radius analysis:** Dependency graph traversal from Finance-Privileged-Access reveals:
- 3 SharePoint site collections with group-based permissions (Finance-Confidential, Treasury-Operations, Audit-Working-Papers)
- 2 CA policies targeting the group (Finance-MFA-Bypass, Finance-Data-Restriction)
- 1 app role assignment through the group (SAP Finance — GL and AP modules)
- 1 Teams team linked to the group (Finance-Leadership workspace)
- Exchange mailbox delegations inherited through group membership

**Recovery plan generation:**
1. [Rollback] Revert group membership → remove 12 added users (approval required)
2. [Compensating] Revoke inherited SharePoint site access (depends on step 1)
3. [Restoration] Restore Exchange mailbox delegation state (depends on step 1)
4. [Validation] Validate CA policy scope matches baseline (depends on step 1)
5. [Compensating] Confirm Teams workspace membership restored (depends on step 1)
6. [Validation] Verify SAP Finance entitlement rollback (depends on steps 1-5, approval required)
7. [Validation] Mark trusted operational state restored (depends on all, approval required)

**Operator approval:** Identity admin reviews blast radius and recovery plan. Approves step 1. Steps 2-5 auto-approved by policy (low-risk compensating and validation actions). Steps 6-7 require explicit approval after step 1 completes.

**Execution:** Step 1 executed via Graph API (remove 12 members from group). Steps 2-5 execute in parallel after step 1 confirms. Step 6 validated after propagation delay. Step 7 confirmed by operator.

**Validation:** Post-recovery state compared against baseline. All 7 areas verified. Incident closed. Audit trail preserved.
