"use client";

import { useState } from "react";
import { incident } from "./data";
import IncidentOverview from "./IncidentOverview";
import ChangeDetails from "./ChangeDetails";
import BlastRadius from "./BlastRadius";
import RecoveryPlan from "./RecoveryPlan";
import Timeline from "./Timeline";
import Resolution from "./Resolution";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "change", label: "Change" },
  { id: "blast", label: "Blast Radius" },
  { id: "recovery", label: "Recovery Plan" },
  { id: "timeline", label: "Timeline" },
  { id: "resolution", label: "Resolution" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
  overview: IncidentOverview,
  change: ChangeDetails,
  blast: BlastRadius,
  recovery: RecoveryPlan,
  timeline: Timeline,
  resolution: Resolution,
};

export default function DemoPageContent() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const ActivePanel = TAB_COMPONENTS[activeTab];

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* ─── Incident header bar ───────────────────────────────────────── */}
      <div className="border-b border-border-primary bg-bg-surface/60 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  Demo environment
                </span>
                <span className="inline-flex rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                  {incident.severity}
                </span>
                <span className="text-xs text-text-muted font-mono">{incident.id}</span>
              </div>
              <h1 className="text-lg sm:text-xl font-semibold text-text-primary truncate">
                {incident.title}
              </h1>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {incident.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tab bar ───────────────────────────────────────────────────── */}
      <div className="border-b border-border-primary bg-bg-primary sticky top-16 z-40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto -mb-px scrollbar-none">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? "border-accent text-accent"
                    : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Panel content ─────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <ActivePanel />
      </div>
    </div>
  );
}
