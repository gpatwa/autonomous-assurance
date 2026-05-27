/**
 * NormalizedChange persistence.
 *
 * N1 + N2: deterministic change_id PK + UNIQUE (tenant, raw_event, change_type, target).
 * Re-normalizing the same raw event produces the same change_id, idempotent.
 *
 * The schema has both raw_events (FK target) and normalized_changes. For
 * Phase 1.5 the polling worker writes raw_events first; the pipeline worker
 * persists normalized_changes referencing them. For the in-process smoke
 * test, raw_events may not exist — `insertNormalizedChange` will fail the
 * FK unless the caller seeds raw_events first.
 *
 * The smoke test seeder uses `withAdminContext` to create matching
 * raw_events rows pointing to a synthetic blob URL.
 */

import type { PoolClient } from "pg";
import type { NormalizedChange } from "@kavachiq/schema";

export interface ListChangesOpts {
  limit?: number;
  offset?: number;
  changeType?: string;
}

export interface ListChangesResult {
  changes: NormalizedChange[];
  total: number;
}

/** List normalized changes descending by observed_at, RLS-scoped. */
export async function listNormalizedChanges(
  client: PoolClient,
  opts: ListChangesOpts = {},
): Promise<ListChangesResult> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.changeType) {
    params.push(opts.changeType);
    where.push(`change_type = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await client.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM normalized_changes ${whereClause}`,
    params,
  );
  const total = parseInt(countRow.rows[0]!.c, 10);

  params.push(limit, offset);
  const rows = await client.query<{ payload: NormalizedChange }>(
    `SELECT payload FROM normalized_changes ${whereClause}
     ORDER BY observed_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { changes: rows.rows.map((r) => r.payload), total };
}

export async function findNormalizedChangesByIds(
  client: PoolClient,
  changeIds: string[],
): Promise<NormalizedChange[]> {
  if (changeIds.length === 0) return [];
  const rows = await client.query<{ change_id: string; payload: NormalizedChange }>(
    `SELECT change_id, payload
     FROM normalized_changes
     WHERE change_id = ANY($1::text[])`,
    [changeIds],
  );
  const byId = new Map(rows.rows.map((row) => [row.change_id, row.payload]));
  return changeIds.map((id) => byId.get(id)).filter((c): c is NormalizedChange => !!c);
}

export interface InsertChangeResult {
  inserted: boolean;
}

export async function insertNormalizedChange(
  client: PoolClient,
  change: NormalizedChange,
  bundleId: string | null,
): Promise<InsertChangeResult> {
  const rawEventId = change.source.rawEventIds[0];
  if (!rawEventId) {
    throw new Error(
      `insertNormalizedChange: change ${change.changeId} has no rawEventIds[0]`,
    );
  }
  const result = await client.query(
    `INSERT INTO normalized_changes (
       change_id, tenant_id, raw_event_id, change_type, target_object_id,
       payload, bundle_id, observed_at, ingested_at, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
     )
     ON CONFLICT (change_id) DO UPDATE SET bundle_id = COALESCE(EXCLUDED.bundle_id, normalized_changes.bundle_id)`,
    [
      change.changeId,
      change.tenantId,
      rawEventId,
      change.changeType,
      change.target.objectId,
      change,
      bundleId,
      change.observedAt,
      change.ingestedAt,
      change.schemaVersion,
    ],
  );
  return { inserted: result.rowCount === 1 };
}
