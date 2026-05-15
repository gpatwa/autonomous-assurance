"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 5 — Agentic Data Recovery deep dive.
 *
 * Copy: docs/PLATFORM_PAGE_COPY_V1.md § SECTION 5
 * Anchor: #data-assurance
 */
const SURFACES: { lead: string; body: string }[] = [
  {
    lead: "SharePoint and OneDrive",
    body:
      "External sharing links, site-level permissions, file and folder access grants, item-level overrides.",
  },
  {
    lead: "Exchange",
    body:
      "Mailbox delegations, send-as permissions, inbox rules, transport rule changes.",
  },
  {
    lead: "Teams",
    body:
      "Channel and team membership, channel permission changes, guest access, app installations.",
  },
  {
    lead: "DLP and sensitivity labels",
    body:
      "Label modifications, policy scope changes, exception rules, retention label changes.",
  },
  {
    lead: "Recovery posture",
    body:
      "Coordinated with identity restoration, dependency-ordered, operator-approved.",
  },
];

function DatabaseIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

export default function DataAssurance() {
  return (
    <section
      id="data-assurance"
      className="relative bg-bg-surface/40 py-24 sm:py-28 scroll-mt-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-14 lg:grid-cols-[0.95fr_1.05fr]">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="order-2 rounded-[28px] border border-border-primary bg-bg-primary/55 p-6 lg:order-1"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              What KavachIQ handles
            </p>
            <ul className="mt-5 space-y-4">
              {SURFACES.map((s) => (
                <motion.li
                  key={s.lead}
                  variants={fadeUp}
                  className="rounded-2xl border border-border-primary/70 bg-bg-surface/60 p-4"
                >
                  <p className="text-sm font-semibold text-text-primary">{s.lead}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                    {s.body}
                  </p>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="order-1 lg:order-2"
          >
            <motion.div
              variants={fadeUp}
              className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent"
            >
              <DatabaseIcon />
            </motion.div>

            <motion.h2
              variants={fadeUp}
              className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary"
            >
              Agentic Data Recovery for Microsoft 365.
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-2 text-lg font-medium text-accent">
              Where agent damage shows up to end users.
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-6 text-base leading-relaxed text-text-secondary"
            >
              Once identity is restored, the data and collaboration surfaces need
              their own coordinated recovery. An agent that added external sharing
              links to a SharePoint site, modified DLP labels on a finance folder,
              or changed Teams channel permissions has done damage that can&apos;t be
              reversed by snapshot restore without losing the legitimate changes
              that happened alongside.
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-4 text-base leading-relaxed text-text-secondary"
            >
              KavachIQ reverses the specific agent-driven changes on data and
              collaboration surfaces — preserving everything else. Reversal is
              sequenced after identity is restored, so re-granting access in the
              wrong order doesn&apos;t reintroduce risk.
            </motion.p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
