/**
 * Auth setup — seeds an authenticated session for Playwright tests.
 *
 * Uses the dev-only /api/test/session endpoint to create a valid next-auth
 * session cookie directly, bypassing the Microsoft Entra OAuth flow.
 * (The OAuth flow involves browser-based redirects that are fragile in
 * automated test contexts due to PKCE state cookie timing issues.)
 *
 * Usage:
 *   npx playwright test --project=setup
 *
 * Session saved to tests/.auth/session.json (gitignored).
 * Re-run whenever the session file is deleted or expired.
 */

import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/session.json");

setup("seed test session via dev endpoint", async ({ page }) => {
  // Hit the dev-only endpoint to set the session cookie
  const res = await page.goto("/api/test/session");
  expect(res?.status()).toBe(200);

  // Verify the session is recognised — proxy should pass /console/incidents
  await page.goto("/console/incidents");
  await expect(page).toHaveURL(/\/console\/incidents/);
  await expect(page.getByRole("heading", { name: "Incidents" })).toBeVisible();

  // Save cookies to disk for all authenticated tests
  await page.context().storageState({ path: AUTH_FILE });
});
