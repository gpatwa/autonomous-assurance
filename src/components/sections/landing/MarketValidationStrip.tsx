"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 8 — Market validation strip.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 8
 * Three-stat row reinforcing the category claim. Closes with a wedge restatement.
 */
const STATS: { lead: string; body: string; source: string }[] = [
  {
    lead: "Gartner",
    body: "named “Agentic AI Governance” as a category in the 2026 Hype Cycle.",
    source: "Gartner 2026",
  },
  {
    lead: "$96B",
    body: "in identity and AI security M&A activity in 2025.",
    source: "Public market data",
  },
  {
    lead: "$3.6B",
    body:
      "invested in AI-agent security startups in 2025 — and not one focused on recovery.",
    source: "Software Strategies",
  },
];

export default function MarketValidationStrip() {
  return (
    <section className="relative bg-bg-surface/40 py-20 sm:py-24">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        <div className="grid gap-5 md:grid-cols-3">
          {STATS.map((s) => (
            <motion.div
              key={s.lead}
              variants={fadeUp}
              className="rounded-2xl border border-border-primary bg-bg-primary/50 p-6"
            >
              <p className="text-2xl font-bold tracking-tight text-accent sm:text-3xl">
                {s.lead}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {s.body}
              </p>
              <p className="mt-4 text-[11px] uppercase tracking-[0.15em] text-text-muted">
                {s.source}
              </p>
            </motion.div>
          ))}
        </div>

        <p className="mt-10 text-center text-base font-semibold text-text-primary sm:text-lg">
          KavachIQ is the recovery layer in this stack. The one no one else is building.
        </p>
      </motion.div>
    </section>
  );
}
