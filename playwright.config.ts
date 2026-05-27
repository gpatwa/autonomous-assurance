/**
 * Playwright E2E configuration for the KavachIQ Operator Console.
 *
 * Two test projects:
 *   unauthenticated — proxy redirect + sign-in page tests; no auth required
 *   console         — authenticated console pages; depends on `setup`
 *
 * Auth setup (run once, headed):
 *   npx playwright test --project=setup --headed
 *   → complete the Microsoft login in the browser window
 *   → session saved to tests/.auth/session.json (gitignored)
 *
 * Run all tests (assumes Next.js + API server already running):
 *   npx playwright test
 */

import { defineConfig, devices } from "@playwright/test";

const AUTH_FILE = "tests/.auth/session.json";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [
    // One-time auth setup — saves Entra session to disk
    {
      name: "setup",
      testMatch: "tests/auth.setup.ts",
    },

    // Unauthenticated tests: proxy redirects + sign-in page
    // No dependencies, no storageState — always runnable
    {
      name: "unauthenticated",
      testMatch: "tests/console/proxy.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },

    // Authenticated tests: console pages with real session
    // Depends on setup; loads stored session from disk
    {
      name: "console",
      testMatch: "tests/console/dashboard.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
      },
      dependencies: ["setup"],
    },
  ],
});
