import type { Metadata } from "next";
import PlatformPageContent from "@/components/pages/PlatformPageContent";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "Operational recovery for AI-agent incidents in Microsoft 365. KavachIQ attributes every change to the agent's session, proposes an identity-first reversal plan across Entra, sharing, permissions, Conditional Access, and DLP — and validates the result after operator approval.",
};

export default function PlatformPage() {
  return <PlatformPageContent />;
}
