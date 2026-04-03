#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]);
  return fallback;
}

async function main() {
  const storagePath = path.resolve(arg('--storage', path.join(process.cwd(), 'data/.auth/meta-suite-instagram-storage.json')));
  const url = arg('--url', 'https://business.facebook.com/latest/insights');
  const timeoutMs = Math.max(60_000, Number(arg('--timeout-ms', '240000')) || 240000);

  await fs.mkdir(path.dirname(storagePath), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Opening Meta Business Suite login page...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('Please log in (and finish any 2FA) in the opened browser window.');
  console.log('After you can see Business Suite content, press ENTER here to save session.');

  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });

  await context.storageState({ path: storagePath });
  await browser.close();
  console.log(`Saved storage state to: ${storagePath}`);
}

main().catch((err) => {
  console.error('Failed to save Meta Suite login session:', err?.message || err);
  process.exit(1);
});
