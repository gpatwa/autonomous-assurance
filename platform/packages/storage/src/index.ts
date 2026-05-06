/**
 * @kavachiq/storage — Postgres + Blob clients with multi-tenant isolation.
 *
 * D2: every Postgres query runs with `app.tenant_id` set; RLS enforces
 *     tenant isolation at the database layer. Connection-pool middleware
 *     (forthcoming) refuses to lease a connection without a tenant context.
 * D3: Postgres for state; Blob for raw event archive + large baselines.
 * N1 + N2: deterministic IDs + ON CONFLICT DO NOTHING patterns live here.
 * N3: outbox publisher loop reads `outbox WHERE published_at IS NULL` and
 *     emits to Service Bus; marks `published_at = now()` on success.
 * N10: Blob is the immutable source of truth; replay reads from Blob.
 *
 * Migrations live under `migrations/000N_*.sql`. Applied via `psql -f` for
 * v1; a runner is forthcoming.
 *
 * This module is a skeleton awaiting week 1 implementation per
 * docs/MULTI_TENANT_ARCHITECTURE_DECISIONS.md §6.
 */

export {};
