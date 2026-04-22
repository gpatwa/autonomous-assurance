import type { MetadataRoute } from "next";
import { IS_PUBLIC_PRODUCTION, SITE_ORIGIN } from "@/lib/site";

/**
 * robots.txt generation.
 *
 * Public production origin (`agents.kavachiq.com`) is indexable; every
 * other origin — staging.kavachiq.com, preview deployments, localhost —
 * is noindex so non-public environments never compete with the canonical
 * product surface in search.
 *
 * The `/demo` route stays disallowed on the public site as well: it's an
 * unauthenticated interactive walkthrough, not search-discoverable
 * content (already `robots: { index: false }` at the route level).
 *
 * See `docs/AGENTS_SUBDOMAIN_SEO_PLAN.md` for the IA rationale.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PUBLIC_PRODUCTION) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/demo", "/api/"],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
