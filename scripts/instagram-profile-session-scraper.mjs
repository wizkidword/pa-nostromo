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

function extractFollowersFromBody(text) {
  const src = String(text || '');
  if (!src) return { count: null, signal: '' };

  const direct = src.match(/([0-9][0-9,.]*\s*[kKmMbB]?)\s+followers\b/i);
  const directCount = parseCount(direct?.[1] || '');
  if (Number.isFinite(directCount)) {
    return { count: directCount, signal: 'body_text_followers' };
  }

  const lines = src.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let idx = 0; idx < lines.length; idx += 1) {
    if (!/followers/i.test(lines[idx])) continue;
    const joined = [lines[idx - 1], lines[idx], lines[idx + 1]].filter(Boolean).join(' ');
    const match = joined.match(/([0-9][0-9,.]*\s*[kKmMbB]?)\s+followers\b/i);
    const count = parseCount(match?.[1] || '');
    if (Number.isFinite(count)) {
      return { count, signal: 'line_cluster_followers' };
    }
  }

  return { count: null, signal: '' };
}

function out(payload) {
  process.stdout.write(JSON.stringify(payload));
}

async function main() {
  const handle = arg('--handle', '').replace(/^@+/, '').trim();
  const url = arg('--url', handle ? `https://www.instagram.com/${handle}/` : 'https://www.instagram.com/');
  const storagePath = path.resolve(arg('--storage', path.join(process.cwd(), 'data/.auth/meta-suite-instagram-storage.json')));
  const timeoutMs = Math.max(5000, Number(arg('--timeout-ms', '45000')) || 45000);
  const headless = arg('--headless', '1') !== '0';

  if (!fs.existsSync(storagePath)) {
    out({ ok: false, reason: 'instagram_session_setup_required', message: `Storage state missing at ${storagePath}.`, setupRequired: true, storagePath });
    return;
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: storagePath });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(3500);

    const needsLogin = /\/accounts\/login|\/login/i.test(page.url())
      || await page.locator('input[name="username"], input[name="password"]').first().isVisible().catch(() => false);
    if (needsLogin) {
      out({ ok: false, reason: 'instagram_session_setup_required', message: 'Instagram session expired or not authenticated.', setupRequired: true, storagePath, currentUrl: page.url() });
      return;
    }

    const bodyText = await page.locator('body').innerText({ timeout: Math.min(timeoutMs, 15000) }).catch(() => '');
    const extracted = extractFollowersFromBody(bodyText);
    if (!Number.isFinite(extracted.count) || extracted.count <= 0) {
      out({ ok: false, reason: 'instagram_session_followers_not_found', message: 'Could not locate follower count on authenticated Instagram profile page.', setupRequired: false, currentUrl: page.url() });
      return;
    }

    out({
      ok: true,
      provider: 'instagram_session_playwright',
      followersCount: extracted.count,
      signal: extracted.signal || 'body_text_followers',
      profileName: handle || '',
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  out({ ok: false, reason: 'instagram_session_script_failed', message: String(err?.message || err || 'unknown_error').slice(0, 280) });
});
