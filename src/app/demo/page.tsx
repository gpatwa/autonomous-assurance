import type { Metadata } from "next";
import DemoPageContent from "@/components/demo/DemoPageContent";

export const metadata: Metadata = {
  title: "Demo — Recovery Incident",
  description:
    "Interactive demo: see how KavachIQ maps blast radius and guides identity-first recovery after an agent-driven Entra change.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoPageContent />;
}
