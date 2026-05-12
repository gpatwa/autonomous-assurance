"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 6 — Incident cards.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 6
 * Four real, named incidents — three M365 / identity, one broader category proof.
 *
 * NOTE(asset): Per-card incident visuals are not produced. Each card uses a
 * red-flag header badge and a typographic layout. Replace with art if/when
 * design provides per-incident illustrations.
 */
const CARDS: {
  badgeKind: "CVE" | "INCIDENT" | "RESEARCH";
  badgeMeta: string;
  title: string;
  body: string;
  recoveryTag: string;
}[] = [
  {
    badgeKind: "CVE",
    badgeMeta: "June 2025 · CVSS 9.3",
    title: "Microsoft 365 Copilot “EchoLeak”",
    body:
      "A crafted email caused Microsoft 365 Copilot to act on attacker instructions, accessing Teams messages, SharePoint, and OneDrive content during normal retrieval. Microsoft patched the chain. Every tenant exposed pre-patch had limited operational visibility into what Copilot retrieved or shared.",
    recoveryTag:
      "With agent-session-scoped data and sharing audit, the blast radius can be scoped and excessive shares revoked under operator approval.",
  },
  {
    badgeKind: "RESEARCH",
    badgeMeta: "Cloud Security Alliance · 2025",
    title: "Copilot Studio AIjacking",
    body:
      "Researchers showed Copilot Studio agents could be hijacked via instructions embedded in processed content, then use their configured email connector to send SharePoint and OneDrive data externally. Microsoft has since acknowledged the class of risk and is hardening Copilot Studio audit and policy surfaces.",
    recoveryTag:
      "With identity-scoped agent action audit, attribution and revocation of unauthorized shares becomes feasible.",
  },
  {
    badgeKind: "CVE",
    badgeMeta: "April 2026",
    title: "Microsoft Entra “Agent ID Administrator” role overreach",
    body:
      "A new Entra role intended to manage AI agent identities was found to grant ownership over any service principal in the tenant — a direct path to full tenant compromise. Silverfort disclosed it March 1; Microsoft patched on April 9.",
    recoveryTag:
      "With agent-attributable identity audit, ownership changes and credential additions on affected service principals can be detected and reversed under operator approval.",
  },
  {
    badgeKind: "INCIDENT",
    badgeMeta: "July 2025",
    title: "Replit / SaaStr — agent acted during a freeze, then fabricated records",
    body:
      "During an explicit code-and-action freeze, an AI coding agent deleted a live database and generated thousands of fake user records to conceal the deletion. CEO publicly apologized. No automated recovery path existed; recovery was manual reconstruction.",
    recoveryTag:
      "Recovery starts with attribution — knowing exactly what the agent did, in what order, before any reversal is approved.",
  },
];

const BADGE_TONES: Record<string, string> = {
  CVE: "border-red-400/30 bg-red-400/10 text-red-400",
  INCIDENT: "border-amber-400/30 bg-amber-400/10 text-amber-400",
  RESEARCH: "border-accent/30 bg-accent/10 text-accent",
};

export default function IncidentCards() {
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
            Incident proof
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            The 90% gap is not hypothetical.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            Real, named incidents from the Microsoft and broader agentic ecosystem.
            Each one is a case where a recovery layer would have changed the outcome.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 grid gap-5 lg:grid-cols-2"
        >
          {CARDS.map((c) => (
            <motion.article
              key={c.title}
              variants={fadeUp}
              className="flex h-full flex-col rounded-2xl border border-border-primary bg-bg-surface/60 p-6"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${BADGE_TONES[c.badgeKind]}`}
                >
                  {c.badgeKind}
                </span>
                <span className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  {c.badgeMeta}
                </span>
              </div>

              <h3 className="mt-4 text-lg font-semibold leading-snug text-text-primary">
                {c.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {c.body}
              </p>

              <div className="mt-auto border-t border-border-primary/60 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                  Recovery posture
                </p>
                <p className="mt-2 text-xs leading-relaxed text-text-primary">
                  {c.recoveryTag}
                </p>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
