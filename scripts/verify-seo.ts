/**
 * Post-deploy SEO contract verifier.
 *
 * Fetches `/robots.txt`, `/sitemap.xml`, and `/` against the target
 * origin and asserts the metadata / canonical / robots / sitemap
 * contracts established in `docs/AGENTS_SUBDOMAIN_SEO_PLAN.md`. Runs
 * in two modes, chosen automatically from the URL:
 *
 *   - `https://agents.kavachiq.com` → public mode (indexable, sitemap,
 *     canonical self-reference, JSON-LD publisher = KavachIQ).
 *   - anything else (staging, preview, localhost) → non-public mode
 *     (noindex, robots disallow /, canonical self-reference to the
 *     same origin — NOT the public one).
 *
 * Exits 0 on all-pass, 1 on any drift. No browser dependency — uses
 * only stdlib `fetch` (Node 20+). Pair with `verify-staging.ts` for
 * visual/copy auditing; this script covers only SEO contracts.
 *
 * Usage:
 *   npm run verify:seo                             # defaults to https://agents.kavachiq.com
 *   SITE_URL=https://staging.kavachiq.com npm run verify:seo
 *   SITE_URL=http://localhost:3000 npm run verify:seo
 */

// ─── Config ──────────────────────────────────────────────────────────────

const PUBLIC_PRODUCTION_ORIGIN = "https://agents.kavachiq.com";
const PARENT_BRAND = "KavachIQ";
const PARENT_BRAND_URL = "https://kavachiq.com";
const SITE_NAME = "KavachIQ Autonomous Assurance";

const targetOrigin = (process.env.SITE_URL ?? PUBLIC_PRODUCTION_ORIGIN).replace(/\/+$/, "");
const isPublic = targetOrigin === PUBLIC_PRODUCTION_ORIGIN;
const expectedPublicPaths = ["/", "/platform"];

// ─── Tiny assertion framework ─────────────────────────────────────────────

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
}

// ─── Fetch helpers ────────────────────────────────────────────────────────

async function fetchText(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${targetOrigin}${path}`, { redirect: "manual" });
  const body = await res.text();
  return { status: res.status, body };
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern);
  return m ? m[1] ?? m[0] : null;
}

// ─── Per-resource checks ──────────────────────────────────────────────────

async function checkRobots(): Promise<void> {
  const { status, body } = await fetchText("/robots.txt");
  check("robots.txt: 200 OK", status === 200, `status=${status}`);
  if (status !== 200) return;

  if (isPublic) {
    check(
      "robots.txt: Allow: / present",
      /^Allow:\s*\/\s*$/m.test(body),
      body.split("\n").find((l) => l.startsWith("Allow:")) ?? "(no Allow line)",
    );
    check(
      "robots.txt: Disallow: /demo",
      /^Disallow:\s*\/demo\s*$/m.test(body),
      body.split("\n").filter((l) => /Disallow/.test(l)).join(" | ") || "(no Disallow /demo)",
    );
    check(
      "robots.txt: Sitemap declared at public origin",
      body.includes(`Sitemap: ${PUBLIC_PRODUCTION_ORIGIN}/sitemap.xml`),
      body.split("\n").find((l) => l.startsWith("Sitemap:")) ?? "(no Sitemap line)",
    );
    check(
      "robots.txt: Host matches public origin",
      body.includes(`Host: ${PUBLIC_PRODUCTION_ORIGIN}`),
      body.split("\n").find((l) => l.startsWith("Host:")) ?? "(no Host line)",
    );
  } else {
    check(
      "robots.txt: Disallow: / present (non-public origin must be noindex)",
      /^Disallow:\s*\/\s*$/m.test(body),
      body.split("\n").filter((l) => /Disallow/.test(l)).join(" | ") || "(no Disallow /)",
    );
    check(
      "robots.txt: no Sitemap declaration on non-public origin",
      !/^Sitemap:/m.test(body),
      body.split("\n").find((l) => l.startsWith("Sitemap:")) ?? "(none — good)",
    );
  }
}

async function checkSitemap(): Promise<void> {
  if (!isPublic) {
    // Sitemap is technically served on staging too (Next.js can't route
    // by origin), but robots.txt disallows crawling it. We still verify
    // the URLs in the sitemap match the origin they were served from, so
    // a staging sitemap doesn't accidentally advertise public URLs.
    const { status, body } = await fetchText("/sitemap.xml");
    if (status === 200) {
      check(
        "sitemap.xml (non-public): URLs match own origin, not public origin",
        !body.includes(PUBLIC_PRODUCTION_ORIGIN),
        body.includes(PUBLIC_PRODUCTION_ORIGIN)
          ? "staging sitemap referenced the public origin — drift"
          : "(ok)",
      );
    }
    return;
  }

  const { status, body } = await fetchText("/sitemap.xml");
  check("sitemap.xml: 200 OK", status === 200, `status=${status}`);
  if (status !== 200) return;

  check(
    "sitemap.xml: valid <urlset> envelope",
    /<urlset\b[^>]*>[\s\S]*<\/urlset>/.test(body),
    body.substring(0, 80),
  );
  for (const p of expectedPublicPaths) {
    const want = `${PUBLIC_PRODUCTION_ORIGIN}${p === "/" ? "/" : p}`;
    check(
      `sitemap.xml: lists ${p}`,
      body.includes(`<loc>${want}</loc>`),
      `looking for <loc>${want}</loc>`,
    );
  }
  check(
    "sitemap.xml: no non-public origins leak in",
    !/<loc>https?:\/\/(?:staging|localhost|preview)/.test(body),
    body.match(/<loc>https?:\/\/(?:staging|localhost|preview)[^<]*<\/loc>/)?.[0] ?? "(ok)",
  );
}

async function checkRootHead(): Promise<void> {
  const { status, body } = await fetchText("/");
  check("/: 200 OK", status === 200, `status=${status}`);
  if (status !== 200) return;

  const metaRobots = firstMatch(body, /<meta\s+name="robots"\s+content="([^"]+)"/i);
  const canonical = firstMatch(body, /<link\s+rel="canonical"\s+href="([^"]+)"/i);
  const ogUrl = firstMatch(body, /<meta\s+property="og:url"\s+content="([^"]+)"/i);
  const ogSiteName = firstMatch(body, /<meta\s+property="og:site_name"\s+content="([^"]+)"/i);
  const ogTitle = firstMatch(body, /<meta\s+property="og:title"\s+content="([^"]+)"/i);
  const jsonLdRaw = firstMatch(
    body,
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i,
  );

  if (isPublic) {
    check(
      "meta robots: index, follow",
      metaRobots === "index, follow",
      `actual: ${metaRobots ?? "(missing)"}`,
    );
    check(
      "canonical matches public origin",
      canonical === PUBLIC_PRODUCTION_ORIGIN,
      `actual: ${canonical ?? "(missing)"}`,
    );
    check(
      "og:url matches public origin",
      ogUrl === PUBLIC_PRODUCTION_ORIGIN,
      `actual: ${ogUrl ?? "(missing)"}`,
    );
  } else {
    check(
      "meta robots: noindex, nofollow (non-public)",
      metaRobots === "noindex, nofollow",
      `actual: ${metaRobots ?? "(missing)"}`,
    );
    check(
      "canonical is self (does NOT claim public origin)",
      canonical === targetOrigin,
      `actual: ${canonical ?? "(missing)"}; expected ${targetOrigin}`,
    );
    check(
      "og:url is self, not the public origin",
      ogUrl === targetOrigin,
      `actual: ${ogUrl ?? "(missing)"}; expected ${targetOrigin}`,
    );
  }

  check(
    `og:site_name = "${SITE_NAME}"`,
    ogSiteName === SITE_NAME,
    `actual: ${ogSiteName ?? "(missing)"}`,
  );
  check(
    `og:title present and non-empty`,
    typeof ogTitle === "string" && ogTitle.length > 0,
    `actual: ${ogTitle ?? "(missing)"}`,
  );

  check("JSON-LD block present", jsonLdRaw !== null, jsonLdRaw ? "(present)" : "(missing)");
  if (jsonLdRaw) {
    try {
      const data = JSON.parse(jsonLdRaw.trim()) as {
        "@type"?: string;
        name?: string;
        url?: string;
        publisher?: { "@type"?: string; name?: string; url?: string };
      };
      check('JSON-LD: @type = "WebSite"', data["@type"] === "WebSite", `actual: ${data["@type"]}`);
      check(`JSON-LD: name = "${SITE_NAME}"`, data.name === SITE_NAME, `actual: ${data.name}`);
      check(
        isPublic
          ? "JSON-LD: url = public origin"
          : "JSON-LD: url = own origin (not public)",
        data.url === (isPublic ? PUBLIC_PRODUCTION_ORIGIN : targetOrigin),
        `actual: ${data.url}`,
      );
      check(
        `JSON-LD: publisher.name = "${PARENT_BRAND}"`,
        data.publisher?.name === PARENT_BRAND,
        `actual: ${data.publisher?.name}`,
      );
      check(
        `JSON-LD: publisher.url = "${PARENT_BRAND_URL}"`,
        data.publisher?.url === PARENT_BRAND_URL,
        `actual: ${data.publisher?.url}`,
      );
    } catch (err) {
      check("JSON-LD: parses as JSON", false, `error: ${(err as Error).message}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = isPublic ? "PUBLIC" : "NON-PUBLIC";
  console.log(`\n🔍 verify-seo: ${targetOrigin} (mode: ${mode})\n`);

  await checkRobots();
  await checkSitemap();
  await checkRootHead();

  const fail = results.filter((r) => !r.ok);
  const maxLen = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`  ${icon} ${r.name.padEnd(maxLen)}  ${r.detail}`);
  }
  console.log(`\n  ${fail.length === 0 ? "✅ PASS" : `❌ FAIL (${fail.length} of ${results.length})`}\n`);
  process.exit(fail.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("verify-seo failed:", err);
  process.exit(2);
});
