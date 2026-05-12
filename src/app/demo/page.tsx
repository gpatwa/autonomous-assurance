import type { Metadata } from "next";
import DemoPageContent from "@/components/demo/DemoPageContent";

export const metadata: Metadata = {
  title: "Demo — Recovery Incident",
  description:
    "Interactive walkthrough: see how KavachIQ attributes an AI-agent incident, maps blast radius across Entra and Microsoft 365, and guides operator-approved, identity-first recovery.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoPageContent />;
}
