"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * HeroRecoveryAnimation — animated 4-stage timeline for the hero (Section 1).
 *
 * Replaces the static HeroRecoveryPlaceholder. Auto-advances through the same
 * four stages as the RecoveryWalkthrough below the fold, but at a snappier
 * cadence and at a smaller, decorative scale.
 *
 *   0. Agent action            (red)
 *   1. Blast radius mapped     (amber)
 *   2. Operator-approved       (accent)
 *   3. Trusted state validated (emerald)
 */

type Stage = 0 | 1 | 2 | 3;

const STAGES: { label: string; tone: string; ringTone: string; pulse: string }[] = [
  {
    label: "Agent action detected",
    tone: "border-red-400/40 bg-red-400/5 text-red-300",
    ringTone: "ring-red-400/30",
    pulse: "bg-red-400",
  },
  {
    label: "Blast radius mapped",
    tone: "border-amber-400/40 bg-amber-400/5 text-amber-300",
    ringTone: "ring-amber-400/30",
    pulse: "bg-amber-400",
  },
  {
    label: "Operator-approved reversal",
    tone: "border-accent/40 bg-accent/5 text-accent",
    ringTone: "ring-accent/30",
    pulse: "bg-accent",
  },
  {
    label: "Trusted state validated",
    tone: "border-emerald-400/40 bg-emerald-400/5 text-emerald-300",
    ringTone: "ring-emerald-400/30",
    pulse: "bg-emerald-400",
  },
];

const STAGE_MS = 2400;

export default function HeroRecoveryAnimation() {
  const [stage, setStage] = useState<Stage>(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStage((s) => ((s + 1) % 4) as Stage);
    }, STAGE_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative rounded-[28px] border border-border-primary bg-bg-surface/70 p-6 shadow-[0_0_40px_rgba(8,15,35,0.45)]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
          Recovery timeline
        </p>
        <span className="flex items-center gap-2 rounded-full border border-border-primary px-2 py-0.5 text-[10px] text-text-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${STAGES[stage].pulse} animate-pulse`}
          />
          Stage {stage + 1} / 4
        </span>
      </div>

      <div className="space-y-3">
        {STAGES.map((s, i) => {
          const isActive = stage === i;
          const isPast = stage > i;

          return (
            <motion.div
              key={s.label}
              animate={{
                scale: isActive ? 1.02 : 1,
                opacity: isPast ? 0.55 : 1,
              }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-300 ${
                isActive
                  ? `${s.tone} ring-1 ${s.ringTone}`
                  : "border-border-primary bg-bg-primary/40 text-text-muted"
              }`}
            >
              <motion.span
                animate={{
                  scale: isActive ? [1, 1.15, 1] : 1,
                }}
                transition={{
                  duration: 1.2,
                  repeat: isActive ? Infinity : 0,
                  ease: "easeInOut",
                }}
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
                  isActive
                    ? "border-current"
                    : "border-border-primary text-text-muted"
                }`}
              >
                {isPast ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </motion.span>
              <span className="text-sm font-medium">{s.label}</span>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom progress strip */}
      <div className="mt-5 flex gap-1.5">
        {STAGES.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
              stage >= i ? "bg-accent" : "bg-border-primary"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
