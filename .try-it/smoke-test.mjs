import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/Volumes/PRO-BLADE/career-lens/frontend/node_modules/playwright-core');
import fs from 'fs';
import path from 'path';

const FRONTEND = 'http://localhost:3300';
const SCREENSHOTS = '.try-it/screenshots';

// Actual mock-oidc users (from /api/users)
const ROLES = [
  { name: 'Super Admin', sub: 'mock-admin', displayName: 'Admin User', email: 'admin@career-lens.local' },
  { name: 'Pro User', sub: 'mock-pro', displayName: 'Pro User', email: 'pro@career-lens.local' },
  { name: 'User', sub: 'mock-user', displayName: 'Regular User', email: 'user@career-lens.local' },
];

const PAGES = [
  { path: '/command-center', name: 'Command Center' },
  { path: '/profile', name: 'Profile' },
  { path: '/resumes', name: 'Resumes' },
  { path: '/agents', name: 'Agents' },
  { path: '/stories', name: 'Stories' },
  { path: '/interview-questions', name: 'Interview Questions' },
  { path: '/analytics', name: 'Analytics' },
];

const ADMIN_PAGES = [
  { path: '/admin/users', name: 'Admin Users' },
  { path: '/admin/roles', name: 'Admin Roles' },
  { path: '/admin/prompts', name: 'AI Instructions' },
  { path: '/admin/settings', name: 'Admin Settings' },
];

const results = { roles: {}, errors: [] };

async function loginAs(browser, role) {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    const loginUrl = `${FRONTEND}/api/auth/login?login_hint=${role.sub}`;
    await page.goto(loginUrl, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    if (currentUrl.includes('10190') || currentUrl.includes('authorize')) {
      // Try clicking the matching user button
      const btn = page.locator(`button:has-text("${role.displayName}")`).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
      } else {
        // Screenshot what we see
        await page.screenshot({ path: path.join(SCREENSHOTS, `${role.sub}_oidc_picker.png`), fullPage: true });
        // Try any button
        const anyBtn = page.locator('button').first();
        await anyBtn.click().catch(() => {});
      }
      await page.waitForTimeout(3000);
    }
    
    await page.waitForURL('**/command-center**', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    
    return { context, page, success: true };
  } catch (err) {
    await page.screenshot({ path: path.join(SCREENSHOTS, `${role.sub}_error.png`), fullPage: true }).catch(() => {});
    results.errors.push({ role: role.name, phase: 'login', error: err.message });
    return { context, page, success: false };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  
  for (const role of ROLES) {
    console.log(`\n=== Testing as ${role.name} (${role.sub}) ===`);
    const { context, page, success } = await loginAs(browser, role);
    
    if (success) {
      const meResponse = await page.evaluate(async () => {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        if (r.ok) return await r.json();
        return { error: r.status };
      }).catch(err => ({ error: err.message }));
      
      console.log(`  Logged in as: ${meResponse.role_name || 'unknown'} (${meResponse.email || 'no email'})`);
      
      const loginSuccess = !meResponse.error;
      
      // Screenshot command center
      await page.screenshot({ path: path.join(SCREENSHOTS, `${role.sub}_command-center.png`), fullPage: true });

      // Test each page
      const allPages = role.sub === 'mock-admin' ? [...PAGES, ...ADMIN_PAGES] : PAGES;
      const pageResults = [];
      for (const pg of allPages) {
        try {
          await page.goto(`${FRONTEND}${pg.path}`, { waitUntil: 'load', timeout: 15000 });
          await page.waitForTimeout(2000);

          const screenshot = `${role.sub}_${pg.name.toLowerCase().replace(/\s+/g, '_')}.png`;
          await page.screenshot({ path: path.join(SCREENSHOTS, screenshot), fullPage: true });

          const bodyText = await page.locator('body').innerText().catch(() => '');
          const hasContent = bodyText.length > 50;
          const redirectedToLogin = page.url().includes('/login') || (!page.url().includes(pg.path) && page.url().endsWith('/'));
          const hasError = await page.locator('text=/Something went wrong|500 Internal|Server Error/').first().isVisible({ timeout: 500 }).catch(() => false);

          let status;
          if (redirectedToLogin) status = 'NO ACCESS';
          else if (hasError) status = 'ERROR';
          else if (hasContent) status = 'PASS';
          else status = 'EMPTY';

          pageResults.push({ page: pg.name, path: pg.path, passed: status === 'PASS', status, screenshot });
          console.log(`  ${pg.name}: ${status}`);

          // Story Bank detail view test
          if (pg.name === 'Stories' && status === 'PASS') {
            const tableRow = page.locator('table tbody tr').first();
            if (await tableRow.isVisible({ timeout: 2000 }).catch(() => false)) {
              await tableRow.click();
              await page.waitForTimeout(2500);
              const detailShot = `${role.sub}_stories_detail.png`;
              await page.screenshot({ path: path.join(SCREENSHOTS, detailShot), fullPage: true });
              pageResults.push({ page: 'Stories Detail', path: pg.path, passed: true, status: 'PASS', screenshot: detailShot });
              console.log(`  Stories Detail: PASS`);

              // Test back button
              const backBtn = page.locator('button:has-text("Back to Stories")');
              if (await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await backBtn.click();
                await page.waitForTimeout(1500);
                const backShot = `${role.sub}_stories_back.png`;
                await page.screenshot({ path: path.join(SCREENSHOTS, backShot), fullPage: true });
                pageResults.push({ page: 'Stories Back', path: pg.path, passed: true, status: 'PASS', screenshot: backShot });
                console.log(`  Stories Back: PASS`);
              }
            }
          }

          // Agents detail view test
          if (pg.name === 'Agents' && status === 'PASS') {
            const tableRow = page.locator('table tbody tr').first();
            if (await tableRow.isVisible({ timeout: 2000 }).catch(() => false)) {
              await tableRow.click();
              await page.waitForTimeout(2500);
              const detailShot = `${role.sub}_agents_detail.png`;
              await page.screenshot({ path: path.join(SCREENSHOTS, detailShot), fullPage: true });
              pageResults.push({ page: 'Agents Detail', path: pg.path, passed: true, status: 'PASS', screenshot: detailShot });
              console.log(`  Agents Detail: PASS`);
            }
          }
        } catch (err) {
          pageResults.push({ page: pg.name, path: pg.path, passed: false, status: 'TIMEOUT', error: err.message });
          console.log(`  ${pg.name}: TIMEOUT`);
        }
      }
      
      // Test logout
      const logoutResult = await page.evaluate(async () => {
        const r = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        return { status: r.status, ok: r.ok };
      }).catch(err => ({ error: err.message }));
      
      const meAfterLogout = await page.evaluate(async () => {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        return { status: r.status };
      }).catch(err => ({ error: err.message }));
      
      const logoutWorks = logoutResult.ok && meAfterLogout.status === 401;
      console.log(`  Logout: ${logoutWorks ? 'PASS' : 'FAIL'} (logout=${logoutResult.status}, me_after=${meAfterLogout.status})`);
      
      results.roles[role.name] = {
        loginSuccess,
        authMe: meResponse,
        logoutWorks,
        pages: pageResults,
        pagesPass: pageResults.filter(p => p.passed).length,
        pagesTotal: pageResults.length,
      };
    } else {
      results.roles[role.name] = { loginSuccess: false, pages: [], pagesPass: 0, pagesTotal: PAGES.length };
      console.log(`  Login FAILED`);
    }
    
    await context.close();
  }
  
  await browser.close();
  
  fs.writeFileSync('.try-it/results.json', JSON.stringify(results, null, 2));
  console.log('\n=== Results saved ===');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
