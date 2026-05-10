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

export type IncidentStatus = "new" | "acknowledged" | "investigating" | "closed";

/**
 * Update incident status. RLS-scoped — call inside withTenantContext.
 * Syncs both the indexed column and the payload jsonb so reads stay consistent.
 * Returns true if found and updated; false if not visible (RLS / missing).
 */
export async function updateIncidentStatus(
  client: PoolClient,
  incidentId: string,
  status: IncidentStatus,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await client.query(
    `UPDATE incidents
     SET status     = $1,
         updated_at = now(),
         closed_at  = CASE WHEN $1 = 'closed' THEN now() ELSE closed_at END,
         payload    = jsonb_set(
                        jsonb_set(payload, '{status}',    to_jsonb($1::text)),
                        '{updatedAt}', to_jsonb($2::text)
                      )
     WHERE incident_id = $3
     RETURNING incident_id`,
    [status, now, incidentId],
  );
  return (result.rowCount ?? 0) === 1;
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

export interface ListIncidentsOpts {
  limit?: number;
  offset?: number;
  severity?: string;
}

export interface ListIncidentsResult {
  incidents: Incident[];
  total: number;
}

/** List incidents descending by detected_at, RLS-scoped. */
export async function listIncidents(
  client: PoolClient,
  opts: ListIncidentsOpts = {},
): Promise<ListIncidentsResult> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.severity) {
    params.push(opts.severity);
    where.push(`severity = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await client.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM incidents ${whereClause}`,
    params,
  );
  const total = parseInt(countRow.rows[0]!.c, 10);

  params.push(limit, offset);
  const rows = await client.query<{ payload: Incident }>(
    `SELECT payload FROM incidents ${whereClause}
     ORDER BY detected_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { incidents: rows.rows.map((r) => r.payload), total };
}
