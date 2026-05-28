/**
 * /console/incidents/[id] — Incident detail (Server Component).
 *
 * params is a Promise in Next.js 16 — must be awaited.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import {
  getConsoleTenantId,
  getEvidencePack,
  getIncident,
  updateIncidentStatus,
  type ConsoleActionInstance,
  type ConsoleEvidencePack,
  type ConsoleIncident,
  type ConsoleValidationRecord,
} from "@/lib/console-api";

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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded border border-border-primary bg-bg-surface px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-text-primary">{value}</p>
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
  let evidencePack: ConsoleEvidencePack | null = null;
  let evidenceError: string | null = null;
  try {
    const resp = await getIncident(tenantId, id);
    incident = resp.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("404")) notFound();
    throw err;
  }

  try {
    const resp = await getEvidencePack(tenantId, id);
    evidencePack = resp.data;
  } catch (err) {
    evidenceError = err instanceof Error ? err.message : "Evidence pack unavailable";
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

      <RecoveryEvidencePanel evidencePack={evidencePack} evidenceError={evidenceError} />

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

function RecoveryEvidencePanel({
  evidencePack,
  evidenceError,
}: {
  evidencePack: ConsoleEvidencePack | null;
  evidenceError: string | null;
}) {
  if (!evidencePack) {
    return (
      <section className="rounded border border-border-primary bg-bg-surface px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Recovery execution
          </h2>
          <span className="text-xs text-text-muted">Not generated</span>
        </div>
        {evidenceError && (
          <p className="mt-3 text-sm text-text-muted">{evidenceError}</p>
        )}
      </section>
    );
  }

  const plan = evidencePack.recoveryPlan;
  const action = evidencePack.actionInstances.at(-1) ?? null;
  const validation = evidencePack.validationRecords[0] ?? null;
  const approval = evidencePack.approvals.at(-1) ?? null;
  const systemStep = plan?.steps.find((step) => step.executionMode === "system") ?? null;

  return (
    <section className="space-y-4 rounded border border-border-primary bg-bg-surface px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Recovery execution
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {plan ? `Plan ${plan.version} · ${plan.status}` : "No recovery plan"}
          </p>
        </div>
        {validation && (
          <span className={`rounded px-2 py-1 text-xs font-semibold ${validationStyle(validation.result)}`}>
            {validation.result}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Root changes" value={evidencePack.rootChanges.length} />
        <Stat label="Impacted objects" value={evidencePack.blastRadiusResult?.totalImpactedObjects ?? "—"} />
        <Stat label="Plan steps" value={plan?.steps.length ?? "—"} />
        <Stat label="Audit records" value={evidencePack.auditRecords.length} />
      </div>

      {systemStep && (
        <div className="border-t border-border-primary pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">{systemStep.targetObjectName}</p>
              <p className="mt-1 text-xs text-text-muted">
                Step {systemStep.order} · {systemStep.actionType} · {systemStep.status}
              </p>
            </div>
            <span className="shrink-0 rounded border border-border-primary px-2 py-1 text-xs text-text-muted">
              {systemStep.approvalRequired ? "Approval required" : "No approval"}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">{systemStep.rationale}</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <ApprovalSummary approval={approval} />
        <ActionSummary action={action} />
        <ValidationSummary validation={validation} action={action} />
      </div>

      <div className="border-t border-border-primary pt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Evidence boundaries
        </h3>
        <div className="grid gap-2 text-xs text-text-muted md:grid-cols-2">
          <span>Business content included: {String(evidencePack.dataProtection.businessDocumentContentIncluded)}</span>
          <span>Raw event payloads included: {String(evidencePack.dataProtection.rawEventPayloadsIncluded)}</span>
        </div>
      </div>
    </section>
  );
}

function ApprovalSummary({ approval }: { approval: ConsoleEvidencePack["approvals"][number] | null }) {
  return (
    <div className="rounded border border-border-primary bg-bg-primary/40 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Approval</p>
      {approval ? (
        <div className="mt-2 space-y-1 text-sm">
          <p className="truncate text-text-primary">{approval.approvedBy}</p>
          <p className="text-xs text-text-muted">{fmt(approval.approvedAt)}</p>
          <p className="text-xs text-text-muted">
            {approval.invalidated ? `Invalidated: ${approval.invalidatedReason ?? "yes"}` : "Valid"}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-text-muted">No approval</p>
      )}
    </div>
  );
}

function ActionSummary({ action }: { action: ConsoleActionInstance | null }) {
  const removed = action?.subActions.filter((sub) => sub.status === "removed").length ?? 0;
  const absent = action?.subActions.filter((sub) => sub.status === "already-absent").length ?? 0;
  return (
    <div className="rounded border border-border-primary bg-bg-primary/40 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Execution</p>
      {action ? (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-text-primary">{action.status}</p>
          <p className="text-xs text-text-muted">
            {removed} removed · {absent} already absent
          </p>
          <p className="text-xs text-text-muted">
            Circuit breaker: {String(action.circuitBroken)}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-text-muted">No action instance</p>
      )}
    </div>
  );
}

function ValidationSummary({
  validation,
  action,
}: {
  validation: ConsoleValidationRecord | null;
  action: ConsoleActionInstance | null;
}) {
  return (
    <div className="rounded border border-border-primary bg-bg-primary/40 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Validation</p>
      {validation ? (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-text-primary">{validation.result}</p>
          <p className="text-xs text-text-muted">{fmt(validation.validatedAt)}</p>
          <p className="text-xs text-text-muted">
            Post members: {action?.postExecutionState?.state.memberCount ?? "—"}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-text-muted">No validation</p>
      )}
    </div>
  );
}

function validationStyle(result: ConsoleValidationRecord["result"]) {
  if (result === "match") return "bg-green-950 text-green-300 border border-green-800";
  if (result === "pending-propagation") return "bg-yellow-950 text-yellow-300 border border-yellow-800";
  if (result === "mismatch") return "bg-red-950 text-red-300 border border-red-800";
  return "bg-bg-primary text-text-muted border border-border-primary";
}
