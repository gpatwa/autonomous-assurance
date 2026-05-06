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
