const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // Login
    await page.goto('http://localhost:3300', { waitUntil: 'networkidle', timeout: 30000 });
    const signInBtn = page.locator('button:has-text("Sign In"), a:has-text("Sign In")');
    if (await signInBtn.count() > 0) {
      await signInBtn.first().click();
      await page.waitForTimeout(2000);
    }
    const userPicker = page.locator('button, a').filter({ hasText: /mock|admin|user|analyst/i });
    if (await userPicker.count() > 0) {
      await userPicker.first().click();
      await page.waitForTimeout(3000);
    }

    // Get cookies for API call
    const cookies = await context.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Intercept the stories API response
    let apiResponseLength = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/stories') && !response.url().includes('/summary')) {
        try {
          const json = await response.json();
          console.log(`API /api/stories response: ${json.length} stories`);
          if (json.length <= 10) {
            console.log('Stories:', JSON.stringify(json.map(s => s.story_title || s.id).slice(0, 10)));
          }
          apiResponseLength = json.length;
        } catch (e) {
          console.log('Could not parse response:', e.message);
        }
      }
      if (response.url().includes('/api/stories/summary')) {
        try {
          const json = await response.json();
          console.log(`API /api/stories/summary: ${JSON.stringify(json)}`);
        } catch (e) {}
      }
    });

    // Navigate to Story Bank
    await page.goto('http://localhost:3300/stories', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Count visible table rows
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    console.log(`\nVisible table rows: ${rowCount}`);

    // Check for pagination controls
    const pagination = page.locator('[class*="pagination"], button:has-text("Next"), button:has-text("Previous")');
    const paginationCount = await pagination.count();
    console.log(`Pagination elements: ${paginationCount}`);

    // Check for "showing X of Y" type text
    const pageText = await page.textContent('body');
    const showingMatch = pageText.match(/showing\s+\d+/i) || pageText.match(/(\d+)\s+of\s+(\d+)/i) || pageText.match(/page\s+\d+/i);
    if (showingMatch) console.log(`Pagination text found: ${showingMatch[0]}`);

    // Check for any error messages
    const errors = page.locator('[class*="error"], [class*="alert"], [role="alert"]');
    const errorCount = await errors.count();
    if (errorCount > 0) {
      for (let i = 0; i < errorCount; i++) {
        console.log(`Error/Alert: ${await errors.nth(i).textContent()}`);
      }
    }

    await page.screenshot({ path: '/tmp/try-it-screenshots/09-story-bank.png', fullPage: true });
    console.log('\nScreenshot saved');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
