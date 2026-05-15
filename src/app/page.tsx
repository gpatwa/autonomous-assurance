import type { Metadata } from "next";
import HomePageContent from "@/components/pages/HomePageContent";

export const metadata: Metadata = {
  title: "The Undo Button for AI-Agent Incidents",
  description:
    "When an AI agent makes harmful changes in Microsoft 365, your team has minutes before the blast radius cascades. KavachIQ attributes every change to the agent's session and guides operators through approval-gated, dependency-ordered reversal — with full audit.",
};

export default function HomePage() {
  return <HomePageContent />;
}
