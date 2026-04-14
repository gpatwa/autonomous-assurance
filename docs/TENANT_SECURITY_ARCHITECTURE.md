# Tenant Security Architecture

**Author:** Principal Architect  
**Date:** April 2026  
**Status:** Draft for internal review  
**Prerequisites:** Architecture Memo, Trusted-State Baseline Design, Blast-Radius Engine Design, Recovery Orchestration Design, Connector and Ingestion Design  
**Classification:** Internal / Confidential

---

## 1. Executive Summary

KavachIQ asks enterprise customers to grant it read access to their identity and permission control planes, store sensitive snapshots of their environment state, and potentially execute recovery write operations against their Microsoft Entra tenant. The security architecture must make this trust justified.

**Core problem:** KavachIQ operates in the highest-trust zone of an enterprise environment. A cross-tenant data leak exposes org-chart structures and access policies. A write-credential compromise could modify production identities. An audit-tampering vulnerability would undermine the product's core value proposition. The security architecture is not a compliance overlay. It is a product requirement.

**Recommended model:** Tenant-isolated data plane with a shared control plane. Each customer's raw events, normalized changes, baselines, graphs, recovery plans, and audit logs are stored in per-tenant isolated storage with per-tenant encryption keys. The application control plane (API routing, job scheduling, subscription management) is shared for operational efficiency. Read and write credentials are distinct service principals per tenant: a read-only ingestion principal and a separate, narrower-scoped execution principal that holds write permissions only when the customer explicitly opts in. The execution service never holds read-path credentials and the read path never holds write-path credentials.

**Key trade-offs:**
- Per-tenant data isolation adds operational cost but eliminates the highest-severity risk (cross-tenant exposure)
- Separate read/write service principals add credential management complexity but create a hard trust boundary that prevents read-path compromise from becoming write-path compromise
- Mandatory approval verification before execution adds latency but ensures the system cannot self-approve harmful actions

---

## 2. Problem Statement

### Why tenant security is especially hard for KavachIQ

**The platform sees identity control-plane data.** Raw audit events, group memberships, CA policy configurations, app role assignments, and service principal details reveal the structure of an enterprise's identity and access model. This is among the most sensitive operational data in any enterprise.

**The platform may execute recovery writes.** Even in v1 (limited to group membership rollback), the platform has the technical capability to modify production Entra objects. A compromised or buggy execution path could modify identities in ways that cause authentication outages, access escalation, or data exposure.

**A cross-tenant leak is catastrophic.** If tenant A's identity data is exposed to tenant B (or to the public), the damage is not just a data breach. It is an exposure of the access control model that protects tenant A's entire enterprise.

**Overly broad permissions erode trust.** If KavachIQ requests `Directory.ReadWrite.All` when it only needs `Group.Read.All`, enterprise security reviewers will reject the integration. The permission model must be precisely scoped.

**Approval and execution must be separated.** The system that recommends recovery actions cannot also autonomously approve and execute them. An approval bypass (through bug or compromise) would allow the platform to make arbitrary changes to customer environments.

**Customers may not trust shared infrastructure.** Enterprise customers evaluating identity-security products expect data isolation guarantees that go beyond application-level access control. "Our code checks tenant ID" is not sufficient. Storage-level and encryption-level isolation are expected.

---

## 3. Design Goals

1. **Architecturally impossible cross-tenant access.** Tenant data isolation must be enforced at the storage layer, not just the application layer.
2. **Least-privilege Microsoft Graph permissions.** Request only the specific permissions needed for each function. Never request broader permissions "for convenience."
3. **Hard separation between read and write credentials.** The read-only ingestion path and the write-capable execution path use separate service principals with separate credentials.
4. **Operator approval gates all write execution.** No write action executes without a verified, non-expired approval from an authorized operator.
5. **Immutable, tamper-evident audit trail.** All approvals, executions, and system actions are logged in a way that resists tampering.
6. **Enterprise review readiness.** The architecture should be explainable in a security questionnaire and defensible in a vendor risk assessment.
7. **Safe degradation.** If a component is compromised, the blast radius is contained to the minimum scope.

---

## 4. Non-Goals and Boundaries

- **Not customer-managed on-premises deployment in v1.** The system runs as a cloud-hosted service. Customer-deployed agents or proxies are a future option.
- **Not customer-managed encryption keys (BYOK) in v1.** Per-tenant keys are managed by KavachIQ's key management system. Customer-managed keys are a future tier.
- **Not full zero-trust service mesh in v1.** Internal service-to-service communication uses mTLS and service identity, but a full zero-trust architecture (per-request authorization for every internal call) is deferred.
- **Not universal regulatory compliance.** v1 targets common enterprise expectations (SOC 2 Type II readiness, data residency awareness). Specific certifications (FedRAMP, ISO 27001) are future milestones.

---

## 5. Threat Model

### 5.1 Attacker Types

| Attacker | Access | Goal | Severity |
|----------|--------|------|----------|
| **External attacker** | No legitimate access | Gain access to any tenant data or write capability | Critical |
| **Compromised customer operator** | Legitimate operator access to their own tenant | Exfiltrate data from their tenant, or abuse write capability beyond their authorization | High |
| **Malicious KavachIQ insider** | Internal platform access | Access customer tenant data, modify audit logs, or abuse write credentials | Critical |
| **Compromised KavachIQ service** | Service credentials for one or more tenants | Read tenant data, execute unauthorized writes, pivot to other tenants | Critical |
| **Compromised customer tenant** | Legitimate Microsoft tenant access (attacker controls an identity in the customer's Entra) | Abuse KavachIQ's recovery capability to escalate privileges | High |

### 5.2 Threat Classes

| Threat | Description | Primary Mitigation |
|--------|------------|-------------------|
| **T1: Cross-tenant data leakage** | Tenant A's data exposed to tenant B or externally | Per-tenant isolated storage, per-tenant encryption keys |
| **T2: Write credential compromise** | Attacker obtains the execution service principal's certificate/secret | Separate read/write SPs; write SP has narrowest scope; certificate-based auth; rotation |
| **T3: Approval bypass** | Write execution proceeds without valid operator approval | Approval verified by execution service at action time; approval is a signed, time-limited token |
| **T4: Audit tampering** | Attacker modifies or deletes audit records to cover actions | Append-only storage; integrity hashes; no delete capability even for platform admins |
| **T5: Insider data access** | KavachIQ engineer accesses customer data | No engineer has direct access to tenant data stores; access requires break-glass with audit |
| **T6: Over-scoped permissions** | KavachIQ requests broader Microsoft Graph permissions than needed | Permission manifest per function; customer-visible permission audit; reject over-scope at consent |
| **T7: Self-action abuse** | KavachIQ's own service principal is used to make unauthorized changes | Self-action tagging; anomaly detection on write patterns; separate read/write principals |
| **T8: Feedback loop** | Recovery actions trigger new incidents in an infinite loop | Self-action exclusion from incident scoring; circuit breaker on write volume |
| **T9: Credential replay/spoofing** | Connector inputs are spoofed with fabricated audit events | Audit events are fetched by KavachIQ (pull model), not pushed by external parties; webhook validation |
| **T10: Tenant compromise via KavachIQ** | Attacker compromises KavachIQ to gain access to customer Entra tenant | Read-only default; write requires opt-in; credentials stored per-tenant in isolated vault |

---

## 6. Tenant Isolation Model Options

### Option A: Logical Multi-Tenant (Shared Everything)

All tenants share the same databases, storage, and encryption keys. Isolation is enforced by application-level `tenantId` filtering.

| Dimension | Assessment |
|-----------|-----------|
| Isolation strength | Weak. A single query bug or filter omission leaks cross-tenant data. |
| Operational cost | Lowest. One deployment, one database. |
| Enterprise trust | Low. Most enterprise security reviews will reject this for identity-plane data. |
| v1 fit | **Not recommended.** |

### Option B: Shared App + Isolated Data Stores (Recommended)

Application services (API, job scheduling, webhook handling) are shared. Tenant data (raw events, changes, baselines, graphs, plans, audit logs) is stored in per-tenant isolated storage resources with per-tenant encryption keys.

| Dimension | Assessment |
|-----------|-----------|
| Isolation strength | Strong. Cross-tenant access is architecturally impossible at the storage layer. |
| Operational cost | Medium. Per-tenant storage provisioning and key management. |
| Enterprise trust | High. Defensible in security questionnaires. |
| v1 fit | **Recommended.** Best balance of security and operations. |

### Option C: Fully Dedicated Per-Tenant Deployment

Each tenant gets a dedicated application stack, separate compute, separate storage, and separate network isolation.

| Dimension | Assessment |
|-----------|-----------|
| Isolation strength | Maximum. Full blast-radius containment. |
| Operational cost | Very high. N deployments to manage. |
| Enterprise trust | Maximum. |
| v1 fit | Not justified for v1. Viable as a premium tier later. |

### Comparison

| | Logical Multi-Tenant | Shared App + Isolated Data | Fully Dedicated |
|-|---------------------|---------------------------|----------------|
| Cross-tenant risk | High | Very low | None |
| Ops cost | Low | Medium | Very high |
| Enterprise trust | Low | High | Maximum |
| v1 recommendation | No | **Yes** | Future premium tier |

---

## 7. Recommended Tenant Isolation Model

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  SHARED CONTROL PLANE                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ API      │ │ Job      │ │ Webhook  │ │ Tenant    │  │
│  │ Gateway  │ │ Scheduler│ │ Receiver │ │ Provisioner│  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│          │           │           │            │          │
│          └───────────┴───────────┴────────────┘          │
│                          │                               │
│                   ┌──────▼───────┐                       │
│                   │ Tenant Router│                       │
│                   └──────┬───────┘                       │
└──────────────────────────┼───────────────────────────────┘
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
│  TENANT A DATA │ │ TENANT B DATA│ │ TENANT C DATA│
│  ┌───────────┐ │ │ ┌───────────┐│ │ ┌───────────┐│
│  │Raw Events │ │ │ │Raw Events ││ │ │Raw Events ││
│  │Changes    │ │ │ │Changes    ││ │ │Changes    ││
│  │Baselines  │ │ │ │Baselines  ││ │ │Baselines  ││
│  │Graph      │ │ │ │Graph      ││ │ │Graph      ││
│  │Plans      │ │ │ │Plans      ││ │ │Plans      ││
│  │Audit Logs │ │ │ │Audit Logs ││ │ │Audit Logs ││
│  └───────────┘ │ │ └───────────┘│ │ └───────────┘│
│  🔐 Key A      │ │ 🔐 Key B     │ │ 🔐 Key C     │
└────────────────┘ └──────────────┘ └──────────────┘
```

### What is shared

- API gateway and routing
- Job scheduling infrastructure
- Webhook ingress endpoint (routes to correct tenant)
- Tenant provisioning and management
- Application code (same version deployed for all tenants)
- Internal observability and alerting

### What is tenant-isolated

- All tenant data: raw events, normalized changes, baselines, dependency graphs, recovery plans, approval records, execution records, audit logs
- Encryption keys (per-tenant, managed by KavachIQ's KMS)
- Microsoft connector credentials (per-tenant service principals)
- Per-tenant configuration (sensitivity lists, approval policies, refresh schedules)

### Access enforcement

Application services identify the tenant from the authenticated request context. The tenant router provides a tenant-scoped data accessor that can only read/write the specified tenant's storage. There is no "list all tenants" or "query across tenants" API in the data layer. Cross-tenant queries are structurally impossible.

---

## 8. Credential and Permission Model

### 8.1 Two Service Principals Per Tenant

Each connected customer tenant has **two** registered service principals in their Entra:

**Read Principal (SP-Read)**
- Purpose: Audit log ingestion, state snapshots, validation reads, blast-radius queries
- Permissions: `AuditLog.Read.All`, `Directory.Read.All`, `Policy.Read.All`, `Group.Read.All`, `Application.Read.All`, `Sites.Read.All`
- Authentication: Client certificate (X.509), managed by KavachIQ
- Stored in: Per-tenant credential vault

**Execution Principal (SP-Execute)**
- Purpose: Recovery action execution (v1: group membership modification only)
- Permissions: `GroupMember.ReadWrite.All` (v1 only; expanded per capability as execution scope grows)
- Authentication: Client certificate (X.509), separate from SP-Read certificate
- Stored in: Per-tenant credential vault, separate access policy from SP-Read
- **Optional in v1.** Customers who use recommendation-only mode do not need to register SP-Execute.

### 8.2 Why Two Principals

A single service principal with both read and write permissions means that compromising the ingestion path (which is always running, always connected) automatically grants write access. Separate principals create a hard trust boundary:

- Compromising SP-Read allows an attacker to read audit data and snapshots. It does not allow modification of the customer's Entra objects.
- Compromising SP-Execute (if registered) allows write operations, but only within the scope of its specific permissions (`GroupMember.ReadWrite.All`), and only if the execution service is also compromised (SP-Execute credentials are only accessible to the execution service, not the ingestion service).

### 8.3 Certificate Management

| Property | SP-Read | SP-Execute |
|----------|---------|------------|
| Auth method | Client certificate (X.509) | Client certificate (X.509) |
| Key storage | Per-tenant vault, read-service access policy | Per-tenant vault, execution-service access policy |
| Rotation cadence | Annual (or per customer policy) | Annual |
| Rotation method | Zero-downtime: upload new cert, verify, revoke old | Same |
| Revocation | Immediate via Entra app credential removal | Immediate |
| Break-glass | KavachIQ security team can revoke via vault + Entra | Same |

Client certificates are preferred over client secrets because:
- Certificates are not transmitted over the wire during authentication (only the public key is registered in Entra)
- Certificate private keys can be stored in hardware security modules (HSMs)
- Certificates support stronger key lengths and rotation semantics

---

## 9. Read vs Write Trust Boundary

This is the most important security boundary in the system.

```
┌──────────────────────────────────────────────────────────────┐
│                     READ TRUST DOMAIN                        │
│                                                              │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐  │
│  │ Ingestion │ │ Normalizer│ │ Baseline  │ │ Blast-     │  │
│  │ Service   │ │           │ │ Store     │ │ Radius     │  │
│  │           │ │           │ │           │ │ Engine     │  │
│  └───────────┘ └───────────┘ └───────────┘ └────────────┘  │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                  │
│  │ Recovery  │ │ Validation│ │ Audit     │   Uses SP-Read   │
│  │ Planner   │ │ Service   │ │ Logger    │   credentials    │
│  └───────────┘ └───────────┘ └───────────┘                  │
│                                                              │
│  🔒 Cannot write to customer Entra/M365                      │
│  🔒 Cannot access SP-Execute credentials                     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    WRITE TRUST DOMAIN                         │
│                                                              │
│  ┌───────────┐ ┌───────────┐                                 │
│  │ Approval  │ │ Execution │   Uses SP-Execute credentials   │
│  │ Service   │ │ Engine    │   (when available)               │
│  └───────────┘ └───────────┘                                 │
│                                                              │
│  🔒 Cannot access raw events or baselines directly           │
│  🔒 Execution requires verified approval token               │
│  🔒 Circuit breaker halts after 3 consecutive failures       │
└──────────────────────────────────────────────────────────────┘
```

### Rules

1. **The read domain never holds SP-Execute credentials.** Ingestion, normalization, baseline, blast-radius, and planning services authenticate using SP-Read. They cannot invoke write operations.
2. **The write domain never holds SP-Read credentials.** The execution engine authenticates using SP-Execute. It cannot read raw events, baselines, or audit logs directly. It receives only the information needed for the specific step it is executing.
3. **The execution engine requires a verified approval token.** Before executing any write, the execution engine verifies that a valid, non-expired approval exists for the specific step. The approval is signed by the approval service and includes the step ID, target object, expected state, and expiration timestamp.
4. **The approval service does not execute.** It records operator decisions and issues signed approval tokens. It does not hold write credentials and cannot invoke Graph API writes.

---

## 10. Approval and Execution Authority Model

### Approval Flow

```
Operator reviews recovery plan
        │
        ▼
┌──────────────────┐
│ Operator approves │──▶ Approval Service records decision
│ step(s) in UI     │    + issues signed approval token
└──────────────────┘    (stepId, targetObject, targetState,
                         approvedBy, approvedAt, expiresAt,
                         signature)
        │
        ▼
┌──────────────────┐
│ Execution Engine  │──▶ Verifies approval token signature
│ receives step     │    Checks expiration (default: 30 min)
│ + approval token  │    Checks state match (pre-execution validation)
└──────────────────┘    Executes via SP-Execute
        │
        ▼
┌──────────────────┐
│ Audit Logger      │──▶ Records execution attempt, result,
│                   │    approval reference, pre/post state
└──────────────────┘
```

### Approval Token Properties

| Field | Purpose |
|-------|---------|
| `stepId` | Which recovery step this approval covers |
| `planId` | Which recovery plan version |
| `targetObjectId` | Which Entra/M365 object will be modified |
| `targetState` | Expected post-action state |
| `approvedBy` | Operator identity (UPN or object ID) |
| `approvedAt` | Timestamp |
| `expiresAt` | Approval validity window (default: 30 minutes) |
| `stateHashAtApproval` | Hash of the target object's state when approval was granted |
| `signature` | HMAC or asymmetric signature by the approval service signing key |

### Approval Invalidation

An approval token becomes invalid if:
- It has expired (`expiresAt` passed)
- The target object's current state hash no longer matches `stateHashAtApproval` (state changed since approval)
- The operator revokes the approval
- The approval service rotates its signing key

### Self-Approval Prevention

**The execution engine cannot approve its own actions.** The approval service and execution engine are separate services with separate credentials. There is no API path from the execution engine to the approval service that allows creating approvals. Approvals can only be created through the operator UI/API path.

---

## 11. Secret Management and Key Handling

### Key Types

| Key/Secret | Purpose | Storage | Access |
|-----------|---------|---------|--------|
| SP-Read client certificate | Authenticate to customer Entra for reads | Per-tenant vault | Ingestion service only |
| SP-Execute client certificate | Authenticate to customer Entra for writes | Per-tenant vault (separate access policy) | Execution service only |
| Approval signing key | Sign approval tokens | Platform vault | Approval service only |
| Per-tenant data encryption key | Encrypt tenant data at rest | Platform KMS | Storage layer only (envelope encryption) |
| Internal service identity certificates | mTLS between internal services | Platform vault | Per-service |
| Webhook validation secret | Validate Graph change notification signatures | Per-tenant vault | Webhook receiver only |

### Vault Architecture

- **Per-tenant vault:** Azure Key Vault (or equivalent) per tenant. Contains SP-Read certificate, SP-Execute certificate (if registered), and webhook validation secret. Access policies are service-scoped: ingestion service can read SP-Read; execution service can read SP-Execute; no service can read both.
- **Platform vault:** Separate from tenant vaults. Contains approval signing key, internal service certificates, and platform-level secrets. No tenant data.

### Rotation

| Secret | Rotation Cadence | Method |
|--------|-----------------|--------|
| SP-Read certificate | Annual | Upload new cert to Entra app; update vault; verify; remove old cert |
| SP-Execute certificate | Annual | Same as SP-Read |
| Approval signing key | Semi-annual | Dual-key window: both old and new keys valid during transition |
| Data encryption keys | Annual or per policy | Envelope encryption; new key for new writes; old key retained for reads |
| Webhook secret | Annual | Update subscription; Microsoft rotates on renewal |

### Break-Glass

If a credential is suspected compromised:
1. Immediately revoke the certificate in the customer's Entra app registration
2. Rotate the vault secret
3. Revoke any active approval tokens issued using the compromised signing key
4. Pause all ingestion and execution for the affected tenant
5. Alert the customer
6. Audit all actions taken with the compromised credential

---

## 12. Data Protection Model

### Encryption

| Data Type | At Rest | In Transit | Key Scope |
|-----------|---------|-----------|-----------|
| Raw events | AES-256, per-tenant key | TLS 1.3 | Tenant |
| Normalized changes | AES-256, per-tenant key | TLS 1.3 | Tenant |
| Baselines | AES-256, per-tenant key | TLS 1.3 | Tenant |
| Dependency graphs | AES-256, per-tenant key | TLS 1.3 | Tenant |
| Recovery plans | AES-256, per-tenant key | TLS 1.3 | Tenant |
| Audit logs | AES-256, per-tenant key | TLS 1.3 | Tenant |
| Approval tokens | Signed (HMAC/RSA) | TLS 1.3 | Platform |
| Internal service traffic | N/A | mTLS | Platform |

### Retention and Deletion

| Data Type | Default Retention | Customer Configurable | On Offboarding |
|-----------|-------------------|----------------------|---------------|
| Raw events | 90 days | Yes (30-365 days) | Purged within 30 days of disconnection |
| Baselines | 90 days | Yes | Purged |
| Recovery plans | 1 year | Yes | Purged |
| Audit logs | 1 year | Yes (1-7 years) | Exported to customer, then purged |
| Credentials | Revoked immediately on disconnect | N/A | Revoked + deleted from vault |

### Offboarding

When a customer disconnects:
1. SP-Read and SP-Execute certificates are revoked in the customer's Entra
2. All vault secrets for the tenant are deleted
3. Customer is offered an export of their audit logs
4. All tenant data is soft-deleted immediately and hard-deleted after 30 days
5. Per-tenant encryption key is scheduled for destruction after the hard-delete window

---

## 13. Auditability and Tamper Resistance

### Append-Only Audit Log

All system actions are written to an append-only audit log per tenant. The log is stored in immutable blob storage (Azure Immutable Blob Storage or equivalent) with a time-based retention policy that prevents deletion even by platform administrators.

### Integrity Hashing

Each audit log entry includes:
- A SHA-256 hash of the entry content
- A chained hash referencing the previous entry (hash chain)
- A timestamp from a trusted time source

Any modification to a log entry breaks the hash chain, making tampering detectable.

### What Is Logged

| Event | Logged | Immutable |
|-------|--------|-----------|
| Raw event ingestion | Yes | Yes |
| Normalized change creation | Yes | Yes |
| Baseline snapshot capture | Yes | Yes |
| Baseline approval/rejection | Yes | Yes |
| Blast-radius computation | Yes | Yes |
| Recovery plan generation | Yes | Yes |
| Operator approval decision | Yes | Yes |
| Recovery action execution | Yes | Yes |
| Validation result | Yes | Yes |
| Self-action identification | Yes | Yes |
| Secret access (vault read) | Yes (vault audit log) | Yes |
| Operator login | Yes | Yes |

### No Delete Capability

No API, no service, and no operator role (including platform admin) has the ability to delete audit log entries. Retention expiry is the only deletion mechanism, enforced by the storage layer.

---

## 14. Service Architecture Trust Boundaries

| Service | Trust Domain | Credentials Accessible | Can Write to Customer Entra | Can Read Customer Data | Can Approve Actions |
|---------|-------------|----------------------|---------------------------|----------------------|-------------------|
| API Gateway | Shared | None (routes only) | No | No (routes to tenant-scoped services) | No |
| Ingestion Service | Read | SP-Read | No | Yes (read-only) | No |
| Normalization Pipeline | Read | None (processes data from ingestion) | No | Yes (read-only) | No |
| Baseline Store | Read | SP-Read (for snapshot reads) | No | Yes (tenant-scoped) | No |
| Blast-Radius Engine | Read | None (reads from stores) | No | Yes (tenant-scoped) | No |
| Recovery Planner | Read | None (reads from stores) | No | Yes (tenant-scoped) | No |
| Approval Service | Write (but no execution) | Approval signing key | No | Limited (step details for display) | **Yes (records approvals)** |
| Execution Engine | Write | **SP-Execute** | **Yes (scoped)** | No (receives step data from planner) | No |
| Validation Service | Read | SP-Read | No | Yes (reads current state for comparison) | No |
| Audit Logger | Read | None (receives events from all services) | No | Yes (writes audit records) | No |
| Operator UI/API | Read + Approval | None directly; delegates to services | No | Yes (via API gateway) | Yes (issues approval requests to Approval Service) |

---

## 15. Operator and RBAC Model

### Roles

| Role | See Incidents | See Blast Radius | See Recovery Plans | Approve Steps | Execute Steps | Manage Baselines | Manage Tenant Config |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Viewer** | Yes | Yes | Yes | No | No | No | No |
| **Incident Responder** | Yes | Yes | Yes | No | No | No | No |
| **Recovery Approver** | Yes | Yes | Yes | **Yes** | No | No | No |
| **Recovery Executor** | Yes | Yes | Yes | Yes | **Yes** | No | No |
| **Tenant Admin** | Yes | Yes | Yes | Yes | Yes | **Yes** | **Yes** |
| **KavachIQ Platform Admin** | Metadata only | No | No | No | No | No | Platform-level only |

### Platform Admin Restrictions

KavachIQ internal platform administrators:
- **Can** manage tenant provisioning, service health, and platform configuration
- **Cannot** access customer tenant data (raw events, baselines, plans, audit logs)
- **Cannot** approve or execute recovery actions for any customer tenant
- **Cannot** access customer Microsoft credentials or vault secrets

Access to customer data by KavachIQ staff requires a break-glass procedure with multi-party approval and full audit logging.

---

## 16. Self-Action and Platform-Originated Change Safety

### Self-Action Identification

When KavachIQ's SP-Execute makes a write to a customer's Entra:
1. The write is logged in the customer's Entra audit logs with `initiatedBy.app.appId` matching SP-Execute
2. KavachIQ's ingestion service observes this audit event and tags it `selfAction: true`
3. Self-action events are excluded from incident candidate scoring
4. Self-action events are stored in the audit trail with full provenance (which plan, which step, which approval)

### Write Volume Monitoring

The execution engine maintains a per-tenant write counter. If the write volume exceeds expected thresholds:
- 1-10 writes per incident: normal
- 10-50 writes per incident: warning logged
- 50+ writes per incident: circuit breaker halts execution; operator alert

### Unauthorized Write Detection

The system monitors for writes by SP-Execute that were not preceded by a valid approval token. If detected:
1. Immediately revoke SP-Execute certificate
2. Halt all execution for the tenant
3. Alert KavachIQ security team and customer tenant admin
4. Generate a forensic audit report

---

## 17. Incident Response for the Platform Itself

### Scenario: Connector Credential Compromise

1. **Detect:** Anomalous audit events from SP-Read (unusual read volume, unexpected objects, unusual hours)
2. **Contain:** Revoke SP-Read certificate in customer Entra immediately
3. **Assess:** Audit all reads made by the compromised credential since last known-good time
4. **Recover:** Issue new certificate; update vault; resume ingestion
5. **Notify:** Customer notification with timeline and scope
6. **Review:** Post-incident review; assess whether read data was exfiltrated

### Scenario: Execution Credential Compromise

1. **Detect:** Writes by SP-Execute not matching any approved plan; or anomalous write patterns
2. **Contain:** Revoke SP-Execute certificate immediately; halt all execution platform-wide
3. **Assess:** Audit all writes; compare against approved plans; identify unauthorized modifications
4. **Recover:** Help customer revert any unauthorized changes (using KavachIQ's own recovery logic, ironically)
5. **Notify:** Immediate customer notification with full write log
6. **Review:** Root cause analysis; credential management review

### Safe Mode

KavachIQ supports a **write-disable safe mode** per tenant:
- All execution capabilities are disabled
- SP-Execute certificate is revoked (if registered)
- Read-only ingestion and analysis continue
- Recovery plans are generated as recommendations only
- Operators must execute all actions manually

Safe mode can be triggered by:
- Customer request
- KavachIQ security team (during incident response)
- Automated anomaly detection (excess write volume, failed approval verification)

---

## 18. Compliance and Enterprise Trust Considerations

### Security Questionnaire Readiness

The architecture supports the following common enterprise security review questions:

| Question | Answer |
|----------|--------|
| "How is our data isolated?" | Per-tenant storage with per-tenant encryption keys. No shared databases. |
| "What permissions do you need in our Entra?" | Two service principals: read-only (AuditLog.Read.All, Directory.Read.All, Policy.Read.All, Group.Read.All, Application.Read.All, Sites.Read.All) and optional write (GroupMember.ReadWrite.All for v1). |
| "Who can access our data?" | Only your authorized operators via the KavachIQ UI. KavachIQ staff cannot access tenant data without break-glass. |
| "Can you modify our Entra without our approval?" | No. All write operations require explicit operator approval. Write capability is optional and requires separate registration. |
| "How are logs protected?" | Append-only immutable storage with hash-chain integrity. No delete capability for any role. |
| "What happens if we disconnect?" | Credentials are revoked immediately. Data is soft-deleted and hard-deleted after 30 days. Audit logs can be exported first. |
| "Do you support SOC 2?" | The architecture is designed for SOC 2 Type II readiness. Formal certification is on the roadmap. |

---

## 19. Operational Constraints and Trade-offs

| Trade-off | Decision | Cost | Benefit |
|-----------|----------|------|---------|
| Per-tenant data stores vs shared database | Per-tenant | Higher provisioning and operational cost (~$5-15/month per tenant for storage) | Eliminates highest-severity risk (cross-tenant leak) |
| Two service principals vs one | Two (read + write) | Double the credential management per tenant | Hard trust boundary between read and write paths |
| Certificate auth vs client secrets | Certificates | More complex initial setup; rotation requires certificate infrastructure | Stronger authentication; private key never transmitted |
| Immutable audit logs vs standard logs | Immutable | Cannot correct logging errors; storage cost (no compaction) | Tamper resistance; forensic reliability |
| Per-tenant encryption keys vs shared key | Per-tenant | KMS cost; key rotation complexity | True tenant isolation at the encryption layer |
| Break-glass for engineer access vs direct access | Break-glass | Slower incident response for platform issues | No routine engineer access to customer data |

---

## 20. Risk Register

| Risk | Why It Matters | Severity | Mitigation |
|------|---------------|----------|------------|
| Cross-tenant data exposure | Destroys enterprise trust; potential regulatory violation | Critical | Per-tenant isolated storage; per-tenant encryption keys; no cross-tenant queries |
| Write credential (SP-Execute) compromise | Attacker can modify customer Entra objects | Critical | Separate SP-Read/SP-Execute; certificate auth; narrow permission scope; anomaly detection |
| Approval bypass | Write execution without operator authorization | Critical | Signed approval tokens verified by execution engine; separate approval and execution services |
| Audit log tampering | Undermines product's core trust value | High | Append-only immutable storage; hash-chain integrity; no delete API |
| Over-scoped Graph permissions | Customer security review rejection; unnecessary attack surface | High | Per-function permission manifest; customer-visible permission audit; refuse over-scope |
| Insider access to tenant data | Employee accesses customer identity data | High | No routine access; break-glass with multi-party approval and audit |
| Weak credential rotation | Stale certificates increase compromise window | Medium | Automated rotation monitoring; alerting on certs approaching expiry |
| Customer distrust of shared infrastructure | Enterprise customers reject the product | Medium | Per-tenant data isolation; architecture documentation; SOC 2 readiness |
| Self-action abuse (KavachIQ SP used for unauthorized writes) | Platform becomes an attack vector against customer | Critical | Write volume monitoring; unauthorized write detection; automatic SP-Execute revocation |

---

## 21. Open Questions

1. **Should customers be able to bring their own encryption keys (BYOK) in v1?** BYOK adds complexity but some enterprises will require it. Is this a v1 gating requirement or a v2 premium feature?

2. **Should SP-Execute use delegated permissions (operator signs in) or application permissions (service principal)?** Delegated permissions are more auditable (actions trace to a human) but add UX friction. Application permissions are simpler but less attributable.

3. **Should the approval signing key be per-tenant or platform-wide?** Per-tenant is more isolated but adds key management complexity. Platform-wide is simpler but means a compromised signing key affects all tenants.

4. **How should the system handle a customer who revokes KavachIQ's consent mid-incident?** If the customer revokes SP-Read or SP-Execute while a recovery plan is executing, the system must handle the permission loss gracefully.

5. **Should the system support SSO integration with the customer's identity provider for operator authentication?** This would mean operators log in with their Entra credentials. It improves trust but adds OIDC/SAML integration complexity.

6. **What is the break-glass SLA for credential revocation?** If a compromise is detected, how quickly must credentials be revoked? Minutes? Seconds? This affects the incident-response automation investment.

7. **Should per-tenant vaults be in the customer's Azure subscription or KavachIQ's?** Customer-managed vaults provide maximum control but maximum integration complexity. KavachIQ-managed vaults are operationally simpler but require trust.

---

## 22. Recommendation Summary

### Build for v1

- **Per-tenant isolated data stores** with per-tenant encryption keys. Shared application control plane with tenant-scoped data routing.
- **Two service principals per tenant:** SP-Read (read-only, always required) and SP-Execute (write-capable, optional, v1 limited to `GroupMember.ReadWrite.All`).
- **Client certificate authentication** for both service principals. Per-tenant vault storage with service-scoped access policies.
- **Signed approval tokens** verified by execution engine before every write. 30-minute expiration. State-hash invalidation.
- **Append-only immutable audit logs** with hash-chain integrity. No delete capability for any role.
- **RBAC model** with 5 operator roles. Platform admin cannot access tenant data.
- **Write-disable safe mode** for incident response and customer-requested read-only operation.

### Defer to v2+

- Customer-managed encryption keys (BYOK)
- SSO integration with customer identity provider
- Fully dedicated per-tenant deployment option (premium tier)
- Delegated permission model for execution (operator credential for write actions)
- Per-tenant approval signing keys
- Automated secret rotation (v1: monitored manual rotation with alerting)

### Assumptions That Must Hold

1. Azure Key Vault (or equivalent) supports per-tenant vault provisioning at the expected scale (hundreds of tenants in year 1).
2. Microsoft Entra supports registering two application registrations per customer with separate, scoped permission grants.
3. Immutable blob storage is available in all target Azure regions with time-based retention policy support.
4. Enterprise customers accept KavachIQ-managed encryption keys in v1 (with BYOK on the roadmap).

### Prototype/Validate Next

1. **Per-tenant vault provisioning automation.** Build and test the provisioning flow for creating a new tenant vault, generating SP-Read and SP-Execute certificates, registering them in a test Entra tenant, and configuring scoped access policies.
2. **Approval token signing and verification.** Implement and test the approval token lifecycle: creation by approval service, signature verification by execution engine, expiration, and state-hash invalidation. Measure latency overhead.
3. **Immutable audit log performance.** Deploy append-only blob storage with hash chaining. Measure write throughput, read query performance for forensic review, and storage cost at expected audit volumes (10K-100K entries per tenant per day).
