/**
 * /console/sign-in — Operator sign-in page.
 *
 * Server Action triggers the Microsoft Entra ID OIDC flow.
 * No client-side JS needed for the sign-in button.
 */

import type { Metadata } from "next";
import { signIn } from "@/auth";

export const metadata: Metadata = {
  title: "Sign in — Operator Console",
  robots: { index: false, follow: false },
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="w-full max-w-sm rounded border border-border-primary bg-bg-surface p-8">
        <h1 className="mb-1 text-lg font-semibold text-text-primary">
          Operator Console
        </h1>
        <p className="mb-6 text-sm text-text-muted">
          Sign in with your Microsoft account to continue.
        </p>

        <form
          action={async () => {
            "use server";
            const params = await searchParams;
            await signIn("microsoft-entra-id", {
              redirectTo: params.callbackUrl ?? "/console/incidents",
            });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded border border-border-primary bg-bg-primary px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:border-border-accent hover:bg-bg-surface-hover"
          >
            <MicrosoftIcon />
            Sign in with Microsoft
          </button>
        </form>
      </div>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="0" y="0" width="7.5" height="7.5" fill="#F25022" />
      <rect x="8.5" y="0" width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="0" y="8.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  );
}
