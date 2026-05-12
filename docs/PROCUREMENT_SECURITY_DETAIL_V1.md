# Procurement Security Detail — v1

**Audience:** Customer security, procurement, and risk teams during evaluation
**Status:** Internal + procurement-only. **NOT public.** Do not link from kavachiq.com.
**Owner:** Founder / sales engineering
**Date:** 2026-05-12

---

## Scope of this document

The public KavachIQ pages (`/` and `/platform`) describe trust posture in outcome-led language — *approval-gated reversal*, *least-privilege Microsoft access*, *tenant-scoped isolation*, *audit trail and evidence*. This document is the **implementation-grade detail** behind those public claims, written for procurement security reviews, CISO due-diligence calls, and sales-engineering conversations.

It is intentionally separate from the public marketing pages so that:
1. The public pages stay credible and concise.
2. Implementation choices that may evolve (database engine, identity provider, key-management primitive) can change without retracting public claims.
3. Procurement-grade detail is shared deliberately, on request, with parties under NDA.

This doc reflects what KavachIQ ships **today** in the dev environment hosted at `agents.kavachiq.com`. Hardening differences for FedRAMP / sovereign deployments are out of scope here.

---

## 1. Tenant isolation

### Public-page claim
> Tenant isolation is enforced at the data layer, with no shared tenant context across requests. Tenant-bound keys and access scopes prevent cross-tenant visibility.

### Implementation detail

KavachIQ uses **Postgres Row-Level Security (RLS)** with two roles:

| Role | Permissions | Purpose |
|---|---|---|
| `kavachiq_app` | `NOLOGIN`, subject to RLS | Used by every API and worker query that handles tenant-scoped data |
| `kavachiq_admin` | `NOLOGIN`, `BYPASSRLS` | Used only by the outbox publisher and migration tooling |

Every multi-tenant table (`tenants`, `tenant_credentials`, `polling_state`, `raw_events`, `normalized_changes`, `correlated_change_bundles`, `incidents`, `outbox`, `pending_onboarding`) has RLS enabled, with policies of the form:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_iso ON <table>
  USING (tenant_id = current_setting('app.tenant_id', false)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', false)::uuid);
```

The application enforces `SET LOCAL app.tenant_id = '...'` on every request inside a transaction. The setting is transaction-scoped and cleared on COMMIT/ROLLBACK. A request that does not set `app.tenant_id` cannot read or write tenant-scoped rows (RLS returns zero rows and rejects writes).

### Defense-in-depth

- Database connection pooling is configured so connections do not carry tenant context between checkout cycles.
- Application code requires an explicit `withTenantContext(tenantId, …)` wrapper for any tenant-scoped query; admin-only queries use `withAdminContext` and are audited.
- Cross-tenant analytics are gated behind the admin role and use case-by-case review.

### What is NOT in scope
- This protects against tenant-data-mixing in the application layer. It is not a substitute for Postgres-level encryption-at-rest (which is provided by Azure Database for PostgreSQL Flexible Server with platform-managed keys).

---

## 2. Microsoft Graph access

### Public-page claim
> Microsoft Graph access is admin-consented per tenant and scoped to the surfaces under recovery management.

### Implementation detail

KavachIQ uses Microsoft Graph as the **read** surface for agent-driven change capture and as the (admin-controlled, future) **write** surface for approved reversals.

**Base + auth model:**

- Endpoint base: `https://graph.microsoft.com/v1.0`
- Auth: client credentials flow (application permissions) — admin-consented per tenant via the multi-tenant Entra application
- Scope: `https://graph.microsoft.com/.default` (resolves to the application permissions granted at consent)

**Endpoints exercised by the polling worker (read-only):**

| Endpoint | Purpose |
|---|---|
| `/auditLogs/directoryAudits` | Change capture across Entra identity, group, app, and policy surfaces |

**Permission scopes consented per tenant (read-only, current):**

- `AuditLog.Read.All` — read directory audit logs
- `Directory.Read.All` — resolve user, group, app, service principal identities referenced in audit logs

**Permission scopes anticipated for reversal (write — under operator approval only):**

- `Group.ReadWrite.All` — reverse group-membership and group-ownership changes
- `Application.ReadWrite.All` — reverse app-registration and service-principal changes
- `Policy.ReadWrite.ConditionalAccess` — reverse Conditional Access policy changes
- `RoleManagement.ReadWrite.Directory` — reverse role-assignment changes
- `Sites.FullControl.All` — reverse SharePoint and OneDrive sharing changes

These write scopes are not provisioned by default. They are added only after a customer chooses to enable platform-driven reversal vs. operator-driven reversal in their own admin tooling. Read-only deployment is supported.

**Detailed scope-by-feature mapping is available on request as a separate consented-scopes spreadsheet.**

---

## 3. Encryption and key management

### Public-page claim
> Tenant-bound keys and access scopes prevent cross-tenant visibility.

### Implementation detail

KavachIQ uses **envelope encryption** for tenant credentials (any secret KavachIQ holds on a tenant's behalf — e.g., the Microsoft client secret for that tenant's app registration during onboarding).

**Cipher:**
- Algorithm: `AES-256-GCM`
- IV: 12 bytes, random per encryption
- Auth tag: 16 bytes
- Ciphertext layout: `[12-byte IV | ciphertext | 16-byte auth tag]`

**Data Encryption Key (DEK):**
- 256-bit random key, **one per tenant**
- Stored as a versioned Azure Key Vault Secret
- Referenced by full versioned URI (e.g., `https://kv-kavachiq-platform-dev.vault.azure.net/secrets/<tenantId>/<version>`)
- Generated at tenant onboarding via `provisionTenantDek(vaultUrl, tenantId)` (KavachIQ application code)

**Why envelope encryption (not Key Vault encrypt/decrypt directly):**
- Key Vault RSA encryption is bounded by key size (~245 bytes for RSA-2048).
- AES-GCM is unbounded, fast, and authenticated.
- The DEK is still Key Vault-managed — rotatable, auditable, deletable. The control plane stays inside Key Vault.

**Key rotation:**
- Re-call `provisionTenantDek` to mint a new DEK version. The Key Vault secret is versioned; old versions remain readable for decryption of existing rows until those rows are re-encrypted under the new key version.
- Rotation is initiated by KavachIQ operations on a defined cadence and on suspected compromise.

**Permission boundary:**
- The KavachIQ application requires the `Key Vault Secrets Officer` role (get + set) on the platform Key Vault.
- Customer tenants do not have access to the platform Key Vault; each customer tenant's DEK is identified by tenant UUID inside the platform Key Vault.

**Hosting note:** The platform Key Vault is in the same Azure subscription as the rest of the KavachIQ platform. Sovereign-region or customer-managed-key (CMK) deployments are roadmap items, not shipped today.

---

## 4. Operator identity and access

### Public-page claim
> Audit trail and evidence pack ... anchored to verifiable enterprise identity.

### Implementation detail

KavachIQ operators (the people from a customer organization who view incidents and approve reversals) authenticate to the KavachIQ Operator Console via **Auth.js v5 (next-auth)** using the **Microsoft Entra ID provider**.

**Auth flow:**
1. Operator clicks "Sign in" on the console.
2. Redirected to Microsoft Entra ID for their organization to authenticate.
3. After successful sign-in, a session is established. The session carries:
   - `user.name`, `user.email` — operator identity from Entra
   - `tid` — the Microsoft Entra tenant ID of the operator's organization
4. The session's `tid` is used in a DB lookup against the `tenants.microsoft_tenant_id` column to resolve which KavachIQ tenant the operator is authorized to view.
5. All console queries run inside `withTenantContext(kavachiqTenantId, …)` enforcing RLS.

**Operator identity is anchored to Entra ID** — meaning every operator action recorded in the audit trail is associated with the Entra-resolved operator's name, email, and Microsoft tenant ID at the moment of action.

**Required environment configuration (per-deployment):**
- `AUTH_SECRET` — session encryption key
- `AUTH_MICROSOFT_ENTRA_ID_ID` — KavachIQ multi-tenant app client ID
- `AUTH_MICROSOFT_ENTRA_ID_SECRET` — client secret for the KavachIQ multi-tenant app
- `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` — `common` for multi-tenant sign-in

**What is NOT in scope today:**
- SCIM provisioning of operators (operators are recognized by their first sign-in for a registered tenant)
- Role-based access control beyond "is this operator's `tid` mapped to this KavachIQ tenant?" — finer-grained RBAC (read-only vs approver vs admin) is a roadmap item
- Conditional Access / step-up authentication policies on the KavachIQ console itself (operators inherit their Entra-tenant Conditional Access posture when signing in)

---

## 5. Approval gate enforcement

### Public-page claim
> Operators see the full proposed reversal — every step and its dependency — before any change runs. Approval is an explicit, scoped action; the platform does not act on its own.

### Implementation detail

**No automated reversal.** KavachIQ does not write to a customer tenant's Microsoft 365 environment without an explicit operator approval action.

**Enforcement points:**
1. **Plan proposal** — recovery plans are generated by the platform and persisted to the database in a `proposed` state. They are not associated with any pending Graph API call.
2. **Console review** — operators view the proposed plan in the console UI. The full plan, its dependency graph, and the per-step expected outcome are visible before any approval action.
3. **Approval API** — approving a plan requires an authenticated API call from the operator's session, scoped to that plan's ID and the operator's tenant. The approval is recorded with operator identity and timestamp.
4. **Execution** — only after a recorded approval does the platform initiate the corresponding Graph API write calls, step-by-step.
5. **Per-step validation** — each step's outcome is validated against expected state. Mismatches surface as warnings before the operator confirms sign-off on the full operation.

**Approval scope:**
- Approvals are per-plan. An operator approves a specific proposed reversal plan, not a class of plans.
- Approvals can in principle be restricted to subsets of the plan (partial approval); this is supported in the data model but not exposed in the v1 console UI.

**Failure modes:**
- If Graph API returns a transient error on a step, the step is marked failed and the operator is notified. No retry happens automatically without operator action.
- If a step fails mid-plan, subsequent dependent steps are paused. The operator decides whether to retry, skip, or abandon.

---

## 6. Audit trail and evidence

### Public-page claim
> Each recovery produces an exportable evidence record covering the agent's actions, the proposed plan, every approval, and the validated result — suitable for audit, SIEM ingest, and board reporting.

### Implementation detail

**Internal audit (persisted in the database):**

Every significant action is recorded as a row in the relevant table, with timestamps and operator/agent attribution:

| Event | Table | Key columns |
|---|---|---|
| Raw audit-log fetch | `raw_events` | `tenant_id`, `event_id`, `event_payload`, `fetched_at` |
| Normalized change extraction | `normalized_changes` | `change_id`, `tenant_id`, `agent_session_id`, `before_state`, `after_state`, `observed_at` |
| Incident creation | `incidents` | `incident_id`, `tenant_id`, `status`, `created_at`, `updated_at`, `closed_at` |
| Plan proposal | (planned, schema-versioned) | `plan_id`, `incident_id`, `proposed_at`, `proposed_by` |
| Plan approval | (planned, schema-versioned) | `plan_id`, `approver_operator_id`, `approved_at`, `approved_scope` |
| Step execution | (planned, schema-versioned) | `step_id`, `plan_id`, `started_at`, `completed_at`, `validation_result` |

All multi-tenant tables carry a `schema_version` smallint for forward-compatible reads.

**Exportable evidence pack:**

For each completed recovery operation, an evidence record can be produced that includes:
- The originating incident (agent, session, surface, raw audit-log references)
- The proposed plan (all steps, dependency graph, expected outcomes)
- Operator approval (identity, timestamp, scope of approval)
- Step-by-step execution results, including validation outcomes
- Final state confirmation and operator sign-off

**Format:** the v1 export format is JSON. The schema is versioned and documented for SIEM-compatibility (Sentinel, Splunk). A cryptographically signed evidence format (e.g., COSE-signed JSON or PKCS#7) is a roadmap item; today the integrity of the export depends on database immutability + Azure platform controls.

**Retention:** Per current dev-environment defaults, audit data is retained for 90 days. Customer-configurable retention is a roadmap item.

---

## 7. Hosting and data residency

### Implementation detail

**Hosting:**
- Azure region: Central US (current dev deployment)
- Compute: Azure Container Apps (API, pipeline worker, polling worker, web console)
- Database: Azure Database for PostgreSQL Flexible Server, platform-managed encryption-at-rest
- Secret storage: Azure Key Vault
- Blob storage: Azure Storage Account, platform-managed encryption-at-rest
- Messaging: Azure Service Bus (session-keyed queues for tenant ordering)

**Data residency:**
- All customer-tenant data is held in the same Azure region as the platform deployment.
- Multi-region or sovereign deployments are roadmap items, not shipped today.

**Network posture:**
- Outbound calls to Microsoft Graph use the standard public Graph endpoint with TLS 1.2+.
- The platform does not establish persistent VPN or ExpressRoute connectivity to customer environments — Graph API is the only data plane.

---

## 8. Compliance posture

**Today (truthful statement, no aspirational badges):**
- No formal compliance certifications (SOC 2, ISO 27001, HIPAA, FedRAMP) at this time.
- All security claims in this doc are technical capabilities, not third-party attestations.

**Roadmap (intent, not commitment):**
- SOC 2 Type I targeted for the next 12-month window, contingent on production customer demand.
- HIPAA-eligible deployment posture available on request for healthcare prospects.
- FedRAMP is not on the near-term roadmap.

**What we can do today for serious procurement:**
- Walk through this document live with the customer's security team.
- Provide the detailed Microsoft Graph permission scope inventory.
- Provide the evidence-pack schema sample.
- Walk through the storage schema and RLS policies with the customer's database security architect.
- Sign mutual NDA before any of the above.

---

## 9. Procurement-conversation FAQ

**Q: How is this different from what we already do with Microsoft Purview / Defender?**
KavachIQ runs downstream of those tools. Detection vendors tell you something happened. KavachIQ reverses the specific configuration and access changes an AI agent made, in dependency order, with operator approval. See `/platform` for the public framing.

**Q: Do you have a way to scope which tenants a particular operator can view?**
Yes — at sign-in we resolve the operator's Entra `tid` against the `tenants.microsoft_tenant_id` column. An operator from Tenant A's Entra organization cannot view Tenant B's data. Cross-tenant access requires the platform-administrator role (held by KavachIQ ops, not customers).

**Q: Does KavachIQ have any standing write access to our tenant?**
By default, no — current read scopes are `AuditLog.Read.All` and `Directory.Read.All`. Write scopes are added per-tenant only when a customer enables platform-driven reversal. Until then, KavachIQ proposes plans; your operators execute them via their own tooling.

**Q: What happens to our data if we cancel?**
On termination, tenant data and the corresponding Key Vault DEK are deleted. The DEK delete makes any residual ciphertext unreadable.

**Q: Can we self-host?**
Not today. Self-hosting / customer-VPC deployment is on the roadmap if procurement demand justifies the dual-deployment complexity.

**Q: What's your incident response process for a vulnerability in KavachIQ itself?**
Coordinated disclosure: report via `security@kavachiq.com`. SLA targets: 1 business day acknowledgement, 5 business day triage, severity-driven fix timeline. We commit to notifying affected customers within 72 hours of confirmed compromise.

**Q: How do we get a copy of this document?**
Request from your sales engineering contact. Distribution is NDA-gated. Do not share outside your evaluation team.

---

## 10. How this document is maintained

- **Owner:** Founder (today) / future security lead
- **Review cadence:** Quarterly, or on any material architecture change
- **Versioning:** This is v1. Material changes increment the version and are noted in a changelog at the bottom of future revisions.
- **Distribution:** NDA-gated. Track sends in CRM. Do not publish to kavachiq.com or agents.kavachiq.com.
- **Public page sync:** Whenever this doc is updated, verify the homepage and `/platform` claims are still defensible. The public pages should never claim more than this doc supports.

---

## Changelog

| Version | Date | Notes |
|---|---|---|
| v1 | 2026-05-12 | Initial draft. Codifies the implementation detail moved off the public `/platform` page during the credibility-tighten pass. |
