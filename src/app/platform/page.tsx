import type { Metadata } from "next";
import PlatformPageContent from "@/components/pages/PlatformPageContent";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "See how KavachIQ Autonomous Assurance captures autonomous change, maps blast radius, and drives recovery across Microsoft Entra, Microsoft 365, and downstream systems.",
};

export default function PlatformPage() {
  return <PlatformPageContent />;
}
