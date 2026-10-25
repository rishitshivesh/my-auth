import { RECENT_AUTH_WINDOW_SECONDS, tenantOrigin } from "../harness/config";
import { ApiSession, createTenant, createVerifiedUser, enrollTotp } from "../support/api";
import { NEW_PASSWORD, STRONG_PASSWORD } from "../support/env";
import { totpNow } from "../support/totp";
import { enterEmailAndPassword, expect, open, test } from "../support/test";

const SESSION_STALE_AFTER_MS = (RECENT_AUTH_WINDOW_SECONDS + 1) * 1000;

/** Sleeps until a session created at `signedInAt` is older than the service's recent-sign-in window. */
async function untilStale(page: import("@playwright/test").Page, signedInAt: number): Promise<void> {
  await page.waitForTimeout(Math.max(0, signedInAt + SESSION_STALE_AFTER_MS - Date.now()));
}

async function signedIn(browser: import("@playwright/test").Browser, session: ApiSession) {
  const context = await browser.newContext();
  await context.addCookies(session.browserCookies());
  return { context, page: await context.newPage() };
}

async function fillPasswordChange(page: import("@playwright/test").Page, next: string) {
  await page.getByLabel("Current password").fill(STRONG_PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(next);
}

test.describe("personal account", () => {
  test.describe.configure({ timeout: 120_000 });
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  // Both step-up journeys sign in once, here, so the 30 second window is waited out only once.
  let plain: { user: { email: string; password: string }; session: ApiSession; at: number };
  let twoStep: { user: { email: string; password: string }; session: ApiSession; secret: string; at: number };

  test.beforeAll(async () => {
    tenant = await createTenant("account");
    const user = await createVerifiedUser(tenant.slug);
    const session = new ApiSession(tenant.slug);
    await session.expectOk("POST", "/auth/login", user);
    plain = { user, session, at: Date.now() };

    const mfaUser = await createVerifiedUser(tenant.slug);
    const mfaSession = new ApiSession(tenant.slug);
    await mfaSession.expectOk("POST", "/auth/login", mfaUser);
    const { secret } = await enrollTotp(mfaSession);
    twoStep = { user: mfaUser, session: mfaSession, secret, at: Date.now() };
  });

  test("change password: a stale sign-in asks to confirm in place, then the change goes through", async ({ browser }) => {
    const { user, session } = plain;
    const { context, page } = await signedIn(browser, session);

    await open(page, `${tenantOrigin(tenant.slug)}/dashboard/security`);
    await fillPasswordChange(page, NEW_PASSWORD);
    await untilStale(page, plain.at);
    await page.getByRole("button", { name: "Change password" }).click();

    // The draft stays on the page while the step-up dialog collects a fresh proof.
    await expect(page.getByText("confirm it is you before continuing")).toBeVisible();
    await page.getByRole("button", { name: "Confirm it is you" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm it is you" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Authenticator code")).toHaveCount(0); // no two-step verification on this account

    await dialog.getByLabel("Current password").fill("wrong-password-1!");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(dialog.getByText("That password is not correct.")).toBeVisible();

    await dialog.getByLabel("Current password").fill(STRONG_PASSWORD);
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Thanks, you are confirmed")).toBeVisible();
    await expect(page.getByLabel("Current password")).toHaveValue(STRONG_PASSWORD); // nothing was lost

    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.")).toBeVisible();
    await context.close();

    // The new password signs in.
    const fresh = await browser.newContext();
    const login = await fresh.newPage();
    await open(login, `${tenantOrigin(tenant.slug)}/u/login`);
    await enterEmailAndPassword(login, user.email, NEW_PASSWORD);
    await expect(login).toHaveURL(new RegExp(`/t/${tenant.slug}/dashboard`));
    await fresh.close();
  });

  test("change password with two-step verification: the step-up needs password and authenticator code", async ({ browser }) => {
    const { session, secret } = twoStep;
    const { context, page } = await signedIn(browser, session);

    await open(page, `${tenantOrigin(tenant.slug)}/dashboard/security`);
    await fillPasswordChange(page, NEW_PASSWORD);
    await untilStale(page, twoStep.at);
    await page.getByRole("button", { name: "Change password" }).click();
    await page.getByRole("button", { name: "Confirm it is you" }).click();

    const dialog = page.getByRole("dialog", { name: "Confirm it is you" });
    await dialog.getByLabel("Current password").fill(STRONG_PASSWORD);
    await expect(dialog.getByLabel("Authenticator code")).toBeVisible();

    // Missing code: nothing is sent.
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(dialog.getByText("That code is invalid or has expired.")).toBeVisible();

    await dialog.getByLabel("Authenticator code").fill("000000");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(dialog.getByText("That code is not valid.")).toBeVisible();

    await dialog.getByLabel("Authenticator code").fill(totpNow(secret, 1));
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.")).toBeVisible();
    await context.close();
  });

  test("revoke another session", async ({ browser }) => {
    const user = await createVerifiedUser(tenant.slug);
    const here = new ApiSession(tenant.slug);
    await here.expectOk("POST", "/auth/login", user);
    const elsewhere = new ApiSession(tenant.slug);
    await elsewhere.expectOk("POST", "/auth/login", user);
    const { context, page } = await signedIn(browser, here);

    await open(page, `${tenantOrigin(tenant.slug)}/dashboard/security/sessions`);
    await expect(page.getByRole("table").getByText("This device")).toBeVisible();
    const revoke = page.getByRole("button", { name: /^Revoke session on/ });
    await expect(revoke).toHaveCount(1);
    await revoke.first().click();
    const dialog = page.getByRole("alertdialog", { name: "Revoke this session?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Revoke session" }).click();
    await expect(page.getByText("Session revoked.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Revoke session on/ })).toHaveCount(0);

    // The revoked session really is dead on the server; this one still works.
    expect((await elsewhere.request("GET", "/users/me")).status).toBe(401);
    expect((await here.request("GET", "/users/me")).status).toBe(200);
    await context.close();
  });
});
