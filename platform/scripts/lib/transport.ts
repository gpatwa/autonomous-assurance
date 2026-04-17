/**
 * Pure Microsoft Graph transport. Trust-boundary-safe:
 * takes a TokenProvider at construction time and knows nothing about
 * SP-Read vs SP-Execute vs SP-Setup, certificates, secrets, or env vars.
 * Callers build the TokenProvider in their own process and hand it in.
 *
 * Supports GET, DELETE, POST, and $nextLink paging. POST was added when
 * tenant-setup automation (WI-01) needed it.
 *
 * This file may be promoted to @kavachiq/graph-transport after WI-06
 * confirms the write-path shape. See PLATFORM_SHARED_PACKAGE_PLAN.md.
 */

import { PlatformError } from "@kavachiq/platform";

const DEFAULT_GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface TokenProvider {
  getToken(): Promise<string>;
}

export interface PagedResult<T> {
  pageIndex: number;
  value: T[];
  nextLink: string | null;
}

/**
 * Narrow, spike-friendly projection of Graph response headers. Every
 * field is optional because Graph does not guarantee all of them on
 * every response. `requestId` and `clientRequestId` let WI-06 evidence
 * be correlated against Graph-side logs if Microsoft support is engaged.
 */
export interface ResponseHeadersSummary {
  requestId?: string;
  clientRequestId?: string;
  retryAfterSec?: number;
  date?: string;
}

export interface DeleteResult {
  status: number;
  headers: ResponseHeadersSummary;
}

export interface PostResult<T = unknown> {
  status: number;
  /** Parsed JSON body; null on 204/No Content or non-JSON responses. */
  body: T | null;
  headers: ResponseHeadersSummary;
}

export class GraphRequestError extends PlatformError {
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly headers: ResponseHeadersSummary;

  constructor(
    method: string,
    url: string,
    status: number,
    statusText: string,
    body: string,
    headers: ResponseHeadersSummary,
  ) {
    super(
      "GRAPH_REQUEST_FAILED",
      `Graph ${method} ${url} failed: ${status} ${statusText}`,
      { details: { method, url, status, body, headers } },
    );
    this.status = status;
    this.method = method;
    this.url = url;
    this.headers = headers;
  }
}

function extractResponseHeaders(res: Response): ResponseHeadersSummary {
  const summary: ResponseHeadersSummary = {};
  const requestId = res.headers.get("request-id");
  const clientRequestId = res.headers.get("client-request-id");
  const retryAfter = res.headers.get("retry-after");
  const date = res.headers.get("date");
  if (requestId) summary.requestId = requestId;
  if (clientRequestId) summary.clientRequestId = clientRequestId;
  if (date) summary.date = date;
  if (retryAfter) {
    const asNumber = Number(retryAfter);
    summary.retryAfterSec = Number.isFinite(asNumber) ? asNumber : undefined;
  }
  return summary;
}

export interface GraphTransportOptions {
  tokenProvider: TokenProvider;
  /** Override for tests or a specific Graph version. */
  baseUrl?: string;
}

export class GraphTransport {
  private readonly tokenProvider: TokenProvider;
  private readonly baseUrl: string;

  constructor(opts: GraphTransportOptions) {
    this.tokenProvider = opts.tokenProvider;
    this.baseUrl = opts.baseUrl ?? DEFAULT_GRAPH_BASE;
  }

  async get<T>(path: string): Promise<T> {
    const res = await this.request("GET", path);
    return (await res.json()) as T;
  }

  /**
   * Returns status + selected response headers on success (204 for a
   * normal delete, etc.). Throws GraphRequestError on any non-2xx;
   * callers that need idempotency semantics (e.g. WI-06) catch the error
   * and inspect `err.status === 404`. `err.headers` carries the same
   * Graph request-ids so the failure can be correlated with Graph logs.
   */
  async delete(path: string): Promise<DeleteResult> {
    const res = await this.request("DELETE", path);
    return { status: res.status, headers: extractResponseHeaders(res) };
  }

  /**
   * POST with a JSON body. Returns status + parsed body + selected
   * headers. Throws GraphRequestError on any non-2xx so callers can
   * inspect err.status (e.g., 409 Conflict on idempotent create).
   */
  async post<T = unknown>(path: string, body: unknown): Promise<PostResult<T>> {
    const res = await this.request("POST", path, {
      body: JSON.stringify(body),
      extraHeaders: { "Content-Type": "application/json" },
    });
    const headers = extractResponseHeaders(res);
    if (res.status === 204) {
      return { status: res.status, body: null, headers };
    }
    // Some endpoints return empty body on 201 (rare); guard against that.
    const text = await res.text();
    if (!text) return { status: res.status, body: null, headers };
    return { status: res.status, body: JSON.parse(text) as T, headers };
  }

  getPaged<T>(path: string): AsyncIterable<PagedResult<T>> {
    // Preserve `this` across the async generator boundary.
    const self = this;
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<PagedResult<T>> {
        let next: string | null = path;
        let pageIndex = 0;
        while (next) {
          const res: Response = await self.request("GET", next);
          const json = (await res.json()) as {
            value?: T[];
            "@odata.nextLink"?: string;
          };
          yield {
            pageIndex,
            value: json.value ?? [],
            nextLink: json["@odata.nextLink"] ?? null,
          };
          next = json["@odata.nextLink"] ?? null;
          pageIndex += 1;
        }
      },
    };
  }

  private async request(
    method: string,
    pathOrUrl: string,
    opts: { body?: string; extraHeaders?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    const token = await this.tokenProvider.getToken();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(opts.extraHeaders ?? {}),
      },
      body: opts.body,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new GraphRequestError(
        method,
        url,
        res.status,
        res.statusText,
        body,
        extractResponseHeaders(res),
      );
    }
    return res;
  }
}
