"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/animations";

/**
 * Section 3 — The recovery surface.
 *
 * Copy: docs/PLATFORM_PAGE_COPY_V1.md § SECTION 3
 * Five surfaces of agent-driven change KavachIQ recovers across.
 * Anchor: #platform-proof
 */
const SURFACES: { surface: string; tag: string; examples: string }[] = [
  {
    surface: "Identity",
    tag: "Entra ID",
    examples:
      "User membership in privileged groups · App registration and service principal ownership · Role assignments · Identity lifecycle changes",
  },
  {
    surface: "Conditional Access",
    tag: "Entra ID",
    examples:
      "Policy scope changes · Exemptions added · Sign-in risk thresholds modified · MFA bypass conditions",
  },
  {
    surface: "Permissions",
    tag: "Graph + M365",
    examples:
      "Microsoft Graph delegated and application permissions · Site-level and item-level access grants · OAuth consent grants",
  },
  {
    surface: "Sharing",
    tag: "SharePoint · OneDrive · Teams",
    examples:
      "External sharing links · Anyone links · File and folder permissions · Teams channel sharing",
  },
  {
    surface: "Data",
    tag: "Purview · Sensitivity labels",
    examples:
      "DLP label modifications · Sensitivity label changes · Retention label changes · Content policy alterations",
  },
];

export default function RecoverySurface() {
  return (
    <section
      id="platform-proof"
      className="relative bg-bg-surface/40 py-24 sm:py-28 scroll-mt-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            The recovery surface
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            What KavachIQ recovers across your Microsoft 365 tenant.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary sm:text-lg">
            Every agent-driven change in scope, mapped to the Microsoft surface it
            lives on. Recovery is dependency-ordered across all five.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 overflow-hidden rounded-[28px] border border-border-primary bg-bg-primary/60 shadow-[0_0_40px_rgba(8,15,35,0.45)]"
        >
          <div className="hidden border-b border-border-primary px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted md:grid md:grid-cols-[1fr_2fr] md:gap-6">
            <p>Surface</p>
            <p>Examples of agent-driven change KavachIQ handles</p>
          </div>

          <div className="divide-y divide-border-primary/60">
            {SURFACES.map((row) => (
              <motion.div
                key={row.surface}
                variants={fadeUp}
                className="grid gap-3 px-6 py-6 md:grid-cols-[1fr_2fr] md:gap-8"
              >
                <div>
                  <p className="text-base font-semibold text-text-primary">
                    {row.surface}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-text-muted">
                    {row.tag}
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {row.examples}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <p className="mt-10 text-center text-base leading-relaxed text-text-primary sm:text-lg">
          KavachIQ attributes each change to the agent&apos;s session. Reversal happens
          in identity-first order. Operators approve, then KavachIQ executes and
          validates.
        </p>
      </div>
    </section>
  );
}
