import type { Metadata } from "next";
import HomePageContent from "@/components/pages/HomePageContent";

export const metadata: Metadata = {
  title: "Deploy AI Agents with Confidence",
  description:
    "KavachIQ Autonomous Assurance helps enterprises understand, contain, and recover from harmful autonomous change across Microsoft Entra, Microsoft 365, and connected systems.",
};

export default function HomePage() {
  return <HomePageContent />;
}
