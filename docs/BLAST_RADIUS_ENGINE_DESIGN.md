# Blast-Radius Engine Design

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisites:** Architecture Memo, Trusted-State Baseline Design  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

The blast-radius engine is KavachIQ's core technical differentiator. It answers the question: "An agent changed this identity object. What else was affected, and in what order must it be recovered?"

**The problem:** Microsoft does not expose a canonical dependency graph. Relationships between identity objects, permissions, policies, data surfaces, and downstream applications are spread across dozens of API surfaces. Some relationships are structural (group membership), some are behavioral (Conditional Access scope effects), and some are latent (provisioning connector side effects). The engine must synthesize all of these into a single, traversable, explainable impact model.

**Recommended design:** A precomputed tenant dependency graph (refreshed periodically from Graph API + audit events) with a rules overlay for behavioral and propagation-aware enrichment. Blast radius is computed by traversing the graph from the incident root node, applying rules at each expansion step, and tagging every impacted object with a confidence level and a dependency chain. The engine outputs a structured, explainable impact map that the recovery planner consumes directly.

**Key trade-offs:**
- Precomputed graph is faster at incident time but requires ongoing refresh cost
- Rules overlay adds complexity but handles the cases where graph structure alone is insufficient (cache persistence, propagation delays, provisioning side effects)
- Confidence tagging adds output complexity but prevents the system from presenting incomplete analysis as certainty

**Biggest risks:** Missing edges (underestimated blast radius), stale graph (wrong blast radius), traversal explosion (performance), and overestimated impact (noisy recovery plans that erode operator trust).

---

## 2. Problem Statement

### Why blast radius is hard

**No canonical dependency graph exists.** Microsoft Entra and Microsoft 365 do not expose a unified "what depends on this object?" API. The relationships must be reconstructed from multiple API surfaces: group membership lists, app role assignment queries, Conditional Access policy targeting, SharePoint permission models, Teams team-group linkages, and provisioning connector configurations.

**Relationships are heterogeneous.** A group membership edge is fundamentally different from a Conditional Access targeting edge or a SharePoint permission inheritance edge. They have different propagation characteristics, different observability, and different recovery implications. The engine cannot treat all edges as equivalent.

**Some impact is structural, some is behavioral.** Adding a user to a group structurally changes their membership (observable via API). But the impact on Conditional Access is behavioral: the CA policy does not change; the user simply falls within its scope. The structural change is directly observable. The behavioral change is inferred.

**Propagation is delayed and eventual.** A group membership change may take seconds to reflect in the group API but minutes to propagate to SharePoint access evaluation and hours to affect Teams membership sync. The blast radius at T+0 differs from the blast radius at T+30 minutes.

**Incomplete coverage leads to incomplete recovery.** If the engine misses a dependency, the recovery plan will not address the affected system. The operator will execute recovery, the system will declare "trusted state restored," and the missed system will remain in a compromised state.

**Overestimated coverage leads to noisy recovery.** If the engine reports impact that does not actually exist, the recovery plan will include unnecessary actions. This wastes operator time, increases execution risk, and erodes trust in the system's accuracy.

**The engine must be correct enough and honest enough.** Perfect completeness is not achievable in v1. The engine must be explicit about what it knows, what it infers, and what it cannot determine.

---

## 3. Design Goals

1. **Identify directly affected objects.** When a group membership changes, identify the group and its members.
2. **Identify transitive downstream impact.** From the group, follow edges to SharePoint sites, CA policies, app role assignments, Teams, and downstream apps.
3. **Represent dependency chains.** For each impacted object, show the path from the incident root (e.g., "group change → app role inheritance → ERP access").
4. **Distinguish confirmed vs inferred impact.** Direct API-readable impact vs computed/inferred impact based on known relationship patterns.
5. **Tag with confidence.** Each impacted object carries a confidence level that the recovery planner and operator UI consume.
6. **Support recovery sequencing.** The output must convey which objects must be recovered before others (identity before data).
7. **Remain explainable.** An operator must be able to understand why each object appears in the blast radius and what dependency path led to it.
8. **Operate incrementally.** Blast-radius computation should complete in seconds for typical incidents, not minutes.
9. **Support Microsoft-first v1 scope.** Entra + M365 objects are first-class. Downstream app adjacency is best-effort.
10. **Extension path.** The model should accommodate non-Microsoft systems in the future without architectural rework.

---

## 4. Non-Goals and Boundaries

- **Not a universal enterprise dependency graph.** v1 does not model Salesforce, ServiceNow, AWS IAM, or other non-Microsoft systems. Downstream LOB apps are represented as opaque terminal nodes with known entitlement relationships.
- **Not semantic intent analysis.** The engine determines what was affected, not whether the change was intentional or malicious.
- **Not content-level impact.** The engine tracks permission and access changes, not which specific files, emails, or messages were read or modified.
- **Not real-time streaming.** The engine computes blast radius on demand when an incident is created. It does not continuously recompute for every audit event.
- **Not fully automated edge discovery.** Some relationship types (provisioning connectors, custom app integrations) require configuration rather than automatic discovery in v1.

---

## 5. Core Concepts and Dependency Primitives

### 5.1 Node Types (objects the engine tracks)

| Node Type | Description | Primary Source |
|-----------|------------|----------------|
| **User** | An Entra user identity | `GET /users` |
| **Group** | An Entra security or Microsoft 365 group | `GET /groups` |
| **Application** | An Entra application registration | `GET /applications` |
| **ServicePrincipal** | A service principal representing an app in the tenant | `GET /servicePrincipals` |
| **AppRoleAssignment** | A role assignment granting access to an app | `GET /servicePrincipals/{id}/appRoleAssignments` |
| **ConditionalAccessPolicy** | A CA policy with group/user targeting conditions | `GET /identity/conditionalAccess/policies` |
| **DirectoryRole** | An Entra directory role (Global Admin, etc.) | `GET /directoryRoles` |
| **SharePointSite** | A SharePoint site collection with permission model | `GET /sites` |
| **Team** | A Microsoft Teams team (usually linked to an M365 group) | `GET /teams` |
| **MailboxDelegation** | Exchange Online mailbox delegation | EWS / PowerShell |
| **DownstreamApp** | An opaque representation of a LOB app with known entitlement | Configured by operator |

### 5.2 Edge Types (relationships between objects)

| Edge Type | From | To | Semantics | Observability |
|-----------|------|----|-----------|--------------|
| `MEMBER_OF` | User | Group | User is a direct member of the group | Direct (Graph API) |
| `NESTED_IN` | Group | Group | Group is a member of another group (nested) | Direct (Graph API) |
| `HAS_APP_ROLE` | Group or User | ServicePrincipal | Group/user is assigned an app role | Direct (Graph API) |
| `TARGETS` | ConditionalAccessPolicy | Group or User | Policy includes this group/user in its conditions | Direct (Graph API) |
| `GRANTS_ACCESS_TO` | Group | SharePointSite | Group is in the site's permission model | Direct (SharePoint API) |
| `LINKED_TO_GROUP` | Team | Group | Team's membership is derived from this M365 group | Direct (Teams/Graph API) |
| `DELEGATES_TO` | User | MailboxDelegation | Mailbox delegation grants access | Partial (EWS/PowerShell) |
| `PROVISIONS_TO` | ServicePrincipal | DownstreamApp | App provisioning connector pushes entitlements downstream | Configured (operator declares) |
| `INHERITS_SCOPE_FROM` | ConditionalAccessPolicy | Group | Policy scope expands/contracts when group membership changes | Inferred (computed from policy config + group membership) |
| `DERIVES_COLLABORATION_FROM` | Team | Group | Team's content, channels, and file access derive from group membership | Inferred (known Microsoft behavior) |

### 5.3 Edge Properties

Every edge carries:

```
Edge
  ├── type: EdgeType
  ├── fromId: string
  ├── toId: string
  ├── direction: "outbound" | "inbound"
  ├── confidence: "authoritative" | "inferred" | "stale" | "configured"
  ├── source: "graph-api" | "audit-log" | "rule" | "operator-configured"
  ├── lastVerified: timestamp
  ├── propagationDelay: duration | null   // known delay for this edge type
  └── recoveryImplication: "rollback-target" | "compensating-target" | "validation-target" | "informational"
```

### 5.4 Dependency Classifications

| Classification | Definition | Example |
|---------------|-----------|---------|
| **Direct** | The changed object itself | The group whose membership was modified |
| **Structural downstream** | Objects that reference the changed object via a persistent, API-readable relationship | SharePoint site that includes the group in its permission model |
| **Behavioral downstream** | Objects whose behavior changes because of the change, even though the object itself is not modified | CA policy whose effective scope expands because a group it targets gained members |
| **Transitive** | Objects affected through a chain of two or more edges | App that provisions entitlements based on a group that is targeted by a CA policy that was behaviorally affected |
| **Inferred** | Impact that cannot be directly observed but is known to exist based on Microsoft platform behavior | Teams channel access changes after group membership change, before Teams API reflects it |
| **Adjacent** | Downstream systems that are known to receive entitlements but whose internal state cannot be read | SAP ERP that receives provisioned access through a connector |

---

## 6. Blast-Radius Scope for v1

### 6.1 Fully Modeled (direct support)

| Object/Relationship | Graph Edges | Confidence | Notes |
|---------------------|------------|-----------|-------|
| Group membership (direct) | `MEMBER_OF` | Authoritative | Core cascade mechanism |
| Group → SharePoint site access | `GRANTS_ACCESS_TO` | Authoritative | Site-level permissions readable via API |
| Group → App role assignment | `HAS_APP_ROLE` | Authoritative | App role assignments readable via API |
| CA policy → Group targeting | `TARGETS`, `INHERITS_SCOPE_FROM` | Authoritative (targeting), Inferred (scope) | Policy config is readable; effective scope is computed |
| Group → Teams team linkage | `LINKED_TO_GROUP`, `DERIVES_COLLABORATION_FROM` | Authoritative (linkage), Inferred (collaboration) | Team-group link is readable; collaboration impact is known behavior |

### 6.2 Partially Modeled (inferred support)

| Object/Relationship | Method | Confidence | Notes |
|---------------------|--------|-----------|-------|
| Nested group membership | `NESTED_IN` traversal | Authoritative (if discovered) | Requires recursive member enumeration; may miss deeply nested groups |
| Exchange mailbox delegation | `DELEGATES_TO` | Low-Medium | Not fully exposed in Graph; requires EWS/PowerShell; modeled as configured edges |
| Directory role effective scope | `TARGETS` from role to users/groups | Inferred | Role assignments are readable; impact of role scope changes is computed |

### 6.3 Adjacency Only (deferred deep support)

| Object/Relationship | Method | Confidence | Notes |
|---------------------|--------|-----------|-------|
| Downstream LOB app entitlements | `PROVISIONS_TO` (configured) | Low | Operator declares the relationship; internal app state is opaque |
| Dynamic group effective membership | Snapshot of computed members | Low | Membership is computed from user attributes; changes are not audited as membership events |
| OneDrive permissions | Inherits from user identity | Inferred from user state | Usually self-corrects when user identity state is corrected |

---

## 7. Graph Model Options

### Option A: Full Persistent Graph Database

**How it works:** Store the entire tenant dependency topology in a graph database (e.g., Neo4j, Amazon Neptune, or a custom adjacency store). Refresh periodically. At incident time, execute traversal queries against the persisted graph.

| Dimension | Assessment |
|-----------|-----------|
| Query performance | Excellent. Traversal is the native operation. |
| Refresh cost | High. Must sync the entire tenant topology regularly. |
| Correctness | Only as current as the last refresh. Stale edges are the primary risk. |
| Operational complexity | High. Requires graph database infrastructure, schema management, and sync pipelines. |
| v1 fit | Overly complex for initial deployment. Graph DB introduces significant infrastructure overhead. |
| Later fit | Good for multi-tenant scale when the refresh pipeline is mature. |

### Option B: On-Demand Subgraph Construction

**How it works:** At incident time, start from the changed object and build the dependency subgraph by querying the live Graph API. Follow edges in real-time, constructing the blast-radius graph dynamically.

| Dimension | Assessment |
|-----------|-----------|
| Freshness | Best possible. Every edge is read live. |
| API cost | Very high. Each incident triggers potentially hundreds of Graph API calls. |
| Latency | Slow. Sequential API calls make traversal take seconds to minutes. |
| Rate limit risk | High. A complex incident could exhaust rate limits. |
| v1 fit | Too slow and expensive for production use. Useful for validation/debugging. |
| Later fit | Could supplement precomputed graph for critical live-verification reads. |

### Option C: Precomputed Adjacency Model with Rules Overlay (Recommended)

**How it works:** Maintain a precomputed adjacency model (not a full graph database, but a set of indexed relationship tables) refreshed from periodic Graph API reads and audit log events. At incident time, traverse the adjacency model to build the blast-radius subgraph. Apply rules at each expansion step to handle behavioral, propagation, and inference logic.

| Dimension | Assessment |
|-----------|-----------|
| Query performance | Good. In-memory adjacency traversal is fast (milliseconds for typical tenants). |
| Refresh cost | Moderate. Bulk refresh aligns with baseline snapshot cadence; incremental updates from audit events. |
| Correctness | Good for structural edges. Rules compensate for behavioral and inferred relationships. |
| Operational complexity | Moderate. Adjacency tables in a standard database. Rules engine is a code module, not a separate infrastructure. |
| v1 fit | Best balance of performance, cost, correctness, and operational simplicity. |
| Later fit | Can migrate adjacency storage to a graph database when scale demands it. |

### Comparison

| Option | Performance | Freshness | Infrastructure | v1 Fit |
|--------|-----------|-----------|---------------|--------|
| A. Full graph DB | Excellent | Refresh-dependent | High | No |
| B. On-demand live | N/A (slow) | Excellent | Low | No |
| C. Precomputed + rules | Good | Good (hybrid refresh) | Moderate | **Yes** |

---

## 8. Recommended Engine Design

### Architecture

The blast-radius engine consists of three layers:

**Layer 1: Adjacency Store.** A set of indexed relationship tables storing the precomputed dependency edges. Refreshed on the same cadence as baseline snapshots (daily full, incremental from audit events). Each edge is typed, directional, and carries confidence and freshness metadata.

**Layer 2: Traversal Engine.** Given an incident root node (the changed object), performs a breadth-first traversal of the adjacency store. At each step, expands outbound edges from the current frontier, applies depth and cycle limits, and builds the impact subgraph.

**Layer 3: Rules Engine.** Applied at each traversal step and as a post-traversal enrichment pass. Rules model behaviors that the adjacency structure alone cannot represent: propagation delays, cache persistence, provisioning side effects, and confidence adjustments.

### What is precomputed vs computed on demand

| Data | Precomputed | On-Demand |
|------|------------|-----------|
| Group membership edges | Yes (refreshed from snapshot + events) | No |
| App role assignment edges | Yes | No |
| CA policy targeting edges | Yes (structural); Inferred scope is computed | Scope computation on demand |
| SharePoint permission edges | Yes (refreshed from site permission reads) | No |
| Teams-group linkage | Yes | No |
| Blast-radius subgraph for an incident | No | Yes (computed at incident time) |
| Confidence scores | Edge-level confidence is precomputed | Impact-level confidence is computed during traversal |
| Recovery implications | No | Yes (computed by recovery planner from blast-radius output) |

### How the graph stays current

1. **Daily full refresh** aligns with baseline snapshot. All tracked relationship types are re-read from Graph API and the adjacency store is rebuilt.
2. **Incremental updates** from audit log events. When an audit event indicates a relationship change (group member added, app role assigned, CA policy modified), the corresponding edges are updated in the adjacency store immediately.
3. **Staleness detection.** Each edge carries a `lastVerified` timestamp. Edges not refreshed within a configurable window (default: 48 hours) are marked stale. Stale edges are included in traversal but flagged with reduced confidence.

### Where rules are used

Rules are not a replacement for graph structure. They handle three specific categories:

1. **Behavioral inference.** "When a user is added to a group that is targeted by CA policy X, the user is now in scope for policy X." This is not a stored edge; it is computed from the combination of the `MEMBER_OF` edge and the `TARGETS` edge.
2. **Propagation semantics.** "After a group membership rollback, SharePoint access may persist for up to 30 minutes due to token caching. Mark SharePoint impact as 'unverified until T+30min'."
3. **Confidence adjustment.** "Downstream app entitlements marked as 'configured' (operator-declared) should be treated as 'low confidence' in blast-radius output."

---

## 9. Graph Schema / Dependency Model

### 9.1 Node Schema

```
GraphNode
  ├── nodeId: string              // Entra object ID or synthetic ID
  ├── nodeType: NodeType          // User, Group, ServicePrincipal, etc.
  ├── tenantId: string
  ├── displayName: string
  ├── sensitivity: "high" | "medium" | "low"  // operator-configurable
  ├── lastRefreshed: timestamp
  ├── stateHash: string           // from baseline snapshot
  └── metadata: object            // type-specific properties
```

### 9.2 Edge Schema

```
GraphEdge
  ├── edgeId: string
  ├── edgeType: EdgeType
  ├── fromNodeId: string
  ├── toNodeId: string
  ├── tenantId: string
  ├── confidence: "authoritative" | "inferred" | "stale" | "configured"
  ├── source: "graph-api" | "audit-log" | "rule" | "operator-configured"
  ├── lastVerified: timestamp
  ├── propagationDelay: number | null      // milliseconds
  ├── recoveryImplication: RecoveryImplication
  └── metadata: object                     // edge-specific (e.g., role name, permission level)
```

### 9.3 Example: Traced Dependency Chain

Starting from: "12 users added to Finance-Privileged-Access group"

```
[Finance-Privileged-Access] (Group, changed)
    │
    ├── GRANTS_ACCESS_TO ──▶ [Finance-Confidential] (SharePointSite)
    │     confidence: authoritative
    │     recovery: compensating-target
    │
    ├── GRANTS_ACCESS_TO ──▶ [Treasury-Operations] (SharePointSite)
    │     confidence: authoritative
    │     recovery: compensating-target
    │
    ├── HAS_APP_ROLE ──▶ [SAP Finance SP] (ServicePrincipal)
    │     confidence: authoritative
    │     recovery: validation-target
    │     │
    │     └── PROVISIONS_TO ──▶ [SAP Finance ERP] (DownstreamApp)
    │           confidence: configured (operator-declared)
    │           recovery: validation-target
    │
    ├── TARGETS ◀── [Finance-MFA-Bypass] (ConditionalAccessPolicy)
    │     confidence: authoritative (structural)
    │     │
    │     └── INHERITS_SCOPE_FROM ──▶ [12 added users now in policy scope]
    │           confidence: inferred (computed from membership + policy config)
    │           recovery: validation-target
    │
    ├── LINKED_TO_GROUP ◀── [Finance-Leadership] (Team)
    │     confidence: authoritative
    │     │
    │     └── DERIVES_COLLABORATION_FROM ──▶ [private channels, shared files]
    │           confidence: inferred (known Teams behavior)
    │           recovery: compensating-target
    │           propagationDelay: 300000 (5 min Teams sync)
    │
    └── DELEGATES_TO ──▶ [CFO Mailbox] (MailboxDelegation)
          confidence: configured (Exchange delegation not fully in Graph)
          recovery: restoration-target
```

---

## 10. Direct vs Derived vs Transitive Impact

### Classification Definitions

| Classification | Definition | Observability | Recovery Implication |
|---------------|-----------|--------------|---------------------|
| **Direct** | The object that was explicitly changed | API-readable; before/after state available | Rollback target (revert the specific change) |
| **Structural downstream** | An object with a stored relationship to the changed object | API-readable relationship | Compensating or validation target |
| **Behavioral downstream** | An object whose behavior changed because of the change, even though the object itself was not modified | Not directly observable; inferred from policy/config analysis | Validation target (confirm scope reverted) |
| **Transitive** | An object affected through 2+ hops in the dependency chain | Confidence decreases with each hop | Validation target; may require manual verification |
| **Inferred** | Impact that is known to exist based on platform behavior but cannot be confirmed via API until propagation completes | Not observable until propagation delay elapses | Delayed validation target |
| **Adjacent** | A downstream system that receives entitlements but whose internal state is opaque | Not observable by KavachIQ | Operator-verified only |

### How Classification Affects the Product

| Classification | Operator UI | Recovery Plan | Confidence | Validation |
|---------------|------------|--------------|-----------|-----------|
| Direct | Highlighted as root cause | Rollback recommended | High | Immediate API check |
| Structural downstream | Listed with dependency chain | Compensating action or validation | High | API check after recovery |
| Behavioral downstream | Listed with "scope affected" label | Validation recommended | Medium | Computed check after propagation |
| Transitive | Listed with full path shown | Validation, possibly manual | Medium-Low | Delayed check or manual |
| Inferred | Listed with "pending confirmation" | Delayed validation | Low-Medium | Scheduled re-check |
| Adjacent | Listed with "operator verify" | Manual verification recommended | Low | Operator confirms externally |

---

## 11. Computation Model

### 11.1 Input

The blast-radius engine receives an **incident trigger** containing:
- Changed object ID and type
- Change type (membership add/remove, policy modification, role assignment change, etc.)
- Before/after state (from audit log or event capture)
- Incident timestamp

### 11.2 Computation Steps

```
Step 1: ROOT IDENTIFICATION
  Input: changed object ID
  Action: look up the node in the adjacency store
  Output: root node with metadata

Step 2: EDGE EXPANSION (breadth-first)
  For each node in the current frontier:
    a. Query adjacency store for all outbound edges from this node
    b. Query adjacency store for all inbound edges to this node
       where the edge type implies downstream impact
       (e.g., CA policy TARGETS this group → the policy is affected)
    c. For each discovered edge:
       - Check depth limit (default: 5 hops)
       - Check cycle detection (skip if target node already visited)
       - Add target node to the impact set with:
         · dependency chain (path from root)
         · edge confidence
         · classification (direct, structural, behavioral, transitive)

Step 3: RULE ENRICHMENT
  For each node in the impact set:
    a. Apply behavioral rules:
       - "CA policy targeting a group → users added to group inherit scope"
       - "Group linked to Team → membership change affects collaboration"
    b. Apply propagation rules:
       - "SharePoint access via group: propagation delay 0-15 min"
       - "Teams membership sync: propagation delay 0-5 min"
    c. Apply confidence adjustment rules:
       - "Configured edge → confidence capped at 'configured'"
       - "Edge older than 48h → confidence degraded to 'stale'"
       - "Each additional hop → confidence decreases by one level"

Step 4: IMPACT AGGREGATION
  Group impacted objects by:
    a. System category (Identities, SharePoint, Exchange, Teams, Apps, CA)
    b. Confidence level
    c. Recovery classification (rollback, compensating, restoration, validation)
  Compute counts per category.
  Generate summary metrics (total affected, systems affected, users affected).

Step 5: OUTPUT GENERATION
  Produce structured BlastRadiusResult:
    - incident metadata
    - root change summary
    - impacted objects with dependency chains
    - category summaries with counts
    - confidence breakdown
    - known gaps (object types not covered, edges marked stale)
```

### 11.3 Stopping Conditions

- **Depth limit.** Default 5 hops from root. Beyond this, transitive impact is too uncertain to include. Configurable per tenant.
- **Confidence floor.** If the cumulative confidence drops below "low" (e.g., three inferred hops from an already-stale edge), the node is excluded from the primary blast radius and listed as "possible but unconfirmed."
- **Cycle detection.** If a traversal path returns to a previously visited node, the cycle is recorded but not re-expanded.
- **Node type terminal.** `DownstreamApp` nodes are terminal. The engine does not attempt to traverse into opaque external systems.

---

## 12. Rules Layer

### 12.1 Purpose

Rules handle three categories of logic that pure graph traversal cannot:

1. **Behavioral inference:** "What happens to system B when system A changes, even though B's stored state does not change?"
2. **Propagation semantics:** "How long after a change does the downstream effect become observable and stable?"
3. **Confidence adjustment:** "What is the right confidence level for this specific edge type and freshness?"

### 12.2 Rule Structure

```
Rule
  ├── id: string
  ├── name: string
  ├── trigger: { nodeType, edgeType, changeType }
  ├── condition: (node, edge, context) => boolean
  ├── action: "add-impact" | "adjust-confidence" | "set-propagation-delay" | "flag-for-operator"
  ├── parameters: object
  └── source: "microsoft-behavior" | "platform-default" | "operator-configured"
```

### 12.3 v1 Rule Set

| Rule | Trigger | Action | Rationale |
|------|---------|--------|-----------|
| CA scope expansion | Group targeted by CA policy gains members | Add users to CA impact set with "behavioral" classification | CA policy does not change but its effective scope does |
| CA scope contraction | Group targeted by CA policy loses members | Add users to CA impact set for scope validation | Must verify MFA/DLP scope contracted correctly |
| SharePoint token persistence | SharePoint access revoked via group change | Set propagation delay to 15 min; flag for delayed validation | SharePoint access tokens may persist after group reversion |
| Teams membership sync delay | Group linked to Team changes membership | Set propagation delay to 5 min on Teams impact | Teams membership sync from Entra group is not instant |
| Provisioning connector side effect | Group with provisioning connector changes | Flag downstream app for validation; confidence = "configured" | Provisioning may push entitlement changes that persist independently |
| Nested group expansion | Group that is a member of another group | Recursively expand parent group's downstream edges | Nested group membership creates transitive access |
| Stale edge degradation | Any edge with lastVerified > 48h | Degrade confidence to "stale" | Old data should not be presented as current |
| Depth confidence decay | Traversal depth > 2 hops | Reduce confidence by one level per additional hop | Transitive impact becomes less certain with distance |

### 12.4 What rules are not

Rules are not a general-purpose logic engine. They do not:
- Determine whether a change is harmful (that is incident classification, not blast radius)
- Decide recovery actions (that is the recovery planner)
- Override graph structure (they enrich, not replace)
- Model arbitrary business logic (they model known Microsoft platform behaviors)

---

## 13. Confidence and Uncertainty Model

### 13.1 Edge Confidence Levels

| Level | Definition | Source | Decay |
|-------|-----------|--------|-------|
| **Authoritative** | Edge verified from live API within the refresh window | Graph API read, audit event | Decays to "stale" after 48h without re-verification |
| **Inferred** | Edge computed from known platform behavior rather than direct observation | Rule engine, behavioral inference | Does not decay (inference is logic-based, not time-based) |
| **Stale** | Edge was authoritative but has not been re-verified within the freshness window | Aged authoritative edge | Decays to "unverified" after 7 days |
| **Configured** | Edge declared by operator rather than discovered from API | Operator configuration | Does not decay (operator maintains) |
| **Unverified** | Edge has no recent evidence; presence is assumed from historical data | Very old data or inferred from partial signal | Excluded from primary blast radius; listed as "possible" |

### 13.2 Impact Confidence Propagation

Impact confidence is the minimum confidence along the dependency chain:

```
Root (authoritative) → Edge 1 (authoritative) → Edge 2 (inferred) → Target
Target impact confidence = min(authoritative, authoritative, inferred) = inferred
```

```
Root (authoritative) → Edge 1 (stale) → Edge 2 (authoritative) → Target
Target impact confidence = min(authoritative, stale, authoritative) = stale
```

### 13.3 When the Engine Escalates to Operator

The engine should explicitly tell the operator it cannot fully determine blast radius when:

- More than 20% of edges in the impact subgraph are stale or unverified
- A high-sensitivity node (privileged group, CA policy, directory role) is connected only through inferred edges
- Traversal was truncated by depth limit and the truncated frontier contains high-sensitivity nodes
- A configured edge has no re-verification evidence since initial declaration

---

## 14. Refresh and Freshness Strategy

### 14.1 Refresh Sources

| Source | What It Provides | Cadence | Cost |
|--------|-----------------|---------|------|
| **Full Graph API scan** | Complete edge set for all tracked relationships | Daily (aligned with baseline snapshot) | 13K-15K API calls per tenant |
| **Audit log events** | Incremental edge updates for audited change types | Near-real-time (2-15 min latency) | Low (polling existing audit stream) |
| **Targeted live reads** | Fresh state for specific objects during incident computation | On-demand at incident time | Low per-incident; rate-limit risk at scale |
| **Operator configuration** | Downstream app relationships, custom edges | On operator action | None (manual) |

### 14.2 Staleness Management

- Edges refreshed from daily full scan: fresh for 24-48h
- Edges updated from audit events: fresh until next relevant audit event or daily scan
- Edges not refreshed in 48h: marked stale, confidence degraded
- Edges not refreshed in 7 days: marked unverified, excluded from primary blast radius

### 14.3 Incident-Time Live Verification

For high-severity incidents (operator-configurable), the engine can trigger targeted live reads for critical edges in the blast-radius subgraph before presenting results. This adds latency (seconds per live read) but increases confidence for high-stakes decisions.

**Trade-off:** Live reads at incident time compete with the rate-limit budget. The engine should limit live reads to the immediate neighborhood of the root change (1-hop edges only) and rely on precomputed data for deeper traversal.

---

## 15. Explainability and Operator-Facing Output

### 15.1 Output Structure

```
BlastRadiusResult
  ├── incidentId: string
  ├── rootChange: { objectId, objectType, changeType, beforeAfter }
  ├── computedAt: timestamp
  ├── totalAffectedObjects: number
  ├── totalAffectedSystems: number
  ├── overallConfidence: "high" | "medium" | "low" | "mixed"
  ├── knownGaps: string[]              // "Exchange delegation edges are stale", etc.
  ├── categories: BlastRadiusCategory[]
  └── impactedObjects: ImpactedObject[]

BlastRadiusCategory
  ├── name: string                     // "SharePoint", "Conditional Access", etc.
  ├── objectCount: number
  ├── highestSeverity: string
  └── confidenceSummary: string

ImpactedObject
  ├── objectId: string
  ├── objectType: NodeType
  ├── displayName: string
  ├── category: string
  ├── classification: "direct" | "structural" | "behavioral" | "transitive" | "inferred" | "adjacent"
  ├── confidence: ConfidenceLevel
  ├── dependencyChain: DependencyHop[]  // full path from root to this object
  ├── impactDescription: string         // human-readable: "12 users gained full-control access"
  ├── beforeState: object | null
  ├── afterState: object | null
  ├── recoveryImplication: RecoveryImplication
  └── propagationDelay: number | null

DependencyHop
  ├── fromObjectId: string
  ├── fromObjectName: string
  ├── edgeType: EdgeType
  ├── toObjectId: string
  ├── toObjectName: string
  └── confidence: ConfidenceLevel
```

### 15.2 Explainability Requirements

For every impacted object, the operator must be able to see:
1. **Why it is impacted.** The dependency chain shows the exact path (e.g., "Group change → GRANTS_ACCESS_TO → SharePoint site").
2. **How confident the engine is.** The confidence level and its basis ("authoritative: edge verified from Graph API 3 hours ago").
3. **What the impact actually is.** Before/after state or a human-readable impact description.
4. **What is known vs unknown.** If the engine could not fully determine impact, it says so explicitly.

---

## 16. Use in Recovery Planning

### Output the Planner Consumes

The recovery planner receives the full `BlastRadiusResult` and uses it to:

1. **Select recovery targets.** Each `ImpactedObject` with a `recoveryImplication` of rollback-target, compensating-target, or restoration-target becomes a candidate recovery step.
2. **Determine action ordering.** Dependency chains define ordering constraints. An object cannot be recovered before its upstream dependency is resolved.
3. **Classify action types.** The `classification` field influences action type:
   - Direct → rollback
   - Structural downstream → compensating action
   - Behavioral downstream → validation
   - Adjacent → operator verification
4. **Set approval requirements.** Low-confidence objects or objects with stale edges require operator approval before execution. High-confidence structural objects may be auto-approved by policy.
5. **Handle uncertainty.** If the blast radius has `knownGaps`, the planner should flag the recovery plan as "partial" and recommend the operator investigate the gaps before declaring trusted state.

---

## 17. Security and Tenant Considerations

- **Tenant isolation.** The adjacency store, all edges, and all blast-radius results are per-tenant. No cross-tenant edge should be possible.
- **Edge provenance.** Every edge records its source (which API call or audit event created it). This supports debugging and audit.
- **Access control.** Blast-radius results contain sensitive information about permission structures. Only operators with incident-response roles should see full blast-radius output.
- **Sensitive object handling.** Nodes marked as "high sensitivity" (e.g., Global Admin group, CA policies) should trigger additional logging when they appear in a blast radius.

---

## 18. Operational Constraints

### Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Blast-radius computation time | < 2 seconds for 95th percentile | Operator is waiting; must be interactive |
| Adjacency store size per tenant | < 500MB | In-memory or fast-SSD-backed for query performance |
| Daily refresh duration | < 30 minutes per tenant | Must fit within off-peak window |
| Incremental update latency | < 5 seconds after audit event received | Should not bottleneck behind audit log latency |

### Scale Considerations

For a tenant with 50K users, 20K groups, 2K apps, 200 CA policies, and 500 SharePoint sites:
- Estimated node count: ~73K
- Estimated edge count: ~200K-500K (dominated by MEMBER_OF edges)
- Traversal from a single group change: typically visits 50-500 nodes (depending on group's downstream footprint)

This is well within in-memory adjacency traversal performance for any modern compute instance.

### Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|-----------|
| Daily refresh fails | Adjacency store becomes stale | Alert operator; mark all edges as stale; incremental updates still flow |
| Audit log ingestion stops | No incremental edge updates | Staleness detection flags edges; drift detection catches divergence at next snapshot |
| Traversal timeout | Blast radius incomplete | Return partial result with "computation truncated" flag; recommend operator review |
| Rate limit during incident-time live reads | Cannot verify critical edges | Fall back to precomputed edges with confidence downgrade; flag for operator |

---

## 19. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Missing edges | Blast radius is underestimated; affected system not in recovery plan | High | Periodic full refresh; audit-driven incremental updates; drift detection; operator review of blast radius before recovery |
| Stale edges | Engine reports impact that no longer exists (relationship was removed) | Medium | Staleness tracking; confidence degradation; freshness metadata in operator UI |
| Overestimated blast radius | Recovery plan includes unnecessary actions; operator fatigue | Medium | Confidence filtering; allow operators to dismiss low-confidence items; track false-positive rate |
| Traversal explosion | Deeply nested groups or highly connected objects cause performance degradation | Medium | Depth limits; cycle detection; traversal budget (max nodes per computation) |
| Behavioral rule incorrectness | A rule models Microsoft behavior that has changed or varies by tenant config | High | Rules are versioned and testable; integration tests against real tenants; operator feedback loop |
| Nested group depth | Deeply nested groups create exponential edge expansion | Medium | Configurable depth limit for nested group resolution (default: 3 levels) |
| Dynamic group blind spot | Dynamic groups change membership without audited events | Medium | Snapshot effective membership at refresh time; accept that inter-snapshot changes are invisible |
| Adjacent app opacity | Downstream app state is unknown; engine assumes impact but cannot verify | Low-Medium | Clearly label adjacent impact as "operator verify only"; never include in automated recovery |
| Eventual consistency false negatives | Validation reads after recovery report "not yet propagated" as "mismatch" | Medium | Propagation-delay rules; scheduled delayed re-validation; confidence tagging |

---

## 20. Open Questions

1. **What is the right nested group depth limit?** Microsoft supports up to ~20 levels of nesting. Traversing all levels is correct but expensive. What is the practical limit for blast-radius accuracy?

2. **Should the engine support "reverse blast radius"?** Given an affected downstream system, can the engine trace back to possible root causes? This would support incident investigation (not just forward analysis).

3. **How should the engine handle multi-valued CA policy conditions?** A CA policy may target multiple groups with AND/OR logic. Should the engine model the full policy condition logic or treat any group targeting as sufficient?

4. **What is the right traversal budget?** Should there be a hard cap on the number of nodes visited in a single blast-radius computation to prevent runaway traversal?

5. **Should operators be able to add custom edges?** Beyond the declared downstream app relationships, should operators be able to define arbitrary custom edges (e.g., "this group membership affects this external system in this way")?

6. **How should the engine handle conflicting edge data?** If the daily snapshot shows a group has 4 members but the latest audit event shows a member was added, which is authoritative? (The trusted-state doc says snapshots override, but for blast radius freshness may matter more.)

7. **Should the engine cache blast-radius results?** If two incidents affect the same group within minutes, should the second computation reuse the first's graph traversal?

---

## 21. Recommendation Summary

### Build for v1

- **Precomputed adjacency model** refreshed daily (full) with incremental audit-log updates. Stored in standard relational tables with indexed lookups, not a graph database.
- **Breadth-first traversal** from incident root with 5-hop depth limit, cycle detection, and confidence propagation.
- **Rules engine** with 8 initial rules covering CA behavioral inference, propagation delays, provisioning side effects, nested group expansion, staleness degradation, and depth-based confidence decay.
- **Full v1 scope:** Group membership, app role assignments, CA policy targeting, SharePoint site permissions, Teams-group linkage. Exchange delegation and downstream apps as configured/adjacent edges.
- **Explainable output:** Every impacted object carries a dependency chain, confidence level, and human-readable impact description.

### Defer to v2+

- Full graph database backend (when scale demands it)
- Reverse blast radius (trace from downstream to root)
- Dynamic group effective-membership tracking in the adjacency model
- Custom operator-defined edge types beyond downstream app declarations
- Blast-radius caching across related incidents
- Full CA policy condition-logic modeling (AND/OR group combinations)

### Assumptions That Must Hold

1. Microsoft Graph API continues to expose group membership, app role assignments, CA policy configurations, and SharePoint site permissions at current API surfaces.
2. Entra audit logs capture group membership changes, CA policy modifications, and app role assignment changes with reasonable completeness.
3. Adjacency traversal for a typical enterprise tenant (50K users, 20K groups) completes in under 2 seconds from a single root node.
4. 8-10 rules are sufficient to model the most important behavioral and propagation patterns in v1.

### Prototype/Validate Next

1. **Adjacency store build time.** Run a full edge-extraction pipeline against a real mid-size Entra tenant. Measure Graph API call count, elapsed time, rate-limit headroom, and resulting edge count.
2. **Traversal performance.** Build a test adjacency model at expected scale (200K-500K edges) and benchmark BFS traversal from high-connectivity nodes. Confirm sub-2-second target.
3. **Rule accuracy.** For the CA behavioral inference rule and the SharePoint propagation delay rule, test against a real tenant. Confirm that inferred impact matches actual observed state changes.
