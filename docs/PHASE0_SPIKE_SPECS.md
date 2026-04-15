# Phase 0 Spike Specifications

**Purpose:** Detailed specs for each technical spike. Each spike answers a specific question that determines an implementation decision.

---

## Spike 1: Audit Log Completeness

### Objective
Determine exactly which Entra audit event types include `modifiedProperties` with `oldValue` and `newValue` for the v1 object types.

### Question
For group membership changes, CA policy modifications, app role assignment changes, and service principal credential changes: does the audit log provide before/after state?

### Why It Matters
The before-state reconstruction strategy for the ingestion pipeline depends entirely on this answer. If audit events reliably include `oldValue`, before-state is authoritative. If they do not, the system must reconstruct before-state from snapshots, which is lower confidence and more complex.

### Prerequisites
- Test tenant with SP-Read registered (`AuditLog.Read.All`, `Directory.Read.All`)
- Test tenant populated per the canonical scenario fixture

### Method
1. Execute the canonical scenario: add 12 members to the privileged group using the test agent SP
2. Modify one CA policy targeting (change group assignment)
3. Add one app role assignment via group
4. Add a credential to one service principal
5. Wait 15 minutes for audit log propagation
6. Read all audit events via `GET /auditLogs/directoryAudits?$filter=activityDateTime ge {startTime}`
7. For each event, extract and record:
   - `activityDisplayName`
   - `category`
   - `result`
   - `targetResources[].modifiedProperties[]` — specifically `displayName`, `oldValue`, `newValue`
   - `targetResources[].type`
   - `initiatedBy.app.appId`

### Artifacts to Collect
- JSON file of all raw audit events from the scenario
- Table: event type → has `modifiedProperties` → has `oldValue` → has `newValue` → field coverage notes
- Specific examples of events WITH and WITHOUT before/after state

### Success Criteria
- Documented matrix covering all 4 v1 change types
- For each type: clear answer on whether `oldValue` is present, partial, or absent
- No gaps in the matrix

### Failure Signals
- `modifiedProperties` is empty for group membership changes → before-state reconstruction from snapshots is required
- `oldValue` is present but contains inconsistent formats → normalization requires custom parsing per event type

### If Spike Fails
- Redesign before-state reconstruction to use snapshot-based approach (last known state from most recent baseline snapshot)
- Increase baseline snapshot frequency for affected object types from daily to every 4 hours
- Tag all before-state as "reconstructed (medium confidence)" instead of "authoritative"

---

## Spike 2: Graph Member Removal Reliability

### Objective
Confirm that `DELETE /groups/{groupId}/members/{memberId}/$ref` is reliable, idempotent, and free of unexpected side effects across all relevant group types.

### Question
Can we safely use this endpoint as the sole v1 system-executed write action?

### Why It Matters
This is the only write action in v1. If it is unreliable, the entire execution model must be redesigned. If it has unexpected side effects (triggering provisioning connectors, generating unexpected downstream changes), the self-action and validation models need adjustment.

### Prerequisites
- Test tenant with SP-Execute registered (`GroupMember.ReadWrite.All`)
- Test tenant with 3 group types: security group, M365 group, mail-enabled security group
- Each group populated with 5+ test members

### Method
1. **Reliability test:** Remove 20 members from each group type (60 total removals). Record: HTTP status code, `x-ms-correlation-id`, elapsed time per call.
2. **Idempotency test:** Attempt to remove 10 members that are already absent. Record: HTTP status code (expect 404), response body.
3. **Timing test:** Measure per-removal latency. Calculate p50, p95, p99.
4. **Side-effect test:** After removing 5 members from a security group that has:
   - An app role assignment linked to it
   - A CA policy targeting it
   - A SharePoint site with group permissions
   Record: any audit events generated beyond the group membership change itself
5. **Race condition test:** Read group membership, then immediately delete a member. Read again. Confirm eventual consistency timing.
6. **Rate-limit test:** Execute 50 removals in rapid succession. Observe whether 429 responses are triggered. Record `Retry-After` values.

### Artifacts to Collect
- Table: group type → success count → failure count → avg latency → p95 latency
- Table: idempotency attempts → response codes
- List of any audit events generated as side effects of removal
- Rate-limit behavior observations

### Success Criteria
- 100% success rate (204 or 404) across all group types
- 404 returned consistently for already-absent members
- Per-removal latency < 2 seconds (p95)
- No unexpected side-effect audit events generated directly by the removal
- Rate limits not triggered at < 1 removal per second

### Failure Signals
- Non-204/404 responses (403, 400, 5xx) for valid removals → permission or API issue
- Side-effect events (provisioning connector fires, unexpected downstream change logged) → execution model needs side-effect awareness
- M365 groups behave differently from security groups → action template must differentiate

### If Spike Fails
- If a specific group type fails: restrict v1 execution to security groups only
- If side effects are observed: add side-effect expectations to the validation handoff model
- If rate limits are hit easily: implement per-tenant execution throttling from v1

---

## Spike 3: Baseline Snapshot Sizing

### Objective
Measure the real-world API call count, elapsed time, and storage size for a full tenant baseline snapshot.

### Question
How expensive is a daily full snapshot? Does it fit within rate-limit budgets and reasonable time windows?

### Why It Matters
The trusted-state design specifies daily full snapshots. If snapshots take too long or consume too many API calls, the refresh cadence must be reduced or the snapshot scope narrowed.

### Prerequisites
- Test tenant populated with realistic scale:
  - 50+ groups (each with 5-50 members)
  - 20+ applications with role assignments
  - 10+ CA policies
  - 10+ service principals with app roles

### Method
1. Enumerate all groups: `GET /groups?$select=id,displayName,groupTypes,securityEnabled`
2. For each group, enumerate members: `GET /groups/{id}/members?$select=id,userPrincipalName,displayName`
3. Enumerate all CA policies: `GET /identity/conditionalAccess/policies`
4. Enumerate all applications: `GET /applications?$select=id,displayName`
5. Enumerate all service principals: `GET /servicePrincipals?$select=id,displayName,appId`
6. For each SP, enumerate app role assignments: `GET /servicePrincipals/{id}/appRoleAssignedTo`
7. Record: total API calls, elapsed time, total response payload size, rate-limit headers after each batch

### Artifacts to Collect
- Table: object type → count → API calls required → avg response size → total size
- Total snapshot: API calls, elapsed time, total storage size
- Rate-limit headroom remaining after snapshot

### Success Criteria
- Total API calls < 20,000 (within 2x of the 10,000/10-min rate limit, achievable in 20-30 minutes)
- Total elapsed time < 30 minutes
- Total storage size < 500 MB
- Rate-limit headroom remains > 30% after snapshot completes

### Failure Signals
- API calls > 50,000 → need pagination optimization or selective snapshot
- Elapsed time > 60 minutes → need to split across off-peak windows
- Storage > 1 GB → need compression or selective scope

### If Spike Fails
- Narrow snapshot scope to high-sensitivity objects only (groups on sensitivity list + their downstream)
- Implement incremental snapshots (full weekly, delta daily)
- Increase baseline refresh interval to weekly full + 4-hour targeted

---

## Spike 4: Entity Size / Storage Limit

### Objective
Determine whether a realistic BlastRadiusResult with 50 ImpactedObjects fits within Azure Table Storage entity size limits (1 MB).

### Question
Can blast-radius results be stored in Table Storage, or do they need blob storage?

### Why It Matters
Table Storage enables indexed queries on blast-radius data. Blob storage is cheaper but requires full-object retrieval. The storage strategy for the analysis layer depends on this answer.

### Prerequisites
- Canonical scenario fixture defined
- Schema package with BlastRadiusResult and ImpactedObject types

### Method
1. Create a realistic BlastRadiusResult JSON object with:
   - 50 ImpactedObjects
   - Each object has: 3-step dependency chain, before/after state snapshots, confidence info, recommended action
   - Include all embedded types (ConfidenceInfo, ProvenanceInfo, StateSnapshot)
2. Serialize to JSON
3. Measure: raw JSON size, gzip compressed size
4. Attempt to write to Azure Table Storage (1 MB entity limit)
5. If it exceeds 1 MB, measure at what object count it crosses the limit

### Artifacts to Collect
- Serialized JSON size for 10, 25, 50, 100 ImpactedObjects
- Size with and without compression
- Azure Table Storage write success/failure per size

### Success Criteria
- 50-object result fits in Table Storage (< 1 MB serialized)
- OR: clear threshold documented and blob fallback plan

### Failure Signals
- 50-object result exceeds 1 MB → blob storage required for blast-radius results

### If Spike Fails
- Store BlastRadiusResult in per-tenant Blob Storage (incident-keyed)
- Store summary metadata in Table Storage for indexing
- Accept that blast-radius drill-down requires blob retrieval, not table query

---

## Spike 5: Container Apps Jobs Scale

### Objective
Confirm that Azure Container Apps Jobs can handle 100+ scheduled jobs running every 5 minutes without excessive start delays or resource contention.

### Question
Is Container Apps Jobs a viable compute model for per-tenant background processing at v1 scale?

### Why It Matters
The deployment architecture specifies Container Apps Jobs for polling, normalization, snapshots, and validation. If jobs have unpredictable start latency or scale poorly, the entire background processing model needs redesign.

### Prerequisites
- Azure subscription with Container Apps environment provisioned
- Container image that simulates a polling job (sleep 10 seconds, log completion)

### Method
1. Deploy 100 scheduled Container Apps Jobs, each running every 5 minutes
2. Run for 2 hours (24 invocations per job = 2,400 total invocations)
3. Record: job start time vs scheduled time (latency), actual execution duration, any failures
4. Calculate: P50, P95, P99 start latency; failure rate; resource utilization

### Artifacts to Collect
- Start latency distribution (histogram)
- Failure rate and failure types
- Resource utilization (CPU, memory) of the Container Apps environment
- Cost estimate for 100 jobs × 5-min cadence × 30 days

### Success Criteria
- P95 start latency < 30 seconds
- Failure rate < 1%
- No job starvation (every job runs every cycle)
- Monthly cost < $200 for 100 jobs at 5-min cadence

### Failure Signals
- P95 start latency > 60 seconds → per-tenant freshness SLO at risk
- Failure rate > 5% → reliability concern
- Jobs starve each other → need per-tenant fairness mechanism

### If Spike Fails
- Evaluate Azure Functions with timer triggers as alternative
- Evaluate a single long-running worker with internal scheduler (shared-worker model)
- Accept higher start latency for non-critical jobs (snapshots) while optimizing for polling
