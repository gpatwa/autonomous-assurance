"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";
import Button from "@/components/ui/Button";
import GridPattern from "@/components/visuals/GridPattern";
import RecoveryFlowVisual from "@/components/visuals/RecoveryFlowVisual";
import { track } from "@/lib/analytics";

/**
 * Section 1 — Hero.
 *
 * Copy: docs/PLATFORM_PAGE_COPY_V1.md § SECTION 1
 * Depth-page voice: less marketing, more operational specificity.
 */
export default function PlatformHero() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32 lg:py-40">
      <GridPattern />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.06),transparent_60%)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
            <motion.span
              variants={fadeUp}
              className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4"
            >
              Platform
            </motion.span>

            <motion.h1
              variants={fadeUp}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-text-primary leading-[1.1]"
            >
              Operational recovery for{" "}
              <span className="text-accent">AI-agent incidents</span> in Microsoft 365.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary"
            >
              KavachIQ runs downstream of your detection layer. When an agent&apos;s
              actions land — across Entra, SharePoint, OneDrive, Exchange, Teams,
              Conditional Access, and DLP — KavachIQ attributes every change to the
              agent&apos;s session, proposes an identity-first reversal plan, and
              validates the result after operator approval.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-4">
              <Button
                variant="primary"
                size="lg"
                href="#request-demo"
                onClick={() => track("cta_click", { page: "platform", label: "Request a Demo" })}
              >
                Request a demo
              </Button>
              <Button
                variant="secondary"
                size="lg"
                href="#platform-proof"
                onClick={() =>
                  track("cta_click", { page: "platform", label: "See the recovery surface" })
                }
              >
                See the recovery surface
              </Button>
            </motion.div>
          </motion.div>

          <RecoveryFlowVisual />
        </div>
      </div>
    </section>
  );
}
