/**
 * Polling state per N4.
 *
 * One row per tenant. Tracks the last-observed audit event time so we
 * can resume polling after restarts or scale events. Microsoft Graph's
 * /auditLogs/directoryAudits doesn't support delta tokens directly —
 * we use activityDateTime as the resumable cursor. UNIQUE on
 * (tenant_id, microsoft_event_id) in raw_events catches duplicates if
 * the boundary timestamp slips.
 */

import type { PoolClient } from "pg";

export interface PollingState {
  lastDeltaToken: string | null;
  lastPollStartedAt: string | null;
  lastPollCompletedAt: string | null;
  lastEventObservedAt: string | null;
  consecutiveFailures: number;
  lastFailureMessage: string | null;
}

/**
 * Load polling state for the current tenant. Returns null if no row exists
 * (first-ever poll for this tenant).
 */
export async function getPollingState(
  client: PoolClient,
): Promise<PollingState | null> {
  // Don't ::text cast timestamptz columns — pg's default coercion returns
  // JS Date objects, which we toISOString() for ISO 8601 with `T` and `Z`.
  // The ::text cast emits PG's `2026-05-04 15:00:50.581936+00` format,
  // which Microsoft Graph $filter rejects with HTTP 400.
  const result = await client.query<{
    last_delta_token: string | null;
    last_poll_started_at: Date | null;
    last_poll_completed_at: Date | null;
    last_event_observed_at: Date | null;
    consecutive_failures: number;
    last_failure_message: string | null;
  }>(
    `SELECT last_delta_token, last_poll_started_at, last_poll_completed_at,
            last_event_observed_at, consecutive_failures, last_failure_message
       FROM polling_state
      WHERE tenant_id = current_setting('app.tenant_id')::uuid
      LIMIT 1`,
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0]!;
  return {
    lastDeltaToken: r.last_delta_token,
    lastPollStartedAt: r.last_poll_started_at?.toISOString() ?? null,
    lastPollCompletedAt: r.last_poll_completed_at?.toISOString() ?? null,
    lastEventObservedAt: r.last_event_observed_at?.toISOString() ?? null,
    consecutiveFailures: r.consecutive_failures,
    lastFailureMessage: r.last_failure_message,
  };
}

export interface PollingStartArgs {
  startedAt: string;
}

/** Mark a poll as started — resets failure count if previous poll succeeded. */
export async function recordPollStarted(
  client: PoolClient,
  args: PollingStartArgs,
): Promise<void> {
  await client.query(
    `INSERT INTO polling_state (tenant_id, last_poll_started_at)
     VALUES (current_setting('app.tenant_id')::uuid, $1)
     ON CONFLICT (tenant_id) DO UPDATE SET
       last_poll_started_at = EXCLUDED.last_poll_started_at`,
    [args.startedAt],
  );
}

export interface PollingSuccessArgs {
  completedAt: string;
  lastEventObservedAt: string | null;
  /** Optional new delta token (currently unused — Graph audit doesn't expose deltas). */
  lastDeltaToken?: string | null;
}

/** Mark a poll as successful, updating the cursor. */
export async function recordPollSuccess(
  client: PoolClient,
  args: PollingSuccessArgs,
): Promise<void> {
  await client.query(
    `UPDATE polling_state
        SET last_poll_completed_at = $1,
            last_event_observed_at = COALESCE($2, last_event_observed_at),
            last_delta_token = COALESCE($3, last_delta_token),
            consecutive_failures = 0,
            last_failure_message = NULL
      WHERE tenant_id = current_setting('app.tenant_id')::uuid`,
    [args.completedAt, args.lastEventObservedAt, args.lastDeltaToken ?? null],
  );
}

export interface PollingFailureArgs {
  failureMessage: string;
}

/** Record a poll failure. Increments consecutive_failures. */
export async function recordPollFailure(
  client: PoolClient,
  args: PollingFailureArgs,
): Promise<void> {
  await client.query(
    `UPDATE polling_state
        SET consecutive_failures = consecutive_failures + 1,
            last_failure_message = $1
      WHERE tenant_id = current_setting('app.tenant_id')::uuid`,
    [args.failureMessage],
  );
}
