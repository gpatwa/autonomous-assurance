# Phase 0 Bootstrap Status

**Date:** April 2026
**Status:** Workspace installable and typechecking. Three Phase 0 spike utilities are real and runnable (WI-01 setup, WI-05 audit fetch, WI-06 member removal).

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
| Audit-log fetch utility | `platform/scripts/fetch-audit-events.ts` | Real SP-Read auth, real Graph calls, paged JSON output. Uses `@kavachiq/platform` for env/logger/correlation/errors. |
| Test-tenant setup utility | `platform/scripts/setup-test-tenant.ts` | Dry-run by default (`DRY_RUN=1` override). Uses `@kavachiq/platform` for env/logger/correlation/errors/dry-run. |
| Member-removal spike utility | `platform/scripts/test-member-removal.ts` | SP-Execute. 4 modes (`reliability` / `idempotency` / `timing` / `rate-limit`) + `all`. Dry-run default; `--apply` required for real DELETEs; `--dry-run` wins over `--apply`; `DRY_RUN=1` env forces dry-run. Structured JSON result (runMetadata, sampleCounts, latencySummary, rateLimit, attempts, observations, recommendations). |
| Graph transport | `platform/scripts/lib/transport.ts` | `GraphTransport`: `get`, `delete`, `getPaged`. Exposes Graph `request-id` / `client-request-id` / `Retry-After` on success and on `GraphRequestError`. Takes a `TokenProvider` — no secret awareness. |
| Graph credentials | `platform/scripts/lib/credentials.ts` | **Script-local** cert-or-secret construction. Reads env via `@kavachiq/platform/config`. Not in shared platform by design. |
| Docker Compose | `platform/docker-compose.yml` | Azurite configured |
| Env example | `platform/.env.example` | SP-Read + SP-Execute placeholders, both cert path and secret fallback |

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

### `npm run setup-test-tenant` (WI-01)

```bash
npm run setup-test-tenant                 # dry-run; reads-only, prints plan
npm run setup-test-tenant -- --apply      # real Graph writes where automated
```

Requires the same SP-Read env vars as above for the dry-run read paths.

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

- **Entra test tenant provisioning.** Create the tenant and register SP-Read +
  SP-Execute (WI-01/02/03). The setup script assumes the tenant exists.
- **Bulk user, group, and application creation.** `setup-test-tenant` logs
  existence counts and a "would create" delta; the actual POST /users,
  POST /groups, and POST /applications calls are not yet implemented and
  remain manual in the Entra admin portal.
- **Conditional Access policies** (`Finance-MFA-Bypass`, `Finance-Data-Restriction`)
  — kept manual in Phase 0 because policy misconfiguration can lock the tenant.
- **Teams + SharePoint** — create and link to the privileged group manually.
- **Client certificates for SP-Read / SP-Execute** — generate and register
  through the Entra admin portal or Azure CLI. Certificate path goes in
  `.env.local`.
- **WI-06 input data** — a group with real members for reliability/timing,
  plus a separate newline-separated file of already-absent member IDs for
  idempotency and rate-limit modes. `test-member-removal.ts` does not
  invent members; the operator supplies them.
- **Cosmos DB emulator** — not available on ARM64 Docker. Either run on x86
  Linux/WSL, use the native macOS emulator, or point at a dev Cosmos DB
  account. Documented in `docker-compose.yml`.

## Immediate Next Tasks

Aligned with `PHASE0_EXECUTION_BOARD.md`:

1. **Execute WI-06.** With SP-Execute credentials loaded in `.env.local` and a
   populated test tenant, run `test-member-removal.ts` in all four modes
   against three group types. Collect the four structured result files and
   write the WI-06 spike report directly from them.
2. **WI-01 finish:** complete manual tenant population (users, groups,
   privileged group, apps, CA policies, Teams, SharePoint). Re-run
   `setup-test-tenant` in dry-run to confirm counts match the canonical scenario.
3. **WI-02 / WI-03:** generate SP-Read and SP-Execute client certificates,
   record thumbprints, store the PEMs, update `.env.local`.
4. **WI-05:** execute the canonical scenario against the test tenant, wait
   15 minutes, run `fetch-audit-events` into `fixtures/canonical/raw-events.json`,
   analyze the completeness matrix.
5. **WI-11:** derive normalized fixture JSON from the captured raw events.

## What Should NOT Be Done Yet

- Do not implement ingestion pipeline logic (Phase 1)
- Do not implement blast-radius traversal (Phase 2)
- Do not implement recovery plan generation (Phase 3)
- Do not implement Graph API write execution (Phase 4)
- Do not build the operator UI (Phase 2)
- Do not deploy to Azure (Phase 1+)
