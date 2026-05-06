/**
 * Outbox pattern (N3).
 *
 * Producer (e.g., pipeline-worker creating an Incident) writes the entity
 * AND the outbox row in the same Postgres transaction:
 *
 *   await withTenantContext(tenantId, async (client) => {
 *     await insertIncident(client, incident);
 *     await enqueueOutboxEvent(client, "incident-created", { incidentId, … });
 *     // implicit COMMIT at end of withTenantContext
 *   });
 *
 * A separate publisher loop reads pending rows, emits to Service Bus, and
 * marks `published_at = now()`. Survives:
 *   - producer crashes between Incident insert and Service Bus emit
 *   - Service Bus broker outages (publisher backs off)
 *   - publisher crashes mid-batch (next pass picks up where it stopped)
 *
 * Reader functions (`fetchPendingOutbox`, `markOutboxPublished`,
 * `markOutboxFailure`) are admin-context (BYPASSRLS) so the publisher can
 * drain rows from any tenant in one pass.
 */

import type { PoolClient } from "pg";

export type OutboxEventType =
  | "incident-created"
  | "incident-status-changed"
  | "bundle-finalized"
  | "tenant-onboarded"
  | "tenant-suspended";

export interface EnqueueOutboxArgs {
  eventType: OutboxEventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

export interface EnqueueOutboxResult {
  outboxId: string; // bigserial, returned as string for safety
}

/**
 * Enqueue an outbox event in the current tenant context.
 *
 * Caller MUST be inside `withTenantContext` — RLS policy on outbox checks
 * `tenant_id = current_setting('app.tenant_id')::uuid` for both INSERT
 * and SELECT. This function relies on the tenant ID from the session
 * setting; the caller does not pass it explicitly to avoid drift.
 */
export async function enqueueOutboxEvent(
  client: PoolClient,
  args: EnqueueOutboxArgs,
): Promise<EnqueueOutboxResult> {
  const result = await client.query<{ outbox_id: string }>(
    `INSERT INTO outbox (tenant_id, event_type, payload)
     VALUES (current_setting('app.tenant_id')::uuid, $1, $2)
     RETURNING outbox_id::text`,
    [args.eventType, args.payload],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("enqueueOutboxEvent: insert returned no row (RLS blocked or DB issue)");
  }
  return { outboxId: row.outbox_id };
}

// ─── Reader / publisher API (admin context, BYPASSRLS) ──────────────────

export interface PendingOutboxRow {
  outboxId: string;
  tenantId: string;
  eventType: OutboxEventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
  createdAt: string;
  publishAttempts: number;
}

/**
 * Read up to `batchSize` unpublished outbox rows, oldest first. Caller MUST be
 * inside `withAdminContext` — RLS is bypassed so the publisher sees all tenants.
 */
export async function fetchPendingOutbox(
  client: PoolClient,
  batchSize: number,
): Promise<PendingOutboxRow[]> {
  const result = await client.query<{
    outbox_id: string;
    tenant_id: string;
    event_type: OutboxEventType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: Record<string, any>;
    created_at: string;
    publish_attempts: number;
  }>(
    `SELECT outbox_id::text, tenant_id::text, event_type, payload, created_at, publish_attempts
       FROM outbox
      WHERE published_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED`,
    [batchSize],
  );
  return result.rows.map((r) => ({
    outboxId: r.outbox_id,
    tenantId: r.tenant_id,
    eventType: r.event_type,
    payload: r.payload,
    createdAt: r.created_at,
    publishAttempts: r.publish_attempts,
  }));
}

/** Mark an outbox row as successfully published. Admin context required. */
export async function markOutboxPublished(
  client: PoolClient,
  outboxId: string,
): Promise<void> {
  await client.query(
    `UPDATE outbox
        SET published_at = now()
      WHERE outbox_id = $1::bigint AND published_at IS NULL`,
    [outboxId],
  );
}

/** Record a failure attempt on an outbox row (does not mark published). */
export async function markOutboxFailure(
  client: PoolClient,
  outboxId: string,
  errorMessage: string,
): Promise<void> {
  await client.query(
    `UPDATE outbox
        SET publish_attempts = publish_attempts + 1,
            last_publish_error = $2
      WHERE outbox_id = $1::bigint`,
    [outboxId, errorMessage],
  );
}
