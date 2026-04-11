"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";
import Button from "@/components/ui/Button";
import SectionHeader from "@/components/ui/SectionHeader";
import CapabilityCard from "@/components/ui/CapabilityCard";
import ProcessStep from "@/components/ui/ProcessStep";
import CTABlock from "@/components/ui/CTABlock";
import GridPattern from "@/components/visuals/GridPattern";
import NodeGraph from "@/components/visuals/NodeGraph";

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

// ─── Bullet Item ─────────────────────────────────────────────────────────────
function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-text-secondary">
      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function PlatformPage() {
  return (
    <>
      {/* ─── 1. Product Hero ─────────────────────────────────────────────── */}
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
              <motion.p
                variants={fadeUp}
                className="mt-4 text-xl text-text-secondary"
              >
                The assurance layer for AI-driven enterprise operations
              </motion.p>
              <motion.p
                variants={fadeUp}
                className="mt-6 text-lg text-text-secondary leading-relaxed max-w-xl"
              >
                As AI agents gain the ability to change identities, modify
                access, update data, and trigger business workflows, enterprises
                need more than visibility. They need confidence that harmful
                autonomous actions can be understood, contained, and safely
                recovered. KavachIQ Autonomous Assurance helps teams recover
                from autonomous change across Microsoft Entra, Microsoft 365,
                and connected systems.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-10">
                <Button variant="primary" size="lg" href="#request-demo">
                  Talk to the Team
                </Button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="hidden lg:block"
            >
              <NodeGraph />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 2. Overview ─────────────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <SectionHeader
              label="Overview"
              title="Safe production autonomy starts with recoverability"
            />
            <motion.p
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className="text-lg text-text-secondary leading-relaxed"
            >
              The real question is not whether an AI agent can act. It is
              whether your enterprise can recover when it acts incorrectly.
              KavachIQ Autonomous Assurance gives teams the ability to trace
              autonomous actions, assess impact, and restore a known-good state
              across critical systems.
            </motion.p>
          </div>
        </div>
      </section>

      {/* ─── 3. Core Capabilities ────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32 bg-bg-surface/50">
        <GridPattern />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            label="Capabilities"
            title="What KavachIQ delivers"
          />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto"
          >
            <CapabilityCard
              icon={<EyeIcon />}
              title="Autonomous change visibility"
              description="Track critical agent-driven actions across systems with full context."
            />
            <CapabilityCard
              icon={<RadiusIcon />}
              title="Blast-radius analysis"
              description="Understand what changed, what dependencies were affected, and what recovery path is safest."
            />
            <CapabilityCard
              icon={<RestoreIcon />}
              title="Recovery orchestration"
              description="Coordinate rollback, restoration, and compensating actions across systems."
            />
            <CapabilityCard
              icon={<CheckCircleIcon />}
              title="Known-good-state restoration"
              description="Help teams return to a trusted operational state, not just restore isolated objects."
            />
            <CapabilityCard
              icon={<NetworkIcon />}
              title="Cross-system assurance"
              description="Connect identity, access, and data impact into a unified recovery workflow."
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 4. Identity Assurance for Microsoft Entra ───────────────────── */}
      <section className="relative py-24 sm:py-32" id="identity-assurance">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              <motion.div variants={fadeUp} className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent mb-6">
                <ShieldIcon />
              </motion.div>
              <motion.h2
                variants={fadeUp}
                className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary"
              >
                Identity Assurance for Microsoft Entra
              </motion.h2>
              <motion.p
                variants={fadeUp}
                className="mt-2 text-lg text-accent font-medium"
              >
                Protect the control plane of the enterprise
              </motion.p>
              <motion.p
                variants={fadeUp}
                className="mt-6 text-lg text-text-secondary leading-relaxed"
              >
                Microsoft Entra is where authority begins. Harmful autonomous
                changes to users, groups, app access, service principals, and
                identity policies can ripple into downstream systems and create
                security, operational, and compliance issues.
              </motion.p>
              <motion.ul variants={fadeUp} className="mt-8 space-y-3">
                <BulletItem>Trace agent-driven identity changes</BulletItem>
                <BulletItem>
                  Understand downstream app and access impact
                </BulletItem>
                <BulletItem>
                  Recover safely from harmful changes
                </BulletItem>
                <BulletItem>
                  Restore trust in the identity layer first
                </BulletItem>
              </motion.ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7 }}
              className="flex justify-center"
            >
              <div className="relative w-full max-w-sm">
                {/* Abstract identity graph */}
                <svg viewBox="0 0 320 320" className="w-full h-auto">
                  {/* Central shield node */}
                  <motion.circle cx="160" cy="160" r="50" fill="rgba(56,189,248,0.06)" stroke="rgba(56,189,248,0.2)" strokeWidth="1.5"
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.6 }} />
                  <motion.circle cx="160" cy="160" r="20" fill="#38BDF8" fillOpacity="0.15" stroke="rgba(56,189,248,0.4)" strokeWidth="1"
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }} />

                  {/* Surrounding identity nodes */}
                  {[
                    { x: 80, y: 60, label: "Users" },
                    { x: 240, y: 60, label: "Groups" },
                    { x: 60, y: 200, label: "Apps" },
                    { x: 260, y: 200, label: "Policies" },
                    { x: 160, y: 290, label: "SPs" },
                  ].map((node, i) => (
                    <motion.g key={i}>
                      <motion.line x1="160" y1="160" x2={node.x} y2={node.y}
                        stroke="rgba(56,189,248,0.12)" strokeWidth="1"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                        transition={{ duration: 0.6, delay: 0.4 + i * 0.1 }} />
                      <motion.circle cx={node.x} cy={node.y} r="6" fill="rgba(56,189,248,0.2)" stroke="rgba(56,189,248,0.4)" strokeWidth="1"
                        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.3, delay: 0.6 + i * 0.1 }} />
                      <motion.text x={node.x} y={node.y + 20} textAnchor="middle" fill="rgba(148,163,184,0.6)" fontSize="10"
                        fontFamily="var(--font-geist-sans), system-ui, sans-serif"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.8 + i * 0.1 }}>
                        {node.label}
                      </motion.text>
                    </motion.g>
                  ))}
                </svg>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 5. Data Assurance for Microsoft 365 ─────────────────────────── */}
      <section className="relative py-24 sm:py-32 bg-bg-surface/50" id="data-assurance">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Visual first on desktop (reversed order) */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7 }}
              className="flex justify-center order-2 lg:order-1"
            >
              <div className="relative w-full max-w-sm">
                {/* Abstract data flow */}
                <svg viewBox="0 0 320 320" className="w-full h-auto">
                  {/* Layered database visual */}
                  {[0, 1, 2].map((i) => (
                    <motion.g key={i}>
                      <motion.ellipse cx="160" cy={120 + i * 60} rx="100" ry="25"
                        fill="none" stroke="rgba(56,189,248,0.15)" strokeWidth="1"
                        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 + i * 0.15 }} />
                    </motion.g>
                  ))}
                  {/* Vertical connectors */}
                  <motion.line x1="60" y1="120" x2="60" y2="240" stroke="rgba(56,189,248,0.1)" strokeWidth="1"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.5 }} />
                  <motion.line x1="260" y1="120" x2="260" y2="240" stroke="rgba(56,189,248,0.1)" strokeWidth="1"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.5 }} />

                  {/* Data nodes */}
                  {[
                    { x: 100, y: 80, label: "SharePoint" },
                    { x: 220, y: 80, label: "OneDrive" },
                    { x: 100, y: 280, label: "Exchange" },
                    { x: 220, y: 280, label: "Workflows" },
                  ].map((node, i) => (
                    <motion.g key={i}>
                      <motion.circle cx={node.x} cy={node.y} r="5" fill="rgba(56,189,248,0.25)" stroke="rgba(56,189,248,0.4)" strokeWidth="1"
                        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.3, delay: 0.7 + i * 0.1 }} />
                      <motion.text x={node.x} y={node.y + 18} textAnchor="middle" fill="rgba(148,163,184,0.6)" fontSize="9"
                        fontFamily="var(--font-geist-sans), system-ui, sans-serif"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.9 + i * 0.1 }}>
                        {node.label}
                      </motion.text>
                    </motion.g>
                  ))}
                </svg>
              </div>
            </motion.div>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              className="order-1 lg:order-2"
            >
              <motion.div variants={fadeUp} className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent mb-6">
                <DatabaseIcon />
              </motion.div>
              <motion.h2
                variants={fadeUp}
                className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary"
              >
                Data Assurance for Microsoft 365
              </motion.h2>
              <motion.p
                variants={fadeUp}
                className="mt-2 text-lg text-accent font-medium"
              >
                Recover the systems where business impact shows up
              </motion.p>
              <motion.p
                variants={fadeUp}
                className="mt-6 text-lg text-text-secondary leading-relaxed"
              >
                AI agents increasingly touch SharePoint, OneDrive, Exchange, and
                related collaboration workflows. Harmful autonomous changes to
                files, permissions, content, or messaging can disrupt operations
                and create risk quickly.
              </motion.p>
              <motion.ul variants={fadeUp} className="mt-8 space-y-3">
                <BulletItem>
                  Identify harmful changes across M365 workloads
                </BulletItem>
                <BulletItem>
                  Understand affected content and dependencies
                </BulletItem>
                <BulletItem>
                  Coordinate recovery with business context
                </BulletItem>
                <BulletItem>
                  Restore a trusted operating state across collaboration
                  surfaces
                </BulletItem>
              </motion.ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 6. How the Platform Works ───────────────────────────────────── */}
      <section className="relative py-24 sm:py-32">
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
              title="Capture"
              description="KavachIQ records critical autonomous actions across supported systems."
            />
            <ProcessStep
              step={2}
              title="Assess"
              description="KavachIQ maps blast radius, dependencies, and recovery options."
            />
            <ProcessStep
              step={3}
              title="Recover"
              description="KavachIQ helps operators execute the safest path back to a known-good state through rollback, restoration, and compensating actions."
              isLast
            />
          </motion.div>
        </div>
      </section>

      {/* ─── 7. Audience Section ─────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32 bg-bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              <motion.div variants={fadeUp} className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent mb-6">
                <UsersIcon />
              </motion.div>
              <motion.h2
                variants={fadeUp}
                className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary"
              >
                Built for teams responsible for safe production AI
              </motion.h2>
              <motion.ul variants={fadeUp} className="mt-8 space-y-4">
                <BulletItem>
                  CIO and CTO leaders deploying AI agents into business
                  operations
                </BulletItem>
                <BulletItem>
                  Security and identity teams protecting enterprise access
                </BulletItem>
                <BulletItem>
                  Data and platform teams responsible for systems of record
                </BulletItem>
                <BulletItem>
                  Enterprise architects defining safe autonomy patterns
                </BulletItem>
              </motion.ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7 }}
            >
              <NodeGraph className="opacity-60" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── 8. Final CTA ────────────────────────────────────────────────── */}
      <CTABlock
        headline="Autonomy without assurance is a risk multiplier"
        body="KavachIQ Autonomous Assurance gives enterprises the confidence to move from AI experimentation to production deployment with a clear path to recovery when autonomous systems go wrong."
        ctaText="Request a Demo"
      />
    </>
  );
}
