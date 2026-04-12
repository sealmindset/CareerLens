import { type Page } from "@playwright/test";

/**
 * Login via mock-oidc by navigating to /api/auth/login, picking a user on the
 * mock-oidc form, and waiting for the redirect back to /dashboard.
 */
export async function login(page: Page, userSub: string = "mock-admin") {
  // Navigate to the login endpoint — redirects to mock-oidc
  await page.goto("/api/auth/login");

  // Mock-oidc shows a form with buttons per user. Click the right one.
  await page.click(`button[value="${userSub}"]`);

  // Wait for redirect back to the app (callback → dashboard)
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

/**
 * Login as Super Admin (mock-admin).
 */
export async function loginAsAdmin(page: Page) {
  return login(page, "mock-admin");
}

/**
 * Login as regular User (mock-user).
 */
export async function loginAsUser(page: Page) {
  return login(page, "mock-user");
}
