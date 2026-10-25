import { test as base, expect, type Page } from "@playwright/test";
import { tenantOrigin } from "../harness/config";
import { clearRateLimits } from "./redis";

interface Fixtures {
  /** Resets the per-IP rate limits (test Redis index only) before every test. */
  freshLimits: void;
}

/** Navigates and waits until React has hydrated, so the first click is never swallowed by inert markup. */
export async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
}

export const test = base.extend<Fixtures>({
  freshLimits: [
    async ({}, use) => {
      await clearRateLimits();
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/** Heading by name; hosted screens repeat their title as h1 and h2, so take the first. */
export const heading = (page: Page, name: string | RegExp) => page.getByRole("heading", { name }).first();

/** Email step of the hosted sign-in page, then the password step (choosing "password" when offered). */
export async function enterEmailAndPassword(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  const usePassword = page.getByRole("button", { name: "Use a password instead" });
  const passwordField = page.getByLabel("Password", { exact: true });
  await usePassword.or(passwordField).first().waitFor();
  if (await usePassword.isVisible()) await usePassword.click();
  await passwordField.fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Signs in through the hosted pages on the tenant's own address. */
export async function signInWithPassword(page: Page, slug: string, email: string, password: string, next?: string): Promise<void> {
  await open(page, `${tenantOrigin(slug)}/u/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await enterEmailAndPassword(page, email, password);
}
