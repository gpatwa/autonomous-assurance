/**
 * Staging site verification script.
 *
 * Captures section-aware screenshots using real selectors,
 * extracts metadata and visible text, checks for approved
 * and stale messaging, and writes an audit report.
 *
 * Usage:
 *   npm run verify:staging
 *   STAGING_URL=https://custom-url.com npm run verify:staging
 */

import { chromium, type Page, type BrowserContext } from "playwright";
import { writeFile, mkdir } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.STAGING_URL || "https://staging.kavachiq.com";
const ARTIFACTS_DIR = join(process.cwd(), "artifacts", "staging");
const REPORT_PATH = join(process.cwd(), "artifacts", "staging-site-audit.md");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
};

// Sections to capture per page. Each entry scrolls to the selector,
// waits for it to be visible, then takes a viewport screenshot.
const PAGE_SECTIONS: Record<string, { selector: string; name: string }[]> = {
  home: [
    { selector: "h1", name: "hero" },
    { selector: "#why-kavachiq", name: "comparison" },
    { selector: "#how-it-works", name: "how-it-works" },
    { selector: "#request-demo", name: "cta" },
    { selector: "footer", name: "footer" },
  ],
  platform: [
    { selector: "h1", name: "hero" },
    { selector: "#platform-proof", name: "proof" },
    { selector: "#identity-assurance", name: "entra" },
    { selector: "#data-assurance", name: "m365" },
    { selector: "#request-demo", name: "cta" },
  ],
};

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

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScreenshotInfo {
  file: string;
  section: string;
  viewport: string;
  heading: string;
}

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
  screenshots: ScreenshotInfo[];
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

async function createContext(browser: Awaited<ReturnType<typeof chromium.launch>>, viewport: { width: number; height: number }): Promise<BrowserContext> {
  return browser.newContext({
    viewport,
    // Disable animations so screenshots capture settled state
    reducedMotion: "reduce",
  });
}

async function extractMetadata(page: Page) {
  return page.evaluate(`(() => {
    var getMeta = function(name) {
      var el = document.querySelector('meta[name="' + name + '"]') || document.querySelector('meta[property="' + name + '"]');
      return el ? el.getAttribute("content") || "" : "";
    };
    var getLink = function(rel) {
      var el = document.querySelector('link[rel="' + rel + '"]');
      return el ? el.getAttribute("href") || "" : "";
    };
    var headings = [];
    document.querySelectorAll("h1, h2, h3").forEach(function(el) {
      var text = (el.textContent || "").trim().substring(0, 120);
      if (text) headings.push(el.tagName + ": " + text);
    });
    var ctaTexts = [];
    document.querySelectorAll('a[href*="request-demo"], button[type="submit"], a[href*="how-it-works"]').forEach(function(el) {
      var text = (el.textContent || "").trim();
      if (text) ctaTexts.push(text);
    });
    var h1 = document.querySelector("h1");
    return {
      title: document.title,
      metaDescription: getMeta("description"),
      ogTitle: getMeta("og:title"),
      ogDescription: getMeta("og:description"),
      canonical: getLink("canonical"),
      firstH1: h1 ? h1.textContent.trim() : "",
      headings: headings,
      ctaTexts: ctaTexts,
      bodyText: document.body.innerText
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

async function captureSection(
  page: Page,
  pageName: string,
  section: { selector: string; name: string },
  viewport: string,
): Promise<ScreenshotInfo | null> {
  const filename = `${pageName}-${viewport}-${section.name}.png`;
  const filepath = join(ARTIFACTS_DIR, filename);

  try {
    // Try to find the element
    const el = page.locator(section.selector).first();
    await el.waitFor({ state: "visible", timeout: 5000 });

    // Scroll it into view with some top padding
    await el.evaluate((node: Element) => {
      const rect = node.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.top - 40, behavior: "instant" });
    });

    // Wait for layout to settle after scroll
    await page.waitForTimeout(800);

    // Get the nearest heading for the report
    const heading = await el.evaluate((node: Element) => {
      const h = node.closest("section")?.querySelector("h1, h2, h3");
      return h ? h.textContent?.trim()?.substring(0, 80) || "" : "";
    }).catch(() => "");

    await page.screenshot({ path: filepath });

    return { file: filename, section: section.name, viewport, heading };
  } catch {
    console.log(`    ⚠ Could not capture ${section.name} (${section.selector})`);
    return null;
  }
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

// ─── Pages config ────────────────────────────────────────────────────────────

const PAGES = [
  { path: "/", name: "home", label: "Homepage" },
  { path: "/platform", name: "platform", label: "Platform" },
];

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
    const sections = PAGE_SECTIONS[pageConfig.name] || [];
    console.log(`  📄 ${pageConfig.label} (${url})`);

    const allScreenshots: ScreenshotInfo[] = [];

    for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {
      console.log(`    ${vpName} (${vpSize.width}x${vpSize.height})`);
      const context = await createContext(browser, vpSize);
      const page = await context.newPage();

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      // Extra wait for fonts and hydration
      await page.waitForTimeout(1500);

      // Extract metadata once from desktop
      let meta = { title: "", metaDescription: "", ogTitle: "", ogDescription: "", canonical: "", firstH1: "", headings: [] as string[], ctaTexts: [] as string[], bodyText: "" };
      if (vpName === "desktop") {
        meta = await extractMetadata(page);
      }

      // Capture each named section
      for (const section of sections) {
        const info = await captureSection(page, pageConfig.name, section, vpName);
        if (info) {
          allScreenshots.push(info);
          console.log(`      ✓ ${section.name}`);
        }
      }

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
          screenshots: [],
        });
      }

      await context.close();
    }

    // Attach all screenshots to the audit entry
    const audit = audits.find((a) => a.name === pageConfig.name);
    if (audit) {
      audit.screenshots = allScreenshots;
    }
  }

  await browser.close();

  // ─── Generate report ─────────────────────────────────────────────────────

  const staleCount = audits.reduce((n, a) => n + a.staleFound.length, 0);
  const totalScreenshots = audits.reduce((n, a) => n + a.screenshots.length, 0);
  const status = staleCount === 0 ? "✅ PASS" : "⚠️ STALE PHRASES FOUND";

  let report = `# Staging Site Audit Report

**Status:** ${status}
**Timestamp:** ${timestamp}
**Commit:** \`${git.commit}\` on \`${git.branch}\`
**Target:** ${BASE_URL}
**Pages audited:** ${audits.map((a) => a.label).join(", ")}
**Screenshots:** ${totalScreenshots}

---

`;

  for (const audit of audits) {
    report += `## ${audit.label}

**URL:** ${audit.url}

### Metadata

| Field | Value |
|-------|-------|
| Title | ${audit.title} |
| Meta description | ${audit.metaDescription.substring(0, 140)}${audit.metaDescription.length > 140 ? "..." : ""} |
| OG title | ${audit.ogTitle} |
| OG description | ${audit.ogDescription.substring(0, 140)}${audit.ogDescription.length > 140 ? "..." : ""} |
| Canonical | ${audit.canonical || "not set"} |

### First H1

> ${audit.firstH1}

### Section Headings

${audit.headings.map((h) => `- ${h}`).join("\n")}

### CTA Text

${audit.ctaTexts.map((c) => `- "${c}"`).join("\n") || "- none found"}

### Approved Phrases

${audit.approvedFound.map((p) => `- ✅ ${p}`).join("\n") || "- none found"}
${audit.approvedMissing.length > 0 ? `\n**Missing:**\n${audit.approvedMissing.map((p) => `- ❌ ${p}`).join("\n")}` : ""}

### Stale Phrases

${audit.staleFound.length > 0 ? audit.staleFound.map((p) => `- 🚨 ${p}`).join("\n") : "- ✅ None found"}

### Screenshots

| Section | Viewport | Heading | File |
|---------|----------|---------|------|
${audit.screenshots.map((s) => `| ${s.section} | ${s.viewport} | ${s.heading.substring(0, 60)} | \`${s.file}\` |`).join("\n")}

---

`;
  }

  report += `## Summary

| Check | Result |
|-------|--------|
| Status | ${status} |
| Stale phrases | ${staleCount === 0 ? "✅ None" : `⚠️ ${staleCount} found`} |
| Homepage H1 | ${audits.find((a) => a.name === "home")?.firstH1 || "?"} |
| Platform H1 | ${audits.find((a) => a.name === "platform")?.firstH1 || "?"} |
| Screenshots | ${totalScreenshots} |

*Generated by \`npm run verify:staging\`*
`;

  await writeFile(REPORT_PATH, report);

  const jsonPath = join(process.cwd(), "artifacts", "staging-site-audit.json");
  await writeFile(jsonPath, JSON.stringify({ timestamp, git, baseUrl: BASE_URL, status, audits }, null, 2));

  console.log(`\n  📄 Report:      artifacts/staging-site-audit.md`);
  console.log(`  📊 JSON:        artifacts/staging-site-audit.json`);
  console.log(`  📸 Screenshots: artifacts/staging/ (${totalScreenshots} files)`);
  console.log(`\n  ${status}\n`);

  if (staleCount > 0) {
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
