"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 9 — Roadmap signal.
 *
 * Copy: docs/PLATFORM_PAGE_COPY_V1.md § SECTION 9
 * Three-stage roadmap: Today / Q3 2026 / Late 2026.
 */
const STAGES: {
  label: string;
  covers: string;
  status: string;
  statusTone: string;
}[] = [
  {
    label: "Today",
    covers:
      "Microsoft Entra + Microsoft 365 (SharePoint, OneDrive, Teams, Exchange, Conditional Access, DLP)",
    status: "Shipped",
    statusTone: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
  {
    label: "Q3 2026",
    covers:
      "Copilot Studio agents · Entra Agent ID coverage · Custom-agent attribution via Microsoft Graph",
    status: "In progress",
    statusTone: "border-accent/40 bg-accent/10 text-accent",
  },
  {
    label: "Late 2026",
    covers:
      "Salesforce Agentforce · ServiceNow Now Assist · Adjacent agent platforms",
    status: "On the roadmap",
    statusTone: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
];

export default function PlatformRoadmap() {
  return (
    <section className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Roadmap
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Microsoft 365 today. More agent surfaces over time.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            KavachIQ&apos;s recovery model extends past M365 — but only after we&apos;ve
            earned the right.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 overflow-hidden rounded-[28px] border border-border-primary bg-bg-surface/55"
        >
          <div className="hidden border-b border-border-primary px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted md:grid md:grid-cols-[0.6fr_2fr_0.6fr] md:gap-6">
            <p>Stage</p>
            <p>What it covers</p>
            <p>Status</p>
          </div>

          <div className="divide-y divide-border-primary/60">
            {STAGES.map((s) => (
              <motion.div
                key={s.label}
                variants={fadeUp}
                className="grid gap-3 px-6 py-6 md:grid-cols-[0.6fr_2fr_0.6fr] md:items-center md:gap-6"
              >
                <p className="text-base font-semibold text-text-primary">
                  {s.label}
                </p>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {s.covers}
                </p>
                <span
                  className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${s.statusTone}`}
                >
                  {s.status}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <p className="mt-10 text-center text-base leading-relaxed text-text-primary sm:text-lg">
          Each platform earns its place by depth, not breadth. We do Microsoft 365
          better than anyone before we add anything else.
        </p>
      </div>
    </section>
  );
}
