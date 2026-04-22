# Agents subdomain — public IA and SEO

**Status:** implemented (this repo)
**Scope:** narrow SEO / information-architecture pass. Does not redesign the site or change product strategy.

## The two products under one brand

KavachIQ has two distinct public products; they share the `KavachIQ` parent brand but are different product surfaces.

| Product | Hostname | Repo | What it is |
|---|---|---|---|
| KavachIQ (Microsoft 365 backup / ransomware recovery) | `kavachiq.com` | _(separate repo)_ | The parent brand's backup-and-recovery product. |
| KavachIQ Autonomous Assurance (agents / assurance) | `agents.kavachiq.com` | this repo | Recovery layer for high-impact agent-driven changes across Microsoft Entra and Microsoft 365. |

Both surfaces need to be discoverable in search without confusing each other. Sharing one hostname (or letting both redirect under the same root domain) collapses the two products in Google's eyes; splitting by subdomain keeps the brand unified and the product intents distinct.

## Why `staging.kavachiq.com` must not be the public discoverable URL

`staging.` is a convention that readers (and Google) interpret as pre-production. Publishing product marketing from a hostname called "staging" sends three bad signals at once:

1. **Confusing brand signal.** "staging" implies not-for-production; buyers and partners correctly distrust the URL.
2. **Split indexing risk.** If Google finds both `kavachiq.com` and `staging.kavachiq.com`, it may cluster them as duplicate surfaces of the backup product or demote the staging one.
3. **No path to a real public site.** Once `staging.` is publicly linked on buyer docs, there's no clean way to move it later without redirect debt.

The fix is to give the agents product its own intentional public hostname — `agents.kavachiq.com` — and keep `staging.kavachiq.com` for what the name suggests: the non-public test environment.

## What this pass changed in the repo

All changes are metadata / config. No product code, no backend, no platform work.

### 1. Single-source-of-truth site config

- **New:** [`src/lib/site.ts`](../src/lib/site.ts) exports `SITE_ORIGIN`, `SITE_NAME`, `PARENT_BRAND`, `PARENT_BRAND_URL`, `IS_PUBLIC_PRODUCTION`, and `siteUrl(path)`.
- Resolves from `NEXT_PUBLIC_SITE_ORIGIN`; defaults to `https://agents.kavachiq.com`.
- `IS_PUBLIC_PRODUCTION` is `true` only when the origin matches the canonical public hostname. Staging / preview / local all resolve to `false` and drive noindex behavior automatically.

### 2. Root layout metadata

- [`src/app/layout.tsx`](../src/app/layout.tsx) — `metadataBase` now reads `SITE_ORIGIN`.
- `openGraph.siteName` switched from the ambiguous `"KavachIQ"` to `"KavachIQ Autonomous Assurance"` — this is what search surfaces use to label the site. The parent brand stays visible via the JSON-LD publisher.
- Title template is `%s | KavachIQ Autonomous Assurance` (was `%s | KavachIQ`). Search results for sub-pages now name the product surface, not just the parent brand.
- `alternates.canonical: "/"` makes the root's canonical self-reference explicit; Next.js resolves it against `metadataBase`, so `staging` and `preview` origins cannot declare themselves canonical for the public product.
- Environment-aware `robots` in root metadata: non-public origins ship `index: false, follow: false` regardless of any page-level metadata.

### 3. JSON-LD identity

A single small `WebSite` + `Organization` publisher block in the root layout:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "KavachIQ Autonomous Assurance",
  "url": "https://agents.kavachiq.com",
  "publisher": {
    "@type": "Organization",
    "name": "KavachIQ",
    "url": "https://kavachiq.com"
  }
}
```

This tells search engines: "the parent brand KavachIQ (`kavachiq.com`) publishes this product site (`agents.kavachiq.com`)." No SoftwareApplication / Product / FAQPage bloat — kept minimal and honest.

### 4. robots.ts

- [`src/app/robots.ts`](../src/app/robots.ts) is environment-aware.
- On `agents.kavachiq.com`: allow `/`, disallow `/demo` and `/api/`, declare the sitemap, set the canonical host.
- Everywhere else (including `staging.kavachiq.com`): `User-Agent: *` / `Disallow: /`. Staging can no longer be accidentally indexed.

### 5. sitemap.ts

- [`src/app/sitemap.ts`](../src/app/sitemap.ts) enumerates the two indexable product surfaces: `/` and `/platform`.
- `/demo` is intentionally omitted (unauthenticated interactive walkthrough, `robots: { index: false }` at the route level).

### 6. OG image

- [`src/app/opengraph-image.tsx`](../src/app/opengraph-image.tsx) footer text is now `agents.kavachiq.com`, not `kavachiq.com`. This is the image shown in social previews and some SERP features — it has to name the product surface, not the parent brand.

### 7. Buyer-facing docs

- [`docs/DEMO_SCRIPT.md`](DEMO_SCRIPT.md), [`docs/BUYER_EXEC_ONE_PAGER.md`](BUYER_EXEC_ONE_PAGER.md), [`docs/BUYER_EXEC_ONE_PAGER_SHORT.md`](BUYER_EXEC_ONE_PAGER_SHORT.md) — public URLs switched from `staging.kavachiq.com` to `agents.kavachiq.com`. Internal-only references to the staging environment remain where they genuinely mean "the test env" (e.g., the `scripts/verify-staging.ts` script is unchanged).

## Environment variables

Added to [`.env.example`](../.env.example):

```
NEXT_PUBLIC_SITE_ORIGIN=https://agents.kavachiq.com
```

| Deployment | Value to set |
|---|---|
| Production (public) | leave unset _or_ `https://agents.kavachiq.com` |
| Staging | `https://staging.kavachiq.com` |
| Preview / PR build | the preview URL (or leave unset if previews should 404 to crawlers) |
| Local dev | unset, or `http://localhost:3000` |

`NEXT_PUBLIC_SITE_ORIGIN` is evaluated at build time, so redeployments pick up new values cleanly. Unset → public production default (no surprise noindex in prod just because an env var is missing).

## What still has to happen outside the repo

1. **DNS.** Point `agents.kavachiq.com` CNAME / ALIAS to whatever hosts the public build (Azure App Service, Vercel, etc.). Keep `staging.kavachiq.com` pointed separately to the staging build.
2. **TLS.** Issue a cert for `agents.kavachiq.com` (managed cert or similar). Staging cert stays as-is.
3. **Deployment config.** On the staging deployment, set `NEXT_PUBLIC_SITE_ORIGIN=https://staging.kavachiq.com`. The repo defaults to the public origin, so production needs nothing; staging is the one that must override.
4. **Google Search Console.** Add and verify `https://agents.kavachiq.com` as a new property. Submit `https://agents.kavachiq.com/sitemap.xml`. Do _not_ submit the staging site.
5. **Social preview recache.** After DNS cutover, refresh the OG image cache on LinkedIn / X / Slack (each has its own re-scrape mechanism).
6. **Old links.** Audit any existing external references (LinkedIn posts, investor decks, partner pages) and update them to `agents.kavachiq.com`. If `staging.kavachiq.com` was indexed, a 410 or noindex on its home is cleaner than a redirect — redirecting staging → agents would conflate the two hostnames in Search Console.

## Deploy checklist (concrete commands)

Run `npm run verify:seo` after each deploy to prove the contracts in this doc hold against the real URL. Zero exit = all 16 assertions pass; non-zero = drift, with a per-check diff in the output.

### Step 1 — staging deploy (non-public, noindex)

```bash
# In the staging deploy config (Azure App Service / Vercel / etc.):
#   set NEXT_PUBLIC_SITE_ORIGIN=https://staging.kavachiq.com
# Trigger a deploy.

# Then from any machine with network access to staging:
SITE_URL=https://staging.kavachiq.com npm run verify:seo
```

Expected: `PASS`. Key assertions specific to this step:

- `robots.txt` serves `Disallow: /` with no sitemap declaration.
- `<meta name="robots">` is `noindex, nofollow`.
- Canonical is `https://staging.kavachiq.com` (self), **not** the public origin.
- `og:url` matches the staging origin, not the public one.
- If `sitemap.xml` is served, its URLs do not advertise the public origin.

### Step 2 — public deploy + Search Console

```bash
# DNS: agents.kavachiq.com CNAME/ALIAS → public host.
# TLS: cert for agents.kavachiq.com.
# Prod deploy config:
#   leave NEXT_PUBLIC_SITE_ORIGIN unset  (defaults to https://agents.kavachiq.com)
#   OR set it explicitly to https://agents.kavachiq.com
# Trigger the production deploy.

npm run verify:seo    # defaults to SITE_URL=https://agents.kavachiq.com
```

Expected: `PASS`. Key assertions specific to this step:

- `robots.txt`: `Allow: /`, `Disallow: /demo`, `Disallow: /api/`, `Sitemap: https://agents.kavachiq.com/sitemap.xml`, `Host: https://agents.kavachiq.com`.
- `sitemap.xml`: valid `<urlset>` listing `/` and `/platform` at the public origin, with no staging/preview/localhost URLs leaking in.
- `<meta name="robots">`: `index, follow`.
- `<link rel="canonical">` and `og:url`: `https://agents.kavachiq.com`.
- `og:site_name`: `KavachIQ Autonomous Assurance`.
- JSON-LD: `@type: WebSite`, `name: KavachIQ Autonomous Assurance`, `publisher.name: KavachIQ`, `publisher.url: https://kavachiq.com`.

After `verify:seo` passes against the live public host:

1. Add `https://agents.kavachiq.com` as a property in Google Search Console.
2. Verify ownership (DNS TXT / HTML tag — whichever method you already use for `kavachiq.com`).
3. Submit `https://agents.kavachiq.com/sitemap.xml` in the Sitemaps section.
4. Request indexing on the home and `/platform` (optional — speeds up first crawl).
5. Re-scrape OG preview on LinkedIn Post Inspector, X Card Validator, and Slack (paste the URL into a DM).
6. Update external references: LinkedIn company page, investor deck, partner pages. Prefer 410 over 301 for the old `staging.kavachiq.com` root if it was ever publicly indexed.

## Deferred (not in this pass)

- Blog / resource pages on the agents subdomain.
- Product-specific structured data beyond the WebSite + Organization pair (e.g., SoftwareApplication, FAQPage) — add when there's content that justifies it.
- hreflang / locale subpaths — site is English-only today.
- A `/security.txt` or `/humans.txt` — add if/when there's content.
- Cross-linking discipline between `kavachiq.com` and `agents.kavachiq.com` — worth a dedicated pass once both sites are live so the internal-linking strategy reflects the two-product IA intentionally.
