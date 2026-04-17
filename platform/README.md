# KavachIQ Platform

Product backend for KavachIQ Autonomous Assurance. Lives alongside the marketing site in the repo root.

## Package Layout

```
platform/
├── packages/
│   ├── schema/      @kavachiq/schema     Shared types and enums (all services import this)
│   ├── core/        @kavachiq/core       Domain logic: ingestion, detection, blast-radius, planning
│   ├── api/         @kavachiq/api        API server (operator-facing)
│   ├── workers/     @kavachiq/workers    Background jobs: polling, normalization, snapshots
│   ├── execution/   @kavachiq/execution  SEPARATE TRUST DOMAIN. Write-path execution service.
│   └── cli/         @kavachiq/cli        Admin/test CLI
├── fixtures/        Canonical scenario test data
├── scripts/         Phase 0 spike utilities (tsx-run, not a workspace package)
├── infra/           Azure deployment templates
└── docker-compose.yml  Local dev environment
```

## Trust Boundary

The `execution` package is the **only** package with access to write credentials (SP-Execute). It depends on `@kavachiq/schema` only. It does not depend on `core`, `api`, or `workers`. This boundary is enforced in `package.json` dependencies.

## Quick Start

### Prerequisites

- Node.js 20+ (npm 10+)
- Docker (for Azurite)
- An Entra test tenant (for Graph API calls — required by `scripts/`)

### Install

```bash
cd platform
npm install                 # installs workspace packages + root tooling
docker compose up -d        # start Azurite
cp .env.example .env.local  # fill in test tenant credentials
```

### Build and typecheck

```bash
npm run build               # build all workspace packages
npm run typecheck           # type-check all workspaces + scripts
npm run typecheck:scripts   # type-check scripts only
npm run clean               # remove packages/*/dist
```

### Phase 0 spike utilities

Both scripts are run via `npm run` from `platform/`. They read credentials from
`.env.local` (falling back to `.env`).

**Audit log fetch (WI-05):**

```bash
# last 24h to stdout
npm run fetch-audit-events

# explicit window into a fixture file
npm run fetch-audit-events -- \
  --start 2026-04-14T00:00:00Z \
  --end   2026-04-15T00:00:00Z \
  --output fixtures/canonical/raw-events.json
```

**Test tenant setup (WI-01):**

```bash
npm run setup-test-tenant                 # dry-run (read-only, prints plan)
npm run setup-test-tenant -- --apply      # real Graph writes (partially automated)
```

`setup-test-tenant` is a *partial* bootstrap. It queries existence of users,
groups, the privileged group, apps, and CA policies, and logs what is still
manual. Conditional Access, Teams, and SharePoint provisioning stay manual in
Phase 0. See the script's TODOs.

## What Is Implemented

This is a **Phase 0 bootstrap**. Product features are not implemented.

Real:
- [x] Workspace installs cleanly with `npm install`
- [x] `npm run build` and `npm run typecheck` pass across all workspaces
- [x] `@kavachiq/schema` compiles and is importable by the other packages
- [x] Azurite runs locally via `docker compose`
- [x] Audit-log fetch utility (`scripts/fetch-audit-events.ts`) — real SP-Read auth, real Graph calls, paginated JSON output
- [x] Partial test-tenant setup utility (`scripts/setup-test-tenant.ts`) — dry-run by default, identifies gaps, logs TODOs

Placeholder:
- [ ] `@kavachiq/core/*` modules export nothing yet (Phase 1-3)
- [ ] `@kavachiq/api` has no routes
- [ ] `@kavachiq/workers` has no job handlers
- [ ] `@kavachiq/execution` has no Graph writes
- [ ] `@kavachiq/cli` has no commands
- [ ] Fixture JSON files are empty (populated by WI-11 after WI-05)
- [ ] Conditional Access / Teams / SharePoint provisioning is manual

## Architecture References

See `docs/` in the repo root:
- `ARCHITECTURE_MEMO.md` — high-level system design
- `DATA_MODEL_AND_SCHEMA_SPECIFICATION.md` — canonical entity definitions
- `ENGINEERING_BOOTSTRAP_DECISIONS.md` — locked Phase 0 choices
- `MVP_IMPLEMENTATION_ROADMAP.md` — build plan
- `PHASE0_EXECUTION_BOARD.md` — current sprint work items
- `PHASE0_BOOTSTRAP_STATUS.md` — what is real vs placeholder right now
