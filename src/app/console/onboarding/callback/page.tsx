/**
 * /console/onboarding/callback — Admin consent redirect target.
 *
 * Microsoft redirects here after the Entra admin grants (or denies) consent.
 * Query params:
 *   tenant        — customer's Microsoft tenant ID (on success)
 *   admin_consent — "True" on success
 *   state         — opaque base64 state from /onboarding/initiate
 *   error         — error code (on failure)
 *   error_description — human-readable error (on failure)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { completeOnboarding } from "@/lib/console-api";

export const metadata: Metadata = {
  title: "Connecting Tenant — Console",
  robots: { index: false, follow: false },
};

interface CallbackSearchParams {
  tenant?: string;
  admin_consent?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export default async function OnboardingCallbackPage({
  searchParams,
}: {
  searchParams: Promise<CallbackSearchParams>;
}) {
  const params = await searchParams;

  // ── Consent denied or error from Microsoft ───────────────────────────
  if (params.error || params.admin_consent !== "True") {
    const reason = params.error_description ?? params.error ?? "Consent was not granted.";
    return (
      <div className="max-w-lg mx-auto pt-16 px-6">
        <h1 className="text-2xl font-semibold text-red-400 mb-2">Consent not granted</h1>
        <p className="text-text-muted text-sm mb-6">{reason}</p>
        <Link
          href="/console/onboarding"
          className="text-sm text-accent hover:underline"
        >
          ← Try again
        </Link>
      </div>
    );
  }

  const microsoftTenantId = params.tenant;
  const state = params.state;

  if (!microsoftTenantId || !state) {
    return (
      <div className="max-w-lg mx-auto pt-16 px-6">
        <h1 className="text-2xl font-semibold text-red-400 mb-2">Invalid callback</h1>
        <p className="text-text-muted text-sm mb-6">Missing tenant or state parameter.</p>
        <Link href="/console/onboarding" className="text-sm text-accent hover:underline">
          ← Try again
        </Link>
      </div>
    );
  }

  // ── Complete onboarding via API ──────────────────────────────────────
  let tenantId: string;
  try {
    const result = await completeOnboarding(state, microsoftTenantId);
    tenantId = result.tenantId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <div className="max-w-lg mx-auto pt-16 px-6">
        <h1 className="text-2xl font-semibold text-red-400 mb-2">Onboarding failed</h1>
        <p className="text-text-muted text-sm mb-6">{message}</p>
        <Link href="/console/onboarding" className="text-sm text-accent hover:underline">
          ← Try again
        </Link>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto pt-16 px-6">
      <div className="mb-4 text-green-400 text-4xl">✓</div>
      <h1 className="text-2xl font-semibold text-text mb-2">Tenant connected</h1>
      <p className="text-text-muted text-sm mb-2">
        KavachIQ will begin polling your Microsoft 365 audit logs. Incidents
        will appear within the next polling cycle.
      </p>
      <p className="text-xs text-text-muted mb-8">
        KavachIQ tenant ID: <code className="text-text">{tenantId}</code>
      </p>
      <Link
        href="/console/incidents"
        className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
      >
        Go to Incidents →
      </Link>
    </div>
  );
}
