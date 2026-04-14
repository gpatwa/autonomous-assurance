# Connector and Ingestion Design

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisites:** Architecture Memo, Trusted-State Baseline Design, Blast-Radius Engine Design, Recovery Orchestration Design  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

The connector and ingestion layer transforms messy, delayed, incomplete Microsoft control-plane signals into a trustworthy internal change model. Every downstream system (incident creation, blast-radius analysis, trusted-state comparison, recovery orchestration, validation) depends on this layer producing normalized, deduplicated, confidence-tagged change records with provenance.

**The core problem:** Microsoft provides at least five different data surfaces relevant to KavachIQ (Entra audit logs, M365 unified audit, Graph read APIs, Graph change notifications, PowerShell/EWS). These surfaces vary in latency (2 minutes to 24 hours), completeness (some changes are not logged), schema (each API has its own event format), and reliability (webhooks can be missed, audit logs can be delayed). There is no single authoritative stream of changes.

**Recommended model:** A hybrid ingestion architecture with three complementary data paths:
1. **Entra audit log polling** as the primary event source (most complete, 2-15 min latency)
2. **Graph change notifications** for near-real-time awareness of high-priority changes (seconds to minutes, but incomplete and unreliable alone)
3. **Periodic state snapshots via Graph API** for ground-truth baseline refresh and drift detection (daily full, 4-hour critical objects)

All three paths feed into a normalization pipeline that produces a unified `NormalizedChange` record. Deduplication ensures that the same logical change observed through multiple sources produces one canonical record. Correlation groups related changes into incident candidates. Raw events are preserved immutably for replay and audit.

**Key trade-off:** Freshness vs correctness. Webhooks provide the fastest signal but are unreliable and incomplete. Audit logs are more complete but delayed. Snapshots are authoritative but stale. The system must reason about all three and expose confidence levels, not pretend any single source is sufficient.

---

## 2. Problem Statement

### Why ingestion is hard in this product

**No single canonical change stream.** Microsoft provides audit logs, change notifications, and read APIs, but none individually covers all the change types KavachIQ needs with the latency, completeness, and before/after state required.

**Signal variety.** An Entra group membership change generates an audit log entry (with a 2-15 minute delay), potentially a Graph change notification (near-real-time but may be missed), and is observable via a Graph membership read (current state only, no before-state). The ingestion layer must reconcile these into one trustworthy change record.

**Latency varies by orders of magnitude.** Entra audit logs arrive within 2-15 minutes. M365 unified audit log events for some workloads can be delayed up to 24 hours. Graph change notifications are near-real-time but are advisory, not guaranteed. The system must handle a mix of latencies without treating delayed data as missing data.

**Before/after state is not always available.** Some audit events include modified properties with old and new values. Others include only the fact that a change occurred and the current (post-change) state. The ingestion layer must reconstruct before-state when it is not directly provided, using either the event stream or the most recent snapshot.

**Raw events are noisy.** A single logical change (adding 12 users to a group) may generate 12 individual audit events. A retry may produce duplicate events. Out-of-order delivery means a "remove" event may arrive before the corresponding "add" event. The system must deduplicate, order, and correlate without losing real information.

**Some changes are invisible.** Dynamic group membership changes (triggered by user attribute changes) may not generate explicit audit events. Provisioning connector side effects may occur outside the logged surface. The system must explicitly represent what it does not know.

**The ingestion layer must not create false incidents.** Recovery actions executed by KavachIQ itself generate audit events. The system must distinguish its own actions from new external changes to avoid feedback loops.

---

## 3. Design Goals

1. **Ingest relevant Entra and M365 control-plane changes.** Cover the object types in the blast-radius engine's v1 scope: groups, users, applications, service principals, CA policies, role assignments, SharePoint site permissions.
2. **Normalize heterogeneous events.** Transform Entra audit log entries, M365 audit entries, Graph notification payloads, and snapshot diffs into a single `NormalizedChange` schema.
3. **Preserve before/after state.** Where the source provides it, capture directly. Where it does not, reconstruct from the event stream or most recent snapshot. Tag the confidence level.
4. **Support incident correlation.** Group related raw events into meaningful change bundles that the incident system can evaluate.
5. **Support event replay and backfill.** Store raw events immutably. Support reprocessing from any point in the event history.
6. **Tag with confidence and provenance.** Every normalized change carries its source(s), latency, and a confidence indicator.
7. **Tolerate delay, duplication, and incompleteness.** Do not break on late-arriving events, duplicate deliveries, or missing data. Handle all gracefully.
8. **Isolate tenants.** All data paths are tenant-scoped from ingestion through storage.
9. **Distinguish KavachIQ's own actions from external changes.** The system must not flag its own recovery writes as new incidents.

---

## 4. Non-Goals and Boundaries

- **Not a universal SaaS connector framework.** v1 covers Microsoft Entra and Microsoft 365 only. The connector model should be extensible but does not need to abstract over arbitrary SaaS APIs.
- **Not a SIEM replacement.** The ingestion layer captures control-plane identity and permission changes. It does not ingest security alerts, threat intelligence, or endpoint telemetry.
- **Not data-plane backup.** File content, email bodies, and document versions are out of scope.
- **Not Teams message-level capture.** Teams coverage is limited to membership and channel state derived from group membership and Teams API reads.
- **Not real-time guaranteed.** The system aims for near-real-time awareness (webhook-augmented) with authoritative correctness from audit logs (minutes) and snapshots (hours). Sub-second detection is not a goal.
- **Not anomaly detection.** The ingestion layer normalizes and correlates changes. It does not classify changes as anomalous, malicious, or risky. That is the incident system's responsibility.

---

## 5. Microsoft-First Source Inventory

### 5.1 Source Comparison

| Source | What It Provides | Mode | Latency | Completeness | Before/After | v1 Priority |
|--------|-----------------|------|---------|-------------|-------------|-------------|
| **Entra audit logs** (`/auditLogs/directoryAudits`) | All Entra identity changes: users, groups, apps, SPs, CA policies, roles | Poll (1-5 min interval) | 2-15 min | High for Entra objects | Partial (modified properties with old/new for some change types) | **Primary** |
| **Entra sign-in logs** (`/auditLogs/signIns`) | Authentication events, CA policy enforcement | Poll | 2-15 min | High for auth events | N/A (not mutation events) | Deferred (v2 for risk scoring) |
| **M365 unified audit log** (Office 365 Management API) | SharePoint, Exchange, Teams administrative changes | Poll (subscription + content fetch) | 12 min - 24 hours | Variable by workload | Limited (usually post-change state only) | **Secondary** (SharePoint, Exchange) |
| **Graph change notifications** (`/subscriptions`) | Real-time webhook for supported resources: users, groups, org contacts, messages | Subscribe + receive | Seconds - minutes | Incomplete (not all resource types supported, webhooks can be missed) | None (notification of change only, not state) | **Supplementary** (speed, not correctness) |
| **Graph read APIs** (`/groups`, `/policies`, `/sites`, etc.) | Current state of any readable object | On-demand or scheduled | Real-time (at read time) | Complete for the read | N/A (current state only) | **Snapshot/validation** |
| **Exchange Online PowerShell** | Mailbox permissions, delegations, transport rules | Scheduled script or API wrapper | Minutes | Good for delegation data | Limited | Deferred (v2 for Exchange delegation recovery) |

### 5.2 Source-Specific Details

**Entra audit logs** are the most valuable single source. They cover user creation/modification, group membership changes, application registration changes, service principal changes, CA policy modifications, and directory role assignments. Events include the `activityDisplayName`, `initiatedBy` (user or app), `targetResources` with modified properties, and timestamps. Modified properties often include `oldValue` and `newValue`, but this varies by change type.

**M365 unified audit log** covers SharePoint administrative changes (site permission modifications, sharing policy changes), Exchange admin changes (mailbox permission grants, delegation changes), and Teams admin actions. The latency is much less predictable than Entra: SharePoint events typically arrive within 30-60 minutes, but some Exchange events may take up to 24 hours. The event format differs from Entra and requires separate normalization.

**Graph change notifications** provide near-real-time awareness for user and group changes (seconds). However, they are advisory: if the webhook endpoint is unreliable, events are lost (Microsoft retries for ~4 hours then gives up). They provide notification of change but not before/after state. They are useful as a "speed layer" to trigger early blast-radius evaluation, but the system must not depend on them for completeness.

**Graph read APIs** provide current state on demand. They are the ground truth for snapshots and validation. They do not provide change history. They are rate-limited (10,000 requests per 10 minutes per tenant for application permissions). They are used for baseline snapshots, before-state reconstruction, and post-recovery validation.

---

## 6. Connector Model Options

### Option A: Audit-Log-First

**How it works:** Poll Entra audit logs as the primary event source. Process every audit event through normalization. Use Graph reads to supplement before/after state when audit events lack it. No webhooks. Snapshots for baseline only.

| Dimension | Assessment |
|-----------|-----------|
| Freshness | 2-15 minute latency for Entra. 30-1440 minutes for M365. |
| Completeness | High for Entra. Variable for M365. |
| Complexity | Low. Single polling pipeline. |
| Failure mode | If audit log polling fails, events are delayed until polling resumes. Historical events are not lost (audit logs are retained by Microsoft for 30 days). |
| v1 fit | **Good starting point.** Reliable, complete for Entra, simple to implement. |

### Option B: Webhook-First

**How it works:** Subscribe to Graph change notifications for all supported resources. Use webhooks as the primary trigger. Supplement with audit log polling for coverage gaps.

| Dimension | Assessment |
|-----------|-----------|
| Freshness | Near-real-time for supported resources. |
| Completeness | Poor. Not all resource types support webhooks. Webhooks can be missed. |
| Complexity | High. Webhook infrastructure, subscription management, renewal, failure handling. |
| Failure mode | Missed webhooks create silent gaps. Must have fallback polling. |
| v1 fit | Too risky as primary source. Good as a supplement. |

### Option C: Hybrid Audit + Webhook + Snapshot (Recommended)

**How it works:** Three complementary data paths running concurrently:
1. **Audit log polling** (primary, every 3-5 minutes) for completeness
2. **Graph webhooks** (supplementary) for near-real-time awareness
3. **Scheduled snapshots** (daily full, 4-hour critical) for ground truth and drift detection

All three paths feed into the same normalization pipeline. Deduplication reconciles observations from multiple sources. Webhooks provide early signal; audit logs provide authoritative record; snapshots catch anything missed by both.

| Dimension | Assessment |
|-----------|-----------|
| Freshness | Seconds (webhook) to minutes (audit log) to hours (snapshot). Layered. |
| Completeness | Best available. Three independent paths reduce gaps. |
| Complexity | Medium. Three pipelines, one normalization, one dedup. |
| Failure mode | If one path fails, others continue. No single point of failure for event capture. |
| v1 fit | **Recommended.** Best balance of freshness, completeness, and reliability. |

---

## 7. Recommended Ingestion Architecture

### Three-path model

1. **Entra audit log polling** is the **primary authoritative event source.** Polled every 3-5 minutes. Provides the most complete record of identity and permission mutations with partial before/after state. This is the source of truth for "what changed."

2. **Graph change notifications** are the **speed layer.** Provide near-real-time awareness of group membership, user, and CA policy changes. Used to trigger early blast-radius evaluation and operator notification. Never treated as authoritative alone. Always reconciled against audit log events.

3. **Graph API state snapshots** are the **ground truth layer.** Daily full snapshots for baseline. 4-hour targeted refreshes for critical objects. Used for baseline store, before-state reconstruction, drift detection, and recovery validation. This is the source of truth for "what state was."

### What is authoritative vs best-effort

| Claim | Source | Authority Level |
|-------|--------|----------------|
| "A change occurred" | Audit log event | Authoritative |
| "A change may have just occurred" | Graph webhook notification | Advisory / best-effort |
| "The current state is X" | Graph API read (at read time) | Authoritative for that instant |
| "The state at time T was X" | Snapshot at T, or audit-log-reconstructed | Authoritative (snapshot) or reconstructed (event stream) |
| "The before-state was X" | Audit log `oldValue` field | Authoritative if present |
| "The before-state was probably X" | Last snapshot or last known state from event stream | Reconstructed / medium confidence |

---

## 8. High-Level Ingestion Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Microsoft Tenant                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Entra    │  │ M365     │  │ Graph    │  │ Graph Read       │ │
│  │ Audit Log│  │ Unified  │  │ Webhooks │  │ APIs             │ │
│  │          │  │ Audit    │  │          │  │                  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────────────┘ │
└───────┼──────────────┼──────────────┼──────────────┼──────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
│ Entra Audit  ││ M365 Audit   ││ Webhook      ││ Snapshot     │
│ Poller       ││ Poller       ││ Receiver     ││ Workers      │
│ (3-5 min)    ││ (15-30 min)  ││ (real-time)  ││ (scheduled)  │
└──────┬───────┘└──────┬───────┘└──────┬───────┘└──────┬───────┘
       │               │               │               │
       └───────────────┴───────┬───────┘               │
                               │                       │
                               ▼                       │
                    ┌──────────────────┐               │
                    │  Raw Event Store │               │
                    │  (immutable,     │               │
                    │   tenant-scoped) │               │
                    └────────┬─────────┘               │
                             │                         │
                             ▼                         │
                    ┌──────────────────┐               │
                    │  Normalization   │◀──────────────┘
                    │  Pipeline        │  (supplement before/after
                    │                  │   from snapshots)
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Deduplication   │
                    │  Service         │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Correlation     │
                    │  Service         │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Normalized Change│───▶ Incident System
                    │ Store            │───▶ Blast-Radius Engine
                    │ (tenant-scoped)  │───▶ Baseline Store
                    └──────────────────┘───▶ Audit Trail
```

### Component Responsibilities

| Component | Responsibility | Input | Output |
|-----------|---------------|-------|--------|
| **Entra Audit Poller** | Poll `/auditLogs/directoryAudits` every 3-5 min. Paginate through new events. Filter for relevant activity types. | Graph API (read) | Raw audit events |
| **M365 Audit Poller** | Subscribe to M365 Management Activity API content blobs. Fetch and parse SharePoint/Exchange/Teams admin events. | O365 Management API | Raw audit events |
| **Webhook Receiver** | Receive Graph change notifications at registered endpoint. Validate notification signature. Extract resource ID and change type. | Inbound HTTPS | Raw notification events |
| **Snapshot Workers** | Execute scheduled Graph API reads for baseline refresh. Full snapshot daily; targeted critical-object refresh every 4 hours. | Graph API (read) | Object state snapshots |
| **Raw Event Store** | Immutable, append-only, tenant-scoped storage of all raw events. Supports replay and audit. | All pollers/receiver | Stored raw events |
| **Normalization Pipeline** | Transform raw events from any source into `NormalizedChange` records. Supplement missing before/after state from snapshot store. | Raw events + snapshots | Normalized changes |
| **Deduplication Service** | Identify and merge duplicate observations of the same logical change from different sources. | Normalized changes | Deduplicated changes |
| **Correlation Service** | Group related changes into incident candidates using actor/session/time/target signals. | Deduplicated changes | Correlated change bundles |
| **Normalized Change Store** | Tenant-scoped storage of canonical change records. Supports time-range queries, object-scoped queries, and provenance lookup. | Correlated changes | Query API for downstream systems |

---

## 9. Normalized Change Model

### Schema

```
NormalizedChange
  ├── changeId: string                 // unique, system-generated
  ├── tenantId: string                 // tenant scope
  │
  ├── source: SourceInfo
  │   ├── system: "entra-audit" | "m365-audit" | "graph-webhook" | "snapshot-diff" | "manual"
  │   ├── rawEventIds: string[]        // references to raw event store
  │   ├── observedAt: timestamp        // when the source reported it
  │   └── ingestedAt: timestamp        // when KavachIQ processed it
  │
  ├── actor: ActorInfo
  │   ├── type: "user" | "application" | "service-principal" | "system" | "unknown"
  │   ├── id: string | null
  │   ├── displayName: string | null
  │   ├── agentIdentified: boolean     // true if recognized as an AI agent or automation identity
  │   └── sessionId: string | null     // workflow/agent session if available
  │
  ├── target: TargetInfo
  │   ├── objectType: ObjectType       // "group" | "user" | "application" | "servicePrincipal" |
  │   │                                 // "conditionalAccessPolicy" | "roleAssignment" |
  │   │                                 // "sharepointSite" | "team" | "mailbox"
  │   ├── objectId: string
  │   └── displayName: string
  │
  ├── changeType: ChangeType           // "memberAdded" | "memberRemoved" | "propertyModified" |
  │                                     // "objectCreated" | "objectDeleted" | "assignmentAdded" |
  │                                     // "assignmentRemoved" | "policyModified" | "permissionChanged"
  │
  ├── beforeState: StateSnapshot | null
  │   ├── state: object                // serialized pre-change state
  │   ├── capturedAt: timestamp
  │   └── confidence: "authoritative" | "reconstructed" | "best-effort" | "unavailable"
  │
  ├── afterState: StateSnapshot | null
  │   ├── state: object
  │   ├── capturedAt: timestamp
  │   └── confidence: "authoritative" | "reconstructed" | "best-effort"
  │
  ├── confidence: ChangeConfidence
  │   ├── level: "high" | "medium" | "low"
  │   ├── reasons: string[]            // e.g., ["audit log with oldValue/newValue", "before-state from snapshot 2h ago"]
  │   └── missingFields: string[]      // e.g., ["beforeState.members.roles"]
  │
  ├── provenance: ProvenanceInfo
  │   ├── primarySource: string        // which source contributed the authoritative record
  │   ├── corroboratingSources: string[] // which other sources confirmed the same change
  │   └── conflictingSources: string[]  // which sources provided conflicting information
  │
  ├── correlationHints: CorrelationHints
  │   ├── actorSessionId: string | null
  │   ├── operationBatchId: string | null // from Microsoft audit log correlationId
  │   └── timeCluster: timestamp         // rounded to correlation window for grouping
  │
  ├── selfAction: boolean              // true if this change was executed by KavachIQ's recovery engine
  │
  └── metadata: object                 // source-specific additional data preserved for debugging

```

### Mandatory vs Optional Fields

| Field | Required | Notes |
|-------|----------|-------|
| changeId, tenantId | Yes | System-generated |
| source.system, source.rawEventIds | Yes | Must trace to raw events |
| actor.type | Yes | May be "unknown" |
| target.objectType, target.objectId | Yes | Core of the change record |
| changeType | Yes | Classified during normalization |
| afterState | Yes (high/medium confidence) | At least post-change state must be capturable |
| beforeState | Best-effort | May be unavailable; confidence field indicates reliability |
| confidence.level | Yes | Downstream systems depend on this |
| selfAction | Yes | Prevents feedback loops |

---

## 10. Raw Event Preservation and Provenance

### Immutable Raw Event Store

Every raw event received from any source is stored in an immutable, append-only, tenant-scoped event store. Events are stored in their original format (JSON from Microsoft APIs) with metadata: source, ingestion timestamp, and processing status.

### Raw-to-Normalized Lineage

Each `NormalizedChange` references one or more `rawEventIds`. This enables:
- **Forward tracing:** From a raw event, find the normalized change(s) it contributed to
- **Backward tracing:** From a normalized change, find all raw events that contributed to it
- **Replay:** Reprocess raw events through the normalization pipeline to regenerate normalized changes (useful after bug fixes or schema updates)

### Multiple Raw Events → One Normalized Change

A single logical change (e.g., "12 users added to a group") may arrive as:
- 12 individual Entra audit log entries (one per member addition)
- 1 Graph webhook notification (group resource changed)
- 1 snapshot diff (group membership count changed)

All of these should produce **one** `NormalizedChange` with all 12 `rawEventIds` linked, not 14 separate changes.

---

## 11. Deduplication and Idempotency

### Sources of Duplication

| Source | Duplication Pattern | Frequency |
|--------|-------------------|-----------|
| Webhook retry | Same notification delivered multiple times | Common (Microsoft retries on delivery failure) |
| Polling overlap | Same audit event fetched in consecutive polling cycles | Common (polling window overlap for reliability) |
| Cross-source | Same change observed via audit log AND webhook AND snapshot diff | By design (this is the hybrid model) |
| Processing retry | Same raw event processed multiple times after system restart | Occasional |

### Deduplication Strategy

**Within a source:** Deduplicate on the raw event's source-provided unique ID (`id` field in Entra audit events, `clientTrackingId` in M365 audit). Maintain a short-lived seen-ID cache (TTL: 24 hours).

**Across sources:** Deduplicate on the logical change identity: `(tenantId, target.objectId, changeType, approximateTimestamp)`. If a webhook notification and an audit log event describe the same logical change within a 15-minute window, they are merged into one `NormalizedChange`. The audit log event becomes the primary (more complete), and the webhook is recorded as a corroborating source.

### Idempotent Downstream Publication

Normalized changes are published with a deterministic `changeId`. Downstream consumers (incident system, blast-radius engine) use the `changeId` for idempotent processing. Reprocessing the same raw events produces the same `changeId`.

---

## 12. Correlation and Incident-Candidate Formation

### Correlation Model

The ingestion layer does not create incidents. It produces **correlated change bundles** that the incident system evaluates.

### Correlation Signals

| Signal | How It Works | Example |
|--------|-------------|---------|
| **Actor session** | Changes with the same `actor.id` and `actor.sessionId` within a time window are grouped | Access Lifecycle Agent, session ses-7f2a, made 12 group membership changes |
| **Microsoft operation batch** | Changes sharing the same Microsoft `correlationId` or `operationId` | Batch operation that modified group + CA policy in one API call |
| **Target object** | Multiple changes to the same object within a time window | Group membership add + CA policy scope change affecting the same group |
| **Time cluster** | Changes within a configurable correlation window (default: 5 minutes) from the same actor | Burst of 12 member additions within 3 seconds |

### Correlation Output

```
CorrelatedChangeBundle
  ├── bundleId: string
  ├── tenantId: string
  ├── changeIds: string[]             // references to NormalizedChange records
  ├── primaryActor: ActorInfo
  ├── affectedObjects: string[]       // unique target objectIds
  ├── changeTypes: string[]           // unique changeTypes in the bundle
  ├── timeRange: { start: timestamp, end: timestamp }
  ├── correlationSignals: string[]    // which signals triggered grouping
  └── incidentCandidateScore: number  // heuristic score for incident system (0-100)
```

### Incident Candidate Scoring Heuristics

The ingestion layer assigns a preliminary score (not a final classification):
- Non-human actor (application/service-principal): +30
- Privileged target (group in sensitivity list, CA policy, directory role): +30
- Bulk change (>5 objects or members affected): +20
- Change type is membership modification or role assignment: +10
- Actor is on the known-agent list: +10

Score >= 50: flagged as incident candidate. Score < 50: logged, not flagged.

The incident system (not the ingestion layer) makes the final decision on whether to create an incident.

---

## 13. Polling, Webhooks, and Snapshots

### Polling Strategy

**Entra audit log polling:**
- Frequency: every 3-5 minutes
- API: `GET /auditLogs/directoryAudits?$filter=activityDateTime ge {lastPollTime}`
- Pagination: follow `@odata.nextLink` until exhausted
- Overlap: poll window extends 2 minutes before `lastPollTime` to catch late-arriving events
- Cost: ~10-50 API calls per poll cycle (depends on event volume)

**M365 unified audit polling:**
- Frequency: every 15-30 minutes (latency makes more frequent polling wasteful)
- API: Office 365 Management Activity API (subscription + content blob fetch)
- Filter: SharePoint admin events, Exchange admin events
- Cost: variable, depends on content blob volume

### Webhook Strategy

**Graph change notification subscriptions:**
- Resources: `/groups`, `/users` (Entra)
- Subscription lifetime: 3 days (renewable; auto-renewal worker)
- Notification validation: challenge token verification
- Failure handling: if notifications stop arriving, fall back to polling (audit log is still running)
- Usage: trigger early blast-radius pre-computation; do not use as sole evidence of change

### Snapshot Strategy

**Full snapshot:** Daily, off-peak hours. Enumerate all tracked objects (groups + members, CA policies, app role assignments, SharePoint site permissions).

**Targeted refresh:** Every 4 hours for objects on the sensitivity list (privileged groups, CA policies with broad scope, service principals with privileged roles).

**On-demand snapshot:** Triggered by incident creation. When an incident is opened, the system takes a live snapshot of all affected objects for fresh blast-radius input.

### Backfill and Repair

If a polling window is missed (system outage, API failure):
1. On recovery, the poller fetches all events from the last successful poll time
2. Entra audit logs are available for 30 days, so gaps up to 30 days can be repaired
3. M365 audit content blobs are available for 7 days
4. For gaps beyond retention, snapshot comparison detects drift and flags for investigation

---

## 14. Latency, Freshness, and Completeness Model

### Source Latency Expectations

| Source | Minimum Latency | Typical Latency | Maximum Latency | Freshness SLA |
|--------|----------------|----------------|----------------|---------------|
| Graph webhook | 1-10 seconds | 5-30 seconds | 4 hours (retry window) | Near-real-time (advisory) |
| Entra audit log | 2 minutes | 5-10 minutes | 15 minutes | < 15 minutes for detection |
| M365 audit (SharePoint) | 15 minutes | 30-60 minutes | 2-4 hours | < 1 hour |
| M365 audit (Exchange) | 30 minutes | 2-4 hours | 24 hours | < 4 hours (best effort) |
| Graph API state read | Immediate | Immediate | Immediate | Real-time at read time |
| Snapshot (scheduled) | 4-24 hours | 12-24 hours | 24 hours | Daily ground truth |

### Completeness Guarantees

| Change Type | Entra Audit | M365 Audit | Webhook | Snapshot Diff |
|------------|------------|-----------|---------|--------------|
| Group membership add/remove | Yes (individual events) | N/A | Yes (group changed notification) | Yes (member list diff) |
| CA policy modification | Yes | N/A | Partial (policy resource not always supported) | Yes |
| App role assignment | Yes | N/A | No | Yes |
| SharePoint permission change | No | Yes (delayed) | No | Yes (site permission read) |
| Exchange delegation | No | Partial | No | Partial (Graph has limited coverage) |
| Dynamic group membership change | No (attribute change logged, not membership effect) | N/A | No | Yes (effective membership diff) |

### Late-Arriving Events

Events that arrive after the initial correlation window are still processed:
1. Normalized and deduplicated as usual
2. If they correlate with an existing change bundle: appended to the bundle
3. If the bundle already produced an incident: the incident is updated with new information
4. The system logs a "late arrival" note on the change record with the actual delay

---

## 15. Before/After State Reconstruction

### Direct Before/After

Some Entra audit events include `modifiedProperties` with `oldValue` and `newValue`. When present, these are authoritative before/after state. Confidence: **authoritative**.

### Reconstructed Before-State

When the audit event does not include before-state (e.g., group membership add event includes only the added member, not the prior full member list):

1. **Check event stream.** If the system has a complete event history for this object, reconstruct the before-state by rolling back the change from the current known state. Confidence: **reconstructed** (high if event stream is complete, medium if gaps exist).

2. **Check snapshot store.** Retrieve the most recent snapshot of the object from before the change timestamp. Use the snapshot as before-state. Confidence: **reconstructed** (degrades with snapshot staleness: < 4 hours = medium, < 24 hours = low, > 24 hours = best-effort).

3. **Live read supplementation.** If the change was just detected (via webhook), perform an immediate Graph API read to capture the current (post-change) state. The before-state is then the last known state from snapshot or event stream. Confidence: **best-effort** until audit log confirms.

### Confidence Matrix for Before-State

| Before-State Source | Confidence | Notes |
|--------------------|-----------|-------|
| Audit log `oldValue` | Authoritative | Microsoft-provided; most reliable |
| Event-stream reconstruction (complete history) | Reconstructed (high) | Depends on zero event gaps |
| Recent snapshot (< 4 hours) | Reconstructed (medium) | Snapshot may include changes made between snapshot and incident |
| Older snapshot (4-24 hours) | Reconstructed (low) | Higher risk of intermediate changes |
| No data available | Unavailable | Flag to downstream systems; recovery planner must handle |

---

## 16. Confidence and Uncertainty Model

### Change-Level Confidence

| Level | Criteria | Downstream Effect |
|-------|---------|-------------------|
| **High** | Audit log event with before/after state, corroborated by webhook or snapshot | Blast-radius engine treats as confirmed input. Recovery planner can auto-generate steps. |
| **Medium** | Audit log event without before-state, or reconstructed before-state from recent snapshot | Blast-radius engine includes with caveats. Recovery planner may flag for operator review. |
| **Low** | Snapshot-diff-only observation (no audit event), or heavily reconstructed state | Blast-radius engine includes as "possible." Recovery planner requires operator confirmation before acting. |

### Source Disagreement

When multiple sources provide conflicting information about the same change:
1. Record all observations in the provenance
2. Prefer the audit log over webhook over snapshot-diff
3. Flag the conflict on the normalized change for operator visibility
4. Do not silently resolve conflicts; let the downstream system decide how to handle

---

## 17. Failure Handling and Repair

| Failure | Detection | Impact | Recovery |
|---------|-----------|--------|----------|
| **Audit log poller failure** | Health check, missing poll heartbeat | Events accumulate but are not lost (30-day retention) | Auto-restart; backfill from last successful poll time |
| **Webhook subscription expiry** | Subscription renewal monitor | Near-real-time awareness lost; audit log still running | Auto-renew subscription; if renewal fails, alert operator |
| **Webhook endpoint outage** | Microsoft stops delivering; notification status check | Events lost after 4-hour retry window | Not recoverable from webhook; audit log covers |
| **Graph API rate limit** | 429 response | Snapshot delayed; live reads blocked temporarily | Exponential backoff; adaptive throttle; reschedule |
| **M365 audit API failure** | Content blob fetch error | SharePoint/Exchange events delayed | Retry with backoff; events are retained in Microsoft's blob store for 7 days |
| **Normalization error** | Processing exception, schema mismatch | Raw event stored but not normalized | Dead-letter queue; manual review; schema fix; reprocess |
| **Snapshot worker failure** | Health check, missed snapshot schedule | Baseline staleness increases | Auto-restart; alert if missed by > 2x scheduled interval |

### Dead-Letter Queue

Events that fail normalization (parse errors, unexpected schema, missing required fields) are routed to a tenant-scoped dead-letter queue. They are not silently dropped. The operations team reviews dead-letter events weekly. Schema fixes are applied and events reprocessed.

### Self-Action Identification

To prevent feedback loops, the ingestion layer must identify changes initiated by KavachIQ's own service principal:
1. The system's service principal `appId` is configured at deployment
2. All audit events where `initiatedBy.app.appId` matches the system's ID are tagged with `selfAction: true`
3. Self-action events are stored and normalized (for audit trail) but are excluded from incident candidate scoring and correlation

---

## 18. Security and Tenant Isolation

**Tenant-scoped credentials.** Each connected tenant has its own service principal registration with specific consented permissions. Credentials (client certificates preferred over client secrets) are stored in a per-tenant secret vault.

**Least-privilege permissions.** v1 read scope:
- `AuditLog.Read.All` (Entra audit logs)
- `Directory.Read.All` (Entra objects)
- `Policy.Read.All` (CA policies)
- `Group.Read.All` (groups and membership)
- `Application.Read.All` (apps and service principals)
- `Sites.Read.All` (SharePoint permissions)

Write permissions (for recovery execution) are requested separately and only granted for the execution service principal.

**Data isolation.** Raw events, normalized changes, and correlation data are stored in tenant-scoped partitions. Cross-tenant queries are architecturally impossible at the storage layer.

**Credential rotation.** Client certificates are rotated annually (or more frequently per enterprise policy). The system supports zero-downtime rotation by accepting both old and new certificates during a transition window.

---

## 19. Operational Constraints

### Rate Limit Budget

| Operation | API Calls per Cycle | Frequency | Daily Total |
|-----------|-------------------|-----------|-------------|
| Entra audit log poll | 10-50 | Every 3-5 min | 4,000-24,000 |
| Graph webhook renewal | 1-5 | Every 3 days | ~2 |
| Snapshot: full daily | 13,000-15,000 | Daily | 15,000 |
| Snapshot: critical 4-hour | 500-1,000 | Every 4 hours | 3,000-6,000 |
| On-demand incident reads | 50-200 | Per incident | Variable |
| **Total daily** | | | **~25,000-45,000** |

Microsoft's default limit is 10,000 requests per 10 minutes (600,000 per day). Daily ingestion budget is well within limits, leaving significant headroom for blast-radius queries, validation reads, and recovery execution.

### Storage Growth

| Data Type | Per-Tenant Per Day | 90-Day Retention |
|-----------|-------------------|-----------------|
| Raw events | 5-50 MB | 0.5-4.5 GB |
| Normalized changes | 1-10 MB | 90-900 MB |
| Snapshots | 50-200 MB | 4.5-18 GB (with delta compression) |

Manageable with standard cloud object storage. Delta compression between adjacent snapshots reduces snapshot storage by 80-90%.

---

## 20. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Entra audit log delayed > 15 min | Incident detection delayed; pre-incident state estimate less accurate | Medium | Webhook layer provides early signal; snapshot comparison catches missed events |
| Webhook delivery missed | Near-real-time awareness lost for affected events | Low (audit log covers) | Treat webhooks as advisory; never depend on them for completeness |
| Before-state unavailable | Recovery planner cannot determine rollback target | High | Snapshot-based reconstruction; flag low-confidence before-state; require operator review |
| Duplicate events create false incident candidates | Correlation overestimates scope of change | Medium | Cross-source deduplication; correlation dedup within time window |
| Schema drift in Microsoft API | Normalization breaks on new/changed fields | Medium | Schema versioning; dead-letter queue; automated schema monitoring |
| Self-action creates feedback loop | KavachIQ's own recovery generates a new incident | High | Self-action tagging by service principal ID; exclusion from incident scoring |
| M365 audit latency (up to 24h) | SharePoint/Exchange changes detected very late | Medium | Accept M365 latency for v1; supplement with snapshot comparison for critical SharePoint sites |
| Polling gap during system outage | Events accumulate but are not processed | Medium | Auto-backfill on recovery; 30-day Entra audit retention; 7-day M365 blob retention |
| Rate limit exhaustion blocks snapshot | Baseline refresh fails | Medium | Adaptive throttling; off-peak scheduling; partial snapshot with flags |

---

## 21. Open Questions

1. **Should the Entra audit log poller run in the customer's tenant or KavachIQ's infrastructure?** Running in KavachIQ's infrastructure (with delegated permissions) is simpler but means all audit data traverses the network. Running closer to the tenant reduces data transfer but increases deployment complexity.

2. **What is the right correlation window?** 5 minutes catches burst operations (12 member additions) but may miss slow-rolling agent workflows that span 30 minutes. Should the window be configurable per tenant?

3. **Should the system ingest Entra sign-in logs in v1?** Sign-in logs are not mutation events but could provide context about who authenticated after a group membership change. Adding them increases ingestion volume significantly.

4. **How should dynamic group changes be handled?** Dynamic group membership changes are not logged as explicit audit events. The system can only detect them through snapshot comparison. Should the snapshot worker enumerate effective membership of dynamic groups?

5. **How should the system handle very large groups (10,000+ members)?** Full member enumeration per poll cycle may be prohibitively expensive. Should the system use delta queries or change tracking for large groups?

6. **What retention policy should apply to raw events?** 90 days matches the recommended baseline retention. Longer retention supports forensic investigations but increases storage cost. Should this be configurable per tenant?

7. **Should the ingestion layer support manual event injection?** If an operator knows about a change that was not captured by any automated source, should they be able to manually inject a change record?

---

## 22. Recommendation Summary

### Build for v1

- **Three-path hybrid ingestion:** Entra audit log polling (primary, 3-5 min), Graph webhooks (supplementary, near-real-time), scheduled snapshots (daily full, 4-hour critical)
- **Unified normalization pipeline** producing `NormalizedChange` records with before/after state, confidence, and provenance
- **Cross-source deduplication** reconciling observations from audit logs, webhooks, and snapshot diffs
- **Correlation service** grouping related changes by actor session, operation batch, target object, and time cluster
- **Immutable raw event store** with full lineage to normalized changes for replay and audit
- **Self-action identification** to prevent feedback loops from recovery execution

### Defer to v2+

- M365 unified audit log for Exchange delegation events (complex, high-latency, limited Graph coverage)
- Entra sign-in log ingestion (high volume, not mutation events, v2 for risk scoring)
- Dynamic group effective-membership tracking (requires snapshot-based detection, not event-driven)
- Manual event injection (operational tool, not core pipeline)
- Customer-deployed ingestion workers (v1 runs in KavachIQ infrastructure)

### Assumptions That Must Hold

1. Entra audit log API continues to provide `directoryAudits` with `modifiedProperties` including `oldValue`/`newValue` for key change types (group membership, CA policy modification).
2. Graph change notification subscriptions for groups and users continue to be supported with current semantics.
3. Microsoft Graph rate limits (10,000 req/10 min) are sufficient for daily ingestion plus operational queries.
4. Entra audit log retention (30 days) provides sufficient backfill window for gap repair.

### Prototype/Validate Next

1. **Audit log completeness assessment.** For each v1 object type (group, CA policy, app role, SP), verify which change types generate audit events, which include `oldValue`/`newValue`, and which do not. This directly determines before-state reconstruction requirements.
2. **Webhook reliability measurement.** Register Graph change notifications for groups in a test tenant. Measure delivery rate, latency distribution, and failure/retry patterns over 7 days. Determine whether webhooks are reliable enough as a speed layer.
3. **Correlation accuracy.** Replay a set of known agent-driven changes through the proposed correlation logic. Measure whether the correlation window and signals correctly group related changes without over-grouping unrelated ones.
