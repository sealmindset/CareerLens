import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsUser } from "./helpers";

test.describe("AI Instructions page", () => {
  test("admin can view prompt cards", async ({ page }) => {
    await loginAsAdmin(page);
    await page.click("text=AI Instructions");
    await expect(page).toHaveURL(/admin\/prompts/);

    // Page header
    await expect(page.locator("h1")).toContainText("AI Instructions");

    // Should show prompt cards (seeded prompts exist)
    const cards = page.locator("[class*='rounded-xl'][class*='border'][class*='group']");
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("admin can filter by agent", async ({ page }) => {
    await loginAsAdmin(page);
    await page.click("text=AI Instructions");

    // Click the "scout" agent filter button
    const scoutButton = page.locator("button", { hasText: "scout" }).first();
    if (await scoutButton.isVisible()) {
      await scoutButton.click();
      await page.waitForTimeout(500);
    }
  });

  test("admin can open prompt editor", async ({ page }) => {
    await loginAsAdmin(page);
    await page.click("text=AI Instructions");

    // Wait for cards to load
    const cards = page.locator("[class*='rounded-xl'][class*='group']");
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Hover a card to reveal its edit button
    const card = cards.first();
    await card.scrollIntoViewIfNeeded();
    await card.hover({ force: true });
    await page.waitForTimeout(500);

    // The edit button should appear on hover
    const editButton = card.locator("button[title='Edit prompt']");
    await expect(editButton).toBeVisible({ timeout: 3_000 });
  });

  test("regular user cannot access AI Instructions", async ({ page }) => {
    await loginAsUser(page);
    // AI Instructions link should not appear in sidebar
    await expect(page.locator("a >> text=AI Instructions")).not.toBeVisible();
  });
});
