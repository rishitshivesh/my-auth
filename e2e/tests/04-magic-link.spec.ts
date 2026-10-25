import type { Browser, BrowserContext, Page } from "@playwright/test";
import { tenantOrigin } from "../harness/config";
import { ApiSession, createTenant, createVerifiedUser, setFeatureFlags } from "../support/api";
import { linkWith, mark, onTenantHost, waitForMail } from "../support/mail";
import { expect, heading, open, test } from "../support/test";

interface Requester {
  context: BrowserContext;
  page: Page;
  email: string;
  slug: string;
  link: string;
  code: string;
  polls: Array<{ status: number; body: string }>;
  nonce: () => string | undefined;
}

/** The device that asks for the link: shows the match code and polls. */
async function requestLink(browser: Browser, slug: string, email: string): Promise<Requester> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const polls: Requester["polls"] = [];
  let nonce: string | undefined;
  page.on("request", (request) => {
    if (request.url().endsWith("/auth/magic-link/poll")) nonce = (request.postDataJSON() as { pollingNonce?: string }).pollingNonce;
  });
  page.on("response", async (response) => {
    if (response.url().endsWith("/auth/magic-link/poll")) polls.push({ status: response.status(), body: await response.text().catch(() => "") });
  });

  const after = await mark(email);
  await open(page, `${tenantOrigin(slug)}/u/login`);
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(heading(page, "Check your email")).toBeVisible();
  const code = (await page.getByTestId("match-code").innerText()).replace(/\s/g, "");
  expect(code).toMatch(/^\d{6}$/);
  const mail = await waitForMail(email, { after, linkContains: "magic-link" });
  return { context, page, email, slug, link: onTenantHost(linkWith(mail, "magic-link"), slug), code, polls, nonce: () => nonce };
}

/** Another device opens the emailed link. */
async function openLink(browser: Browser, requester: Requester): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await open(page, requester.link);
  return page;
}

test.describe("magic link", () => {
  let slug: string;
  let email: string;

  test.beforeEach(async () => {
    const tenant = await createTenant("magic");
    await setFeatureFlags(tenant.owner, { magicLinkEnabled: true });
    slug = tenant.slug;
    email = (await createVerifiedUser(slug)).email;
  });

  test("same device: the link shows where it was requested from and signs in only on request", async ({ browser }) => {
    const requester = await requestLink(browser, slug, email);
    const device = await openLink(browser, requester);

    // Previewing did not spend it: a reload still offers the choice, and it names the requesting device.
    await device.reload();
    await expect(device.getByTestId("magic-requester")).toContainText(/Chrome|Chromium|browser/i);
    await expect(device.getByRole("button", { name: "Sign in on this device" })).toBeVisible();
    await expect(device.getByRole("button", { name: "Approve sign-in on the other device" })).toBeVisible();

    await device.getByRole("button", { name: "Sign in on this device" }).click();
    await expect(device).toHaveURL(new RegExp(`/t/${slug}/dashboard`));
    await expect(heading(device, "This link was already used")).toHaveCount(0);

    // The link is spent now.
    await open(device, requester.link);
    await expect(heading(device, "This link was already used")).toBeVisible();
    await requester.context.close();
    await device.context().close();
  });

  test("a plain click on another device signs that device in and voids the pending request", async ({ browser }) => {
    const requester = await requestLink(browser, slug, email);
    const device = await openLink(browser, requester);
    await device.getByRole("button", { name: "Sign in on this device" }).click();
    await expect(device).toHaveURL(new RegExp(`/t/${slug}/dashboard`));

    // The requesting device keeps waiting: it never receives a session from a plain click.
    await expect.poll(() => requester.polls.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    expect(requester.polls.every((p) => p.status === 200 && p.body.includes("pending"))).toBe(true);
    await expect(requester.page.getByTestId("match-code")).toBeVisible();
    await expect(requester.page).toHaveURL(/\/u\/login/);
    await requester.context.close();
    await device.context().close();
  });

  test("cross-device approval needs the displayed code; the confirming device gets no session", async ({ browser }) => {
    const requester = await requestLink(browser, slug, email);
    const device = await openLink(browser, requester);

    await device.getByRole("button", { name: "Approve sign-in on the other device" }).click();
    const wrong = requester.code === "000000" ? "111111" : "000000";
    await device.getByLabel("Code from the other device").first().pressSequentially(wrong);
    await expect(device.getByRole("alert").filter({ hasText: "4 attempts left" })).toBeVisible();
    await expect(device).toHaveURL(/\/u\/magic-link/);

    await device.getByLabel("Code from the other device").first().pressSequentially(requester.code);
    await expect(heading(device, "Sign-in approved")).toBeVisible();

    // The requesting device completes on its own.
    await expect(requester.page).toHaveURL(new RegExp(`/t/${slug}/dashboard`), { timeout: 30_000 });

    // The approving device is not signed in.
    await open(device, `${tenantOrigin(slug)}/t/${slug}/dashboard`);
    await expect(device).toHaveURL(/\/u\/login/);

    // The link is spent, and the nonce cannot be redeemed twice (409 LINK_ALREADY_USED).
    await open(device, requester.link);
    await expect(heading(device, "This link was already used")).toBeVisible();
    const replay = await new ApiSession(slug).request("POST", "/auth/magic-link/poll", { pollingNonce: requester.nonce() });
    expect(replay.status).toBe(409);
    expect(replay.body).toMatchObject({ code: "LINK_ALREADY_USED" });
    await requester.context.close();
    await device.context().close();
  });

  test("five wrong codes cancel the request", async ({ browser }) => {
    const requester = await requestLink(browser, slug, email);
    const device = await openLink(browser, requester);
    await device.getByRole("button", { name: "Approve sign-in on the other device" }).click();
    const wrong = requester.code === "000000" ? "111111" : "000000";
    for (let attempt = 1; attempt <= 5; attempt++) {
      await device.getByLabel("Code from the other device").first().pressSequentially(wrong);
      if (attempt < 5) await expect(device.getByRole("alert").filter({ hasText: `${5 - attempt} attempts left` })).toBeVisible();
    }
    await expect(heading(device, "Request cancelled")).toBeVisible();

    // Even the right code no longer completes the request on the requesting device.
    await expect.poll(() => requester.polls.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    await expect(requester.page).not.toHaveURL(/dashboard/);
    await requester.context.close();
    await device.context().close();
  });
});
