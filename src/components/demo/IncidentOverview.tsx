"use client";

import { incident } from "./data";

const fields = [
  { label: "Initiating agent", value: incident.agent },
  { label: "Workflow session", value: incident.sessionId, mono: true },
  { label: "Changed object", value: "Entra security group: Finance-Privileged-Access" },
  { label: "Change type", value: "Membership modification" },
  { label: "Timestamp", value: new Date(incident.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" }) },
  { label: "Affected systems", value: `${incident.affectedSystemsCount} (SharePoint, Exchange, Teams, ERP, Conditional Access)` },
];

export default function IncidentOverview() {
  return (
    <div className="space-y-6">
      {/* Key-value grid */}
      <div className="rounded-xl border border-border-primary bg-bg-surface/50 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-5">Incident details</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="text-xs text-text-muted mb-1">{f.label}</p>
              <p className={`text-sm text-text-primary ${f.mono ? "font-mono" : ""}`}>{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Narrative summary */}
      <div className="rounded-xl border border-border-primary bg-bg-surface/50 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">Summary</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{incident.summary}</p>
      </div>

      {/* Quick impact snapshot */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Users affected", value: "12", sub: "Added to privileged group" },
          { label: "Systems impacted", value: "5", sub: "Identity, data, and downstream" },
          { label: "Recovery steps", value: "7", sub: "Identity-first sequencing" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border-primary bg-bg-surface/50 p-5 text-center">
            <p className="text-3xl font-bold text-accent">{card.value}</p>
            <p className="text-sm font-semibold text-text-primary mt-1">{card.label}</p>
            <p className="text-xs text-text-muted mt-1">{card.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
