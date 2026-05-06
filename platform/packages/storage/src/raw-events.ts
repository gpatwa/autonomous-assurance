/**
 * Raw event index persistence.
 *
 * For Phase 1.5 / week 2, the polling worker writes here after archiving
 * RawEvent[] JSON to Blob. The schema has FK from normalized_changes →
 * raw_events, so this row must exist before the normalizer runs.
 *
 * For the in-process smoke test, the seeder writes a single synthetic
 * raw_events row pointing at a fake blob URL — the pipeline doesn't need
 * to actually read the blob, just satisfy the FK.
 */

import type { PoolClient } from "pg";

export interface InsertRawEventArgs {
  rawEventId: string;
  tenantId: string;
  microsoftEventId: string;
  blobUrl: string;
  sourceSystem: "entra-audit" | "m365-audit" | "graph-webhook" | "graph-api-read";
  observedAt: string;
}

export interface InsertRawEventResult {
  inserted: boolean;
}

export async function insertRawEvent(
  client: PoolClient,
  args: InsertRawEventArgs,
): Promise<InsertRawEventResult> {
  const result = await client.query(
    `INSERT INTO raw_events (
       raw_event_id, tenant_id, microsoft_event_id, blob_url, source_system,
       observed_at, processing_status, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, 'pending', 1
     )
     ON CONFLICT (raw_event_id) DO NOTHING`,
    [
      args.rawEventId,
      args.tenantId,
      args.microsoftEventId,
      args.blobUrl,
      args.sourceSystem,
      args.observedAt,
    ],
  );
  return { inserted: result.rowCount === 1 };
}
