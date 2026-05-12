/**
 * Homepage orchestrator.
 *
 * Section-to-copy mapping (see docs/LANDING_PAGE_COPY_V2.md):
 *   1.  RecoveryHero             — § Section 1 Hero
 *   2.  ProofBar                 — § Section 2 Proof bar
 *   3.  VendorConsensusWall      — § Section 3 Vendor consensus wall
 *   4.  RecoveryGap              — § Section 4 The recovery gap
 *   5.  LiveRecoveryDemo         — § Section 5 Live recovery demo
 *   6.  IncidentCards            — § Section 6 Incident cards
 *   7.  HowItWorks               — § Section 7 How it works
 *   7.5 TrustControl             — § Section 7.5 Trust and control
 *   8.  MarketValidationStrip    — § Section 8 Market validation strip
 *   9.  WhoItsFor                — § Section 9 Who it's for
 *   10. CTABlock (reused)        — § Section 10 Closing CTA
 *   11. Footer roadmap line      — handled in components/layout/Footer.tsx
 */

import CTABlock from "@/components/ui/CTABlock";
import RecoveryHero from "@/components/sections/landing/RecoveryHero";
import ProofBar from "@/components/sections/landing/ProofBar";
import VendorConsensusWall from "@/components/sections/landing/VendorConsensusWall";
import RecoveryGap from "@/components/sections/landing/RecoveryGap";
import LiveRecoveryDemo from "@/components/sections/landing/LiveRecoveryDemo";
import IncidentCards from "@/components/sections/landing/IncidentCards";
import HowItWorks from "@/components/sections/landing/HowItWorks";
import TrustControl from "@/components/sections/landing/TrustControl";
import MarketValidationStrip from "@/components/sections/landing/MarketValidationStrip";
import WhoItsFor from "@/components/sections/landing/WhoItsFor";

export default function HomePageContent() {
  return (
    <>
      <RecoveryHero />
      <ProofBar />
      <VendorConsensusWall />
      <RecoveryGap />
      <LiveRecoveryDemo />
      <IncidentCards />
      <HowItWorks />
      <TrustControl />
      <MarketValidationStrip />
      <WhoItsFor />

      {/* Section 10 — Closing CTA. Reuses the existing CTABlock + #request-demo form. */}
      <CTABlock
        headline="Adoption is moving faster than governance."
        body="The organizations that scale AI agents safely will be the ones with a recovery posture in place before their first agentic incident — not after. Let's walk through what that looks like for your tenant."
        ctaText="Request a demo"
      />
    </>
  );
}
