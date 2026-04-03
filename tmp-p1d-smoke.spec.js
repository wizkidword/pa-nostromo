const { test, expect } = require('@playwright/test');

test('smoke', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror:${err.message}`));
  await page.goto('http://127.0.0.1:4187', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-pod-id="weather"]')).toBeVisible();
  console.log('consoleErrors', JSON.stringify(consoleErrors));
});