import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { tenantOrigin } from "../harness/config";
import { ApiSession, createTenant, createVerifiedUser, enrollTotp, invite, setFeatureFlags } from "../support/api";
import { uniqueEmail } from "../support/env";
import { linkWith, mark, onTenantHost, waitForMail } from "../support/mail";
import { enterEmailAndPassword, expect, open, test } from "../support/test";

const VIEWPORTS = [
  { name: "mobile 375", width: 375, height: 800 },
  { name: "desktop 1280", width: 1280, height: 800 },
] as const;
const THEMES = ["light", "dark"] as const;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface Screen {
  name: string;
  /** Navigates to the screen and waits until it is ready; returns the URL it opened. */
  prepare: (page: Page) => Promise<void>;
  /** Needs the signed-in cookies of the workspace owner. */
  signedIn?: boolean;
}

test.describe("accessibility smoke (axe, WCAG 2.2 AA)", () => {
  test.describe.configure({ timeout: 180_000 });
  const screens: Screen[] = [];
  let slug = "";
  let owner: { slug: string; email: string; password: string } = { slug: "", email: "", password: "" };

  /** Refresh tokens rotate, so every browser context needs its own sign-in or reuse detection ends them all. */
  async function ownerCookies() {
    const session = new ApiSession(owner.slug);
    await session.expectOk("POST", "/auth/login", { email: owner.email, password: owner.password });
    return session.browserCookies();
  }

  test.beforeAll(async () => {
    const tenant = await createTenant("a11y");
    slug = tenant.slug;
    owner = { slug: tenant.slug, email: tenant.ownerEmail, password: tenant.password };
    await setFeatureFlags(tenant.owner, { magicLinkEnabled: true });
    const base = tenantOrigin(slug);

    const user = await createVerifiedUser(slug);
    const mfaUser = await createVerifiedUser(slug);
    const mfaSession = new ApiSession(slug);
    await mfaSession.expectOk("POST", "/auth/login", mfaUser);
    await enrollTotp(mfaSession);
    const inviteLink = onTenantHost(await invite(tenant.owner, uniqueEmail("a11y-invitee")), slug);

    const before = await mark(user.email);
    await new ApiSession(slug).expectOk("POST", "/auth/forgot-password", { email: user.email });
    const resetMail = await waitForMail(user.email, { after: before, linkContains: "reset-password" });
    const resetLink = onTenantHost(linkWith(resetMail, "reset-password"), slug);

    const magicBefore = await mark(user.email);
    await new ApiSession(slug).expectOk("POST", "/auth/magic-link/send", { email: user.email, poll: true });
    const magicMail = await waitForMail(user.email, { after: magicBefore, linkContains: "magic-link" });
    const magicLink = onTenantHost(linkWith(magicMail, "magic-link"), slug);

    screens.push(
      { name: "sign in", prepare: (p) => open(p, `${base}/u/login`) },
      { name: "sign up", prepare: (p) => open(p, `${base}/u/signup`) },
      { name: "reset password request", prepare: (p) => open(p, `${base}/u/reset-password`) },
      { name: "reset password link", prepare: async (p) => { await open(p, resetLink); await p.getByLabel("New password", { exact: true }).waitFor(); } },
      { name: "magic link confirmation", prepare: async (p) => { await open(p, magicLink); await p.getByRole("button", { name: "Sign in on this device" }).waitFor(); } },
      { name: "invitation", prepare: async (p) => { await open(p, inviteLink); await p.getByLabel("Full name").waitFor(); } },
      { name: "unknown link", prepare: async (p) => { await open(p, `${base}/u/magic-link?token=${"b2".repeat(32)}`); await p.getByRole("heading", { name: "This link is not valid" }).first().waitFor(); } },
      {
        name: "second-factor challenge",
        prepare: async (p) => {
          await open(p, `${base}/u/login`);
          await enterEmailAndPassword(p, mfaUser.email, mfaUser.password);
          await p.getByRole("heading", { name: "Verify it is you" }).first().waitFor();
        },
      },
      { name: "account security", signedIn: true, prepare: async (p) => { await open(p, `${base}/dashboard/security`); await p.getByRole("heading", { name: /security/i }).first().waitFor(); } },
      { name: "account sessions", signedIn: true, prepare: async (p) => { await open(p, `${base}/dashboard/security/sessions`); await p.locator("text=This device >> visible=true").first().waitFor(); } },
      { name: "console roles", signedIn: true, prepare: async (p) => { await open(p, `${base}/t/${slug}/roles`); await p.getByText("Owner").first().waitFor(); } },
      { name: "console webhooks", signedIn: true, prepare: async (p) => { await open(p, `${base}/t/${slug}/webhooks`); await p.getByRole("heading", { name: "Webhooks" }).first().waitFor(); } },
    );
    void user;
  });

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${viewport.name}px, ${theme} theme`, async ({ browser }) => {
        const failures: string[] = [];
        for (const screen of screens) {
          const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: theme, reducedMotion: "reduce" });
          await context.addInitScript((value) => window.localStorage.setItem("sentry-theme", value), theme);
          if (screen.signedIn) await context.addCookies(await ownerCookies());
          const page = await context.newPage();
          try {
            await screen.prepare(page);
            await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          } catch (error) {
            failures.push(`${screen.name}: screen did not become ready (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`);
            await context.close();
            continue;
          }

          // No horizontal scroll at phone width (WCAG 1.4.10 reflow).
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 1) failures.push(`${screen.name}: horizontal overflow of ${overflow}px`);

          const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
          for (const violation of results.violations) {
            failures.push(`${screen.name}: ${violation.id} (${violation.impact}) on ${violation.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
          }
          await context.close();
        }
        expect(failures, failures.join("\n")).toEqual([]);
      });
    }
  }
});
