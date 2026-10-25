import { tenantOrigin } from "../harness/config";
import { createTenant, invite } from "../support/api";
import { expireInvite } from "../support/db";
import { STRONG_PASSWORD, uniqueEmail } from "../support/env";
import { linkWith, mark, onTenantHost, waitForMail } from "../support/mail";
import { enterEmailAndPassword, expect, heading, open, test } from "../support/test";

test.describe("invitation", () => {
  test("accept an invitation, then sign in with the chosen password", async ({ page }) => {
    const tenant = await createTenant("invite");
    const email = uniqueEmail("invitee");
    const link = onTenantHost(await invite(tenant.owner, email), tenant.slug);

    await open(page, link);
    await expect(heading(page, new RegExp(`Join ${tenant.name}`))).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await page.reload(); // previewing never consumes the invitation
    await page.getByLabel("Full name").fill("Ines Invitee");
    await page.getByLabel("Choose a password").fill("short");
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page.getByText("Use at least 12 characters.")).toBeVisible();
    await page.getByLabel("Choose a password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(heading(page, new RegExp(`You joined ${tenant.name}`))).toBeVisible();

    // Accepting does not sign in; the next step is the sign-in page with the address filled.
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/u\/login/);
    await enterEmailAndPassword(page, email, STRONG_PASSWORD);
    await expect(page).toHaveURL(new RegExp(`/t/${tenant.slug}/dashboard`));

    // The invitation is spent.
    await open(page, link);
    await expect(heading(page, "This link was already used")).toBeVisible();
  });

  test("an expired invitation can ask for a fresh one", async ({ page }) => {
    const tenant = await createTenant("invite");
    const email = uniqueEmail("late");
    const link = onTenantHost(await invite(tenant.owner, email), tenant.slug);
    await expireInvite(tenant.slug, email);

    await open(page, link);
    await expect(heading(page, "This link has expired")).toBeVisible();
    const after = await mark(email);
    await page.getByRole("button", { name: "Send a new link" }).click();
    await expect(heading(page, "Check your inbox")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send a new link" })).toHaveCount(0);

    // The expired link stays dead: only the fresh one works.
    await open(page, link);
    await expect(heading(page, "This link is not valid")).toBeVisible();

    const fresh = await waitForMail(email, { after, linkContains: "/invite/" });
    await open(page, onTenantHost(linkWith(fresh, "/invite/"), tenant.slug));
    await page.getByLabel("Full name").fill("Late Larry");
    await page.getByLabel("Choose a password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(heading(page, new RegExp(`You joined ${tenant.name}`))).toBeVisible();
  });
});
