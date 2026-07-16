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

function extractMembersFromText(text) {
  const src = String(text || '');
  if (!src) return { count: null, signal: '' };
  const patterns = [
    { signal: 'body_text_members', rx: /([0-9][0-9,.]*\s*[kKmMbB]?)\s+members\b/i },
    { signal: 'members_reverse', rx: /members\D{0,20}([0-9][0-9,.]*\s*[kKmMbB]?)/i },
    { signal: 'community_members', rx: /community members\D{0,20}([0-9][0-9,.]*\s*[kKmMbB]?)/i },
  ];
  for (const entry of patterns) {
    const match = src.match(entry.rx);
    const count = parseCount(match?.[1] || '');
    if (Number.isFinite(count)) return { count, signal: entry.signal };
  }
  return { count: null, signal: '' };
}

function out(payload) {
  process.stdout.write(JSON.stringify(payload));
}

async function main() {
  const url = arg('--url', 'https://www.facebook.com/groups/');
  const storagePath = path.resolve(arg('--storage', path.join(process.cwd(), 'data/.auth/meta-suite-instagram-storage.json')));
  const timeoutMs = Math.max(5000, Number(arg('--timeout-ms', '45000')) || 45000);
  const headless = arg('--headless', '1') !== '0';

  const contextOptions = fs.existsSync(storagePath) ? { storageState: storagePath } : {};

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(3500);

    const bodyText = await page.locator('body').innerText({ timeout: Math.min(timeoutMs, 15000) }).catch(() => '');
    const extracted = extractMembersFromText(bodyText);
    if (!Number.isFinite(extracted.count) || extracted.count <= 0) {
      const needsLogin = /\/login|checkpoint/i.test(page.url())
        || await page.locator('input[name="email"], input[name="pass"], input#email').first().isVisible().catch(() => false);
      if (needsLogin) {
        out({ ok: false, reason: 'facebook_group_session_setup_required', message: 'Facebook group session expired or not authenticated.', setupRequired: true, storagePath, currentUrl: page.url() });
        return;
      }
      out({ ok: false, reason: 'facebook_group_members_not_found', message: 'Could not locate member count on Facebook group page.', setupRequired: false, currentUrl: page.url() });
      return;
    }

    const lines = bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const groupName = lines.find((line) => !/^(log in|forgot account\?|group by .+|public group|join group|more|about|discussion|featured|events|media)$/i.test(line) && !/members/i.test(line)) || '';

    out({
      ok: true,
      provider: 'facebook_group_playwright',
      membersCount: extracted.count,
      signal: extracted.signal || 'body_text_members',
      groupName,
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  out({ ok: false, reason: 'facebook_group_session_script_failed', message: String(err?.message || err || 'unknown_error').slice(0, 280) });
});
