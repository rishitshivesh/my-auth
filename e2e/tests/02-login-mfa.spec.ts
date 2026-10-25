import { tenantOrigin } from "../harness/config";
import { ApiSession, createTenant, createVerifiedUser, enrollTotp } from "../support/api";
import { enableEmailSecondFactor } from "../support/db";
import { mark, waitForMail } from "../support/mail";
import { totpNow } from "../support/totp";
import { enterEmailAndPassword, expect, heading, open, test } from "../support/test";

/** Subject of the one-time-code email: "123456 is your <brand> code". */
const OTP_SUBJECT = /^\d{6} is your .* code$/;

/** A user with an authenticator app, created through the real API like a person would. */
async function userWithTotp(slug: string) {
  const user = await createVerifiedUser(slug);
  const session = new ApiSession(slug);
  await session.expectOk("POST", "/auth/login", user);
  return { ...user, session, ...(await enrollTotp(session)) };
}

test.describe("password + second factor", () => {
  test("authenticator code completes sign-in, a wrong code is refused, recovery code works once", async ({ page }) => {
    const tenant = await createTenant("mfa");
    const user = await userWithTotp(tenant.slug);

    await open(page, `${tenantOrigin(tenant.slug)}/u/login`);
    await enterEmailAndPassword(page, user.email, user.password);

    // The challenge page: authenticator first, recovery code as the only other offered way.
    await expect(page).toHaveURL(/\/u\/mfa/);
    await expect(heading(page, "Verify it is you")).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a code instead" })).toHaveCount(0);

    const code = page.getByLabel("Verification code");
    await code.first().pressSequentially("000000");
    await expect(page.getByRole("alert").filter({ hasText: "That code is not valid" })).toBeVisible();

    // The enrolment code was already used in its window; the next window is accepted.
    await page.reload();
    await page.getByLabel("Verification code").first().pressSequentially(totpNow(user.secret, 1));
    await expect(page).toHaveURL(new RegExp(`/t/${tenant.slug}/dashboard`));

    // Second visit with a recovery code instead.
    const second = await page.context().newPage();
    await second.context().clearCookies();
    await open(second, `${tenantOrigin(tenant.slug)}/u/login`);
    await enterEmailAndPassword(second, user.email, user.password);
    await expect(second).toHaveURL(/\/u\/mfa/);
    await second.getByRole("button", { name: "Use a recovery code" }).click();
    await expect(heading(second, "Use a recovery code")).toBeVisible();
    const backup = user.backupCodes[0] as string;
    await second.getByLabel("Recovery code").fill(backup);
    await second.getByRole("button", { name: "Verify" }).click();
    await expect(second).toHaveURL(new RegExp(`/t/${tenant.slug}/dashboard`));

    // The same recovery code cannot be replayed.
    await second.context().clearCookies();
    await open(second, `${tenantOrigin(tenant.slug)}/u/login`);
    await enterEmailAndPassword(second, user.email, user.password);
    await second.getByRole("button", { name: "Use a recovery code" }).click();
    await second.getByLabel("Recovery code").fill(backup);
    await second.getByRole("button", { name: "Verify" }).click();
    await expect(second.getByRole("alert").filter({ hasText: "That code is not valid" })).toBeVisible();
    await expect(second).toHaveURL(/\/u\/mfa/);
  });

  test("method chooser: email code as an alternative second factor", async ({ page }) => {
    const tenant = await createTenant("mfa");
    const user = await userWithTotp(tenant.slug);

    // There is no API that enrols email as a factor (backend gap), so seed it in the _test database.
    await enableEmailSecondFactor(tenant.slug, user.email);

    await open(page, `${tenantOrigin(tenant.slug)}/u/login`);
    await enterEmailAndPassword(page, user.email, user.password);
    await expect(page).toHaveURL(/\/u\/mfa/);
    await page.getByRole("button", { name: "Email me a code instead" }).click();

    const sent = await mark(user.email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    const mail = await waitForMail(user.email, { after: sent, subject: OTP_SUBJECT });
    const emailed = /^(\d{6}) /.exec(mail.subject)?.[1];
    expect(emailed).toBeTruthy();
    await page.getByLabel("Verification code").first().pressSequentially(emailed as string);
    await expect(page).toHaveURL(new RegExp(`/t/${tenant.slug}/dashboard`));
  });

  test("an expired challenge asks to start sign-in again", async ({ page }) => {
    const tenant = await createTenant("mfa");
    await open(page, `${tenantOrigin(tenant.slug)}/u/mfa`);
    await expect(heading(page, "Verification expired")).toBeVisible();
    await expect(page.getByRole("button", { name: "Restart sign-in" })).toBeVisible();
  });
});
