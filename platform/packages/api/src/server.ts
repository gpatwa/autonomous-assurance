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
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { ServiceBusClient } from "@azure/service-bus";
import { rootLogger } from "@kavachiq/platform";
import { blastRadius, planning } from "@kavachiq/core";
import {
  appendAuditRecord,
  findLatestBlastRadiusResultForIncident,
  findLatestRecoveryPlanForIncident,
  findIncidentById,
  findNormalizedChangesByIds,
  insertOnboardedTenant,
  insertPendingOnboarding,
  insertApprovalRecord,
  insertBlastRadiusResult,
  insertRecoveryPlan,
  listIncidents,
  listNormalizedChanges,
  loadTenantByMicrosoftId,
  redeemPendingOnboarding,
  updateRecoveryPlan,
  updateIncidentStatus,
  type IncidentStatus,
  withAdminContext,
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

// ─── Body helpers ──────────────────────────────────────────────────────────

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
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
// /tenants/<uuid>/incidents/<id>/blast-radius[/latest]
const RE_BLAST_RADIUS = /^\/tenants\/([^/]+)\/incidents\/([^/]+)\/blast-radius(?:\/latest)?$/;
// /tenants/<uuid>/incidents/<id>/plans[/latest]
const RE_PLANS = /^\/tenants\/([^/]+)\/incidents\/([^/]+)\/plans(?:\/latest)?$/;
// /tenants/<uuid>/incidents/<id>/plans/latest/steps/<stepId>/approve
const RE_APPROVE_STEP = /^\/tenants\/([^/]+)\/incidents\/([^/]+)\/plans\/latest\/steps\/([^/]+)\/approve$/;
// /resolve-tenant?microsoftTenantId=<uuid>
const RE_RESOLVE_TENANT = /^\/resolve-tenant$/;

// ─── Onboarding helpers ────────────────────────────────────────────────────

/** Cryptographically random opaque token used as the OAuth `state` param. */
function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

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

  // ── Auth ─────────────────────────────────────────────────────────────
  const authHeader = req.headers["authorization"] ?? "";
  if (authHeader !== `Bearer ${apiKey}`) {
    unauthorized(res);
    return;
  }

  // ── Onboarding: initiate admin consent ──────────────────────────────
  // POST /onboarding/initiate  { displayName: string }
  // Returns { consentUrl, tenantId }.
  //
  // State design: the OAuth `state` param is an opaque 32-byte random token.
  // The real payload (tenantId, displayName) is stored server-side in
  // pending_onboarding with a 1-hour TTL. The client never sees the tenantId
  // in the URL, cannot forge a tenantId, and replay is impossible (the row is
  // deleted atomically on redemption in /onboarding/complete).
  if (method === "POST" && path === "/onboarding/initiate") {
    let body: { displayName?: string };
    try {
      body = await readJson(req);
    } catch {
      badRequest(res, "invalid JSON body");
      return;
    }
    const displayName = (body.displayName ?? "").trim();
    if (!displayName) {
      badRequest(res, "displayName is required");
      return;
    }
    const clientId = process.env.KAVACHIQ_APP_CLIENT_ID;
    const consoleUrl = process.env.KAVACHIQ_CONSOLE_URL;
    if (!clientId || !consoleUrl) {
      log.error("api: onboarding initiate — KAVACHIQ_APP_CLIENT_ID or KAVACHIQ_CONSOLE_URL not set");
      serverError(res, "server misconfiguration");
      return;
    }
    const tenantId = randomUUID();
    const token = generateOpaqueToken();
    try {
      await withAdminContext((client) =>
        insertPendingOnboarding(client, { token, tenantId, displayName }),
      );
    } catch (err) {
      log.error("api: onboarding initiate — failed to store pending state", { err });
      serverError(res, err);
      return;
    }
    const redirectUri = encodeURIComponent(`${consoleUrl}/console/onboarding/callback`);
    const consentUrl =
      `https://login.microsoftonline.com/common/adminconsent` +
      `?client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      `&state=${token}`;
    json(res, 200, { consentUrl, tenantId });
    return;
  }

  // ── Onboarding: complete after admin consent ─────────────────────────
  // POST /onboarding/complete  { state: string, microsoftTenantId: string }
  // Called by the console callback page after Microsoft redirects back.
  //
  // `state` is the opaque token from /onboarding/initiate. It is redeemed
  // atomically (DELETE ... RETURNING): unknown tokens, expired tokens, and
  // replayed tokens all return 400. The server — not the client — determines
  // tenantId and displayName.
  if (method === "POST" && path === "/onboarding/complete") {
    let body: { state?: string; microsoftTenantId?: string };
    try {
      body = await readJson(req);
    } catch {
      badRequest(res, "invalid JSON body");
      return;
    }
    if (!body.state || !body.microsoftTenantId) {
      badRequest(res, "state and microsoftTenantId are required");
      return;
    }
    try {
      const result = await withAdminContext(async (client) => {
        const pending = await redeemPendingOnboarding(client, body.state!);
        if (!pending) return null;
        await insertOnboardedTenant(client, {
          tenantId: pending.tenantId,
          microsoftTenantId: body.microsoftTenantId!,
          displayName: pending.displayName,
          consentedAt: new Date().toISOString(),
        });
        return pending.tenantId;
      });
      if (result === null) {
        badRequest(res, "state token is invalid or expired");
        return;
      }
      log.info("api: tenant onboarded", {
        tenantId: result,
        microsoftTenantId: body.microsoftTenantId,
      });
      // Fire-and-forget first poll — kick off immediately so data appears
      // within seconds of consent rather than waiting for the next scheduler tick.
      void enqueuePollTenant(result, log);
      json(res, 200, { ok: true, tenantId: result });
    } catch (err) {
      log.error("api: onboarding complete failed", { err });
      serverError(res, err);
    }
    return;
  }

  // ── Resolve tenant by Microsoft tenant ID ────────────────────────────
  // GET /resolve-tenant?microsoftTenantId=<uuid>
  // Used by the console auth callback to map the operator's Entra org to a
  // KavachIQ tenant without a hardcoded env-var map.
  if (method === "GET" && RE_RESOLVE_TENANT.test(path)) {
    const msTenantId = qs.get("microsoftTenantId");
    if (!msTenantId) { badRequest(res, "microsoftTenantId is required"); return; }
    try {
      const found = await withAdminContext((client) =>
        loadTenantByMicrosoftId(client, msTenantId),
      );
      if (!found) { json(res, 404, { error: { code: "NOT_FOUND", message: "tenant not found" } }); return; }
      json(res, 200, { tenantId: found.tenantId });
    } catch (err) {
      log.error("api: resolve-tenant failed", { err });
      serverError(res, err);
    }
    return;
  }

  // ── Tenant routes ────────────────────────────────────────────────────
  if (method === "POST") {
    const mApprove = RE_APPROVE_STEP.exec(path);
    if (mApprove) {
      const tenantId = mApprove[1]!;
      const incidentId = mApprove[2]!;
      const stepId = mApprove[3]!;
      let body: { approvedBy?: string; expiresInMinutes?: number };
      try { body = await readJson(req); } catch { badRequest(res, "invalid JSON body"); return; }
      const approvedBy = (body.approvedBy ?? "").trim();
      if (!approvedBy) { badRequest(res, "approvedBy is required"); return; }
      const expiresInMinutes = clampApprovalMinutes(body.expiresInMinutes);
      try {
        const result = await withTenantContext(tenantId, async (client) => {
          const plan = await findLatestRecoveryPlanForIncident(client, incidentId);
          if (!plan) return null;
          const step = plan.steps.find((s) => s.stepId === stepId);
          if (!step) return null;
          if (!step.approvalRequired) {
            throw new Error("step does not require approval");
          }
          if (step.approvalId) {
            throw new Error("step is already approved");
          }

          const approvedAt = new Date();
          const expiresAt = new Date(approvedAt.getTime() + expiresInMinutes * 60_000);
          const approvalId = `apr_${randomUUID()}`;
          const signature = signApproval({
            approvalId,
            tenantId,
            incidentId,
            planId: plan.planId,
            planVersion: plan.version,
            stepId,
            approvedBy,
            approvedAt: approvedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            stateHashAtApproval: step.currentStateAtPlan.stateHash,
            targetObjectId: step.targetObjectId,
            targetState: step.targetState.state,
          });
          const approval = {
            approvalId,
            tenantId,
            incidentId,
            planId: plan.planId,
            planVersion: plan.version,
            stepId,
            approvedBy,
            approvedAt: approvedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            stateHashAtApproval: step.currentStateAtPlan.stateHash,
            targetObjectId: step.targetObjectId,
            targetState: step.targetState.state,
            signature,
            invalidated: false,
            invalidatedReason: null,
            schemaVersion: 1,
          };
          await insertApprovalRecord(client, approval);

          const updatedPlan = {
            ...plan,
            steps: plan.steps.map((s) =>
              s.stepId === stepId
                ? { ...s, approvalId, status: "ready" as const }
                : s,
            ),
          };
          await updateRecoveryPlan(client, updatedPlan);
          await appendAuditRecord(client, {
            auditRecordId: `aud_${randomUUID()}`,
            tenantId,
            eventType: "step-approved",
            actor: {
              type: "user",
              id: approvedBy,
              displayName: approvedBy,
              agentIdentified: false,
              sessionId: null,
            },
            entityType: "recovery-step",
            entityId: stepId,
            action: "approved",
            detail: {
              approvalId,
              incidentId,
              planId: plan.planId,
              planVersion: plan.version,
              expiresAt: approval.expiresAt,
            },
            timestamp: new Date().toISOString(),
            schemaVersion: 1,
          });
          return { approval, plan: updatedPlan };
        });
        if (!result) { notFound(res); return; }
        json(res, 201, { data: result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/does not require approval|already approved/.test(message)) {
          badRequest(res, message);
          return;
        }
        log.error("api: approve step failed", { err });
        serverError(res, err);
      }
      return;
    }
  }

  if (method === "GET" || method === "POST") {
    const mBlast = RE_BLAST_RADIUS.exec(path);
    if (mBlast) {
      const tenantId = mBlast[1]!;
      const incidentId = mBlast[2]!;
      const force = qs.get("force") === "true";
      try {
        const result = await withTenantContext(tenantId, async (client) => {
          const existing = await findLatestBlastRadiusResultForIncident(client, incidentId);
          if (method === "GET" || (existing && !force)) {
            return { data: existing, created: false };
          }

          const incident = await findIncidentById(client, incidentId);
          if (!incident) return null;
          const changes = await findNormalizedChangesByIds(client, incident.rootChangeIds);
          if (changes.length !== incident.rootChangeIds.length) {
            throw new Error(
              `cannot generate blast radius: expected ${incident.rootChangeIds.length} root changes, found ${changes.length}`,
            );
          }

          const computed = blastRadius.computeCanonicalBlastRadius(incident, changes);
          await insertBlastRadiusResult(client, computed);
          await appendAuditRecord(client, {
            auditRecordId: `aud_${randomUUID()}`,
            tenantId,
            eventType: "blast-radius-computed",
            actor: systemActor(),
            entityType: "incident",
            entityId: incidentId,
            action: "computed-blast-radius",
            detail: {
              resultId: computed.resultId,
              totalImpactedObjects: computed.totalImpactedObjects,
            },
            timestamp: new Date().toISOString(),
            schemaVersion: 1,
          });
          return { data: computed, created: true };
        });
        if (result === null || !result.data) { notFound(res); return; }
        json(res, result.created ? 201 : 200, result);
      } catch (err) {
        log.error("api: blast-radius route failed", { err });
        serverError(res, err);
      }
      return;
    }

    const mPlan = RE_PLANS.exec(path);
    if (mPlan) {
      const tenantId = mPlan[1]!;
      const incidentId = mPlan[2]!;
      const force = qs.get("force") === "true";
      try {
        const result = await withTenantContext(tenantId, async (client) => {
          const existing = await findLatestRecoveryPlanForIncident(client, incidentId);
          if (method === "GET" || (existing && !force)) {
            return { data: existing, created: false };
          }

          const incident = await findIncidentById(client, incidentId);
          if (!incident) return null;

          let latestBlastRadius = await findLatestBlastRadiusResultForIncident(client, incidentId);
          if (!latestBlastRadius) {
            const changes = await findNormalizedChangesByIds(client, incident.rootChangeIds);
            if (changes.length !== incident.rootChangeIds.length) {
              throw new Error(
                `cannot generate plan: expected ${incident.rootChangeIds.length} root changes, found ${changes.length}`,
              );
            }
            latestBlastRadius = blastRadius.computeCanonicalBlastRadius(incident, changes);
            await insertBlastRadiusResult(client, latestBlastRadius);
            await appendAuditRecord(client, {
              auditRecordId: `aud_${randomUUID()}`,
              tenantId,
              eventType: "blast-radius-computed",
              actor: systemActor(),
              entityType: "incident",
              entityId: incidentId,
              action: "computed-blast-radius",
              detail: {
                resultId: latestBlastRadius.resultId,
                totalImpactedObjects: latestBlastRadius.totalImpactedObjects,
              },
              timestamp: new Date().toISOString(),
              schemaVersion: 1,
            });
          }

          const version = existing && force ? existing.version + 1 : 1;
          const plan = planning.generateCanonicalRecoveryPlan(latestBlastRadius, { version });
          await insertRecoveryPlan(client, plan);
          await appendAuditRecord(client, {
            auditRecordId: `aud_${randomUUID()}`,
            tenantId,
            eventType: "plan-generated",
            actor: systemActor(),
            entityType: "incident",
            entityId: incidentId,
            action: "generated-recovery-plan",
            detail: {
              planId: plan.planId,
              version: plan.version,
              steps: plan.steps.length,
            },
            timestamp: new Date().toISOString(),
            schemaVersion: 1,
          });
          return { data: plan, created: true };
        });
        if (result === null || !result.data) { notFound(res); return; }
        json(res, result.created ? 201 : 200, result);
      } catch (err) {
        log.error("api: plans route failed", { err });
        serverError(res, err);
      }
      return;
    }
  }

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

    const mChgRoute = RE_CHANGES.exec(path);
    if (mChgRoute) {
      // GET /tenants/:tenantId/changes
      const tenantId = mChgRoute[1]!;
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

  // ── PATCH /tenants/:tenantId/incidents/:incidentId ───────────────────
  // Body: { status: "acknowledged" | "investigating" | "closed" }
  if (method === "PATCH") {
    const mInc = RE_INCIDENTS.exec(path);
    if (mInc && mInc[2]) {
      const tenantId = mInc[1]!;
      const incidentId = mInc[2]!;
      let body: { status?: string };
      try { body = await readJson(req); } catch { badRequest(res, "invalid JSON body"); return; }
      const VALID: IncidentStatus[] = ["acknowledged", "investigating", "closed"];
      const status = body.status as IncidentStatus | undefined;
      if (!status || !VALID.includes(status)) {
        badRequest(res, `status must be one of: ${VALID.join(", ")}`);
        return;
      }
      try {
        const updated = await withTenantContext(tenantId, (client) =>
          updateIncidentStatus(client, incidentId, status),
        );
        if (!updated) { notFound(res); return; }
        json(res, 200, { ok: true, status });
      } catch (err) {
        log.error("api: updateIncidentStatus failed", { err });
        serverError(res, err);
      }
      return;
    }
  }

  notFound(res);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Enqueue one poll-tenant message. Fire-and-forget — errors are logged, not thrown. */
async function enqueuePollTenant(tenantId: string, log: typeof rootLogger): Promise<void> {
  const sbConn = process.env.SERVICE_BUS_CONNECTION_STRING;
  if (!sbConn) {
    log.warn("api: SERVICE_BUS_CONNECTION_STRING not set — skipping first poll enqueue");
    return;
  }
  const sb = new ServiceBusClient(sbConn);
  const sender = sb.createSender("poll-tenant");
  try {
    await sender.sendMessages({
      body: { schemaVersion: 1 as const, tenantId, initialLookbackHours: 24 * 30 },
      contentType: "application/json",
      sessionId: tenantId,
    });
    log.info("api: enqueued first poll-tenant", { tenantId });
  } catch (err) {
    log.error("api: failed to enqueue first poll-tenant", { tenantId, err: String(err) });
  } finally {
    await sender.close().catch(() => undefined);
    await sb.close().catch(() => undefined);
  }
}

function systemActor() {
  return {
    type: "kavachiq" as const,
    id: "api",
    displayName: "KavachIQ API",
    agentIdentified: false,
    sessionId: null,
  };
}

function clampApprovalMinutes(raw: number | undefined): number {
  if (raw === undefined) return 30;
  if (!Number.isFinite(raw) || raw <= 0) return 30;
  return Math.min(Math.floor(raw), 120);
}

function signApproval(payload: Record<string, unknown>): string {
  const secret = process.env.RECOVERY_APPROVAL_SIGNING_SECRET;
  if (!secret) {
    throw new Error("RECOVERY_APPROVAL_SIGNING_SECRET is required to approve recovery steps");
  }
  return createHmac("sha256", secret).update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
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
