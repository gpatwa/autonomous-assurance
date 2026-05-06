/**
 * KavachIQ REST API server.
 *
 * Endpoints:
 *   GET /health                                      — liveness probe
 *   GET /tenants/:tenantId/incidents                 — list incidents (desc detected_at)
 *   GET /tenants/:tenantId/incidents/:incidentId     — get single incident
 *   GET /tenants/:tenantId/changes                   — list normalized changes (desc observed_at)
 *
 * Auth (Week 4 Day 1-2): static Bearer API key validated from the
 * API_KEY env var. Entra External ID JWT validation is wired in Day 4.
 *
 * All data queries run under withTenantContext — RLS enforces isolation.
 *
 * Uses bare node:http (no framework) for the same reason the health
 * server does: minimal dep surface, no shared failure domain with the
 * workload.
 */

import http from "node:http";
import { rootLogger } from "@kavachiq/platform";
import {
  findIncidentById,
  listIncidents,
  listNormalizedChanges,
  withTenantContext,
} from "@kavachiq/storage";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ApiServerOptions {
  /**
   * Static Bearer token used for authentication.
   * TODO (Week 4 Day 4): replace with Entra External ID JWT validation.
   */
  apiKey: string;
  port?: number;
}

export interface ApiServer {
  listen(): Promise<void>;
  close(): Promise<void>;
  readonly port: number;
}

// ─── Response helpers ──────────────────────────────────────────────────────

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function notFound(res: http.ServerResponse): void {
  json(res, 404, { error: { code: "NOT_FOUND", message: "Not found" } });
}

function badRequest(res: http.ServerResponse, message: string): void {
  json(res, 400, { error: { code: "BAD_REQUEST", message } });
}

function unauthorized(res: http.ServerResponse): void {
  json(res, 401, { error: { code: "UNAUTHORIZED", message: "Bearer token required" } });
}

function serverError(res: http.ServerResponse, err: unknown): void {
  const message = err instanceof Error ? err.message : "Internal server error";
  json(res, 500, { error: { code: "INTERNAL_ERROR", message } });
}

// ─── Query-string helpers ──────────────────────────────────────────────────

function intParam(params: URLSearchParams, key: string, defaultVal: number, max: number): number {
  const raw = params.get(key);
  if (!raw) return defaultVal;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return defaultVal;
  return Math.min(n, max);
}

// ─── Router ────────────────────────────────────────────────────────────────

// /tenants/<uuid>/incidents[/<id>]
const RE_INCIDENTS = /^\/tenants\/([^/]+)\/incidents(?:\/([^/]+))?$/;
// /tenants/<uuid>/changes
const RE_CHANGES = /^\/tenants\/([^/]+)\/changes$/;

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  apiKey: string,
): Promise<void> {
  const log = rootLogger;
  const method = req.method ?? "GET";
  const parsed = new URL(req.url ?? "/", "http://localhost");
  const path = parsed.pathname;
  const qs = parsed.searchParams;

  // ── Health (unauthenticated) ─────────────────────────────────────────
  if (method === "GET" && path === "/health") {
    json(res, 200, { status: "ok" });
    return;
  }

  // ── Auth ────────────────────────────────────────────────────────────
  const authHeader = req.headers["authorization"] ?? "";
  if (authHeader !== `Bearer ${apiKey}`) {
    unauthorized(res);
    return;
  }

  // ── Tenant routes ────────────────────────────────────────────────────
  if (method === "GET") {
    const mInc = RE_INCIDENTS.exec(path);
    if (mInc) {
      const tenantId = mInc[1]!;
      const incidentId = mInc[2];

      if (incidentId) {
        // GET /tenants/:tenantId/incidents/:incidentId
        try {
          const incident = await withTenantContext(tenantId, (client) =>
            findIncidentById(client, incidentId),
          );
          if (!incident) { notFound(res); return; }
          json(res, 200, { data: incident });
        } catch (err) {
          log.error("api: getIncident failed", { err });
          serverError(res, err);
        }
        return;
      }

      // GET /tenants/:tenantId/incidents
      const limit = intParam(qs, "limit", 50, 200);
      const offset = intParam(qs, "offset", 0, 1_000_000);
      const severity = qs.get("severity") ?? undefined;

      try {
        const result = await withTenantContext(tenantId, (client) =>
          listIncidents(client, { limit, offset, severity }),
        );
        json(res, 200, {
          data: result.incidents,
          meta: { total: result.total, limit, offset },
        });
      } catch (err) {
        log.error("api: listIncidents failed", { err });
        serverError(res, err);
      }
      return;
    }

    const mChg = RE_CHANGES.exec(path);
    if (mChg) {
      // GET /tenants/:tenantId/changes
      const tenantId = mChg[1]!;
      const limit = intParam(qs, "limit", 50, 200);
      const offset = intParam(qs, "offset", 0, 1_000_000);
      const changeType = qs.get("changeType") ?? undefined;

      try {
        const result = await withTenantContext(tenantId, (client) =>
          listNormalizedChanges(client, { limit, offset, changeType }),
        );
        json(res, 200, {
          data: result.changes,
          meta: { total: result.total, limit, offset },
        });
      } catch (err) {
        log.error("api: listChanges failed", { err });
        serverError(res, err);
      }
      return;
    }
  }

  notFound(res);
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createApiServer(opts: ApiServerOptions): ApiServer {
  let resolvedPort = opts.port ?? 0;

  const server = http.createServer((req, res) => {
    handleRequest(req, res, opts.apiKey).catch((err) => {
      rootLogger.error("api: unhandled error in request handler", { err });
      if (!res.headersSent) serverError(res, err);
    });
  });

  return {
    get port() { return resolvedPort; },

    listen(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(opts.port ?? 0, () => {
          const addr = server.address();
          resolvedPort = typeof addr === "object" && addr !== null ? addr.port : (opts.port ?? 0);
          rootLogger.info("api: listening", { port: resolvedPort });
          resolve();
        });
      });
    },

    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
