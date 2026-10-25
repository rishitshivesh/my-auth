import { tenantOrigin } from "../harness/config";
import { ApiSession, createTenant, createVerifiedUser } from "../support/api";
import { expect, open, test } from "../support/test";

test.describe("tenant isolation", () => {
  test("a person signed in to workspace A never sees workspace B", async ({ browser }) => {
    const a = await createTenant("iso-a");
    const b = await createTenant("iso-b");
    const bMember = await createVerifiedUser(b.slug, { firstName: "Bea" });

    const context = await browser.newContext();
    await context.addCookies(a.owner.browserCookies());
    const page = await context.newPage();

    // A's own console works.
    await open(page, `${tenantOrigin(a.slug)}/t/${a.slug}/users`);
    await expect(page.getByRole("heading", { name: "People" }).first()).toBeVisible();
    await expect(page.getByText(bMember.email)).toHaveCount(0);

    // Asking for B's console through A's address never renders B: the session's own workspace wins.
    await open(page, `${tenantOrigin(a.slug)}/t/${b.slug}/users`);
    await expect(page).toHaveURL(new RegExp(`/t/${a.slug}/`));
    await expect(page.getByText(bMember.email)).toHaveCount(0);

    // On B's own address, A's session is not accepted: sign-in is asked for.
    await open(page, `${tenantOrigin(b.slug)}/t/${b.slug}/users`);
    await expect(page).toHaveURL(/\/u\/login/);
    await expect(page.getByText(bMember.email)).toHaveCount(0);

    // Same through the platform address with B's console path.
    await open(page, `http://e2e.test:3110/t/${b.slug}/users`);
    await expect(page.getByText(bMember.email)).toHaveCount(0);
    await context.close();
  });

  test("the API refuses A's credentials for B and B's people are not listed for A", async () => {
    const a = await createTenant("iso-a");
    const b = await createTenant("iso-b");
    const bMember = await createVerifiedUser(b.slug);

    // A's cookies presented with B's tenant header.
    const crossed = new ApiSession(b.slug);
    (crossed as unknown as { jar: Map<string, string> }).jar = (a.owner as unknown as { jar: Map<string, string> }).jar;
    for (const path of ["/users", "/users/me", "/rbac/roles", "/audit"]) {
      const res = await crossed.request("GET", path);
      expect([401, 403]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain(bMember.email);
    }

    // Under A's own header, B's people simply do not exist.
    const listed = await a.owner.expectOk("GET", "/users");
    expect(JSON.stringify(listed.body)).not.toContain(bMember.email);
  });
});
