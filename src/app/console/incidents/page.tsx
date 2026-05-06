/**
 * /console/incidents — Incident list (Server Component).
 *
 * Reads from the @kavachiq/api server. Fetched server-side on every request
 * (cache: "no-store") so operators always see current data.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { consoleTenantId, listIncidents } from "@/lib/console-api";

export const metadata: Metadata = {
  title: "Incidents — Console",
  robots: { index: false, follow: false },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-950 text-red-300 border border-red-800",
  high:     "bg-orange-950 text-orange-300 border border-orange-800",
  medium:   "bg-yellow-950 text-yellow-300 border border-yellow-800",
  low:      "bg-blue-950 text-blue-300 border border-blue-800",
};

const STATUS_STYLES: Record<string, string> = {
  new:          "text-accent",
  investigating: "text-yellow-400",
  restored:     "text-green-400",
  closed:       "text-text-muted",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function IncidentsPage() {
  let tenantId: string;
  let result: Awaited<ReturnType<typeof listIncidents>>;
  let fetchError: string | null = null;

  try {
    tenantId = consoleTenantId();
    result = await listIncidents(tenantId, { limit: 50 });
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load incidents";
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-text-primary">Incidents</h1>
        <div className="rounded border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {fetchError}
        </div>
      </div>
    );
  }

  const { data: incidents, meta } = result;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Incidents</h1>
        <span className="text-sm text-text-muted">{meta.total} total</span>
      </div>

      {incidents.length === 0 ? (
        <p className="text-sm text-text-muted">No incidents found.</p>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc) => (
            <Link
              key={inc.incidentId}
              href={`/console/incidents/${inc.incidentId}`}
              className="flex items-start gap-4 rounded border border-border-primary bg-bg-surface px-4 py-3 transition-colors hover:border-border-accent hover:bg-bg-surface-hover"
            >
              {/* Severity badge */}
              <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[inc.severity] ?? "bg-bg-surface text-text-muted"}`}>
                {inc.severity}
              </span>

              {/* Title + meta */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {inc.title}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Score {inc.classificationRationale.scoreAtCreation} · Detected {fmt(inc.detectedAt)}
                </p>
              </div>

              {/* Status */}
              <span className={`shrink-0 text-xs font-medium ${STATUS_STYLES[inc.status] ?? "text-text-muted"}`}>
                {inc.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
