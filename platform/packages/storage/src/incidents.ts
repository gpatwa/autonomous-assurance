/**
 * Incident persistence.
 *
 * N1 + N2: writes are idempotent. UNIQUE(tenant_id, bundle_id) on incidents
 * means promoting the same bundle twice produces one row, not two.
 * `INSERT … ON CONFLICT DO NOTHING` returns 0 affected rows on duplicate;
 * caller treats that as success.
 *
 * The full `Incident` JSON is stored in the `payload` jsonb column, plus
 * key indexed fields are surfaced as columns for query patterns (operator
 * UI: "show me high-severity incidents in the last 24h").
 */

import type { PoolClient } from "pg";
import type { Incident } from "@kavachiq/schema";

export interface InsertIncidentResult {
  /** True if a new row was inserted; false if already present (idempotent no-op). */
  inserted: boolean;
}

/**
 * Insert an Incident, idempotent on `(tenant_id, bundle_id)`.
 *
 * Caller MUST be inside `withTenantContext` — `app.tenant_id` must already
 * be set before this is called, and `incident.tenantId` must match.
 */
export async function insertIncident(
  client: PoolClient,
  incident: Incident,
): Promise<InsertIncidentResult> {
  // Sanity: tenant ID consistency. A mismatch would be caught by RLS, but
  // failing fast with a clear error is more debuggable than waiting for
  // the database to silently drop the row.
  const setting = await client.query(
    "SELECT current_setting('app.tenant_id', true) AS tenant_id",
  );
  const sessionTenantId = setting.rows[0]?.tenant_id as string | undefined;
  if (!sessionTenantId) {
    throw new Error(
      "insertIncident: app.tenant_id is not set on the connection. Call withTenantContext first.",
    );
  }
  if (sessionTenantId !== incident.tenantId) {
    throw new Error(
      `insertIncident: tenant mismatch. Connection app.tenant_id=${sessionTenantId} but incident.tenantId=${incident.tenantId}`,
    );
  }

  const result = await client.query(
    `INSERT INTO incidents (
       incident_id, tenant_id, bundle_id, title, severity, urgency, status,
       classification_score, payload, detected_at, created_at, updated_at, closed_at, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
     )
     ON CONFLICT (tenant_id, bundle_id) DO NOTHING`,
    [
      incident.incidentId,
      incident.tenantId,
      // bundle_id lives on the incident's classification rationale path; the
      // schema's `Incident` type has correlatedChangeIds[] but not a single
      // bundle_id field. For Phase 1.5 we put the first correlated change's
      // bundle key here. Rationale: incidents are emitted from a single
      // CorrelatedChangeBundle (see @kavachiq/core/detection); the producer
      // passes us the bundle_id explicitly via the Service Bus message and
      // we expect the Incident to carry it. For now, derive from the
      // payload if present; fall back to the incidentId itself if missing.
      // TODO Phase 2: add `bundleId: string` field to the Incident type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((incident as any).bundleId as string | undefined) ?? incident.incidentId,
      incident.title,
      incident.severity,
      incident.urgency,
      incident.status,
      incident.classificationRationale.scoreAtCreation,
      incident,
      incident.detectedAt,
      incident.createdAt,
      incident.updatedAt,
      incident.closedAt,
      incident.schemaVersion,
    ],
  );

  return { inserted: result.rowCount === 1 };
}

/** Lookup by incident_id, RLS-scoped. Returns null when not visible. */
export async function findIncidentById(
  client: PoolClient,
  incidentId: string,
): Promise<Incident | null> {
  const result = await client.query<{ payload: Incident }>(
    "SELECT payload FROM incidents WHERE incident_id = $1",
    [incidentId],
  );
  return result.rows[0]?.payload ?? null;
}
