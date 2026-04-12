/**
 * Staging site verification script.
 *
 * Captures screenshots, extracts metadata and visible text,
 * checks for approved and stale messaging, and writes a
 * markdown audit report with screenshot artifacts.
 *
 * Usage:
 *   npx tsx scripts/verify-staging.ts
 *   STAGING_URL=https://custom-url.com npx tsx scripts/verify-staging.ts
 */

import { chromium, type Page } from "playwright";
import { writeFile, mkdir } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.STAGING_URL || "https://staging.kavachiq.com";
const ARTIFACTS_DIR = join(process.cwd(), "artifacts", "staging");
const REPORT_PATH = join(process.cwd(), "artifacts", "staging-site-audit.md");

const PAGES = [
  { path: "/", name: "home", label: "Homepage" },
  { path: "/platform", name: "platform", label: "Platform" },
];

const APPROVED_PHRASES = [
  "Recover from high-impact agent-driven changes",
  "Identity-first recovery",
  "Microsoft Entra",
  "Microsoft 365",
  "trusted operational state",
  "blast radius",
  "rollback, restoration, and compensating actions",
  "KavachIQ Autonomous Assurance",
];

const STALE_PHRASES = [
  "Deploy AI agents with confidence",
  "harmful agent-driven change",
  "harmful agent-driven changes",
  "harmful agent actions",
  "harmful autonomous change",
  "autonomous change visibility",
  "context engine",
  "Microsoft doesn't back up",
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface PageAudit {
  url: string;
  name: string;
  label: string;
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  canonical: string;
  firstH1: string;
  headings: string[];
  ctaTexts: string[];
  approvedFound: string[];
  approvedMissing: string[];
  staleFound: string[];
  screenshots: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGitInfo(): { commit: string; branch: string } {
  try {
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    return { commit, branch };
  } catch {
    return { commit: "unknown", branch: "unknown" };
  }
}

async function extractMetadata(page: Page) {
  return page.evaluate(`(() => {
    const getMeta = (name) =>
      (document.querySelector('meta[name="' + name + '"], meta[property="' + name + '"]') || {}).content || "";
    const getLink = (rel) =>
      (document.querySelector('link[rel="' + rel + '"]') || {}).href || "";

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((el) => el.tagName + ": " + (el.textContent || "").trim().substring(0, 120))
      .filter(Boolean);

    const ctaTexts = Array.from(
      document.querySelectorAll('a[href*="request-demo"], button[type="submit"], a[href*="how-it-works"]')
    )
      .map((el) => (el.textContent || "").trim())
      .filter(Boolean);

    const firstH1 = (document.querySelector("h1") || {}).textContent || "";

    return {
      title: document.title,
      metaDescription: getMeta("description"),
      ogTitle: getMeta("og:title"),
      ogDescription: getMeta("og:description"),
      canonical: getLink("canonical"),
      firstH1: firstH1.trim(),
      headings: headings,
      ctaTexts: ctaTexts,
      bodyText: document.body.innerText,
    };
  })()`) as Promise<{
    title: string;
    metaDescription: string;
    ogTitle: string;
    ogDescription: string;
    canonical: string;
    firstH1: string;
    headings: string[];
    ctaTexts: string[];
    bodyText: string;
  }>;
}

async function captureScreenshots(
  page: Page,
  pageName: string,
  viewport: "desktop" | "mobile",
): Promise<string[]> {
  const prefix = `${pageName}-${viewport}`;
  const files: string[] = [];

  // Top / hero
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const topFile = `${prefix}-top.png`;
  await page.screenshot({ path: join(ARTIFACTS_DIR, topFile) });
  files.push(topFile);

  // Middle
  const height = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate((h) => window.scrollTo(0, h * 0.35), height);
  await page.waitForTimeout(500);
  const midFile = `${prefix}-mid.png`;
  await page.screenshot({ path: join(ARTIFACTS_DIR, midFile) });
  files.push(midFile);

  // Footer / CTA area
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const footerFile = `${prefix}-footer.png`;
  await page.screenshot({ path: join(ARTIFACTS_DIR, footerFile) });
  files.push(footerFile);

  return files;
}

function checkPhrases(bodyText: string, phrases: string[]): { found: string[]; missing: string[] } {
  const lower = bodyText.toLowerCase();
  const found: string[] = [];
  const missing: string[] = [];
  for (const phrase of phrases) {
    if (lower.includes(phrase.toLowerCase())) {
      found.push(phrase);
    } else {
      missing.push(phrase);
    }
  }
  return { found, missing };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Staging verification: ${BASE_URL}\n`);

  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const browser = await chromium.launch();
  const git = getGitInfo();
  const timestamp = new Date().toISOString();
  const audits: PageAudit[] = [];

  for (const pageConfig of PAGES) {
    const url = `${BASE_URL}${pageConfig.path}`;
    console.log(`  Auditing ${pageConfig.label} (${url})...`);

    const allScreenshots: string[] = [];

    for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport: vpSize });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1000); // let animations settle

      // Extract metadata (only once, from desktop)
      let meta = { title: "", metaDescription: "", ogTitle: "", ogDescription: "", canonical: "", firstH1: "", headings: [] as string[], ctaTexts: [] as string[], bodyText: "" };
      if (vpName === "desktop") {
        meta = await extractMetadata(page);
      }

      const screenshots = await captureScreenshots(page, pageConfig.name, vpName as "desktop" | "mobile");
      allScreenshots.push(...screenshots);

      if (vpName === "desktop") {
        const approved = checkPhrases(meta.bodyText, APPROVED_PHRASES);
        const stale = checkPhrases(meta.bodyText, STALE_PHRASES);

        audits.push({
          url,
          name: pageConfig.name,
          label: pageConfig.label,
          title: meta.title,
          metaDescription: meta.metaDescription,
          ogTitle: meta.ogTitle,
          ogDescription: meta.ogDescription,
          canonical: meta.canonical,
          firstH1: meta.firstH1,
          headings: meta.headings,
          ctaTexts: [...new Set(meta.ctaTexts)],
          approvedFound: approved.found,
          approvedMissing: approved.missing,
          staleFound: stale.found,
          screenshots: [...screenshots],
        });
      } else {
        const existing = audits.find((a) => a.name === pageConfig.name);
        if (existing) {
          existing.screenshots.push(...screenshots);
        }
      }

      await context.close();
    }
  }

  await browser.close();

  // ─── Generate report ─────────────────────────────────────────────────────

  const staleCount = audits.reduce((n, a) => n + a.staleFound.length, 0);
  const status = staleCount === 0 ? "✅ PASS" : "⚠️ STALE PHRASES FOUND";

  let report = `# Staging Site Audit Report

**Status:** ${status}
**Timestamp:** ${timestamp}
**Commit:** \`${git.commit}\` on \`${git.branch}\`
**Target:** ${BASE_URL}
**Pages audited:** ${audits.map((a) => a.label).join(", ")}

---

`;

  for (const audit of audits) {
    report += `## ${audit.label}

**URL:** ${audit.url}

### Metadata

| Field | Value |
|-------|-------|
| Title | ${audit.title} |
| Meta description | ${audit.metaDescription.substring(0, 120)}${audit.metaDescription.length > 120 ? "..." : ""} |
| OG title | ${audit.ogTitle} |
| OG description | ${audit.ogDescription.substring(0, 120)}${audit.ogDescription.length > 120 ? "..." : ""} |
| Canonical | ${audit.canonical || "not set"} |

### First H1

> ${audit.firstH1}

### Section Headings

${audit.headings.map((h) => `- ${h}`).join("\n")}

### CTA Text

${audit.ctaTexts.map((c) => `- "${c}"`).join("\n") || "- none found"}

### Approved Phrases

${audit.approvedFound.length > 0 ? audit.approvedFound.map((p) => `- ✅ ${p}`).join("\n") : "- none found"}

${audit.approvedMissing.length > 0 ? `\n**Missing approved phrases:**\n${audit.approvedMissing.map((p) => `- ❌ ${p}`).join("\n")}` : ""}

### Stale Phrases

${audit.staleFound.length > 0 ? audit.staleFound.map((p) => `- 🚨 ${p}`).join("\n") : "- ✅ None found"}

### Screenshots

${audit.screenshots.map((s) => `- \`staging/${s}\``).join("\n")}

---

`;
  }

  report += `## Summary

| Check | Result |
|-------|--------|
| Stale phrases | ${staleCount === 0 ? "✅ None found" : `⚠️ ${staleCount} found`} |
| Homepage H1 | ${audits.find((a) => a.name === "home")?.firstH1 || "?"} |
| Platform H1 | ${audits.find((a) => a.name === "platform")?.firstH1 || "?"} |
| Screenshots captured | ${audits.reduce((n, a) => n + a.screenshots.length, 0)} |

*Generated by \`npm run verify:staging\`*
`;

  await writeFile(REPORT_PATH, report);

  // Also write JSON for programmatic use
  const jsonPath = join(process.cwd(), "artifacts", "staging-site-audit.json");
  await writeFile(jsonPath, JSON.stringify({ timestamp, git, baseUrl: BASE_URL, status, audits }, null, 2));

  console.log(`\n  📄 Report: artifacts/staging-site-audit.md`);
  console.log(`  📊 JSON:   artifacts/staging-site-audit.json`);
  console.log(`  📸 Screenshots: artifacts/staging/ (${audits.reduce((n, a) => n + a.screenshots.length, 0)} files)`);
  console.log(`\n  ${status}\n`);

  if (staleCount > 0) {
    console.log("  Stale phrases found:");
    for (const audit of audits) {
      for (const phrase of audit.staleFound) {
        console.log(`    🚨 [${audit.label}] "${phrase}"`);
      }
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
