/**
 * Next.js proxy — protect /console/** routes.
 *
 * Unauthenticated requests to /console (except /console/sign-in) are
 * redirected to the sign-in page. Auth.js handles session validation via
 * the encrypted cookie set at sign-in.
 *
 * Note: Next.js 16 renamed "middleware" to "proxy". Functionality is identical.
 */

import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isSignInPage = pathname === "/console/sign-in";

  if (!req.auth && !isSignInPage) {
    const signInUrl = new URL("/console/sign-in", req.url);
    signInUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  // Match all /console paths. The /((?!...) syntax excludes static assets.
  matcher: ["/console/:path*"],
};
