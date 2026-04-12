import type { Metadata } from "next";
import HomePageContent from "@/components/pages/HomePageContent";

export const metadata: Metadata = {
  title: "Recover from Harmful Agent-Driven Change",
  description:
    "KavachIQ Autonomous Assurance helps enterprises understand what changed, map blast radius across identity and Microsoft 365, and guide rollback, restoration, and compensating actions in the safest order.",
};

export default function HomePage() {
  return <HomePageContent />;
}
