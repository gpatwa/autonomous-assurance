"use client";

import { changedObject } from "./data";

export default function ChangeDetails() {
  return (
    <div className="space-y-6">
      {/* Object header */}
      <div className="rounded-xl border border-border-primary bg-bg-surface/50 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">Changed object</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Type", value: changedObject.type },
            { label: "Name", value: changedObject.name },
            { label: "Object ID", value: changedObject.objectId, mono: true },
            { label: "Change type", value: changedObject.changeType },
          ].map((f) => (
            <div key={f.label}>
              <p className="text-xs text-text-muted mb-1">{f.label}</p>
              <p className={`text-sm text-text-primary ${f.mono ? "font-mono text-xs" : ""}`}>{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Before / After comparison */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Before */}
        <div className="rounded-xl border border-border-primary bg-bg-surface/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Before</h2>
            <span className="text-xs font-mono text-text-muted">{changedObject.before.count} members</span>
          </div>
          <div className="space-y-2">
            {changedObject.before.members.map((m) => (
              <div key={m} className="flex items-center gap-3 rounded-lg border border-border-primary/50 bg-bg-primary/40 px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-text-muted/40 flex-shrink-0" />
                <span className="text-sm text-text-secondary">{m}</span>
              </div>
            ))}
          </div>
        </div>

        {/* After */}
        <div className="rounded-xl border border-red-400/20 bg-bg-surface/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-red-400">After</h2>
            <span className="text-xs font-mono text-red-400">{changedObject.after.count} members (+{changedObject.after.count - changedObject.before.count})</span>
          </div>
          <div className="space-y-2">
            {changedObject.before.members.map((m) => (
              <div key={m} className="flex items-center gap-3 rounded-lg border border-border-primary/50 bg-bg-primary/40 px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-text-muted/40 flex-shrink-0" />
                <span className="text-sm text-text-secondary">{m}</span>
              </div>
            ))}
            {changedObject.addedMembers.map((m) => (
              <div key={m.upn} className="flex items-center justify-between gap-3 rounded-lg border border-red-400/20 bg-red-400/5 px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-red-400 flex-shrink-0" />
                  <span className="text-sm text-text-primary truncate">{m.name}</span>
                </div>
                <span className="text-xs text-text-muted flex-shrink-0 hidden sm:block">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
