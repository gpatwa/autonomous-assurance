# Phase 0 Bootstrap Status

**Date:** April 2026  
**Status:** Scaffolding complete. Ready for spike work and Phase 1 planning.

---

## What Was Created

| Item | Location | Status |
|------|----------|--------|
| Monorepo workspace | `platform/package.json`, `platform/tsconfig.base.json` | Ready |
| Shared schema package | `platform/packages/schema/` | Compiles cleanly. 14 enums, 6 shared types, 25 entities. |
| Core domain skeleton | `platform/packages/core/` | 8 placeholder modules. No logic yet. |
| API server skeleton | `platform/packages/api/` | Placeholder. No routes yet. |
| Workers skeleton | `platform/packages/workers/` | Placeholder. No jobs yet. |
| Execution service skeleton | `platform/packages/execution/` | Separate trust domain. 4 placeholder modules. |
| CLI skeleton | `platform/packages/cli/` | Placeholder. No commands yet. |
| Docker Compose | `platform/docker-compose.yml` | Azurite configured. Cosmos emulator documented. |
| Env example | `platform/.env.example` | Azurite + test tenant credential placeholders. |
| Fixtures directory | `platform/fixtures/canonical/` | README + placeholder JSON files. |
| Scripts directory | `platform/scripts/` | README with planned spike scripts. |
| Infra directory | `platform/infra/` | README with planned templates. |
| Platform README | `platform/README.md` | Quick start, package layout, trust boundary docs. |

## What Is Ready

- Schema types can be imported by any package (`import type { Incident } from "@kavachiq/schema"`)
- Azurite can be started with `docker compose up -d` in `platform/`
- The trust boundary between read-path and execution service is enforced in package dependencies

## What Is Still Placeholder

- All `packages/core/src/*/index.ts` modules are empty exports (no domain logic)
- `packages/api/` has no routes or server setup
- `packages/workers/` has no job handlers
- `packages/execution/` has no Graph API calls
- `packages/cli/` has no commands
- Fixture JSON files are empty arrays (populated from spike results in WI-11)

## Immediate Next Tasks

These are the first coding tasks after this bootstrap, aligned with the Phase 0 execution board:

1. **WI-01: Set up the Entra test tenant.** Create the tenant, populate with canonical scenario objects. Fill in `platform/.env.example` credentials.

2. **WI-05: Run the audit log completeness spike.** Write a script in `platform/scripts/` that uses SP-Read to fetch audit events from the test tenant. Analyze field coverage.

3. **WI-06: Run the Graph member removal spike.** Write a script in `platform/scripts/` that uses SP-Execute to test member removal reliability and idempotency.

4. **WI-11: Generate canonical fixture data.** After spikes complete, populate `platform/fixtures/canonical/*.json` with real observed event shapes.

## What Should NOT Be Done Yet

- Do not implement ingestion pipeline logic (Phase 1)
- Do not implement blast-radius traversal (Phase 2)
- Do not implement recovery plan generation (Phase 3)
- Do not implement Graph API write execution (Phase 4)
- Do not build the operator UI (Phase 2)
- Do not deploy to Azure (Phase 1+)
