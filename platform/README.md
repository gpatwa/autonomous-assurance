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
├── scripts/         Dev tooling and spike scripts
├── infra/           Azure deployment templates
└── docker-compose.yml  Local dev environment
```

## Trust Boundary

The `execution` package is the **only** package with access to write credentials (SP-Execute). It depends on `@kavachiq/schema` only. It does not depend on `core`, `api`, or `workers`. This boundary is enforced in `package.json` dependencies.

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for Azurite)
- An Entra test tenant (for Graph API calls)

### Setup

```bash
cd platform
npm install
docker compose up -d        # Start Azurite
cp .env.example .env.local  # Fill in test tenant credentials
```

### Build

```bash
npm run build               # Build all packages
npm run typecheck            # Type-check without emitting
```

### What Is Implemented

This is a **Phase 0 bootstrap skeleton**. No product features are implemented yet.

- [x] Shared schema package with canonical types and enums
- [x] Service skeleton structure with placeholder modules
- [x] Docker Compose with Azurite for local storage emulation
- [x] Fixture directory for canonical scenario data
- [ ] Actual ingestion logic (Phase 1)
- [ ] Actual blast-radius computation (Phase 2)
- [ ] Actual recovery planning (Phase 3)
- [ ] Actual execution logic (Phase 4)
- [ ] Operator UI (Phase 2)

## Architecture References

See `docs/` in the repo root for the full architecture package:
- `ARCHITECTURE_MEMO.md` — high-level system design
- `DATA_MODEL_AND_SCHEMA_SPECIFICATION.md` — canonical entity definitions (schema source of truth)
- `MVP_IMPLEMENTATION_ROADMAP.md` — build plan
- `PHASE0_EXECUTION_BOARD.md` — current sprint work items
