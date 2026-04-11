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
import RecoveryFlowVisual from "@/components/visuals/RecoveryFlowVisual";

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

const comparisonRows: { layer: string; does: string; stops: string; featured?: boolean }[] = [
  {
    layer: "Observability",
    does: "Shows what happened after the fact.",
    stops: "Does not restore business state or coordinate recovery.",
  },
  {
    layer: "Backup",
    does: "Restores individual systems or objects.",
    stops: "Usually not agent-aware and rarely cross-system.",
  },
  {
    layer: "Governance",
    does: "Sets rules, permissions, and approvals.",
    stops: "Does not unwind harmful agent-driven change once it lands.",
  },
  {
    layer: "KavachIQ Autonomous Assurance",
    does: "Captures change, maps impact, and coordinates safe recovery.",
    stops: "Built for identity, access, systems of record, and connected business platforms.",
    featured: true,
  },
];

export default function HomePageContent() {
  return (
    <>
      {/* ─── 1. Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 sm:py-32 lg:py-40">
        <GridPattern />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.06),transparent_60%)]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
              <motion.div variants={fadeUp} className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-secondary">
                <span className="h-2 w-2 rounded-full bg-accent" />
                Built for Microsoft Entra, Microsoft 365, and the systems around them
              </motion.div>
              <motion.h1
                variants={fadeUp}
                className="mt-8 text-4xl font-bold leading-[1.05] tracking-tight text-text-primary sm:text-5xl lg:text-6xl"
              >
                Deploy AI agents with <span className="text-accent">confidence</span>
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary sm:text-xl">
                KavachIQ Autonomous Assurance helps enterprises understand, contain, and recover from agent-driven changes across identity, access, systems of record, and connected enterprise platforms.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-4">
                <Button variant="primary" size="lg" href="#request-demo">
                  Request a Demo
                </Button>
                <Button variant="secondary" size="lg" href="#how-it-works">
                  See How It Works
                </Button>
              </motion.div>
              <motion.div variants={fadeUp} className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-3">
                {[
                  ["Identity-first", "Entra users, groups, app access, and service principals"],
                  ["Data-aware", "SharePoint, OneDrive, Exchange, and permission impact"],
                  ["Recovery-led", "Rollback, restoration, and compensating actions"],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl border border-border-primary bg-bg-surface/70 p-4">
                    <p className="text-sm font-semibold text-text-primary">{title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="hidden lg:block"
            >
              <HeroVisual />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 2. What the Product Does ────────────────────────────────────── */}
      <section className="relative py-24 sm:py-28 bg-bg-surface/40">
        {/* Top edge gradient for a clear transition from the hero */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border-primary to-transparent" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-bg-surface/30 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <SectionHeader
                label="What the product does"
                align="left"
                title="Turn agent-driven change into something your team can actually recover from"
                subtitle="KavachIQ links agent actions to the identity and data changes they trigger. Teams can trace the originating workflow, see the blast radius, and choose the safest recovery path without guessing through logs or restoring systems one by one."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Capture", "Agent, session, target object, and before or after state"],
                  ["Assess", "Blast radius across Entra, Microsoft 365, and downstream systems"],
                  ["Recover", "Rollback, restore, or compensate in the right order"],
                  ["Govern", "Keep operators in control of high-risk recovery decisions"],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl border border-border-primary bg-bg-surface/55 p-5">
                    <p className="text-base font-semibold text-text-primary">{title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
                  </div>
                ))}
              </div>
            </div>
            <RecoveryFlowVisual />
          </div>
        </div>
      </section>

      {/* ─── 3. Problem Statement ────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-28">
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
              className="text-lg leading-relaxed text-text-secondary"
            >
              They can create users, change access, update records, modify files, and trigger workflows across critical enterprise systems. KavachIQ helps teams see what changed, understand what else was affected, and recover safely to a trusted state.
            </motion.p>
          </div>
        </div>
      </section>

      {/* ─── 4. Value Props ──────────────────────────────────────────────── */}
      <section className="relative bg-bg-surface/50 py-24 sm:py-28">
        <GridPattern />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader label="Core Value" title="Assurance across the full chain of impact" />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid gap-8 md:grid-cols-3"
          >
            <ValueCard
              icon={<EyeIcon />}
              title="Recover from harmful agent actions"
              description="See critical changes across identity, data, and connected business systems."
            />
            <ValueCard
              icon={<RadiusIcon />}
              title="Understand blast radius before acting"
              description="Know what was affected, what depends on it, and what recovery path is safest."
            />
            <ValueCard
              icon={<RestoreIcon />}
              title="Restore with business context"
              description="Coordinate rollback, restoration, and compensating actions across systems."
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 5. Why KavachIQ (Comparison Table) ──────────────────────────── */}
      <section className="relative py-24 sm:py-28" id="why-kavachiq">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-14 lg:grid-cols-[0.88fr_1.12fr]">
            <div>
              <SectionHeader
                label="Why KavachIQ"
                align="left"
                title="The missing layer between AI automation and business recovery"
                subtitle="Observability shows what happened. Backup restores individual systems. Governance sets rules and approvals. KavachIQ connects those layers with recovery built for agent-driven change across identity, access, systems of record, and connected enterprise platforms."
              />
            </div>
            <div className="overflow-hidden rounded-[28px] border border-border-primary bg-bg-surface/70 p-4 shadow-[0_0_40px_rgba(8,15,35,0.45)]">
              {/* Column headers — visible on md+ */}
              <div className="mb-2 hidden gap-3 px-5 md:grid md:grid-cols-[1.15fr_1fr_1fr]">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">Layer</p>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">What it does</p>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">Where it stops</p>
              </div>
              <div className="grid gap-3">
                {comparisonRows.map((row) => (
                  <div
                    key={row.layer}
                    className={`grid gap-3 rounded-2xl border px-5 py-5 md:grid-cols-[1.15fr_1fr_1fr] ${
                      row.featured
                        ? "border-accent/30 bg-accent/10 shadow-[0_0_24px_rgba(56,189,248,0.07)]"
                        : "border-border-primary bg-bg-primary/55"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${row.featured ? "text-accent" : "text-text-primary"}`}>{row.layer}</p>
                    <p className="text-sm leading-relaxed text-text-secondary">{row.does}</p>
                    <p className={`text-sm leading-relaxed ${row.featured ? "text-text-primary" : "text-text-muted"}`}>{row.stops}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 6. Product Pillars ──────────────────────────────────────────── */}
      <section className="relative bg-bg-surface/50 py-24 sm:py-28">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="Product Pillars"
            title="Built for enterprise-critical systems"
            subtitle="Start where trust breaks first: identity, access, and the systems where business state changes."
          />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid gap-8 md:grid-cols-3"
          >
            <PillarCard
              icon={<ShieldIcon />}
              title="Identity Assurance for Microsoft Entra"
              description="Recover safely from agent-driven changes to users, groups, app access, service principals, and identity policy."
              bullets={[
                "Trace changes across users, groups, applications, and service principals",
                "See downstream access and provisioning impact",
                "Recover the control plane before risk spreads",
              ]}
            />
            <PillarCard
              icon={<DatabaseIcon />}
              title="Data Assurance for Microsoft 365"
              description="Recover safely from harmful agent-driven changes across SharePoint, OneDrive, Exchange, and collaboration workflows."
              bullets={[
                "Map file, mailbox, and permission impact",
                "Restore trusted state across collaboration surfaces",
                "Coordinate recovery with identity-first sequencing",
              ]}
            />
            <PillarCard
              icon={<NetworkIcon />}
              title="Cross-System Assurance"
              description="Trace agent-driven change across identity and downstream systems, then coordinate the safest path back."
              bullets={[
                "Connect incident timelines across systems of record",
                "Guide rollback, restoration, and compensating actions",
                "Keep operators in control of high-risk recovery steps",
              ]}
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 7. How It Works ─────────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-28" id="how-it-works">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="How It Works"
            title="Capture, assess, and recover"
            subtitle="Built for operator-ready incident response, not passive monitoring."
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
              title="Capture agent-driven change"
              description="Track the initiating workflow, changed object, identity surface, and business context."
            />
            <ProcessStep
              step={2}
              title="Analyze impact"
              description="Map affected identities, permissions, records, and content to understand blast radius."
            />
            <ProcessStep
              step={3}
              title="Recover safely"
              description="Execute rollback, restoration, or compensating actions in the right sequence."
              isLast
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 8. Closing CTA ──────────────────────────────────────────────── */}
      <CTABlock
        headline="Start the conversation about safe production AI"
        body="See how KavachIQ helps teams recover from harmful agent-driven change across identity, Microsoft 365, and connected enterprise systems."
        ctaText="Request a Demo"
      />
    </>
  );
}
