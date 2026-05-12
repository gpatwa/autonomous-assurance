/**
 * Platform page orchestrator.
 *
 * Section-to-copy mapping (see docs/PLATFORM_PAGE_COPY_V1.md):
 *   1.  PlatformHero          — § Section 1 Hero
 *   2.  PlatformOverview      — § Section 2 Platform overview
 *   3.  RecoverySurface       — § Section 3 The recovery surface (anchor: #platform-proof)
 *   4.  IdentityAssurance     — § Section 4 Identity Assurance deep dive (anchor: #identity-assurance)
 *   5.  DataAssurance         — § Section 5 Data Assurance deep dive (anchor: #data-assurance)
 *   6.  PlatformHowItWorks    — § Section 6 How the platform operates (anchor: #how-it-works)
 *   7.  PlatformTrustControl  — § Section 7 Trust and tenant safety
 *   8.  CapabilitiesMatrix    — § Section 8 Capabilities matrix
 *   9.  PlatformRoadmap       — § Section 9 Roadmap signal
 *   10. CTABlock (reused)     — § Section 10 Closing CTA
 */

import CTABlock from "@/components/ui/CTABlock";
import PlatformHero from "@/components/sections/platform/PlatformHero";
import PlatformOverview from "@/components/sections/platform/PlatformOverview";
import RecoverySurface from "@/components/sections/platform/RecoverySurface";
import IdentityAssurance from "@/components/sections/platform/IdentityAssurance";
import DataAssurance from "@/components/sections/platform/DataAssurance";
import PlatformHowItWorks from "@/components/sections/platform/PlatformHowItWorks";
import PlatformTrustControl from "@/components/sections/platform/PlatformTrustControl";
import CapabilitiesMatrix from "@/components/sections/platform/CapabilitiesMatrix";
import PlatformRoadmap from "@/components/sections/platform/PlatformRoadmap";

export default function PlatformPageContent() {
  return (
    <>
      <PlatformHero />
      <PlatformOverview />
      <RecoverySurface />
      <IdentityAssurance />
      <DataAssurance />
      <PlatformHowItWorks />
      <PlatformTrustControl />
      <CapabilitiesMatrix />
      <PlatformRoadmap />

      {/* Section 10 — Closing CTA. Reuses the existing CTABlock + #request-demo form. */}
      <CTABlock
        headline="Walk through the platform with us."
        body="We'll show you how KavachIQ runs inside a Microsoft 365 tenant — alert ingestion, blast radius mapping across all five surfaces, identity-first reversal proposal, operator approval, validation, and the evidence pack. Bring a scenario; we'll walk it."
        ctaText="Request a demo"
      />
    </>
  );
}
