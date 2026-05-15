"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";
import SectionHeader from "@/components/ui/SectionHeader";

/**
 * Section 9 — Who it's for.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 9
 * Maps to budget owners: CISO, DFIR, VP Identity / M365 Admin, CFO / Risk.
 */
const ROLES: { role: string; body: string }[] = [
  {
    role: "CISO",
    body:
      "A defensible MTTR (mean time to restore trusted state) for AI-agent incidents. Quantified recovery you can take to the board.",
  },
  {
    role: "DFIR / Incident Response Lead",
    body:
      "A single recovery pane — agent attribution, dependency-ordered reversal plan, approval workflow, and post-recovery validation.",
  },
  {
    role: "VP Identity / M365 Admin",
    body:
      "A safety net for Copilot, Copilot Studio, Entra Agent ID, and custom agents — keep your adoption velocity and your audit posture.",
  },
  {
    role: "CFO / Risk Officer",
    body:
      "A measurable recovery posture for agentic-AI risk. Insurable, auditable, and board-defensible.",
  },
];

export default function WhoItsFor() {
  return (
    <section className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label="Who it's for"
          title="Who KavachIQ is for."
          subtitle="Built for the people who get the call at 2:47 a.m."
        />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2"
        >
          {ROLES.map((r) => (
            <motion.div
              key={r.role}
              variants={fadeUp}
              className="rounded-2xl border border-border-primary bg-bg-surface/55 p-5"
            >
              <p className="text-sm font-semibold text-text-primary">{r.role}</p>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{r.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
