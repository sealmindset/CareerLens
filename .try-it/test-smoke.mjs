import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:3300';
const SCREENSHOT_DIR = join(import.meta.dirname, 'screenshots');

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const roles = [
  { sub: 'mock-admin', email: 'admin@career-lens.local', name: 'Admin User', role: 'Super Admin' },
  { sub: 'mock-manager', email: 'manager@career-lens.local', name: 'Manager User', role: 'Admin' },
  { sub: 'mock-pro', email: 'pro@career-lens.local', name: 'Pro User', role: 'Pro User' },
  { sub: 'mock-user', email: 'user@career-lens.local', name: 'Regular User', role: 'User' },
];

const pages = [
  { path: '/dashboard', label: 'Dashboard', minRole: 'User' },
  { path: '/profile', label: 'Profile', minRole: 'User' },
  { path: '/jobs', label: 'Jobs', minRole: 'User' },
  { path: '/applications', label: 'Applications', minRole: 'User' },
  { path: '/agents', label: 'Agents', minRole: 'User' },
  { path: '/admin/users', label: 'Admin Users', minRole: 'Admin' },
  { path: '/admin/roles', label: 'Admin Roles', minRole: 'Admin' },
  { path: '/admin/prompts', label: 'Admin Prompts', minRole: 'Admin' },
  { path: '/admin/settings', label: 'Admin Settings', minRole: 'Admin' },
];

const roleHierarchy = { 'Super Admin': 4, 'Admin': 3, 'Pro User': 2, 'User': 1 };

const results = [];

async function loginAs(page, role) {
  // Step 1: Hit /api/auth/login to get the OIDC authorize URL
  await page.goto(`${BASE}/api/auth/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);

  // We should now be on the mock-oidc login page
  const url = page.url();

  if (url.includes('10190') || url.includes('mock-oidc')) {
    // Look for a user button to click
    const userBtn = page.locator(`button`, { hasText: role.email });
    const subBtn = page.locator(`[data-sub="${role.sub}"]`);
    const nameBtn = page.locator(`button`, { hasText: role.name });

    if (await subBtn.count() > 0) {
      await subBtn.first().click();
    } else if (await userBtn.count() > 0) {
      await userBtn.first().click();
    } else if (await nameBtn.count() > 0) {
      await nameBtn.first().click();
    } else {
      // Try clicking any button that looks like a user selector
      const allBtns = page.locator('button');
      const count = await allBtns.count();
      for (let i = 0; i < count; i++) {
        const text = await allBtns.nth(i).textContent();
        if (text && (text.includes(role.sub) || text.includes(role.email) || text.includes('mock'))) {
          await allBtns.nth(i).click();
          break;
        }
      }
    }
    await page.waitForTimeout(3000);
  }

  // Verify we got back to the app
  const meResp = await page.evaluate(async () => {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (!r.ok) return null;
    return r.json();
  });

  return meResp;
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  for (const role of roles) {
    console.log(`\n--- Testing as ${role.role} (${role.email}) ---`);
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const meResp = await loginAs(page, role);

      if (meResp && meResp.role_name) {
        console.log(`  Login: PASS (role: ${meResp.role_name})`);
        results.push({ role: role.role, test: 'Login', status: 'PASS', note: `role: ${meResp.role_name}` });
      } else {
        console.log(`  Login: FAIL (meResp: ${JSON.stringify(meResp)})`);
        results.push({ role: role.role, test: 'Login', status: 'FAIL', note: 'Could not authenticate' });

        // Take a debug screenshot
        await page.screenshot({ path: join(SCREENSHOT_DIR, `${role.sub}_login_fail.png`), fullPage: true });
        console.log(`  Current URL: ${page.url()}`);

        // Try page content for debugging
        const bodyText = await page.textContent('body').catch(() => '');
        console.log(`  Page content (first 300): ${bodyText?.slice(0, 300)}`);

        await context.close();
        continue;
      }

      // Take dashboard screenshot
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: join(SCREENSHOT_DIR, `${role.sub}_dashboard.png`), fullPage: true });

      // Test each page
      for (const pg of pages) {
        const minLevel = roleHierarchy[pg.minRole] || 0;
        const userLevel = roleHierarchy[role.role] || 0;

        if (userLevel < minLevel) {
          results.push({ role: role.role, test: pg.label, status: 'N/A', note: 'No access (expected)' });
          continue;
        }

        try {
          const resp = await page.goto(`${BASE}${pg.path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page.waitForTimeout(2000);

          const status = resp ? resp.status() : 0;
          const bodyText = await page.textContent('body').catch(() => '');
          const hasContent = bodyText && bodyText.length > 100;

          if (status === 200 && hasContent) {
            console.log(`  ${pg.label}: PASS`);
            results.push({ role: role.role, test: pg.label, status: 'PASS', note: '' });
          } else {
            console.log(`  ${pg.label}: FAIL (status=${status}, contentLen=${bodyText?.length || 0})`);
            results.push({ role: role.role, test: pg.label, status: 'FAIL', note: `status=${status}` });
          }

          await page.screenshot({ path: join(SCREENSHOT_DIR, `${role.sub}${pg.path.replace(/\//g, '_')}.png`), fullPage: true });
        } catch (err) {
          console.log(`  ${pg.label}: FAIL (${err.message.slice(0, 80)})`);
          results.push({ role: role.role, test: pg.label, status: 'FAIL', note: err.message.slice(0, 80) });
        }
      }

      // Test logout
      try {
        const logoutOk = await page.evaluate(async () => {
          const r = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
          return r.ok;
        });
        const meAfter = await page.evaluate(async () => {
          const r = await fetch('/api/auth/me', { credentials: 'include' });
          return r.status;
        });
        if (meAfter === 401) {
          console.log(`  Logout: PASS`);
          results.push({ role: role.role, test: 'Logout', status: 'PASS', note: '' });
        } else {
          console.log(`  Logout: FAIL (me returned ${meAfter})`);
          results.push({ role: role.role, test: 'Logout', status: 'FAIL', note: `me returned ${meAfter}` });
        }
      } catch (err) {
        results.push({ role: role.role, test: 'Logout', status: 'FAIL', note: err.message.slice(0, 80) });
      }
    } catch (err) {
      console.log(`  Error: ${err.message.slice(0, 150)}`);
      results.push({ role: role.role, test: 'Session', status: 'FAIL', note: err.message.slice(0, 150) });
    }

    await context.close();
  }

  await browser.close();

  // Write results JSON
  writeFileSync(join(SCREENSHOT_DIR, '..', 'results.json'), JSON.stringify(results, null, 2));

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const na = results.filter(r => r.status === 'N/A').length;
  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed, ${na} N/A ===`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ${r.role} - ${r.test}: ${r.note}`);
    });
  }
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
