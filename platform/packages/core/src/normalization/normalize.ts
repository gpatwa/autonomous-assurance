/**
 * Top-level normalization entrypoint for the Phase 1 ingestion slice.
 *
 * Input: RawEvent[] (each `rawPayload` is a Microsoft Graph audit event).
 * Output: NormalizedChange[] for the classes implemented.
 *
 * Current slice implements ONLY group-membership-add. Events of other
 * classes are classified by the discriminator but skipped with a
 * logged warning — they do not produce NormalizedChanges in this pass.
 *
 * Correlation happens in a separate module and is NOT run here. Every
 * NormalizedChange returned has `bundleId: null` unless the caller's
 * `bundleIdFor` resolver returns otherwise.
 */

import { randomUUID } from "node:crypto";
import { PlatformError, rootLogger, type Logger } from "@kavachiq/platform";
import type { NormalizedChange, RawEvent } from "@kavachiq/schema";
import { mapCaPolicyUpdateEvent } from "./ca-policy-update.js";
import { classifyEvent } from "./discriminator.js";
import { mapMemberAddEvent } from "./member-add.js";
import type { SnapshotProvider } from "./snapshot-provider.js";

export interface NormalizeOptions {
  tenantId: string;
  snapshotProvider: SnapshotProvider;
  /** Per-tenant allowlist of service-principal object IDs treated as agents. */
  agentIdentifiedActorIds: ReadonlySet<string>;
  /** Overridable change-ID factory. Defaults to `inc_`-style UUID. Tests inject deterministic values. */
  newChangeId?: () => string;
  /** Overridable bundle-ID resolver. Defaults to `null` (correlation not run in this slice). */
  bundleIdFor?: (rawPayload: unknown) => string | null;
  logger?: Logger;
}

export class UnsupportedChangeClassError extends PlatformError {
  constructor(activityDisplayName: string, rawEventId: string) {
    super(
      "UNSUPPORTED_CHANGE_CLASS",
      `Change class for '${activityDisplayName}' is not implemented in the Phase 1 slice`,
      { details: { activityDisplayName, rawEventId } },
    );
  }
}

/**
 * Normalize an array of RawEvents.
 *
 * For group-membership-add: produces a NormalizedChange per event.
 * For all other classes (including `unmatched`): skipped. The caller
 * can inspect the returned `skipped` array for transparency.
 */
export async function normalizeRawEvents(
  events: RawEvent[],
  opts: NormalizeOptions,
): Promise<{ normalized: NormalizedChange[]; skipped: Array<{ rawEventId: string; reason: string }> }> {
  const log = opts.logger ?? rootLogger;
  const newChangeId = opts.newChangeId ?? (() => `chg_${randomUUID()}`);
  const bundleIdFor = opts.bundleIdFor ?? (() => null);

  const normalized: NormalizedChange[] = [];
  const skipped: Array<{ rawEventId: string; reason: string }> = [];

  for (const rawEvent of events) {
    const payload = rawEvent.rawPayload as { activityDisplayName?: string; id?: string };
    const cls = classifyEvent(payload.activityDisplayName);

    if (cls === "group-membership-add") {
      const change = await mapMemberAddEvent(rawEvent, {
        tenantId: opts.tenantId,
        snapshotProvider: opts.snapshotProvider,
        agentIdentifiedActorIds: opts.agentIdentifiedActorIds,
        newChangeId,
        bundleIdFor: () => bundleIdFor(payload),
      });
      normalized.push(change);
      continue;
    }

    if (cls === "conditional-access-change") {
      const change = mapCaPolicyUpdateEvent(rawEvent, {
        tenantId: opts.tenantId,
        newChangeId,
        bundleIdFor: () => bundleIdFor(payload),
      });
      normalized.push(change);
      continue;
    }

    const reason = cls === "unmatched"
      ? `unmatched activityDisplayName: ${String(payload.activityDisplayName)}`
      : `change class '${cls}' not yet implemented in Phase 1 slice`;
    log.warn("normalize: skipped event", {
      rawEventId: rawEvent.rawEventId,
      msEventId: payload.id,
      cls,
      reason,
    });
    skipped.push({ rawEventId: rawEvent.rawEventId, reason });
  }

  log.info("normalize: complete", {
    input: events.length,
    normalized: normalized.length,
    skipped: skipped.length,
  });
  return { normalized, skipped };
}
