/**
 * Pipeline driver — multi-tenant orchestration over @kavachiq/core.
 *
 * Strangler Fig (D8): wraps the existing pure-function pipeline:
 *   - normalize is upstream (polling-worker; not run here for v1 since the
 *     message payload already contains NormalizedChange[])
 *   - correlate (pure)
 *   - detect / promote (pure)
 *
 * For each input message:
 *   1. withTenantContext(tenantId)
 *   2. loadTenantPolicy from sensitivity_lists
 *   3. Persist raw_events + normalized_changes (FK setup)
 *   4. Run correlateNormalizedChanges
 *   5. Persist bundle(s)
 *   6. For each bundle ≥ threshold: promote → persist Incident → enqueue
 *      outbox event (incident-created). All in the same TX (N3).
 *
 * Returns counts so the worker can log + emit metrics. Idempotent: same
 * input message twice → same bundle/incident IDs, ON CONFLICT DO NOTHING
 * makes the second run a no-op.
 */

import type { Logger } from "@kavachiq/platform";
import { rootLogger } from "@kavachiq/platform";
import type { NormalizedChange } from "@kavachiq/schema";
import { correlation, detection } from "@kavachiq/core";
import {
  enqueueOutboxEvent,
  insertCorrelatedChangeBundle,
  insertIncident,
  insertNormalizedChange,
  insertRawEvent,
  withTenantContext,
} from "@kavachiq/storage";
import { deterministicBundleId, deterministicIncidentId } from "./ids.js";
import { loadTenantPolicy } from "./tenant-context-loader.js";

const IMMEDIATE_CREATION_THRESHOLD = 80;

export interface ProcessEventsMessage {
  schemaVersion: 1;
  tenantId: string;
  /** Inline for v1 / week 2; week 3 swaps to a Blob URL pointer. */
  normalizedChanges: NormalizedChange[];
  /** OTel trace context propagation (D7). */
  traceparent?: string;
}

export interface ProcessEventsResult {
  bundlesCreated: number;
  bundlesAlreadyPresent: number;
  incidentsCreated: number;
  incidentsAlreadyPresent: number;
  unbundledChanges: number;
}

/**
 * Main entrypoint. Runs the full per-tenant pipeline atomically (one TX
 * per bundle group; outbox row written in the same TX as the Incident).
 */
export async function processEventsMessage(
  message: ProcessEventsMessage,
  options: { logger?: Logger } = {},
): Promise<ProcessEventsResult> {
  const log = options.logger ?? rootLogger;
  if (message.schemaVersion !== 1) {
    throw new Error(
      `processEventsMessage: unsupported schemaVersion ${message.schemaVersion}; this build expects 1`,
    );
  }
  if (message.normalizedChanges.length === 0) {
    log.warn("pipeline-driver: empty message", { tenantId: message.tenantId });
    return {
      bundlesCreated: 0,
      bundlesAlreadyPresent: 0,
      incidentsCreated: 0,
      incidentsAlreadyPresent: 0,
      unbundledChanges: 0,
    };
  }

  return await withTenantContext(message.tenantId, async (client) => {
    const policy = await loadTenantPolicy(client);

    // Persist raw_events index rows first so normalized_changes FKs satisfy.
    // For v1, the polling-worker would have written these — this path is
    // belt-and-suspenders for messages that bypass the polling worker
    // (smoke tests, replays). ON CONFLICT DO NOTHING makes it idempotent.
    const seenRawIds = new Set<string>();
    for (const change of message.normalizedChanges) {
      const rawId = change.source.rawEventIds[0];
      if (!rawId || seenRawIds.has(rawId)) continue;
      seenRawIds.add(rawId);
      await insertRawEvent(client, {
        rawEventId: rawId,
        tenantId: change.tenantId,
        microsoftEventId: rawId, // For v1 we use rawEventId as the Microsoft ID surrogate.
        blobUrl: `none://inline-payload`, // Phase 2 actual blob ref.
        sourceSystem: change.source.primarySource as InsertRawEventSource,
        observedAt: change.observedAt,
      });
    }

    // Run correlation against the new changes. Pure function — no DB.
    const { bundles, unbundled } = correlation.correlateNormalizedChanges(
      message.normalizedChanges,
      { scoringPolicy: policy.scoringPolicy },
    );

    let bundlesCreated = 0;
    let bundlesAlreadyPresent = 0;
    let incidentsCreated = 0;
    let incidentsAlreadyPresent = 0;

    for (const bundle of bundles) {
      // N1 — replace the core's random UUID with a deterministic ID derived
      // from (tenant_id, sorted change_ids) so re-runs produce the same
      // bundle_id and ON CONFLICT DO NOTHING (N2) makes them no-ops.
      bundle.bundleId = deterministicBundleId(message.tenantId, bundle.changeIds);

      const bRes = await insertCorrelatedChangeBundle(client, bundle);
      if (bRes.inserted) bundlesCreated += 1;
      else bundlesAlreadyPresent += 1;

      // Update normalized_changes to point at the bundle.
      for (const change of message.normalizedChanges) {
        if (bundle.changeIds.includes(change.changeId)) {
          await insertNormalizedChange(client, change, bundle.bundleId);
        }
      }

      if (bundle.incidentCandidateScore >= IMMEDIATE_CREATION_THRESHOLD) {
        const incident = detection.promoteBundleToIncident(
          bundle,
          message.normalizedChanges.filter((c) => bundle.changeIds.includes(c.changeId)),
          {
            policy: policy.detectionPolicy,
            // N1 — deterministic incident_id from (tenant_id, bundle_id).
            newIncidentId: () => deterministicIncidentId(message.tenantId, bundle.bundleId),
          },
        );
        // The schema's Incident type doesn't carry bundleId at the top level
        // (Phase 2 cleanup); we attach it for the storage layer.
        const incidentWithBundle = { ...incident, bundleId: bundle.bundleId };
        const iRes = await insertIncident(client, incidentWithBundle as never);
        if (iRes.inserted) {
          incidentsCreated += 1;
          await enqueueOutboxEvent(client, {
            eventType: "incident-created",
            payload: {
              incidentId: incident.incidentId,
              bundleId: bundle.bundleId,
              severity: incident.severity,
              urgency: incident.urgency,
              detectedAt: incident.detectedAt,
            },
          });
        } else {
          incidentsAlreadyPresent += 1;
        }
      }
    }

    // Unbundled changes — for v1 we still persist them with bundle_id=NULL
    // so the correlator can pick them up on a future tick. Once persisted
    // they survive worker crashes.
    for (const orphan of unbundled) {
      const change = message.normalizedChanges.find((c) => c.changeId === orphan.changeId);
      if (!change) continue;
      await insertNormalizedChange(client, change, null);
    }

    log.info("pipeline-driver: processed", {
      tenantId: message.tenantId,
      input: message.normalizedChanges.length,
      bundlesCreated,
      bundlesAlreadyPresent,
      incidentsCreated,
      incidentsAlreadyPresent,
      unbundled: unbundled.length,
    });

    return {
      bundlesCreated,
      bundlesAlreadyPresent,
      incidentsCreated,
      incidentsAlreadyPresent,
      unbundledChanges: unbundled.length,
    };
  });
}

type InsertRawEventSource = "entra-audit" | "m365-audit" | "graph-webhook" | "graph-api-read";
