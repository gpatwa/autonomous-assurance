# Engineering Bootstrap Decisions

**Purpose:** Record key early implementation decisions for Phase 0. Short, direct, decision-oriented.

---

## 1. Service Boundaries

### Decision: Read-Path Monolith + Separate Execution Service

**Read-path monolith** (one repo, one deployable unit):
- API/UI server
- Entra audit poller
- Normalization pipeline
- Correlation + incident detection
- Blast-radius engine
- Baseline snapshot worker
- Recovery plan generator
- Validation service
- Audit logger

**Execution service** (separate repo or separate deployable within same repo):
- Approval token verifier
- Execution engine (Graph API writes)

**Why:** The read/write trust boundary is non-negotiable. Everything else can share a codebase for development speed. Module boundaries enforced by code organization, not network calls. Split the read-path monolith only after Phase 4 if scaling requires it.

---

## 2. Repo Structure

### Decision: Monorepo with workspace packages

```
kavachiq/
├── packages/
│   ├── schema/           # shared types and enums (published as internal package)
│   ├── core/             # domain logic (ingestion, detection, blast-radius, planning, baselines)
│   ├── api/              # API server + UI serving
│   ├── workers/          # background job handlers (polling, normalization, snapshots, validation)
│   ├── execution/        # execution service (separate deployable)
│   └── cli/              # admin/test CLI
├── fixtures/             # canonical scenario test data
├── docs/                 # architecture and design docs (existing)
├── scripts/              # dev tooling, provisioning, spikes
└── infra/                # Azure deployment templates (Bicep/ARM)
```

**Why:** Monorepo enables shared schema package with zero publish lag. Each `package/` can be deployed independently when needed. Execution service is a separate package from day one.

---

## 3. Language and Framework

### Decision: TypeScript on Node.js

**API/UI:** Next.js (already proven in the marketing site)  
**Backend workers:** Node.js with the same TypeScript codebase  
**Execution service:** Node.js (separate entry point, same repo)  
**Schema package:** TypeScript with strict mode  

**Why:** Full-stack TypeScript eliminates language-boundary friction. The marketing site is already Next.js/TypeScript. The team can share types end-to-end. Microsoft Graph SDK for Node.js (`@microsoft/microsoft-graph-client`) is mature.

**This decision is locked.** TypeScript is the implementation language for Phase 0 and MVP. The team should not revisit this decision unless a Phase 0 spike documents a concrete, blocking Graph SDK issue that cannot be worked around with raw HTTP calls. "C# would be slightly better for X" is not a valid reason to switch. A language switch mid-build is more expensive than any SDK gap.

**Alternative evaluated and rejected:** C# / .NET. Stronger Microsoft Graph SDK, better Azure-native tooling. Rejected because it adds a language boundary with the existing React/Next.js frontend and fragments the team's type system.

---

## 4. Local Dev Environment

### Decision: Docker Compose with Azurite + Cosmos Emulator

```
docker-compose.yml:
  azurite:     # Azure Storage emulator (Blob + Table + Queue)
  cosmos:      # Cosmos DB emulator
  app:         # Read-path monolith (hot reload)
  execution:   # Execution service (hot reload)
```

**Why:** Azurite emulates Azure Blob, Table, and Queue storage locally. Cosmos emulator provides local Cosmos DB. Both are official Microsoft images. No Azure subscription needed for basic dev work.

**For Graph API calls:** Use the real test tenant with SP-Read/SP-Execute credentials. Graph API cannot be emulated locally.

---

## 5. Test Tenant Strategy

### Decision: Dedicated Entra Test Tenant

- One dedicated Entra test tenant for all development and testing
- Populated per the canonical scenario fixture
- SP-Read and SP-Execute registered with minimum required permissions
- Credentials stored in a shared dev vault (not committed to repo)
- All engineers share the same test tenant (with coordination for destructive operations)

**Why:** A real Entra tenant is required because Microsoft Graph APIs and audit logs cannot be emulated. Sharing one tenant is simpler than per-developer tenants.

**Risk:** Concurrent testing may produce conflicting state. Mitigation: coordinate destructive operations (member removal, group modifications) via team communication. Use per-engineer test groups for isolated testing where needed.

---

## 6. Synthetic Data Strategy

### Decision: Real Events + Fixture Files

**Approach:**
1. Execute the canonical scenario against the real test tenant
2. Capture the resulting audit events as JSON fixtures
3. Use these fixtures for unit and integration tests
4. For pipeline testing, replay fixtures through the normalization pipeline

**Why:** Synthetic events invented from scratch may not match real Microsoft audit log format. Capturing real events ensures the normalization pipeline handles actual field shapes.

**For Phase 1+ integration tests:** Run the canonical scenario against the real tenant. Verify the full pipeline produces expected output.

---

## 7. What Is Explicitly Deferred Until After Phase 0

| Item | Why Deferred |
|------|-------------|
| Ingestion code | Phase 1 work item |
| Normalization pipeline | Phase 1 work item |
| Operator UI | Phase 2 work item |
| Blast-radius computation code | Phase 2 work item |
| Azure deployment configuration | Phase 1 (dev runs locally in Phase 0) |
| CI/CD pipeline | Phase 1 (manual deploy for Phase 0 spikes) |
| Per-tenant provisioning automation | Phase 5 |
| M365 audit log ingestion | Post-MVP |
| Graph webhook integration | Post-MVP |
| Exchange/Teams direct API integration | Post-MVP |
| Customer-facing authentication | Phase 2 (Entra SSO) |

---

## 8. Phase 0 Definition of Done

Phase 0 is complete when:
1. All 5 critical spikes have documented results
2. No blocking architecture assumptions have been invalidated
3. The shared schema package compiles and is importable
4. The dev environment runs locally with emulated stores
5. The canonical scenario fixture data exists as validated JSON files
6. The Phase 1 work items are defined and ready for engineering

If a spike invalidates an assumption (e.g., audit logs do not include before-state for group changes), the Phase 0 exit is delayed until the architecture adjustment is documented and the impacted design doc is updated.
