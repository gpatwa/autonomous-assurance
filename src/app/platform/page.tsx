import type { Metadata } from "next";
import PlatformPageContent from "@/components/pages/PlatformPageContent";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "KavachIQ Autonomous Assurance maps blast radius across Microsoft Entra and Microsoft 365, sequences identity-first recovery, and guides rollback, restoration, and compensating actions back to a trusted operational state.",
};

export default function PlatformPage() {
  return <PlatformPageContent />;
}
