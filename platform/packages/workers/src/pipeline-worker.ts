/**
 * pipeline-worker — Service Bus session-keyed consumer for `process-events`.
 *
 * D4 + N7: receives messages session-keyed by tenant_id (FIFO per tenant,
 * fair across tenants). Each message body carries
 * @kavachiq/orchestration's ProcessEventsMessage shape.
 *
 * Per message:
 *   1. Parse body
 *   2. Call processEventsMessage (loads tenant policy → correlate → detect →
 *      persist Incident + outbox row in same TX)
 *   3. drainOutboxBatch (best-effort — failure is OK; another pass picks up)
 *   4. complete the message on Service Bus
 *
 * On error in (1) or (2): abandon the message — Service Bus redelivers up
 * to maxDeliveryCount, then it lands in the DLQ.
 *
 * Sessions: this version uses `acceptNextSession` to grab the next
 * available session, processes its messages until it goes idle for
 * `sessionIdleTimeoutMs`, releases it, and grabs the next one. That gives
 * round-robin fairness across tenants (a busy tenant doesn't pin a worker).
 *
 * Graceful shutdown (N9): `stop()` flips ready=false, stops accepting new
 * sessions, waits for in-flight to complete, closes Service Bus + pool.
 */

import {
  ServiceBusClient,
  type ServiceBusReceivedMessage,
  type ServiceBusReceiver,
  type ServiceBusSender,
  type ServiceBusSessionReceiver,
} from "@azure/service-bus";
import type { Logger } from "@kavachiq/platform";
import { rootLogger } from "@kavachiq/platform";
import {
  drainOutboxBatch,
  processEventsMessage,
  type ProcessEventsMessage,
} from "@kavachiq/orchestration";

const PROCESS_EVENTS_QUEUE = "process-events";
const NOTIFY_OPERATOR_QUEUE = "notify-operator";

export interface PipelineWorkerOptions {
  /** Service Bus connection string. (Future: managed identity.) */
  serviceBusConnectionString: string;
  /** When a session goes idle for this long, release and grab another. Default 30s. */
  sessionIdleTimeoutMs?: number;
  /** Drain outbox batches of this size after each message. Default 50. */
  outboxBatchSize?: number;
  logger?: Logger;
}

export interface PipelineWorker {
  /** Run forever, processing sessions one at a time. Returns when stop() is called. */
  run(): Promise<void>;
  /** Initiate graceful shutdown. */
  stop(): Promise<void>;
}

export function createPipelineWorker(
  opts: PipelineWorkerOptions,
): PipelineWorker {
  const log = opts.logger ?? rootLogger;
  const idleMs = opts.sessionIdleTimeoutMs ?? 30_000;
  const outboxBatch = opts.outboxBatchSize ?? 50;

  const client = new ServiceBusClient(opts.serviceBusConnectionString);
  let sender: ServiceBusSender | null = null;
  let stopping = false;
  let activeReceiver: ServiceBusReceiver | ServiceBusSessionReceiver | null = null;

  async function processOne(receiver: ServiceBusSessionReceiver, msg: ServiceBusReceivedMessage): Promise<void> {
    let parsed: ProcessEventsMessage;
    try {
      parsed = msg.body as ProcessEventsMessage;
      if (!parsed || typeof parsed !== "object" || parsed.schemaVersion !== 1) {
        throw new Error(
          `pipeline-worker: invalid message body shape (sessionId=${receiver.sessionId}, messageId=${msg.messageId})`,
        );
      }
    } catch (err) {
      log.error("pipeline-worker: parse failed; sending to DLQ", { err: String(err) });
      await receiver.deadLetterMessage(msg, {
        deadLetterReason: "ParseFailed",
        deadLetterErrorDescription: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    try {
      const result = await processEventsMessage(parsed, { logger: log });
      log.info("pipeline-worker: processed", {
        tenantId: parsed.tenantId,
        sessionId: receiver.sessionId,
        ...result,
      });
      // Drain outbox best-effort. Failure isn't fatal — next pass picks up.
      if (sender) {
        try {
          const drain = await drainOutboxBatch({
            sender,
            batchSize: outboxBatch,
            logger: log,
          });
          if (drain.drained > 0 || drain.failed > 0) {
            log.info("pipeline-worker: drained outbox", {
              drained: drain.drained,
              failed: drain.failed,
              pendingRemaining: drain.pendingRemaining,
            });
          }
        } catch (drainErr) {
          log.warn("pipeline-worker: outbox drain failed (will retry next pass)", {
            err: String(drainErr),
          });
        }
      }
      await receiver.completeMessage(msg);
    } catch (err) {
      log.error("pipeline-worker: handler failed; abandoning message", {
        err: String(err),
        sessionId: receiver.sessionId,
        messageId: msg.messageId,
      });
      await receiver.abandonMessage(msg);
    }
  }

  async function run(): Promise<void> {
    sender = client.createSender(NOTIFY_OPERATOR_QUEUE);
    log.info("pipeline-worker: starting; entering session loop");

    while (!stopping) {
      let receiver: ServiceBusSessionReceiver | null = null;
      try {
        // acceptNextSession blocks until a session is available or operationTimeout.
        // We use a short operationTimeout so SIGTERM is handled promptly.
        receiver = await client.acceptNextSession(PROCESS_EVENTS_QUEUE, {
          maxAutoLockRenewalDurationInMs: idleMs * 4,
        });
        activeReceiver = receiver;
      } catch (err) {
        // No session available, or transient broker error. Brief wait, retry.
        if (stopping) break;
        // The SDK throws on no-session; treat as expected idle.
        const msg = err instanceof Error ? err.message : String(err);
        if (/(no sessions|operation timed out|the operation has timed out)/i.test(msg)) {
          // Idle — quick wait, then retry.
          await sleep(2_000);
          continue;
        }
        log.error("pipeline-worker: acceptNextSession failed", { err: msg });
        await sleep(5_000);
        continue;
      }

      const sessionId = receiver.sessionId;
      log.debug("pipeline-worker: session acquired", { sessionId });

      try {
        // Drain this session until idle or stop signal.
        // eslint-disable-next-line no-constant-condition
        while (!stopping) {
          const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: idleMs });
          if (messages.length === 0) break; // session went idle; release.
          await processOne(receiver, messages[0]!);
        }
      } finally {
        await receiver.close();
        activeReceiver = null;
        log.debug("pipeline-worker: session released", { sessionId });
      }
    }

    if (sender) {
      try {
        await sender.close();
      } catch {
        /* may already be closed by stop() */
      }
      sender = null;
    }
    try {
      await client.close();
    } catch {
      /* may already be closed by stop() */
    }
    log.info("pipeline-worker: stopped");
  }

  async function stop(): Promise<void> {
    stopping = true;
    log.info("pipeline-worker: stop requested; closing active receiver + client");
    // Close active receiver if there is one (interrupts receiveMessages).
    if (activeReceiver) {
      try {
        await activeReceiver.close();
      } catch {
        /* ignore */
      }
      activeReceiver = null;
    }
    // Close the ServiceBusClient — interrupts client.acceptNextSession() if
    // run()'s outer loop is waiting on a session. Without this, SIGTERM
    // queues but the AMQP await doesn't yield to the event loop in time
    // for orchestrator grace periods (~30s default).
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    if (sender) {
      try {
        await sender.close();
      } catch {
        /* ignore */
      }
      sender = null;
    }
  }

  return { run, stop };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
