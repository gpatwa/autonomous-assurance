"use client";

import { recoveryPlan, type ActionType } from "./data";

const typeStyles: Record<ActionType, { label: string; color: string }> = {
  rollback: { label: "Rollback", color: "text-accent bg-accent/10 border-accent/20" },
  restoration: { label: "Restoration", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  "compensating-action": { label: "Compensating", color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  validation: { label: "Validation", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
};

export default function RecoveryPlan() {
  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="rounded-xl border border-border-primary bg-bg-surface/50 p-4 flex flex-wrap gap-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mr-2 self-center">Action types</p>
        {Object.entries(typeStyles).map(([key, style]) => (
          <span key={key} className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.color}`}>
            {style.label}
          </span>
        ))}
      </div>

      {/* Recovery steps */}
      <div className="space-y-3">
        {recoveryPlan.map((step, i) => (
          <div key={step.id} className="rounded-xl border border-border-primary bg-bg-surface/50 p-5">
            <div className="flex items-start gap-4">
              {/* Step number */}
              <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 text-xs font-bold">
                {step.order}
              </div>

              <div className="flex-1 min-w-0">
                {/* Header row */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeStyles[step.type].color}`}>
                    {typeStyles[step.type].label}
                  </span>
                  {step.approvalRequired && (
                    <span className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/5 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      Approval required
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 ml-auto">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Completed
                  </span>
                </div>

                {/* Action */}
                <p className="text-sm font-semibold text-text-primary">{step.action}</p>
                <p className="text-xs text-text-muted mt-1 font-mono">{step.target}</p>

                {/* Rationale */}
                <p className="text-xs text-text-secondary mt-3 leading-relaxed border-l-2 border-border-primary pl-3">
                  {step.rationale}
                </p>
              </div>
            </div>

            {/* Connector */}
            {i < recoveryPlan.length - 1 && (
              <div className="ml-4 mt-3 h-4 w-px bg-gradient-to-b from-border-primary to-transparent" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
