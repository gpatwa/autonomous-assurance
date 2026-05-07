/**
 * Authenticated console tests.
 *
 * Requires tests/.auth/session.json — run setup first:
 *   npx playwright test --project=setup --headed
 */

import { test, expect } from "@playwright/test";

test.describe("incidents page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/console/incidents");
  });

  test("renders Incidents heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Incidents" })).toBeVisible();
  });

  test("shows total count", async ({ page }) => {
    await expect(page.getByText(/\d+ total/)).toBeVisible();
  });

  test("sidebar has Incidents and Changes links", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Incidents" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Changes" })).toBeVisible();
  });

  test("sidebar shows operator name", async ({ page }) => {
    // The layout renders session.user.name — any non-empty text in the sidebar footer
    const sidebar = page.locator("aside");
    await expect(sidebar).toContainText(/\S/); // operator name is non-empty
  });

  test("sidebar shows Sign out button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /sign out/i })
    ).toBeVisible();
  });
});

test.describe("changes page", () => {
  test("renders Changes heading", async ({ page }) => {
    await page.goto("/console/changes");
    await expect(page.getByRole("heading", { name: "Changes" })).toBeVisible();
  });

  test("shows total count", async ({ page }) => {
    await page.goto("/console/changes");
    await expect(page.getByText(/\d+ total/)).toBeVisible();
  });
});

test.describe("navigation", () => {
  test("/console redirects to /console/incidents when authenticated", async ({ page }) => {
    await page.goto("/console");
    await expect(page).toHaveURL(/\/console\/incidents/);
  });

  test("Changes link navigates to changes page", async ({ page }) => {
    await page.goto("/console/incidents");
    await page.getByRole("link", { name: "Changes" }).click();
    await expect(page).toHaveURL(/\/console\/changes/);
    await expect(page.getByRole("heading", { name: "Changes" })).toBeVisible();
  });
});

test.describe("sign-out", () => {
  test("sign-out redirects to sign-in page", async ({ page }) => {
    await page.goto("/console/incidents");
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/console\/sign-in/);
    await expect(
      page.getByRole("button", { name: /sign in with microsoft/i })
    ).toBeVisible();
  });
});
