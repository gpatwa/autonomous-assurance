/**
 * Outbox publisher (N3 consumer half).
 *
 * Drains pending outbox rows to Service Bus. Runs as `withAdminContext`
 * (BYPASSRLS) so it can see all tenants in one batch. For each row:
 *   1. Send to Service Bus (notify-operator queue, no session)
 *   2. Mark published_at = now() in Postgres
 *   3. On failure, increment publish_attempts + record last_publish_error;
 *      row stays pending for the next pass.
 *
 * `FOR UPDATE SKIP LOCKED` in fetchPendingOutbox lets multiple drainer
 * processes run safely in parallel — each picks a disjoint batch.
 *
 * Caller is responsible for invoking drainOutboxBatch periodically. For
 * v1 the pipeline-worker calls it inline after processing each Service
 * Bus message; a dedicated outbox-publisher worker can replace that loop
 * later for higher throughput.
 */

import type { ServiceBusSender } from "@azure/service-bus";
import type { Logger } from "@kavachiq/platform";
import { rootLogger } from "@kavachiq/platform";
import {
  fetchPendingOutbox,
  markOutboxFailure,
  markOutboxPublished,
  withAdminContext,
} from "@kavachiq/storage";

const DEFAULT_BATCH_SIZE = 50;

export interface DrainOutboxOptions {
  /** Service Bus sender for the `notify-operator` queue. */
  sender: ServiceBusSender;
  /** Max rows to drain per call. Default 50. */
  batchSize?: number;
  logger?: Logger;
}

export interface DrainOutboxResult {
  drained: number;
  failed: number;
  pendingRemaining: boolean;
}

/**
 * Drain one batch of pending outbox rows. Returns counts so the caller can
 * decide whether to call again immediately (pendingRemaining=true) or wait
 * for the next scheduled tick.
 */
export async function drainOutboxBatch(
  opts: DrainOutboxOptions,
): Promise<DrainOutboxResult> {
  const log = opts.logger ?? rootLogger;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  let drained = 0;
  let failed = 0;
  let fetched = 0;

  await withAdminContext(async (client) => {
    const rows = await fetchPendingOutbox(client, batchSize);
    fetched = rows.length;
    for (const row of rows) {
      try {
        await opts.sender.sendMessages({
          body: {
            outboxId: row.outboxId,
            tenantId: row.tenantId,
            eventType: row.eventType,
            payload: row.payload,
            createdAt: row.createdAt,
          },
          contentType: "application/json",
          // Notification fanout — no session needed (per architecture D4).
          subject: row.eventType,
        });
        await markOutboxPublished(client, row.outboxId);
        drained += 1;
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        log.error("outbox-drainer: send failed", {
          outboxId: row.outboxId,
          eventType: row.eventType,
          error: msg,
        });
        await markOutboxFailure(client, row.outboxId, msg);
      }
    }
  });

  return { drained, failed, pendingRemaining: fetched === batchSize };
}
