"use client";

import { useState } from "react";
import { recoveryPlanDetailed, affectedObjects, type ActionType, type RecoveryStepDetail } from "./data";

const typeStyles: Record<ActionType, { label: string; color: string }> = {
  rollback: { label: "Rollback", color: "text-accent bg-accent/10 border-accent/20" },
  restoration: { label: "Restoration", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  "compensating-action": { label: "Compensating", color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  validation: { label: "Validation", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
};

function StepExpanded({ step }: { step: RecoveryStepDetail }) {
  const linkedObjects = affectedObjects.filter((o) => step.affectedObjectIds.includes(o.id));
  const dependencySteps = recoveryPlanDetailed.filter((s) => step.dependsOn.includes(s.order));

  return (
    <div className="mt-4 space-y-4 border-t border-border-primary/30 pt-4">
      {/* Expected result */}
      <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/5 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Expected result</p>
        <p className="text-xs text-text-secondary leading-relaxed">{step.expectedResult}</p>
      </div>

      {/* Dependencies */}
      {dependencySteps.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">Depends on</p>
          <div className="flex flex-wrap gap-2">
            {dependencySteps.map((dep) => (
              <span key={dep.order} className="inline-flex items-center gap-1.5 rounded-full border border-border-primary bg-bg-primary/40 px-2.5 py-1 text-[10px] text-text-secondary">
                <span className="h-4 w-4 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                  {dep.order}
                </span>
                {dep.action.substring(0, 40)}{dep.action.length > 40 ? "..." : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Affected objects */}
      {linkedObjects.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">Affected objects</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {linkedObjects.map((obj) => (
              <div key={obj.id} className="rounded-lg border border-border-primary/50 bg-bg-primary/30 px-3 py-2">
                <p className="text-xs font-semibold text-text-primary">{obj.name}</p>
                <p className="text-[10px] text-text-muted">{obj.type}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approval + execution */}
      <div className="flex flex-wrap gap-4 text-xs text-text-muted">
        {step.approvedBy && (
          <span>Approved by: <span className="text-text-secondary">{step.approvedBy}</span></span>
        )}
        {step.executedAt && (
          <span>Executed: <span className="text-text-secondary font-mono">{new Date(step.executedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></span>
        )}
      </div>
    </div>
  );
}

export default function RecoveryPlan() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
        {recoveryPlanDetailed.map((step) => {
          const isExpanded = expandedId === step.id;
          return (
            <div key={step.id} className="rounded-xl border border-border-primary bg-bg-surface/50 p-5">
              <button
                onClick={() => setExpandedId(isExpanded ? null : step.id)}
                className="w-full text-left cursor-pointer"
              >
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
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </div>

                    {/* Action */}
                    <p className="text-sm font-semibold text-text-primary">{step.action}</p>
                    <p className="text-xs text-text-muted mt-1 font-mono">{step.target}</p>

                    {/* Rationale (always visible) */}
                    <p className="text-xs text-text-secondary mt-3 leading-relaxed border-l-2 border-border-primary pl-3">
                      {step.rationale}
                    </p>
                  </div>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && <StepExpanded step={step} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
