import { test, expect } from "@playwright/test";

test("stack boots and serves hosted sign-in", async ({ page }) => {
  await page.goto("/u/login");
  await expect(page.getByRole("heading", { name: /sign in/i }).first()).toBeVisible();
});
