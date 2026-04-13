"use client";

import { useEffect } from "react";
import { type AffectedObject, type ActionType } from "./data";

const typeLabels: Record<ActionType, { label: string; color: string }> = {
  rollback: { label: "Rollback", color: "text-accent bg-accent/10 border-accent/20" },
  restoration: { label: "Restoration", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  "compensating-action": { label: "Compensating", color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  validation: { label: "Validation", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
};

interface DetailDrawerProps {
  object: AffectedObject | null;
  onClose: () => void;
}

export default function DetailDrawer({ object, onClose }: DetailDrawerProps) {
  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (object) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [object, onClose]);

  if (!object) return null;

  const actionStyle = typeLabels[object.actionType];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto bg-bg-primary border-l border-border-primary shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border-primary bg-bg-surface/80 backdrop-blur-sm px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-text-muted uppercase tracking-wider">{object.type}</p>
              <h2 className="text-lg font-semibold text-text-primary mt-1">{object.name}</h2>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1.5 rounded-lg hover:bg-bg-surface transition-colors cursor-pointer text-text-muted hover:text-text-primary"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Impact reason */}
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">Why this was impacted</p>
            <p className="text-sm text-text-secondary leading-relaxed">{object.impactReason}</p>
          </div>

          {/* Before / After */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border-primary bg-bg-surface/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Before</p>
              <div className="space-y-3">
                {object.before.map((item) => (
                  <div key={item.label}>
                    <p className="text-[11px] text-text-muted">{item.label}</p>
                    <p className="text-sm text-text-secondary mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-3">After</p>
              <div className="space-y-3">
                {object.after.map((item) => (
                  <div key={item.label}>
                    <p className="text-[11px] text-text-muted">{item.label}</p>
                    <p className="text-sm text-text-primary mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Affected identities */}
          <div className="rounded-xl border border-border-primary bg-bg-surface/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Affected identities</p>
              <span className="text-xl font-bold text-accent">{object.affectedIdentities}</span>
            </div>
          </div>

          {/* Dependency note */}
          <div className="rounded-xl border border-border-primary bg-bg-surface/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Recovery dependency</p>
            <p className="text-sm text-text-secondary leading-relaxed">{object.dependencyNote}</p>
          </div>

          {/* Recommended action */}
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Recommended action</p>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${actionStyle.color}`}>
                {actionStyle.label}
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{object.recommendedAction}</p>
          </div>
        </div>
      </div>
    </>
  );
}
