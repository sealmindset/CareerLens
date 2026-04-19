const { chromium } = require('/Users/rvance/Documents/GitHub/CareerLens/frontend/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND = 'http://localhost:3300';
const SCREENSHOTS = path.join(__dirname, 'screenshots');

const USERS = [
  { sub: 'mock-admin', label: 'admin', name: 'Admin User', role: 'Super Admin' },
  { sub: 'mock-pro', label: 'pro', name: 'Pro User', role: 'Pro User' },
  { sub: 'mock-user', label: 'user', name: 'Regular User', role: 'User' },
];

const PAGES = [
  { path: '/dashboard', name: 'dashboard' },
  { path: '/jobs', name: 'jobs' },
  { path: '/agents', name: 'agents' },
  { path: '/interview-questions', name: 'interview-questions' },
  { path: '/profile', name: 'profile' },
  { path: '/applications', name: 'applications' },
  { path: '/resumes', name: 'resumes' },
  { path: '/stories', name: 'stories' },
  { path: '/analytics', name: 'analytics' },
  { path: '/command-center', name: 'command-center' },
];

const ADMIN_PAGES = [
  { path: '/admin/users', name: 'admin-users' },
  { path: '/admin/roles', name: 'admin-roles' },
  { path: '/admin/settings', name: 'admin-settings' },
  { path: '/admin/prompts', name: 'admin-prompts' },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loginAs(browser, user) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Go to login page
  await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1500);

  let currentUrl = page.url();

  // If on login page, click sign in
  if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl === FRONTEND + '/') {
    const signInBtn = page.locator('button:has-text("Sign"), a:has-text("Sign")').first();
    if (await signInBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await signInBtn.click();
      await page.waitForURL(/.*/, { timeout: 15000 });
      await sleep(2000);
    }
  }

  currentUrl = page.url();

  // If on mock-oidc, pick the user
  if (currentUrl.includes('10190') || currentUrl.includes('mock-oidc') || currentUrl.includes('authorize')) {
    // Try clicking user by name
    const userBtn = page.locator(`button:has-text("${user.name}"), [data-sub="${user.sub}"]`).first();
    if (await userBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userBtn.click();
      await page.waitForURL(url => !url.toString().includes('10190'), { timeout: 15000 });
      await sleep(2000);
    } else {
      // Try login_hint approach
      await page.goto(`${FRONTEND}/api/auth/login?login_hint=${user.sub}`, {
        waitUntil: 'networkidle',
        timeout: 20000,
      });
      await sleep(3000);
    }
  }

  // If still on OIDC page, try direct login_hint
  currentUrl = page.url();
  if (currentUrl.includes('10190') || currentUrl.includes('login')) {
    await page.goto(`${FRONTEND}/api/auth/login?login_hint=${user.sub}`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });
    await sleep(3000);
  }

  return { context, page };
}

async function run() {
  if (!fs.existsSync(SCREENSHOTS)) fs.mkdirSync(SCREENSHOTS, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const user of USERS) {
    let context, page;
    try {
      ({ context, page } = await loginAs(browser, user));
      const afterLogin = page.url();
      const loggedIn = !afterLogin.includes('login') && !afterLogin.includes('10190') && !afterLogin.includes('signin');

      results.push({ user: user.role, test: 'login', pass: loggedIn, url: afterLogin });

      if (!loggedIn) {
        console.log(`LOGIN FAILED for ${user.role}: ended at ${afterLogin}`);
        await page.screenshot({ path: path.join(SCREENSHOTS, `mock-${user.label}_login-failed.png`), fullPage: true });
        await context.close();
        continue;
      }

      // Test all regular pages
      const pagesToTest = [...PAGES];
      if (user.role === 'Super Admin') pagesToTest.push(...ADMIN_PAGES);

      for (const pg of pagesToTest) {
        try {
          await page.goto(`${FRONTEND}${pg.path}`, { waitUntil: 'networkidle', timeout: 20000 });
          await sleep(1500);
          await page.screenshot({ path: path.join(SCREENSHOTS, `mock-${user.label}_${pg.name}.png`), fullPage: true });
          results.push({ user: user.role, test: `page:${pg.name}`, pass: true, url: page.url() });
        } catch (e) {
          results.push({ user: user.role, test: `page:${pg.name}`, pass: false, error: e.message.slice(0, 200) });
        }
      }
    } catch (e) {
      results.push({ user: user.role, test: 'login', pass: false, error: e.message.slice(0, 200) });
    }
    if (context) await context.close();
  }

  await browser.close();

  // Output results
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log(JSON.stringify(results, null, 2));
  console.log(`\n=== SMOKE TEST SUMMARY: ${passed} passed, ${failed} failed out of ${results.length} tests ===`);

  // Write results to file for report generation
  fs.writeFileSync(
    path.join(__dirname, 'smoke-results.json'),
    JSON.stringify({ results, passed, failed, total: results.length, timestamp: new Date().toISOString() }, null, 2)
  );
}

run().catch(e => { console.error(e); process.exit(1); });
