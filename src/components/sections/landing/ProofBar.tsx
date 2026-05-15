"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 2 — Proof bar.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 2
 * Three sourced numbers establishing authority right under the hero.
 */
const TILES: { lead: string; body: string; source: string; emphasis?: boolean }[] = [
  {
    lead: "80% / 10%",
    body: "of the Fortune 500 use AI agents in production. Only 10% have a governance program.",
    source: "Microsoft Cyber Pulse, Feb 2026",
  },
  {
    lead: "$3.6B",
    body: "raised by AI-agent security startups in 2025. The market is voting.",
    source: "Software Strategies, Mar 2026",
  },
  {
    lead: "“Not whether, but who.”",
    body:
      "“An agentic AI public breach is not a question of whether, but which organization will be first.”",
    source: "Forrester 2026 Predictions",
    emphasis: true,
  },
];

export default function ProofBar() {
  return (
    <section className="relative border-y border-border-primary bg-bg-surface/40 py-14">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 md:grid-cols-3 lg:px-8"
      >
        {TILES.map((tile) => (
          <motion.div
            key={tile.lead}
            variants={fadeUp}
            className={`rounded-2xl border p-6 ${
              tile.emphasis
                ? "border-accent/30 bg-accent/5"
                : "border-border-primary bg-bg-primary/40"
            }`}
          >
            <p
              className={`text-2xl font-bold leading-tight tracking-tight ${
                tile.emphasis ? "text-text-primary" : "text-accent"
              } sm:text-3xl`}
            >
              {tile.lead}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              {tile.body}
            </p>
            <p className="mt-4 text-[11px] uppercase tracking-[0.15em] text-text-muted">
              {tile.source}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
