import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("displays stat cards", async ({ page }) => {
    await expect(page.locator("text=Total Jobs")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Active Applications")).toBeVisible();
  });

  test("displays skills count", async ({ page }) => {
    await expect(page.locator("text=Skills")).toBeVisible({ timeout: 10_000 });
  });
});
