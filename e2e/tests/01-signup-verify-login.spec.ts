import { createTenant } from "../support/api";
import { STRONG_PASSWORD, uniqueEmail } from "../support/env";
import { linkWith, mark, onTenantHost, waitForMail } from "../support/mail";
import { expect, heading, open, signInWithPassword, test } from "../support/test";
import { tenantOrigin } from "../harness/config";

test("sign up, verify through the emailed link with an intentional Continue, then sign in", async ({ page }) => {
  const tenant = await createTenant("signup");
  const email = uniqueEmail("newbie");
  const base = tenantOrigin(tenant.slug);

  // Sign up.
  await open(page, `${base}/u/signup`);
  await page.getByLabel("First name").fill("Nia");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(STRONG_PASSWORD);
  const after = await mark(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(heading(page, "Check your email")).toBeVisible();

  // The email link is only previewed on load: the page must ask before spending it.
  const mail = await waitForMail(email, { after, linkContains: "verify-email" });
  await open(page, onTenantHost(linkWith(mail, "verify-email"), tenant.slug));
  await expect(page).toHaveURL(/\/u\/verify-email\?token=/);
  await expect(heading(page, "Verify your email")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible(); // reloading did not consume it

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "Email verified")).toBeVisible();

  // A second visit shows the link as used instead of verifying again.
  await open(page, onTenantHost(linkWith(mail, "verify-email"), tenant.slug));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(heading(page, "This link was already used")).toBeVisible();

  // Now sign in lands in the workspace.
  await signInWithPassword(page, tenant.slug, email, STRONG_PASSWORD);
  await expect(page).toHaveURL(new RegExp(`/t/${tenant.slug}/dashboard`));
});
