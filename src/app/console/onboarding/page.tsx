/**
 * /console/onboarding — Connect a new Microsoft 365 tenant.
 *
 * Secretless design: no client secrets collected. The operator enters a
 * display name, then a KavachIQ-generated admin-consent URL is opened. The
 * customer's Entra admin grants Application permissions to the KavachIQ app;
 * no credentials are stored in KavachIQ's database.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { initiateOnboarding } from "@/lib/console-api";

export const metadata: Metadata = {
  title: "Connect Tenant — Console",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  async function connect(formData: FormData) {
    "use server";
    const displayName = (formData.get("displayName") as string ?? "").trim();
    if (!displayName) return;
    const { consentUrl } = await initiateOnboarding(displayName);
    redirect(consentUrl);
  }

  return (
    <div className="max-w-lg mx-auto pt-16 px-6">
      <h1 className="text-2xl font-semibold text-text mb-2">Connect Microsoft 365 Tenant</h1>
      <p className="text-text-muted text-sm mb-8">
        No credentials are stored. Your Entra admin will grant read-only audit
        log access to KavachIQ. Consent can be revoked at any time from your
        Microsoft admin centre.
      </p>

      <form action={connect} className="space-y-5">
        <div>
          <label htmlFor="displayName" className="block text-sm text-text-muted mb-1">
            Organisation name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            placeholder="Contoso Corp"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="mt-1 text-xs text-text-muted">
            Used as the display name in KavachIQ. Can be updated later.
          </p>
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
        >
          Grant access via Microsoft →
        </button>
      </form>

      <div className="mt-8 rounded-md border border-border bg-surface p-4 text-xs text-text-muted space-y-1">
        <p className="font-medium text-text">What permissions are requested?</p>
        <p>• <code>AuditLog.Read.All</code> — read Entra audit events (sign-ins, group changes)</p>
        <p>• <code>Directory.Read.All</code> — read user and group metadata</p>
        <p>These are Application permissions granted by your Entra admin, not delegated user permissions.</p>
      </div>
    </div>
  );
}
