/**
 * Server-side API client for the /console operator UI.
 *
 * Calls the @kavachiq/api REST server. All functions are server-side only
 * (called from Server Components or Route Handlers).
 *
 * Config (env vars):
 *   KAVACHIQ_API_URL   — API server base URL (default: http://localhost:3001)
 *   KAVACHIQ_API_KEY   — Bearer token (required; must match API server API_KEY)
 *
 * Tenant resolution: read from the Entra session (kavachiqTenantId), which is
 * derived at sign-in from AUTH_TID_TO_TENANT. No static KAVACHIQ_CONSOLE_TENANT needed.
 */

import { auth } from "@/auth";

// Minimal local types — structural matches for @kavachiq/schema Incident and
// NormalizedChange. Platform packages are not linked in the root workspace.

export interface ConsoleIncident {
  incidentId: string;
  tenantId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  urgency: "immediate" | "within-hour" | "within-day" | "informational";
  status: string;
  classificationRationale: {
    scoreAtCreation: number;
    narrative: string;
    signals: Array<{ signal: string; weight: number; value: number }>;
  };
  sensitivityContext: {
    targetSensitivity: "high" | "medium" | "low";
    actorClassification: string;
  };
  correlatedChangeIds: string[];
  detectedAt: string;
  createdAt: string;
}

export interface ConsoleChange {
  changeId: string;
  changeType: string;
  target: { objectType: string; displayName: string; objectId: string };
  actor: { type: string; displayName: string | null; agentIdentified: boolean };
  observedAt: string;
}

export interface ListResult<T> {
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

// ─── Config ───────────────────────────────────────────────────────────────

function apiBase(): string {
  return (process.env.KAVACHIQ_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

function apiKey(): string {
  return process.env.KAVACHIQ_API_KEY ?? "";
}

export async function getConsoleTenantId(): Promise<string> {
  const session = await auth();
  const id = session?.kavachiqTenantId;
  if (!id) throw new Error("No tenant in session — check AUTH_TID_TO_TENANT mapping");
  return id;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    // No caching — operator console should always show fresh data.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API ${path} returned ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Onboarding ───────────────────────────────────────────────────────────

export async function initiateOnboarding(
  displayName: string,
): Promise<{ consentUrl: string; tenantId: string }> {
  const url = `${apiBase()}/onboarding/initiate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ displayName }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`onboarding initiate failed: ${res.status}`);
  return res.json() as Promise<{ consentUrl: string; tenantId: string }>;
}

export async function completeOnboarding(
  state: string,
  microsoftTenantId: string,
): Promise<{ tenantId: string }> {
  const url = `${apiBase()}/onboarding/complete`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state, microsoftTenantId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`onboarding complete failed: ${res.status}`);
  return res.json() as Promise<{ tenantId: string }>;
}

// ─── API calls ────────────────────────────────────────────────────────────

export async function listIncidents(
  tenantId: string,
  opts: { limit?: number; offset?: number; severity?: string } = {},
): Promise<ListResult<ConsoleIncident>> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set("limit", String(opts.limit));
  if (opts.offset) qs.set("offset", String(opts.offset));
  if (opts.severity) qs.set("severity", opts.severity);
  const q = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/tenants/${tenantId}/incidents${q}`);
}

export async function getIncident(
  tenantId: string,
  incidentId: string,
): Promise<{ data: ConsoleIncident }> {
  return apiFetch(`/tenants/${tenantId}/incidents/${incidentId}`);
}

export async function listChanges(
  tenantId: string,
  opts: { limit?: number; offset?: number; changeType?: string } = {},
): Promise<ListResult<ConsoleChange>> {
  const qs = new URLSearchParams();
  if (opts.limit) qs.set("limit", String(opts.limit));
  if (opts.offset) qs.set("offset", String(opts.offset));
  if (opts.changeType) qs.set("changeType", opts.changeType);
  const q = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/tenants/${tenantId}/changes${q}`);
}
