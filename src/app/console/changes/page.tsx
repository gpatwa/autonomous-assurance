/**
 * /console/changes — Normalized change list (Server Component).
 */

import type { Metadata } from "next";
import { consoleTenantId, listChanges } from "@/lib/console-api";

export const metadata: Metadata = {
  title: "Changes — Console",
  robots: { index: false, follow: false },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function ChangesPage() {
  let result: Awaited<ReturnType<typeof listChanges>>;
  let fetchError: string | null = null;

  try {
    const tenantId = consoleTenantId();
    result = await listChanges(tenantId, { limit: 100 });
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load changes";
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-text-primary">Changes</h1>
        <div className="rounded border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {fetchError}
        </div>
      </div>
    );
  }

  const { data: changes, meta } = result;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Changes</h1>
        <span className="text-sm text-text-muted">{meta.total} total</span>
      </div>

      {changes.length === 0 ? (
        <p className="text-sm text-text-muted">No changes found.</p>
      ) : (
        <div className="overflow-hidden rounded border border-border-primary">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary bg-bg-surface">
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Target</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Actor</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted">Observed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary bg-bg-surface">
              {changes.map((c) => (
                <tr key={c.changeId} className="hover:bg-bg-surface-hover">
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-accent">{c.changeType}</span>
                  </td>
                  <td className="px-4 py-2 text-text-secondary">
                    <span className="text-xs text-text-muted">{c.target.objectType} / </span>
                    {c.target.displayName || c.target.objectId}
                  </td>
                  <td className="px-4 py-2 text-text-secondary">
                    {c.actor.displayName ?? c.actor.type}
                    {c.actor.agentIdentified && (
                      <span className="ml-1.5 rounded bg-accent/10 px-1 py-0.5 text-xs text-accent">agent</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-text-muted">{fmt(c.observedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
