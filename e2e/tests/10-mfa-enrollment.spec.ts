import { tenantOrigin } from "../harness/config";
import { ApiSession, createTenant, createVerifiedUser, setFeatureFlags } from "../support/api";
import { requireMfaForEveryone } from "../support/db";
import { linkWith, mark, onTenantHost, waitForMail } from "../support/mail";
import { totpNow } from "../support/totp";
import { enterEmailAndPassword, expect, heading, open, test } from "../support/test";

/** Reads the manual-entry key shown next to the QR code (grouped in fours). */
async function manualKey(page: import("@playwright/test").Page): Promise<string> {
  await page.getByText("Cannot scan? Enter this key manually").click();
  const grouped = await page.locator("details p").innerText();
  return grouped.replace(/\s/g, "");
}

test.describe("required two-step verification at sign-in", () => {
  test("password sign-in is guided through authenticator setup and recovery codes", async ({ page }) => {
    const tenant = await createTenant("enroll");
    const user = await createVerifiedUser(tenant.slug);
    await requireMfaForEveryone(tenant.slug);

    await open(page, `${tenantOrigin(tenant.slug)}/u/login`);
    await enterEmailAndPassword(page, user.email, user.password);
    await expect(page).toHaveURL(/\/mfa\/enroll/);
    await expect(heading(page, "Set up two-step verification")).toBeVisible();

    await page.getByRole("button", { name: "Set up authenticator" }).click();
    await expect(heading(page, "Scan the QR code")).toBeVisible();
    await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
    const secret = await manualKey(page);

    // A wrong code does not enable anything.
    await page.getByLabel("Authenticator code").first().pressSequentially("000000");
    await expect(page.getByRole("alert").filter({ hasText: "That code is not valid" })).toBeVisible();

    await page.reload();
    await expect(heading(page, "Set up two-step verification")).toBeVisible();
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    const secondSecret = await manualKey(page);
    await page.getByLabel("Authenticator code").first().pressSequentially(totpNow(secondSecret));
    void secret;

    // Recovery codes are shown once and must be acknowledged.
    await expect(heading(page, "Save your recovery codes")).toBeVisible();
    await page.getByRole("button", { name: "Show codes" }).click();
    await expect(page.getByText(/[A-Z0-9]{4}-[A-Z0-9]{4}/i).first()).toBeVisible();
    await page.getByRole("button", { name: "I have saved my recovery codes" }).click();
    await expect(heading(page, "Two-step verification is on")).toBeVisible();
    await page.getByRole("button", { name: "Continue to your workspace" }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${tenant.slug}/dashboard`));

    // Two-step verification is really on now.
    const check = new ApiSession(tenant.slug);
    const login = await check.login(user.email, user.password);
    expect(login.data).toMatchObject({ mfaRequired: true });
  });

  test("an expired setup asks to sign in again", async ({ page }) => {
    const tenant = await createTenant("misc");
    await open(page, `${tenantOrigin(tenant.slug)}/mfa/enroll`);
    await expect(heading(page, "Sign in to finish setup")).toBeVisible();
    await expect(page.getByRole("button", { name: "Restart sign-in" })).toBeVisible();
  });

  test("magic-link sign-in under the same policy reaches the setup and completes it", async ({ browser }) => {
    // BACKEND BUG (apps/auth-service, reported): magic-link and passkey sign-in hand the enrollment token over
    // only as the httpOnly cookie `mfa_enrollment_token`, but it is set with path "/mfa/enroll" while the
    // endpoints that read it live under "/auth/mfa/enroll/totp/*", so browsers never send it back and setup
    // always fails with AUTH_TOKEN_INVALID. The portal then (correctly) shows "Setup timed out".
    // This test is expected to fail until the cookie path is fixed; when it starts passing, remove test.fail().
    test.fail(true, "enrollment cookie path /mfa/enroll never matches /auth/mfa/enroll/totp/*");
    const tenant = await createTenant("enroll-link");
    await setFeatureFlags(tenant.owner, { magicLinkEnabled: true });
    const user = await createVerifiedUser(tenant.slug);
    await requireMfaForEveryone(tenant.slug);

    const context = await browser.newContext();
    const page = await context.newPage();
    const after = await mark(user.email);
    await new ApiSession(tenant.slug).expectOk("POST", "/auth/magic-link/send", { email: user.email });
    const mail = await waitForMail(user.email, { after, linkContains: "magic-link" });
    await open(page, onTenantHost(linkWith(mail, "magic-link"), tenant.slug));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/mfa\/enroll/);

    await page.getByRole("button", { name: "Set up authenticator" }).click();
    await expect(heading(page, "Scan the QR code")).toBeVisible();
    const key = await manualKey(page);
    await page.getByLabel("Authenticator code").first().pressSequentially(totpNow(key));
    await expect(heading(page, "Save your recovery codes")).toBeVisible();
    await context.close();
  });
});
