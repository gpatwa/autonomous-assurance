# Frontend / Backend Consistency Checklist

**Companion to:** `SHARED_PLATFORM_LAYER_DESIGN.md`, `PLATFORM_SHARED_PACKAGE_PLAN.md`
**Use:** Run through this checklist during PR review for any change that touches an API endpoint, a UI screen, a worker, or a script.

The goal is to catch the drift patterns that produce long-term tax: two copies of the same enum, two ways to say "pending", two date formats, two error shapes.

---

## 1. Status enums

- [ ] All status values come from `@kavachiq/schema` (`IncidentStatus`, `StepStatus`, `ActionStatus`, `SubActionStatus`, `CandidateStatus`, `ValidationResult`, `BaselineApprovalStatus`, `TrustedStateStatus`).
- [ ] No string literal copy of an enum value inside a component or handler. If you see `"new" | "investigating" | ...` redeclared, fail the review.
- [ ] Any new status value lands in `@kavachiq/schema` first, then in the API response, then in the UI.
- [ ] `core`, `api`, and UI import the same type — never redeclare.

## 2. Severity / urgency / confidence rendering

- [ ] Severity uses `SeverityLevel` (`critical | high | medium | low`). No UI-local `"CRIT" / "HIGH"` shortening.
- [ ] Urgency uses `UrgencyLevel`. No UI-local `"info"` stand-in for `"informational"`.
- [ ] Confidence uses `ConfidenceLevel` + `ConfidenceInfo`. Tooltips expose `reasons` and `missingFields` from the `ConfidenceInfo` payload — don't invent a secondary explanation.
- [ ] Label + color mapping comes from `platform/display` (when it lands). Before it exists, review flags any ad-hoc color decision on these fields.
- [ ] `<SeverityPill>`, `<ConfidenceBar>`, `<StatusBadge>` primitives are used — no per-screen variants.

## 3. Audit terminology

- [ ] Audit event strings use `AuditEventType` verbatim (`incident-created`, not `incident_created` or `IncidentCreated`).
- [ ] Every `AuditRecord` emission goes through `@kavachiq/core/audit` (read path) or `@kavachiq/execution/audit` (execution path). No ad-hoc JSON construction.
- [ ] Both paths emit against the same `AuditRecord` shape from `@kavachiq/schema` — different sink, same structure.
- [ ] Operator-facing verbs match the internal event name. "Action executed" in the UI matches `action-executed` in the schema; don't soften to "Change applied".

## 4. Object naming

- [ ] Object IDs in API responses use the schema field names: `incidentId`, `bundleId`, `changeId`, `planId`, `stepId`, `actionId`, `rawEventId`. Not `id` alone, not `uuid`.
- [ ] `tenantId` is present on every entity response.
- [ ] External IDs (Entra/Graph object IDs) sit in `TargetInfo.externalId` — not duplicated as a top-level field.
- [ ] UI props accept the schema types directly. No renaming on the way in.

## 5. Response envelopes

- [ ] Success responses wrap payload in `{ data, meta }` with `meta.correlationId`, `meta.tenantId`, `meta.schemaVersion`.
- [ ] List responses include `meta.page = { nextCursor, pageIndex, pageSize }`.
- [ ] Error responses use `{ error: { code, message, details? }, meta }`.
- [ ] No endpoint returns a bare array or a bare object.
- [ ] UI error handling keys off `error.code`, not `error.message`.

## 6. Loading / empty / error states

- [ ] Every data-fetching view renders all four states (loading, empty, error, success). No "shows stale data on error" shortcuts unless documented.
- [ ] Use `<AsyncState>` / `useApiQuery` — no bespoke `if (loading) return <Spinner/>` chains per screen.
- [ ] Empty state has a message and an action (where applicable), not just a blank panel.
- [ ] Error state shows the `error.code` in a copyable chip so support can match it to logs.

## 7. Correlation IDs

- [ ] Every inbound API request has an `x-correlation-id` header. If missing, server generates one and returns it.
- [ ] Every log line includes `correlationId` via `@kavachiq/platform/observability`.
- [ ] Every outbound call from one service to another forwards `x-correlation-id`.
- [ ] Error responses include `meta.correlationId`. UI displays it on error states and detail views (`<CorrelationIdChip>`).
- [ ] Scripts generate a correlation ID at startup and log it as the first line.

## 8. Tenant scoping

- [ ] `tenantId` is derived from authentication, never accepted as a client-supplied query param on operator-facing endpoints.
- [ ] Every storage read is tenant-partitioned — no cross-tenant read path.
- [ ] Platform-admin endpoints live under a separately-authorized namespace; operator UI code never calls them.
- [ ] Logs and audit records always include `tenantId` when the operation is tenant-scoped.

## 9. Date / time formatting

- [ ] Stored + transported values are ISO-8601 UTC (with `Z`). Never a locale-formatted string.
- [ ] UI date rendering goes through `<RelativeTime>` or an explicit formatter import. No `new Date(iso).toString()` in JSX.
- [ ] `platform/utils/time.nowIso()` is used for generating timestamps. No `new Date().toISOString()` scattered through handlers.
- [ ] Clock-dependent domain logic takes a `Clock` for test determinism.

## 10. API error handling

- [ ] Every thrown error extends `PlatformError`. No `throw "message"`, no bare `Error` in domain code.
- [ ] `PlatformError.code` values are documented in a central catalog (add to `platform/errors/codes.md` when it lands).
- [ ] API middleware converts `PlatformError` → envelope automatically. Handlers don't shape errors themselves.
- [ ] UI renders an error code → user-friendly message using a single translation map.

## 11. Dry-run semantics

- [ ] Any module that can write to external systems takes a `DryRunContext` or supports an explicit `apply` flag.
- [ ] Default is read-only. Writes require the caller to opt in.
- [ ] When `apply=false`, code logs what *would* happen — never silently skips a step.
- [ ] Scripts surface `DryRunContext` via `--apply`; workers via env/config; API endpoints via explicit body flag where meaningful.
- [ ] Execution service has no dry-run path for real writes — its "dry-run" is validation mode, which is a distinct concept documented separately.

## 12. Feature flags

- [ ] Flags are read through `@kavachiq/core/features` (single accessor). No `process.env.FEATURE_X` reads scattered through domain code.
- [ ] Flag names are strings in one place (`FeatureFlag` type) — no magic strings in handlers.
- [ ] Default-off for anything not proven. Flags never gate security-relevant behavior (auth, approval, trust-boundary checks).
- [ ] UI reads flag state from a `/features` endpoint, not from bundled constants, so tenant-specific flags work.

## 13. Logging

- [ ] Use `Logger` from `@kavachiq/platform/observability`. No `console.log` in service code. Scripts may use it during the first pass; migrate on next touch.
- [ ] Log messages are short and factual. Structured detail goes into the `fields` argument, not interpolated into the message.
- [ ] Secrets, tokens, and certificate material never appear in log output — not even at debug level.
- [ ] Errors are logged with the `err` argument so the stack is preserved.

## 14. Ids

- [ ] All IDs generated by the platform use `newId(prefix)` — never ad-hoc `Math.random()` or `Date.now()`.
- [ ] Prefixes are consistent with the schema (`inc_` for incidents, `pln_` for plans, etc., once defined — add to the schema doc).
- [ ] IDs are opaque to the UI; never parsed.

## 15. Trust boundary

- [ ] No `@kavachiq/execution` import from `@kavachiq/core`, `@kavachiq/api`, or `@kavachiq/workers`. Reverse direction also forbidden.
- [ ] Shared helpers in `@kavachiq/platform` resolve no secrets.
- [ ] Graph credentials are built inside the service that uses them. `TokenProvider` is the only shape that crosses a package.
- [ ] Approval tokens and SP certificates never enter the read path.

---

## How to use this checklist

1. On PR creation, scan the touched files. Every checked category gets a quick look.
2. On review, flag any `[ ]` box the change trips.
3. Additions to this checklist require a one-paragraph rationale and a link to the incident or design doc that surfaced the drift.

The list is deliberately short. If it grows past ~20 categories, prune it — a checklist nobody reads is worse than no checklist.
