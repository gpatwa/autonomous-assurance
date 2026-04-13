"use client";

import { useState } from "react";
import { blastRadius, affectedObjects, type AffectedObject } from "./data";
import DetailDrawer from "./DetailDrawer";

const iconMap: Record<string, React.ReactNode> = {
  users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  files: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>,
  mail: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  team: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  app: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>,
  shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

export default function BlastRadius() {
  const [selectedObject, setSelectedObject] = useState<AffectedObject | null>(null);
  const totalImpact = blastRadius.reduce((n, b) => n + b.count, 0);

  function handleItemClick(itemName: string) {
    const obj = affectedObjects.find((o) => o.name === itemName);
    if (obj) setSelectedObject(obj);
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-400">Blast radius mapped</p>
          <p className="text-xs text-text-secondary mt-1">{totalImpact} downstream objects affected across {blastRadius.length} system categories</p>
        </div>
        <div className="flex gap-3">
          {blastRadius.map((b) => (
            <div key={b.category} className="text-center">
              <p className="text-lg font-bold text-text-primary">{b.count}</p>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">{b.category}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Impact cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {blastRadius.map((b) => (
          <div key={b.category} className="rounded-xl border border-border-primary bg-bg-surface/50 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                {iconMap[b.icon] || iconMap.shield}
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">{b.category}</p>
                <p className="text-xs text-text-muted">{b.count} affected</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {b.items.map((item) => {
                const hasDetail = affectedObjects.some((o) => o.name === item.name);
                return (
                  <button
                    key={item.name}
                    onClick={() => handleItemClick(item.name)}
                    disabled={!hasDetail}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      hasDetail
                        ? "border-border-primary/50 bg-bg-primary/40 hover:border-accent/30 hover:bg-bg-primary/60 cursor-pointer"
                        : "border-border-primary/50 bg-bg-primary/40 cursor-default"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-text-primary">{item.name}</p>
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted flex-shrink-0">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">{item.detail}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Drill-down drawer */}
      <DetailDrawer
        object={selectedObject}
        onClose={() => setSelectedObject(null)}
      />
    </div>
  );
}
