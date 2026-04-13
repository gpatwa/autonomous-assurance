"use client";

import { resolution, incident } from "./data";

export default function Resolution() {
  return (
    <div className="space-y-6">
      {/* Final status */}
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-emerald-400">Trusted operational state restored</h2>
        <p className="text-sm text-text-secondary mt-2 max-w-md mx-auto">
          All identity, data, and downstream system states have been verified against the pre-incident baseline. Full audit trail preserved.
        </p>
        <p className="text-xs font-mono text-text-muted mt-4">{incident.id} closed at {new Date(incident.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" })}</p>
      </div>

      {/* Verification checklist */}
      <div className="rounded-xl border border-border-primary bg-bg-surface/50 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-5">Recovery verification</h2>
        <div className="space-y-3">
          {resolution.map((check) => (
            <div key={check.area} className="flex items-start gap-3 rounded-lg border border-border-primary/50 bg-bg-primary/40 px-4 py-3">
              <div className="flex-shrink-0 mt-0.5">
                {check.status === "verified" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4" /><path d="M12 16h.01" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">{check.area}</p>
                <p className="text-xs text-text-secondary mt-0.5">{check.detail}</p>
              </div>
              <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                {check.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Additional scenarios placeholder */}
      <div className="rounded-xl border border-border-primary/50 border-dashed bg-bg-surface/20 p-6 text-center">
        <p className="text-sm text-text-muted">Additional recovery scenarios coming soon</p>
        <p className="text-xs text-text-muted mt-1">Service principal modification, Conditional Access policy change, cross-tenant app access</p>
      </div>
    </div>
  );
}
