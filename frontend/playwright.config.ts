import { defineConfig } from "@playwright/test";

/**
 * Playwright e2e test config for CareerLens.
 *
 * Expects Docker services running:
 *   COMPOSE_PROFILES=dev docker compose up -d
 *
 * Frontend: http://localhost:3300
 * Backend:  http://localhost:8300 (proxied via Next.js rewrite)
 * Mock OIDC: http://localhost:10190
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3300",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
