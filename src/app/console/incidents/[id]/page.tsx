/**
 * /console/incidents/[id] — Incident detail (Server Component).
 *
 * params is a Promise in Next.js 16 — must be awaited.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { getConsoleTenantId, getIncident, updateIncidentStatus, type ConsoleIncident } from "@/lib/console-api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Incident ${id.slice(0, 8)}… — Console`,
    robots: { index: false, follow: false },
  };
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-950 text-red-300 border border-red-800",
  high:     "bg-orange-950 text-orange-300 border border-orange-800",
  medium:   "bg-yellow-950 text-yellow-300 border border-yellow-800",
  low:      "bg-blue-950 text-blue-300 border border-blue-800",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

function SignalRow({ signal }: { signal: ConsoleIncident["classificationRationale"]["signals"][number] }) {
  const positive = signal.value >= 0;
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-text-secondary">{signal.signal}</span>
      <span className={`font-mono tabular-nums ${positive ? "text-orange-300" : "text-text-muted"}`}>
        {positive ? "+" : ""}{signal.value}
      </span>
    </div>
  );
}

const STATUS_TRANSITIONS: Record<string, { label: string; next: "acknowledged" | "investigating" | "closed" }[]> = {
  new:           [{ label: "Acknowledge", next: "acknowledged" }, { label: "Close",       next: "closed" }],
  acknowledged:  [{ label: "Investigate", next: "investigating" }, { label: "Close",      next: "closed" }],
  investigating: [{ label: "Close",       next: "closed" }],
  closed:        [],
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantId = await getConsoleTenantId();

  let incident: ConsoleIncident;
  try {
    const resp = await getIncident(tenantId, id);
    incident = resp.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("404")) notFound();
    throw err;
  }

  const score = incident.classificationRationale.scoreAtCreation;
  const transitions = STATUS_TRANSITIONS[incident.status] ?? [];

  async function setStatus(formData: FormData) {
    "use server";
    const next = formData.get("next") as "acknowledged" | "investigating" | "closed";
    if (!next) return;
    await updateIncidentStatus(tenantId, id, next);
    revalidatePath(`/console/incidents/${id}`);
    revalidatePath("/console/incidents");
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-text-muted">
        <Link href="/console/incidents" className="hover:text-text-secondary">Incidents</Link>
        <span className="mx-2">/</span>
        <span className="font-mono">{id.slice(0, 12)}…</span>
      </nav>

      {/* Header + status actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`mt-1 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[incident.severity] ?? ""}`}>
            {incident.severity}
          </span>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{incident.title}</h1>
            <p className="mt-0.5 text-sm text-text-muted">
              {incident.status} · Detected {fmt(incident.detectedAt)}
            </p>
          </div>
        </div>
        {transitions.length > 0 && (
          <div className="flex shrink-0 gap-2">
            {transitions.map((t) => (
              <form key={t.next} action={setStatus}>
                <input type="hidden" name="next" value={t.next} />
                <button
                  type="submit"
                  className="rounded border border-border-primary bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-accent hover:text-text-primary"
                >
                  {t.label}
                </button>
              </form>
            ))}
          </div>
        )}
      </div>

      {/* Narrative */}
      {incident.classificationRationale.narrative && (
        <div className="rounded border border-border-primary bg-bg-surface px-4 py-3 text-sm leading-relaxed text-text-secondary">
          {incident.classificationRationale.narrative}
        </div>
      )}

      {/* Key fields */}
      <dl className="grid grid-cols-2 gap-4 rounded border border-border-primary bg-bg-surface px-4 py-4">
        <Field label="Urgency">{incident.urgency}</Field>
        <Field label="Score">{score} / 100</Field>
        <Field label="Target sensitivity">{incident.sensitivityContext.targetSensitivity}</Field>
        <Field label="Actor classification">{incident.sensitivityContext.actorClassification}</Field>
        <Field label="Correlated changes">{incident.correlatedChangeIds.length}</Field>
        <Field label="Created">{fmt(incident.createdAt)}</Field>
      </dl>

      {/* Classification signals */}
      <div className="rounded border border-border-primary bg-bg-surface px-4 py-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Classification signals
        </h2>
        <div className="divide-y divide-border-primary">
          {incident.classificationRationale.signals.map((s, i) => (
            <SignalRow key={i} signal={s} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border-primary pt-3 text-sm font-semibold">
          <span className="text-text-secondary">Total score</span>
          <span className="font-mono text-accent">{score}</span>
        </div>
      </div>

      {/* Correlated change IDs */}
      {incident.correlatedChangeIds.length > 0 && (
        <div className="rounded border border-border-primary bg-bg-surface px-4 py-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Correlated changes
          </h2>
          <ul className="space-y-1">
            {incident.correlatedChangeIds.map((id) => (
              <li key={id} className="font-mono text-xs text-text-muted">{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
