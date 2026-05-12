"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";
import Button from "@/components/ui/Button";
import GridPattern from "@/components/visuals/GridPattern";
import HeroRecoveryAnimation from "@/components/visuals/HeroRecoveryAnimation";
import { track } from "@/lib/analytics";

/**
 * Section 1 — Hero.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 1
 * Wedge: "The undo button for AI-agent incidents."
 */
export default function RecoveryHero() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32 lg:py-40">
      <GridPattern />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.06),transparent_60%)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-secondary"
            >
              <span className="h-2 w-2 rounded-full bg-accent" />
              Agentic Incident Recovery for Microsoft 365
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-8 text-4xl font-bold leading-[1.05] tracking-tight text-text-primary sm:text-5xl lg:text-6xl"
            >
              The undo button for{" "}
              <span className="text-accent">AI-agent incidents.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary sm:text-xl"
            >
              When an AI agent makes harmful changes, your team has minutes before the
              blast radius cascades across identity, sharing, permissions, and data.
              KavachIQ attributes every change to the agent&apos;s session and guides your
              operators through approval-gated, dependency-ordered reversal — with full audit.
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-4 max-w-2xl text-sm leading-relaxed text-text-muted"
            >
              Built first for Microsoft 365 — where 80% of agentic risk lives today.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-4">
              <Button
                variant="primary"
                size="lg"
                href="#live-recovery-demo"
                onClick={() => track("cta_click", { page: "homepage", label: "See a recovery" })}
              >
                See a recovery
              </Button>
              <Button
                variant="secondary"
                size="lg"
                href="#request-demo"
                onClick={() => track("cta_click", { page: "homepage", label: "Request a Demo" })}
              >
                Request a demo
              </Button>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="hidden lg:block"
          >
            <HeroRecoveryAnimation />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
