"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";
import SectionHeader from "@/components/ui/SectionHeader";
import VendorMark from "@/components/visuals/VendorMarks";

/**
 * Section 3 — Vendor consensus wall.
 *
 * Copy: docs/LANDING_PAGE_COPY_V2.md § SECTION 3
 * Five public quotes from Microsoft, Salesforce, ServiceNow, Anthropic, Gartner.
 */
type WordmarkName = "microsoft" | "salesforce" | "servicenow" | "anthropic" | "gartner";

const QUOTES: {
  quote: string;
  who: string;
  org: string;
  context: string;
  wordmark: WordmarkName;
  emphasis?: boolean;
}[] = [
  {
    quote: "You have to get the governance right.",
    who: "Marc Benioff",
    org: "CEO, Salesforce",
    context: "Dreamforce 2025",
    wordmark: "salesforce",
  },
  {
    quote:
      "How do we monitor [agents] to ensure their trustworthiness, and ensure they are not double agents?",
    who: "Vasu Jakkal",
    org: "CVP, Microsoft Security",
    context: "Microsoft Ignite 2025",
    wordmark: "microsoft",
    emphasis: true,
  },
  {
    quote: "That's what an AI agent can do when no one's watching.",
    who: "Bill McDermott",
    org: "CEO, ServiceNow",
    context: "Knowledge 2026",
    wordmark: "servicenow",
  },
  {
    quote:
      "Agents act with less human oversight, so there is more room for them to misread users' intent and take actions with unintended consequences.",
    who: "Anthropic",
    org: "Building Trustworthy Agents",
    context: "Anthropic research, 2025",
    wordmark: "anthropic",
  },
  {
    quote:
      "AI agents are already embedded across the enterprise, making decisions and taking action in ways most organizations cannot see or control.",
    who: "Gartner",
    org: "Hype Cycle for Agentic AI",
    context: "Gartner, 2026",
    wordmark: "gartner",
  },
];

export default function VendorConsensusWall() {
  return (
    <section className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label="Industry consensus"
          title="The vendors selling you AI agents agree this layer needs to exist."
          subtitle="Microsoft. Salesforce. Anthropic. ServiceNow. Every major platform shipping AI agents in your environment publicly says they need an oversight, governance, and recovery layer that doesn't come with the agent itself."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid gap-5 lg:grid-cols-3"
        >
          {QUOTES.map((q) => (
            <motion.figure
              key={q.who}
              variants={fadeUp}
              className={`flex h-full flex-col rounded-2xl border p-6 ${
                q.emphasis
                  ? "border-accent/30 bg-accent/5 lg:col-span-2"
                  : "border-border-primary bg-bg-surface/55"
              }`}
            >
              <VendorMark name={q.wordmark} />

              <blockquote className="mt-5 text-base leading-relaxed text-text-primary sm:text-lg">
                “{q.quote}”
              </blockquote>

              <figcaption className="mt-6 border-t border-border-primary/60 pt-4 text-xs leading-relaxed text-text-muted">
                <span className="font-semibold text-text-secondary">{q.who}</span>
                {" · "}
                {q.org}
                <br />
                <span className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
                  {q.context}
                </span>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>

        <p className="mt-10 text-center text-base font-semibold text-text-primary sm:text-lg">
          Every major AI vendor says this layer needs to exist. We built it.
        </p>
      </div>
    </section>
  );
}
