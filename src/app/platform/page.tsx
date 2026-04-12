import type { Metadata } from "next";
import PlatformPageContent from "@/components/pages/PlatformPageContent";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "KavachIQ Autonomous Assurance maps blast radius across Microsoft Entra and Microsoft 365 and guides rollback, restoration, and compensating actions in the safest order.",
};

export default function PlatformPage() {
  return <PlatformPageContent />;
}
