import type { Metadata } from "next";
import HomePageContent from "@/components/pages/HomePageContent";

export const metadata: Metadata = {
  title: "Recover from High-Impact Agent-Driven Changes",
  description:
    "KavachIQ Autonomous Assurance helps enterprises understand what changed, assess blast radius across identity and Microsoft 365, and guide rollback, restoration, and compensating actions back to a trusted operational state.",
};

export default function HomePage() {
  return <HomePageContent />;
}
