"use client";

import { timeline, type EventStatus } from "./data";

const statusStyles: Record<EventStatus, { color: string; bg: string }> = {
  detected: { color: "text-red-400", bg: "bg-red-400" },
  analyzed: { color: "text-amber-400", bg: "bg-amber-400" },
  recommended: { color: "text-accent", bg: "bg-accent" },
  approved: { color: "text-purple-400", bg: "bg-purple-400" },
  executed: { color: "text-accent", bg: "bg-accent" },
  verified: { color: "text-emerald-400", bg: "bg-emerald-400" },
};

export default function Timeline() {
  return (
    <div className="space-y-1">
      {timeline.map((event, i) => {
        const style = statusStyles[event.status];
        const time = new Date(event.timestamp);
        const timeStr = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        return (
          <div key={i} className="flex gap-4">
            {/* Time + connector */}
            <div className="flex flex-col items-center w-20 flex-shrink-0 pt-5">
              <p className="text-xs font-mono text-text-muted">{timeStr}</p>
              <div className={`h-3 w-3 rounded-full ${style.bg} mt-2 flex-shrink-0`} />
              {i < timeline.length - 1 && (
                <div className="w-px flex-1 bg-gradient-to-b from-border-primary to-transparent mt-1" />
              )}
            </div>

            {/* Event card */}
            <div className="flex-1 rounded-xl border border-border-primary bg-bg-surface/50 p-5 mb-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.color}`}>
                  {event.status}
                </span>
                <span className="text-xs text-text-muted">{event.actor}</span>
              </div>
              <p className="text-sm font-semibold text-text-primary">{event.action}</p>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">{event.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
