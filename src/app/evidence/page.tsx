import type { Metadata } from "next";
import EvidencePageContent from "@/components/pages/EvidencePageContent";

export const metadata: Metadata = {
  title: "Evidence",
  description:
    "Engineering evidence behind KavachIQ's agentic incident recovery model. Real Microsoft Entra audit-log capture, per-class before-state strategy, and the spike findings that drive identity-first reversal.",
};

export default function EvidencePage() {
  return <EvidencePageContent />;
}
