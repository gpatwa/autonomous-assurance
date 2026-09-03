/**
 * Browser smoke test for the public marketing deployment.
 *
 * Unlike the SEO verifier, this check catches a page that returns valid HTML
 * while its CSS or JavaScript assets fail to load.
 */

import { chromium } from "playwright";

const targetUrl = (process.env.MARKETING_URL ?? "https://agents.kavachiq.com").replace(/\/$/, "");
const failures: string[] = [];
const runtimeFailures: string[] = [];

function check(label: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? "✅" : "❌"} ${label}: ${detail}`);
  if (!ok) failures.push(`${label}: ${detail}`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const assetFailures: string[] = [];

  page.on("requestfailed", (request) => {
    if (["stylesheet", "script"].includes(request.resourceType())) {
      assetFailures.push(`${request.resourceType()} ${request.url()} (${request.failure()?.errorText ?? "failed"})`);
    }
  });

  page.on("response", (response) => {
    const resourceType = response.request().resourceType();
    if (["stylesheet", "script"].includes(resourceType) && response.status() >= 400) {
      assetFailures.push(`${resourceType} ${response.url()} (HTTP ${response.status()})`);
    }
  });

  page.on("pageerror", (error) => runtimeFailures.push(`page error: ${error.message}`));

  try {
    const response = await page.goto(`${targetUrl}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

  check("homepage response", response?.status() === 200, `HTTP ${response?.status() ?? "no response"}`);

  const state = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const nav = document.querySelector("nav");
    const cta = document.querySelector('a[href="#request-demo"]');
    const body = document.body;
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const navStyle = nav ? getComputedStyle(nav) : null;
    const ctaStyle = cta ? getComputedStyle(cta) : null;

    return {
      stylesheetCount: document.querySelectorAll('link[rel="stylesheet"]').length,
      loadedStylesheetCount: document.styleSheets.length,
      bodyBackground: getComputedStyle(body).backgroundColor,
      bodyWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      h1Text: h1?.textContent?.trim() ?? "",
      h1FontSize: h1Style?.fontSize ?? "",
      h1FontWeight: h1Style?.fontWeight ?? "",
      navPosition: navStyle?.position ?? "",
      ctaDisplay: ctaStyle?.display ?? "",
      ctaPadding: ctaStyle?.padding ?? "",
      fontStatus: document.fonts.status,
    };
  });

  check(
    "stylesheet loaded",
    state.stylesheetCount > 0 && state.loadedStylesheetCount >= state.stylesheetCount,
    `${state.loadedStylesheetCount}/${state.stylesheetCount} stylesheets`,
  );
  check("Tailwind heading utility applied", Number.parseFloat(state.h1FontSize) > 20, `h1 font-size=${state.h1FontSize}`);
  check("navigation layout applied", state.navPosition === "fixed", `nav position=${state.navPosition}`);
  check("CTA layout applied", state.ctaDisplay === "inline-flex" && state.ctaPadding !== "0px", `display=${state.ctaDisplay}, padding=${state.ctaPadding}`);
  check("product heading rendered", state.h1Text.includes("undo button for"), state.h1Text || "missing h1");
  check("page background applied", state.bodyBackground !== "rgb(255, 255, 255)", state.bodyBackground);
  check("no horizontal overflow", state.bodyScrollWidth <= state.bodyWidth + 1, `${state.bodyScrollWidth}px scroll / ${state.bodyWidth}px viewport`);
  check("fonts settled", state.fontStatus === "loaded", `font status=${state.fontStatus}`);
  check("CSS/JS assets healthy", assetFailures.length === 0, assetFailures.join("; ") || "all requested assets returned successfully");
    check("browser runtime healthy", runtimeFailures.length === 0, runtimeFailures.join("; ") || "no page errors");
  } finally {
    await browser.close();
  }

  console.log(`\n  ${failures.length === 0 ? "✅ PASS" : `❌ FAIL (${failures.length})`}\n`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export {};
