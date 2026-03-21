import { chromium } from 'playwright';
import { join } from 'path';

const BASE = 'http://localhost:3300';
const SCREENSHOT_DIR = join(import.meta.dirname, 'screenshots');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Login via OIDC flow
  await page.goto(`${BASE}/api/auth/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);

  // We should be on mock-oidc now -- find and click the admin user
  const url = page.url();
  if (url.includes('10190') || url.includes('mock-oidc')) {
    // Try clicking any button containing the admin email or sub
    const buttons = page.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const text = await buttons.nth(i).textContent();
      if (text && (text.includes('admin@') || text.includes('mock-admin') || text.includes('Admin'))) {
        await buttons.nth(i).click();
        break;
      }
    }
    await page.waitForTimeout(3000);
  }

  // Verify login
  const me = await page.evaluate(async () => {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (!r.ok) return null;
    return r.json();
  });

  if (!me?.role_name) {
    console.log('Login failed, current URL:', page.url());
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'ai_debug.png'), fullPage: true });
    await browser.close();
    return;
  }
  console.log(`Logged in as ${me.role_name}`);

  // Go to admin settings
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(2000);

  // Click AI Provider in the left sidebar
  const aiSidebarBtn = page.locator('nav button:has-text("AI Provider")');
  await aiSidebarBtn.click();
  await page.waitForTimeout(1500);

  // Screenshot: Foundry tab (default)
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'ai_provider_foundry.png'), fullPage: true });

  // Click API Key sub-tab
  const apiKeySubTab = page.locator('button:has-text("API Key")');
  if (await apiKeySubTab.count() > 0) {
    await apiKeySubTab.first().click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'ai_provider_anthropic_apikey.png'), fullPage: true });

  // Click OpenAI tab
  const openaiTab = page.locator('button:has-text("OpenAI")');
  if (await openaiTab.count() > 0) {
    await openaiTab.first().click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'ai_provider_openai.png'), fullPage: true });

  // Click Ollama tab
  const ollamaTab = page.locator('button:has-text("Ollama")');
  if (await ollamaTab.count() > 0) {
    await ollamaTab.first().click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'ai_provider_ollama.png'), fullPage: true });

  await browser.close();
  console.log('Screenshots taken for all AI Provider tabs');
}

run().catch(console.error);
