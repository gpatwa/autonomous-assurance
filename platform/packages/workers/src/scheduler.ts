/**
 * Polling scheduler — enqueues `poll-tenant` messages for every active tenant
 * on a fixed interval.
 *
 * Runs as a background task alongside the polling worker's consumer loop.
 * Each tick does:
 *   1. SELECT tenant_id FROM tenants WHERE status = 'active'  (admin context)
 *   2. Send one poll-tenant Service Bus message per tenant (session-keyed)
 *
 * Design notes:
 *   - No "last polled" gate here — the polling driver's cursor (polling_state)
 *     handles idempotency. Sending a duplicate poll-tenant message is safe:
 *     the worker fetches only events newer than the last cursor.
 *   - Session-keyed messages ensure FIFO per tenant; if a tenant is already
 *     being processed, the new message queues behind it.
 *   - Default interval: 15 minutes.
 */

import { ServiceBusClient } from "@azure/service-bus";
import type { Logger } from "@kavachiq/platform";
import { rootLogger } from "@kavachiq/platform";
import { listActiveTenantIds, withAdminContext } from "@kavachiq/storage";

const POLL_TENANT_QUEUE = "poll-tenant";

export interface SchedulerOptions {
  serviceBusConnectionString: string;
  intervalMs?: number;
  logger?: Logger;
}

export interface Scheduler {
  start(): void;
  stop(): void;
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  const log = opts.logger ?? rootLogger;
  const intervalMs = opts.intervalMs ?? 15 * 60 * 1000;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick(): Promise<void> {
    let tenantIds: string[];
    try {
      tenantIds = await withAdminContext(listActiveTenantIds);
    } catch (err) {
      log.error("scheduler: failed to list active tenants", { err: String(err) });
      return;
    }

    if (tenantIds.length === 0) {
      log.debug("scheduler: no active tenants to schedule");
      return;
    }

    const sb = new ServiceBusClient(opts.serviceBusConnectionString);
    const sender = sb.createSender(POLL_TENANT_QUEUE);
    try {
      for (const tenantId of tenantIds) {
        await sender.sendMessages({
          body: { schemaVersion: 1 as const, tenantId },
          contentType: "application/json",
          sessionId: tenantId,
        });
      }
      log.info("scheduler: enqueued poll-tenant for all active tenants", {
        count: tenantIds.length,
      });
    } catch (err) {
      log.error("scheduler: failed to enqueue poll messages", { err: String(err) });
    } finally {
      await sender.close().catch(() => undefined);
      await sb.close().catch(() => undefined);
    }
  }

  return {
    start() {
      log.info("scheduler: starting", { intervalMs });
      // Run once immediately on startup, then on interval.
      void tick();
      timer = setInterval(() => void tick(), intervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        log.info("scheduler: stopped");
      }
    },
  };
}
