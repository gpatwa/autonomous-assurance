# Deployment and Operations Architecture

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisites:** All prior design documents (Architecture Memo through Incident Detection Design)  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

This document defines how KavachIQ runs in production as a secure, reliable, tenant-aware Azure service. The product architecture is designed. This document makes it deployable and operable.

**Recommended deployment model:** Shared control plane (API, job scheduling, webhook ingress) deployed as Azure Container Apps. Tenant-isolated data plane (per-tenant Azure Storage accounts with per-tenant encryption keys, per-tenant Key Vault instances for credentials). Operational metadata (tenant registry, job state, platform config) in a shared Azure Cosmos DB with logical tenant partitioning. Background workers (polling, normalization, blast-radius computation, validation) running as Container Apps Jobs with per-tenant job isolation. Execution engine isolated as a separate Container App with access only to the write-credential vault.

**Key trade-offs:**
- Per-tenant storage accounts add provisioning and operational cost ($5-15/month per tenant) but eliminate the highest-severity risk (cross-tenant data exposure)
- Container Apps Jobs provide per-tenant job isolation without requiring per-tenant compute instances
- Shared Cosmos DB for operational metadata is acceptable because it contains no customer identity data, only tenant configuration and job state
- The execution engine runs as a separate deployment from all read-path services, enforcing the read/write trust boundary at the infrastructure level

---

## 2. Problem Statement

### Why deployment is hard for this product

**Mixed workload types.** The system must serve synchronous API requests (operator UI), near-real-time webhook ingestion, scheduled polling jobs (every 3-5 minutes per tenant), daily batch jobs (snapshots), event-driven processing (normalization, classification), and long-running orchestration (recovery execution with deferred validation). No single Azure compute model fits all of these well.

**Per-tenant isolation at the data layer.** The tenant security architecture requires per-tenant storage with per-tenant encryption. This means N storage accounts for N tenants, each with its own encryption key in its own Key Vault. Provisioning, monitoring, and managing N storage accounts is significantly more complex than a shared database.

**Safe handling of write-capable paths.** The execution engine has access to SP-Execute credentials. It must be deployed as a separate trust domain from all read-path services. A shared deployment where the API server process has access to both read and write credentials would violate the trust boundary.

**Credential lifecycle.** Each tenant has 2+ service principals with client certificates stored in per-tenant Key Vaults. Certificate rotation, access policy management, and break-glass revocation must work reliably across hundreds of tenants.

**Append-only audit storage.** The immutable audit log requires Azure Immutable Blob Storage with time-based retention. This storage type has different write patterns and cost characteristics than standard storage. Writes are append-only, retention is enforced by the storage layer, and no API can delete data within the retention window.

**Graceful degradation.** When Microsoft Graph APIs are rate-limited or unavailable, the system must degrade gracefully: queue pending work, skip polling cycles, defer validations, and communicate status to operators. It must not crash, lose data, or execute stale actions.

---

## 3. Design Goals

1. **Secure production deployment on Azure.** All design docs' security requirements are reflected in infrastructure choices.
2. **Shared control plane with tenant-isolated data plane.** Control-plane services are shared for operational efficiency. All customer data is stored in per-tenant isolated storage.
3. **Automated tenant provisioning.** Adding a new tenant should not require manual infrastructure setup. A provisioning workflow creates all necessary resources.
4. **Strong secret and certificate handling.** Per-tenant Key Vault, certificate-based auth, automated rotation monitoring, break-glass revocation.
5. **Reliable background processing.** Polling, normalization, snapshot, and validation jobs run reliably with per-tenant isolation, retry, and failure containment.
6. **Production observability.** Structured logs, metrics, traces, alerting, and tenant-scoped dashboards.
7. **Safe operational controls.** Per-tenant safe mode, platform-wide write disable, circuit breakers, credential revocation.
8. **Cost-conscious scaling.** Per-tenant costs are predictable and proportional to tenant size, not a fixed high floor.

---

## 4. Non-Goals and Boundaries

- **Not customer-managed on-prem deployment in v1.** KavachIQ runs as a cloud-hosted SaaS. Customer-deployed agents are a future option.
- **Not multi-cloud.** v1 targets Azure only. AWS/GCP deployment is a future consideration.
- **Not active-active multi-region.** v1 deploys in a single primary region with DR to a secondary. Active-active across regions is future.
- **Not zero-downtime for every component.** API and ingestion target high availability. Snapshot jobs and blast-radius computation tolerate brief maintenance windows.
- **Not infinite scale on day one.** v1 targets 50-200 tenants. Architecture supports 1,000+ with identified scaling work.

---

## 5. Deployment Model Options

### Option A: Fully Shared Multi-Tenant

All tenants share databases, storage, and compute. Isolation by `tenantId` column.

| Dimension | Assessment |
|-----------|-----------|
| Isolation | Weak. Query bug = cross-tenant leak. |
| Cost | Lowest. |
| Enterprise trust | Insufficient for identity-plane data. |
| v1 fit | **No.** |

### Option B: Shared Control Plane + Isolated Data Plane (Recommended)

Control-plane services (API, job scheduler, webhook handler) are shared. Data (raw events, changes, baselines, graphs, plans, audit) is stored in per-tenant storage accounts with per-tenant encryption keys.

| Dimension | Assessment |
|-----------|-----------|
| Isolation | Strong at the data layer. Shared compute with tenant-scoped data accessors. |
| Cost | Medium. Per-tenant storage accounts ($5-15/mo each). Shared compute. |
| Enterprise trust | High. Defensible in security review. |
| v1 fit | **Recommended.** |

### Option C: Fully Dedicated Per-Tenant

Each tenant gets dedicated compute, storage, and networking.

| Dimension | Assessment |
|-----------|-----------|
| Isolation | Maximum. Full blast-radius containment. |
| Cost | Very high. $200-500/mo per tenant minimum. |
| Enterprise trust | Maximum. |
| v1 fit | Not justified. Future premium tier. |

---

## 6. Recommended Deployment Model

```
┌──────────────────────────────────────────────────────────────────┐
│                    SHARED CONTROL PLANE                           │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ API Gateway   │  │ Webhook      │  │ Job Scheduler        │   │
│  │ (Container    │  │ Receiver     │  │ (manages per-tenant   │   │
│  │  Apps)        │  │ (Container   │  │  polling, snapshot,   │   │
│  │              │  │  Apps)       │  │  correlation jobs)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐  │
│  │ Platform DB   │  │ Background Workers (Container Apps Jobs) │  │
│  │ (Cosmos DB,   │  │ ┌────────┐ ┌────────┐ ┌────────────┐   │  │
│  │  shared,      │  │ │Poller  │ │Normal- │ │Correlation │   │  │
│  │  no customer  │  │ │Workers │ │izer   │ │+ Detection │   │  │
│  │  data)        │  │ └────────┘ └────────┘ └────────────┘   │  │
│  └──────────────┘  │ ┌────────┐ ┌────────┐ ┌────────────┐   │  │
│                    │ │Snapshot│ │Blast-  │ │Validation  │   │  │
│                    │ │Workers │ │Radius  │ │Workers     │   │  │
│                    │ └────────┘ └────────┘ └────────────┘   │  │
│                    └──────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ EXECUTION ENGINE (separate Container App, write trust)     │  │
│  │ ┌────────────┐ ┌────────────┐                              │  │
│  │ │ Approval   │ │ Execution  │  Only service with access    │  │
│  │ │ Verifier   │ │ Service    │  to SP-Execute credentials   │  │
│  │ └────────────┘ └────────────┘                              │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

                    ┌────────────────┐
                    │  Tenant Router  │
                    └───────┬────────┘
          ┌─────────────────┼──────────────────┐
          │                 │                  │
┌─────────▼──────┐ ┌───────▼────────┐ ┌───────▼────────┐
│ TENANT A DATA  │ │ TENANT B DATA  │ │ TENANT C DATA  │
│ ┌────────────┐ │ │ ┌────────────┐ │ │ ┌────────────┐ │
│ │ Storage Acct│ │ │ │ Storage Acct│ │ │ │ Storage Acct│ │
│ │ (Blob+Table)│ │ │ │ (Blob+Table)│ │ │ │ (Blob+Table)│ │
│ ├────────────┤ │ │ ├────────────┤ │ │ ├────────────┤ │
│ │ Key Vault   │ │ │ │ Key Vault   │ │ │ │ Key Vault   │ │
│ │ (certs+keys)│ │ │ │ (certs+keys)│ │ │ │ (certs+keys)│ │
│ └────────────┘ │ │ └────────────┘ │ │ └────────────┘ │
│ 🔐 Encryption  │ │ 🔐 Encryption  │ │ 🔐 Encryption  │
│    Key A       │ │    Key B       │ │    Key C       │
└────────────────┘ └────────────────┘ └────────────────┘
```

### What Is Shared

| Component | Purpose | Contains Customer Data |
|-----------|---------|----------------------|
| API Gateway | Request routing, auth, rate limiting | No (routes to tenant-scoped services) |
| Webhook Receiver | Receive Graph notifications, route to correct tenant | Minimal (webhook payloads are transient) |
| Job Scheduler | Manage per-tenant polling/snapshot schedules | No (job metadata only) |
| Platform DB (Cosmos) | Tenant registry, job state, platform config | No customer identity data. Tenant metadata only. |
| Background workers | Execute tenant-scoped jobs | Process customer data but access only the current tenant's storage |
| Observability (App Insights) | Logs, metrics, traces | Telemetry only (no raw customer data in metrics) |

### What Is Tenant-Isolated

| Component | Isolation Level | Contains Customer Data |
|-----------|---------------|----------------------|
| Storage Account (per tenant) | Physically separate Azure resource | Yes: raw events, changes, baselines, graphs, plans, audit |
| Key Vault (per tenant) | Physically separate Azure resource | Yes: SP-Read cert, SP-Execute cert, encryption key |
| Encryption key | Per-tenant, managed in tenant's Key Vault | N/A (protects tenant data) |

---

## 7. Azure Service Topology

| Azure Service | Role | Shared/Tenant | Trust Boundary |
|--------------|------|--------------|---------------|
| **Azure Container Apps** | API gateway, webhook receiver, operator UI serving | Shared | Read trust domain |
| **Azure Container Apps (separate app)** | Execution engine | Shared (but separate deployment from read path) | Write trust domain |
| **Azure Container Apps Jobs** | Background workers (polling, normalization, snapshots, blast-radius, validation) | Shared compute, tenant-scoped data access | Read trust domain |
| **Azure Cosmos DB** | Platform metadata: tenant registry, job state, feature flags | Shared | Platform trust (no customer data) |
| **Azure Storage (per-tenant)** | Blob: raw events, baselines, audit logs (immutable). Table: normalized changes, incidents, plans | Per-tenant | Tenant data trust |
| **Azure Key Vault (per-tenant)** | SP-Read cert, SP-Execute cert, tenant encryption key | Per-tenant | Tenant credential trust |
| **Azure Key Vault (platform)** | Approval signing key, internal service certs, platform secrets | Shared (platform) | Platform trust |
| **Azure Service Bus** | Job queues for async processing (normalization, correlation, blast-radius) | Shared (tenant-scoped messages) | Processing trust |
| **Azure Application Insights** | Structured logging, metrics, distributed tracing, alerting | Shared | Operational (no customer data in telemetry) |
| **Azure Front Door** | TLS termination, DDoS protection, global routing | Shared | Network edge |

---

## 8. Runtime Workload Decomposition

| Workload | Type | Frequency | Compute Model | Tenant Isolation |
|----------|------|-----------|---------------|-----------------|
| **API/UI serving** | Synchronous, user-facing | On-demand | Container Apps (always-on) | Tenant from auth context |
| **Webhook handler** | Event-driven, near-real-time | On-demand | Container Apps (always-on) | Tenant from webhook subscription |
| **Entra audit poller** | Scheduled, per-tenant | Every 3-5 min per tenant | Container Apps Job (scheduled) | One job invocation per tenant |
| **M365 audit poller** | Scheduled, per-tenant | Every 15-30 min per tenant | Container Apps Job (scheduled) | One job invocation per tenant |
| **Normalization + dedup** | Event-driven, async | On message arrival | Container Apps Job (queue-triggered) | Tenant from message payload |
| **Correlation + detection** | Event-driven, async | On normalized change | Container Apps Job (queue-triggered) | Tenant from message payload |
| **Blast-radius computation** | On-demand (incident trigger) | Per incident | Container Apps Job (queue-triggered) | Tenant from incident context |
| **Baseline snapshot** | Scheduled, per-tenant | Daily full; 4-hour critical | Container Apps Job (scheduled) | One job invocation per tenant |
| **Recovery planning** | On-demand (after blast-radius) | Per incident | Container Apps Job (queue-triggered) | Tenant from incident context |
| **Execution engine** | On-demand (after approval) | Per approved step | Separate Container App (queue-triggered) | Tenant from action instance |
| **Validation + deferred re-check** | Scheduled, per-step | Immediate + deferred (5-60 min) | Container Apps Job (scheduled/queue) | Tenant from validation handoff |
| **Audit log writer** | Event-driven, async | On every system action | Container Apps Job (queue-triggered) | Tenant from event payload |
| **Webhook subscription renewal** | Scheduled, per-tenant | Every 2 days | Container Apps Job (scheduled) | Per-tenant |
| **Notification delivery** | Event-driven | On incident/step events | Container Apps Job (queue-triggered) | Tenant from event |

### Per-Tenant Job Fairness

Container Apps Jobs support concurrency limits. Each tenant's scheduled jobs are separate invocations. A large tenant's snapshot job cannot starve a small tenant's polling job because they are independent job instances. Queue-triggered jobs use Service Bus sessions (session = tenantId) to ensure per-tenant ordering without cross-tenant interference.

---

## 9. Tenant Provisioning Architecture

### Provisioning Flow

```
1. Admin creates tenant in platform UI
   │
2. Platform creates tenant record in Cosmos DB
   │
3. Provisioning workflow begins (automated):
   ├── Create Azure Storage Account (tenant-isolated)
   │   ├── Configure Blob containers (raw-events, baselines, audit)
   │   ├── Configure Table storage (changes, incidents, plans)
   │   └── Enable immutable storage policy on audit container
   │
   ├── Create Azure Key Vault (tenant-isolated)
   │   ├── Generate tenant encryption key
   │   ├── Configure access policies:
   │   │   ├── Read services → SP-Read cert access
   │   │   └── Execution service → SP-Execute cert access
   │   └── Enable audit logging
   │
   ├── Verify SP-Read registration in customer Entra
   │   ├── Upload SP-Read certificate to tenant Key Vault
   │   └── Verify permissions: AuditLog.Read.All, Directory.Read.All, etc.
   │
   ├── (Optional) Verify SP-Execute registration
   │   ├── Upload SP-Execute certificate to tenant Key Vault
   │   └── Verify permission: GroupMember.ReadWrite.All
   │
   ├── Create default policies and sensitivity lists
   │
   ├── Schedule initial baseline snapshot job
   │
   ├── Create Graph webhook subscriptions (if enabled)
   │
   └── Run health verification:
       ├── Read one audit log page via SP-Read
       ├── Read one group via SP-Read
       └── Mark tenant as "active"
```

### Provisioning Time Target

Full tenant provisioning should complete in under 10 minutes. The longest step is Azure resource creation (Storage Account + Key Vault): typically 2-4 minutes. Initial baseline snapshot (scheduled, not blocking) runs separately.

### Deprovisioning

When a tenant disconnects:
1. Revoke SP-Read and SP-Execute in customer Entra
2. Mark tenant as "deprovisioning" in Cosmos
3. Offer audit log export
4. Soft-delete all data (accessible for 30 days for customer support)
5. After 30 days: hard-delete Storage Account and Key Vault
6. Remove tenant record from Cosmos

---

## 10. Secret and Certificate Operations

### Runtime Secret Retrieval

Services retrieve secrets at startup and cache them in memory with a configurable TTL (default: 1 hour). No secrets are stored on disk, in environment variables, or in container images.

```
Service startup:
  1. Authenticate to platform Key Vault using managed identity
  2. Retrieve internal service certificates
  3. For each tenant assigned to this worker:
     a. Retrieve tenant-specific vault URI from Cosmos
     b. Authenticate to tenant Key Vault using managed identity
     c. Retrieve SP-Read certificate (read services) or SP-Execute certificate (execution service)
     d. Cache in memory with TTL
  4. On TTL expiry: re-fetch from vault (handles rotation)
```

### Certificate Rotation Monitoring

A scheduled job checks all tenant Key Vaults daily:
- Certificates expiring within 30 days: warning alert
- Certificates expiring within 7 days: critical alert
- Certificates expired: error alert + tenant marked as "credential-degraded"

### Break-Glass Revocation

If a credential is suspected compromised:
1. Platform operator triggers revocation for the specific tenant
2. System removes the certificate from the tenant Key Vault
3. System removes the app credential from the customer's Entra (via admin API or customer coordination)
4. System pauses all ingestion and execution for the tenant
5. Full audit of actions taken with the compromised credential
6. New certificate generated and registered after investigation

---

## 11. Job Scheduling and Async Processing

### Scheduling Architecture

```
┌─────────────────┐
│ Job Scheduler    │ Cosmos DB stores: tenant list, job schedules, last-run times
│ (runs every     │
│  60 seconds)    │
└────────┬────────┘
         │
         ├── For each tenant with due polling job:
         │   └── Enqueue message to "polling" Service Bus queue (session = tenantId)
         │
         ├── For each tenant with due snapshot job:
         │   └── Enqueue message to "snapshot" queue (session = tenantId)
         │
         └── For each due deferred validation:
             └── Enqueue message to "validation" queue (session = tenantId)
```

### Queue Architecture

| Queue | Purpose | Trigger | Consumer |
|-------|---------|---------|----------|
| `polling` | Entra audit polling tasks | Scheduled (3-5 min) | Poller worker |
| `normalization` | Raw events to normalize | Event-driven (after polling) | Normalizer worker |
| `correlation` | Normalized changes to correlate and classify | Event-driven (after normalization) | Correlation worker |
| `blast-radius` | Incident triggers for blast-radius computation | Event-driven (after incident creation) | Blast-radius worker |
| `recovery-plan` | Blast-radius results for plan generation | Event-driven (after blast-radius) | Planner worker |
| `execution` | Approved steps for execution | Event-driven (after approval) | Execution engine |
| `validation` | Steps for post-execution and deferred validation | Event-driven + scheduled | Validation worker |
| `audit` | System events for audit logging | Event-driven (all services publish) | Audit writer |

### Retry and Dead-Letter

All queues are configured with:
- Max delivery count: 5
- Dead-letter queue: yes
- Dead-letter reason captured
- Alerts on dead-letter queue depth > 0

Failed messages go to the dead-letter queue rather than being silently dropped. The operations team reviews dead-letter messages daily.

### Per-Tenant Fairness

Service Bus sessions ensure that messages for the same tenant are processed in order and that one tenant's message volume does not starve another tenant. Each tenant's messages use `tenantId` as the session ID. Workers process one session at a time per concurrent instance.

---

## 12. Data Stores and Storage Model

### Per-Tenant Storage Account Layout

```
Storage Account: kiq-{tenantShortId}-{region}
├── Blob Containers:
│   ├── raw-events/         (append-only, hot tier)
│   ├── baselines/          (versioned, cool tier after 30 days)
│   ├── audit/              (immutable blob storage, WORM retention)
│   └── blast-radius/       (hot tier, overwritten per incident)
│
├── Table Storage:
│   ├── normalized-changes  (partitioned by date)
│   ├── incidents           (partitioned by status)
│   ├── recovery-plans      (partitioned by incident)
│   ├── approvals           (partitioned by incident)
│   ├── execution-records   (partitioned by incident)
│   └── validation-records  (partitioned by incident)
```

### Shared Platform Store (Cosmos DB)

```
Database: kavachiq-platform
├── Container: tenants       (tenant registry, config, status)
├── Container: jobs          (job schedules, last-run times, locks)
├── Container: features      (feature flags, rollout config)
└── Container: platform-audit (platform-level operational audit)
```

### Immutable Audit Storage

The `audit/` blob container uses Azure Immutable Blob Storage with a time-based retention policy:
- Default retention: 365 days
- Configurable per tenant: 365-2555 days (1-7 years)
- Once set, retention cannot be shortened (only extended)
- No blob can be deleted or modified within the retention period
- Not even platform administrators can delete audit data

### Backup Strategy

| Data Class | Backup | RPO | RTO |
|------------|--------|-----|-----|
| Raw events | Azure Storage geo-redundancy (GRS) | 0 (synchronous replication) | < 1 hour (failover) |
| Baselines | GRS + daily snapshot to secondary region | < 24 hours | < 4 hours |
| Audit logs | Immutable + GRS (inherently durable) | 0 | < 1 hour |
| Incidents/plans/records | GRS | 0 | < 1 hour |
| Platform metadata (Cosmos) | Cosmos continuous backup | < 1 hour | < 4 hours |
| Key Vault secrets | Azure Key Vault soft-delete + purge protection | 0 | Immediate (soft-delete recovery) |

---

## 13. Observability Architecture

### Structured Logging

All services emit structured JSON logs to Azure Application Insights with:
- `tenantId` (for tenant-scoped queries)
- `correlationId` (for distributed tracing across services)
- `workloadType` (polling, normalization, blast-radius, execution, etc.)
- `severity` (info, warning, error, critical)

**Customer data is never logged in telemetry.** Object IDs may appear in traces for debugging, but object names, member lists, and state details are never in Application Insights. Customer data stays in the tenant's storage account.

### Key Metrics (SLIs)

| Metric | Target (SLO) | Alert Threshold |
|--------|-------------|----------------|
| **Ingestion lag** (time from audit event to normalized change) | < 5 minutes (p95) | > 15 minutes |
| **Incident creation lag** (time from change to incident) | < 10 minutes for immediate incidents | > 20 minutes |
| **Blast-radius computation time** | < 30 seconds (p95) | > 120 seconds |
| **API response time** | < 500ms (p95) | > 2 seconds |
| **Webhook processing time** | < 2 seconds (p95) | > 10 seconds |
| **Execution step duration** | < 30 seconds for 12-member rollback | > 120 seconds |
| **Validation completion** (including deferred) | < 60 minutes | > 120 minutes |
| **Dead-letter queue depth** | 0 | > 0 (any message = investigate) |
| **Certificate expiry** | > 30 days remaining | < 30 days |
| **Tenant health** | All tenants "active" | Any tenant "degraded" or "error" |

### Alerting

| Alert | Severity | Response |
|-------|----------|----------|
| Ingestion lag > 15 min for any tenant | Warning | Investigate poller health; check Graph API status |
| Dead-letter queue depth > 0 | Warning | Review failed messages; fix processing errors |
| Execution engine error rate > 1% | Critical | Investigate execution failures; consider safe mode |
| Certificate expiring < 7 days | Critical | Rotate certificate immediately |
| Unauthorized write detected | Critical | Activate safe mode; revoke SP-Execute; investigate |
| Cross-tenant access attempt | Critical | Immediate investigation; potential security incident |
| Audit write failure | Critical | Investigate storage health; no system action should proceed without audit |

---

## 14. Operational Controls and Safe Mode

### Per-Tenant Safe Mode

Activation triggers:
- Operator request (via platform admin UI)
- Automated: unauthorized write detection
- Automated: circuit breaker activation (3+ consecutive execution failures)
- Automated: execution engine anomaly (write volume exceeds threshold)

Safe mode effects:
- All execution capabilities disabled for the tenant
- SP-Execute certificate access revoked from execution service
- Ingestion and analysis continue (read-only)
- Recovery plans generated as recommendation-only
- Operator UI shows "Safe mode active" banner
- All safe-mode activations logged in platform audit

### Platform-Wide Write Disable

For severe platform incidents:
- All execution across all tenants is disabled
- SP-Execute vault access policies are revoked globally
- Ingestion continues for all tenants
- Requires platform admin + security team approval to re-enable

### Tenant Pause/Resume

A tenant can be paused (all background jobs stopped) without deprovisioning:
- Polling stops
- Snapshots stop
- Webhooks are unsubscribed
- Data is retained
- Resume re-enables all jobs and re-subscribes webhooks

---

## 15. Failure Handling and Runbooks

| Scenario | Detection | Containment | Recovery | Customer Impact |
|----------|-----------|-------------|----------|----------------|
| **Entra audit poller failure** | Missing poll heartbeat in Cosmos | Auto-restart job | Backfill from last successful poll time (30-day audit retention) | Delayed detection (minutes) |
| **Webhook subscription expired** | Renewal job failure alert | Fallback to audit-log-only detection | Re-subscribe; no data loss (audit logs cover) | Slightly delayed awareness |
| **Graph API rate limited** | 429 responses in telemetry | Automatic backoff per rate-limit headers | Resume after cooldown | Delayed snapshots/validation |
| **Tenant vault access failure** | Auth error in service logs | Pause tenant ingestion | Check managed identity permissions; check vault access policy | Tenant-level outage |
| **Immutable audit write failure** | Write error in audit queue | **Halt all processing for the tenant** (no action without audit) | Investigate storage health; restore write capability | Tenant-level pause |
| **Execution engine anomaly** | Write volume alert; unauthorized write detection | Activate safe mode for tenant | Revoke SP-Execute; investigate; re-enable after resolution | Execution disabled |
| **Self-action mismatch** | Ingestion detects SP-Execute write not matching any action instance | Activate safe mode; alert security team | Full audit review; potential credential rotation | Execution disabled; customer notified |
| **Region outage** | Azure health alerts; service availability drop | Traffic routes to secondary region (if deployed) | Wait for region recovery or failover | Potential service interruption |
| **Bad deployment** | Error rate spike post-deploy | Rollback to previous container revision | Container Apps supports instant revision rollback | Brief service interruption during rollback |
| **Noisy tenant overwhelming queues** | Queue depth growth; per-tenant message volume alert | Throttle the specific tenant's job scheduling | Investigate root cause (tenant misconfiguration, bulk changes in their environment) | Other tenants unaffected (per-tenant fairness) |

---

## 16. Disaster Recovery and Business Continuity

### RPO / RTO Targets

| Tier | RPO | RTO | Applies To |
|------|-----|-----|-----------|
| **Tier 1** (customer data) | 0 (GRS replication) | < 1 hour | Raw events, audit logs, active incidents |
| **Tier 2** (operational state) | < 1 hour | < 4 hours | Baselines, plans, platform metadata |
| **Tier 3** (compute state) | N/A (stateless) | < 30 minutes | Containers restart from image; job state in Cosmos |

### Regional Failover Strategy

v1 deploys in a single Azure region with geo-redundant storage. If the primary region fails:
1. Storage is accessible via GRS read-access secondary
2. Platform metadata in Cosmos DB uses multi-region write (or automatic failover)
3. Compute is redeployed in the secondary region from container images
4. DNS is updated via Azure Front Door

**v2+:** Active-passive in two regions with automated failover.

---

## 17. Scaling and Capacity Model

### Scale Drivers

| Driver | v1 Target | Growth Path |
|--------|-----------|-------------|
| Tenants | 50-200 | 1,000+ with automated provisioning |
| Avg incidents/tenant/day | 1-5 | Depends on sensitivity config |
| Avg changes/tenant/day | 500-5,000 | Scales with tenant size |
| Avg snapshot size/tenant | 50-200 MB | Scales with Entra object count |
| Concurrent polling jobs | 50-200 (one per tenant) | Container Apps auto-scales workers |
| Concurrent execution steps | 1-5 (rare; most recovery is recommendation-only) | Low concurrency by design |

### Per-Tenant Cost Estimate (v1)

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| Storage Account (LRS, 5 GB avg) | $1-3 | Hot tier for active data; cool tier for old baselines |
| Key Vault (2 certificates + 1 key, 100 operations/day) | $1-2 | Low operation volume |
| Service Bus (tenant's share of message volume) | $1-3 | Shared queues, proportional usage |
| Compute (tenant's share of worker time) | $5-10 | Shared workers, proportional CPU |
| **Total per tenant** | **$8-18/month** | Infrastructure only; excludes engineering and support |

### Platform Fixed Costs (v1)

| Component | Monthly Cost |
|-----------|-------------|
| Container Apps (API + workers, 2 replicas) | $100-300 |
| Cosmos DB (provisioned, 400-1000 RU/s) | $50-150 |
| Application Insights | $50-100 |
| Azure Front Door | $35 |
| Platform Key Vault | $5 |
| **Total platform** | **$240-590/month** |

---

## 18. CI/CD and Release Safety

### Environment Strategy

| Environment | Purpose | Tenant Data |
|-------------|---------|------------|
| **Dev** | Engineer development and testing | Synthetic test tenants |
| **Staging** | Pre-production validation | Synthetic tenants + one internal "dogfood" tenant |
| **Production** | Customer-facing | Real customer tenants |

### Deployment Pipeline

```
Code push → Build → Unit tests → Integration tests (synthetic tenant)
  → Security scan (dependency audit, secret scan)
  → Deploy to staging → Staging smoke tests
  → Manual approval gate
  → Deploy to production (rolling update, 1 replica at a time)
  → Production smoke tests → Monitor for 30 minutes
  → If error rate > threshold: auto-rollback
```

### Write-Path Rollout Controls

New execution capabilities (future action types beyond group membership rollback) use feature flags:
- **Execution feature flag per action type:** Disabled by default in production
- **Tenant-level opt-in:** New execution capabilities enabled per-tenant only after customer opt-in
- **Gradual rollout:** Enable for 1 tenant → monitor 7 days → enable for 5 → monitor → general availability

### Rollback

Container Apps supports instant rollback to any previous container revision. If a deployment causes issues:
1. Automated: error-rate trigger auto-rolls back within 30 minutes
2. Manual: platform operator can rollback immediately via CLI

---

## 19. Operational Constraints and Cost Trade-offs

| Trade-off | Decision | Cost | Benefit |
|-----------|----------|------|---------|
| Per-tenant storage vs shared DB | Per-tenant storage accounts | +$8-18/tenant/month | Eliminates cross-tenant data risk |
| Immutable audit vs standard blob | Immutable blob with WORM retention | +$1-2/tenant/month (no compaction possible) | Tamper-resistant audit trail |
| Per-tenant Key Vault vs shared vault | Per-tenant vault | +$1-2/tenant/month | Credential isolation at infrastructure level |
| Container Apps vs VM-based workers | Container Apps + Jobs | Lower ops cost; auto-scale | Less control over instance placement |
| Cosmos DB vs SQL for platform metadata | Cosmos DB | $50-150/month fixed | Global distribution, automatic failover, schema flexibility |
| Single region vs multi-region | Single region + GRS | Lower cost | Acceptable for v1; DR via failover |

---

## 20. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Bad tenant provisioning leaves partially created resources | Orphaned storage or vault; tenant in broken state | Medium | Idempotent provisioning workflow; cleanup on failure; health verification step |
| Queue backlog delays incident creation | High-impact changes sit in queue undetected | High | Per-tenant queue fairness; backlog alerting; auto-scale workers |
| Certificate expiry breaks ingestion or execution | Tenant goes dark; execution fails | High | 30-day warning alerts; 7-day critical alerts; rotation monitoring job |
| Safe-mode activation fails | Unsafe writes continue during suspected compromise | Critical | Safe mode tested in staging monthly; multiple activation paths (automated + manual) |
| Immutable audit store outage | System must halt (no action without audit) | Critical | GRS replication; halt-on-audit-failure design; monitor storage health |
| Region failure causes service outage | All tenants affected | High | GRS storage; Cosmos multi-region; compute can be redeployed; DR playbook |
| Noisy tenant starves others | One tenant's burst delays all tenants' processing | Medium | Service Bus sessions for per-tenant fairness; per-tenant job isolation; throttling |
| Deployment broadens write path accidentally | New code path enables unintended writes | Critical | Feature flags for execution capabilities; write-path code review policy; staging validation |
| Monitoring gaps hide platform compromise | Attacker operates undetected | Critical | Alerting on all critical operations; unauthorized write detection; dead-letter monitoring |
| Cost growth with tenant count is steeper than expected | Per-tenant resource costs multiply | Medium | Cost monitoring; optimize storage tiers; evaluate shared storage for low-sensitivity data in v2 |

---

## 21. Open Questions

1. **Should the execution engine run in a completely separate Azure subscription?** Maximum isolation but maximum operational complexity. Is the separate Container App + separate vault access policy sufficient?

2. **Should per-tenant storage use Azure Storage customer-managed keys from the tenant's Key Vault?** This is the current recommendation, but it means each storage account must be configured with Key Vault-based encryption. Is the operational overhead justified for v1?

3. **What Azure region should v1 target?** East US 2 (lowest latency to Microsoft Graph for US customers) or West Europe (for EU data residency)? Should the system support region selection per tenant?

4. **Should the platform use Azure Durable Functions for long-running orchestration?** Durable Functions provide built-in state management for multi-step workflows (recovery orchestration). But they add a dependency on Azure Functions runtime. Are Container Apps Jobs sufficient?

5. **What is the right Container Apps scaling configuration?** Min replicas, max replicas, and scale-to-zero behavior for different workload types. Cost vs availability trade-off.

6. **Should dead-letter messages be automatically retried after a configurable delay?** Or should they always require manual investigation? Auto-retry risks repeating the same failure; manual-only risks accumulating unprocessed messages.

7. **How should the platform handle Azure Storage Account limits?** A single subscription has a default limit of 250 storage accounts. At 200+ tenants, this limit will be reached. Should tenants share storage accounts with logical isolation (weakening physical isolation) or use multiple subscriptions?

---

## 22. Recommendation Summary

### Build for v1

- **Azure Container Apps** for API, webhook receiver, and execution engine (separate app for write trust domain)
- **Azure Container Apps Jobs** for all background workers (polling, normalization, snapshots, blast-radius, validation)
- **Per-tenant Azure Storage Account** with per-tenant encryption key for all customer data
- **Per-tenant Azure Key Vault** for SP-Read cert, SP-Execute cert, and encryption key
- **Azure Cosmos DB** for platform metadata (tenant registry, job state)
- **Azure Service Bus** with session-based routing for per-tenant job fairness
- **Azure Immutable Blob Storage** for append-only audit logs with WORM retention
- **Azure Application Insights** for structured logging, metrics, and alerting
- **Automated tenant provisioning** workflow creating all per-tenant resources
- **Per-tenant safe mode** with automated activation triggers
- **Rolling deployment** with auto-rollback and write-path feature flags

### Defer to v2+

- Multi-region active-passive deployment
- Customer-managed encryption keys (BYOK)
- Fully dedicated per-tenant compute (premium tier)
- Azure Durable Functions for orchestration (evaluate after v1 operational experience)
- Multi-subscription tenant hosting (when approaching 250 storage account limit)
- Real-time streaming (replace polling with Event Hubs if Graph supports it)

### Assumptions That Must Hold

1. Azure Container Apps Jobs support sufficient concurrency for 200 tenant polling jobs running every 3-5 minutes.
2. Per-tenant Storage Account provisioning can be automated reliably via Azure Resource Manager templates or Bicep.
3. Azure Immutable Blob Storage with WORM retention is available in the target region.
4. Per-tenant infrastructure cost of $8-18/month is acceptable for the v1 pricing model.
5. A single Azure subscription can host the initial 50-200 tenants within resource limits.

### Prototype/Validate Next

1. **Tenant provisioning automation.** Build and test the full provisioning workflow: Storage Account + Key Vault + encryption key + access policies + health verification. Measure elapsed time and reliability across 10 consecutive provisions.
2. **Container Apps Jobs at scale.** Deploy 100 scheduled jobs (simulating 100 tenant pollers) running every 5 minutes. Measure: job start latency, concurrent execution, failure isolation, and per-tenant fairness under load.
3. **Immutable Blob Storage operations.** Verify: append behavior, WORM retention enforcement (attempt delete within retention period), hash-chain write performance, and read query performance for forensic audit review.
