"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 4 — The recovery gap.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 4
 * Differentiation from detection. Two-column table + 2:47 a.m. emotional hook.
 */
const ROWS: { left: { lead: string; body: string }; right: { lead: string; body: string } }[] = [
  {
    left: {
      lead: "Detection.",
      body:
        "Purview, Defender, Zenity, Sentinel, WitnessAI tell you something went wrong.",
    },
    right: {
      lead: "Recovery.",
      body: "KavachIQ runs downstream of detection — picking up where the alert ends.",
    },
  },
  {
    left: {
      lead: "Audit logs.",
      body: "Microsoft 365 logs every action — useful in forensics, slow in an incident.",
    },
    right: {
      lead: "Operational rollback.",
      body:
        "Scoped to the agent's session. Dependency-ordered. Operator-approved.",
    },
  },
  {
    left: {
      lead: "War rooms.",
      body:
        "Hours, multiple engineers, a runbook that doesn't quite fit this incident.",
    },
    right: {
      lead: "Guided reversal.",
      body:
        "Identity-first sequencing, approval gates, validated state, full evidence.",
    },
  },
];

export default function RecoveryGap() {
  return (
    <section className="relative bg-bg-surface/40 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            The recovery gap
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Everyone detects. No one undoes.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            The alert just fired at 2:47 a.m. By 2:48 you&apos;re staring at 47 identity,
            sharing, and permission changes an AI agent made in the last 6 hours.{" "}
            <span className="font-semibold text-text-primary">Now what?</span>
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 overflow-hidden rounded-[28px] border border-border-primary bg-bg-primary/60 shadow-[0_0_40px_rgba(8,15,35,0.45)]"
        >
          <div className="hidden border-b border-border-primary px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted md:grid md:grid-cols-2 md:gap-6">
            <p>You already pay for</p>
            <p>Now you need</p>
          </div>

          <div className="divide-y divide-border-primary/60">
            {ROWS.map((row, idx) => (
              <motion.div
                key={idx}
                variants={fadeUp}
                className="grid gap-5 px-6 py-6 md:grid-cols-2 md:gap-8 md:py-7"
              >
                <div>
                  <p className="text-sm font-semibold text-text-primary">{row.left.lead}</p>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {row.left.body}
                  </p>
                </div>
                <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
                  <p className="text-sm font-semibold text-accent">{row.right.lead}</p>
                  <p className="mt-2 text-sm leading-relaxed text-text-primary">
                    {row.right.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <p className="mt-10 text-center text-base font-semibold text-text-primary sm:text-lg">
          Detection is mature. Operational recovery is the missing layer.
        </p>
      </div>
    </section>
  );
}
