"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { fadeUp, staggerContainer } from "@/lib/animations";
import Button from "@/components/ui/Button";
import SectionHeader from "@/components/ui/SectionHeader";
import GridPattern from "@/components/visuals/GridPattern";

// ─── Per-class evidence table ────────────────────────────────────────────────
// Source: docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md §5 (matrix) + §7
// (before-state strategy). Numbers are verbatim from real WI-05 capture
// against a Microsoft Entra test tenant on 2026-04-17.

interface ClassRow {
  cls: string;
  events: string;
  before: string;
  after: string;
  beforeStrategy: string;
  status: "Done" | "Done" | "Pending" | "In progress";
}

const evidenceMatrix: ClassRow[] = [
  {
    cls: "Group membership",
    events: "12 / 12",
    before: "0 / 12 audit oldValue",
    after: "12 / 12 audit newValue",
    beforeStrategy: "Snapshot-reconstructed",
    status: "Done",
  },
  {
    cls: "Conditional Access policy",
    events: "1 / 1",
    before: "1 / 1 (full policy JSON)",
    after: "1 / 1 (full policy JSON)",
    beforeStrategy: "Audit-authoritative",
    status: "Done",
  },
  {
    cls: "App role assignment",
    events: "1 / 1",
    before: "0 / 1 audit oldValue",
    after: "1 / 1 audit newValue",
    beforeStrategy: "Snapshot-reconstructed",
    status: "Done",
  },
  {
    cls: "Service principal credential",
    events: "2 / 2",
    before: "2 / 2 KeyDescription metadata",
    after: "2 / 2 KeyDescription metadata",
    beforeStrategy: "Audit-authoritative metadata · secretText unavailable",
    status: "Pending",
  },
];

const findings = [
  {
    title: "Audit log is sufficient for two of four classes",
    body: "Conditional Access policy edits and SP credential changes carry both pre and post state in the audit event itself. We don't need a baseline snapshot to reconstruct what changed.",
  },
  {
    title: "The other two need a baseline snapshot",
    body: "Group membership and app role assignment events carry only the post-change state — Microsoft does not include oldValue in those audit events. Our normalization pipeline reconstructs before-state from a baseline snapshot tagged confidence: \"reconstructed\".",
  },
  {
    title: "We never fabricate data",
    body: "Where audit cannot provide an authoritative answer (e.g., the secretText of a credential), we mark it confidence: \"unavailable\". Recovery decisions are made against what we know, with explicit honesty about what we don't.",
  },
  {
    title: "activityDisplayName is the discriminator",
    body: "Microsoft's category tag is unreliable — app role assignments live under UserManagement, not ApplicationManagement. Our normalizer matches on activityDisplayName, which is consistent across change classes.",
  },
];

// ─── Roadmap state (as of 2026-05-04) ────────────────────────────────────────
// Update when phases land.

const roadmap = [
  {
    phase: "Phase 0",
    label: "Architecture spikes",
    status: "Complete",
    detail:
      "Audit-log completeness, schema specification, and connector design validated against a live Microsoft Entra test tenant.",
  },
  {
    phase: "Phase 1",
    label: "Ingestion backbone",
    status: "In progress",
    detail:
      "3 of 4 change classes normalized end-to-end (group-membership, Conditional Access, app-role). Correlation, detection, and snapshot-based baseline reconstruction shipped. SP-credential normalization next.",
  },
  {
    phase: "Phase 2",
    label: "Operator console + blast radius",
    status: "Roadmap",
    detail:
      "Cross-system blast-radius computation across SharePoint, Exchange, Teams, Conditional Access, and downstream applications. Operator UI for incident review.",
  },
  {
    phase: "Phase 3",
    label: "Trusted-state baseline + recovery planning",
    status: "Roadmap",
    detail:
      "Baseline approval workflow. Recovery-plan generation: identity-first sequencing, dependency chains, approval gates.",
  },
  {
    phase: "Phase 4",
    label: "Limited execution + validation",
    status: "Roadmap",
    detail:
      "Approved actions executed against Microsoft Graph with idempotency, retry, and post-action validation.",
  },
  {
    phase: "Phase 5",
    label: "Pilot hardening",
    status: "Roadmap",
    detail:
      "Multi-tenant isolation, observability, audit trail, on-call runbooks. Pilot-ready MVP.",
  },
];

// ─── Icon ────────────────────────────────────────────────────────────────────

function CheckIcon({ tone = "accent" }: { tone?: "accent" | "muted" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={tone === "accent" ? "text-accent" : "text-text-muted"}
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EvidencePageContent() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border-primary">
        <GridPattern />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="max-w-3xl"
          >
            <motion.span
              variants={fadeUp}
              className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4"
            >
              Engineering evidence
            </motion.span>
            <motion.h1
              variants={fadeUp}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-text-primary tracking-tight leading-[1.05]"
            >
              We did the spike work{" "}
              <span className="text-accent">before</span> writing recovery code.
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-6 text-lg text-text-secondary leading-relaxed max-w-2xl"
            >
              Recovery is only as trustworthy as the evidence it&apos;s built on. Before we
              shipped a single normalizer, we ran a 22-hour audit-log capture against a
              live Microsoft Entra test tenant, fired four classes of agent-driven
              change, and catalogued exactly what the audit log tells us — and what it
              doesn&apos;t. The findings below drive every confidence tag in our pipeline.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
              <Button href="/demo" variant="primary">
                See it in the demo
              </Button>
              <Button href="/platform" variant="secondary">
                Platform overview
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Capture metrics */}
      <section className="border-b border-border-primary bg-bg-surface/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <SectionHeader
            label="Capture metrics"
            title="WI-05 audit-log completeness spike"
            subtitle="Real test tenant. Real Microsoft Graph audit events. No simulation, no synthesised activity logs."
          />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto"
          >
            {[
              { value: "34", label: "events fetched" },
              { value: "18", label: "matched" },
              { value: "4", label: "change classes" },
              { value: "22h", label: "capture window" },
            ].map((m) => (
              <motion.div
                key={m.label}
                variants={fadeUp}
                className="rounded-xl border border-border-primary bg-bg-surface p-6 text-center"
              >
                <div className="text-3xl font-bold text-text-primary">{m.value}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-text-muted">
                  {m.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Per-class evidence matrix */}
      <section className="border-b border-border-primary">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <SectionHeader
            label="Per-class verdict"
            title="What the audit log gives us — and what it doesn't"
            subtitle="Each row is the actual count from the WI-05 capture. The before-state strategy column is what KavachIQ does in normalization today."
            align="left"
          />
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="overflow-x-auto rounded-xl border border-border-primary bg-bg-surface"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-primary text-left">
                  <th className="px-6 py-4 font-semibold text-text-primary">Change class</th>
                  <th className="px-6 py-4 font-semibold text-text-primary">Events</th>
                  <th className="px-6 py-4 font-semibold text-text-primary">Before-state</th>
                  <th className="px-6 py-4 font-semibold text-text-primary">After-state</th>
                  <th className="px-6 py-4 font-semibold text-text-primary">Strategy</th>
                  <th className="px-6 py-4 font-semibold text-text-primary">Normalizer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary">
                {evidenceMatrix.map((row) => (
                  <tr key={row.cls} className="text-text-secondary">
                    <td className="px-6 py-4 font-medium text-text-primary">{row.cls}</td>
                    <td className="px-6 py-4 font-mono text-xs">{row.events}</td>
                    <td className="px-6 py-4 font-mono text-xs">{row.before}</td>
                    <td className="px-6 py-4 font-mono text-xs">{row.after}</td>
                    <td className="px-6 py-4">{row.beforeStrategy}</td>
                    <td className="px-6 py-4">
                      <span
                        className={
                          row.status === "Done"
                            ? "inline-flex items-center gap-1 text-accent text-xs font-semibold"
                            : "inline-flex items-center gap-1 text-text-muted text-xs font-semibold"
                        }
                      >
                        {row.status === "Done" ? <CheckIcon /> : <CheckIcon tone="muted" />}
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
          <p className="mt-6 text-sm text-text-muted max-w-3xl">
            Authoritative source:{" "}
            <code className="text-text-secondary">
              docs/SPIKE_REPORT_AUDIT_LOG_COMPLETENESS.md
            </code>{" "}
            §5 + §7 in the repository.
          </p>
        </div>
      </section>

      {/* Findings */}
      <section className="border-b border-border-primary bg-bg-surface/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <SectionHeader
            label="What this means"
            title="Findings that shape the recovery model"
          />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto"
          >
            {findings.map((f) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                className="rounded-xl border border-border-primary bg-bg-surface p-6"
              >
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">{f.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="border-b border-border-primary">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <SectionHeader
            label="Where we are"
            title="Honest roadmap to pilot-ready MVP"
            subtitle="Phase 0 is the spike work above. Phase 1 is the normalization + correlation + detection pipeline that produces today's incident output. Phases 2-5 are on the build path."
            align="left"
          />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl"
          >
            {roadmap.map((p) => {
              const isDone = p.status === "Complete";
              const isActive = p.status === "In progress";
              const tone = isDone
                ? "border-accent/40 bg-accent/5"
                : isActive
                  ? "border-accent/20 bg-bg-surface"
                  : "border-border-primary bg-bg-surface";
              return (
                <motion.div
                  key={p.phase}
                  variants={fadeUp}
                  className={`rounded-xl border p-6 ${tone}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      {p.phase}
                    </span>
                    <span
                      className={
                        isDone
                          ? "text-xs font-semibold text-accent"
                          : isActive
                            ? "text-xs font-semibold text-accent/70"
                            : "text-xs font-semibold text-text-muted"
                      }
                    >
                      {p.status}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-text-primary mb-2">
                    {p.label}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {p.detail}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-b border-border-primary bg-bg-surface/40">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h2 className="text-3xl font-bold text-text-primary tracking-tight mb-4">
            Want to dig deeper?
          </h2>
          <p className="text-lg text-text-secondary leading-relaxed mb-8 max-w-2xl mx-auto">
            The full WI-05 spike report — every event ID, every encoding anomaly, every
            anomalous race condition observed during capture — is in the repository.
            For technical buyer due-diligence we&apos;ll walk you through it directly.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button href="/demo" variant="primary">
              Open the demo
            </Button>
            <Link
              href="/#request-demo"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-border-primary text-text-primary font-medium hover:border-accent/40 transition-colors"
            >
              Request a tailored walkthrough
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
