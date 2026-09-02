import { expect, test } from "@playwright/test";

test("homepage shows the SeaPass status page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "SeaPass" })).toBeVisible();
});
