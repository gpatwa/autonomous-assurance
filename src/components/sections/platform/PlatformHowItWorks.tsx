"use client";

import { motion } from "framer-motion";
import { staggerContainer } from "@/lib/animations";
import SectionHeader from "@/components/ui/SectionHeader";
import ProcessStep from "@/components/ui/ProcessStep";

/**
 * Section 6 — How the platform operates.
 *
 * Copy: docs/PLATFORM_PAGE_COPY_V1.md § SECTION 6
 * Anchor: #how-it-works
 *
 * Same 4-step flow as homepage HowItWorks, with operator-grade detail.
 */
export default function PlatformHowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 sm:py-28 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label="How it works"
          title="How the platform operates inside your tenant."
          subtitle="Same four-step flow as the homepage, with operator-grade detail."
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
            description="KavachIQ ingests incident signals from Microsoft Sentinel, Microsoft Defender for Cloud Apps, Microsoft Purview, or your SIEM/SOAR. We run downstream of detection — your existing alert posture stays in place. Integrations are configured per tenant via Microsoft Graph and a webhook from your SOAR."
          />
          <ProcessStep
            step={2}
            title="Map the blast radius"
            description="KavachIQ correlates the alert to the originating agent's session and walks the dependency graph across Entra ID, SharePoint, OneDrive, Teams, Exchange, Conditional Access, and DLP. Every change in the agent's window is attributed, classified, and graphed."
          />
          <ProcessStep
            step={3}
            title="Propose an identity-first reversal plan"
            description="The plan is dependency-ordered: identity changes first, then permissions, then sharing and conditional access, then data. The graph respects what depends on what — so revoking access does not lock out a Global Admin, and undoing a share does not break an active collaboration."
          />
          <ProcessStep
            step={4}
            title="Approve, execute, and validate"
            description="Your operator reviews the proposed plan and approves before any change is made. KavachIQ executes the reversal one step at a time and validates the result against expected state. The full operation — every step, every operator action — is recorded in an exportable evidence pack for the auditor, the board, and your post-mortem."
            isLast
          />
        </motion.div>
      </div>
    </section>
  );
}
