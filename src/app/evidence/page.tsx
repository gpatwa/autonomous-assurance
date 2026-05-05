import type { Metadata } from "next";
import EvidencePageContent from "@/components/pages/EvidencePageContent";

export const metadata: Metadata = {
  title: "Evidence",
  description:
    "Engineering evidence behind KavachIQ Autonomous Assurance. Real Microsoft Entra audit-log capture, per-class before-state strategy, and the spike findings that drive the recovery model.",
};

export default function EvidencePage() {
  return <EvidencePageContent />;
}
