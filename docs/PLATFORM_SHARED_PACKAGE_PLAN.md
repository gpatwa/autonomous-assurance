# Platform Shared Package Plan

**Date:** 2026-04-16
**Companion to:** `SHARED_PLATFORM_LAYER_DESIGN.md`
**Status:** Active

Short, implementation-oriented. One row per module. Phase tags refer to the Phase 0/1/2+ brackets in `MVP_IMPLEMENTATION_ROADMAP.md`.

---

## 1. New packages in this pass

### `@kavachiq/platform`

Single new package, Node-only, zero third-party runtime deps in the first drop.

| Subpath | Owns | Must not own | Initial consumer | Phase |
|---------|------|--------------|------------------|-------|
| `config` | `loadDotenvCascade`, `requireEnv`, `optionalEnv`, `envFlag`, `envInt` | Secret resolution, Key Vault, certificate loading | scripts (on migration), api, workers, execution | **Phase 0** |
| `observability` | `Logger` interface, default JSON-line logger, `withCorrelationId`, `currentCorrelationId`, `newCorrelationId` | Log sinks for external services (Datadog/Grafana wiring happens in the consuming service) | scripts (on migration), api, workers, execution | **Phase 0** |
| `errors` | `PlatformError` base class, `isPlatformError` guard, exit-code constants | Domain-specific error subclasses (those live in `core` / `execution`) | all services | **Phase 0** |
| `utils` | `newId`, `nowIso`, `parseIso`, `isoMinus`, `Clock` + `systemClock`, `parseDryRunFlag`, `DryRunContext`, `Page<T>`, `PageMeta` | Business logic, storage, HTTP | scripts, workers, api, execution | **Phase 0** |

Scaffolded in this pass. Consumers migrate on their next touch. No forced refactor of existing code.

---

## 2. Packages NOT created in this pass

### `@kavachiq/api-contracts`

- **Owns:** HTTP success/error envelope types, `ApiError` code catalog, pagination metadata, request/response shape for each endpoint.
- **Must not own:** Route handlers, middleware, UI rendering.
- **Initial consumer:** `@kavachiq/api` when the first endpoint is built; operator UI when it begins.
- **Phase:** **Phase 2.** Create the package the same week the first endpoint is implemented. Before then, the response shape lives in the design doc.

### `@kavachiq/ui-primitives`

- **Owns:** `<StatusBadge>`, `<ConfidenceBar>`, `<SeverityPill>`, `<UrgencyTag>`, `<ObjectDiffBlock>`, `<TimelineRow>`, `<AsyncState>`, `<EmptyState>`, `<RelativeTime>`, `<CorrelationIdChip>`, `<DryRunBanner>`, `<IncidentWorkspaceLayout>`, `useApiQuery` hook.
- **Must not own:** Screen-level pages, incident-specific business logic, data-fetching against a specific endpoint.
- **Initial consumer:** the operator UI app when its Next.js workspace is created.
- **Phase:** **Phase 2.**

### `@kavachiq/graph-transport`

- **Owns:** `fetch`-based Graph transport: `GET`, `POST`, `DELETE`, `$nextLink` pager. Takes a `TokenProvider` interface at construction time.
- **Must not own:** Credential construction, SP identity decisions, write-path authorization, approval token flow.
- **Initial consumer:** `scripts/` (migrated from `scripts/lib/graph.ts`) and `@kavachiq/core/ingestion`.
- **Phase:** **Phase 1.** Promote from `scripts/lib/graph.ts` the moment a second consumer is added (first candidate: WI-06 member-removal spike).

### `platform/display` (module inside `@kavachiq/platform`, added later)

- **Owns:** Shared label / color-token maps for status, severity, urgency, confidence. Pure data; no JSX.
- **Must not own:** React components (those live in `ui-primitives`), CSS.
- **Initial consumer:** `ui-primitives` badges, API export formatters, CLI table output.
- **Phase:** **Phase 2**, paired with `ui-primitives`.

### `@kavachiq/platform/jobs`

- **Owns:** `JobContext` struct, retry/backoff helper with jitter, job-start/job-end structured log helpers.
- **Must not own:** Job scheduling (Container Apps Jobs config is infra).
- **Initial consumer:** first `@kavachiq/workers` poller (Phase 1).
- **Phase:** **Phase 1.** Add the module to `@kavachiq/platform` when the first worker lands, not before.

---

## 3. Packages staying where they are

| Package | Why it is not touched |
|---------|------------------------|
| `@kavachiq/schema` | Already the canonical contract. No change in this pass. Platform package depends on it, not the other way. |
| `@kavachiq/core` | Domain logic. Subdirectories (`ingestion`, `normalization`, `correlation`, `detection`, `blast-radius`, `baselines`, `planning`, `audit`) already match the phase plan. |
| `@kavachiq/api` | Untouched until Phase 2. Will import `platform` + `schema` + `core`. |
| `@kavachiq/workers` | Untouched until Phase 1 poller. Will import `platform` + `schema` + `core`. |
| `@kavachiq/execution` | Untouched. Will import `platform` + `schema` only. Forbidden from `core`. |
| `@kavachiq/cli` | Untouched until first real command. Will import `platform` + `schema` + `core`. |

---

## 4. Dependency rules (enforced in `package.json`)

```
schema                  ← no deps on anything in the workspace
platform (new)          ← depends on: schema
core                    ← depends on: schema, platform
api                     ← depends on: schema, platform, core
workers                 ← depends on: schema, platform, core
execution               ← depends on: schema, platform          (NOT core, NOT api, NOT workers)
cli                     ← depends on: schema, platform, core
scripts/ (non-workspace) ← depends on: schema (via workspace), platform (via workspace), root @azure/identity
```

The execution boundary is the hard rule. If a refactor ever needs to pull something from `core` into `execution`, the correct answer is to move it down into `platform` or `schema` instead.

---

## 5. Owner-area notes

- `@kavachiq/platform` is a founding-engineering-team concern. CODEOWNERS entry should list the small group that reviews cross-cutting changes. No silent additions.
- `@kavachiq/schema` changes are reviewed alongside the data-model doc update (one PR covers both).
- `@kavachiq/execution` changes are reviewed with extra care: the boundary rule check is enforced at PR time.

---

## 6. Creation order (this pass and the next)

1. **This pass:** create `@kavachiq/platform` with `config`, `observability`, `errors`, `utils`. No cross-package rewiring.
2. **Next pass:** migrate `scripts/lib/graph.ts` env + log helpers to use `@kavachiq/platform`. Small diff, one PR.
3. **Phase 1 kickoff pass:** add `@kavachiq/platform/jobs` when the first worker lands. Extract Graph transport into `@kavachiq/graph-transport` the same week, driven by the second consumer.
4. **Phase 2 kickoff pass:** create `@kavachiq/api-contracts` with the first endpoint and `@kavachiq/ui-primitives` + `platform/display` with the first operator-UI screen.
