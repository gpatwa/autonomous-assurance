"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * RecoveryWalkthrough — auto-advancing visual for Section 5 (LiveRecoveryDemo).
 *
 * Plays the recovery flow described in LANDING_PAGE_COPY_V2.md § Section 5:
 *   1. Alert ingested        — agent changes detected
 *   2. Blast radius mapped   — changes attributed and categorized
 *   3. Plan proposed         — dependency-ordered reversal sequence
 *   4. Approved + validated  — operator approves, reversals execute, state validated
 *
 * Uses a representative scenario in a controlled environment (no customer data).
 * Cycle length: ~12 seconds (3s per stage), then loops.
 */

type Stage = 0 | 1 | 2 | 3;

const STAGES: { key: Stage; title: string; sub: string; dotColor: string }[] = [
  {
    key: 0,
    title: "Alert ingested",
    sub: "Agent session 47 changes flagged by Sentinel",
    dotColor: "bg-red-400",
  },
  {
    key: 1,
    title: "Blast radius mapped",
    sub: "Changes attributed across identity, sharing, permissions, data",
    dotColor: "bg-amber-400",
  },
  {
    key: 2,
    title: "Plan proposed",
    sub: "Dependency-ordered reversal awaiting operator approval",
    dotColor: "bg-accent",
  },
  {
    key: 3,
    title: "Approved, reversed, validated",
    sub: "Trusted state restored. Evidence pack generated.",
    dotColor: "bg-emerald-400",
  },
];

type Domain = "Identity" | "Permissions" | "Sharing" | "Conditional Access" | "Data";

const DOMAIN_TONE: Record<Domain, string> = {
  Identity: "border-accent/40 bg-accent/10 text-accent",
  Permissions: "border-purple-400/40 bg-purple-400/10 text-purple-300",
  Sharing: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  "Conditional Access": "border-pink-400/40 bg-pink-400/10 text-pink-300",
  Data: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
};

/**
 * Six representative changes shown in stage 2+. `sortOrder` is the
 * dependency-ordered position used at stage 3 (identity first).
 */
const CHANGES: { label: string; domain: Domain; sortOrder: number }[] = [
  { label: "Add user to Privileged-Admins group", domain: "Identity", sortOrder: 1 },
  { label: "Grant Sites.ReadWrite.All to app", domain: "Permissions", sortOrder: 3 },
  { label: "Add Conditional Access policy exemption", domain: "Conditional Access", sortOrder: 2 },
  { label: "Share OneDrive root with external user", domain: "Sharing", sortOrder: 4 },
  { label: "Add service principal owner", domain: "Identity", sortOrder: 5 },
  { label: "Modify DLP label on finance folder", domain: "Data", sortOrder: 6 },
];

const STAGE_MS = 3200;

export default function RecoveryWalkthrough() {
  const [stage, setStage] = useState<Stage>(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStage((s) => ((s + 1) % 4) as Stage);
    }, STAGE_MS);
    return () => clearInterval(t);
  }, []);

  const items = stage >= 2
    ? [...CHANGES].sort((a, b) => a.sortOrder - b.sortOrder)
    : CHANGES;

  return (
    <div className="grid h-full min-h-[460px] grid-rows-[auto_1fr_auto] gap-5">
      {/* Stage header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
            Stage {stage + 1} of 4
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              key={stage}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-2 text-sm font-semibold text-text-primary"
            >
              <span className={`h-2 w-2 rounded-full ${STAGES[stage].dotColor}`} />
              {STAGES[stage].title}
            </motion.span>
          </AnimatePresence>
        </div>
        <span className="rounded-full border border-border-primary px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted">
          Representative scenario
        </span>
      </div>

      {/* Stage subtitle */}
      <div className="overflow-hidden rounded-2xl border border-border-primary bg-bg-primary/60 p-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={stage}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="text-xs leading-relaxed text-text-secondary"
          >
            {STAGES[stage].sub}
          </motion.p>

          <motion.ul
            key={`list-${stage}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="mt-4 space-y-2"
          >
            {items.map((c, i) => (
              <ChangeRow
                key={c.label}
                index={i}
                label={c.label}
                domain={c.domain}
                stage={stage}
              />
            ))}
          </motion.ul>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {STAGES.map((s) => (
            <div
              key={s.key}
              className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                stage >= s.key ? "bg-accent" : "bg-border-primary"
              }`}
            />
          ))}
        </div>
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted">
          {`0:0${stage * 3}`}
        </span>
      </div>
    </div>
  );
}

function ChangeRow({
  index,
  label,
  domain,
  stage,
}: {
  index: number;
  label: string;
  domain: Domain;
  stage: Stage;
}) {
  const isReversed = stage === 3 && index < 6; // cascade green from top
  const reverseDelay = stage === 3 ? 0.15 + index * 0.18 : 0;
  const showBadge = stage >= 1;
  const showSequence = stage >= 2;

  return (
    <motion.li
      layout
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
      className="flex items-center gap-3 rounded-xl border border-border-primary/70 bg-bg-surface/60 px-3 py-2"
    >
      {/* Sequence number — appears stage 2+ */}
      <motion.span
        animate={{
          opacity: showSequence ? 1 : 0,
          width: showSequence ? 22 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-center overflow-hidden text-[10px] font-bold tabular-nums text-text-muted"
      >
        {showSequence ? `0${index + 1}` : ""}
      </motion.span>

      {/* Label */}
      <span
        className={`flex-1 text-xs leading-relaxed transition-colors duration-300 ${
          isReversed
            ? "text-text-muted line-through"
            : stage === 0
            ? "text-red-300"
            : "text-text-primary"
        }`}
      >
        {label}
      </span>

      {/* Domain badge — appears stage 1+ */}
      <motion.span
        animate={{
          opacity: showBadge ? 1 : 0,
          width: showBadge ? "auto" : 0,
        }}
        transition={{ duration: 0.3 }}
        className={`overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${DOMAIN_TONE[domain]}`}
      >
        {domain}
      </motion.span>

      {/* Status dot */}
      <motion.span
        animate={{
          backgroundColor:
            stage === 0
              ? "rgb(248 113 113)" // red-400
              : stage === 1
              ? "rgb(251 191 36)" // amber-400
              : stage === 2
              ? "rgb(56 189 248)" // accent (sky-400)
              : "rgb(52 211 153)", // emerald-400
          scale: stage === 3 ? [1, 1.4, 1] : 1,
        }}
        transition={{
          backgroundColor: { duration: 0.5, delay: reverseDelay },
          scale: { duration: 0.4, delay: reverseDelay },
        }}
        className="h-2 w-2 flex-shrink-0 rounded-full"
      />
    </motion.li>
  );
}
