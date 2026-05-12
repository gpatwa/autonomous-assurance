"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 8 — Capabilities matrix.
 *
 * Copy: docs/PLATFORM_PAGE_COPY_V1.md § SECTION 8
 * 10 outcome-led capabilities, each demonstrable on a discovery call.
 */
const CAPABILITIES: { lead: string; body: string }[] = [
  {
    lead: "Agent-session correlation",
    body:
      "Every change in an agent's session is attributed back to it, with the supporting Microsoft 365 audit trail attached.",
  },
  {
    lead: "Cross-domain blast radius graph",
    body:
      "Identity, sharing, permissions, Conditional Access, DLP, and data modeled as a single dependency graph per incident.",
  },
  {
    lead: "Dependency-ordered reversal plans",
    body:
      "Recovery proposals respect what depends on what, so reversal does not leave the tenant in an inconsistent state.",
  },
  {
    lead: "Operator approval workflow",
    body:
      "Plans are proposed for review, not executed automatically. Operators approve before any change is made.",
  },
  {
    lead: "Post-reversal validation",
    body:
      "Each step is checked against expected state and any mismatch is surfaced before sign-off.",
  },
  {
    lead: "Exportable recovery evidence",
    body:
      "A complete, exportable record of every operation, suitable for audit review, SIEM ingest, and board reporting.",
  },
  {
    lead: "Detection-layer ingestion",
    body:
      "Subscribes to your existing detection (Microsoft Sentinel, Defender, Purview, or your SIEM/SOAR) as the alert source.",
  },
  {
    lead: "Documented Microsoft Graph access",
    body:
      "Scoped, admin-consented per tenant; detailed scope inventory available on request.",
  },
  {
    lead: "Tenant-scoped isolation",
    body:
      "Per-tenant data and access boundaries enforced at the data layer, with tenant-bound key material.",
  },
  {
    lead: "Audit-grade incident timeline",
    body:
      "A chronological record of agent action → ingestion → mapping → approval → reversal → validation, anchored to verifiable enterprise identity.",
  },
];

export default function CapabilitiesMatrix() {
  return (
    <section className="relative bg-bg-surface/40 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Capabilities
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            What operators get.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            What KavachIQ delivers to operators day-to-day.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto mt-14 grid max-w-5xl gap-3 md:grid-cols-2"
        >
          {CAPABILITIES.map((c, i) => (
            <motion.div
              key={c.lead}
              variants={fadeUp}
              className="flex items-start gap-4 rounded-2xl border border-border-primary bg-bg-primary/55 p-5"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-xs font-bold tabular-nums text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-sm font-semibold text-text-primary">{c.lead}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                  {c.body}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
