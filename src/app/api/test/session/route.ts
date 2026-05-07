/**
 * Test-only session endpoint.
 *
 * Creates a valid next-auth session cookie directly, bypassing the Microsoft
 * Entra OAuth flow. Used by Playwright's auth.setup.ts to seed authenticated
 * state without going through the browser-based OAuth redirect loop.
 *
 * DISABLED IN PRODUCTION — returns 404 when NODE_ENV=production.
 *
 * Usage (from auth.setup.ts):
 *   await page.goto("/api/test/session");
 *   // session cookie is now set; save storageState and proceed
 */

import { encode } from "@auth/core/jwt";
import { NextResponse } from "next/server";

// Cookie name used by next-auth for HTTP origins (no __Secure- prefix)
const COOKIE_NAME = "authjs.session-token";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET not set" }, { status: 500 });
  }

  const tenantId = process.env.AUTH_TID_TO_TENANT?.split(":")?.[1] ?? null;

  const token = await encode({
    token: {
      name: "Test Operator",
      email: "test@kavachiq.dev",
      tid: process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? null,
      kavachiqTenantId: tenantId,
    },
    secret,
    salt: COOKIE_NAME,
    maxAge: 60 * 60, // 1 hour
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
  return res;
}
