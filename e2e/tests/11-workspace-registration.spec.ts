import { PORTAL_ORIGIN } from "../harness/config";
import { STRONG_PASSWORD, slugOf, uniqueEmail } from "../support/env";
import { expect, heading, open, test } from "../support/test";

test("creating a workspace signs the owner in (cookie session) and opens the console", async ({ page }) => {
  const slug = slugOf("register");
  const owner = uniqueEmail("founder");

  page.on("response", (r) => { if (r.url().includes("api.e2e")) console.log("RESP", r.status(), r.request().method(), r.url().slice(-45), r.request().headers()["x-tenant-slug"]); });
  await open(page, `${PORTAL_ORIGIN}/onboarding`);
  await page.getByLabel("Workspace name").fill("Register Co");
  await page.getByLabel("Workspace address").fill(slug);
  await expect(page.getByText(/available/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Your name").fill("Fia Founder");
  await page.getByLabel("Your email").fill(owner);
  await page.getByLabel("Password").fill(STRONG_PASSWORD);
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(heading(page, "Register Co is ready")).toBeVisible();
  await expect(page.getByText(`You are signed in as ${owner}`)).toBeVisible();

  // No second sign-in: the registration cookies already carry the session.
  await page.getByRole("link", { name: "Open workspace" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${slug}/dashboard`));
  await expect(page.getByText("Workspace console")).toBeVisible();
});
