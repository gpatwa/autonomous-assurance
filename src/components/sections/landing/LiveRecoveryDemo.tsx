"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";
import Button from "@/components/ui/Button";
import RecoveryWalkthrough from "@/components/visuals/RecoveryWalkthrough";
import { track } from "@/lib/analytics";

/**
 * Section 5 — Live recovery demo.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 5
 * The flagship "show, don't tell" moment of the page.
 *
 * NOTE(asset): The narrated demo video is not yet produced. This component
 * renders a captioned placeholder that conveys the three-step recovery flow.
 * Replace the placeholder block with a real <video> embed when the asset is ready.
 */
const CAPTION_STEPS: { lead: string; body: string }[] = [
  {
    lead: "Alert ingested.",
    body:
      "KavachIQ accepts the incident signal from your existing detection layer (Sentinel, Purview, Defender, or your SIEM/SOAR).",
  },
  {
    lead: "Blast radius mapped.",
    body:
      "Every identity, sharing, permission, conditional access, and data change attributed to the agent's session — across Entra ID, SharePoint, OneDrive, Teams, and Exchange.",
  },
  {
    lead: "Recovery proposed, approved, and validated.",
    body:
      "Your operator reviews the dependency-ordered reversal plan, approves, and executes. Trusted state is validated; an evidence pack is generated for audit and compliance.",
  },
];

export default function LiveRecoveryDemo() {
  return (
    <section
      id="live-recovery-demo"
      className="relative py-24 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Walkthrough
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Walk through a recovery.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            A Microsoft 365 tenant. An AI agent makes dozens of changes — group
            memberships, sharing links, permission grants, conditional access exemptions.
            KavachIQ attributes each change to the agent&apos;s session and proposes a
            dependency-ordered reversal plan. Your operator reviews, approves, and
            executes — with validation and full evidence.
          </p>
        </motion.div>

        {/* Inline animated walkthrough — auto-advances through the four-stage flow.
            Replaces the earlier video placeholder. When a produced video is ready, swap
            <RecoveryWalkthrough /> for a <video> element here. */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-12 overflow-hidden rounded-[28px] border border-border-primary bg-bg-surface/70 p-6 shadow-[0_0_40px_rgba(8,15,35,0.5)]"
        >
          <RecoveryWalkthrough />
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-10 grid gap-4 md:grid-cols-3"
        >
          {CAPTION_STEPS.map((step, i) => (
            <motion.div
              key={step.lead}
              variants={fadeUp}
              className="rounded-2xl border border-border-primary bg-bg-surface/55 p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">
                Step {i + 1}
              </p>
              <p className="mt-2 text-sm font-semibold text-text-primary">{step.lead}</p>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                {step.body}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-10 flex flex-col items-center gap-3 text-center"
        >
          <p className="text-sm text-text-secondary">
            Want to walk through a recovery scenario with us?
          </p>
          <Button
            variant="primary"
            size="md"
            href="#request-demo"
            onClick={() =>
              track("cta_click", {
                page: "homepage",
                label: "Book a recovery walkthrough",
              })
            }
          >
            Book a recovery walkthrough
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
