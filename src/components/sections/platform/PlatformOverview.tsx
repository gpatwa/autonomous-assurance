"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 2 — Platform overview.
 *
 * Copy: docs/PLATFORM_PAGE_COPY_V1.md § SECTION 2
 * Three-column comparison: Detection / Backup / KavachIQ.
 */
const COLUMNS: {
  title: string;
  examples: string;
  job: string;
  posture: string;
  featured?: boolean;
}[] = [
  {
    title: "Detection",
    examples:
      "Microsoft Purview AI Observability, Defender for Cloud Apps, Microsoft Sentinel, Zenity, WitnessAI.",
    job: "Tells you something happened.",
    posture: "Alert source for KavachIQ.",
  },
  {
    title: "Backup",
    examples: "Microsoft 365 Backup, Rubrik, Cohesity, Veeam.",
    job: "Restores data to a point in time.",
    posture: "Complementary — different blast radius, different remediation.",
  },
  {
    title: "KavachIQ",
    examples:
      "Operational recovery of the specific configuration and access changes an AI agent made.",
    job: "Reverses only the agent's actions, in dependency order, with operator approval.",
    posture: "The missing layer between detection and trusted state.",
    featured: true,
  },
];

export default function PlatformOverview() {
  return (
    <section className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Platform overview
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Where KavachIQ sits in your stack.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            Three layers, three jobs. KavachIQ is the layer you don&apos;t have yet.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 grid gap-5 lg:grid-cols-3"
        >
          {COLUMNS.map((col) => (
            <motion.div
              key={col.title}
              variants={fadeUp}
              className={`flex h-full flex-col rounded-2xl border p-6 ${
                col.featured
                  ? "border-accent/30 bg-accent/5"
                  : "border-border-primary bg-bg-surface/55"
              }`}
            >
              <p
                className={`text-sm font-semibold uppercase tracking-[0.18em] ${
                  col.featured ? "text-accent" : "text-text-muted"
                }`}
              >
                {col.title}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                {col.examples}
              </p>
              <p
                className={`mt-4 text-sm leading-relaxed ${
                  col.featured ? "text-text-primary font-medium" : "text-text-secondary"
                }`}
              >
                {col.job}
              </p>
              <p className="mt-auto pt-4 text-xs leading-relaxed text-text-muted">
                {col.posture}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <p className="mt-10 text-center text-base font-semibold text-text-primary sm:text-lg">
          Detection vendors and backup vendors are partners, not competitors.
          KavachIQ runs between them.
        </p>
      </div>
    </section>
  );
}
