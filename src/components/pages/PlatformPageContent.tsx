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
import { track } from "@/lib/analytics";

// ─── Icons ───────────────────────────────────────────────────────────────────

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

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-text-secondary">
      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}

// ─── Product proof data ──────────────────────────────────────────────────────

const proofCards = [
  {
    title: "Capture",
    heading: "Record what agents changed and why",
    body: "Track the initiating agent, workflow session, target object, and before/after state across Entra and Microsoft 365.",
  },
  {
    title: "Assess",
    heading: "Map blast radius across identity and data",
    body: "Identify affected identities, permissions, Microsoft 365 workloads, and downstream dependencies. Understand recovery order.",
  },
  {
    title: "Recover",
    heading: "Guide rollback in the safest sequence",
    body: "Coordinate rollback, restoration, and compensating actions. Restore identity trust before recovering data surfaces.",
  },
];

// ─── Page ────────────────────────────────────────────────────────────────────

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
                KavachIQ Autonomous{" "}
                <span className="text-accent">Assurance</span>
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-4 text-xl text-text-secondary">
                The missing recovery layer for high-impact agent-driven changes
              </motion.p>
              <motion.p variants={fadeUp} className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
                AI agents and automation are changing identities, permissions, and business data across your enterprise. Backup restores objects. Observability shows events. Governance sets rules. None of them map blast radius across identity and data, sequence recovery in the right order, or coordinate rollback and compensating actions across systems. KavachIQ does.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-4">
                <Button variant="primary" size="lg" href="#request-demo" onClick={() => track("cta_click", { page: "platform", label: "Request a Demo" })}>
                  Request a Demo
                </Button>
                <Button variant="secondary" size="lg" href="#platform-proof" onClick={() => track("cta_click", { page: "platform", label: "Explore the Platform" })}>
                  Explore the Platform
                </Button>
              </motion.div>
            </motion.div>

            <RecoveryFlowVisual />
          </div>
        </div>
      </section>

      {/* ─── 2. Platform overview ────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <SectionHeader
              label="Overview"
              title="Recovery starts with identity and works outward"
              subtitle="The real question is not whether an AI agent can act. It is whether your enterprise can recover when it acts incorrectly. KavachIQ starts with Microsoft Entra because identity is the control plane for everything else. It maps impact across Microsoft 365, coordinates recovery in the safest order, and returns the enterprise to a trusted operational state. Over time, the same model extends to connected enterprise systems."
            />
          </div>
        </div>
      </section>

      {/* ─── 3. Why existing tools fall short ────────────────────────────── */}
      <section className="relative bg-bg-surface/40 py-20 sm:py-24">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border-primary to-transparent" />
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="text-center mb-10"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">The gap</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
              Backup, observability, and governance each solve part of the problem
            </h2>
          </motion.div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {[
              { label: "Backup", desc: "Restores objects", gap: "No blast-radius mapping or recovery sequencing" },
              { label: "Observability", desc: "Shows what happened", gap: "Cannot restore state or coordinate recovery" },
              { label: "Governance", desc: "Sets rules and approvals", gap: "Cannot unwind change once it has landed" },
              { label: "KavachIQ", desc: "Maps blast radius", gap: "Guides rollback, restoration, and compensating actions", featured: true },
            ].map((item) => (
              <motion.div
                key={item.label}
                variants={fadeUp}
                className={`rounded-2xl border p-5 ${
                  item.featured
                    ? "border-accent/30 bg-accent/10"
                    : "border-border-primary bg-bg-primary/55"
                }`}
              >
                <p className={`text-sm font-semibold ${item.featured ? "text-accent" : "text-text-primary"}`}>{item.label}</p>
                <p className="mt-2 text-xs text-text-secondary">{item.desc}</p>
                <p className={`mt-2 text-xs ${item.featured ? "text-text-primary" : "text-text-muted"}`}>{item.gap}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── 4. Product proof ────────────────────────────────────────────── */}
      <section className="relative bg-bg-surface/50 py-24 sm:py-28" id="platform-proof">
        <GridPattern />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="Product proof"
            title="What the platform captures, assesses, and recovers"
            subtitle="KavachIQ is designed around an operator-ready recovery workflow, not passive monitoring."
          />
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-6 md:grid-cols-3">
              {proofCards.map((card) => (
                <div key={card.title} className="rounded-[24px] border border-border-primary bg-bg-primary/65 p-6 shadow-[0_0_24px_rgba(7,14,30,0.35)]">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent/85">{card.title}</p>
                  <p className="mt-4 text-lg font-semibold text-text-primary">{card.heading}</p>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{card.body}</p>
                </div>
              ))}
            </div>
            <div className="rounded-[24px] border border-accent/20 bg-accent/[0.06] p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent/90">Operator view</p>
              <h3 className="mt-4 text-2xl font-semibold text-text-primary">Built for the moment an agent workflow goes wrong</h3>
              <ul className="mt-6 space-y-4 text-sm text-text-secondary">
                <BulletItem>See the initiating agent, session, and target systems before starting recovery</BulletItem>
                <BulletItem>Understand whether identity, data, or downstream apps must be restored first</BulletItem>
                <BulletItem>Choose rollback, restoration, or compensating actions based on risk and dependency order</BulletItem>
                <BulletItem>Restore identity trust first, then recover impacted data and collaboration surfaces</BulletItem>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 4. Key capabilities ─────────────────────────────────────────── */}
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
              title="Agent-driven change visibility"
              description="Track what agents changed across Entra identity objects and Microsoft 365 workloads. Know the initiating agent, workflow session, target object, and before/after state."
            />
            <CapabilityCard
              icon={<RadiusIcon />}
              title="Blast-radius analysis"
              description="Map which identities, permissions, data, and downstream systems were affected. Understand what depends on what and what must be recovered first."
            />
            <CapabilityCard
              icon={<RestoreIcon />}
              title="Recovery orchestration"
              description="Guide rollback, restoration, and compensating actions across identity and data surfaces with identity-first sequencing."
            />
            <CapabilityCard
              icon={<CheckCircleIcon />}
              title="Trusted-state restoration"
              description="Return the enterprise to a trusted operational state, not just restore isolated objects without context."
            />
            <CapabilityCard
              icon={<NetworkIcon />}
              title="Cross-system recovery"
              description="Connect identity, access, and data impact into one recovery workflow. Extend to adjacent systems over time."
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
                Recover the control plane first
              </motion.p>
              <motion.p variants={fadeUp} className="mt-6 text-lg leading-relaxed text-text-secondary">
                Microsoft Entra is where authority begins. When agents change users, groups, app access, service principals, or identity policy, the impact cascades into every connected system. Recovering data before restoring identity trust creates new risk. KavachIQ sequences recovery so the control plane is restored first.
              </motion.p>
              <motion.ul variants={fadeUp} className="mt-8 space-y-3">
                <BulletItem>Trace agent-driven changes across users, groups, applications, and service principals</BulletItem>
                <BulletItem>Map downstream access, provisioning, and permission fallout before acting</BulletItem>
                <BulletItem>Recover the control plane before restoring impacted data surfaces</BulletItem>
                <BulletItem>Keep operators in control of high-risk identity recovery decisions</BulletItem>
              </motion.ul>
            </motion.div>

            <div className="rounded-[28px] border border-border-primary bg-bg-surface/70 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Users and groups", "Membership drift, privilege expansion, and high-impact lifecycle changes from agent workflows"],
                  ["Applications", "App registrations, service principals, and access paths altered by agent actions"],
                  ["Policies", "Conditional access, identity controls, and settings that shape downstream access risk"],
                  ["Recovery order", "Restore identity trust first, then recover impacted Microsoft 365 and downstream systems"],
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
                  ["SharePoint and OneDrive", "Trace content, permission, and collaboration changes tied to agent-driven workflows"],
                  ["Exchange", "Understand mailbox, messaging, and communication impact when agents act at scale"],
                  ["Permission fallout", "Connect Microsoft 365 data impact back to Entra identity drift and access changes"],
                  ["Trusted operating state", "Coordinate restoration so teams recover the business surface, not just isolated files"],
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
                AI agents increasingly touch SharePoint, OneDrive, Exchange, and collaboration workflows. High-impact changes to files, permissions, content, or messaging can disrupt operations quickly and compound when teams try to recover system by system instead of coordinating with identity recovery. Over time, the same recovery model extends to adjacent SaaS platforms.
              </motion.p>
              <motion.ul variants={fadeUp} className="mt-8 space-y-3">
                <BulletItem>Identify high-impact changes across Microsoft 365 workloads</BulletItem>
                <BulletItem>Understand affected content, permissions, and collaboration dependencies</BulletItem>
                <BulletItem>Coordinate recovery in the right order, starting from identity</BulletItem>
                <BulletItem>Restore a trusted operating state across collaboration surfaces</BulletItem>
              </motion.ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 7. How the platform works ───────────────────────────────────── */}
      <section className="relative py-24 sm:py-28" id="how-it-works">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="How the platform works"
            title="Capture, assess, and recover"
            subtitle="Built to help operators move from incident discovery to confident recovery."
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
              description="KavachIQ records agent-driven actions across Entra and Microsoft 365, including the initiating agent, workflow session, and target objects."
            />
            <ProcessStep
              step={2}
              title="Assess"
              description="KavachIQ maps blast radius, dependencies, and recovery options across identity, data, and downstream systems."
            />
            <ProcessStep
              step={3}
              title="Recover"
              description="KavachIQ guides operators through rollback, restoration, and compensating actions in the safest sequence, restoring identity trust before data surfaces."
              isLast
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 8. Connected systems expansion ──────────────────────────────── */}
      <section className="relative bg-bg-surface/50 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              <motion.span variants={fadeUp} className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
                Platform vision
              </motion.span>
              <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
                Entra and Microsoft 365 first. Connected systems over time.
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-6 text-lg leading-relaxed text-text-secondary">
                Identity-first recovery for Microsoft Entra and Microsoft 365 is the initial wedge. The same capture, assess, and recover model is designed to extend into adjacent SaaS platforms, downstream business systems, and connected enterprise infrastructure as agent-driven automation expands.
              </motion.p>
            </motion.div>
            <div className="rounded-[28px] border border-border-primary bg-bg-primary/65 p-6">
              <h3 className="text-2xl font-semibold text-text-primary">What teams should expect in the first conversation</h3>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  ["Scope", "Which Entra and Microsoft 365 surfaces matter first for your recovery posture"],
                  ["Risk", "Which kinds of agent-driven changes create the most operational exposure"],
                  ["Workflow", "How identity and data recovery should be sequenced together"],
                  ["Readiness", "What needs to be integrated now versus later for production rollout"],
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
        headline="See identity-first recovery in action"
        body="Walk through a real recovery scenario with our team. We will show you how KavachIQ maps blast radius across Entra and Microsoft 365 and guides operators through safe recovery."
        ctaText="Request a Demo"
      />
    </>
  );
}
