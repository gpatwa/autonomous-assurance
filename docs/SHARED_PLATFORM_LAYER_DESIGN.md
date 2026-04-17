# Shared Platform Layer Design

**Author:** Principal Engineer
**Date:** 2026-04-16
**Status:** Draft
**Prerequisites:** ENGINEERING_BOOTSTRAP_DECISIONS, DATA_MODEL_AND_SCHEMA_SPECIFICATION, OPERATOR_UI_AND_API_DESIGN, TENANT_SECURITY_ARCHITECTURE
**Classification:** Internal

---

## 1. Executive Summary

KavachIQ is entering the stretch where multiple services (`api`, `workers`, `execution`, `cli`, and Phase 0 scripts) and, soon, the operator UI will each need the same cross-cutting plumbing: configuration loading, structured logging, correlation IDs, error shaping, tenant context, Graph transport, paging, dry-run conventions, status/severity/confidence rendering. Without a deliberate shared layer, each service will invent its own — inconsistencies accumulate, bugs get fixed in one place but not the others, and the operator UI drifts out of sync with the API it consumes.

**What this pass produces:** a single, disciplined shared layer that eliminates the most likely duplications, while preserving the non-negotiable read-path / execution-path trust boundary.

**What should be centralized first:**

1. Config loading and env-schema validation
2. Structured logging + correlation-ID propagation
3. Error base class and `PlatformError` code taxonomy
4. Dry-run flag parsing and job-context shape (shared by scripts, workers, and future jobs)
5. Id/time utility helpers (canonical `tenantId` / ISO-8601 handling)
6. Pagination and cursor types (used by API responses, Graph pager, storage queries)

**What must remain separate:**

1. Graph auth credential construction (SP-Read vs SP-Execute must resolve secrets in their own process)
2. Execution-write helpers (pre-condition checks, approval-token verification, action execution)
3. Storage clients with write privileges (kept inside `execution` or inside read-path-only helpers)
4. Any function that handles approval tokens or SP certificates

**Explicit decision:** one new package, `@kavachiq/platform`, hosts the cross-cutting modules. It is Node-only, has no secret access, and is dependency-light. The frontend shared primitives are *designed* here but not yet scaffolded — the operator UI doesn't exist.

---

## 2. Design Goals

1. **Reduce duplication.** Anything already hand-written twice (env loading, structured log output, paging) becomes one implementation.
2. **Preserve trust boundaries.** Shared code never handles secrets or write credentials. Execution service continues to depend only on `@kavachiq/schema` and `@kavachiq/platform` — never on `@kavachiq/core`.
3. **Keep frontend and backend consistent.** The same enum list drives both API responses and UI rendering. Status/severity/confidence display rules live in one place, whether invoked from a badge component or a CLI table.
4. **Improve implementation speed.** A new service or script should be able to stand up in under an hour: one import for config, one for logger, one for errors, one for id/time. No copy-paste.
5. **Improve observability and audit consistency.** Every log line includes `correlationId` and `tenantId` when known. Every emitted `AuditRecord` goes through a helper that enforces the schema shape.
6. **Avoid premature over-frameworking.** Only build what is already duplicated or will be duplicated in the next two phases. Everything else stays in `core` / `api` / `workers` / `execution` until pain is felt.

---

## 3. Non-Goals

- **Not a giant internal framework.** No DI container, no metaprogramming, no plugin system. Plain functions and small classes.
- **Not a generic enterprise platform.** KavachIQ-specific. If a helper is not used by at least two consumers today or in the next phase, it does not belong here.
- **Not a full design system.** We design a small primitive vocabulary (badge, confidence bar, object-diff block). We do not build a Figma-accurate component library.
- **Not a replacement for domain logic.** Blast-radius traversal, recovery planning, incident classification — all stay in `@kavachiq/core`. The shared layer provides plumbing, not product.
- **Not a premature ORM or data-access layer.** Storage interfaces live in `@kavachiq/core` until a second consumer actually appears.
- **Not a redesign of existing architecture docs.** The service boundaries, storage choices, and trust boundaries stay locked.

---

## 4. Common Capability Inventory

For each capability: recommended home and expected consumers.

| # | Capability | Home | Consumers |
|---|------------|------|-----------|
| 1 | Config loading (`.env` + `.env.local`) | `platform/config` | all services + scripts |
| 2 | Env-schema validation (`requireEnv`, `envFlag`) | `platform/config` | all services + scripts |
| 3 | Tenant resolution / `TenantContext` | `platform/context` | api, workers, core (read), execution (per request) |
| 4 | Structured logger interface + JSON-line impl | `platform/observability` | all Node surfaces |
| 5 | Correlation-ID propagation (AsyncLocalStorage) | `platform/observability` | api, workers, core, execution, scripts |
| 6 | Error base class (`PlatformError`) + code catalog | `platform/errors` | all |
| 7 | Result/response envelope types | `platform/api-contracts` *(Phase 2)* | api, operator UI |
| 8 | Retry / backoff helper | `platform/utils` *(add when second caller appears)* | ingestion, execution |
| 9 | Graph client transport (fetch + paging) | Stay in `scripts/lib/graph.ts` **for now**; promote after WI-06 | scripts, then core, then execution (via separate credentials) |
| 10 | Graph credential construction | **Never shared.** Each service builds its own `TokenCredential` at the edge. | scripts (SP-Read), core/workers (SP-Read), execution (SP-Execute) |
| 11 | Feature flags / per-tenant feature state | `@kavachiq/core/features` (domain) → accessor in `platform/context` | api, workers, execution |
| 12 | Policy lookup (sensitivity lists, blast-radius rules) | `@kavachiq/core/policy` | core consumers |
| 13 | Clock abstraction | `platform/utils/time` | core (for testability), workers (scheduling) |
| 14 | ID generation (`newId("inc")`) | `platform/utils/ids` | core, api, execution |
| 15 | Schema validation / parsing of Graph responses | `@kavachiq/core/normalization` (domain) | workers (pipeline), scripts (fixture generation) |
| 16 | Safe JSON serialization (BigInt, circular refs, PII mask) | `platform/utils/json` *(Phase 2)* | api responses, log sinks |
| 17 | Background job context (`JobContext`, `DryRunContext`) | `platform/jobs` | workers, scripts |
| 18 | Permission / role check helpers | `@kavachiq/core/authz` + API middleware in `@kavachiq/api` | api, operator UI (read-only RBAC hints) |
| 19 | Status / severity / confidence rendering | `@kavachiq/schema` for source-of-truth constants; `platform/display` for label+color maps | operator UI, CLI, audit exports |
| 20 | UI primitives (badges, confidence bars, diff blocks, timeline rows, empty states) | `packages/ui-primitives/` *(Phase 2, when operator UI starts)* | operator UI only |
| 21 | Audit event publishing helper (`emitAudit(record)`) | `@kavachiq/core/audit` **for the read path**; separate `@kavachiq/execution/audit` for execution path. Shared record *contract* comes from `@kavachiq/schema`. | both paths, but via their own emitters |
| 22 | Storage key/partition-key helpers | `@kavachiq/core/storage` | core + workers |
| 23 | Pagination types | `platform/utils/pagination` | api, Graph pager, storage queries |

Rows 1–6 and 13–14 and 17 and 23 are scaffolded in this pass. Everything else is deliberately left to the service that needs it first, or to a later phase.

---

## 5. Trust-Boundary Rules

These are hard rules. A shared helper is unacceptable if it crosses any of them.

### 5.1 Allowed to be shared

- **Type definitions from `@kavachiq/schema`.** Already the contract; every service imports.
- **Logger interface and log-record shape.** Both read-path and execution service emit the same log line shape, so SIEM ingestion is consistent.
- **Correlation-ID helpers.** Same ID propagates across read-path → execution-path invocations.
- **Error base class.** Shared `PlatformError` shape. Execution raises its own subclasses; shape stays uniform.
- **`AuditRecord` *contract*.** Defined in `@kavachiq/schema`. Both paths emit records of that shape.
- **Env-var reading helpers.** Pure string parsing. No secret resolution.
- **Id / time / pagination / dry-run utilities.** Pure functions, zero I/O.

### 5.2 Not allowed to be shared

- **Graph credential construction.** Each process builds its own `TokenCredential`. SP-Read creds never enter an execution process and vice versa. A shared builder would create a footgun where a config switch could silently expose cross-boundary auth.
- **Graph write helpers.** `POST /groups/{id}/members/$ref`, `DELETE /...$ref`, and any other write wrappers live **only** in `@kavachiq/execution`.
- **Storage clients with write capability.** The execution service owns its own Table/Blob clients for its audit stream; read-path owns its own for incidents/plans. Shared storage helpers may exist, but credentials stay per-service.
- **Approval token verification.** Lives in `@kavachiq/execution/approval`. Never shared.
- **Secret loading / Key Vault access.** Each service resolves its own secrets. The shared `config` module reads env vars — it does not reach into Key Vault.
- **Action executors.** `executeAction(step)` stays in `@kavachiq/execution/actions`. No version of it leaks into read-path packages.

### 5.3 Boundary-sensitive (share the shape, not the implementation)

- **Graph transport.** It is fine to share a typed `fetch` wrapper with `$nextLink` paging. It is **not** fine to share a factory that resolves both SP-Read and SP-Execute in the same module. The transport takes a `TokenProvider` interface and the caller supplies it.
- **Audit emitters.** Read-path emitter writes to the read-path audit store; execution emitter writes to the execution audit store. Same record shape, different sinks.
- **Telemetry sinks.** Both sides use the same logger interface but may ship to separate destinations.

---

## 6. Recommended Package / Module Structure

### 6.1 Decision: one new package, not three

The user-supplied examples named `shared-config`, `shared-observability`, `shared-utils` as separate packages. After inspecting the current scale, splitting into three would add three `package.json` / `tsconfig.json` / build steps for modules that together are a few hundred lines. A single package with subpath exports gives the same import ergonomics without the repo sprawl.

**Go with `@kavachiq/platform`.** Split later if a consumer needs only one module (e.g., if a browser bundle ever needs `config` without the Node-only observability).

### 6.2 Repo layout after this pass

```
platform/
├── packages/
│   ├── schema/          @kavachiq/schema           (existing — canonical types)
│   ├── platform/        @kavachiq/platform         (NEW — cross-cutting plumbing)
│   ├── core/            @kavachiq/core             (existing — domain logic)
│   ├── api/             @kavachiq/api
│   ├── workers/         @kavachiq/workers
│   ├── execution/       @kavachiq/execution
│   └── cli/             @kavachiq/cli
```

Deferred packages (do not create yet):

- `@kavachiq/api-contracts` — create when the first API endpoint is built (Phase 2).
- `@kavachiq/ui-primitives` — create when the operator UI workspace is scaffolded (Phase 2).
- `@kavachiq/graph-transport` — promote from `scripts/lib/graph.ts` after the WI-06 member-removal spike gives a second consumer.

### 6.3 What stays where

| Package | Owns | Must not own |
|---------|------|--------------|
| `schema` | Canonical types, enums, entity shapes, schemaVersion constants | Runtime code, I/O, logger, tenant resolution |
| `platform` (new) | Config, env validation, logger, correlation, error base, id/time/pagination/dry-run utilities, `JobContext`, `TenantContext` type | Secret resolution, Graph auth, Graph writes, storage clients, domain logic |
| `core` | Ingestion, normalization, correlation, detection, blast-radius, planning, baselines, audit emission (read-path), policy, authz, storage-key helpers | HTTP server, UI, execution writes |
| `api` | HTTP routes, auth middleware, RBAC enforcement, operator-UI read models, response envelopes | Direct Graph writes, domain logic, execution |
| `workers` | Polling loops, normalization pipeline, snapshot jobs, validation jobs | HTTP server, execution writes, UI |
| `execution` | Approval verification, pre-condition checks, action execution, execution audit | Anything from `core` or `api`, read-path storage clients |
| `cli` | Admin/test commands against the read path | Execution writes outside a feature-flagged test command |

---

## 7. Frontend Shared Layer

The operator UI is Phase 2. This pass **designs** the primitive vocabulary so that when it is built, the team does not invent a per-screen variant of each pattern.

### 7.1 Required primitives (build when operator UI starts)

| Primitive | Purpose | Source of truth |
|-----------|---------|-----------------|
| `<StatusBadge status={...} kind="incident\|step\|action\|..."/>` | Render any of the 10+ status enums with consistent color/label | `@kavachiq/schema` enums + `platform/display` color map |
| `<ConfidenceBar level="high\|medium\|low\|unknown" reasons={...}/>` | Render `ConfidenceInfo`; tooltip shows `reasons` + `missingFields` | `@kavachiq/schema` `ConfidenceInfo` |
| `<SeverityPill severity="critical\|high\|medium\|low"/>` | Consistent severity rendering | `SeverityLevel` enum |
| `<UrgencyTag urgency="immediate\|within-hour\|within-day\|informational"/>` | Consistent urgency rendering | `UrgencyLevel` enum |
| `<IncidentWorkspaceLayout/>` | Tabbed layout (Overview, Blast Radius, Plan, Execution, Validation, Audit) | OPERATOR_UI_AND_API_DESIGN §6 |
| `<ObjectDiffBlock before={StateSnapshot} after={StateSnapshot}/>` | Render before/after; highlight changed keys; show `captureSource` and `confidence` | `StateSnapshot` type |
| `<TimelineRow event={AuditEvent}/>` | Timestamp, actor, event, detail expand | `AuditRecord` shape |
| `<AsyncState queryState={...}/>` | Loading / error / empty / success wrapper | — |
| `<EmptyState icon message action/>` | Consistent empty rendering | — |
| `<RelativeTime iso={...}/>` | "3 min ago" / tooltip ISO | `platform/utils/time` |
| `<CorrelationIdChip id="..."/>` | Show + copy correlation ID on detail views | — |
| `<DryRunBanner/>` | Top-of-page banner when a dry-run or safe-mode state is active | — |

### 7.2 API query-state handling

A single hook pattern for data fetching: `useApiQuery<T>(key, fetcher)` returns `{ data, loading, error, refetch }`. Errors are typed against the platform error catalog so the same `code` drives the same user-facing message across views.

### 7.3 What is deliberately not in scope yet

- Icon library choice (depends on marketing-site design system; separate call)
- Color tokens (wait for visual design)
- Responsive breakpoints (UI is operator-desktop primary; mobile is post-MVP)
- Any screen-level component

---

## 8. Backend Shared Layer

These are the Node-side modules that `@kavachiq/platform` ships in this pass (scaffolded minimally below) or hosts when justified later.

### 8.1 Config loader

```ts
requireEnv(name: string): string
optionalEnv(name: string, fallback?: string): string | undefined
envFlag(name: string, fallback?: boolean): boolean
envInt(name: string, fallback?: number): number
loadDotenvCascade(cwd?: string): void  // .env then .env.local (override)
```

Scaffolded now. Replaces `scripts/lib/graph.ts#loadEnv` and `required` — those will migrate once typecheck is green.

### 8.2 Env-schema validator

Initially, a lightweight declarative pattern: `defineEnvSchema({ SP_READ_TENANT_ID: "string", LOG_LEVEL: { kind: "enum", values: ["debug","info","warn","error"], default: "info" }})`. Validates at service startup. Zod is intentionally **not** pulled in — the current set of vars is small and duplicating the runtime check is cheap. Revisit if the count crosses ~20.

### 8.3 Logger

Interface:

```ts
interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}
```

Default impl: JSON-line to `process.stderr`, controlled by `LOG_LEVEL`. Auto-includes `correlationId` and `tenantId` from current context. No third-party dep in the first drop; swap to pino later if volume requires.

### 8.4 Correlation and context propagation

`AsyncLocalStorage<RequestContext>` with `correlationId`, optional `tenantId`, optional `actor`. Helpers:

```ts
withCorrelationId<T>(id: string, fn: () => T | Promise<T>): T | Promise<T>
currentCorrelationId(): string | undefined
newCorrelationId(): string   // uuidv4; emit once per request/job
```

Every inbound API request assigns one. Every worker job assigns one. Scripts assign one at startup. Execution-service calls receive the caller's ID in a header and adopt it.

### 8.5 Error base

```ts
class PlatformError extends Error {
  readonly code: string;               // stable machine code, e.g. "AUTH_MISSING"
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
  constructor(code, message, opts?)
}
```

Subclasses live in the package that owns the domain (`IngestionError` in core, `ExecutionError` in execution). All extend `PlatformError` so API error middleware can shape consistent responses.

### 8.6 Graph read client bootstrap

**Not promoted in this pass.** `scripts/lib/graph.ts` stays where it is. When WI-06 needs a second consumer, extract the transport (GET/POST/paging + `TokenProvider` interface) and leave credential construction at the edges.

### 8.7 Graph execution client bootstrap boundary

A stub interface in `@kavachiq/platform/graph-transport` *(later)* can be re-implemented inside `@kavachiq/execution` with SP-Execute credentials. The execution impl MUST NOT import from `@kavachiq/core` or from any module that transitively imports SP-Read.

### 8.8 Audit helper

Read-path: `@kavachiq/core/audit.emitAudit(record)`. Execution: `@kavachiq/execution/audit.emitAudit(record)`. Both consume the `AuditRecord` shape from `@kavachiq/schema`. A thin helper in `@kavachiq/platform/audit-shape` can validate shape without implementing the sink — defer until needed.

### 8.9 Storage key helpers

Lives in `@kavachiq/core/storage`. Not in `platform`: tight coupling to domain partition strategy. Extract only if execution needs the same key scheme (which it shouldn't — different store).

### 8.10 Pagination helpers

```ts
interface PageMeta { nextCursor: string | null; pageIndex: number; pageSize: number; }
interface Page<T> { items: T[]; meta: PageMeta; }
```

Reused by Graph pager, API responses, and internal storage queries.

### 8.11 Time helpers

```ts
nowIso(): string
parseIso(s: string): Date
isoMinus(iso: string, ms: number): string
```

Also a `Clock` interface for testability: `interface Clock { now(): Date; }` and `systemClock`. Not a heavy abstraction — justified because detection, correlation windows, and snapshot freshness all hinge on time and they all need deterministic tests.

### 8.12 Command/result patterns

**Not justified now.** The codebase is small enough that ad-hoc typed returns are clearer. Revisit if we find ourselves writing three variants of `Result<T, E>`.

---

## 9. API Contract Consistency

Every HTTP endpoint (starting Phase 2) must conform to the same envelope.

### 9.1 Success envelope

```json
{
  "data": { ... },
  "meta": {
    "correlationId": "...",
    "tenantId": "...",
    "schemaVersion": 1,
    "page": { "nextCursor": null, "pageIndex": 0, "pageSize": 50 }
  }
}
```

`page` is present only on list endpoints.

### 9.2 Error envelope

```json
{
  "error": {
    "code": "ENTITY_NOT_FOUND",
    "message": "Incident 'inc_abc123' not found for tenant 'tnt_xyz'",
    "details": { "incidentId": "inc_abc123" }
  },
  "meta": {
    "correlationId": "...",
    "tenantId": "..."
  }
}
```

`code` is stable and documented. Messages are allowed to evolve. Clients key off `code`.

### 9.3 Mandatory headers

- `x-correlation-id` on every request and response.
- `x-tenant-id` on responses; inbound it is derived from auth, never trusted from the client header.

### 9.4 Status and enum consistency

Every status / severity / urgency / confidence field returned from the API uses exactly the string values defined in `@kavachiq/schema` — no UI-specific renaming. Display mapping happens in the UI, sourced from `platform/display`.

### 9.5 Tenant scoping

Every resource is implicitly scoped to the authenticated tenant. `tenantId` is never a user-provided query parameter. Cross-tenant endpoints (platform admin) live under a separately-authorized namespace and never appear in operator UI code paths.

### 9.6 Audit / reference linking

Endpoints returning entities include `auditRecordIds` when relevant so the UI can deep-link into the audit timeline without a second fetch.

---

## 10. Jobs / Scripts / Platform Consistency

Scripts (`platform/scripts/`), workers (`@kavachiq/workers`), and future background jobs share more than they differ. Standardize:

| Concern | Convention |
|---------|------------|
| Env loading | `loadDotenvCascade()` from `@kavachiq/platform` at process start |
| Required-var failure | Throw `PlatformError("CONFIG_MISSING", ...)`; exit code `78` (EX_CONFIG) |
| Tenant context | Jobs pass `TenantContext` explicitly; scripts infer from env |
| Logger | JSON-line to stderr; `LOG_LEVEL` controls verbosity |
| Correlation ID | Assign at entry (`newCorrelationId()`), log once at start with `jobName`/`scriptName` |
| Retry | Bounded exponential backoff helper (add when first polling loop lands); do not hand-roll |
| Dry-run convention | `--apply` enables writes; absence = read-only. `DRY_RUN=1` env var equivalent. `DryRunContext` struct passed to helpers |
| Exit codes | `0` success, `1` unexpected error, `2` usage error, `78` config error, `69` upstream unavailable |
| Output shape | Scripts emit a final JSON-line `{"event":"complete", ...}` on success so CI / runners can parse |

Scripts already halfway there (`setup-test-tenant.ts` has `--apply`; `fetch-audit-events.ts` has paged output). Migrating them to the platform-provided helpers is a small follow-up once the package lands.

---

## 11. What To Build Now vs Later

### 11.1 Build now (this pass)

New package `@kavachiq/platform` with:

- `config/` — `loadDotenvCascade`, `requireEnv`, `optionalEnv`, `envFlag`, `envInt`
- `observability/` — `Logger` interface, default JSON-line logger, `withCorrelationId`, `currentCorrelationId`, `newCorrelationId`
- `errors/` — `PlatformError` base, `isPlatformError`
- `utils/` — `newId(prefix?)`, `nowIso`, `parseIso`, `isoMinus`, `Clock`/`systemClock`, `parseDryRunFlag`, `DryRunContext`, `Page<T>`, `PageMeta`

No wiring into existing packages. Consumers adopt it incrementally. The package compiles on its own and is typechecked.

### 11.2 Build soon (next 1-2 passes)

- Migrate `scripts/lib/graph.ts#loadEnv` and `required` to `@kavachiq/platform/config`.
- Migrate `scripts/*.ts#logStep` to `@kavachiq/platform/observability`.
- Add `@kavachiq/platform/jobs` with `JobContext` and retry helper when the first polling worker lands (Phase 1 WI).
- Promote Graph transport out of `scripts/lib/` into a shared transport module after WI-06 confirms the write-path shape. Keep credential construction at the edge.

### 11.3 Build later (Phase 2+)

- `@kavachiq/api-contracts` — response envelope types when the first API endpoint lands.
- `@kavachiq/ui-primitives` — operator-UI design primitives when the UI workspace is created.
- `platform/display` — shared label/color map for status/severity/confidence. Both API (for export) and UI consume.
- Retry/backoff helper with jitter.
- Safe JSON serializer (BigInt/circular/mask).

### 11.4 Do not build

- A generic event bus abstraction.
- A generic repository interface.
- A generic "domain service" base class.
- A DI container.

---

## 12. Risk Register

| # | Risk | Mitigation |
|---|------|------------|
| R1 | **Over-abstraction too early.** Shared package accretes speculative helpers and nobody knows what is in it. | Each addition requires at least one real consumer in the same PR. Review-gate on “rule of two”: centralize only after the second hand-written copy appears. |
| R2 | **Hidden coupling across trust boundaries.** A shared Graph client helper silently accepts both SP-Read and SP-Execute credentials, creating a single code path a bug could compromise. | Shared layer contains zero secret resolution. `TokenProvider` is an interface; credential builders live in the service that needs them. Execution package forbidden from importing `core`. |
| R3 | **Duplicated helpers survive anyway.** Services keep their local `logStep` because rewriting feels like churn. | Add a small linting rule / grep-check in CI (“no `console.log` in service code”, “no private `logStep`”) once the package is adopted in two consumers. |
| R4 | **UI inconsistency if primitives are skipped.** Each screen re-implements status badges and confidence bars. | Operator UI work must start by importing the primitive package; style choices happen centrally. Lint rule: no raw color strings in JSX once design tokens exist. |
| R5 | **Shared package becomes a dumping ground.** Every "kind of useful" helper lands here. | Package owner in CODEOWNERS. Minimum-bar review: “is there a more specific package?” If the answer is any package name, it goes there. |
| R6 | **Enum drift between API and UI.** API returns `"informational"` urgency; UI screen renders `"info"`. | Both sides import from `@kavachiq/schema`. No UI-local copies. Lint rule: no string literals matching schema enum values in UI code. |
| R7 | **Correlation IDs lost across service hops.** Read-path invokes execution; correlation context does not propagate. | Execution endpoint accepts `x-correlation-id` header and adopts it. Missing header → generate new + log a warning. |
| R8 | **Frontend/backend date formatting drift.** API returns ISO-8601; UI renders "2026-04-16T00:00Z" in some places, "Apr 16" in others. | `<RelativeTime/>` is the only date-rendering component; raw ISO strings in JSX fail review. |

---

## 13. Recommendation Summary

1. **Create one package, `@kavachiq/platform`**, with `config`, `observability`, `errors`, and `utils` subpaths. Scaffold only the foundational modules listed in §11.1.
2. **Preserve the read-path / execution-path boundary** by keeping all secret resolution, all Graph writes, and all approval-token logic out of the shared layer.
3. **Do not create** `shared-config`, `shared-observability`, `shared-utils` as separate packages. Subpath exports are enough.
4. **Do not scaffold UI primitives yet.** Design them here; build when the operator UI workspace is created.
5. **Defer** `@kavachiq/api-contracts` until the first endpoint exists.
6. **Standardize envelope, headers, enums, and job conventions now** (documented here) so the first endpoint and first worker land consistent.
7. **Migrate existing `scripts/lib/graph.ts` helpers to `@kavachiq/platform`** in the next pass, not this one. Keep this pass structural and small.

The goal is not a framework. The goal is one less copy of `loadEnv`, one less copy of `logStep`, and one shared `PlatformError` shape, so that when the team ships Phase 1 there is nothing to retrofit.
