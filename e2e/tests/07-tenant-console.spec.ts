import { tenantOrigin } from "../harness/config";
import { ApiSession, createTenant, createVerifiedUser } from "../support/api";
import { expect, heading, open, test } from "../support/test";

test.describe("tenant console", () => {
  test("create a role, assign it, add a webhook endpoint and see the audit trail", async ({ browser }) => {
    const tenant = await createTenant("console");
    const member = await createVerifiedUser(tenant.slug, { firstName: "Mira" });
    const memberSession = new ApiSession(tenant.slug);
    await memberSession.expectOk("POST", "/auth/login", member);
    const memberId = (await memberSession.expectOk("GET", "/users/me")).data.id as string;

    const context = await browser.newContext();
    await context.addCookies(tenant.owner.browserCookies());
    const page = await context.newPage();
    const base = tenantOrigin(tenant.slug);
    const roleName = `auditor-${Date.now().toString(36)}`;

    // 1. Create a custom role.
    await open(page, `${base}/t/${tenant.slug}/roles`);
    await page.getByRole("button", { name: "Create role" }).first().click();
    const create = page.getByRole("dialog", { name: "Create role" });
    await create.getByLabel("Role name").fill(roleName);
    await create.getByLabel("Display name").fill("Auditor");
    await create.getByRole("button", { name: "Create role" }).click();
    await expect(create).toBeHidden();
    await expect(page.getByText(roleName).first()).toBeVisible();

    // 2. Assign it to a person, after reviewing the change.
    await open(page, `${base}/t/${tenant.slug}/users/${memberId}`);
    await page.getByRole("tab", { name: "Roles and access" }).click();
    await page.getByRole("button", { name: "Assign roles" }).click();
    const assign = page.getByRole("dialog");
    await assign.getByRole("checkbox", { name: /^Auditor/ }).check();
    await assign.getByRole("button", { name: "Continue" }).click();
    await expect(assign.getByText("Roles being added")).toBeVisible(); // review before confirming
    await assign.getByRole("button", { name: "Assign roles" }).click();
    await expect(page.getByText(/Roles assigned to/)).toBeVisible();
    await expect(page.getByText("Auditor").first()).toBeVisible();

    // 3. Add a webhook endpoint; the signing secret is shown once.
    await open(page, `${base}/t/${tenant.slug}/webhooks`);
    await page.getByRole("button", { name: "Add endpoint" }).first().click();
    const hook = page.getByRole("dialog", { name: "Add webhook endpoint" });
    await hook.getByLabel("Endpoint URL").fill("https://example.com/e2e-hook");
    await hook.getByRole("checkbox").first().check();
    await hook.getByRole("button", { name: "Create endpoint" }).click();
    await expect(page.getByText("Signing secret").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("https://example.com/e2e-hook").first()).toBeVisible();

    // 4. The audit trail recorded what happened.
    await open(page, `${base}/t/${tenant.slug}/audit`);
    await expect(heading(page, "Audit log")).toBeVisible();
    await expect(page.getByRole("table")).toContainText(/login/i);
    await expect(page.getByText(/\d+ of \d+ events/)).toBeVisible();
    await context.close();
  });
});
