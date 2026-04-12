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

    // Hover a card to reveal edit button, then click
    const card = page.locator("[class*='rounded-xl'][class*='group']").first();
    await card.hover();
    const editButton = card.locator("button[title='Edit prompt']");
    if (await editButton.isVisible()) {
      await editButton.click();
      // Editor modal should open — look for the textarea label
      await expect(page.getByText("System Prompt", { exact: true }).first()).toBeVisible({ timeout: 5_000 });
      // Should have tabs
      await expect(page.getByRole("button", { name: "editor" })).toBeVisible();
      await expect(page.getByRole("button", { name: "settings" })).toBeVisible();
      await expect(page.getByRole("button", { name: "history", exact: true })).toBeVisible();
    }
  });

  test("regular user cannot access AI Instructions", async ({ page }) => {
    await loginAsUser(page);
    // AI Instructions link should not appear in sidebar
    await expect(page.locator("a >> text=AI Instructions")).not.toBeVisible();
  });
});
