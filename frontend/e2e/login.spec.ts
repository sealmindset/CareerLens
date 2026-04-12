import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsUser } from "./helpers";

test.describe("Login flow", () => {
  test("unauthenticated user sees login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/login/);
    await expect(page.locator("h1")).toContainText("CareerLens");
    await expect(page.getByRole("button", { name: "Sign in with SSO" })).toBeVisible();
  });

  test("Super Admin can login via mock-oidc", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/dashboard/);
    // Sidebar shows exact user name
    await expect(page.getByText("Admin User", { exact: true })).toBeVisible();
    await expect(page.getByText("Super Admin")).toBeVisible();
  });

  test("Regular User can login via mock-oidc", async ({ page }) => {
    await loginAsUser(page);
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByText("Regular User", { exact: true })).toBeVisible();
  });

  test("logout redirects to home", async ({ page }) => {
    await loginAsAdmin(page);
    await page.click("text=Sign out");
    await page.waitForURL("**/login", { timeout: 10_000 });
  });
});
