/**
 * Correlated change bundle persistence.
 *
 * N1 + N2: insertCorrelatedChangeBundle is idempotent on bundle_id (PK).
 * Same bundle re-emitted (e.g., correlator re-run) produces no duplicate.
 */

import type { PoolClient } from "pg";
import type { CorrelatedChangeBundle } from "@kavachiq/schema";

export interface InsertBundleResult {
  inserted: boolean;
}

export async function insertCorrelatedChangeBundle(
  client: PoolClient,
  bundle: CorrelatedChangeBundle,
): Promise<InsertBundleResult> {
  const result = await client.query(
    `INSERT INTO correlated_change_bundles (
       bundle_id, tenant_id, primary_actor_id, primary_actor_type,
       affected_object_ids, change_types, time_range_start, time_range_end,
       incident_candidate_score, status, finalized_at, payload, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
     )
     ON CONFLICT (bundle_id) DO NOTHING`,
    [
      bundle.bundleId,
      bundle.tenantId,
      bundle.primaryActor.id,
      bundle.primaryActor.type,
      bundle.affectedObjectIds,
      bundle.changeTypes,
      bundle.timeRange.start,
      bundle.timeRange.end,
      bundle.incidentCandidateScore,
      bundle.status,
      bundle.finalizedAt,
      bundle,
      bundle.schemaVersion,
    ],
  );
  return { inserted: result.rowCount === 1 };
}
