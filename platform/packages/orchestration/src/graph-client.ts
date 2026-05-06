/**
 * Microsoft Graph audit-events client.
 *
 * Per-tenant token mint via OAuth client_credentials. Reads
 * /auditLogs/directoryAudits with `activityDateTime gt $cursor`
 * filtering — Graph's audit log doesn't support delta tokens, so we use
 * timestamp-based resumable cursors. UNIQUE(tenant, microsoft_event_id)
 * in raw_events catches duplicates on the boundary timestamp.
 *
 * v1 fetches a single page (up to ~250 events). Multi-page paging will
 * land when a tenant generates >250 events between polls; for v1 we
 * trust the canonical scenarios (12 events) fit in one page.
 *
 * Resilience (N6): Graph 429s carry Retry-After; we surface them as
 * GraphThrottleError with retry hint. Caller (polling-driver) records
 * a poll failure and lets Service Bus redelivery + circuit breaker
 * handle the back-off cadence.
 */

import { ClientSecretCredential, type TokenCredential } from "@azure/identity";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export interface GraphTenantCredentials {
  microsoftTenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface AuditEvent {
  id: string;
  activityDateTime: string;
  activityDisplayName?: string;
  // Graph audit events have many more fields; we preserve them as-is.
  [key: string]: unknown;
}

export interface FetchAuditEventsArgs {
  /** ISO timestamp lower bound (exclusive: events with activityDateTime > since). */
  since: string;
  /** Max events to fetch in this page. Microsoft caps around 250. */
  pageSize?: number;
}

export interface FetchAuditEventsResult {
  events: AuditEvent[];
  /** Max activityDateTime across `events` (or null if no events). */
  lastEventObservedAt: string | null;
  /** True if Graph indicated more pages exist. */
  hasMorePages: boolean;
}

export class GraphThrottleError extends Error {
  constructor(public readonly retryAfterSec: number, message: string) {
    super(message);
    this.name = "GraphThrottleError";
  }
}

export class GraphAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphAuthError";
  }
}

/**
 * Build a TokenCredential for client_credentials flow against the
 * customer's Microsoft tenant.
 */
export function createGraphCredential(
  creds: GraphTenantCredentials,
): TokenCredential {
  return new ClientSecretCredential(
    creds.microsoftTenantId,
    creds.clientId,
    creds.clientSecret,
  );
}

/**
 * Fetch audit events newer than `since`. Returns at most `pageSize` events
 * (default 250). Caller is responsible for following `hasMorePages` if
 * they want all events in the window.
 */
export async function fetchAuditEvents(
  credential: TokenCredential,
  args: FetchAuditEventsArgs,
): Promise<FetchAuditEventsResult> {
  const token = await credential.getToken(GRAPH_SCOPE);
  if (!token?.token) {
    throw new GraphAuthError("Graph token issuance returned no access token");
  }

  const pageSize = args.pageSize ?? 250;
  const filter = encodeURIComponent(`activityDateTime gt ${args.since}`);
  const url = `${GRAPH_BASE}/auditLogs/directoryAudits?$filter=${filter}&$orderby=activityDateTime asc&$top=${pageSize}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token.token}` },
  });

  if (resp.status === 429 || resp.status === 503) {
    const retryAfter = parseInt(resp.headers.get("retry-after") ?? "30", 10);
    throw new GraphThrottleError(
      Number.isFinite(retryAfter) ? retryAfter : 30,
      `Graph throttled: ${resp.status} ${resp.statusText}`,
    );
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `Graph audit fetch failed: ${resp.status} ${resp.statusText} body=${body.slice(0, 500)}`,
    );
  }

  const data = (await resp.json()) as {
    value?: AuditEvent[];
    "@odata.nextLink"?: string;
  };
  const events = data.value ?? [];
  const lastEventObservedAt = events.length === 0
    ? null
    : events.reduce<string>(
        (max, e) => (e.activityDateTime > max ? e.activityDateTime : max),
        events[0]!.activityDateTime,
      );
  return {
    events,
    lastEventObservedAt,
    hasMorePages: typeof data["@odata.nextLink"] === "string",
  };
}
