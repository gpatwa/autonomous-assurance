/**
 * Proxy redirect tests — no authentication required.
 *
 * Verifies the Next.js proxy correctly guards /console routes and
 * that the sign-in page renders for unauthenticated visitors.
 */

import { test, expect } from "@playwright/test";

test.describe("unauthenticated redirects", () => {
  test("/console → sign-in", async ({ page }) => {
    await page.goto("/console");
    await expect(page).toHaveURL(/\/console\/sign-in/);
  });

  test("/console/incidents → sign-in", async ({ page }) => {
    await page.goto("/console/incidents");
    await expect(page).toHaveURL(/\/console\/sign-in/);
  });

  test("/console/changes → sign-in", async ({ page }) => {
    await page.goto("/console/changes");
    await expect(page).toHaveURL(/\/console\/sign-in/);
  });

  test("/console/incidents/unknown-id → sign-in", async ({ page }) => {
    await page.goto("/console/incidents/does-not-exist");
    await expect(page).toHaveURL(/\/console\/sign-in/);
  });
});

test.describe("sign-in page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/console/sign-in");
  });

  test("shows Operator Console heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Operator Console" })).toBeVisible();
  });

  test("shows Microsoft sign-in button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /sign in with microsoft/i })
    ).toBeVisible();
  });

  test("callbackUrl is preserved in sign-in redirect", async ({ page }) => {
    await page.goto("/console/incidents");
    await expect(page).toHaveURL(/callbackUrl=.*console.*incidents/);
  });
});
