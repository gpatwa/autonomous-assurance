"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";
import Button from "@/components/ui/Button";
import SectionHeader from "@/components/ui/SectionHeader";
import CapabilityCard from "@/components/ui/CapabilityCard";
import ProcessStep from "@/components/ui/ProcessStep";
import CTABlock from "@/components/ui/CTABlock";
import GridPattern from "@/components/visuals/GridPattern";
import RecoveryFlowVisual from "@/components/visuals/RecoveryFlowVisual";

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RadiusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <path d="M12 8v4" />
      <path d="M5 16v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
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

function UsersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-text-secondary">
      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}

const proofCards = [
  {
    title: "Capture",
    body: "Track the initiating agent, session, target object, and before or after state needed for recovery.",
  },
  {
    title: "Assess",
    body: "Map Entra, Microsoft 365, and downstream dependencies to understand impact and recovery order.",
  },
  {
    title: "Recover",
    body: "Coordinate rollback, restoration, and compensating actions so operators can restore a trusted state.",
  },
];

export default function PlatformPageContent() {
  return (
    <>
      {/* ─── 1. Product Hero ─────────────────────────────────────────────── */}
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
                KavachIQ Autonomous <span className="text-accent">Assurance</span>
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-4 text-xl text-text-secondary">
                The assurance layer for AI-driven enterprise operations
              </motion.p>
              <motion.p variants={fadeUp} className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
                As AI agents begin to change identities, modify access, update data, and trigger business workflows, enterprises need more than visibility. They need a way to understand what changed, contain impact, and recover safely across critical systems. KavachIQ Autonomous Assurance is built for that moment.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-4">
                <Button variant="primary" size="lg" href="#request-demo">
                  Talk to the Team
                </Button>
                <Button variant="secondary" size="lg" href="#platform-proof">
                  Explore the Platform
                </Button>
              </motion.div>
            </motion.div>

            <RecoveryFlowVisual />
          </div>
        </div>
      </section>

      {/* ─── 2. Overview ─────────────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <SectionHeader
              label="Overview"
              title="Safe production autonomy starts with recoverability"
              subtitle="The real question is not whether an AI agent can act. It is whether your enterprise can recover when it acts incorrectly. KavachIQ helps teams trace agent-driven change, assess blast radius, and return identity, access, and data to a trusted operational state."
            />
          </div>
        </div>
      </section>

      {/* ─── 3. Product Proof ────────────────────────────────────────────── */}
      <section className="relative bg-bg-surface/50 py-24 sm:py-28" id="platform-proof">
        <GridPattern />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="Product proof"
            title="What the platform captures, assesses, and recovers"
            subtitle="KavachIQ is designed around an operator-ready recovery workflow, not just passive monitoring."
          />
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-6 md:grid-cols-3">
              {proofCards.map((card) => (
                <div key={card.title} className="rounded-[24px] border border-border-primary bg-bg-primary/65 p-6 shadow-[0_0_24px_rgba(7,14,30,0.35)]">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent/85">{card.title}</p>
                  <p className="mt-4 text-lg font-semibold text-text-primary">{card.title} autonomous change with business context</p>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{card.body}</p>
                </div>
              ))}
            </div>
            <div className="rounded-[24px] border border-accent/20 bg-accent/[0.06] p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent/90">Operator view</p>
              <h3 className="mt-4 text-2xl font-semibold text-text-primary">Built for the moment an AI workflow goes wrong</h3>
              <ul className="mt-6 space-y-4 text-sm text-text-secondary">
                <BulletItem>See the initiating agent, session, and target systems before touching recovery.</BulletItem>
                <BulletItem>Understand whether identity, data, or downstream apps must be restored first.</BulletItem>
                <BulletItem>Choose rollback, restore, or compensating actions based on risk and dependency order.</BulletItem>
                <BulletItem>Return to a trusted state instead of restoring isolated objects without context.</BulletItem>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 4. Core Capabilities ────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader label="Capabilities" title="What KavachIQ delivers" />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2"
          >
            <CapabilityCard
              icon={<EyeIcon />}
              title="Autonomous change visibility"
              description="Track critical agent-driven actions with the context needed to understand what changed and why."
            />
            <CapabilityCard
              icon={<RadiusIcon />}
              title="Blast-radius analysis"
              description="Understand which identities, permissions, records, workloads, and downstream systems were affected."
            />
            <CapabilityCard
              icon={<RestoreIcon />}
              title="Recovery orchestration"
              description="Coordinate rollback, restoration, and compensating actions across systems."
            />
            <CapabilityCard
              icon={<CheckCircleIcon />}
              title="Known-good-state restoration"
              description="Return to a trusted operational state, not just isolated objects."
            />
            <CapabilityCard
              icon={<NetworkIcon />}
              title="Cross-system assurance"
              description="Connect identity, access, and data impact into one recovery workflow."
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 5. Identity Assurance for Microsoft Entra ───────────────────── */}
      <section className="relative py-24 sm:py-28" id="identity-assurance">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              <motion.div variants={fadeUp} className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <ShieldIcon />
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
                Identity Assurance for Microsoft Entra
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-2 text-lg font-medium text-accent">
                Protect the control plane of the enterprise
              </motion.p>
              <motion.p variants={fadeUp} className="mt-6 text-lg leading-relaxed text-text-secondary">
                Microsoft Entra is where authority begins. Harmful agent-driven changes to users, groups, app access, service principals, and identity policy can ripple into downstream systems and create security, operational, and compliance risk.
              </motion.p>
              <motion.ul variants={fadeUp} className="mt-8 space-y-3">
                <BulletItem>Trace agent-driven changes across users, groups, applications, and service principals</BulletItem>
                <BulletItem>Understand downstream access, provisioning, and permission fallout</BulletItem>
                <BulletItem>Recover the control plane before restoring impacted data surfaces</BulletItem>
                <BulletItem>Keep operators in control of high-risk identity recovery decisions</BulletItem>
              </motion.ul>
            </motion.div>

            <div className="rounded-[28px] border border-border-primary bg-bg-surface/70 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Users and groups", "Membership drift, privilege expansion, or harmful lifecycle changes."],
                  ["Applications", "App registrations, service principals, and access paths that agents alter."],
                  ["Policies", "Identity controls and settings that shape downstream access and recovery risk."],
                  ["Recovery order", "Restore identity trust first before recovering impacted data surfaces."],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl border border-white/[0.06] bg-bg-primary/50 p-5">
                    <p className="text-base font-semibold text-text-primary">{title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 6. Data Assurance for Microsoft 365 ─────────────────────────── */}
      <section className="relative bg-bg-surface/50 py-24 sm:py-28" id="data-assurance">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div className="order-2 rounded-[28px] border border-border-primary bg-bg-primary/65 p-6 lg:order-1">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["SharePoint and OneDrive", "Trace content, permission, and collaboration changes tied to agent-driven workflows."],
                  ["Exchange", "Understand mailbox, messaging, and communication impact when agents act at scale."],
                  ["Permission fallout", "Connect Microsoft 365 data impact to Entra identity drift and access changes."],
                  ["Trusted operating state", "Coordinate restoration so teams recover the business surface, not just one file or mailbox item."],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl border border-white/[0.06] bg-bg-surface/55 p-5">
                    <p className="text-base font-semibold text-text-primary">{title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
                  </div>
                ))}
              </div>
            </div>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className="order-1 lg:order-2"
            >
              <motion.div variants={fadeUp} className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <DatabaseIcon />
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
                Data Assurance for Microsoft 365
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-2 text-lg font-medium text-accent">
                Recover the systems where business impact shows up
              </motion.p>
              <motion.p variants={fadeUp} className="mt-6 text-lg leading-relaxed text-text-secondary">
                AI agents increasingly touch SharePoint, OneDrive, Exchange, and collaboration workflows. Harmful changes to files, permissions, content, or messaging can disrupt operations quickly and make recovery harder if teams respond system by system. Over time, the same recovery model can extend into adjacent SaaS platforms and downstream business systems.
              </motion.p>
              <motion.ul variants={fadeUp} className="mt-8 space-y-3">
                <BulletItem>Identify harmful changes across Microsoft 365 workloads</BulletItem>
                <BulletItem>Understand affected content, permissions, and collaboration dependencies</BulletItem>
                <BulletItem>Coordinate recovery in the right order</BulletItem>
                <BulletItem>Restore a trusted operating state across collaboration surfaces.</BulletItem>
              </motion.ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 7. How the Platform Works ───────────────────────────────────── */}
      <section className="relative py-24 sm:py-28" id="how-it-works">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="How the platform works"
            title="Capture, assess, and recover"
            subtitle="The workflow is built to help operators move from incident discovery to confident recovery."
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
              title="Capture"
              description="KavachIQ records critical agent-driven actions across supported systems, including the initiating agent and workflow session."
            />
            <ProcessStep
              step={2}
              title="Assess"
              description="KavachIQ maps blast radius, dependencies, and recovery options across identity, data, and downstream systems."
            />
            <ProcessStep
              step={3}
              title="Recover"
              description="KavachIQ helps operators execute the safest path back to a trusted state through rollback, restoration, and compensating actions."
              isLast
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 8. Audience Section ─────────────────────────────────────────── */}
      <section className="relative bg-bg-surface/50 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              <motion.div variants={fadeUp} className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <UsersIcon />
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
                Built for teams responsible for safe production AI
              </motion.h2>
              <motion.ul variants={fadeUp} className="mt-8 space-y-4">
                <BulletItem>CIO and CTO leaders deploying AI agents into business operations</BulletItem>
                <BulletItem>Security and identity teams protecting enterprise access</BulletItem>
                <BulletItem>Data and platform teams responsible for systems of record</BulletItem>
                <BulletItem>Enterprise architects defining safe autonomy patterns</BulletItem>
              </motion.ul>
            </motion.div>
            <div className="rounded-[28px] border border-border-primary bg-bg-primary/65 p-6">
              <h3 className="text-2xl font-semibold text-text-primary">What teams should expect in the first conversation</h3>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  ["Scope", "Which Entra and Microsoft 365 surfaces matter first"],
                  ["Risk", "Which kinds of agent-driven changes matter most operationally"],
                  ["Workflow", "How identity and data recovery should work together"],
                  ["Readiness", "What needs to be integrated now versus later"],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl border border-white/[0.06] bg-bg-surface/55 p-5">
                    <p className="text-base font-semibold text-text-primary">{title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 9. Final CTA ────────────────────────────────────────────────── */}
      <CTABlock
        headline="Production AI needs a recovery plan"
        body="KavachIQ helps enterprises move from AI experimentation to production deployment with a clear path to recovery when agent-driven actions go wrong."
        ctaText="Request a Demo"
      />
    </>
  );
}
