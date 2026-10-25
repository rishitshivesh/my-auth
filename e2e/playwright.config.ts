import { defineConfig, devices } from "@playwright/test";
import { PORTAL_ORIGIN, ROOT_DOMAIN } from "./harness/config";

/**
 * One shared stack (auth-service + portal + SMTP sink) per run, so specs run serially. Every spec
 * creates its own tenant and users, so reruns never collide with earlier data.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./harness/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: PORTAL_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: { args: [`--host-resolver-rules=MAP *.${ROOT_DOMAIN} 127.0.0.1, MAP ${ROOT_DOMAIN} 127.0.0.1`] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
