import { tenantOrigin } from "../harness/config";
import { createTenant, createVerifiedUser } from "../support/api";
import { NEW_PASSWORD, STRONG_PASSWORD } from "../support/env";
import { linkWith, mark, onTenantHost, tokenOf, waitForMail } from "../support/mail";
import { expireLink } from "../support/redis";
import { enterEmailAndPassword, expect, heading, open, test } from "../support/test";

const OTP_SUBJECT = /^\d{6} is your .* code$/;

async function requestReset(page: import("@playwright/test").Page, slug: string, email: string) {
  const after = await mark(email);
  await open(page, `${tenantOrigin(slug)}/u/reset-password`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(heading(page, "Choose a new password")).toBeVisible();
  const mail = await waitForMail(email, { after, linkContains: "reset-password" });
  return { mail, link: onTenantHost(linkWith(mail, "reset-password"), slug), after };
}

test.describe("password recovery", () => {
  test("reset by link, then the link and the old password stop working", async ({ page }) => {
    const tenant = await createTenant("reset");
    const user = await createVerifiedUser(tenant.slug);
    const { link } = await requestReset(page, tenant.slug, user.email);

    // Loading the link only validates it; the form asks for a password before anything is spent.
    await open(page, link);
    await expect(page).toHaveURL(/\/u\/reset-password\?token=/);
    await expect(heading(page, "Choose a new password")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(`${NEW_PASSWORD}-different`);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(heading(page, "Password updated")).toBeVisible();

    // The same link is now spent.
    await open(page, link);
    await expect(heading(page, "This link was already used")).toBeVisible();

    // New password works, the old one does not.
    await open(page, `${tenantOrigin(tenant.slug)}/u/login`);
    await enterEmailAndPassword(page, user.email, STRONG_PASSWORD);
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password" })).toBeVisible();
    await open(page, `${tenantOrigin(tenant.slug)}/u/login`);
    await enterEmailAndPassword(page, user.email, NEW_PASSWORD);
    await expect(page).toHaveURL(new RegExp(`/t/${tenant.slug}/dashboard`));
  });

  test("an expired link says so and leads to a new request", async ({ page }) => {
    const tenant = await createTenant("reset");
    const user = await createVerifiedUser(tenant.slug);
    const { link } = await requestReset(page, tenant.slug, user.email);
    await expireLink(tokenOf(link));

    await open(page, link);
    await expect(heading(page, "This link has expired")).toBeVisible();
    await page.getByRole("button", { name: "Send a new link" }).click();
    await expect(page).toHaveURL(/\/u\/reset-password$/);
    await expect(page.getByLabel("Email address")).toBeVisible();
  });

  test("a newer request supersedes the older link; a made-up token is invalid", async ({ page }) => {
    const tenant = await createTenant("reset");
    const user = await createVerifiedUser(tenant.slug);
    const first = await requestReset(page, tenant.slug, user.email);
    const second = await requestReset(page, tenant.slug, user.email);
    expect(tokenOf(second.link)).not.toBe(tokenOf(first.link));

    await open(page, first.link);
    await expect(heading(page, "This link was already used")).toBeVisible();
    await open(page, second.link);
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();

    await open(page, `${tenantOrigin(tenant.slug)}/u/reset-password?token=${"a1".repeat(32)}`);
    await expect(heading(page, "This link is not valid")).toBeVisible();
  });

  test("the six-digit code from the same email is the fallback", async ({ page }) => {
    const tenant = await createTenant("reset");
    const user = await createVerifiedUser(tenant.slug);
    const { after } = await requestReset(page, tenant.slug, user.email);
    const otpMail = await waitForMail(user.email, { after, subject: OTP_SUBJECT });
    const code = /^(\d{6}) /.exec(otpMail.subject)?.[1] as string;

    await page.getByLabel("Reset code").first().pressSequentially(code);
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(heading(page, "Password updated")).toBeVisible();
  });
});
