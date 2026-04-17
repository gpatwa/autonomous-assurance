# Phase 0 Bootstrap Status

**Date:** April 2026
**Status:** Workspace installable and typechecking. Four Phase 0 spike utilities are real and runnable (WI-01/02/03 setup-and-verify, WI-05 audit fetch, WI-05 orchestration, WI-06 member removal).

---

## What Is Real

| Item | Location | Status |
|------|----------|--------|
| Monorepo workspace | `platform/package.json`, `platform/tsconfig.base.json` | `npm install` succeeds, workspace symlinks resolve |
| Shared schema package | `platform/packages/schema/` | Compiles cleanly. 14 enums, 6 shared types, 25 entities |
| Shared platform package | `platform/packages/platform/` | `config` / `observability` / `errors` / `utils` subpaths. Zero third-party runtime deps. |
| Cross-package imports | `@kavachiq/schema` + `@kavachiq/platform` resolve across workspaces | Resolves via npm workspaces |
| Root build | `npm run build` | Builds all workspace packages |
| Root typecheck | `npm run typecheck` | Type-checks all workspaces plus `scripts/` |
| Test-tenant setup + verification | `platform/scripts/setup-test-tenant.ts` | Two modes: `summary` (read-only snapshot + SP-Read/Execute/Setup probes) and `setup` (idempotent population via SP-Setup, dry-run default, `--apply` opts in). Handles WI-01 (population) and contributes to WI-02 / WI-03 (SP verification). Structured result includes `spVerification`, `canonicalObjects`, `discoveredObjectIds`, `manualFollowUp`, `recommendedNextCommands`. |
| Audit-log fetch utility | `platform/scripts/fetch-audit-events.ts` | SP-Read, paged JSON output. |
| WI-05 orchestrator | `platform/scripts/run-audit-completeness-spike.ts` | Checklist → confirmation → propagation wait → fetch → 4-class completeness analysis. Writes `raw-events.json`, `audit-completeness-matrix.json`, and `audit-completeness-summary.md` to `--output-dir`. |
| Member-removal spike utility | `platform/scripts/test-member-removal.ts` | SP-Execute. 4 modes (`reliability` / `idempotency` / `timing` / `rate-limit`) + `all`. Dry-run default; `--apply` required for real DELETEs. |
| Graph transport | `platform/scripts/lib/transport.ts` | `GraphTransport`: `get`, `delete`, `post`, `getPaged`. Exposes Graph `request-id` / `client-request-id` / `Retry-After`. Takes a `TokenProvider` — no secret awareness. |
| Graph credentials | `platform/scripts/lib/credentials.ts` | **Script-local** cert-or-secret construction for SP-Read, SP-Execute, and SP-Setup. Not in shared platform by design. |
| Runbook orchestration helper | `platform/scripts/lib/runbook.ts` | Human-in-the-loop pattern: three step kinds (`automatic`, `manual`, `approval-required`); `requiresApply` gates mutations; TTY prompts or `--confirm-manual-step` / `--confirm-all-manual` for non-interactive; abort-on-failure with structured trail. Script-local; promote when a second non-script consumer appears. |
| Docker Compose | `platform/docker-compose.yml` | Azurite configured |
| Env example | `platform/.env.example` | SP-Read, SP-Execute, and SP-Setup placeholders (cert + secret fallback), plus `TENANT_DOMAIN` and `TENANT_SETUP_INITIAL_PASSWORD` for user creation |

## What Is Still Placeholder

- All `packages/core/src/*/index.ts` modules export empty (no domain logic)
- `packages/api/` has no routes or server setup
- `packages/workers/` has no job handlers
- `packages/execution/` has no Graph API calls
- `packages/cli/` has no commands
- Fixture JSON files are empty arrays (populated from spike results in WI-11)

## How To Run The Workspace Bootstrap

```bash
cd platform
npm install
docker compose up -d        # optional; needed for anything that touches Azurite
cp .env.example .env.local  # fill in real tenant values before the scripts
npm run typecheck
npm run build
```

## Human-in-the-loop automation pattern

KavachiQ's posture is recommendation-first and operator-safe. Phase 0
orchestration scripts (`setup-test-tenant`, `run-audit-completeness-spike`)
model this explicitly: each script builds a **runbook** of classified steps.
Safe reads and verifications are automatic and always run. Mutating writes
are automatic but gated by `requiresApply` — skipped unless `--apply` is
passed. Risky tenant-sensitive actions (Conditional Access, Teams,
SharePoint, admin consent, the WI-05 canonical mutations) are modeled as
`manual` or `approval-required` steps with clear instructions; they are
**not** silently automated. Operators confirm either interactively on TTY
or non-interactively via `--confirm-manual-step <id>` / `--confirm-all-manual`.

The pattern is script-local (`platform/scripts/lib/runbook.ts`); it is not
a workflow engine and has no persistence, retries, or branching. Promotion
to `@kavachiq/platform` waits for a second non-script consumer.

## Shared Platform Usage In Scripts

Both scripts now route through `@kavachiq/platform`:

- **Env loading:** `loadDotenvCascade()` replaces ad-hoc `dotenv` calls.
- **Required env:** `requireEnv(name)` throws `ConfigError` → exit code `78`.
- **Logger:** `createLogger({ bindings: { script, runId } })`; output is JSON-line to **stderr** (so `fetch-audit-events` stdout stays pipe-safe).
- **Correlation:** `withContext({ correlationId: newCorrelationId() }, runScript)` wraps each script entry; every log line carries `correlationId` automatically.
- **Dry-run:** `parseDryRunFlag(argv)` handles `--apply` and honours `DRY_RUN=1` as an ops override.
- **Errors:** `PlatformError` / `ConfigError` / `isPlatformError` + `ExitCodes` map script failures to canonical exit codes (`0` / `1` / `2` / `78`).

### Trust-boundary split

- `scripts/lib/transport.ts` — pure Graph HTTP. Imports only `@kavachiq/platform`. No `@azure/identity`. No env reads.
- `scripts/lib/credentials.ts` — SP cert/secret resolution with `@azure/identity`. **Stays local.** Never moves into `@kavachiq/platform`, `core`, `api`, `workers`, or `execution`. The execution service will ship its own `credentials.ts` at its edge.

## How To Run The Scripts

All scripts read `.env.local` first, then `.env`. They fail fast with a clear
message and exit `78` if credentials are missing.

### `npm run fetch-audit-events` (WI-05)

```bash
# last 24h, prints JSON to stdout
npm run fetch-audit-events

# explicit window, saved to a fixture file
npm run fetch-audit-events -- \
  --start 2026-04-14T00:00:00Z \
  --end   2026-04-15T00:00:00Z \
  --output fixtures/canonical/raw-events.json
```

Requires: `SP_READ_TENANT_ID`, `SP_READ_CLIENT_ID`, and either
`SP_READ_CERTIFICATE_PATH` (preferred) or `SP_READ_CLIENT_SECRET` (early-Phase-0 fallback).

### `npm run setup-test-tenant` (WI-01 / WI-02 / WI-03)

Two modes. Summary is read-only and always safe. Setup is idempotent;
dry-run is the default, `--apply` opts in to writes. Five manual runbook
steps cover CA policies / Teams / SharePoint / admin consent / scenario
trigger — operator confirms via `--confirm-manual-step <id>` or
`--confirm-all-manual`.

```bash
# Snapshot + verify all three principals (SP-Read, SP-Execute, SP-Setup).
npm run setup-test-tenant -- --mode summary --output ./wi01/summary.json

# Compute the delta between tenant and canonical targets (no writes).
npm run setup-test-tenant -- --mode setup --output ./wi01/plan.json

# Create missing users/groups/apps; mark all manual follow-ups as confirmed.
npm run setup-test-tenant -- --mode setup --apply \
  --confirm-all-manual --output ./wi01/applied.json

# Or pre-confirm specific manual steps:
npm run setup-test-tenant -- --mode setup --apply \
  --confirm-manual-step ca-policies \
  --confirm-manual-step admin-consent \
  --output ./wi01/applied.json
```

Summary requires only SP-Read. Setup `--apply` additionally requires:
`SP_SETUP_*` env vars (User/Group/Application ReadWrite.All +
GroupMember.ReadWrite.All), plus `TENANT_DOMAIN` and
`TENANT_SETUP_INITIAL_PASSWORD`.

The structured result embeds the full `runbook` trail: each step's status,
`confirmedBy`, `skipReason`, and any error. Inspect
`result.runbook.steps[*]` to see exactly which steps executed vs skipped vs
were confirmed.

### `npm run audit-completeness-spike` (WI-05 orchestration)

Nine-step runbook. Four **approval-required** steps confirm the four
canonical mutations were executed; the remaining five automatic steps
capture the window, wait for propagation, fetch, analyze, and write
artifacts. On TTY the script prompts interactively per mutation; non-TTY
environments use `--confirm-manual-step <id>` (repeatable) or
`--confirm-all-manual` (alias: legacy `--confirm-mutations`).

Outputs written to `--output-dir`:

- `raw-events.json` — paged Graph audit events
- `audit-completeness-matrix.json` — 4-class findings
- `audit-completeness-summary.md` — directly quotable into the WI-05 report
- `run-result.json` — full runbook trail (correlation, step statuses, outputs)

```bash
# Full interactive flow: prints checklist, prompts per mutation, 15-min wait, fetch, analyze.
npm run audit-completeness-spike -- --output-dir ./wi05

# Non-interactive: pre-confirm every approval-required step.
npm run audit-completeness-spike -- --output-dir ./wi05 --confirm-all-manual

# Pre-confirm specific mutations (e.g. group membership + CA only):
npm run audit-completeness-spike -- --output-dir ./wi05 \
  --confirm-manual-step confirm-M1-group-membership \
  --confirm-manual-step confirm-M2-conditional-access

# Known window; confirm / wait steps are auto-skipped.
npm run audit-completeness-spike -- \
  --start 2026-04-15T12:00:00Z --end 2026-04-15T12:30:00Z \
  --output-dir ./wi05

# Re-analyze a previously-captured raw-events.json without re-fetching.
npm run audit-completeness-spike -- --output-dir ./wi05 --skip-fetch

# Print the canonical mutation checklist and exit.
npm run audit-completeness-spike -- --mutation-checklist
```

Requires SP-Read. Does not issue mutations — the operator runs those with
the agent-identified SP per the printed checklist.

### `npm run test-member-removal` (WI-06)

The only script that uses SP-Execute. Dry-run default — `--apply` is
required to send real DELETEs.

```bash
# Reliability: 60 removals across 3 group types (3 runs × 20 members each).
npm run test-member-removal -- \
  --mode reliability \
  --group-id <groupObjectId> \
  --members-file ./wi06/reliability-group1.txt \
  --apply \
  --output ./wi06/reliability-group1.json

# Idempotency: 10 DELETEs of already-absent members; expect 404 every time.
npm run test-member-removal -- \
  --mode idempotency \
  --group-id <groupObjectId> \
  --members-file ./wi06/absent-members.txt \
  --apply \
  --output ./wi06/idempotency.json

# Timing: same loop, emphasises latency summary (p50/p95/p99).
npm run test-member-removal -- --mode timing --group-id <id> \
  --members-file ./wi06/reliability-group1.txt --apply \
  --output ./wi06/timing.json

# Rate-limit: controlled burst of 50 DELETEs; stops on first 429.
npm run test-member-removal -- --mode rate-limit --group-id <id> \
  --members-file ./wi06/absent-members.txt --burst-size 50 --apply \
  --output ./wi06/rate-limit.json
```

Requires: `SP_EXECUTE_TENANT_ID`, `SP_EXECUTE_CLIENT_ID`, and either
`SP_EXECUTE_CERTIFICATE_PATH` (preferred) or `SP_EXECUTE_CLIENT_SECRET`.
SP-Execute must have `GroupMember.ReadWrite.All` only.

**Evidence collected** per attempt: HTTP status, Graph `request-id` and
`client-request-id`, `Retry-After` on 429, elapsed ms, outcome
classification (`removed` / `already-absent` / `failed` / `unknown`) plus
an `errorCategory` on failure. The structured JSON output is complete
enough for the WI-06 spike report to be written directly from it.

## What Still Requires Manual Setup (Phase 0)

- **Entra test tenant provisioning itself.** Create the tenant and register
  SP-Read + SP-Execute + SP-Setup (the third is new). The setup script
  assumes the tenant and the three app registrations exist.
- **Conditional Access policies** (`Finance-MFA-Bypass`, `Finance-Data-Restriction`)
  — kept manual because misconfiguration can lock the tenant.
- **Teams team (`Finance-Team`) + SharePoint site provisioning** — linked to
  the privileged group; still portal-driven.
- **Admin consent** for app registrations created by `setup-test-tenant`.
- **WI-05 canonical mutations.** `run-audit-completeness-spike` prints the
  checklist; triggering the four mutations with the agent-identified SP
  remains manual so the audit events carry the correct `initiatedBy.app`.
- **Client certificates for SP-Read / SP-Execute / SP-Setup** — generate and
  register through the Entra admin portal or Azure CLI. Certificate paths go
  in `.env.local`.
- **WI-06 input data** — a group with real members for reliability/timing,
  plus a separate newline-separated file of already-absent member IDs for
  idempotency and rate-limit modes. `test-member-removal.ts` does not
  invent members; the operator supplies them.
- **Cosmos DB emulator** — not available on ARM64 Docker. Either run on x86
  Linux/WSL, use the native macOS emulator, or point at a dev Cosmos DB
  account. Documented in `docker-compose.yml`.

## Immediate Next Tasks

Aligned with `PHASE0_EXECUTION_BOARD.md`:

1. **Populate the test tenant end-to-end using the new automation.**
   - Register SP-Setup (new) with User/Group/Application ReadWrite.All + GroupMember.ReadWrite.All.
   - Fill `.env.local` with SP-Read + SP-Execute + SP-Setup creds, plus
     `TENANT_DOMAIN` and `TENANT_SETUP_INITIAL_PASSWORD`.
   - Run `npm run setup-test-tenant -- --mode summary` to verify all three principals.
   - Run `npm run setup-test-tenant -- --mode setup --apply` to create the
     50 users, 19 groups, privileged group, 4 base members, and 10 apps.
   - Do the remaining manual items (CA policies, Teams, SharePoint, admin
     consent) — tracked in `result.manualFollowUp`.
2. **Execute WI-05 via `npm run audit-completeness-spike`.**
   - Default interactive flow prints the checklist, waits 15 minutes after
     the operator confirms mutations, fetches the window, and writes
     `raw-events.json`, `audit-completeness-matrix.json`, and
     `audit-completeness-summary.md`. The markdown is directly quotable
     into the WI-05 spike report.
3. **Execute WI-06 via `npm run test-member-removal`** across all four modes
   and three group types to produce the member-removal spike evidence.
4. **WI-11:** derive normalized fixture JSON from the captured raw events.

## What Should NOT Be Done Yet

- Do not implement ingestion pipeline logic (Phase 1)
- Do not implement blast-radius traversal (Phase 2)
- Do not implement recovery plan generation (Phase 3)
- Do not implement Graph API write execution (Phase 4)
- Do not build the operator UI (Phase 2)
- Do not deploy to Azure (Phase 1+)
