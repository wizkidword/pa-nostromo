#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]);
  return fallback;
}

function parseCompactCount(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return null;
  const m = raw.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const unit = (m[2] || '').toLowerCase();
  const mul = unit === 'k' ? 1e3 : unit === 'm' ? 1e6 : unit === 'b' ? 1e9 : 1;
  return Math.round(base * mul);
}

function parseCount(raw) {
  const compact = parseCompactCount(String(raw || '').replace(/,/g, ''));
  if (Number.isFinite(compact) && compact > 0) return compact;
  const plain = Number(String(raw || '').replace(/,/g, '').trim());
  if (Number.isFinite(plain) && plain > 0) return Math.round(plain);
  return null;
}

function extractFollowersFromText(text) {
  const src = String(text || '');
  if (!src) return null;

  // Strict first: "Instagram followers" context only.
  const strictPatterns = [
    /instagram\s+followers\D{0,40}([0-9][0-9,.]*\s*[kKmMbB]?)/i,
    /([0-9][0-9,.]*\s*[kKmMbB]?)\D{0,20}instagram\s+followers/i,
    /followers\s*lifetime\D{0,20}([0-9][0-9,.]*\s*[kKmMbB]?)/i,
    /followers\D{0,12}([0-9][0-9,.]*\s*[kKmMbB]?)/i,
  ];
  for (const rx of strictPatterns) {
    const m = src.match(rx);
    const parsed = parseCount(m?.[1] || '');
    if (Number.isFinite(parsed)) return parsed;
  }

  // Line-based fallback: only lines that explicitly mention instagram+followers.
  const lines = src.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidates = [];
  for (const line of lines) {
    if (!/instagram/i.test(line) || !/followers/i.test(line)) continue;
    const nums = line.match(/[0-9][0-9,.]*\s*[kKmMbB]?/g) || [];
    for (const n of nums) {
      const parsed = parseCount(n);
      if (Number.isFinite(parsed)) candidates.push(parsed);
    }
  }
  if (candidates.length) return Math.max(...candidates);

  return null;
}

function out(payload) {
  process.stdout.write(JSON.stringify(payload));
}

async function main() {
  const handle = arg('--handle', '').replace(/^@+/, '').trim();
  const url = arg('--url', 'https://business.facebook.com/latest/insights');
  const storagePath = path.resolve(arg('--storage', path.join(process.cwd(), 'data/.auth/meta-suite-instagram-storage.json')));
  const timeoutMs = Math.max(5000, Number(arg('--timeout-ms', '45000')) || 45000);
  const headless = arg('--headless', '1') !== '0';

  const hasStorageState = fs.existsSync(storagePath);
  if (!hasStorageState) {
    out({ ok: false, reason: 'meta_suite_setup_required', message: `Storage state missing at ${storagePath}. Run one-time setup login.`, setupRequired: true, storagePath });
    return;
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: storagePath });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(2000);

    const needsLogin = /\/login|checkpoint/i.test(page.url())
      || await page.locator('input[name="email"], input#email, input[name="pass"]').first().isVisible().catch(() => false);
    if (needsLogin) {
      out({ ok: false, reason: 'meta_suite_setup_required', message: 'Meta Business Suite session expired or not authenticated. Re-run one-time setup login.', setupRequired: true, storagePath, currentUrl: page.url() });
      return;
    }

    // Try a focused search around likely label blocks first.
    const likelyTexts = await page.locator('text=/Instagram followers|Followers|Total followers/i').allTextContents().catch(() => []);
    for (const t of likelyTexts) {
      const n = extractFollowersFromText(t);
      if (Number.isFinite(n) && n > 0) {
        out({ ok: true, provider: 'meta_suite_playwright', followersCount: n, signal: 'label_scan', profileName: handle || '' });
        return;
      }
    }

    // Fallback: scan full body text.
    const bodyText = await page.locator('body').innerText({ timeout: Math.min(timeoutMs, 12000) }).catch(() => '');
    const fullMatch = extractFollowersFromText(bodyText);
    if (Number.isFinite(fullMatch) && fullMatch > 0) {
      out({ ok: true, provider: 'meta_suite_playwright', followersCount: fullMatch, signal: 'body_scan', profileName: handle || '' });
      return;
    }

    out({ ok: false, reason: 'meta_suite_followers_not_found', message: 'Could not locate follower count in Meta Suite page content.', setupRequired: false, currentUrl: page.url() });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  out({ ok: false, reason: 'meta_suite_script_failed', message: String(err?.message || err || 'unknown_error').slice(0, 280) });
});
