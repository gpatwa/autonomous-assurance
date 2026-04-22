/**
 * Site identity + origin configuration.
 *
 * Single source of truth for the public hostname, parent brand, and
 * product name used across metadata, canonical tags, sitemap, robots,
 * and JSON-LD. See `docs/AGENTS_SUBDOMAIN_SEO_PLAN.md` for the
 * parent-brand + product-surface IA this config supports.
 *
 * `NEXT_PUBLIC_SITE_ORIGIN` drives per-environment behavior:
 *   - https://agents.kavachiq.com  → public product, indexable
 *   - https://staging.kavachiq.com → non-public test env, noindex
 *   - http://localhost:3000        → dev, noindex
 */

/** Canonical public hostname for the agents / autonomous-assurance product. */
export const PUBLIC_PRODUCTION_ORIGIN = "https://agents.kavachiq.com";

/** Parent brand (shared with the backup/recovery product at kavachiq.com). */
export const PARENT_BRAND = "KavachIQ";

/** Product / site name — distinct from the parent brand to disambiguate in search. */
export const SITE_NAME = "KavachIQ Autonomous Assurance";

/** Parent brand root URL (the backup/recovery product). */
export const PARENT_BRAND_URL = "https://kavachiq.com";

/**
 * Resolved site origin.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_SITE_ORIGIN` env var (the canonical source of truth).
 *   2. `NODE_ENV === "production"` → public production origin. This is
 *      the safety default so a missing env var in prod does NOT noindex.
 *   3. Otherwise (dev / preview) → `http://localhost:3000`. Ensures a
 *      plain `npm run dev` never emits `index, follow` or a canonical
 *      pointing at the real public hostname.
 *
 * Trailing slashes are stripped so downstream code can freely concat paths.
 */
export const SITE_ORIGIN: string = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ??
  (process.env.NODE_ENV === "production"
    ? PUBLIC_PRODUCTION_ORIGIN
    : "http://localhost:3000")
).replace(/\/+$/, "");

/** True only when the resolved origin is the public production hostname. */
export const IS_PUBLIC_PRODUCTION: boolean =
  SITE_ORIGIN === PUBLIC_PRODUCTION_ORIGIN;

/** Join a path onto the site origin. */
export function siteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized}`;
}
