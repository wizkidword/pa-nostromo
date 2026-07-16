#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]);
  return fallback;
}

function out(payload) {
  process.stdout.write(JSON.stringify(payload));
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function firstImageUrl(node) {
  if (typeof node?.display_uri === 'string' && node.display_uri.trim()) return node.display_uri.trim();
  const candidates = Array.isArray(node?.image_versions2?.candidates) ? node.image_versions2.candidates : [];
  const best = candidates.find((entry) => typeof entry?.url === 'string' && entry.url.trim()) || candidates[0];
  return typeof best?.url === 'string' ? best.url.trim() : '';
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') return null;
  const code = String(node.code || '').trim();
  if (!code) return null;

  const productType = String(node.product_type || '').trim();
  const permalinkPath = productType === 'clips' ? `/reel/${code}/` : `/p/${code}/`;
  const caption = String(node?.caption?.text || '').replace(/\s+/g, ' ').trim();
  const likeCount = toCount(node.like_count);
  const commentCount = toCount(node.comment_count);
  const repostCount = toCount(node.media_repost_count);
  const viewCount = toCount(
    node.view_count
    ?? node.play_count
    ?? node.video_view_count
    ?? node?.clips_metadata?.play_count
  );
  const interactionCount = (likeCount || 0) + (commentCount || 0) + (repostCount || 0);
  const takenAtRaw = Number(node.taken_at);
  const takenAt = Number.isFinite(takenAtRaw) && takenAtRaw > 0
    ? new Date(takenAtRaw * 1000).toISOString()
    : '';

  return {
    code,
    id: String(node.id || node.pk || '').trim(),
    permalink: `https://www.instagram.com${permalinkPath}`,
    caption,
    takenAt,
    productType,
    mediaType: Number.isFinite(Number(node.media_type)) ? Number(node.media_type) : null,
    likeCount,
    commentCount,
    repostCount,
    viewCount,
    interactionCount,
    thumbnailUrl: firstImageUrl(node),
  };
}

async function main() {
  const handle = arg('--handle', '').replace(/^@+/, '').trim();
  const url = arg('--url', handle ? `https://www.instagram.com/${handle}/` : 'https://www.instagram.com/');
  const storagePath = path.resolve(arg('--storage', path.join(process.cwd(), 'data/.auth/meta-suite-instagram-storage.json')));
  const timeoutMs = Math.max(5000, toPositiveInt(arg('--timeout-ms', '45000'), 45000));
  const maxItems = Math.max(1, Math.min(24, toPositiveInt(arg('--max-items', '12'), 12)));
  const headless = arg('--headless', '1') !== '0';

  if (!fs.existsSync(storagePath)) {
    out({ ok: false, reason: 'instagram_content_setup_required', message: `Storage state missing at ${storagePath}.`, setupRequired: true, storagePath });
    return;
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: storagePath });
  const page = await context.newPage();
  let timelineEdges = [];

  page.on('response', async (response) => {
    if (timelineEdges.length) return;
    const urlString = response.url();
    const contentType = String(response.headers()['content-type'] || '');
    if (!/application\/json/i.test(contentType)) return;
    if (!/graphql\/query/i.test(urlString)) return;
    try {
      const text = await response.text();
      if (!/xdt_api__v1__feed__user_timeline_graphql_connection/.test(text)) return;
      const parsed = JSON.parse(text);
      const edges = parsed?.data?.xdt_api__v1__feed__user_timeline_graphql_connection?.edges;
      if (Array.isArray(edges) && edges.length) timelineEdges = edges.slice();
    } catch {}
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(7000);

    const needsLogin = /\/accounts\/login|\/login/i.test(page.url())
      || await page.locator('input[name="username"], input[name="password"]').first().isVisible().catch(() => false);
    if (needsLogin) {
      out({ ok: false, reason: 'instagram_content_setup_required', message: 'Instagram session expired or not authenticated.', setupRequired: true, storagePath, currentUrl: page.url() });
      return;
    }

    const items = timelineEdges
      .map((edge) => normalizeNode(edge?.node))
      .filter(Boolean)
      .slice(0, maxItems);

    if (!items.length) {
      out({ ok: false, reason: 'instagram_content_not_found', message: 'Could not capture recent Instagram timeline content.', setupRequired: false, currentUrl: page.url() });
      return;
    }

    const firstUser = timelineEdges[0]?.node?.user;
    const profileName = String(firstUser?.username || handle || '').trim();
    out({
      ok: true,
      provider: 'instagram_session_graphql',
      profileHandle: String(firstUser?.username || handle || '').trim(),
      profileName: profileName || handle || '',
      items,
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  out({ ok: false, reason: 'instagram_content_script_failed', message: String(err?.message || err || 'unknown_error').slice(0, 280) });
});
