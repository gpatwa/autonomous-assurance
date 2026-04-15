# MVP Implementation Roadmap

**Author:** Principal Architect / Founding CTO  
**Date:** April 2026  
**Status:** Draft for engineering planning  
**Prerequisites:** All architecture and design documents  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

KavachIQ has a comprehensive architecture package (10 design documents, 7,000+ lines). The next step is not more architecture. It is building the product.

**Implementation strategy:** Build in five phases, each producing a demonstrable increment. Phase 0 aligns architecture to code. Phase 1 builds the ingestion backbone. Phase 2 delivers the first operator-visible product (incident + blast radius). Phase 3 adds trusted-state comparison and recovery planning. Phase 4 adds limited execution and validation. Phase 5 hardens for pilot. Each phase is 3-5 weeks. Total to pilot-ready MVP: 18-25 weeks.

**Sequencing logic:** Product truth before product breadth. The system must correctly ingest and normalize Entra changes before it can detect incidents. It must detect incidents before it can compute blast radius. It must compute blast radius before it can plan recovery. It must plan recovery before it can execute recovery. This is not arbitrary phasing; it is a technical dependency chain.

**Key trade-off:** Starting narrow and deep (one scenario, fully correct) is slower to show breadth but dramatically reduces the risk of shipping a system that gives wrong blast-radius results or unsafe recovery recommendations. A narrow, believable MVP is worth more than a broad, shaky one.

---

## 2. Implementation Strategy

### Prove product truth first

Before building any operator experience, prove that the data pipeline is correct:
- Entra audit logs can be reliably ingested
- Changes can be normalized with accurate before/after state
- Correlated bundles actually group related changes correctly
- The blast-radius graph traversal produces correct results for the canonical scenario

This is Phase 0-1 work. It is not visible to operators but it is the foundation everything else depends on.

### Prove operator workflow second

Once the data is trustworthy, build the first operator-facing product:
- An incident appears when an agent makes a high-impact change
- The blast radius shows what was affected, with confidence
- The operator can drill into objects, see before/after state, and understand the dependency chain
- The recovery plan shows what should be done, in what order

This is Phase 2-3 work. It is the first time the product is usable.

### Prove safe execution third

Only after the recommendation workflow is solid, add limited execution:
- Approval tokens gate execution
- Group membership rollback works correctly
- Self-actions are recognized and not flagged as new incidents
- Post-execution validation confirms recovery
- Safe mode works

This is Phase 4 work. It is the highest-risk engineering work.

### Broaden scope later

Everything else (CA policy writes, Exchange support, advanced detection, multi-region, external integrations) is post-MVP.

---

## 3. MVP Philosophy

### MVP does NOT mean

- Every Microsoft surface fully modeled
- Every recovery action automated
- ML-based anomaly detection
- Full SIEM/SOAR integration
- Multi-region deployment
- Mobile experience
- Custom workflow builder
- 50+ concurrent tenants

### MVP DOES mean

- One end-to-end scenario works correctly: agent modifies privileged Entra group → incident detected → blast radius mapped across Entra and M365 surfaces → recovery plan generated with identity-first sequencing → operator approves → group membership rolled back → downstream validated → trusted state declared
- The operator experience is coherent and trustworthy for that scenario
- The data pipeline is correct and auditable
- The security boundaries are real, not stubbed
- Safe mode and circuit breakers work
- 1-5 tenants can be supported for pilot

---

## 4. Build Principles

1. **Start narrow.** One scenario end-to-end before adding scenarios.
2. **Prefer correctness over breadth.** A correct blast radius for 3 object types beats an approximate blast radius for 10.
3. **Write automation is the last thing, not the first.** Recommendation-only for most actions. System execution only for group member removal, only after everything upstream is solid.
4. **Use manual/operator steps where needed.** If the system cannot safely automate something, make it a recommendation with operator confirmation. Do not fake automation.
5. **Do not fake safety-critical state.** Mock data for demos is fine. Mock data in the actual production pipeline for a real tenant is not.
6. **Preserve auditability from day one.** Audit records from the first ingested event. Not bolted on later.
7. **Observability is part of MVP.** Structured logging, metrics, and basic alerting from Phase 1. Not Phase 5.
8. **Ship the read/write trust boundary from the start.** Separate service for execution even in the earliest deployment.

---

## 5. Recommended Phase Model

| Phase | Name | Duration | Key Outcome |
|-------|------|----------|-------------|
| **0** | Architecture-to-Build Alignment | 2-3 weeks | Schema package, service boundaries, dev environment, test data, validated spikes |
| **1** | Core Data and Ingestion Backbone | 4-5 weeks | Reliable Entra ingestion, normalized changes, correlated bundles, audit logging |
| **2** | Incident + Blast-Radius Operator Workflow | 4-5 weeks | First operator-visible product: incident list, blast-radius UI, object drill-down |
| **3** | Trusted-State + Recovery Planning | 3-4 weeks | Baseline capture, state comparison, recovery plan generation, approval skeleton |
| **4** | Limited Execution and Validation | 3-4 weeks | Group membership rollback, self-action handling, validation, safe mode |
| **5** | Alpha Hardening / Pilot Readiness | 2-4 weeks | Provisioning, cert rotation, alerting, false-positive tuning, pilot onboarding |

**Total: 18-25 weeks to pilot-ready MVP.**

---

## 6. Phase 0: Architecture-to-Build Alignment (Weeks 1-3)

### Deliverables

| Item | Description |
|------|-------------|
| **Shared schema package** | TypeScript/C# package defining all canonical entities and enums from the Data Model doc. Imported by all services. CI validation. |
| **Service boundary decision** | Finalize: read-path monolith + separate execution service. Document which components live where. |
| **Dev environment** | Local dev: Docker Compose or Aspire with Azure Storage Emulator, Cosmos DB emulator. CI: GitHub Actions with emulated stores. |
| **Test tenant** | Dedicated Entra test tenant with realistic object population. SP-Read and SP-Execute registered. |
| **Synthetic event data** | 7-day synthetic audit log dataset for the canonical scenario. Includes before/after state, agent-initiated events, and noise. |
| **Architecture spike results** | Completed spikes for: audit log completeness, webhook reliability, baseline snapshot size, entity size limits, Graph remove-member behavior. |

### Critical Spikes (Must Complete in Phase 0)

| Spike | Question | Method | Success Criteria |
|-------|---------|--------|-----------------|
| Audit log completeness | Which v1 change types include oldValue/newValue? | Read 7 days of audit from test tenant; catalog fields per event type | Documented matrix of event types vs available fields |
| Graph member removal | Is DELETE /groups/{id}/members/{id}/$ref reliable and idempotent? | Execute 100+ removals across group types | 100% success rate; 404 on already-absent; no side effects |
| Baseline snapshot size | How large is a full tenant snapshot? | Enumerate all groups + members + CA + apps in test tenant | Measured: API call count, elapsed time, storage size |
| Entity size limits | Does a realistic BlastRadiusResult fit in Table Storage? | Serialize 50-object result with dependency chains | Measured: size < 1MB or blob fallback plan documented |
| Container Apps Jobs | Can 100 scheduled jobs run every 5 min without delays? | Deploy 100 test jobs in Azure | P95 start latency < 30 seconds |

---

## 7. Phase 1: Core Data and Ingestion Backbone (Weeks 3-8)

### What Gets Built

| Component | Description | Storage |
|-----------|------------|---------|
| **Tenant model** | Tenant CRUD in Cosmos DB. TenantPolicy and SensitivityList entities. | Cosmos DB (shared) |
| **Entra audit poller** | Scheduled job polling `/auditLogs/directoryAudits` every 5 min per tenant. Raw events stored. | Per-tenant Blob |
| **Raw event store** | Append-only blob storage for raw audit events with tenant isolation. | Per-tenant Blob |
| **Normalization pipeline** | Transform raw Entra audit events into NormalizedChange records. Before-state reconstruction from audit oldValue where available, fallback to "unavailable." | Per-tenant Table |
| **Deduplication** | Within-source dedup on event ID. Cross-source dedup on (target, changeType, time window). | In-pipeline |
| **Correlation service** | Group changes by actor session, target object, and time cluster (5-min window). Produce CorrelatedChangeBundle. | Per-tenant Table |
| **Incident candidate scoring** | Apply scoring signals to bundles. Flag candidates scoring >= 50. Create incident for score >= 80. | Per-tenant Table |
| **Audit logger** | Write AuditRecord for every pipeline step. Hash chain per tenant. Immutable Blob. | Per-tenant Immutable Blob |
| **Basic observability** | Structured logging to App Insights. Ingestion lag metric. Dead-letter alerting. | App Insights |
| **Admin/test CLI** | CLI tool to inspect: raw events, normalized changes, bundles, candidates, incidents for a tenant. | N/A |

### What Is Manual/Simplified in Phase 1

- **Webhook ingestion:** Deferred. Audit-log polling is sufficient for Phase 1.
- **M365 audit ingestion:** Deferred. Entra-only in Phase 1.
- **Baseline snapshots:** Not yet. No trusted-state comparison in Phase 1.
- **Operator UI:** Not yet. Admin CLI for inspection only.
- **Blast-radius computation:** Not yet. Incidents are created but blast radius is not computed.
- **Sensitivity lists:** Hardcoded initial list for test tenant. No UI for management.

### Phase 1 Exit Criteria

- [ ] Entra audit events for group membership, CA policy, and app role changes are reliably ingested for the test tenant
- [ ] NormalizedChange records include before/after state where audit events provide oldValue
- [ ] Correlated bundles correctly group the 12-member-add scenario into one bundle
- [ ] The canonical scenario produces an incident with severity >= "high"
- [ ] Self-action events (from SP-Execute in test scenarios) are tagged and excluded
- [ ] Audit records exist for every pipeline step with hash chain integrity
- [ ] Ingestion lag < 10 minutes (p95)

---

## 8. Phase 2: Incident + Blast-Radius Operator Workflow (Weeks 8-13)

### What Gets Built

| Component | Description |
|-----------|------------|
| **Blast-radius adjacency store** | Build tenant dependency graph from Graph API reads: group→SharePoint, group→CA policy, group→app role, group→Teams. Refresh daily. |
| **Blast-radius engine** | Graph traversal + rules overlay. Compute BlastRadiusResult for an incident. Tag confidence and impact classification. |
| **Operator UI: incident list** | Filterable incident list with severity, status, timestamp. |
| **Operator UI: incident workspace** | Tabbed workspace: Overview, Blast Radius, (Audit placeholder). |
| **Operator UI: blast-radius tab** | Category cards (Identities, SharePoint, Exchange, Teams, Apps, CA). Click to expand objects. |
| **Operator UI: object detail drawer** | Right-side drawer: before/after state, impact reason, dependency chain, confidence, recommended action. |
| **API layer** | REST API: /incidents, /incidents/{id}, /incidents/{id}/blast-radius, /incidents/{id}/blast-radius/objects/{id}. |
| **RBAC skeleton** | Viewer and Incident Responder roles. Auth via Entra SSO (internal initially). |

### What Is Simplified in Phase 2

- **Blast-radius scope:** Groups, CA policies, app role assignments. SharePoint permission reads deferred to Phase 3 (Graph API for SharePoint permissions is complex).
- **Exchange and Teams:** Shown as "inferred from group membership" without direct API reads. Medium confidence.
- **Recovery plan:** Not yet. The operator sees the blast radius and recommendations but no structured plan.
- **Approvals and execution:** Not yet.
- **Baseline comparison:** Not yet. Before/after state comes from the change event, not from baseline.

### Phase 2 Exit Criteria

- [ ] The canonical 12-member-add scenario produces a correct blast radius with 5+ system categories
- [ ] The operator UI shows the incident with blast-radius drill-down
- [ ] Each impacted object shows before/after state and confidence level
- [ ] Dependency chains are explainable in the object drawer
- [ ] The API serves incident and blast-radius data correctly
- [ ] A live demo walkthrough of the operator experience takes < 5 minutes and feels credible

---

## 9. Phase 3: Trusted-State + Recovery Planning (Weeks 13-17)

### What Gets Built

| Component | Description |
|-----------|------------|
| **Baseline snapshot worker** | Daily full snapshot of groups, CA policies, app roles via Graph API. Store as BaselineVersion. |
| **Baseline approval UI** | Operator reviews and approves baseline versions. Auto-approval for low-change refreshes. |
| **State comparison** | Compare current/pre-incident/baseline for any object. Display in object drawer and recovery plan. |
| **Recovery plan generator** | From blast-radius result + baseline, generate tier-based recovery plan with action classification. |
| **Operator UI: recovery plan tab** | Tier-based step display with rationale, dependencies, action type badges, target state. |
| **Operator UI: approval skeleton** | Approval buttons on steps. No execution yet. Approval records created. |
| **Plan versioning** | If state changes invalidate a plan, generate a new version. |
| **Drift detection** | Periodic comparison of current state against approved baseline. Alert on drift. |

### What Is Simplified in Phase 3

- **Baseline scope:** Groups, CA policies, app role assignments. SharePoint site permissions added if Phase 2 spike validated.
- **Recovery execution:** Not yet. Plan is recommendation-only. Operator executes manually and confirms.
- **Approval tokens:** Not yet signed. Approval records exist but no cryptographic verification.

### Phase 3 Exit Criteria

- [ ] Baseline snapshots capture group membership, CA policy targeting, and app role assignments
- [ ] Operator can approve a baseline version
- [ ] Recovery plan for the canonical scenario has 5-7 steps with correct tier ordering
- [ ] Plan shows rollback/restoration/compensating/validation action types correctly
- [ ] Before/after state comparison works for groups and CA policies
- [ ] Drift detection alerts on changes since last approved baseline

---

## 10. Phase 4: Limited Execution and Validation (Weeks 17-21)

### What Gets Built

| Component | Description |
|-----------|------------|
| **Execution service** | Separate Container App. Receives approved steps. Executes group member removal via DELETE /groups/{id}/members/{id}/$ref. |
| **Signed approval tokens** | Approval service signs tokens with HMAC. Execution service verifies before write. 30-minute expiry. |
| **Pre-execution validation** | Read current state before every write. State-hash check. Abort on mismatch. |
| **Per-member execution** | Sequential member removal with pre-read, write, post-read per member. |
| **Self-action tagging** | Ingestion recognizes SP-Execute writes. Tags as selfAction. Excludes from incident scoring. |
| **Post-execution validation** | Immediate validation + deferred re-check (15 min for SharePoint, 5 min for Teams). |
| **Circuit breaker** | Halt after 3 consecutive sub-action failures. |
| **Safe mode** | Per-tenant write-disable. Triggered manually or by circuit breaker. |
| **Execution audit trail** | ActionInstance, SubAction, ExecutionAttempt records. Full provenance. |
| **Trusted-state declaration** | When all validation checks pass, mark "trusted operational state restored." |
| **Partial completion handling** | Accurate partial-completion status. Operator resume/manual options. |

### What Must Remain Manual in Phase 4

- SharePoint permission revocation (recommendation-only)
- Exchange delegation restoration (recommendation-only)
- Teams membership verification (validation-only, no write)
- Downstream app entitlement verification (operator confirms externally)
- CA policy modification (validation-only, never system-written)

### Phase 4 Exit Criteria

- [ ] Group membership rollback executes correctly via Graph API for the canonical scenario
- [ ] Self-action events are tagged and not flagged as new incidents
- [ ] Approval tokens are signed and verified before execution
- [ ] Pre-execution state-hash check catches stale approvals
- [ ] Circuit breaker halts execution after 3 consecutive failures
- [ ] Safe mode disables all execution for a tenant
- [ ] Post-execution validation confirms group membership restored to baseline
- [ ] Trusted-state declaration works for the canonical scenario
- [ ] Partial completion is accurately represented when some members fail to remove
- [ ] Full execution audit trail is preserved in immutable storage

---

## 11. Phase 5: Alpha Hardening / Pilot Readiness (Weeks 21-25)

### What Gets Built

| Component | Description |
|-----------|------------|
| **Tenant provisioning automation** | Script/workflow creating Storage Account + Key Vault + SP verification + default policies |
| **Certificate rotation monitoring** | Scheduled health check; 30-day warning; 7-day critical alert |
| **Onboarding wizard** | Minimal UI flow: connect tenant → verify SP → approve initial baseline → configure sensitivity list |
| **Alerting dashboard** | Ingestion lag, execution failures, dead-letter depth, cert expiry, safe-mode activations |
| **False-positive review** | UI to dismiss incidents as false positive; tracking for threshold tuning |
| **Notification system** | Email notifications for new high-severity incidents and approval requests |
| **Synthetic recovery drill** | Automated test that runs the canonical scenario end-to-end against the test tenant weekly |
| **Operational runbooks** | Documented procedures for: poller failure, rate limiting, credential compromise, safe-mode activation |

### Pilot Criteria

- [ ] 1-3 real enterprise tenants connected
- [ ] Sensitivity lists configured per tenant
- [ ] Ingestion running for 7+ days without gaps
- [ ] At least 5 real incidents detected and triaged
- [ ] At least 1 real recovery scenario walked through (recommendation-only or executed)
- [ ] Certificate rotation tested
- [ ] Safe mode tested
- [ ] Alerting verified
- [ ] Operator feedback collected

---

## 12. Feature Scope by Phase

| Capability | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Entra audit ingestion | Spike | **Real** | Real | Real | Real | Real |
| Normalized changes | Spike | **Real** | Real | Real | Real | Real |
| Correlated bundles | — | **Real** | Real | Real | Real | Real |
| Incident detection | — | **Real** | Real | Real | Real | Real |
| Incident UI | — | — | **Real** | Real | Real | Real |
| Blast-radius engine | — | — | **Real** | Real | Real | Real |
| Blast-radius UI | — | — | **Real** | Real | Real | Real |
| Trusted-state baselines | — | — | — | **Real** | Real | Real |
| State comparison | — | — | — | **Real** | Real | Real |
| Recovery planning | — | — | — | **Real** | Real | Real |
| Recovery plan UI | — | — | — | **Real** | Real | Real |
| Approval workflow | — | — | — | **Skeleton** | **Real** | Real |
| Execution (group rollback) | — | — | — | — | **Real** | Real |
| Post-execution validation | — | — | — | — | **Real** | Real |
| Self-action handling | — | — | — | — | **Real** | Real |
| Safe mode | — | — | — | — | **Real** | Real |
| Tenant provisioning | Manual | Manual | Manual | Manual | Manual | **Real** |
| Certificate rotation | Manual | Manual | Manual | Manual | Manual | **Monitored** |
| Audit trail | — | **Real** | Real | Real | Real | Real |
| Observability | — | **Basic** | Basic | Basic | Basic | **Full** |
| Notifications | — | — | — | — | — | **Real** |
| Alerting dashboard | — | — | — | — | — | **Real** |

---

## 13. Real vs Manual vs Mocked by Phase

| Capability | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|-----------|---------|---------|---------|---------|---------|
| Entra ingestion | Real | Real | Real | Real | Real |
| M365 ingestion | Deferred | Deferred | Deferred | Deferred | Deferred |
| Webhook ingestion | Deferred | Deferred | Deferred | Deferred | Deferred |
| Incident detection | Real (rules) | Real | Real | Real | Real |
| Blast-radius (groups) | — | Real | Real | Real | Real |
| Blast-radius (CA policies) | — | Real | Real | Real | Real |
| Blast-radius (SharePoint) | — | Inferred | Real (if spike passes) | Real | Real |
| Blast-radius (Exchange) | — | Inferred | Inferred | Inferred | Inferred |
| Blast-radius (Teams) | — | Inferred | Inferred | Inferred | Inferred |
| Baseline snapshots | — | — | Real | Real | Real |
| Baseline approval | — | — | Real | Real | Real |
| Recovery plan generation | — | — | Real | Real | Real |
| Approval tokens (signed) | — | — | Skeleton | Real | Real |
| Group rollback execution | — | — | — | Real | Real |
| Other recovery execution | — | — | — | Manual | Manual |
| Validation (immediate) | — | — | — | Real | Real |
| Validation (deferred) | — | — | — | Real | Real |
| Safe mode | — | — | — | Real | Real |
| Tenant provisioning | Manual | Manual | Manual | Manual | Automated |
| Sensitivity list mgmt | Hardcoded | Hardcoded | UI | UI | UI |
| Alerting | Logs only | Logs only | Logs only | Basic | Full |
| Operator notifications | — | — | — | — | Real |

---

## 14. Service Boundary Strategy

### v1 Service Map

```
┌─────────────────────────────────────────────────┐
│ READ-PATH SERVICE (one codebase)                 │
│                                                  │
│ ┌────────┐ ┌────────────┐ ┌──────────────────┐  │
│ │API/UI  │ │Background  │ │Domain Logic      │  │
│ │Server  │ │Workers     │ │(ingestion, blast │  │
│ │        │ │(polling,   │ │ radius, planning,│  │
│ │        │ │ normalization,│ │ detection,      │  │
│ │        │ │ snapshots) │ │ baselines)       │  │
│ └────────┘ └────────────┘ └──────────────────┘  │
│                                                  │
│ Uses: SP-Read credentials only                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ EXECUTION SERVICE (separate codebase/deploy)     │
│                                                  │
│ ┌──────────────┐ ┌──────────────┐               │
│ │Approval      │ │Execution     │               │
│ │Verifier      │ │Engine        │               │
│ └──────────────┘ └──────────────┘               │
│                                                  │
│ Uses: SP-Execute credentials only                │
└─────────────────────────────────────────────────┘
```

### Why This Structure

- **Read-path monolith for speed.** In early phases, the ingestion pipeline, blast-radius engine, recovery planner, and API/UI server share one codebase and one deployment. This avoids inter-service communication complexity during rapid iteration. Internal module boundaries are enforced by code organization, not network calls.
- **Execution service separate from day one.** The trust boundary between read and write credentials is enforced at the infrastructure level. The execution service is a separate Container App with separate vault access policies. This is non-negotiable even in Phase 1.
- **Split later.** When the read-path monolith becomes too large or when different components need independent scaling, split into: ingestion service, analysis service, API service. Not before Phase 5 at the earliest.

---

## 15. Storage Boundary Strategy

### Early Storage Model

| Data | Storage | Why |
|------|---------|-----|
| Tenant config, job state | Cosmos DB (shared) | Low volume, needs indexing, no customer data |
| Raw events | Per-tenant Blob (append) | High volume, write-once, rarely read |
| Normalized changes | Per-tenant Table Storage | Query by date, objectId, bundleId |
| Incidents, plans, approvals | Per-tenant Table Storage | Query by status, incidentId |
| Baselines (snapshots) | Per-tenant Blob | Large objects, versioned, rarely queried individually |
| Blast-radius results | Per-tenant Blob | Large objects, one per incident computation |
| Audit records | Per-tenant Immutable Blob | Append-only, hash-chained, WORM retention |
| Action instances, execution records | Per-tenant Table Storage | Query by incidentId, status |

### What Must Be Immutable From Day One

- Raw events
- Audit records
- Approval records
- Execution attempt records
- Validation records

**Do not defer immutability.** If these are mutable in Phase 1 and immutable in Phase 3, the Phase 1 data has no audit integrity. Start immutable.

---

## 16. Technical Spikes

### Phase 0 Spikes (Must Complete Before Phase 1)

| Spike | Question | When | Critical Path |
|-------|---------|------|---------------|
| **Audit log field coverage** | Which change types include oldValue/newValue for before-state? | Week 1 | Yes: determines before-state reconstruction design |
| **Graph member removal** | Is DELETE /groups/{id}/members/{id}/$ref reliably idempotent? | Week 1 | Yes: determines execution model safety |
| **Baseline snapshot sizing** | How many API calls and how much time for a full tenant snapshot? | Week 2 | Yes: determines snapshot scheduling |
| **Entity size limits** | Does a 50-object BlastRadiusResult fit in Table Storage? | Week 2 | Yes: determines storage choice |
| **Container Apps Jobs scale** | Can 100 scheduled jobs run every 5 min? | Week 2 | Yes: determines deployment model |

### Phase 1-2 Spikes (Can Run in Parallel)

| Spike | Question | When |
|-------|---------|------|
| **Adjacency graph build time** | How long to build a full dependency graph for a test tenant? | Phase 1 |
| **Graph traversal performance** | BFS from a high-connectivity node: sub-2-second? | Phase 1 |
| **Correlation accuracy** | Does 5-minute window correctly group the canonical scenario? | Phase 1 |
| **SharePoint permission API** | Can we read site-level permissions reliably via Graph? | Phase 2 |
| **False-positive rate** | Score the 7-day test data; measure FP rate with initial weights | Phase 2 |

---

## 17. Dependencies and Sequencing Risks

```
Phase 0 spikes ──▶ Phase 1 (ingestion assumes spike results)
Phase 1 ingestion ──▶ Phase 2 (blast radius needs changes and incidents)
Phase 1 audit trail ──▶ Phase 4 (execution requires audit from day one)
Phase 2 blast radius ──▶ Phase 3 (recovery plan needs blast-radius output)
Phase 3 baselines ──▶ Phase 3 recovery plans (plan targets baseline state)
Phase 3 approval skeleton ──▶ Phase 4 signed tokens
Phase 4 execution ──▶ Phase 4 self-action handling (execution creates events that ingestion must handle)
Phase 4 safe mode ──▶ Phase 5 pilot (safe mode must work before real tenants)
```

### Critical Path Items

1. **Audit trail must be built in Phase 1 and never relaxed.** Every subsequent phase depends on audit integrity.
2. **Blast-radius correctness is the gating risk for Phase 2.** If the graph model is wrong, the recovery plan is wrong. The graph spike in Phase 0/1 is critical path.
3. **Self-action handling must be solved before execution.** If KavachIQ's own writes create false incidents, the product is unusable.
4. **Sensitivity list configuration is needed before pilot.** Without it, detection produces too many false positives. This is a Phase 5 blocker that should be anticipated in Phase 3.

---

## 18. Team / Workstream Breakdown

| Workstream | Scope | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|-----------|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Platform / Infra** | Azure resources, provisioning, CI/CD, secrets | ●●● | ●● | ● | ● | ● | ●●● |
| **Data Pipeline** | Ingestion, normalization, dedup, correlation | ●● | ●●● | ●● | ● | ● | ● |
| **Core Backend** | Incident model, blast-radius engine, baselines, plans | ● | ● | ●●● | ●●● | ●● | ● |
| **Execution / Security** | Execution service, approval tokens, safe mode, self-action | — | — | — | ● | ●●● | ●● |
| **Frontend / Operator UX** | Incident UI, blast-radius UI, recovery plan UI, approval UX | — | — | ●●● | ●●● | ●● | ●● |
| **QA / Validation** | Test harness, synthetic scenarios, integration tests | ●● | ●● | ●● | ●● | ●●● | ●●● |

**For a team of 3-5 engineers:** Merge Platform/Infra with Data Pipeline early. One person owns Core Backend + Blast Radius. One person owns Frontend. One person owns Execution/Security (starts idle, joins Phase 2 for blast-radius backend, then Phase 4 for execution).

---

## 19. MVP Exit Criteria

### Internal Prototype (end of Phase 2)

- [ ] Canonical scenario produces a correct incident and blast radius
- [ ] Operator UI shows the incident workspace with drill-down
- [ ] A live demo walkthrough takes < 5 minutes and is credible
- [ ] Data pipeline runs without manual intervention for 7 days

### Engineering Alpha (end of Phase 4)

- [ ] Full canonical scenario works end-to-end: ingestion → detection → blast radius → plan → approval → execution → validation → trusted state
- [ ] Self-action handling prevents feedback loops
- [ ] Safe mode stops execution on demand
- [ ] Circuit breaker halts after failures
- [ ] All audit records are immutable and hash-chained
- [ ] Execution audit trail is complete

### Pilot-Ready MVP (end of Phase 5)

- [ ] Tenant provisioning is automated (< 10 minutes)
- [ ] Certificate rotation monitoring works
- [ ] Alerting dashboard is operational
- [ ] False-positive rate is < 20% for a representative tenant
- [ ] Operational runbooks exist for common failure scenarios
- [ ] 1-3 real tenants connected and running for 7+ days
- [ ] At least 1 real recovery scenario executed or walked through
- [ ] Synthetic recovery drill runs weekly

---

## 20. Biggest Implementation Risks

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Blast-radius correctness takes longer than expected | The graph model is the core differentiator; if it is wrong, everything downstream is wrong | Critical | Phase 0 spikes validate graph correctness; start with narrow scope (groups → CA, groups → app roles); expand after correctness is proven |
| Too much service fragmentation too early | Multiple services before the domain model is stable → constant inter-service contract breaks | High | Read-path monolith for Phases 1-3; execution service separate from day one; further splits only after Phase 4 |
| Audit trail deferred too long | If audit is added late, early data has no integrity; customer trust is undermined | High | Audit logging built in Phase 1; immutable from first event; never relaxed |
| Self-action recognition harder than planned | If ingestion cannot reliably distinguish KavachIQ writes from new incidents, execution creates feedback loops | High | Self-action spike in Phase 0; SP-Execute appId matching is the primary mechanism; test with real Graph API writes |
| Sensitivity-list/onboarding gap degrades detection | Without configured sensitivity lists, detection produces too many false positives for real tenants | Medium | Phase 3 introduces sensitivity list UI; Phase 5 onboarding wizard bootstraps lists; test with representative tenant data |
| Architecture overreach vs build capacity | 10 design docs, 7,000 lines of architecture, 3-5 engineers. Risk of trying to build everything simultaneously | High | Strict phase gates; each phase has concrete exit criteria; defer features explicitly; do not skip phases |

---

## 21. What to Defer Intentionally

### Not in MVP

| Feature | Why Deferred |
|---------|-------------|
| M365 unified audit ingestion | Adds 24-hour latency source; Entra-only is sufficient for core scenario |
| Graph webhooks | Speed layer; audit polling is sufficient for v1 detection latency |
| CA policy write execution | Too high risk; always validation-only |
| Exchange delegation management | Requires EWS/PowerShell; adds deployment complexity |
| SharePoint permission writes | Complex API surface; recommendation-only |
| ML-based anomaly detection | Rules + scoring is sufficient for v1 |
| Mobile experience | Desktop operator console is v1 target |
| External integrations (SIEM, SOAR, ITSM) | Core product must work first |
| Multi-region deployment | Single region + GRS is sufficient for v1 |
| Customer-managed encryption keys (BYOK) | KavachIQ-managed keys in v1 |
| Full graph visualization | Dependency chain breadcrumbs in object drawer is sufficient |
| Custom workflow builder | Fixed incident → recovery flow is v1 |
| Adaptive correlation windows | Fixed 5/30-minute windows are sufficient for v1 |

---

## 22. Suggested Milestone Deliverables

| Phase | Deliverables |
|-------|-------------|
| **0** | Shared schema package, dev environment, test tenant, synthetic data, spike reports, service boundary doc |
| **1** | Running ingestion pipeline, admin CLI, normalized change store, incident candidate store, audit log, ingestion metrics dashboard |
| **2** | Incident list UI, incident workspace, blast-radius tab, object drawer, REST API (incidents + blast-radius), internal demo flow |
| **3** | Baseline snapshot worker, baseline approval UI, recovery plan tab, state comparison in object drawer, approval button skeleton, drift detection alerts |
| **4** | Execution service deployment, approval token signing, group rollback execution, self-action tagging, validation worker, safe mode toggle, execution audit trail |
| **5** | Provisioning automation, onboarding wizard, cert rotation monitoring, alerting dashboard, notification system, runbooks, synthetic drill, pilot tenant(s) connected |

---

## 23. Recommendation Summary

### Recommended phase sequence

Phase 0 (3 weeks) → Phase 1 (5 weeks) → Phase 2 (5 weeks) → Phase 3 (4 weeks) → Phase 4 (4 weeks) → Phase 5 (4 weeks). Total: ~25 weeks to pilot. Aggressive compression possible to ~18 weeks with 5+ engineers.

### What to build first this week

1. **Set up the test tenant.** Register SP-Read and SP-Execute in a dedicated Entra test tenant. Populate with 20+ groups, 50+ users, 10+ apps, 5+ CA policies. This is required for every spike.
2. **Run the audit log completeness spike.** Read 7 days of audit logs from the test tenant. Catalog which event types include oldValue/newValue. This directly determines the before-state reconstruction strategy.
3. **Create the shared schema package.** Define the canonical entities and enums from the Data Model doc as a TypeScript or C# package. This prevents schema drift from the first line of code.

### First demo-worthy slice

End of Phase 2 (~13 weeks): An operator can see an incident created by an agent-driven Entra change, inspect the blast radius across 5+ system categories, drill into impacted objects with before/after state and dependency chains, and understand what recovery should look like. This is sufficient for a credible internal demo and early advisor/investor walkthrough.

### First customer-trust-worthy slice

End of Phase 4 (~21 weeks): The full canonical scenario works end-to-end. An operator can approve a recovery plan, the system rolls back group membership, validates downstream state, and declares trusted operational state restored. Audit trail is complete. Safe mode works. This is sufficient for a controlled customer pilot with 1-3 enterprise tenants.
