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
 * A separate publisher loop (in @kavachiq/orchestration, future) reads
 * `outbox WHERE published_at IS NULL`, emits to Service Bus, and marks
 * `published_at = now()`. Survives:
 *   - producer crashes between Incident insert and Service Bus emit
 *   - Service Bus broker outages (publisher backs off)
 *   - publisher crashes mid-batch (next pass picks up where it stopped)
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
