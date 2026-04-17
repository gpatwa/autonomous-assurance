# Scripts

Phase 0 spike utilities. Run via `tsx` from `platform/`. All scripts now
use `@kavachiq/platform` for env, logging, correlation, errors, and
dry-run — no ad-hoc plumbing.

## Run

| Script | Purpose | WI | Command |
|--------|---------|----|---------|
| `setup-test-tenant.ts` | Partial Entra test tenant bootstrap (dry-run default) | WI-01 | `npm run setup-test-tenant [-- --apply]` |
| `fetch-audit-events.ts` | Fetch `/auditLogs/directoryAudits` for a window; write raw JSON | WI-05 | `npm run fetch-audit-events -- --start ISO --end ISO [--output PATH]` |
| `test-member-removal.ts` | Graph remove-member spike: reliability / idempotency / timing / rate-limit | WI-06 | `npm run test-member-removal -- --mode MODE --group-id ID (--members-file PATH \| --member-id ID) [--apply] [--output PATH]` |

Scripts load `.env.local` first, then `.env`. Config errors exit `78`;
usage errors exit `2`; other errors exit `1`. See
`@kavachiq/platform/errors` → `ExitCodes`.

All log lines go to **stderr** as JSON objects. `fetch-audit-events`
writes event JSON to **stdout** when `--output` is omitted — pipe-safe.

## Files

| File | Purpose | Trust boundary |
|------|---------|----------------|
| `setup-test-tenant.ts` | WI-01 script | Uses SP-Read only; writes are flagged TODO |
| `fetch-audit-events.ts` | WI-05 script | Uses SP-Read only; read-only |
| `test-member-removal.ts` | WI-06 script | Uses SP-Execute only; the ONLY script that issues DELETEs. Dry-run default. |
| `lib/transport.ts` | Pure Graph transport (`GET`, `DELETE`, `$nextLink` paging). Surfaces `request-id` / `client-request-id` / `Retry-After` on success and in `GraphRequestError`. Takes a `TokenProvider` at construction. | No secrets. Ready to be promoted to `@kavachiq/graph-transport` now that WI-06 is a second consumer. |
| `lib/credentials.ts` | SP credential bootstrap (cert or secret). Reads env via `@kavachiq/platform/config`. | **Local by design.** Secret resolution stays at the script edge. Never moves into `@kavachiq/platform`. |
| `tsconfig.json` | Scripts-only typecheck config | — |

## What is local vs shared

Local (stays in `scripts/lib/` or in the consuming service):

- Credential construction for SP-Read / SP-Execute
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

## Trust boundary preservation

- `lib/transport.ts` imports only `@kavachiq/platform` (for `PlatformError`). It does **not** import from `@azure/identity`. It does **not** read env vars.
- `lib/credentials.ts` is the only module that touches SP secrets. It is not importable from `@kavachiq/platform`, `core`, `api`, `workers`, or `execution` — it lives in scripts.
- A future `@kavachiq/execution` service will write its own `credentials.ts` at its edge for SP-Execute. The transport shape (`GraphTransport` + `TokenProvider`) is reused; credential construction is not.

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
