# Scripts

Phase 0 spike utilities. Run via `tsx` from `platform/`. All scripts use
`@kavachiq/platform` for env, logging, correlation, errors, and dry-run.
Orchestration scripts use the local `scripts/lib/runbook.ts` pattern:
**automation with explicit human approval gates** for risky steps.

## Run

| Script | Purpose | WI | Command |
|--------|---------|----|---------|
| `setup-test-tenant.ts` | Tenant summary / idempotent population + SP-Read/Execute/Setup verification (dry-run default) | WI-01/02/03 | `npm run setup-test-tenant -- --mode summary \| setup [--apply] [--output PATH]` |
| `fetch-audit-events.ts` | Fetch `/auditLogs/directoryAudits` for a window; write raw JSON | WI-05 | `npm run fetch-audit-events -- --start ISO --end ISO [--output PATH]` |
| `run-audit-completeness-spike.ts` | WI-05 orchestration: mutation checklist → confirmation → propagation wait → fetch → 4-class completeness analysis → JSON matrix + markdown summary | WI-05 | `npm run audit-completeness-spike -- --output-dir PATH [--confirm-mutations] [--wait-minutes N]` |
| `test-member-removal.ts` | Graph remove-member spike: reliability / idempotency / timing / rate-limit | WI-06 | `npm run test-member-removal -- --mode MODE --group-id ID (--members-file PATH \| --member-id ID) [--apply] [--output PATH]` |
| `trigger-canonical-mutations.ts` | WI-05 canonical mutation trigger (M1 via SP-Execute so events carry `initiatedBy.app`; commits 2 and 3 will add M2/M3/M4) | WI-05 | `npm run trigger-canonical-mutations -- [--apply] [--output PATH]` |

Scripts load `.env.local` first, then `.env`. Config errors exit `78`;
usage errors exit `2`; other errors exit `1`. See
`@kavachiq/platform/errors` → `ExitCodes`.

All log lines go to **stderr** as JSON objects. `fetch-audit-events`
writes event JSON to **stdout** when `--output` is omitted — pipe-safe.

## Files

| File | Purpose | Trust boundary |
|------|---------|----------------|
| `setup-test-tenant.ts` | WI-01 / WI-02 / WI-03 helper | SP-Read for existence checks + /organization probe. SP-Execute probe: token acquisition only. SP-Setup (new) for writes, behind `--apply` only. |
| `fetch-audit-events.ts` | WI-05 fetch | SP-Read only; read-only |
| `run-audit-completeness-spike.ts` | WI-05 orchestrator | SP-Read only; read-only. Interactive/confirm-mutations; propagation wait; analyze |
| `test-member-removal.ts` | WI-06 script | SP-Execute only; the ONLY script that issues DELETEs. Dry-run default. |
| `lib/transport.ts` | Pure Graph transport (`GET`, `DELETE`, `POST`, `$nextLink` paging). Surfaces `request-id` / `client-request-id` / `Retry-After`. Takes a `TokenProvider` at construction. | No secrets. Ready to be promoted to `@kavachiq/graph-transport` now that multiple scripts are real consumers. |
| `lib/credentials.ts` | SP credential bootstrap (cert or secret) for SP-Read, SP-Execute, and SP-Setup kinds. Reads env via `@kavachiq/platform/config`. | **Local by design.** Secret resolution stays at the script edge. Never moves into `@kavachiq/platform`. |
| `lib/runbook.ts` | Human-in-the-loop orchestration helper. Three step kinds (`automatic`, `manual`, `approval-required`), `requiresApply` gate for mutating steps, TTY prompts or `--confirm-manual-step` / `--confirm-all-manual` for non-interactive. Aborts on failure or decline; records `outputsProduced`. | No secrets. Script-local — promote to `@kavachiq/platform` when a second non-script consumer appears. |
| `tsconfig.json` | Scripts-only typecheck config | — |

## What is local vs shared

Local (stays in `scripts/lib/` or in the consuming service):

- Credential construction for SP-Read / SP-Execute / SP-Setup
- Reading of `SP_*_CERTIFICATE_PATH` / `SP_*_CLIENT_SECRET`
- Any `ClientCertificateCredential` / `ClientSecretCredential` instantiation
- The `TokenProvider` implementation that wraps a resolved `TokenCredential`

Shared (via `@kavachiq/platform`):

- `.env` / `.env.local` cascade loading
- `requireEnv` / `optionalEnv` / `envFlag` / `envInt`
- `Logger`, `createLogger`, `rootLogger`, JSON-line format
- `withContext`, `newCorrelationId`, auto-attached `correlationId` / `tenantId` on logs
- `PlatformError`, `ConfigError`, `isPlatformError`, `ExitCodes`
- `parseDryRunFlag`, `DryRunContext` (with `DRY_RUN=1` safety override)
- `nowIso`, `parseIso`, `isoMinus`, `MINUTE_MS` / `HOUR_MS` / `DAY_MS`
- `newId(prefix)` for run IDs and entity IDs

## Human-in-the-loop automation pattern

Orchestration scripts build a **runbook** — an ordered list of steps, each
classified as:

- **automatic** — the script runs it. Has `run()`. Default: always executes.
  Set `requiresApply: true` for mutating steps; those are skipped in dry-run.
- **manual** — informational. Script prints the instruction and records the
  step as skipped ("manual: operator-run outside this script"). Never blocks.
  Becomes `confirmed` when the operator passes `--confirm-manual-step <id>`
  or `--confirm-all-manual`.
- **approval-required** — the script pauses for explicit confirmation before
  proceeding. On TTY: interactive `[y/N]` prompt. Non-interactive: requires
  `--confirm-manual-step <id>` or `--confirm-all-manual`, otherwise the
  step fails with a clear message. Declining aborts the runbook.

Abort semantics: any automatic failure or approval-required decline stops
execution; every subsequent step lands as `skipped` with `skipReason:
"runbook aborted"`. The final result includes `aborted`, `abortReason`,
and the full step trail so the operator can investigate and re-run.

Confirmation flags (used by every orchestration script):

- `--confirm-manual-step <id>` — repeatable; pre-confirms the named step.
- `--confirm-all-manual` — pre-confirms every manual / approval-required step.
- Interactive TTY — prompts per approval-required step; manual steps are not
  prompted (they are documentation-as-code).

Rationale: the recommendation-first / operator-safe posture for KavachiQ
means risky Microsoft changes (CA policies, Teams/SharePoint, admin consent,
canonical scenario mutations) are automatable-with-approval, not silently
automated. The runbook codifies this without becoming a workflow engine.

## Trust boundary preservation

- `lib/transport.ts` imports only `@kavachiq/platform` (for `PlatformError`). It does **not** import from `@azure/identity`. It does **not** read env vars.
- `lib/credentials.ts` is the only module that touches SP secrets. It is not importable from `@kavachiq/platform`, `core`, `api`, `workers`, or `execution` — it lives in scripts.
- A future `@kavachiq/execution` service will write its own `credentials.ts` at its edge for SP-Execute. The transport shape (`GraphTransport` + `TokenProvider`) is reused; credential construction is not.

## WI-01 / WI-02 / WI-03 (`setup-test-tenant.ts`) detail

Two modes.

### `--mode summary` (default) — read-only

Uses SP-Read to snapshot the tenant and probe all three principals.
Produces a structured result with `spVerification` for SP-Read, SP-Execute,
and SP-Setup, plus canonical-object counts. Always safe to run.

```bash
npm run setup-test-tenant -- --mode summary --output ./wi01/summary.json
```

Requires: `SP_READ_*` env vars. Optionally reports on SP-Execute and
SP-Setup if their env vars are also set.

### `--mode setup [--apply]` — idempotent population

Creates missing canonical objects via SP-Setup:

- 50 users (UPN prefix `kq-test-NN`, display name `KavachiQ Test NN`)
- 19 generic security groups (`KavachiqTest-Group-NN`) + `Finance-Privileged-Access`
- 4 base members added to the privileged group
- 10 application registrations (`KavachiqTest-App-NN`)

Pre-fetches existing objects by prefix so re-runs are idempotent.

```bash
# Dry-run: compute the delta without writing.
npm run setup-test-tenant -- --mode setup --output ./wi01/plan.json

# Apply: create missing objects.
npm run setup-test-tenant -- --mode setup --apply --output ./wi01/applied.json
```

Required env for `--apply`:

- `SP_SETUP_TENANT_ID`, `SP_SETUP_CLIENT_ID`, plus `SP_SETUP_CERTIFICATE_PATH`
  (preferred) or `SP_SETUP_CLIENT_SECRET`. SP-Setup must have
  `User.ReadWrite.All` + `Group.ReadWrite.All` + `Application.ReadWrite.All` +
  `GroupMember.ReadWrite.All`. Do NOT reuse SP-Execute.
- `TENANT_DOMAIN` — verified domain for UPNs, e.g. `contoso.onmicrosoft.com`.
- `TENANT_SETUP_INITIAL_PASSWORD` — password set on created users with
  `forceChangePasswordNextSignIn=true`. Minimum 12 chars.

### What stays manual

These appear as `manual` runbook steps (status `skipped` unless the operator
confirms via `--confirm-manual-step <id>` / `--confirm-all-manual`). Never
automated, because the failure mode is either destructive (tenant lockout)
or cross-workload with subjective choices:

- `ca-policies` — Conditional Access policies (`Finance-MFA-Bypass`, `Finance-Data-Restriction`). Lockout risk.
- `teams-setup` — Teams team (`Finance-Team`) + link to privileged group.
- `sharepoint-setup` — 3 SharePoint site collections with group-based permissions.
- `admin-consent` — Application-permission consent for created app registrations.
- `scenario-trigger` — The 12 canonical member-add events; produced by WI-05, not setup.

Example with all manual items pre-confirmed (CI-friendly):

```bash
npm run setup-test-tenant -- --mode setup --apply \
  --confirm-manual-step ca-policies \
  --confirm-manual-step teams-setup \
  --confirm-manual-step sharepoint-setup \
  --confirm-manual-step admin-consent \
  --confirm-manual-step scenario-trigger \
  --output ./wi01/applied.json

# Or the shortcut:
npm run setup-test-tenant -- --mode setup --apply --confirm-all-manual --output ./wi01/applied.json
```

## WI-05 orchestration (`run-audit-completeness-spike.ts`) detail

Orchestrates the WI-05 evidence flow end-to-end and produces directly-usable
spike artifacts.

### Runbook steps

The script builds a 9-step runbook:

| ID | Kind | Purpose |
|----|------|---------|
| `confirm-M1-group-membership` | approval-required | Operator confirms the 12-member-add mutation was executed |
| `confirm-M2-conditional-access` | approval-required | Operator confirms the CA policy change was executed |
| `confirm-M3-app-role-assignment` | approval-required | Operator confirms the app role change was executed |
| `confirm-M4-sp-credential` | approval-required | Operator confirms the SP credential change was executed |
| `capture-window-and-wait` | automatic | Captures start, waits `--wait-minutes`, captures end, widens ±1 min |
| `fetch-audit-events` | automatic | Paged `/auditLogs/directoryAudits` fetch via SP-Read |
| `load-cached-events` | automatic | Reads `raw-events.json` from `--output-dir` (used in `--skip-fetch`) |
| `analyze-completeness` | automatic | 4-class analyzer |
| `write-artifacts` | automatic | Writes matrix JSON + markdown summary |

Outputs produced in `--output-dir`:

- `raw-events.json`
- `audit-completeness-matrix.json`
- `audit-completeness-summary.md`
- `run-result.json` — full runbook trail (steps, summary, outputs, correlation)

Confirmation: interactive TTY prompt per approval-required step, or
`--confirm-all-manual` (also aliased as `--confirm-mutations` for backward
compatibility), or per-step `--confirm-manual-step confirm-M1-group-membership`.

### Alternative flows

- `--start ISO --end ISO` — skip checklist + wait; fetch a known window directly.
- `--skip-fetch` — re-analyze an existing `raw-events.json` in `--output-dir`.
- `--skip-analysis` — fetch only.
- `--mutation-checklist` — print the checklist to stdout and exit.
- `--dry-run` — print the plan and exit.

### Example commands

```bash
# Full flow: print checklist, prompt, wait 15 min, fetch, analyze.
npm run audit-completeness-spike -- --output-dir ./wi05

# Non-interactive (CI / no-TTY): skip the prompt.
npm run audit-completeness-spike -- --output-dir ./wi05 --confirm-mutations

# Print the checklist only, save it.
npm run audit-completeness-spike -- --mutation-checklist > ./wi05/checklist.txt

# Known window; skip the wait entirely.
npm run audit-completeness-spike -- \
  --start 2026-04-15T12:00:00Z \
  --end   2026-04-15T12:30:00Z \
  --output-dir ./wi05 \
  --confirm-mutations

# Re-analyze a previously-captured raw-events.json without re-fetching.
npm run audit-completeness-spike -- --output-dir ./wi05 --skip-fetch --confirm-mutations
```

### Analysis output

Per change class the matrix captures: `matchCount`,
`withModifiedProperties`, `withOldValue`, `withNewValue`,
`withBothOldAndNew`, `beforeStateAssessment`
(`authoritative | partial | absent | unknown`), `anomalies`, and the
first 5 `sampleEventIds`. The overall `overallBeforeStateRecommendation`
names which classes can use `modifiedProperties` directly versus which
must fall back to snapshot-diff reconstruction.

The markdown summary is intentionally short and report-shaped — the
WI-05 spike report can be written by quoting and expanding it.

## WI-06 spike (`test-member-removal.ts`) detail

Evidence it collects per attempt: HTTP status, Graph `request-id` /
`client-request-id`, `Retry-After` on 429, elapsed ms, outcome
classification (`removed` / `already-absent` / `failed` / `unknown`),
and an error category (`rate-limited` / `forbidden` / `unauthorized` /
`server-error` / `client-error` / `network` / `other`).

### Required env

`SP_EXECUTE_TENANT_ID`, `SP_EXECUTE_CLIENT_ID`, and either
`SP_EXECUTE_CERTIFICATE_PATH` (preferred) or `SP_EXECUTE_CLIENT_SECRET`.

SP-Execute must have **only** `GroupMember.ReadWrite.All` granted.
Do not reuse a tenant-setup principal for this spike.

### Required manual tenant prep

- Test tenant populated per `CANONICAL_SCENARIO_FIXTURE.md` (WI-01).
- A target group (or three, if running the full reliability matrix) with
  enough real members that reliability removals don't exhaust membership.
- A separate newline-separated file of **already-absent** member IDs for
  idempotency + rate-limit modes. Reuse freshly-removed IDs from a prior
  reliability run or use stable tombstoned user IDs.
- Certificates (or temporary secret) for SP-Execute loaded into `.env.local`.

### Example commands

```bash
# Reliability — 60 removals across 3 group types = 3 runs × 20 members each.
npm run test-member-removal -- \
  --mode reliability \
  --group-id <groupObjectId> \
  --members-file ./wi06/reliability-group1.txt \
  --apply \
  --output ./wi06/reliability-group1.json

# Idempotency — 10 removals of already-absent members, expect 404 every time.
npm run test-member-removal -- \
  --mode idempotency \
  --group-id <groupObjectId> \
  --members-file ./wi06/absent-members.txt \
  --apply \
  --output ./wi06/idempotency.json

# Timing — latency-focused; runs the same loop, emphasises p50/p95/p99.
npm run test-member-removal -- \
  --mode timing \
  --group-id <groupObjectId> \
  --members-file ./wi06/reliability-group1.txt \
  --apply \
  --output ./wi06/timing.json

# Rate-limit — 50 rapid DELETEs against absent members; stops on first 429.
npm run test-member-removal -- \
  --mode rate-limit \
  --group-id <groupObjectId> \
  --members-file ./wi06/absent-members.txt \
  --burst-size 50 \
  --apply \
  --output ./wi06/rate-limit.json
```

### Safety knobs

- Default is dry-run; `--apply` opts in to real DELETEs.
- `--dry-run` is accepted explicitly and wins over `--apply`.
- `DRY_RUN=1` env forces dry-run regardless of CLI flags (ops safety net).
- `rate-limit` mode caps `--burst-size` at 200 and stops on first 429
  unless `--no-stop-on-429` is passed. Use only against absent members.

### Output shape

The JSON result captures everything the WI-06 spike report needs:
`runMetadata`, `sampleCounts`, `latencySummary` (min / max / mean /
p50 / p95 / p99), `rateLimit` (observed, first-observed-at, maxRetryAfter),
the full list of `attempts`, free-form `observations`, and derived
`recommendations` comparing the run against the WI-06 success criteria.

## Planned

| Script | Purpose | WI |
|--------|---------|----|
| `run-canonical-scenario.ts` | Execute the 12-member-add scenario against the test tenant | WI-05 |
| `measure-snapshot-size.ts` | Baseline snapshot sizing spike | WI-07 |
