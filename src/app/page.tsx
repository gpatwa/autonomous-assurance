"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";
import Button from "@/components/ui/Button";
import SectionHeader from "@/components/ui/SectionHeader";
import ValueCard from "@/components/ui/ValueCard";
import PillarCard from "@/components/ui/PillarCard";
import ProcessStep from "@/components/ui/ProcessStep";
import CTABlock from "@/components/ui/CTABlock";
import HeroVisual from "@/components/visuals/HeroVisual";
import GridPattern from "@/components/visuals/GridPattern";
import NodeGraph from "@/components/visuals/NodeGraph";

// ─── Icons ───────────────────────────────────────────────────────────────────
function EyeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RadiusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <path d="M12 8v4" />
      <path d="M5 16v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <>
      {/* ─── 1. Hero ─────────────────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32 lg:py-40 overflow-hidden">
        <GridPattern />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.06),transparent_60%)]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
            >
              <motion.h1
                variants={fadeUp}
                className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-text-primary leading-[1.1]"
              >
                Deploy AI agents with{" "}
                <span className="text-accent">confidence</span>
              </motion.h1>
              <motion.p
                variants={fadeUp}
                className="mt-6 text-lg sm:text-xl text-text-secondary leading-relaxed max-w-xl"
              >
                KavachIQ Autonomous Assurance protects identity, access, and
                systems of record from harmful autonomous change.
              </motion.p>
              <motion.div
                variants={fadeUp}
                className="mt-10 flex flex-wrap gap-4"
              >
                <Button variant="primary" size="lg" href="#request-demo">
                  Request a Demo
                </Button>
                <Button variant="secondary" size="lg" href="#how-it-works">
                  See How It Works
                </Button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="hidden lg:block"
            >
              <HeroVisual />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 2. Problem Statement ────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <SectionHeader
              label="The Challenge"
              title="AI agents are moving from answering questions to taking actions"
            />
            <motion.p
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className="text-lg text-text-secondary leading-relaxed"
            >
              They can create users, change access, modify records, update
              files, and trigger workflows across critical enterprise systems.
              KavachIQ Autonomous Assurance helps your team understand what
              changed, assess impact, and recover safely to a known-good state.
            </motion.p>
          </div>
        </div>
      </section>

      {/* ─── 3. Value Props ──────────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32 bg-bg-surface/50">
        <GridPattern />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="Core Value"
            title="Assurance across the full chain of impact"
          />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid md:grid-cols-3 gap-8"
          >
            <ValueCard
              icon={<EyeIcon />}
              title="Recover from harmful autonomous actions"
              description="See every critical change made by agents across identity, data, and connected business systems."
            />
            <ValueCard
              icon={<RadiusIcon />}
              title="Understand blast radius before acting"
              description="Know what was affected, what depends on it, and what the safest recovery path looks like."
            />
            <ValueCard
              icon={<RestoreIcon />}
              title="Restore with business context"
              description="Coordinate rollback, restoration, and compensating actions across systems so recovery is accurate, not manual guesswork."
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 4. Why Now ──────────────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32" id="why-now">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              <motion.span
                variants={fadeUp}
                className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4"
              >
                Why Now
              </motion.span>
              <motion.h2
                variants={fadeUp}
                className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-text-primary"
              >
                The missing layer for production autonomy
              </motion.h2>
              <motion.p
                variants={fadeUp}
                className="mt-6 text-lg text-text-secondary leading-relaxed"
              >
                Observability tells you what happened. Backup restores
                individual systems. Governance sets rules. But when AI agents
                act across identity, access, and systems of record, enterprises
                need a way to recover from harmful change across the full chain
                of impact. KavachIQ Autonomous Assurance is that layer.
              </motion.p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7 }}
            >
              <NodeGraph className="opacity-80" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 5. Product Pillars ──────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32 bg-bg-surface/50">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="Product Pillars"
            title="Built for enterprise-critical systems"
          />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid md:grid-cols-3 gap-8"
          >
            <PillarCard
              icon={<ShieldIcon />}
              title="Identity Assurance for Microsoft Entra"
              description="Recover safely from agent-driven changes to users, groups, app access, service principals, and identity policies."
            />
            <PillarCard
              icon={<DatabaseIcon />}
              title="Data Assurance for Microsoft 365"
              description="Recover safely from harmful autonomous changes across SharePoint, OneDrive, Exchange, and connected collaboration workflows."
            />
            <PillarCard
              icon={<NetworkIcon />}
              title="Cross-System Assurance"
              description="Trace autonomous change across identity and downstream systems, then coordinate the safest path back to a known-good state."
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 6. How It Works ─────────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32" id="how-it-works">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="How It Works"
            title="Capture, assess, and recover"
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
              title="Capture autonomous change"
              description="Track critical agent-driven actions across enterprise systems with full operational context."
            />
            <ProcessStep
              step={2}
              title="Analyze impact"
              description="Map affected identities, systems, permissions, records, and content to understand blast radius."
            />
            <ProcessStep
              step={3}
              title="Recover safely"
              description="Execute rollback, restoration, or compensating recovery actions in the right order."
              isLast
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 7. Closing CTA ──────────────────────────────────────────────── */}
      <CTABlock
        headline="Move faster with production confidence"
        body="Let AI agents operate with the assurance your enterprise needs."
        ctaText="Request a Demo"
      />
    </>
  );
}
