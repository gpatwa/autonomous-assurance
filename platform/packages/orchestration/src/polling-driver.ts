/**
 * Polling driver — per-tenant Microsoft Graph audit poll.
 *
 * Flow per invocation (for one tenant):
 *   1. withTenantContext(tenantId)
 *   2. Load tenant credentials (RLS-scoped) + polling state
 *   3. Mint Graph token via ClientSecretCredential
 *   4. Fetch /auditLogs/directoryAudits since polling_state.last_event_observed_at
 *   5. If events: archive raw JSON to Blob (one batch Blob)
 *   6. INSERT raw_events rows (idempotent on (tenant, microsoft_event_id))
 *   7. Build NormalizedChange[] via @kavachiq/core normalizers (per-event class)
 *   8. Enqueue process-events message session-keyed by tenant_id
 *   9. Update polling_state cursor on success; record failure on throw
 *
 * Step 7 is the per-class normalization fan-out. v1 does it inline so the
 * pipeline-driver can stay payload-driven (no Blob round-trip). Future
 * (week 4+) splits this into a separate normalize step that emits delta-
 * scoped messages on a normalize-events queue.
 *
 * Idempotency (N1+N2): re-poll of the same window produces the same
 * raw_event_ids (deterministic from sha256(tenant, microsoft_event_id))
 * and same normalized changeIds, so ON CONFLICT DO NOTHING short-circuits
 * everything downstream.
 *
 * NOTE on normalization: v1 only supports memberAdded events for the live
 * polling path. Other change classes log "skipped" and are deferred until
 * downstream consumers exist (Phase 2-3 features). The architecture
 * pipeline still supports M1-M3 fixtures end-to-end via direct
 * processEventsMessage calls.
 */

import { createHash, randomUUID } from "node:crypto";
import { ServiceBusClient } from "@azure/service-bus";
import type { Logger } from "@kavachiq/platform";
import { rootLogger } from "@kavachiq/platform";
import { normalization } from "@kavachiq/core";
import type { NormalizedChange } from "@kavachiq/schema";
import {
  archiveRawEvents,
  getPollingState,
  insertRawEvent,
  loadTenantMicrosoftId,
  recordPollFailure,
  recordPollStarted,
  recordPollSuccess,
  withTenantContext,
} from "@kavachiq/storage";
import {
  createGraphCredential,
  fetchAuditEvents,
  type AuditEvent,
} from "./graph-client.js";

const PROCESS_EVENTS_QUEUE = "process-events";
const DEFAULT_POLL_LOOKBACK_HOURS = 24;

export interface PollTenantBatchOptions {
  tenantId: string;
  /** ISO upper bound; default = now. */
  until?: string;
  /** If polling state has no cursor, look this far back. Default 24h. */
  initialLookbackHours?: number;
  /** Graph page size. Default 250 (Graph max). */
  pageSize?: number;
  /** Service Bus connection string. */
  serviceBusConnectionString: string;
  logger?: Logger;
}

export interface PollTenantBatchResult {
  /** True if any events were observed. */
  observedAnyEvents: boolean;
  /** Number of audit events fetched from Graph. */
  fetchedCount: number;
  /** Number of new (de-duplicated) raw_events rows inserted. */
  insertedCount: number;
  /** Number of NormalizedChange[] enqueued for downstream pipeline. */
  enqueuedNormalizedCount: number;
  /** True if Graph indicated more pages remain (caller should re-invoke). */
  hasMorePages: boolean;
  /** Updated cursor (max activityDateTime in this batch, or null). */
  newCursor: string | null;
}

export async function pollTenantBatch(
  opts: PollTenantBatchOptions,
): Promise<PollTenantBatchResult> {
  const log = opts.logger ?? rootLogger;
  const startedAt = new Date().toISOString();

  return await withTenantContext(opts.tenantId, async (client) => {
    // Mark started; preserves last_poll_started_at for ops dashboards.
    await recordPollStarted(client, { startedAt });

    let result: PollTenantBatchResult;
    try {
      // 1. Load microsoft_tenant_id + previous cursor.
      // Secretless: platform credentials come from env, not per-tenant storage.
      const { microsoftTenantId } = await loadTenantMicrosoftId(client);
      const state = await getPollingState(client);
      const cursor =
        state?.lastEventObservedAt ??
        new Date(
          Date.now() -
            (opts.initialLookbackHours ?? DEFAULT_POLL_LOOKBACK_HOURS) * 3600 * 1000,
        ).toISOString();

      log.info("polling-driver: fetching", {
        tenantId: opts.tenantId,
        cursor,
        pageSize: opts.pageSize ?? 250,
      });

      // 2. Fetch audit events from Graph using platform credentials.
      const credential = createGraphCredential(microsoftTenantId);
      const fetched = await fetchAuditEvents(credential, {
        since: cursor,
        pageSize: opts.pageSize,
      });

      if (fetched.events.length === 0) {
        log.info("polling-driver: no new events", { tenantId: opts.tenantId });
        await recordPollSuccess(client, {
          completedAt: new Date().toISOString(),
          lastEventObservedAt: state?.lastEventObservedAt ?? null,
        });
        return {
          observedAnyEvents: false,
          fetchedCount: 0,
          insertedCount: 0,
          enqueuedNormalizedCount: 0,
          hasMorePages: false,
          newCursor: state?.lastEventObservedAt ?? null,
        };
      }

      // 3. Archive verbatim to Blob (immutable source of truth — N10).
      const archiveId = randomUUID();
      const archive = await archiveRawEvents({
        tenantId: opts.tenantId,
        observedAt: fetched.events[0]!.activityDateTime,
        archiveId,
        events: fetched.events,
      });
      log.info("polling-driver: archived", {
        tenantId: opts.tenantId,
        blobUrl: archive.blobUrl,
        count: archive.count,
        bytes: archive.byteLength,
      });

      // 4. Insert raw_events rows (FK target for normalized_changes).
      let insertedCount = 0;
      for (const ev of fetched.events) {
        const rawEventId = deriveRawEventId(opts.tenantId, ev.id);
        const r = await insertRawEvent(client, {
          rawEventId,
          tenantId: opts.tenantId,
          microsoftEventId: ev.id,
          blobUrl: archive.blobUrl,
          sourceSystem: "entra-audit",
          observedAt: ev.activityDateTime,
        });
        if (r.inserted) insertedCount += 1;
      }

      // 5. Normalize the events that have a class we support today.
      // v1 covers M1 (memberAdded); other classes recognised but deferred.
      const normalized = await normalizeEvents(opts.tenantId, fetched.events, log);

      // 6. Enqueue a process-events message session-keyed by tenant.
      // pipeline-worker consumes, runs correlate→detect, persists Incident.
      let enqueuedNormalizedCount = 0;
      if (normalized.length > 0) {
        await enqueueProcessEvents(opts.serviceBusConnectionString, {
          tenantId: opts.tenantId,
          normalizedChanges: normalized,
        });
        enqueuedNormalizedCount = normalized.length;
      }

      result = {
        observedAnyEvents: true,
        fetchedCount: fetched.events.length,
        insertedCount,
        enqueuedNormalizedCount,
        hasMorePages: fetched.hasMorePages,
        newCursor: fetched.lastEventObservedAt,
      };

      // 7. Mark success; advance cursor.
      await recordPollSuccess(client, {
        completedAt: new Date().toISOString(),
        lastEventObservedAt: fetched.lastEventObservedAt,
      });

      log.info("polling-driver: complete", {
        tenantId: opts.tenantId,
        ...result,
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("polling-driver: failed", { tenantId: opts.tenantId, err: msg });
      await recordPollFailure(client, { failureMessage: msg });
      throw err;
    }
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Deterministic raw_event_id (N1). Same Microsoft event polled twice =
 * same raw_event_id; UNIQUE constraint catches the duplicate.
 */
function deriveRawEventId(tenantId: string, microsoftEventId: string): string {
  const h = createHash("sha256");
  h.update(tenantId);
  h.update(":");
  h.update(microsoftEventId);
  return `raw_${h.digest("hex").slice(0, 32)}`;
}

/**
 * Normalize as many events as we have mappers for. v1 covers M1
 * (`Add member to group`); other classes are surfaced via
 * `normalization.classifyEvent` but the corresponding mapper isn't called
 * from polling yet — there's no live consumer for the other classes
 * until Phase 2-3 features.
 */
async function normalizeEvents(
  tenantId: string,
  events: readonly AuditEvent[],
  log: Logger,
): Promise<NormalizedChange[]> {
  const normalized: NormalizedChange[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const ev of events) {
    const cls = normalization.classifyEvent(ev.activityDisplayName as string | undefined);
    if (cls === "group-membership-add") {
      // Wrap the Graph event in a RawEvent shape that the existing M1
      // mapper expects. The mapper is pure — no DB calls — so we feed
      // synthesized values for fields it doesn't read.
      const rawEvent = {
        rawEventId: deriveRawEventId(tenantId, ev.id),
        tenantId,
        sourceSystem: "entra-audit" as const,
        rawPayload: ev as unknown as Record<string, unknown>,
        ingestedAt: new Date().toISOString(),
        processingStatus: "normalized" as const,
        normalizedChangeIds: [],
        schemaVersion: 1,
      };
      try {
        const change = await normalization.mapMemberAddEvent(rawEvent, {
          tenantId,
          // For the live polling path we don't have a snapshot provider yet —
          // stub with the canonical "is not yet a member" pre-state so the
          // pipeline runs end-to-end. Phase 2 wires a real snapshot.
          snapshotProvider: stubMemberAddSnapshotProvider(),
          agentIdentifiedActorIds: new Set<string>(),
          newChangeId: () => deterministicChangeId(tenantId, ev.id),
          bundleIdFor: () => null,
        });
        normalized.push(change);
      } catch (err) {
        log.warn("polling-driver: normalize failed", {
          tenantId,
          microsoftEventId: ev.id,
          cls,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      skipped.push({ id: ev.id, reason: cls });
    }
  }

  if (skipped.length > 0) {
    log.info("polling-driver: skipped (no live mapper for class)", {
      tenantId,
      counts: skipped.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1;
        return acc;
      }, {}),
    });
  }

  return normalized;
}

/** N1: deterministic change_id from (tenant, ms_event_id, "memberAdded"). */
function deterministicChangeId(tenantId: string, microsoftEventId: string): string {
  const h = createHash("sha256");
  h.update(tenantId);
  h.update(":");
  h.update(microsoftEventId);
  h.update(":memberAdded");
  return `chg_${h.digest("hex").slice(0, 32)}`;
}

/**
 * Stub snapshot provider — assumes the user was NOT a member before the
 * event. Matches the canonical scenario shape. Real provider lands in
 * Phase 2 when the operator console can show baseline state.
 */
function stubMemberAddSnapshotProvider(): normalization.SnapshotProvider {
  return {
    async getGroupMembershipBefore(args) {
      return {
        state: {
          groupId: args.groupId,
          groupDisplayName: args.groupDisplayName,
          userId: args.userId,
          isMember: false,
        },
        capturedAt: args.asOf,
        captureSource: "snapshot-diff",
        confidence: "reconstructed",
        stateHash: createHash("sha256")
          .update(`${args.groupId}:${args.userId}:false`)
          .digest("hex"),
      };
    },
    async getAppRoleAssignmentBefore() {
      throw new Error("stub provider does not support app-role-assignment");
    },
  };
}

async function enqueueProcessEvents(
  connectionString: string,
  msg: { tenantId: string; normalizedChanges: NormalizedChange[] },
): Promise<void> {
  const sb = new ServiceBusClient(connectionString);
  const sender = sb.createSender(PROCESS_EVENTS_QUEUE);
  try {
    await sender.sendMessages({
      body: {
        schemaVersion: 1,
        tenantId: msg.tenantId,
        normalizedChanges: msg.normalizedChanges,
      },
      contentType: "application/json",
      sessionId: msg.tenantId,
    });
  } finally {
    await sender.close();
    await sb.close();
  }
}
