import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsUser } from "./helpers";

test.describe("Sidebar navigation - Admin", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("dashboard loads", async ({ page }) => {
    await expect(page.locator("h1")).toContainText(/dashboard/i);
  });

  test("navigate to My Profile", async ({ page }) => {
    await page.click("text=My Profile");
    await expect(page).toHaveURL(/profile/);
  });

  test("navigate to Job Listings", async ({ page }) => {
    await page.click("text=Job Listings");
    await expect(page).toHaveURL(/jobs/);
  });

  test("navigate to Resumes", async ({ page }) => {
    await page.click("text=Resumes");
    await expect(page).toHaveURL(/resumes/);
  });

  test("navigate to Application Studio", async ({ page }) => {
    await page.click("text=Application Studio");
    await expect(page).toHaveURL(/agents/);
  });

  test("navigate to Story Bank", async ({ page }) => {
    await page.click("text=Story Bank");
    await expect(page).toHaveURL(/stories/);
  });

  test("admin can see AI Instructions link", async ({ page }) => {
    await expect(page.locator("text=AI Instructions")).toBeVisible();
    await page.click("text=AI Instructions");
    await expect(page).toHaveURL(/admin\/prompts/);
  });

  test("admin can see Users link", async ({ page }) => {
    await expect(page.locator("a >> text=Users")).toBeVisible();
  });

  test("admin can see Settings link", async ({ page }) => {
    await expect(page.locator("a >> text=Settings")).toBeVisible();
  });
});

test.describe("Sidebar navigation - User (restricted)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test("user cannot see admin links", async ({ page }) => {
    // User should NOT see AI Instructions, Users, Roles, Settings
    await expect(page.locator("a >> text=AI Instructions")).not.toBeVisible();
    await expect(page.locator("a >> text=Users")).not.toBeVisible();
    await expect(page.locator("a >> text=Roles")).not.toBeVisible();
    await expect(page.locator("a >> text=Settings")).not.toBeVisible();
  });

  test("user can see basic navigation", async ({ page }) => {
    await expect(page.locator("a >> text=Dashboard")).toBeVisible();
    await expect(page.locator("a >> text=My Profile")).toBeVisible();
    await expect(page.locator("a >> text=Job Listings")).toBeVisible();
  });
});
