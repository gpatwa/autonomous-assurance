/**
 * Auth.js (next-auth v5) configuration for the KavachIQ Operator Console.
 *
 * Operators authenticate via Entra ID (Microsoft). After sign-in the
 * session carries:
 *   - user.name / user.email  — operator identity
 *   - tid                     — Entra tenant ID of the signed-in operator
 *
 * Tenant resolution (v1 — env-based):
 *   AUTH_TID_TO_TENANT = "<entra-tid>:<kq-tenantId>,..."
 *   maps the operator's Entra org (tid) to the KavachIQ tenant they're
 *   authorised to view.
 *
 * TODO (Phase 2): replace the static env map with a DB lookup against the
 * `tenants` table (microsoft_tenant_id column).
 *
 * Required env vars:
 *   AUTH_SECRET                         — session encryption key (random)
 *   AUTH_MICROSOFT_ENTRA_ID_ID          — app client ID
 *   AUTH_MICROSOFT_ENTRA_ID_SECRET      — client secret
 *   AUTH_MICROSOFT_ENTRA_ID_TENANT_ID   — Entra tenant ID for sign-in
 *   AUTH_TID_TO_TENANT                  — tid→tenantId map
 */

import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type { DefaultSession } from "next-auth";

// Extend the built-in session types
declare module "next-auth" {
  interface Session extends DefaultSession {
    /** Entra tenant ID of the signed-in operator's organisation. */
    tid: string | null;
    /** KavachIQ tenant the operator is authorised to view. */
    kavachiqTenantId: string | null;
  }
}

/** Parse AUTH_TID_TO_TENANT into a Map. */
function buildTenantMap(): Map<string, string> {
  const raw = process.env.AUTH_TID_TO_TENANT ?? "";
  const map = new Map<string, string>();
  for (const entry of raw.split(",")) {
    const [tid, kqTenant] = entry.trim().split(":");
    if (tid && kqTenant) map.set(tid, kqTenant);
  }
  return map;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
    }),
  ],

  callbacks: {
    jwt({ token, account, profile }) {
      // account + profile are set only on the initial sign-in
      if (account && profile) {
        // `tid` is on the raw OIDC id_token profile for Entra
        const tid = (profile as Record<string, unknown>).tid as string | undefined;
        token.tid = tid;
        if (tid) {
          token.kavachiqTenantId = buildTenantMap().get(tid) ?? null;
        }
      }
      return token;
    },
    session({ session, token }) {
      session.tid = (token.tid as string | undefined) ?? null;
      session.kavachiqTenantId = (token.kavachiqTenantId as string | undefined) ?? null;
      return session;
    },
  },

  pages: {
    signIn: "/console/sign-in",
    error: "/console/sign-in",
  },
});
