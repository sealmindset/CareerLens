import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/dashboard");
  });

  test("displays stat cards", async ({ page }) => {
    await expect(page.locator("text=Total Jobs")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Active Applications")).toBeVisible();
  });

  test("displays skills count", async ({ page }) => {
    await expect(page.locator("text=Skills")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Command Center (home page)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("displays task inbox", async ({ page }) => {
    await expect(page.locator("text=Task Inbox")).toBeVisible({ timeout: 10_000 });
  });

  test("displays quick capture", async ({ page }) => {
    await expect(page.locator("text=Quick Capture")).toBeVisible({ timeout: 10_000 });
  });
});
