"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 4 — Agentic Identity Recovery deep dive.
 *
 * Copy: docs/PLATFORM_PAGE_COPY_V1.md § SECTION 4
 * Anchor: #identity-assurance
 */
const SURFACES: { lead: string; body: string }[] = [
  {
    lead: "Users and groups",
    body:
      "Membership in privileged groups, lifecycle changes, group ownership.",
  },
  {
    lead: "Apps and service principals",
    body:
      "App registration creation and modification, service principal ownership, credential additions, OAuth consents.",
  },
  {
    lead: "Conditional Access",
    body:
      "Policy scope and conditions, exemptions, sign-in risk thresholds, named locations.",
  },
  {
    lead: "Roles",
    body:
      "Directory role assignments, eligible vs active assignments, scoped roles.",
  },
  {
    lead: "Recovery order",
    body:
      "Identity first. Permissions next. Sharing and Data after.",
  },
];

function ShieldIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function IdentityAssurance() {
  return (
    <section id="identity-assurance" className="relative py-24 sm:py-28 scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.div
              variants={fadeUp}
              className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent"
            >
              <ShieldIcon />
            </motion.div>

            <motion.h2
              variants={fadeUp}
              className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary"
            >
              Agentic Identity Recovery for Microsoft Entra.
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-2 text-lg font-medium text-accent">
              The control plane is the highest-leverage place for an agent to do damage.
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-6 text-base leading-relaxed text-text-secondary"
            >
              When an AI agent changes a user, modifies a group, alters an app
              registration, adds a service principal owner, or updates a Conditional
              Access policy, every downstream Microsoft 365 surface inherits the
              effect. A single service principal ownership change can expand access
              across the tenant. A single Conditional Access exemption can bypass
              MFA for an attacker&apos;s session.
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-4 text-base leading-relaxed text-text-secondary"
            >
              KavachIQ scopes every identity change to the originating agent&apos;s
              session, models the downstream dependency graph, and proposes a
              reversal sequence that doesn&apos;t break the tenant — including not
              locking out a Global Admin, not invalidating active sessions, and not
              undoing legitimate changes that happened in the same window.
            </motion.p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="rounded-[28px] border border-border-primary bg-bg-surface/70 p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              What KavachIQ handles
            </p>
            <ul className="mt-5 space-y-4">
              {SURFACES.map((s) => (
                <motion.li
                  key={s.lead}
                  variants={fadeUp}
                  className="rounded-2xl border border-border-primary/70 bg-bg-primary/40 p-4"
                >
                  <p className="text-sm font-semibold text-text-primary">{s.lead}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                    {s.body}
                  </p>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
