"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 7 — Trust and tenant safety.
 *
 * Copy: docs/PLATFORM_PAGE_COPY_V1.md § SECTION 7
 * Four pillars matching the homepage, with the control posture spelled out.
 * Outcome-led; implementation specifics intentionally kept off the public page.
 */
const PILLARS: { pillar: string; homepage: string; platformAdds: string }[] = [
  {
    pillar: "Approval-gated reversal",
    homepage:
      "Every recovery is proposed for human review before any change. No automated rollback.",
    platformAdds:
      "Operators see the full proposed reversal — every step and its dependency — before any change runs. Approval is an explicit, scoped action; the platform does not act on its own.",
  },
  {
    pillar: "Least-privilege Microsoft access",
    homepage: "Scoped to what's required to attribute and reverse.",
    platformAdds:
      "Microsoft Graph access is admin-consented per tenant and scoped to the surfaces under recovery management. Detailed permission scopes are available for procurement review on request.",
  },
  {
    pillar: "Tenant-scoped isolation",
    homepage:
      "Strict per-tenant data boundaries enforced at the database layer.",
    platformAdds:
      "Tenant isolation is enforced at the data layer, with no shared tenant context across requests. Tenant-bound keys and access scopes prevent cross-tenant visibility.",
  },
  {
    pillar: "Audit trail and evidence pack",
    homepage:
      "Every step recorded with operator identity, timestamp, and outcome.",
    platformAdds:
      "Each recovery produces an exportable evidence record covering the agent's actions, the proposed plan, every approval, and the validated result — suitable for audit, SIEM ingest, and board reporting.",
  },
];

export default function PlatformTrustControl() {
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
            Trust and tenant safety
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Built for tenant safety.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            KavachIQ operates inside enterprise environments under operator and
            CISO oversight. The same four pillars as the homepage — with the
            control posture spelled out.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 grid gap-4 lg:grid-cols-2"
        >
          {PILLARS.map((p) => (
            <motion.div
              key={p.pillar}
              variants={fadeUp}
              className="flex h-full flex-col rounded-2xl border border-border-primary bg-bg-surface/55 p-6"
            >
              <p className="text-sm font-semibold text-text-primary">{p.pillar}</p>
              <p className="mt-3 text-xs leading-relaxed text-text-muted">
                {p.homepage}
              </p>
              <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">
                  Platform control posture
                </p>
                <p className="mt-2 text-sm leading-relaxed text-text-primary">
                  {p.platformAdds}
                </p>
              </div>
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
