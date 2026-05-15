"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 7.5 — Trust and control.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 7.5
 * Compact tenant-safety strip for cautious CISOs. Four pillars. No aspirational badges.
 */
const PILLARS: { lead: string; body: string }[] = [
  {
    lead: "Approval-gated reversal",
    body:
      "Every recovery is proposed for human review and approved by your operator before any change is made. No automated rollback.",
  },
  {
    lead: "Least-privilege Microsoft access",
    body:
      "Access through Microsoft Graph and Entra is scoped to what's required to attribute and reverse — and nothing more. Permissions are documented and consented per tenant.",
  },
  {
    lead: "Tenant-scoped isolation",
    body:
      "Each tenant's data is strictly isolated, enforced at the database layer via row-level security. KavachIQ operators have no cross-tenant visibility.",
  },
  {
    lead: "Audit trail and evidence pack",
    body:
      "Every step — ingestion, mapping, proposal, approval, reversal, validation — is recorded with operator identity, timestamp, and outcome. Exportable for audit and board reporting.",
  },
];

export default function TrustControl() {
  return (
    <section className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Trust and control
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Built for tenant safety.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            KavachIQ is designed to operate inside enterprise environments under
            operator and CISO oversight. No automated reversals. No background
            privileges. No cross-tenant visibility.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 grid gap-4 sm:grid-cols-2"
        >
          {PILLARS.map((p) => (
            <motion.div
              key={p.lead}
              variants={fadeUp}
              className="rounded-2xl border border-border-primary bg-bg-surface/55 p-6"
            >
              <p className="text-sm font-semibold text-text-primary">{p.lead}</p>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {p.body}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <p className="mt-10 text-center text-base font-semibold text-text-primary sm:text-lg">
          Recovery you can defend to your auditor, your board, and your own DFIR team.
        </p>
      </div>
    </section>
  );
}
