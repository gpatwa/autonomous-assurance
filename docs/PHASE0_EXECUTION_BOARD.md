# Phase 0 Execution Board

**Duration:** Weeks 1-3  
**Goal:** All architecture assumptions validated. Team ready to build Phase 1.

---

## Work Items

### WI-01: Entra Test Tenant Setup

| Field | Value |
|-------|-------|
| Priority | P0 (blocking) |
| Owner | [TBD] |
| Dependencies | None |
| Output | Functioning test tenant with realistic population |
| Status | Not started |
| Target | Week 1, Day 1-2 |

**Tasks:**
- [ ] Create or provision dedicated Entra test tenant
- [ ] Create 50+ users (including the 12 canonical added members + 4 original members)
- [ ] Create 20+ groups (including Finance-Privileged-Access as high-sensitivity)
- [ ] Create 10+ applications with app role assignments
- [ ] Create 5+ Conditional Access policies (including Finance-MFA-Bypass, Finance-Data-Restriction)
- [ ] Create 1+ Teams team linked to the privileged group
- [ ] Configure 3 SharePoint site collections with group-based permissions
- [ ] Document: tenant ID, admin credentials, object IDs for all canonical scenario objects

**Success Criteria:**
- [ ] All canonical scenario objects exist and are queryable via Graph API
- [ ] Tenant is isolated from any production environment

---

### WI-02: SP-Read Registration and Verification

| Field | Value |
|-------|-------|
| Priority | P0 (blocking) |
| Owner | [TBD] |
| Dependencies | WI-01 |
| Output | SP-Read with verified permissions in test tenant |
| Status | Not started |
| Target | Week 1, Day 2-3 |

**Tasks:**
- [ ] Register SP-Read application in test tenant
- [ ] Grant application permissions: `AuditLog.Read.All`, `Directory.Read.All`, `Policy.Read.All`, `Group.Read.All`, `Application.Read.All`, `Sites.Read.All`
- [ ] Generate client certificate for SP-Read
- [ ] Store certificate securely (dev vault or local cert store)
- [ ] Verify: read one audit log page via Graph API using SP-Read
- [ ] Verify: read group membership via Graph API using SP-Read
- [ ] Verify: read CA policies via Graph API using SP-Read
- [ ] Document: SP-Read appId, certificate thumbprint, verified permissions

**Success Criteria:**
- [ ] All 6 read permissions consented and verified with live API calls

---

### WI-03: SP-Execute Registration and Verification

| Field | Value |
|-------|-------|
| Priority | P0 (blocking) |
| Owner | [TBD] |
| Dependencies | WI-01 |
| Output | SP-Execute with verified write permission in test tenant |
| Status | Not started |
| Target | Week 1, Day 2-3 |

**Tasks:**
- [ ] Register SP-Execute application in test tenant (separate from SP-Read)
- [ ] Grant application permission: `GroupMember.ReadWrite.All`
- [ ] Generate client certificate for SP-Execute (separate from SP-Read)
- [ ] Store certificate securely
- [ ] Verify: read group membership using SP-Execute
- [ ] Verify: add and remove one test member using SP-Execute
- [ ] Document: SP-Execute appId, certificate thumbprint, verified permissions

**Success Criteria:**
- [ ] Member removal via Graph API succeeds with SP-Execute credentials
- [ ] SP-Execute cannot read audit logs (permission not granted)

---

### WI-04: Shared Schema Package Bootstrap

| Field | Value |
|-------|-------|
| Priority | P0 (blocking) |
| Owner | [TBD] |
| Dependencies | None |
| Output | Importable TypeScript/C# package with canonical entities and enums |
| Status | Not started |
| Target | Week 1, Day 3 - Week 2, Day 2 |

**Tasks:**
- [ ] Choose implementation language (TypeScript recommended for full-stack alignment)
- [ ] Create package from DATA_MODEL_AND_SCHEMA_SPECIFICATION.md
- [ ] Define all 14 canonical enums
- [ ] Define all 6 shared embedded types (ActorInfo, TargetInfo, ConfidenceInfo, ProvenanceInfo, StateSnapshot, TimeMetadata)
- [ ] Define core entity types: NormalizedChange, Incident, BlastRadiusResult, RecoveryPlan, RecoveryStep, ApprovalRecord, ActionInstance, AuditRecord, BaselineVersion
- [ ] Add JSDoc/XML comments on each type
- [ ] Add CI validation (compiles cleanly)
- [ ] Publish as internal package or shared module

**Success Criteria:**
- [ ] All canonical entities compile without errors
- [ ] Two test services can import and use the types
- [ ] CI fails if schema package has type errors

---

### WI-05: Audit Log Completeness Spike

| Field | Value |
|-------|-------|
| Priority | P0 (critical path) |
| Owner | [TBD] |
| Dependencies | WI-01, WI-02 |
| Output | Spike report: SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md |
| Status | Not started |
| Target | Week 1, Day 3 - Week 2, Day 1 |

**Tasks:**
- [ ] Execute canonical scenario against test tenant (add 12 members via agent SP)
- [ ] Execute secondary changes (CA policy modification, app role change, SP credential add)
- [ ] Wait 15 minutes for audit log propagation
- [ ] Fetch and analyze all audit events
- [ ] Produce completeness matrix per PHASE0_SPIKE_SPECS.md Spike 1

**Success Criteria:**
- [ ] Matrix completed for all 4 v1 change types
- [ ] Before-state reconstruction strategy determined

---

### WI-06: Graph Remove-Member Execution Spike

| Field | Value |
|-------|-------|
| Priority | P0 (critical path) |
| Owner | [TBD] |
| Dependencies | WI-01, WI-03 |
| Output | Spike report: SPIKE_REPORT_GRAPH_MEMBER_REMOVAL.md |
| Status | Not started |
| Target | Week 2, Day 1-3 |

**Tasks:**
- [ ] Execute reliability test (60 removals across 3 group types)
- [ ] Execute idempotency test (10 removals of absent members)
- [ ] Execute timing test (latency measurements)
- [ ] Execute side-effect test (observe downstream audit events)
- [ ] Execute rate-limit test (50 rapid removals)
- [ ] Produce report per PHASE0_SPIKE_SPECS.md Spike 2

**Success Criteria:**
- [ ] 100% success rate confirmed
- [ ] Idempotency confirmed (404 for absent)
- [ ] No unexpected side effects documented
- [ ] P95 latency < 2 seconds

---

### WI-07: Baseline Snapshot Sizing Spike

| Field | Value |
|-------|-------|
| Priority | P1 (important, not blocking Phase 1) |
| Owner | [TBD] |
| Dependencies | WI-01, WI-02 |
| Output | Spike report: SPIKE_REPORT_BASELINE_SIZING.md |
| Status | Not started |
| Target | Week 2, Day 2-4 |

**Tasks:**
- [ ] Execute full snapshot enumeration per PHASE0_SPIKE_SPECS.md Spike 3
- [ ] Record API calls, elapsed time, storage size
- [ ] Calculate rate-limit headroom

**Success Criteria:**
- [ ] Snapshot completes in < 30 minutes
- [ ] Storage size < 500 MB
- [ ] Rate-limit headroom > 30%

---

### WI-08: Entity Size / Storage Limit Spike

| Field | Value |
|-------|-------|
| Priority | P1 (important, not blocking Phase 1) |
| Owner | [TBD] |
| Dependencies | WI-04 |
| Output | Spike report: SPIKE_REPORT_ENTITY_SIZE.md |
| Status | Not started |
| Target | Week 2, Day 3-4 |

**Tasks:**
- [ ] Serialize BlastRadiusResult at 10, 25, 50, 100 ImpactedObjects
- [ ] Attempt Azure Table Storage writes
- [ ] Document size thresholds

**Success Criteria:**
- [ ] Clear size threshold documented
- [ ] Storage strategy for blast-radius results confirmed

---

### WI-09: Container Apps Jobs Scale Spike

| Field | Value |
|-------|-------|
| Priority | P1 (important, not blocking Phase 1) |
| Owner | [TBD] |
| Dependencies | Azure subscription |
| Output | Spike report: SPIKE_REPORT_CONTAINER_APPS_JOBS.md |
| Status | Not started |
| Target | Week 2, Day 4 - Week 3, Day 2 |

**Tasks:**
- [ ] Deploy 100 scheduled test jobs per PHASE0_SPIKE_SPECS.md Spike 5
- [ ] Run for 2 hours
- [ ] Analyze start latency, failures, cost

**Success Criteria:**
- [ ] P95 start latency < 30 seconds
- [ ] Failure rate < 1%
- [ ] Cost estimate documented

---

### WI-10: Dev Environment Bootstrap

| Field | Value |
|-------|-------|
| Priority | P0 (blocking) |
| Owner | [TBD] |
| Dependencies | WI-04 |
| Output | Working local dev environment with README |
| Status | Not started |
| Target | Week 2, Day 1-3 |

**Tasks:**
- [ ] Choose local dev stack: Docker Compose or .NET Aspire
- [ ] Configure Azure Storage Emulator (Azurite) for Blob + Table
- [ ] Configure Cosmos DB emulator for tenant metadata
- [ ] Create dev configuration for SP-Read/SP-Execute test credentials
- [ ] Create project structure: read-path monolith + execution service skeleton
- [ ] Verify: both services start locally and connect to emulated stores
- [ ] Write README: setup instructions, prereqs, run commands

**Success Criteria:**
- [ ] `npm run dev` (or equivalent) starts both services locally
- [ ] Services connect to emulated storage
- [ ] A test write/read to each store succeeds

---

### WI-11: Canonical Scenario Fixture Data

| Field | Value |
|-------|-------|
| Priority | P1 |
| Owner | [TBD] |
| Dependencies | WI-05 (audit log spike informs exact event shape) |
| Output | JSON fixture files for the canonical scenario |
| Status | Not started |
| Target | Week 3, Day 1-2 |

**Tasks:**
- [ ] Create JSON fixtures based on real audit events from Spike 5
- [ ] Include: 12 raw events, 12 normalized changes, 1 correlated bundle, 1 incident
- [ ] Include: expected blast-radius output, expected recovery plan
- [ ] Place fixtures in test data directory with schema validation

**Success Criteria:**
- [ ] Fixtures match canonical scenario fixture document
- [ ] Fixtures validate against shared schema package types
- [ ] Fixtures are usable by Phase 1 integration tests

---

### WI-12: Phase 0 Exit Criteria Checklist

| Field | Value |
|-------|-------|
| Priority | P0 |
| Owner | [TBD - Tech Lead] |
| Dependencies | All WIs |
| Output | Completed checklist confirming Phase 1 readiness |
| Status | Not started |
| Target | Week 3, Day 4-5 |

**Exit Criteria:**
- [ ] Test tenant operational with all canonical scenario objects
- [ ] SP-Read and SP-Execute verified
- [ ] Shared schema package compiling and importable
- [ ] Audit log completeness spike complete with documented matrix
- [ ] Graph member removal spike complete with confirmed reliability
- [ ] Baseline snapshot sizing spike complete (or scheduled for parallel in Phase 1)
- [ ] Entity size spike complete with storage strategy confirmed
- [ ] Container Apps Jobs spike complete (or acceptable to defer to Phase 1 deployment)
- [ ] Dev environment running locally
- [ ] Canonical scenario fixture data created
- [ ] No blocking architecture assumptions invalidated
- [ ] Phase 1 work items ready for engineering

---

## Sequence Diagram

```
Week 1:
  Day 1-2: WI-01 (test tenant setup)
  Day 2-3: WI-02 (SP-Read) + WI-03 (SP-Execute) — parallel after tenant
  Day 3-5: WI-04 (schema package) + WI-05 (audit log spike) — parallel

Week 2:
  Day 1-3: WI-06 (member removal spike) + WI-10 (dev environment) — parallel
  Day 2-4: WI-07 (baseline sizing) + WI-08 (entity size) — parallel
  Day 4-5: WI-09 (Container Apps Jobs spike)

Week 3:
  Day 1-2: WI-11 (canonical fixture data from spike results)
  Day 3-5: WI-12 (exit criteria review + Phase 1 kickoff)
```
