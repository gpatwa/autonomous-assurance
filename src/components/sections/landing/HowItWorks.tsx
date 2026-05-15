"use client";

import { motion } from "framer-motion";
import { staggerContainer } from "@/lib/animations";
import SectionHeader from "@/components/ui/SectionHeader";
import ProcessStep from "@/components/ui/ProcessStep";

/**
 * Section 7 — How it works.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 7
 * Four operator-approved, identity-first steps.
 */
export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative bg-bg-surface/40 py-24 sm:py-28 scroll-mt-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label="How it works"
          title="How KavachIQ recovers your environment."
          subtitle="Plugged in behind your existing detection layer. Invoked when the alert fires. Restores trusted state before the war room convenes."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-2xl"
        >
          <ProcessStep
            step={1}
            title="Connect to your detection layer"
            description="KavachIQ ingests incidents from Microsoft Sentinel, Defender, Purview, or your SIEM/SOAR. We run downstream of detection — not as a replacement for it."
          />
          <ProcessStep
            step={2}
            title="Map the blast radius"
            description="Every identity, sharing, permission, conditional access, and data change attributed to the agent's session — across Entra ID, SharePoint, OneDrive, Teams, and Exchange — modeled as a dependency graph."
          />
          <ProcessStep
            step={3}
            title="Propose an identity-first reversal plan"
            description="KavachIQ proposes a dependency-ordered reversal — identity first, then permissions, sharing, conditional access, and data — so revoking access does not lock out a Global Admin and undoing a share does not break an active collaboration."
          />
          <ProcessStep
            step={4}
            title="Approve, execute, and validate"
            description="Your operator reviews and approves the plan. Each reversal is executed and validated against expected state. An exportable evidence pack is generated for the auditor, the board, and your post-mortem."
            isLast
          />
        </motion.div>
      </div>
    </section>
  );
}
