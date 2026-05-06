/**
 * polling-worker — Service Bus session-keyed consumer for `poll-tenant`.
 *
 * D4 + N7: receives messages session-keyed by tenant_id (FIFO per tenant,
 * fair across tenants). Each message body carries a PollTenantMessage with
 * the tenantId to poll.
 *
 * Per message:
 *   1. Parse body → extract tenantId
 *   2. Call pollTenantBatch (load creds → fetch Graph → archive → raw_events
 *      → normalize → enqueue process-events session-keyed)
 *   3. If hasMorePages: re-enqueue a follow-up poll-tenant message so the
 *      next page is fetched without delay
 *   4. Complete the message
 *
 * On parse error: dead-letter the message (bad shape, don't redeliver).
 * On poll error: abandon the message — Service Bus redelivers up to
 * maxDeliveryCount, then moves to DLQ. N2 idempotency makes re-poll safe.
 *
 * Graceful shutdown (N9): same pattern as pipeline-worker — stop() flips
 * `stopping`, closes active receiver + ServiceBusClient to interrupt the
 * deep AMQP await in acceptNextSession.
 */

import {
  ServiceBusClient,
  type ServiceBusReceivedMessage,
  type ServiceBusSessionReceiver,
} from "@azure/service-bus";
import type { Logger } from "@kavachiq/platform";
import { rootLogger } from "@kavachiq/platform";
import { pollTenantBatch } from "@kavachiq/orchestration";

const POLL_TENANT_QUEUE = "poll-tenant";

export interface PollTenantMessage {
  schemaVersion: 1;
  tenantId: string;
  /** Override initial lookback hours for this poll (default: 24). */
  initialLookbackHours?: number;
}

export interface PollingWorkerOptions {
  /** Service Bus connection string. Used both to consume poll-tenant and
   *  forwarded to pollTenantBatch to enqueue on process-events. */
  serviceBusConnectionString: string;
  /** Session idle timeout before releasing and grabbing the next. Default 30s. */
  sessionIdleTimeoutMs?: number;
  /** Graph page size forwarded to pollTenantBatch. Default 250. */
  pageSize?: number;
  logger?: Logger;
}

export interface PollingWorker {
  /** Run forever, processing sessions one at a time. Returns when stop() is called. */
  run(): Promise<void>;
  /** Initiate graceful shutdown. */
  stop(): Promise<void>;
}

export function createPollingWorker(opts: PollingWorkerOptions): PollingWorker {
  const log = opts.logger ?? rootLogger;
  const idleMs = opts.sessionIdleTimeoutMs ?? 30_000;

  const client = new ServiceBusClient(opts.serviceBusConnectionString);
  let stopping = false;
  let activeReceiver: ServiceBusSessionReceiver | null = null;

  async function processOne(
    receiver: ServiceBusSessionReceiver,
    msg: ServiceBusReceivedMessage,
  ): Promise<void> {
    let parsed: PollTenantMessage;
    try {
      parsed = msg.body as PollTenantMessage;
      if (!parsed || typeof parsed !== "object" || parsed.schemaVersion !== 1 || !parsed.tenantId) {
        throw new Error(
          `polling-worker: invalid message body shape (sessionId=${receiver.sessionId})`,
        );
      }
    } catch (err) {
      log.error("polling-worker: parse failed; sending to DLQ", { err: String(err) });
      await receiver.deadLetterMessage(msg, {
        deadLetterReason: "ParseFailed",
        deadLetterErrorDescription: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const { tenantId, initialLookbackHours } = parsed;

    try {
      const result = await pollTenantBatch({
        tenantId,
        serviceBusConnectionString: opts.serviceBusConnectionString,
        pageSize: opts.pageSize,
        ...(initialLookbackHours !== undefined ? { initialLookbackHours } : {}),
        logger: log,
      });

      log.info("polling-worker: poll complete", {
        tenantId,
        sessionId: receiver.sessionId,
        ...result,
      });

      // Re-enqueue immediately if Graph indicated more pages remain.
      // Complete the current message first so its lock doesn't expire.
      await receiver.completeMessage(msg);

      if (result.hasMorePages) {
        const sender = client.createSender(POLL_TENANT_QUEUE);
        try {
          await sender.sendMessages({
            body: { schemaVersion: 1 as const, tenantId },
            contentType: "application/json",
            sessionId: tenantId,
          });
          log.info("polling-worker: re-queued next page", { tenantId });
        } finally {
          await sender.close();
        }
      }
    } catch (err) {
      log.error("polling-worker: poll failed; abandoning message", {
        tenantId,
        sessionId: receiver.sessionId,
        err: err instanceof Error ? err.message : String(err),
      });
      await receiver.abandonMessage(msg);
    }
  }

  async function run(): Promise<void> {
    log.info("polling-worker: starting; entering session loop");

    while (!stopping) {
      let receiver: ServiceBusSessionReceiver | null = null;
      try {
        receiver = await client.acceptNextSession(POLL_TENANT_QUEUE, {
          maxAutoLockRenewalDurationInMs: idleMs * 4,
        });
        activeReceiver = receiver;
      } catch (err) {
        if (stopping) break;
        const msg = err instanceof Error ? err.message : String(err);
        if (/(no sessions|operation timed out|the operation has timed out)/i.test(msg)) {
          await sleep(2_000);
          continue;
        }
        log.error("polling-worker: acceptNextSession failed", { err: msg });
        await sleep(5_000);
        continue;
      }

      const sessionId = receiver.sessionId;
      log.debug("polling-worker: session acquired", { sessionId });

      try {
        while (!stopping) {
          const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: idleMs });
          if (messages.length === 0) break; // session idle; release
          await processOne(receiver, messages[0]!);
        }
      } finally {
        await receiver.close();
        activeReceiver = null;
        log.debug("polling-worker: session released", { sessionId });
      }
    }

    try {
      await client.close();
    } catch {
      /* may already be closed by stop() */
    }
    log.info("polling-worker: stopped");
  }

  async function stop(): Promise<void> {
    stopping = true;
    log.info("polling-worker: stop requested; closing active receiver + client");
    if (activeReceiver) {
      try {
        await activeReceiver.close();
      } catch {
        /* ignore */
      }
      activeReceiver = null;
    }
    // Closing the client interrupts acceptNextSession's deep AMQP await.
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }

  return { run, stop };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
