const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const os = require('os');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_RETENTION = 200;
const STATE_SCHEMA_VERSION = 2;
const SNAPSHOT_SCHEMA_VERSION = 1;

function loadEnvFile(filePath, shellEnvKeys = new Set()) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (!key || shellEnvKeys.has(key)) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

const SHELL_ENV_KEYS = new Set(Object.keys(process.env));
loadEnvFile(path.join(ROOT, '.env'), SHELL_ENV_KEYS);
loadEnvFile(path.join(ROOT, '.env.local'), SHELL_ENV_KEYS);

const PORT = Number(process.env.PORT || 4187);

function parsePositiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function parseBool(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

const IS_PROD = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
const ROWAN_MAX_TEXT_LENGTH = parsePositiveInt(process.env.ROWAN_SEND_MAX_TEXT_LENGTH, 2000);
const ROWAN_RELAY_URL = String(process.env.ROWAN_RELAY_URL || '').trim();
const ROWAN_RELAY_TIMEOUT_MS = Math.max(1000, parsePositiveInt(process.env.ROWAN_RELAY_TIMEOUT_MS, 8000));
const ROWAN_RELAY_AUTH_BEARER = String(process.env.ROWAN_RELAY_AUTH_BEARER || '').trim();
const ROWAN_RELAY_AUTH_HEADER = String(process.env.ROWAN_RELAY_AUTH_HEADER || 'Authorization').trim() || 'Authorization';
const ROWAN_RELAY_OPENCLAW_CHANNEL = String(process.env.ROWAN_RELAY_OPENCLAW_CHANNEL || (IS_PROD ? '' : 'webchat')).trim();
const ROWAN_RELAY_OPENCLAW_TARGET = String(process.env.ROWAN_RELAY_OPENCLAW_TARGET || (IS_PROD ? '' : 'agent:main:main')).trim();
const ROWAN_ALLOW_REMOTE = parseBool(process.env.ROWAN_ALLOW_REMOTE);
const CAMERA_PROXY_ALLOW_REMOTE = parseBool(process.env.CAMERA_PROXY_ALLOW_REMOTE);
const CAMERA_PROXY_ALLOWLIST = String(process.env.CAMERA_PROXY_ALLOWLIST || '')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);
const CAMERA_PROXY_TIMEOUT_MS = Math.max(1000, parsePositiveInt(process.env.CAMERA_PROXY_TIMEOUT_MS, 7000));
const CAMERA_PROXY_MAX_BYTES = Math.max(64 * 1024, parsePositiveInt(process.env.CAMERA_PROXY_MAX_BYTES, 5 * 1024 * 1024));
const RSS_FETCH_ALLOW_REMOTE = parseBool(process.env.RSS_FETCH_ALLOW_REMOTE);
const RSS_FETCH_TIMEOUT_MS = Math.max(1500, parsePositiveInt(process.env.RSS_FETCH_TIMEOUT_MS, 12000));
const RSS_FETCH_MAX_BYTES = Math.max(128 * 1024, parsePositiveInt(process.env.RSS_FETCH_MAX_BYTES, 2 * 1024 * 1024));
const RSS_FETCH_MAX_FEEDS = Math.max(1, parsePositiveInt(process.env.RSS_FETCH_MAX_FEEDS, 12));
const CRYPTO_PROXY_ALLOW_REMOTE = parseBool(process.env.CRYPTO_PROXY_ALLOW_REMOTE);
const CRYPTO_PROXY_TIMEOUT_MS = Math.max(1500, parsePositiveInt(process.env.CRYPTO_PROXY_TIMEOUT_MS, 10000));
const GAS_PROXY_ALLOW_REMOTE = parseBool(process.env.GAS_PROXY_ALLOW_REMOTE);
const GAS_PROXY_TIMEOUT_MS = Math.max(1500, parsePositiveInt(process.env.GAS_PROXY_TIMEOUT_MS, 10000));
const SYS_MONITOR_ALLOW_REMOTE = parseBool(process.env.SYS_MONITOR_ALLOW_REMOTE);
const SYS_MONITOR_TIMEOUT_MS = Math.max(1000, parsePositiveInt(process.env.SYS_MONITOR_TIMEOUT_MS, 1500));
const SYS_MONITOR_MAX_PROCESSES = Math.max(10, parsePositiveInt(process.env.SYS_MONITOR_MAX_PROCESSES, 120));
const SPEED_TEST_ALLOW_REMOTE = parseBool(process.env.SPEED_TEST_ALLOW_REMOTE);
const SPEED_TEST_TIMEOUT_MS = Math.max(3000, parsePositiveInt(process.env.SPEED_TEST_TIMEOUT_MS, 30000));
const HOME_DEVICE_ALLOW_REMOTE = parseBool(process.env.HOME_DEVICE_ALLOW_REMOTE);
const HOME_DEVICE_TIMEOUT_MS = Math.max(1000, parsePositiveInt(process.env.HOME_DEVICE_TIMEOUT_MS, 2500));

const META_GRAPH_API_VERSION = String(process.env.META_GRAPH_API_VERSION || 'v22.0').trim() || 'v22.0';
const META_GRAPH_PAGE_ID = String(process.env.META_GRAPH_PAGE_ID || '').trim();
const META_GRAPH_PAGE_ACCESS_TOKEN = String(process.env.META_GRAPH_PAGE_ACCESS_TOKEN || '').trim();
const META_GRAPH_POLL_INTERVAL_MS = Math.max(60_000, parsePositiveInt(process.env.META_GRAPH_POLL_INTERVAL_MS, 60_000));
const META_GRAPH_TIMEOUT_MS = Math.max(1000, parsePositiveInt(process.env.META_GRAPH_TIMEOUT_MS, 8000));
const META_GRAPH_MAX_RETRIES = Math.max(1, parsePositiveInt(process.env.META_GRAPH_MAX_RETRIES, 3));
const META_GRAPH_BACKOFF_BASE_MS = Math.max(200, parsePositiveInt(process.env.META_GRAPH_BACKOFF_BASE_MS, 1000));
const META_GRAPH_BACKOFF_MAX_MS = Math.max(META_GRAPH_BACKOFF_BASE_MS, parsePositiveInt(process.env.META_GRAPH_BACKOFF_MAX_MS, 15000));
const META_GRAPH_STALE_AFTER_MS = Math.max(60_000, parsePositiveInt(process.env.META_GRAPH_STALE_AFTER_MS, 180000));
const META_GRAPH_CRITICAL_STALE_AFTER_MS = Math.max(META_GRAPH_STALE_AFTER_MS, parsePositiveInt(process.env.META_GRAPH_CRITICAL_STALE_AFTER_MS, 900000));
const META_GRAPH_ALLOW_REMOTE = parseBool(process.env.META_GRAPH_ALLOW_REMOTE);
const FACEBOOK_PAGE_URL = String(process.env.FACEBOOK_PAGE_URL || 'https://www.facebook.com/blastfromtheads').trim() || 'https://www.facebook.com/blastfromtheads';
const FACEBOOK_FOLLOWERS_PATH = path.join(DATA_DIR, 'facebook-followers.json');
const FACEBOOK_FOLLOWERS_LOG_PATH = path.join(ROOT, 'logs', 'facebook-followers-poller.log');
const FACEBOOK_FOLLOWERS_HISTORY_LIMIT = 1440;
const INSTAGRAM_PROFILE_HANDLE = String(process.env.INSTAGRAM_PROFILE_HANDLE || 'ablastfromtheads').trim().replace(/^@+/, '');
const INSTAGRAM_PROFILE_NAME = String(process.env.INSTAGRAM_PROFILE_NAME || 'Blast From The Ads').trim() || 'Blast From The Ads';
const INSTAGRAM_PROFILE_URL = String(process.env.INSTAGRAM_PROFILE_URL || ('https://www.instagram.com/' + INSTAGRAM_PROFILE_HANDLE + '/')).trim() || ('https://www.instagram.com/' + INSTAGRAM_PROFILE_HANDLE + '/');
const INSTAGRAM_FOLLOWERS_COUNT = parsePositiveInt(process.env.INSTAGRAM_FOLLOWERS_COUNT, NaN);
const INSTAGRAM_FOLLOWERS_PATH = path.join(DATA_DIR, 'instagram-followers.json');
const INSTAGRAM_FOLLOWERS_LOG_PATH = path.join(ROOT, 'logs', 'instagram-followers-poller.log');
const INSTAGRAM_FOLLOWERS_HISTORY_LIMIT = 1440;
const INSTAGRAM_POLL_INTERVAL_MS = Math.max(60_000, parsePositiveInt(process.env.INSTAGRAM_POLL_INTERVAL_MS, 180_000));
const INSTAGRAM_PROVIDER = String(process.env.INSTAGRAM_PROVIDER || 'auto').trim().toLowerCase() || 'auto';
const INSTAGRAM_META_SUITE_SCRIPT_PATH = path.resolve(ROOT, String(process.env.INSTAGRAM_META_SUITE_SCRIPT_PATH || path.join('scripts', 'instagram-meta-suite-scraper.mjs')).trim() || path.join('scripts', 'instagram-meta-suite-scraper.mjs'));
const INSTAGRAM_META_SUITE_STORAGE_PATH = path.resolve(ROOT, String(process.env.INSTAGRAM_META_SUITE_STORAGE_PATH || path.join('data', '.auth', 'meta-suite-instagram-storage.json')).trim() || path.join('data', '.auth', 'meta-suite-instagram-storage.json'));
const INSTAGRAM_META_SUITE_URL = String(process.env.INSTAGRAM_META_SUITE_URL || 'https://business.facebook.com/latest/insights').trim() || 'https://business.facebook.com/latest/insights';
const INSTAGRAM_META_SUITE_TIMEOUT_MS = Math.max(5_000, parsePositiveInt(process.env.INSTAGRAM_META_SUITE_TIMEOUT_MS, 45_000));
const INSTAGRAM_META_SUITE_HEADLESS = !parseBool(process.env.INSTAGRAM_META_SUITE_HEADFUL);
const TIKTOK_PROFILE_HANDLE = String(process.env.TIKTOK_PROFILE_HANDLE || 'ablastfromtheads').trim().replace(/^@+/, '');
const TIKTOK_PROFILE_NAME = String(process.env.TIKTOK_PROFILE_NAME || 'Blast From The Ads').trim() || 'Blast From The Ads';
const TIKTOK_PROFILE_URL = String(process.env.TIKTOK_PROFILE_URL || ('https://www.tiktok.com/@' + TIKTOK_PROFILE_HANDLE)).trim() || ('https://www.tiktok.com/@' + TIKTOK_PROFILE_HANDLE);
const TIKTOK_FOLLOWERS_COUNT = parsePositiveInt(process.env.TIKTOK_FOLLOWERS_COUNT, NaN);
const TIKTOK_FOLLOWERS_PATH = path.join(DATA_DIR, 'tiktok-followers.json');
const TIKTOK_FOLLOWERS_LOG_PATH = path.join(ROOT, 'logs', 'tiktok-followers-poller.log');
const TIKTOK_FOLLOWERS_HISTORY_LIMIT = 1440;
const TIKTOK_POLL_INTERVAL_MS = Math.max(60_000, parsePositiveInt(process.env.TIKTOK_POLL_INTERVAL_MS, 180_000));
const YOUTUBE_CHANNEL_URL = String(process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@Blastfromtheads').trim() || 'https://www.youtube.com/@Blastfromtheads';
const YOUTUBE_CHANNEL_NAME = String(process.env.YOUTUBE_CHANNEL_NAME || 'Blast From The Ads').trim() || 'Blast From The Ads';
const YOUTUBE_SUBSCRIBERS_COUNT = parsePositiveInt(process.env.YOUTUBE_SUBSCRIBERS_COUNT, NaN);
const YOUTUBE_SUBSCRIBERS_PATH = path.join(DATA_DIR, 'youtube-subscribers.json');
const YOUTUBE_SUBSCRIBERS_LOG_PATH = path.join(ROOT, 'logs', 'youtube-subscribers-poller.log');
const YOUTUBE_SUBSCRIBERS_HISTORY_LIMIT = 1440;
const YOUTUBE_POLL_INTERVAL_MS = Math.max(60_000, parsePositiveInt(process.env.YOUTUBE_POLL_INTERVAL_MS, 180_000));

let facebookFollowersState = {
  schemaVersion: 1,
  page: { id: META_GRAPH_PAGE_ID || '', name: '' },
  latest: null,
  status: { ok: false, lastSuccessAt: '', lastAttemptAt: '', consecutiveFailures: 0, lastError: '' },
  history: [],
  updatedAt: '',
};
let facebookFollowersPollTimer = null;
let facebookFollowersPollInFlight = null;

let instagramFollowersState = {
  schemaVersion: 1,
  profile: { handle: INSTAGRAM_PROFILE_HANDLE, name: INSTAGRAM_PROFILE_NAME },
  latest: null,
  status: { ok: false, lastSuccessAt: '', lastAttemptAt: '', consecutiveFailures: 0, lastError: '' },
  history: [],
  updatedAt: '',
};
let instagramFollowersPollTimer = null;
let instagramFollowersPollInFlight = null;

let tiktokFollowersState = {
  schemaVersion: 1,
  profile: { handle: TIKTOK_PROFILE_HANDLE, name: TIKTOK_PROFILE_NAME, url: TIKTOK_PROFILE_URL },
  latest: null,
  status: { ok: false, setupRequired: !TIKTOK_PROFILE_URL, lastSuccessAt: '', lastAttemptAt: '', consecutiveFailures: 0, lastError: '' },
  history: [],
  updatedAt: '',
};
let tiktokFollowersPollTimer = null;
let tiktokFollowersPollInFlight = null;

let youtubeSubscribersState = {
  schemaVersion: 1,
  channel: { name: YOUTUBE_CHANNEL_NAME, url: YOUTUBE_CHANNEL_URL },
  latest: null,
  status: { ok: false, setupRequired: !YOUTUBE_CHANNEL_URL, lastSuccessAt: '', lastAttemptAt: '', consecutiveFailures: 0, lastError: '' },
  history: [],
  updatedAt: '',
};
let youtubeSubscribersPollTimer = null;
let youtubeSubscribersPollInFlight = null;

function classifyFacebookFollowerStaleLevel(lastSuccessAt){
  const ts = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  if (!Number.isFinite(ts)) return { stale: true, staleLevel: 'critical', ageMs: null };
  const ageMs = Math.max(0, Date.now() - ts);
  if (ageMs < META_GRAPH_STALE_AFTER_MS) return { stale: false, staleLevel: 'fresh', ageMs };
  if (ageMs < META_GRAPH_CRITICAL_STALE_AFTER_MS) return { stale: true, staleLevel: 'stale', ageMs };
  return { stale: true, staleLevel: 'critical', ageMs };
}

function ensureFacebookFollowersShape(input){
  const base = input && typeof input === 'object' ? input : {};
  const latest = base.latest && typeof base.latest === 'object' ? {
    followersCount: Number.isFinite(Number(base.latest.followersCount)) ? Number(base.latest.followersCount) : null,
    fanCount: Number.isFinite(Number(base.latest.fanCount)) ? Number(base.latest.fanCount) : null,
    fetchedAt: String(base.latest.fetchedAt || ''),
    source: String(base.latest.source || 'graph_api'),
    requestId: String(base.latest.requestId || ''),
    latencyMs: Number.isFinite(Number(base.latest.latencyMs)) ? Math.max(0, Number(base.latest.latencyMs)) : null,
    stale: !!base.latest.stale,
  } : null;
  const historyRaw = Array.isArray(base.history) ? base.history : [];
  return {
    schemaVersion: 1,
    page: { id: String(base?.page?.id || META_GRAPH_PAGE_ID || '').trim(), name: String(base?.page?.name || '').trim() },
    latest,
    status: {
      ok: !!base?.status?.ok,
      lastSuccessAt: String(base?.status?.lastSuccessAt || ''),
      lastAttemptAt: String(base?.status?.lastAttemptAt || ''),
      consecutiveFailures: Number.isFinite(Number(base?.status?.consecutiveFailures)) ? Math.max(0, Math.floor(Number(base.status.consecutiveFailures))) : 0,
      lastError: String(base?.status?.lastError || '').slice(0, 280),
    },
    history: historyRaw.map((h) => ({ followersCount: Number.isFinite(Number(h?.followersCount)) ? Number(h.followersCount) : null, fetchedAt: String(h?.fetchedAt || '') }))
      .filter((h) => Number.isFinite(h.followersCount) && h.fetchedAt)
      .slice(-FACEBOOK_FOLLOWERS_HISTORY_LIMIT),
    updatedAt: String(base.updatedAt || ''),
  };
}

async function persistFacebookFollowersState(){
  await ensureDataDir();
  const body = JSON.stringify(ensureFacebookFollowersShape(facebookFollowersState), null, 2);
  const tmpPath = FACEBOOK_FOLLOWERS_PATH + '.tmp';
  await fsp.writeFile(tmpPath, body, 'utf8');
  await fsp.rename(tmpPath, FACEBOOK_FOLLOWERS_PATH);
}

async function loadFacebookFollowersState(){
  try {
    const raw = await fsp.readFile(FACEBOOK_FOLLOWERS_PATH, 'utf8');
    const parsed = parseJsonSafely(raw, 'facebook_followers_state');
    if (!parsed.ok) return;
    facebookFollowersState = ensureFacebookFollowersShape(parsed.value);
  } catch {}
}

async function appendFacebookFollowersLog(event){
  try {
    await fsp.mkdir(path.dirname(FACEBOOK_FOLLOWERS_LOG_PATH), { recursive: true });
    await fsp.appendFile(FACEBOOK_FOLLOWERS_LOG_PATH, JSON.stringify(event) + '\n', 'utf8');
  } catch {}
}

function getFacebookReasonCode(status, errorMessage){
  if (status === 401 || status === 403) return 'meta_auth_failed';
  if (status === 429) return 'meta_rate_limited';
  if ([500, 502, 503, 504].includes(status)) return 'meta_upstream_unavailable';
  if (errorMessage && /timeout|abort/i.test(errorMessage)) return 'meta_timeout';
  return 'meta_fetch_failed';
}

function parseCompactCount(value){
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return null;
  const m = raw.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = String(m[2] || '').toLowerCase();
  const mult = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : suffix === 'b' ? 1_000_000_000 : 1;
  return Math.round(base * mult);
}

function calculateFollowerDelta(history = [], latestCount = null){
  const latest = Number.isFinite(Number(latestCount)) ? Number(latestCount) : null;
  if (!Number.isFinite(latest)) return null;
  const records = (Array.isArray(history) ? history : []).filter((h) => Number.isFinite(Number(h?.followersCount)));
  if (!records.length) return 0;
  const prev = Number(records.length > 1 ? records[records.length - 2].followersCount : records[records.length - 1].followersCount);
  if (!Number.isFinite(prev)) return null;
  return latest - prev;
}

function calculateFollowerRollingDelta(history = [], latestCount = null, latestFetchedAt = '', windowMs = 0){
  const latest = Number.isFinite(Number(latestCount)) ? Number(latestCount) : null;
  const window = Number.isFinite(Number(windowMs)) ? Number(windowMs) : 0;
  if (!Number.isFinite(latest) || window <= 0) return null;

  const records = (Array.isArray(history) ? history : [])
    .map((h) => ({ followersCount: Number(h?.followersCount), ts: Date.parse(String(h?.fetchedAt || '')) }))
    .filter((h) => Number.isFinite(h.followersCount) && Number.isFinite(h.ts))
    .sort((a, b) => a.ts - b.ts);

  if (!records.length) return null;

  const latestTsParsed = Date.parse(String(latestFetchedAt || ''));
  const latestTs = Number.isFinite(latestTsParsed) ? latestTsParsed : records[records.length - 1].ts;
  if (!Number.isFinite(latestTs)) return null;

  const windowStart = latestTs - window;
  let baseline = null;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (records[i].ts <= windowStart) {
      baseline = records[i];
      break;
    }
  }
  if (!baseline || !Number.isFinite(baseline.followersCount)) return null;
  return latest - baseline.followersCount;
}

function extractFacebookPublicFollowerEstimate(html){
  const text = String(html || '');
  if (!text) return { count: null, signal: '' };
  const candidates = [];
  const push = (raw, signal) => {
    const compact = parseCompactCount(String(raw || '').replace(/,/g, ''));
    if (!Number.isFinite(compact) || compact <= 0) return;
    candidates.push({ count: compact, signal });
  };
  const patterns = [
    { signal: 'followers_count_json', rx: /"followers_count"\s*[:=]\s*"?([0-9][0-9,.]*\s*[kKmMbB]?)"?/g },
    { signal: 'fan_count_json', rx: /"fan_count"\s*[:=]\s*"?([0-9][0-9,.]*\s*[kKmMbB]?)"?/g },
    { signal: 'followers_text', rx: /([0-9][0-9,.]*\s*[kKmMbB]?)\s*(?:followers|people\s+follow\s+this)/gi },
    { signal: 'likes_text', rx: /([0-9][0-9,.]*\s*[kKmMbB]?)\s*likes?/gi },
    { signal: 'followers_text_reverse', rx: /(?:followers|people\s+follow\s+this)\D{0,24}([0-9][0-9,.]*\s*[kKmMbB]?)/gi },
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.rx.exec(text)) !== null) push(m[1], p.signal);
  }
  if (!candidates.length) return { count: null, signal: '' };
  candidates.sort((a, b) => b.count - a.count);
  return candidates[0];
}

function extractInstagramPublicFollowerEstimate(html){
  const text = String(html || '');
  if (!text) return { count: null, signal: '' };
  const candidates = [];
  const push = (raw, signal) => {
    const compact = parseCompactCount(String(raw || '').replace(/,/g, ''));
    if (!Number.isFinite(compact) || compact <= 0) return;
    candidates.push({ count: compact, signal });
  };

  let m;
  const jsonLdRx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = jsonLdRx.exec(text)) !== null) {
    const parsed = parseJsonSafely(m[1], 'instagram_ld_json');
    if (!parsed.ok) continue;
    const items = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
    for (const item of items) {
      const count = item?.mainEntityofPage?.interactionStatistic?.userInteractionCount
        ?? item?.mainEntityofPage?.interactionStatistic?.[0]?.userInteractionCount
        ?? item?.interactionStatistic?.userInteractionCount
        ?? item?.interactionStatistic?.[0]?.userInteractionCount;
      if (Number.isFinite(Number(count))) push(String(count), 'ld_json_interactionStatistic');
    }
  }

  const patterns = [
    { signal: 'og_description_followers', rx: /<meta\s+property=["']og:description["']\s+content=["'][^"']*?([0-9][0-9,.]*\s*[kKmMbB]?)\s+Followers\b/i },
    { signal: 'followers_count_json', rx: /"edge_followed_by"\s*:\s*\{[^}]*"count"\s*:\s*([0-9][0-9,.]*)/g },
    { signal: 'followers_count_alt_json', rx: /"followers_count"\s*[:=]\s*"?([0-9][0-9,.]*\s*[kKmMbB]?)"?/g },
    { signal: 'followers_text', rx: /([0-9][0-9,.]*\s*[kKmMbB]?)\s*followers\b/gi },
    { signal: 'followers_text_reverse', rx: /followers\D{0,20}([0-9][0-9,.]*\s*[kKmMbB]?)/gi },
  ];
  for (const p of patterns) {
    if (!p.rx.global) {
      const single = text.match(p.rx);
      if (single && single[1]) push(single[1], p.signal);
      continue;
    }
    while ((m = p.rx.exec(text)) !== null) push(m[1], p.signal);
  }

  if (!candidates.length) return { count: null, signal: '' };
  candidates.sort((a, b) => b.count - a.count);
  return candidates[0];
}

function extractTikTokPublicFollowerEstimate(html){
  const text = String(html || '');
  if (!text) return { count: null, signal: '' };
  const candidates = [];
  const push = (raw, signal) => {
    const compact = parseCompactCount(String(raw || '').replace(/,/g, ''));
    if (!Number.isFinite(compact) || compact <= 0) return;
    candidates.push({ count: compact, signal });
  };

  let m;
  const sigiRx = /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i;
  const sigiMatch = text.match(sigiRx);
  if (sigiMatch && sigiMatch[1]) {
    const parsed = parseJsonSafely(sigiMatch[1], 'tiktok_universal_data');
    const users = parsed.ok ? parsed.value?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo : null;
    const count = users?.stats?.followerCount;
    if (Number.isFinite(Number(count))) push(String(count), 'universal_data_userInfo_stats');
  }

  const jsonLdRx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = jsonLdRx.exec(text)) !== null) {
    const parsed = parseJsonSafely(m[1], 'tiktok_ld_json');
    if (!parsed.ok) continue;
    const item = parsed.value;
    const count = item?.interactionStatistic?.userInteractionCount ?? item?.interactionStatistic?.[0]?.userInteractionCount;
    if (Number.isFinite(Number(count))) push(String(count), 'ld_json_interactionStatistic');
  }

  const patterns = [
    { signal: 'meta_description_followers', rx: /<meta\s+name=["']description["']\s+content=["'][^"']*?([0-9][0-9,.]*\s*[kKmMbB]?)\s+Followers\b/i },
    { signal: 'followers_count_json', rx: /"followerCount"\s*[:=]\s*"?([0-9][0-9,.]*\s*[kKmMbB]?)"?/g },
    { signal: 'followers_text', rx: /([0-9][0-9,.]*\s*[kKmMbB]?)\s*followers\b/gi },
    { signal: 'followers_reverse_text', rx: /followers\D{0,24}([0-9][0-9,.]*\s*[kKmMbB]?)/gi },
  ];
  for (const p of patterns) {
    if (!p.rx.global) {
      const single = text.match(p.rx);
      if (single && single[1]) push(single[1], p.signal);
      continue;
    }
    while ((m = p.rx.exec(text)) !== null) push(m[1], p.signal);
  }

  if (!candidates.length) return { count: null, signal: '' };
  candidates.sort((a, b) => b.count - a.count);
  return candidates[0];
}

function extractYouTubePublicSubscriberEstimate(html){
  const text = String(html || '');
  if (!text) return { count: null, signal: '' };
  const candidates = [];
  const push = (raw, signal) => {
    const compact = parseCompactCount(String(raw || '').replace(/,/g, ''));
    if (!Number.isFinite(compact) || compact <= 0) return;
    candidates.push({ count: compact, signal });
  };

  let m;
  const ytInitialDataRx = /(?:var\s+ytInitialData\s*=\s*|window\[["']ytInitialData["']\]\s*=\s*)(\{[\s\S]*?\});<\/script>/i;
  const ytInitialMatch = text.match(ytInitialDataRx);
  if (ytInitialMatch && ytInitialMatch[1]) {
    const parsed = parseJsonSafely(ytInitialMatch[1], 'youtube_initial_data');
    if (parsed.ok) {
      const blob = JSON.stringify(parsed.value);
      const rx = /"subscriberCountText"\s*:\s*\{[\s\S]*?"simpleText"\s*:\s*"([^"]+)"/gi;
      while ((m = rx.exec(blob)) !== null) push(String(m[1]).replace(/\s*subscribers?\b/i, ''), 'yt_initial_data_subscriberCountText');
    }
  }

  const ytInitialPlayerResponseRx = /(?:var\s+ytInitialPlayerResponse\s*=\s*)(\{[\s\S]*?\});<\/script>/i;
  const playerMatch = text.match(ytInitialPlayerResponseRx);
  if (playerMatch && playerMatch[1]) {
    const parsed = parseJsonSafely(playerMatch[1], 'youtube_initial_player_response');
    if (parsed.ok) {
      const blob = JSON.stringify(parsed.value);
      const rx = /"subscriberCountText"\s*:\s*\{[\s\S]*?"simpleText"\s*:\s*"([^"]+)"/gi;
      while ((m = rx.exec(blob)) !== null) push(String(m[1]).replace(/\s*subscribers?\b/i, ''), 'yt_initial_player_subscriberCountText');
    }
  }

  const patterns = [
    { signal: 'meta_og_description_subscribers', rx: /<meta\s+property=["']og:description["']\s+content=["'][^"']*?([0-9][0-9,.]*\s*[kKmMbB]?)\s+subscribers?\b/i },
    { signal: 'subscriber_count_json', rx: /"subscriberCountText"\s*:\s*\{[\s\S]*?"simpleText"\s*:\s*"([^"]+?)"/gi },
    { signal: 'subscriber_count_label_json', rx: /"subscriberCountText"\s*:\s*\{[\s\S]*?"label"\s*:\s*"([^"]+?)"/gi },
    { signal: 'subscribers_text', rx: /([0-9][0-9,.]*\s*[kKmMbB]?)\s*subscribers?\b/gi }
  ];

  for (const p of patterns) {
    if (!p.rx.global) {
      const single = text.match(p.rx);
      if (single && single[1]) push(single[1], p.signal);
      continue;
    }
    while ((m = p.rx.exec(text)) !== null) push(String(m[1]).replace(/\s*subscribers?\b/i, ''), p.signal);
  }

  if (!candidates.length) return { count: null, signal: '' };
  const priority = {
    yt_initial_data_subscriberCountText: 1,
    yt_initial_player_subscriberCountText: 1,
    subscriber_count_json: 2,
    subscriber_count_label_json: 3,
    meta_og_description_subscribers: 4,
    subscribers_text: 5,
  };
  candidates.sort((a, b) => {
    const pa = priority[a.signal] ?? 99;
    const pb = priority[b.signal] ?? 99;
    if (pa !== pb) return pa - pb;
    return b.count - a.count;
  });
  return candidates[0];
}

async function delay(ms){ return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchTextViaCurl(url, timeoutMs = 12000){
  return await new Promise((resolve, reject) => {
    const seconds = Math.max(3, Math.ceil(Number(timeoutMs || 12000) / 1000));
    const args = ['-L', '-sS', '--max-time', String(seconds), '--compressed', '-A', 'Mozilla/5.0 MissionControlLite/1.0 (+facebook-followers-fallback)', url];
    execFile('curl', args, { maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const message = String((stderr || err.message || 'curl_fetch_failed')).trim();
        return reject(Object.assign(new Error(message), { httpStatus: 502 }));
      }
      resolve(String(stdout || ''));
    });
  });
}

async function fetchInstagramWebProfileInfo(handle, timeoutMs = META_GRAPH_TIMEOUT_MS){
  const cleanHandle = String(handle || INSTAGRAM_PROFILE_HANDLE || '').trim().replace(/^@+/, '');
  if (!cleanHandle) throw Object.assign(new Error('instagram_handle_missing'), { httpStatus: 400 });

  const endpoint = 'https://i.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(cleanHandle);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || META_GRAPH_TIMEOUT_MS)));

  try {
    const res = await fetch(endpoint, {
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'origin': 'https://www.instagram.com',
        'referer': 'https://www.instagram.com/' + cleanHandle + '/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'x-ig-app-id': '936619743392459',
        'x-requested-with': 'XMLHttpRequest',
      },
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      const err = new Error('instagram_web_profile_info_http_' + res.status);
      err.httpStatus = Number(res.status || 502);
      err.responseBody = String(text || '').slice(0, 240);
      throw err;
    }

    const parsed = parseJsonSafely(text, 'instagram_web_profile_info');
    if (!parsed.ok) throw Object.assign(new Error('instagram_web_profile_info_invalid_json'), { httpStatus: 502 });

    const user = parsed.value?.data?.user;
    const countRaw = user?.edge_followed_by?.count ?? user?.follower_count ?? user?.followers_count;
    const count = Number.isFinite(Number(countRaw)) ? Number(countRaw) : null;
    if (!Number.isFinite(count) || count <= 0) throw Object.assign(new Error('instagram_web_profile_info_followers_missing'), { httpStatus: 502 });

    return {
      count,
      profileName: String(user?.full_name || user?.username || '').trim(),
      signal: user?.edge_followed_by?.count != null ? 'edge_followed_by_count' : (user?.follower_count != null ? 'follower_count' : 'followers_count'),
      endpoint,
    };
  } catch (err) {
    if (String(err?.name || '').toLowerCase() === 'aborterror') {
      throw Object.assign(new Error('instagram_web_profile_info_timeout'), { httpStatus: 504 });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchInstagramFollowersViaMetaSuite({ handle, timeoutMs = INSTAGRAM_META_SUITE_TIMEOUT_MS } = {}) {
  const scriptArgs = [
    INSTAGRAM_META_SUITE_SCRIPT_PATH,
    '--handle', String(handle || '').trim().replace(/^@+/, ''),
    '--url', INSTAGRAM_META_SUITE_URL,
    '--storage', INSTAGRAM_META_SUITE_STORAGE_PATH,
    '--timeout-ms', String(Math.max(5000, Number(timeoutMs) || INSTAGRAM_META_SUITE_TIMEOUT_MS)),
    '--headless', INSTAGRAM_META_SUITE_HEADLESS ? '1' : '0',
  ];

  const result = await execFileSafe('node', scriptArgs, {
    timeout: Math.max(10_000, Number(timeoutMs) + 5_000),
    maxBuffer: 1024 * 1024,
  });

  if (!result.ok) {
    const stderrSnippet = String(result.stderr || '').trim().slice(0, 280);
    const stdoutSnippet = String(result.stdout || '').trim().slice(0, 280);
    const msg = stderrSnippet || stdoutSnippet || String(result.error?.message || 'meta_suite_script_exec_failed');
    const err = new Error('meta_suite_exec_failed: ' + msg);
    err.httpStatus = /timed out/i.test(msg) ? 504 : 502;
    throw err;
  }

  const parsed = parseJsonSafely(result.stdout, 'instagram_meta_suite_scraper');
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
    throw Object.assign(new Error('meta_suite_invalid_json_output'), { httpStatus: 502 });
  }

  if (!parsed.value.ok) {
    const reason = String(parsed.value.reason || parsed.value.error || 'meta_suite_failed');
    const err = new Error(reason);
    err.httpStatus = reason === 'meta_suite_setup_required' ? 428 : 502;
    err.setupRequired = reason === 'meta_suite_setup_required';
    err.details = parsed.value;
    throw err;
  }

  const count = Number(parsed.value.followersCount);
  if (!Number.isFinite(count) || count <= 0) {
    throw Object.assign(new Error('meta_suite_followers_missing'), { httpStatus: 502 });
  }

  return {
    count,
    profileName: String(parsed.value.profileName || '').trim(),
    signal: String(parsed.value.signal || ''),
    provider: String(parsed.value.provider || 'meta_suite_playwright').trim() || 'meta_suite_playwright',
  };
}

function facebookFollowerResponsePayload(opts = {}){
  const successTs = facebookFollowersState.status.lastSuccessAt || facebookFollowersState.latest?.fetchedAt || '';
  const freshness = classifyFacebookFollowerStaleLevel(successTs);
  return {
    ok: !!facebookFollowersState.latest,
    page: { ...facebookFollowersState.page },
    latest: facebookFollowersState.latest ? {
      followersCount: facebookFollowersState.latest.followersCount,
      fanCount: facebookFollowersState.latest.fanCount,
      fetchedAt: facebookFollowersState.latest.fetchedAt,
      source: facebookFollowersState.latest.source || 'meta_graph',
      delta: calculateFollowerDelta(facebookFollowersState.history, facebookFollowersState.latest.followersCount),
      rollingDelta1h: calculateFollowerRollingDelta(facebookFollowersState.history, facebookFollowersState.latest.followersCount, facebookFollowersState.latest.fetchedAt, 60 * 60 * 1000),
      rollingDelta24h: calculateFollowerRollingDelta(facebookFollowersState.history, facebookFollowersState.latest.followersCount, facebookFollowersState.latest.fetchedAt, 24 * 60 * 60 * 1000),
    } : null,
    status: {
      stale: freshness.stale,
      staleLevel: freshness.staleLevel,
      ageMs: freshness.ageMs,
      lastSuccessAt: facebookFollowersState.status.lastSuccessAt || '',
      lastAttemptAt: facebookFollowersState.status.lastAttemptAt || '',
      consecutiveFailures: facebookFollowersState.status.consecutiveFailures || 0,
      lastError: facebookFollowersState.status.lastError || '',
    },
    history: opts.includeHistory === false ? [] : facebookFollowersState.history,
  };
}

async function pollFacebookFollowers({ source = 'interval' } = {}){
  if (facebookFollowersPollInFlight) return facebookFollowersPollInFlight;

  const run = (async () => {
    const requestId = 'fbf_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
    const startedAt = Date.now();
    const attempts = Math.max(1, META_GRAPH_MAX_RETRIES);
    const graphEnabled = !!(META_GRAPH_PAGE_ID && META_GRAPH_PAGE_ACCESS_TOKEN);

    let httpStatus = 0;
    let lastErr = '';
    let graphErrorReason = graphEnabled ? '' : 'facebook_followers_graph_disabled_missing_meta_graph_config';

    if (graphEnabled) {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        facebookFollowersState.status.lastAttemptAt = new Date().toISOString();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), META_GRAPH_TIMEOUT_MS);
        try {
          const endpoint = 'https://graph.facebook.com/' + encodeURIComponent(META_GRAPH_API_VERSION) + '/' + encodeURIComponent(META_GRAPH_PAGE_ID) + '?fields=followers_count,fan_count,name&access_token=' + encodeURIComponent(META_GRAPH_PAGE_ACCESS_TOKEN);
          const res = await fetch(endpoint, { method: 'GET', signal: controller.signal, headers: { 'Accept': 'application/json' } });
          httpStatus = Number(res.status || 0);
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            const detail = body?.error?.message || ('HTTP ' + res.status);
            throw Object.assign(new Error(detail), { httpStatus: res.status, retryAfter: res.headers.get('retry-after') || '' });
          }
          const followersCount = Number.isFinite(Number(body?.followers_count)) ? Number(body.followers_count) : null;
          const fanCount = Number.isFinite(Number(body?.fan_count)) ? Number(body.fan_count) : null;
          const resolvedCount = Number.isFinite(followersCount) ? followersCount : fanCount;
          if (!Number.isFinite(resolvedCount)) throw Object.assign(new Error('followers_count_missing'), { httpStatus: 502 });
          const fetchedAt = new Date().toISOString();
          const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
          const latencyMs = Math.max(0, Date.now() - startedAt);
          facebookFollowersState.page = { id: META_GRAPH_PAGE_ID, name: String(body?.name || facebookFollowersState.page?.name || '').trim() };
          facebookFollowersState.latest = { followersCount: resolvedCount, fanCount, fetchedAt, source: 'graph_api', requestId, latencyMs, stale };
          facebookFollowersState.status = { ok: true, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: '' };
          facebookFollowersState.history.push({ followersCount: resolvedCount, fetchedAt });
          if (facebookFollowersState.history.length > FACEBOOK_FOLLOWERS_HISTORY_LIMIT) facebookFollowersState.history = facebookFollowersState.history.slice(-FACEBOOK_FOLLOWERS_HISTORY_LIMIT);
          facebookFollowersState.updatedAt = new Date().toISOString();
          await persistFacebookFollowersState();
          await appendFacebookFollowersLog({ ts: new Date().toISOString(), event: 'facebook_followers_poll', ok: true, source, requestId, attempt, retries: attempt - 1, httpStatus, latencyMs, followersCount: resolvedCount, provider: 'graph_api', ageMs: 0, error: '' });
          return facebookFollowerResponsePayload();
        } catch (err) {
          const message = String(err?.message || err || 'poll_failed').slice(0, 220);
          const status = Number(err?.httpStatus || 0);
          httpStatus = status || httpStatus;
          lastErr = message;
          graphErrorReason = (getFacebookReasonCode(httpStatus, lastErr) + ': ' + lastErr).slice(0, 280);
          const transient = [408, 425, 429, 500, 502, 503, 504].includes(status) || /abort|timeout/i.test(message);
          if (attempt >= attempts || !transient) break;
          let delayMs = Math.min(META_GRAPH_BACKOFF_BASE_MS * (2 ** (attempt - 1)), META_GRAPH_BACKOFF_MAX_MS);
          const retryAfter = Number(err?.retryAfter || 0);
          if (Number.isFinite(retryAfter) && retryAfter > 0) delayMs = Math.max(delayMs, retryAfter * 1000);
          await delay(delayMs);
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    facebookFollowersState.status.lastAttemptAt = new Date().toISOString();
    const scrapeController = new AbortController();
    const scrapeTimeout = setTimeout(() => scrapeController.abort(), META_GRAPH_TIMEOUT_MS);
    try {
      const pageUrl = FACEBOOK_PAGE_URL;
      const pluginUrl = 'https://www.facebook.com/plugins/page.php?href=' + encodeURIComponent(pageUrl) + '&tabs=timeline&width=340&height=130&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true&appId';
      const candidates = [pluginUrl, pageUrl];
      let html = '';
      for (const url of candidates) {
        let body = '';
        try {
          body = await fetchTextViaCurl(url, META_GRAPH_TIMEOUT_MS);
          httpStatus = 200;
        } catch (err) {
          httpStatus = Number(err?.httpStatus || 0) || 502;
          continue;
        }
        const parsedTry = extractFacebookPublicFollowerEstimate(body);
        if (Number.isFinite(parsedTry.count)) {
          html = body;
          break;
        }
      }
      if (!html) throw Object.assign(new Error('public_follower_signal_not_found'), { httpStatus: httpStatus || 502 });
      const parsed = extractFacebookPublicFollowerEstimate(html);
      if (!Number.isFinite(parsed.count)) throw Object.assign(new Error('public_follower_signal_not_found'), { httpStatus: 502 });
      const fetchedAt = new Date().toISOString();
      const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
      const latencyMs = Math.max(0, Date.now() - startedAt);
      const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || html.match(/<title>([^<]+)<\/title>/i);
      const derivedName = String(titleMatch?.[1] || '').trim();
      facebookFollowersState.page = {
        id: facebookFollowersState.page?.id || META_GRAPH_PAGE_ID || FACEBOOK_PAGE_URL,
        name: derivedName || facebookFollowersState.page?.name || ''
      };
      facebookFollowersState.latest = { followersCount: parsed.count, fanCount: null, fetchedAt, source: 'public_scrape_estimate', requestId, latencyMs, stale };
      facebookFollowersState.status = { ok: true, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: graphErrorReason ? ('graph_unavailable_using_fallback: ' + graphErrorReason).slice(0, 280) : '' };
      facebookFollowersState.history.push({ followersCount: parsed.count, fetchedAt });
      if (facebookFollowersState.history.length > FACEBOOK_FOLLOWERS_HISTORY_LIMIT) facebookFollowersState.history = facebookFollowersState.history.slice(-FACEBOOK_FOLLOWERS_HISTORY_LIMIT);
      facebookFollowersState.updatedAt = new Date().toISOString();
      await persistFacebookFollowersState();
      await appendFacebookFollowersLog({ ts: new Date().toISOString(), event: 'facebook_followers_poll', ok: true, source, requestId, httpStatus, latencyMs, followersCount: parsed.count, provider: 'public_scrape_estimate', ageMs: 0, error: graphErrorReason || '', signal: parsed.signal || '' });
      return facebookFollowerResponsePayload();
    } catch (err) {
      const message = String(err?.message || err || 'public_scrape_failed').slice(0, 220);
      const status = Number(err?.httpStatus || 0);
      httpStatus = status || httpStatus;
      const publicReason = ((status === 401 || status === 403) ? 'public_scrape_blocked' : /not_found/i.test(message) ? 'public_signal_not_found' : /abort|timeout/i.test(message) ? 'public_scrape_timeout' : 'public_scrape_failed') + ': ' + message;
      facebookFollowersState.status.ok = false;
      facebookFollowersState.status.consecutiveFailures = (facebookFollowersState.status.consecutiveFailures || 0) + 1;
      facebookFollowersState.status.lastError = (graphErrorReason ? (graphErrorReason + ' | ') : '') + publicReason;
      facebookFollowersState.status.lastError = facebookFollowersState.status.lastError.slice(0, 280);
      facebookFollowersState.updatedAt = new Date().toISOString();
      await persistFacebookFollowersState();
      const freshness = classifyFacebookFollowerStaleLevel(facebookFollowersState.status.lastSuccessAt || '');
      await appendFacebookFollowersLog({ ts: new Date().toISOString(), event: 'facebook_followers_poll', ok: false, source, requestId, httpStatus, latencyMs: Math.max(0, Date.now() - startedAt), followersCount: facebookFollowersState.latest?.followersCount ?? null, ageMs: freshness.ageMs, provider: 'public_scrape_estimate', error: facebookFollowersState.status.lastError });
      return facebookFollowerResponsePayload();
    } finally {
      clearTimeout(scrapeTimeout);
    }
  })();

  facebookFollowersPollInFlight = run;
  try { return await run; } finally { facebookFollowersPollInFlight = null; }
}

async function initFacebookFollowersService(){
  await loadFacebookFollowersState();
  await pollFacebookFollowers({ source: 'startup_bootstrap' });
  if (facebookFollowersPollTimer) clearInterval(facebookFollowersPollTimer);
  facebookFollowersPollTimer = setInterval(() => {
    pollFacebookFollowers({ source: 'interval' }).catch(() => {});
  }, META_GRAPH_POLL_INTERVAL_MS);
}

async function handleApiFacebookFollowers(req, res) {
  const pathname = new URL(req.url || '/api/facebook-followers', 'http://localhost:' + PORT).pathname;
  if (!META_GRAPH_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: 'local_only', message: 'Facebook followers endpoint is local-only by default. Set META_GRAPH_ALLOW_REMOTE=1 to allow remote requests.' });
  }
  if (pathname === '/api/facebook-followers/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/facebook-followers/refresh.' });
    let source = 'manual';
    try {
      const reqUrl = new URL(req.url || '/api/facebook-followers/refresh', 'http://localhost:' + PORT);
      source = String(reqUrl.searchParams.get('source') || '').trim() || source;
      const bodyRaw = await readBody(req);
      if (bodyRaw) {
        const parsed = parseJsonSafely(bodyRaw, 'facebook_followers_refresh_body');
        if (parsed.ok && parsed.value && typeof parsed.value === 'object' && parsed.value.source) source = String(parsed.value.source).trim();
      }
    } catch {}
    const payload = await pollFacebookFollowers({ source: source || 'manual' });
    return sendJson(res, payload.ok ? 200 : 503, payload);
  }
  if (pathname === '/api/facebook-followers/health') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/facebook-followers/health.' });
    return sendJson(res, 200, { ok: true, status: facebookFollowerResponsePayload({ includeHistory: false }).status, page: facebookFollowersState.page });
  }
  if (pathname !== '/api/facebook-followers') return sendJson(res, 404, { ok: false, error: 'not_found' });
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/facebook-followers.' });
  return sendJson(res, 200, facebookFollowerResponsePayload());
}



function ensureInstagramFollowersShape(input){
  const base = input && typeof input === 'object' ? input : {};
  const latest = base.latest && typeof base.latest === 'object' ? {
    followersCount: Number.isFinite(Number(base.latest.followersCount)) ? Number(base.latest.followersCount) : null,
    fetchedAt: String(base.latest.fetchedAt || ''),
    source: String(base.latest.source || 'placeholder_env'),
    requestId: String(base.latest.requestId || ''),
    latencyMs: Number.isFinite(Number(base.latest.latencyMs)) ? Math.max(0, Number(base.latest.latencyMs)) : null,
    stale: !!base.latest.stale,
  } : null;
  const historyRaw = Array.isArray(base.history) ? base.history : [];
  return {
    schemaVersion: 1,
    profile: {
      handle: String(base?.profile?.handle || INSTAGRAM_PROFILE_HANDLE || '').trim().replace(/^@+/, ''),
      name: String(base?.profile?.name || INSTAGRAM_PROFILE_NAME || '').trim(),
    },
    latest,
    status: {
      ok: !!base?.status?.ok,
      lastSuccessAt: String(base?.status?.lastSuccessAt || ''),
      lastAttemptAt: String(base?.status?.lastAttemptAt || ''),
      consecutiveFailures: Number.isFinite(Number(base?.status?.consecutiveFailures)) ? Math.max(0, Math.floor(Number(base.status.consecutiveFailures))) : 0,
      lastError: String(base?.status?.lastError || '').slice(0, 280),
    },
    history: historyRaw.map((h) => ({ followersCount: Number.isFinite(Number(h?.followersCount)) ? Number(h.followersCount) : null, fetchedAt: String(h?.fetchedAt || '') }))
      .filter((h) => Number.isFinite(h.followersCount) && h.fetchedAt)
      .slice(-INSTAGRAM_FOLLOWERS_HISTORY_LIMIT),
    updatedAt: String(base.updatedAt || ''),
  };
}

async function persistInstagramFollowersState(){
  await ensureDataDir();
  const body = JSON.stringify(ensureInstagramFollowersShape(instagramFollowersState), null, 2);
  const tmpPath = INSTAGRAM_FOLLOWERS_PATH + '.tmp';
  await fsp.writeFile(tmpPath, body, 'utf8');
  await fsp.rename(tmpPath, INSTAGRAM_FOLLOWERS_PATH);
}

async function loadInstagramFollowersState(){
  try {
    const raw = await fsp.readFile(INSTAGRAM_FOLLOWERS_PATH, 'utf8');
    const parsed = parseJsonSafely(raw, 'instagram_followers_state');
    if (!parsed.ok) return;
    instagramFollowersState = ensureInstagramFollowersShape(parsed.value);
  } catch {}
}

async function appendInstagramFollowersLog(event){
  try {
    await fsp.mkdir(path.dirname(INSTAGRAM_FOLLOWERS_LOG_PATH), { recursive: true });
    await fsp.appendFile(INSTAGRAM_FOLLOWERS_LOG_PATH, JSON.stringify(event) + '\n', 'utf8');
  } catch {}
}

function instagramFollowerResponsePayload(opts = {}){
  const successTs = instagramFollowersState.status.lastSuccessAt || instagramFollowersState.latest?.fetchedAt || '';
  const freshness = classifyFacebookFollowerStaleLevel(successTs);
  return {
    ok: !!instagramFollowersState.latest,
    profile: { ...instagramFollowersState.profile },
    latest: instagramFollowersState.latest ? {
      followersCount: instagramFollowersState.latest.followersCount,
      fetchedAt: instagramFollowersState.latest.fetchedAt,
      source: instagramFollowersState.latest.source || 'placeholder_env',
      delta: calculateFollowerDelta(instagramFollowersState.history, instagramFollowersState.latest.followersCount),
      rollingDelta1h: calculateFollowerRollingDelta(instagramFollowersState.history, instagramFollowersState.latest.followersCount, instagramFollowersState.latest.fetchedAt, 60 * 60 * 1000),
      rollingDelta24h: calculateFollowerRollingDelta(instagramFollowersState.history, instagramFollowersState.latest.followersCount, instagramFollowersState.latest.fetchedAt, 24 * 60 * 60 * 1000),
    } : null,
    status: {
      stale: freshness.stale,
      staleLevel: freshness.staleLevel,
      ageMs: freshness.ageMs,
      lastSuccessAt: instagramFollowersState.status.lastSuccessAt || '',
      lastAttemptAt: instagramFollowersState.status.lastAttemptAt || '',
      consecutiveFailures: instagramFollowersState.status.consecutiveFailures || 0,
      lastError: instagramFollowersState.status.lastError || '',
    },
    history: opts.includeHistory === false ? [] : instagramFollowersState.history,
  };
}

async function pollInstagramFollowers({ source = 'interval', followersCount } = {}){
  if (instagramFollowersPollInFlight) return instagramFollowersPollInFlight;
  const run = (async () => {
    const requestId = 'igf_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
    const startedAt = Date.now();
    instagramFollowersState.status.lastAttemptAt = new Date().toISOString();

    const providedRaw = Number.isFinite(Number(followersCount)) ? Number(followersCount) : null;
    const providedCount = Number.isFinite(providedRaw) && providedRaw > 0 ? providedRaw : null;
    if (Number.isFinite(providedCount)) {
      const fetchedAt = new Date().toISOString();
      instagramFollowersState.latest = { followersCount: providedCount, fetchedAt, source: 'manual_refresh', requestId, latencyMs: 0, stale: false };
      instagramFollowersState.status = { ok: true, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: '' };
      instagramFollowersState.history.push({ followersCount: providedCount, fetchedAt });
      if (instagramFollowersState.history.length > INSTAGRAM_FOLLOWERS_HISTORY_LIMIT) instagramFollowersState.history = instagramFollowersState.history.slice(-INSTAGRAM_FOLLOWERS_HISTORY_LIMIT);
      instagramFollowersState.updatedAt = new Date().toISOString();
      await persistInstagramFollowersState();
      await appendInstagramFollowersLog({ ts: new Date().toISOString(), event: 'instagram_followers_poll', ok: true, source, requestId, followersCount: providedCount, delta: calculateFollowerDelta(instagramFollowersState.history, providedCount), provider: 'manual_refresh' });
      return instagramFollowerResponsePayload();
    }

    const profileUrl = INSTAGRAM_PROFILE_URL;
    const handle = (instagramFollowersState.profile.handle || INSTAGRAM_PROFILE_HANDLE || '').replace(/^@+/, '');
    let parsed = { count: null, signal: '' };
    let primaryReason = '';
    let secondaryReason = '';
    const mode = INSTAGRAM_PROVIDER;

    if (mode === 'meta_suite' || mode === 'auto') {
      try {
        const meta = await fetchInstagramFollowersViaMetaSuite({ handle, timeoutMs: INSTAGRAM_META_SUITE_TIMEOUT_MS });
        const previousKnown = Number.isFinite(Number(instagramFollowersState.latest?.followersCount)) ? Number(instagramFollowersState.latest.followersCount) : null;
        const envKnown = Number.isFinite(Number(INSTAGRAM_FOLLOWERS_COUNT)) ? Number(INSTAGRAM_FOLLOWERS_COUNT) : null;
        const recentReference = instagramFollowersState.history
          .slice(-24)
          .map((h) => (Number.isFinite(Number(h?.followersCount)) ? Number(h.followersCount) : null))
          .filter((v) => Number.isFinite(v) && v > 0)
          .sort((a, b) => b - a)[0] ?? null;
        const referenceCount = [previousKnown, envKnown, recentReference]
          .filter((v) => Number.isFinite(v) && v > 0)
          .sort((a, b) => b - a)[0] ?? null;
        if (Number.isFinite(referenceCount) && referenceCount > 0) {
          const minAllowed = Math.floor(referenceCount * 0.75);
          const maxAllowed = Math.ceil(referenceCount * 1.5);
          if (meta.count < minAllowed || meta.count > maxAllowed) {
            throw Object.assign(new Error('instagram_meta_count_outlier_' + meta.count + '_expected_near_' + referenceCount), { httpStatus: 502 });
          }
        }

        const fetchedAt = new Date().toISOString();
        const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
        const latencyMs = Math.max(0, Date.now() - startedAt);

        if (meta.profileName) instagramFollowersState.profile.name = meta.profileName;
        instagramFollowersState.profile.handle = handle;
        instagramFollowersState.latest = { followersCount: meta.count, fetchedAt, source: meta.provider, requestId, latencyMs, stale };
        instagramFollowersState.status = { ok: true, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: '' };
        instagramFollowersState.history.push({ followersCount: meta.count, fetchedAt });
        if (instagramFollowersState.history.length > INSTAGRAM_FOLLOWERS_HISTORY_LIMIT) instagramFollowersState.history = instagramFollowersState.history.slice(-INSTAGRAM_FOLLOWERS_HISTORY_LIMIT);
        instagramFollowersState.updatedAt = new Date().toISOString();
        await persistInstagramFollowersState();
        await appendInstagramFollowersLog({ ts: new Date().toISOString(), event: 'instagram_followers_poll', ok: true, source, requestId, followersCount: meta.count, delta: calculateFollowerDelta(instagramFollowersState.history, meta.count), provider: meta.provider, signal: meta.signal || '', latencyMs, mode });
        return instagramFollowerResponsePayload();
      } catch (err) {
        const status = Number(err?.httpStatus || 0);
        const message = String(err?.message || err || 'meta_suite_failed').slice(0, 220);
        primaryReason = ((status === 428 || err?.setupRequired) ? 'meta_suite_setup_required' : /abort|timeout|timed out/i.test(message) ? 'meta_suite_timeout' : 'meta_suite_failed') + ': ' + message;
        if (mode === 'meta_suite') secondaryReason = 'mode_meta_suite_no_secondary_provider';
      }
    }

    if (!secondaryReason && (mode === 'public' || mode === 'auto' || mode === 'meta_suite')) {
      try {
        const html = await fetchTextViaCurl(profileUrl, META_GRAPH_TIMEOUT_MS);
        parsed = extractInstagramPublicFollowerEstimate(html);
        if (!Number.isFinite(parsed.count)) throw Object.assign(new Error('instagram_public_follower_signal_not_found'), { httpStatus: 502 });
        const previousKnown = Number.isFinite(Number(instagramFollowersState.latest?.followersCount)) ? Number(instagramFollowersState.latest.followersCount) : null;
        const envKnown = Number.isFinite(Number(INSTAGRAM_FOLLOWERS_COUNT)) ? Number(INSTAGRAM_FOLLOWERS_COUNT) : null;
        const recentReference = instagramFollowersState.history
          .slice(-24)
          .map((h) => (Number.isFinite(Number(h?.followersCount)) ? Number(h.followersCount) : null))
          .filter((v) => Number.isFinite(v) && v > 0)
          .sort((a, b) => b - a)[0] ?? null;
        const referenceCount = [previousKnown, envKnown, recentReference]
          .filter((v) => Number.isFinite(v) && v > 0)
          .sort((a, b) => b - a)[0] ?? null;
        if (Number.isFinite(referenceCount) && referenceCount > 0) {
          const minAllowed = Math.floor(referenceCount * 0.75);
          const maxAllowed = Math.ceil(referenceCount * 1.5);
          if (parsed.count < minAllowed || parsed.count > maxAllowed) {
            throw Object.assign(new Error('instagram_public_count_outlier_' + parsed.count + '_expected_near_' + referenceCount), { httpStatus: 502 });
          }
        }

        const fetchedAt = new Date().toISOString();
        const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
        const latencyMs = Math.max(0, Date.now() - startedAt);
        const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || html.match(/<title>([^<]+)<\/title>/i);
        const derivedName = String(titleMatch?.[1] || '').replace(/\s*\(@[^)]+\)\s*$/, '').trim();
        if (derivedName) instagramFollowersState.profile.name = derivedName;
        instagramFollowersState.profile.handle = handle;
        instagramFollowersState.latest = { followersCount: parsed.count, fetchedAt, source: 'instagram_public_scrape_estimate', requestId, latencyMs, stale };
        instagramFollowersState.status = { ok: true, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: primaryReason.slice(0, 280) };
        instagramFollowersState.history.push({ followersCount: parsed.count, fetchedAt });
        if (instagramFollowersState.history.length > INSTAGRAM_FOLLOWERS_HISTORY_LIMIT) instagramFollowersState.history = instagramFollowersState.history.slice(-INSTAGRAM_FOLLOWERS_HISTORY_LIMIT);
        instagramFollowersState.updatedAt = new Date().toISOString();
        await persistInstagramFollowersState();
        await appendInstagramFollowersLog({ ts: new Date().toISOString(), event: 'instagram_followers_poll', ok: true, source, requestId, followersCount: parsed.count, delta: calculateFollowerDelta(instagramFollowersState.history, parsed.count), provider: 'instagram_public_scrape_estimate', signal: parsed.signal || '', latencyMs, fallbackFrom: primaryReason || '', mode });
        return instagramFollowerResponsePayload();
      } catch (err) {
        const status = Number(err?.httpStatus || 0);
        const message = String(err?.message || err || 'instagram_public_scrape_failed').slice(0, 220);
        secondaryReason = ((status === 401 || status === 403) ? 'instagram_public_scrape_blocked' : /not_found/i.test(message) ? 'instagram_public_signal_not_found' : /abort|timeout/i.test(message) ? 'instagram_public_scrape_timeout' : 'instagram_public_scrape_failed') + ': ' + message;
      }
    }

    const chainReason = [primaryReason, secondaryReason].filter(Boolean).join(' | ').slice(0, 280);
    const envCountRaw = Number.isFinite(Number(INSTAGRAM_FOLLOWERS_COUNT)) ? Number(INSTAGRAM_FOLLOWERS_COUNT) : null;
    const envCount = Number.isFinite(envCountRaw) && envCountRaw > 0 ? envCountRaw : null;

    if (!instagramFollowersState.latest && Number.isFinite(envCount)) {
      const fetchedAt = new Date().toISOString();
      instagramFollowersState.latest = { followersCount: envCount, fetchedAt, source: 'placeholder_env', requestId, latencyMs: Math.max(0, Date.now() - startedAt), stale: false };
      instagramFollowersState.status = {
        ok: true,
        lastSuccessAt: fetchedAt,
        lastAttemptAt: fetchedAt,
        consecutiveFailures: 0,
        lastError: ('provider_chain_unavailable_using_placeholder: ' + chainReason).slice(0, 280),
      };
      instagramFollowersState.history.push({ followersCount: envCount, fetchedAt });
      if (instagramFollowersState.history.length > INSTAGRAM_FOLLOWERS_HISTORY_LIMIT) instagramFollowersState.history = instagramFollowersState.history.slice(-INSTAGRAM_FOLLOWERS_HISTORY_LIMIT);
    } else {
      instagramFollowersState.status.ok = false;
      instagramFollowersState.status.lastAttemptAt = new Date().toISOString();
      instagramFollowersState.status.consecutiveFailures = (instagramFollowersState.status.consecutiveFailures || 0) + 1;
      instagramFollowersState.status.lastError = ('instagram_provider_chain_failed: ' + chainReason).slice(0, 280);
      if (instagramFollowersState.latest && Number.isFinite(Number(instagramFollowersState.latest.followersCount)) && Number(instagramFollowersState.latest.followersCount) > 0) {
        const envBaseline = Number.isFinite(Number(INSTAGRAM_FOLLOWERS_COUNT)) ? Number(INSTAGRAM_FOLLOWERS_COUNT) : null;
        const historyBaseline = instagramFollowersState.history
          .slice(-24)
          .map((h) => (Number.isFinite(Number(h?.followersCount)) ? Number(h.followersCount) : null))
          .filter((v) => Number.isFinite(v) && v > 0)
          .sort((a, b) => b - a)[0] ?? null;
        const baseline = [envBaseline, historyBaseline]
          .filter((v) => Number.isFinite(v) && v > 0)
          .sort((a, b) => b - a)[0] ?? null;
        if (Number.isFinite(baseline) && Number(instagramFollowersState.latest.followersCount) < Math.floor(baseline * 0.75)) {
          instagramFollowersState.latest.followersCount = baseline;
        }
        instagramFollowersState.latest.stale = true;
        instagramFollowersState.latest.source = 'last_known_fallback';
      }
    }

    instagramFollowersState.updatedAt = new Date().toISOString();
    await persistInstagramFollowersState();
    const freshness = classifyFacebookFollowerStaleLevel(instagramFollowersState.status.lastSuccessAt || '');
    await appendInstagramFollowersLog({ ts: new Date().toISOString(), event: 'instagram_followers_poll', ok: false, source, requestId, followersCount: instagramFollowersState.latest?.followersCount ?? null, ageMs: freshness.ageMs, provider: instagramFollowersState.latest?.source === 'last_known_fallback' ? 'last_known_fallback' : (Number.isFinite(envCount) ? 'placeholder_env' : 'instagram_provider_chain_failed'), error: instagramFollowersState.status.lastError, signal: parsed.signal || '', primaryReason, secondaryReason, mode });
    return instagramFollowerResponsePayload();
  })();

  instagramFollowersPollInFlight = run;
  try { return await run; } finally { instagramFollowersPollInFlight = null; }
}

async function initInstagramFollowersService(){
  await loadInstagramFollowersState();
  await pollInstagramFollowers({ source: 'startup_bootstrap' });
  if (instagramFollowersPollTimer) clearInterval(instagramFollowersPollTimer);
  instagramFollowersPollTimer = setInterval(() => {
    pollInstagramFollowers({ source: 'interval' }).catch(() => {});
  }, INSTAGRAM_POLL_INTERVAL_MS);
}

async function handleApiInstagramFollowers(req, res) {
  const pathname = new URL(req.url || '/api/instagram-followers', 'http://localhost:' + PORT).pathname;
  if (!META_GRAPH_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: 'local_only', message: 'Instagram followers endpoint is local-only by default. Set META_GRAPH_ALLOW_REMOTE=1 to allow remote requests.' });
  }
  if (pathname === '/api/instagram-followers/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/instagram-followers/refresh.' });
    let source = 'manual';
    let followersCount = null;
    try {
      const reqUrl = new URL(req.url || '/api/instagram-followers/refresh', 'http://localhost:' + PORT);
      source = String(reqUrl.searchParams.get('source') || '').trim() || source;
      const bodyRaw = await readBody(req);
      if (bodyRaw) {
        const parsed = parseJsonSafely(bodyRaw, 'instagram_followers_refresh_body');
        if (parsed.ok && parsed.value && typeof parsed.value === 'object') {
          if (parsed.value.source) source = String(parsed.value.source).trim();
          if (Number.isFinite(Number(parsed.value.followersCount)) && Number(parsed.value.followersCount) > 0) {
            followersCount = Number(parsed.value.followersCount);
          }
        }
      }
    } catch {}
    const payload = await pollInstagramFollowers({ source: source || 'manual', followersCount });
    return sendJson(res, payload.ok ? 200 : 503, payload);
  }
  if (pathname === '/api/instagram-followers/health') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/instagram-followers/health.' });
    return sendJson(res, 200, { ok: true, status: instagramFollowerResponsePayload({ includeHistory: false }).status, profile: instagramFollowersState.profile });
  }
  if (pathname !== '/api/instagram-followers') return sendJson(res, 404, { ok: false, error: 'not_found' });
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/instagram-followers.' });
  return sendJson(res, 200, instagramFollowerResponsePayload());
}

function ensureTikTokFollowersShape(input){
  const base = input && typeof input === 'object' ? input : {};
  const latest = base.latest && typeof base.latest === 'object' ? {
    followersCount: Number.isFinite(Number(base.latest.followersCount)) ? Number(base.latest.followersCount) : null,
    fetchedAt: String(base.latest.fetchedAt || ''),
    source: String(base.latest.source || 'tiktok_public_scrape_estimate'),
    requestId: String(base.latest.requestId || ''),
    latencyMs: Number.isFinite(Number(base.latest.latencyMs)) ? Math.max(0, Number(base.latest.latencyMs)) : null,
    stale: !!base.latest.stale,
  } : null;
  const historyRaw = Array.isArray(base.history) ? base.history : [];
  const profileHandle = String(base?.profile?.handle || TIKTOK_PROFILE_HANDLE || '').trim().replace(/^@+/, '');
  const profileUrl = String(base?.profile?.url || TIKTOK_PROFILE_URL || (profileHandle ? ('https://www.tiktok.com/@' + profileHandle) : '')).trim();
  return {
    schemaVersion: 1,
    profile: {
      handle: profileHandle,
      name: String(base?.profile?.name || TIKTOK_PROFILE_NAME || '').trim(),
      url: profileUrl,
    },
    latest,
    status: {
      ok: !!base?.status?.ok,
      setupRequired: !!base?.status?.setupRequired,
      lastSuccessAt: String(base?.status?.lastSuccessAt || ''),
      lastAttemptAt: String(base?.status?.lastAttemptAt || ''),
      consecutiveFailures: Number.isFinite(Number(base?.status?.consecutiveFailures)) ? Math.max(0, Math.floor(Number(base.status.consecutiveFailures))) : 0,
      lastError: String(base?.status?.lastError || '').slice(0, 280),
    },
    history: historyRaw.map((h) => ({ followersCount: Number.isFinite(Number(h?.followersCount)) ? Number(h.followersCount) : null, fetchedAt: String(h?.fetchedAt || '') }))
      .filter((h) => Number.isFinite(h.followersCount) && h.fetchedAt)
      .slice(-TIKTOK_FOLLOWERS_HISTORY_LIMIT),
    updatedAt: String(base.updatedAt || ''),
  };
}

async function persistTikTokFollowersState(){
  await ensureDataDir();
  const body = JSON.stringify(ensureTikTokFollowersShape(tiktokFollowersState), null, 2);
  const tmpPath = TIKTOK_FOLLOWERS_PATH + '.tmp';
  await fsp.writeFile(tmpPath, body, 'utf8');
  await fsp.rename(tmpPath, TIKTOK_FOLLOWERS_PATH);
}

async function loadTikTokFollowersState(){
  try {
    const raw = await fsp.readFile(TIKTOK_FOLLOWERS_PATH, 'utf8');
    const parsed = parseJsonSafely(raw, 'tiktok_followers_state');
    if (!parsed.ok) return;
    tiktokFollowersState = ensureTikTokFollowersShape(parsed.value);
  } catch {}
}

async function appendTikTokFollowersLog(event){
  try {
    await fsp.mkdir(path.dirname(TIKTOK_FOLLOWERS_LOG_PATH), { recursive: true });
    await fsp.appendFile(TIKTOK_FOLLOWERS_LOG_PATH, JSON.stringify(event) + '\n', 'utf8');
  } catch {}
}

function tiktokFollowerResponsePayload(opts = {}){
  const successTs = tiktokFollowersState.status.lastSuccessAt || tiktokFollowersState.latest?.fetchedAt || '';
  const freshness = classifyFacebookFollowerStaleLevel(successTs);
  return {
    ok: !!tiktokFollowersState.latest,
    profile: { ...tiktokFollowersState.profile },
    latest: tiktokFollowersState.latest ? {
      followersCount: tiktokFollowersState.latest.followersCount,
      fetchedAt: tiktokFollowersState.latest.fetchedAt,
      source: tiktokFollowersState.latest.source || 'tiktok_public_scrape_estimate',
      delta: calculateFollowerDelta(tiktokFollowersState.history, tiktokFollowersState.latest.followersCount),
    } : null,
    status: {
      stale: freshness.stale,
      staleLevel: freshness.staleLevel,
      ageMs: freshness.ageMs,
      setupRequired: !!tiktokFollowersState.status.setupRequired,
      lastSuccessAt: tiktokFollowersState.status.lastSuccessAt || '',
      lastAttemptAt: tiktokFollowersState.status.lastAttemptAt || '',
      consecutiveFailures: tiktokFollowersState.status.consecutiveFailures || 0,
      lastError: tiktokFollowersState.status.lastError || '',
    },
    history: opts.includeHistory === false ? [] : tiktokFollowersState.history,
  };
}

async function pollTikTokFollowers({ source = 'interval' } = {}){
  if (tiktokFollowersPollInFlight) return tiktokFollowersPollInFlight;
  const run = (async () => {
    const requestId = 'ttf_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
    const startedAt = Date.now();
    tiktokFollowersState.status.lastAttemptAt = new Date().toISOString();

    const profileHandle = String(tiktokFollowersState.profile.handle || TIKTOK_PROFILE_HANDLE || '').trim().replace(/^@+/, '');
    const profileUrl = String(tiktokFollowersState.profile.url || TIKTOK_PROFILE_URL || (profileHandle ? ('https://www.tiktok.com/@' + profileHandle) : '')).trim();

    if (!profileHandle || !profileUrl) {
      tiktokFollowersState.status.ok = false;
      tiktokFollowersState.status.setupRequired = true;
      tiktokFollowersState.status.consecutiveFailures = (tiktokFollowersState.status.consecutiveFailures || 0) + 1;
      tiktokFollowersState.status.lastError = 'setup_required: set TIKTOK_PROFILE_HANDLE and/or TIKTOK_PROFILE_URL';
      tiktokFollowersState.updatedAt = new Date().toISOString();
      await persistTikTokFollowersState();
      await appendTikTokFollowersLog({ ts: new Date().toISOString(), event: 'tiktok_followers_poll', ok: false, source, requestId, provider: 'setup_required', error: tiktokFollowersState.status.lastError });
      return tiktokFollowerResponsePayload();
    }

    try {
      const html = await fetchTextViaCurl(profileUrl, META_GRAPH_TIMEOUT_MS);
      const parsed = extractTikTokPublicFollowerEstimate(html);
      if (!Number.isFinite(parsed.count)) throw Object.assign(new Error('tiktok_public_follower_signal_not_found'), { httpStatus: 502 });

      const previousKnown = Number.isFinite(Number(tiktokFollowersState.latest?.followersCount)) ? Number(tiktokFollowersState.latest.followersCount) : null;
      const envKnown = Number.isFinite(Number(TIKTOK_FOLLOWERS_COUNT)) ? Number(TIKTOK_FOLLOWERS_COUNT) : null;
      const recentReference = tiktokFollowersState.history
        .slice(-24)
        .map((h) => (Number.isFinite(Number(h?.followersCount)) ? Number(h.followersCount) : null))
        .filter((v) => Number.isFinite(v) && v > 0)
        .sort((a, b) => b - a)[0] ?? null;
      const referenceCount = [previousKnown, envKnown, recentReference]
        .filter((v) => Number.isFinite(v) && v > 0)
        .sort((a, b) => b - a)[0] ?? null;
      if (Number.isFinite(referenceCount) && referenceCount > 0) {
        const minAllowed = Math.floor(referenceCount * 0.75);
        const maxAllowed = Math.ceil(referenceCount * 1.5);
        if (parsed.count < minAllowed || parsed.count > maxAllowed) {
          throw Object.assign(new Error('tiktok_public_count_outlier_' + parsed.count + '_expected_near_' + referenceCount), { httpStatus: 502 });
        }
      }

      const fetchedAt = new Date().toISOString();
      const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
      const latencyMs = Math.max(0, Date.now() - startedAt);
      tiktokFollowersState.profile.handle = profileHandle;
      tiktokFollowersState.profile.url = profileUrl;
      tiktokFollowersState.latest = { followersCount: parsed.count, fetchedAt, source: 'tiktok_public_scrape_estimate', requestId, latencyMs, stale };
      tiktokFollowersState.status = { ok: true, setupRequired: false, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: '' };
      tiktokFollowersState.history.push({ followersCount: parsed.count, fetchedAt });
      if (tiktokFollowersState.history.length > TIKTOK_FOLLOWERS_HISTORY_LIMIT) tiktokFollowersState.history = tiktokFollowersState.history.slice(-TIKTOK_FOLLOWERS_HISTORY_LIMIT);
      tiktokFollowersState.updatedAt = new Date().toISOString();
      await persistTikTokFollowersState();
      await appendTikTokFollowersLog({ ts: new Date().toISOString(), event: 'tiktok_followers_poll', ok: true, source, requestId, followersCount: parsed.count, delta: calculateFollowerDelta(tiktokFollowersState.history, parsed.count), provider: 'tiktok_public_scrape_estimate', signal: parsed.signal || '', latencyMs });
      return tiktokFollowerResponsePayload();
    } catch (err) {
      const status = Number(err?.httpStatus || 0);
      const message = String(err?.message || err || 'tiktok_public_scrape_failed').slice(0, 220);
      tiktokFollowersState.status.ok = false;
      tiktokFollowersState.status.setupRequired = false;
      tiktokFollowersState.status.lastAttemptAt = new Date().toISOString();
      tiktokFollowersState.status.consecutiveFailures = (tiktokFollowersState.status.consecutiveFailures || 0) + 1;
      tiktokFollowersState.status.lastError = (((status === 401 || status === 403) ? 'tiktok_public_scrape_blocked' : /not_found/i.test(message) ? 'tiktok_public_signal_not_found' : /abort|timeout/i.test(message) ? 'tiktok_public_scrape_timeout' : 'tiktok_public_scrape_failed') + ': ' + message).slice(0, 280);
      if (tiktokFollowersState.latest && Number.isFinite(Number(tiktokFollowersState.latest.followersCount)) && Number(tiktokFollowersState.latest.followersCount) > 0) {
        tiktokFollowersState.latest.stale = true;
        tiktokFollowersState.latest.source = 'last_known_fallback';
      }
      tiktokFollowersState.updatedAt = new Date().toISOString();
      await persistTikTokFollowersState();
      const freshness = classifyFacebookFollowerStaleLevel(tiktokFollowersState.status.lastSuccessAt || '');
      await appendTikTokFollowersLog({ ts: new Date().toISOString(), event: 'tiktok_followers_poll', ok: false, source, requestId, followersCount: tiktokFollowersState.latest?.followersCount ?? null, ageMs: freshness.ageMs, provider: tiktokFollowersState.latest?.source === 'last_known_fallback' ? 'last_known_fallback' : 'tiktok_public_scrape_estimate', error: tiktokFollowersState.status.lastError });
      return tiktokFollowerResponsePayload();
    }
  })();

  tiktokFollowersPollInFlight = run;
  try { return await run; } finally { tiktokFollowersPollInFlight = null; }
}

async function initTikTokFollowersService(){
  await loadTikTokFollowersState();
  await pollTikTokFollowers({ source: 'startup_bootstrap' });
  if (tiktokFollowersPollTimer) clearInterval(tiktokFollowersPollTimer);
  tiktokFollowersPollTimer = setInterval(() => {
    pollTikTokFollowers({ source: 'interval' }).catch(() => {});
  }, TIKTOK_POLL_INTERVAL_MS);
}

async function handleApiTikTokFollowers(req, res) {
  const pathname = new URL(req.url || '/api/tiktok-followers', 'http://localhost:' + PORT).pathname;
  if (!META_GRAPH_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: 'local_only', message: 'TikTok followers endpoint is local-only by default. Set META_GRAPH_ALLOW_REMOTE=1 to allow remote requests.' });
  }
  if (pathname === '/api/tiktok-followers/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/tiktok-followers/refresh.' });
    let source = 'manual';
    try {
      const reqUrl = new URL(req.url || '/api/tiktok-followers/refresh', 'http://localhost:' + PORT);
      source = String(reqUrl.searchParams.get('source') || '').trim() || source;
    } catch {}
    const payload = await pollTikTokFollowers({ source: source || 'manual' });
    return sendJson(res, payload.ok ? 200 : 503, payload);
  }
  if (pathname === '/api/tiktok-followers/health') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/tiktok-followers/health.' });
    return sendJson(res, 200, { ok: true, status: tiktokFollowerResponsePayload({ includeHistory: false }).status, profile: tiktokFollowersState.profile });
  }
  if (pathname !== '/api/tiktok-followers') return sendJson(res, 404, { ok: false, error: 'not_found' });
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/tiktok-followers.' });
  return sendJson(res, 200, tiktokFollowerResponsePayload());
}

function ensureYoutubeSubscribersShape(input){
  const base = input && typeof input === 'object' ? input : {};
  const latest = base.latest && typeof base.latest === 'object' ? {
    subscribersCount: Number.isFinite(Number(base.latest.subscribersCount)) ? Number(base.latest.subscribersCount) : null,
    fetchedAt: String(base.latest.fetchedAt || ''),
    source: String(base.latest.source || 'youtube_public_scrape_estimate'),
    requestId: String(base.latest.requestId || ''),
    latencyMs: Number.isFinite(Number(base.latest.latencyMs)) ? Math.max(0, Number(base.latest.latencyMs)) : null,
    stale: !!base.latest.stale,
  } : null;
  const historyRaw = Array.isArray(base.history) ? base.history : [];
  return {
    schemaVersion: 1,
    channel: {
      name: String(base?.channel?.name || YOUTUBE_CHANNEL_NAME || '').trim(),
      url: String(base?.channel?.url || YOUTUBE_CHANNEL_URL || '').trim(),
    },
    latest,
    status: {
      ok: !!base?.status?.ok,
      setupRequired: !!base?.status?.setupRequired,
      lastSuccessAt: String(base?.status?.lastSuccessAt || ''),
      lastAttemptAt: String(base?.status?.lastAttemptAt || ''),
      consecutiveFailures: Number.isFinite(Number(base?.status?.consecutiveFailures)) ? Math.max(0, Math.floor(Number(base.status.consecutiveFailures))) : 0,
      lastError: String(base?.status?.lastError || '').slice(0, 280),
    },
    history: historyRaw.map((h) => ({ subscribersCount: Number.isFinite(Number(h?.subscribersCount)) ? Number(h.subscribersCount) : null, fetchedAt: String(h?.fetchedAt || '') }))
      .filter((h) => Number.isFinite(h.subscribersCount) && h.fetchedAt)
      .slice(-YOUTUBE_SUBSCRIBERS_HISTORY_LIMIT),
    updatedAt: String(base.updatedAt || ''),
  };
}

async function persistYoutubeSubscribersState(){
  await ensureDataDir();
  const body = JSON.stringify(ensureYoutubeSubscribersShape(youtubeSubscribersState), null, 2);
  const tmpPath = YOUTUBE_SUBSCRIBERS_PATH + '.tmp';
  await fsp.writeFile(tmpPath, body, 'utf8');
  await fsp.rename(tmpPath, YOUTUBE_SUBSCRIBERS_PATH);
}

async function loadYoutubeSubscribersState(){
  try {
    const raw = await fsp.readFile(YOUTUBE_SUBSCRIBERS_PATH, 'utf8');
    const parsed = parseJsonSafely(raw, 'youtube_subscribers_state');
    if (!parsed.ok) return;
    youtubeSubscribersState = ensureYoutubeSubscribersShape(parsed.value);
  } catch {}
}

async function appendYoutubeSubscribersLog(event){
  try {
    await fsp.mkdir(path.dirname(YOUTUBE_SUBSCRIBERS_LOG_PATH), { recursive: true });
    await fsp.appendFile(YOUTUBE_SUBSCRIBERS_LOG_PATH, JSON.stringify(event) + '\n', 'utf8');
  } catch {}
}

function calculateSubscriberDelta(history = [], latestCount = null){
  const latest = Number.isFinite(Number(latestCount)) ? Number(latestCount) : null;
  if (!Number.isFinite(latest)) return null;
  const records = (Array.isArray(history) ? history : []).filter((h) => Number.isFinite(Number(h?.subscribersCount)));
  if (!records.length) return 0;
  const prev = Number(records.length > 1 ? records[records.length - 2].subscribersCount : records[records.length - 1].subscribersCount);
  if (!Number.isFinite(prev)) return null;
  return latest - prev;
}

function youtubeSubscriberResponsePayload(opts = {}){
  const successTs = youtubeSubscribersState.status.lastSuccessAt || youtubeSubscribersState.latest?.fetchedAt || '';
  const freshness = classifyFacebookFollowerStaleLevel(successTs);
  return {
    ok: !!youtubeSubscribersState.latest,
    channel: { ...youtubeSubscribersState.channel },
    latest: youtubeSubscribersState.latest ? {
      subscribersCount: youtubeSubscribersState.latest.subscribersCount,
      fetchedAt: youtubeSubscribersState.latest.fetchedAt,
      source: youtubeSubscribersState.latest.source || 'youtube_public_scrape_estimate',
      delta: calculateSubscriberDelta(youtubeSubscribersState.history, youtubeSubscribersState.latest.subscribersCount),
    } : null,
    status: {
      stale: freshness.stale,
      staleLevel: freshness.staleLevel,
      ageMs: freshness.ageMs,
      setupRequired: !!youtubeSubscribersState.status.setupRequired,
      lastSuccessAt: youtubeSubscribersState.status.lastSuccessAt || '',
      lastAttemptAt: youtubeSubscribersState.status.lastAttemptAt || '',
      consecutiveFailures: youtubeSubscribersState.status.consecutiveFailures || 0,
      lastError: youtubeSubscribersState.status.lastError || '',
    },
    history: opts.includeHistory === false ? [] : youtubeSubscribersState.history,
  };
}

async function pollYoutubeSubscribers({ source = 'interval' } = {}){
  if (youtubeSubscribersPollInFlight) return youtubeSubscribersPollInFlight;
  const run = (async () => {
    const requestId = 'yts_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
    const startedAt = Date.now();
    youtubeSubscribersState.status.lastAttemptAt = new Date().toISOString();

    const channelUrl = String(youtubeSubscribersState.channel.url || YOUTUBE_CHANNEL_URL || '').trim();
    if (!channelUrl) {
      youtubeSubscribersState.status.ok = false;
      youtubeSubscribersState.status.setupRequired = true;
      youtubeSubscribersState.status.consecutiveFailures = (youtubeSubscribersState.status.consecutiveFailures || 0) + 1;
      youtubeSubscribersState.status.lastError = 'setup_required: set YOUTUBE_CHANNEL_URL';
      youtubeSubscribersState.updatedAt = new Date().toISOString();
      await persistYoutubeSubscribersState();
      await appendYoutubeSubscribersLog({ ts: new Date().toISOString(), event: 'youtube_subscribers_poll', ok: false, source, requestId, provider: 'setup_required', error: youtubeSubscribersState.status.lastError });
      return youtubeSubscriberResponsePayload();
    }

    try {
      const html = await fetchTextViaCurl(channelUrl, META_GRAPH_TIMEOUT_MS);
      const parsed = extractYouTubePublicSubscriberEstimate(html);
      if (!Number.isFinite(parsed.count)) throw Object.assign(new Error('youtube_public_subscriber_signal_not_found'), { httpStatus: 502 });


      const fetchedAt = new Date().toISOString();
      const latencyMs = Math.max(0, Date.now() - startedAt);
      const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
      youtubeSubscribersState.latest = { subscribersCount: parsed.count, fetchedAt, source: 'youtube_public_scrape_estimate', requestId, latencyMs, stale };
      youtubeSubscribersState.status = { ok: true, setupRequired: false, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: '' };
      youtubeSubscribersState.history.push({ subscribersCount: parsed.count, fetchedAt });
      if (youtubeSubscribersState.history.length > YOUTUBE_SUBSCRIBERS_HISTORY_LIMIT) youtubeSubscribersState.history = youtubeSubscribersState.history.slice(-YOUTUBE_SUBSCRIBERS_HISTORY_LIMIT);
      youtubeSubscribersState.updatedAt = new Date().toISOString();
      await persistYoutubeSubscribersState();
      await appendYoutubeSubscribersLog({ ts: new Date().toISOString(), event: 'youtube_subscribers_poll', ok: true, source, requestId, subscribersCount: parsed.count, delta: calculateSubscriberDelta(youtubeSubscribersState.history, parsed.count), provider: 'youtube_public_scrape_estimate', signal: parsed.signal || '', latencyMs });
      return youtubeSubscriberResponsePayload();
    } catch (err) {
      const status = Number(err?.httpStatus || 0);
      const message = String(err?.message || err || 'youtube_public_scrape_failed').slice(0, 220);
      youtubeSubscribersState.status.ok = false;
      youtubeSubscribersState.status.setupRequired = false;
      youtubeSubscribersState.status.lastAttemptAt = new Date().toISOString();
      youtubeSubscribersState.status.consecutiveFailures = (youtubeSubscribersState.status.consecutiveFailures || 0) + 1;
      youtubeSubscribersState.status.lastError = (((status === 401 || status === 403) ? 'youtube_public_scrape_blocked' : /not_found/i.test(message) ? 'youtube_public_signal_not_found' : /abort|timeout/i.test(message) ? 'youtube_public_scrape_timeout' : 'youtube_public_scrape_failed') + ': ' + message).slice(0, 280);
      if (youtubeSubscribersState.latest && Number.isFinite(Number(youtubeSubscribersState.latest.subscribersCount)) && Number(youtubeSubscribersState.latest.subscribersCount) > 0) {
        youtubeSubscribersState.latest.stale = true;
        youtubeSubscribersState.latest.source = 'last_known_fallback';
      }
      youtubeSubscribersState.updatedAt = new Date().toISOString();
      await persistYoutubeSubscribersState();
      const freshness = classifyFacebookFollowerStaleLevel(youtubeSubscribersState.status.lastSuccessAt || '');
      await appendYoutubeSubscribersLog({ ts: new Date().toISOString(), event: 'youtube_subscribers_poll', ok: false, source, requestId, subscribersCount: youtubeSubscribersState.latest?.subscribersCount ?? null, ageMs: freshness.ageMs, provider: youtubeSubscribersState.latest?.source === 'last_known_fallback' ? 'last_known_fallback' : 'youtube_public_scrape_estimate', error: youtubeSubscribersState.status.lastError });
      return youtubeSubscriberResponsePayload();
    }
  })();

  youtubeSubscribersPollInFlight = run;
  try { return await run; } finally { youtubeSubscribersPollInFlight = null; }
}

async function initYoutubeSubscribersService(){
  await loadYoutubeSubscribersState();
  await pollYoutubeSubscribers({ source: 'startup_bootstrap' });
  if (youtubeSubscribersPollTimer) clearInterval(youtubeSubscribersPollTimer);
  youtubeSubscribersPollTimer = setInterval(() => {
    pollYoutubeSubscribers({ source: 'interval' }).catch(() => {});
  }, YOUTUBE_POLL_INTERVAL_MS);
}

async function handleApiYoutubeSubscribers(req, res) {
  const pathname = new URL(req.url || '/api/youtube-subscribers', 'http://localhost:' + PORT).pathname;
  if (!META_GRAPH_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, { ok: false, error: 'local_only', message: 'YouTube subscribers endpoint is local-only by default. Set META_GRAPH_ALLOW_REMOTE=1 to allow remote requests.' });
  }
  if (pathname === '/api/youtube-subscribers/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/youtube-subscribers/refresh.' });
    let source = 'manual';
    try {
      const reqUrl = new URL(req.url || '/api/youtube-subscribers/refresh', 'http://localhost:' + PORT);
      source = String(reqUrl.searchParams.get('source') || '').trim() || source;
    } catch {}
    const payload = await pollYoutubeSubscribers({ source: source || 'manual' });
    return sendJson(res, payload.ok ? 200 : 503, payload);
  }
  if (pathname === '/api/youtube-subscribers/health') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/youtube-subscribers/health.' });
    return sendJson(res, 200, { ok: true, status: youtubeSubscriberResponsePayload({ includeHistory: false }).status, channel: youtubeSubscribersState.channel });
  }
  if (pathname !== '/api/youtube-subscribers') return sendJson(res, 404, { ok: false, error: 'not_found' });
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/youtube-subscribers.' });
  return sendJson(res, 200, youtubeSubscriberResponsePayload());
}

const DIARY_INDEX_ROOTS = [
  path.resolve(ROOT, '../taverncollectibles-v2/artifacts/reports'),
];
const DIARY_INDEX_ALLOWED_EXT = new Set(['.md', '.markdown']);
const DIARY_INDEX_FILE_PATTERN = /project-diary-entry/i;
const DIARY_INDEX_MAX_PREVIEW_LEN = 220;
let diaryIndexCache = {
  ok: true,
  generatedAt: null,
  datesWithEntries: [],
  entriesByDate: {},
  sourceStats: { scannedRoots: 0, scannedFiles: 0, includedEntries: 0, skippedEntries: 0 },
};

function parseAllowlistInput(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 30))];
}

function readNetTotals() {
  try {
    const raw = fs.readFileSync('/proc/net/dev', 'utf8');
    let rx = 0;
    let tx = 0;
    for (const line of raw.split(/\r?\n/).slice(2)) {
      if (!line.includes(':')) continue;
      const [, valuesRaw] = line.split(':');
      const cols = valuesRaw.trim().split(/\s+/);
      if (cols.length < 10) continue;
      const r = Number(cols[0]);
      const t = Number(cols[8]);
      if (Number.isFinite(r)) rx += r;
      if (Number.isFinite(t)) tx += t;
    }
    return { rxBytes: rx, txBytes: tx };
  } catch {
    return null;
  }
}

function readDiskUsagePercent() {
  return new Promise((resolve) => {
    execFile('df', ['-kP', '/'], { timeout: SYS_MONITOR_TIMEOUT_MS, maxBuffer: 512 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      const lines = String(stdout || '').trim().split(/\r?\n/);
      if (lines.length < 2) return resolve(null);
      const cols = lines[lines.length - 1].trim().split(/\s+/);
      const percentRaw = cols[4] || '';
      const percent = Number(String(percentRaw).replace('%', ''));
      resolve(Number.isFinite(percent) ? percent : null);
    });
  });
}

function readTopProcesses() {
  return new Promise((resolve) => {
    execFile(
      'ps',
      ['-eo', 'pid=,comm=,%cpu=,%mem=', '--sort=-%cpu'],
      { timeout: SYS_MONITOR_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([]);
        const rows = String(stdout || '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const parts = line.split(/\s+/);
            if (parts.length < 4) return null;
            const pid = Number(parts[0]);
            const name = String(parts[1] || '').trim();
            const cpu = Number(parts[2]);
            const mem = Number(parts[3]);
            if (!Number.isFinite(pid) || !name) return null;
            return {
              pid,
              name,
              cpuPercent: Number.isFinite(cpu) ? Math.max(0, cpu) : 0,
              memPercent: Number.isFinite(mem) ? Math.max(0, mem) : 0,
            };
          })
          .filter(Boolean)
          .slice(0, SYS_MONITOR_MAX_PROCESSES);
        resolve(rows);
      }
    );
  });
}

async function handleApiSystemResources(req, res) {
  if (!isLocalRequest(req) && !SYS_MONITOR_ALLOW_REMOTE) {
    return sendJson(res, 403, {
      ok: false,
      error: 'forbidden_remote',
      message: 'System monitor endpoint only accepts local requests.',
    });
  }

  const reqUrl = new URL(req.url || '/api/system-resources', `http://localhost:${PORT}`);
  const allowlist = parseAllowlistInput(reqUrl.searchParams.get('allowlist') || '');
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const netBefore = readNetTotals();
  const cpuBefore = os.cpus();

  await new Promise((r) => setTimeout(r, 250));

  const [diskPercent, processes] = await Promise.all([
    readDiskUsagePercent(),
    readTopProcesses(),
  ]);

  const cpuAfter = os.cpus();
  const netAfter = readNetTotals();

  let cpuPercent = null;
  if (Array.isArray(cpuBefore) && Array.isArray(cpuAfter) && cpuBefore.length && cpuBefore.length === cpuAfter.length) {
    let totalIdle = 0;
    let totalTick = 0;
    for (let i = 0; i < cpuBefore.length; i += 1) {
      const a = cpuBefore[i].times;
      const b = cpuAfter[i].times;
      const idle = Math.max(0, (b.idle || 0) - (a.idle || 0));
      const totalA = (a.user || 0) + (a.nice || 0) + (a.sys || 0) + (a.irq || 0) + (a.idle || 0);
      const totalB = (b.user || 0) + (b.nice || 0) + (b.sys || 0) + (b.irq || 0) + (b.idle || 0);
      totalIdle += idle;
      totalTick += Math.max(0, totalB - totalA);
    }
    if (totalTick > 0) cpuPercent = Math.max(0, Math.min(100, Number((((totalTick - totalIdle) / totalTick) * 100).toFixed(1))));
  }

  const memUsedPercent = memTotal > 0
    ? Math.max(0, Math.min(100, Number((((memTotal - memFree) / memTotal) * 100).toFixed(1))))
    : null;

  const topCpu = [...processes].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 3);
  const topMemory = [...processes].sort((a, b) => b.memPercent - a.memPercent).slice(0, 3);
  const allowlistMatches = allowlist.length
    ? processes.filter((proc) => allowlist.some((needle) => proc.name.toLowerCase().includes(needle))).slice(0, 8)
    : [];

  const netRx = (netBefore && netAfter) ? Math.max(0, netAfter.rxBytes - netBefore.rxBytes) : null;
  const netTx = (netBefore && netAfter) ? Math.max(0, netAfter.txBytes - netBefore.txBytes) : null;

  return sendJson(res, 200, {
    ok: true,
    sampledAt: new Date().toISOString(),
    host: {
      cpuPercent,
      memoryPercent: memUsedPercent,
      diskPercent,
      network: {
        downBytesPerSec: netRx != null ? Math.round(netRx * 4) : null,
        upBytesPerSec: netTx != null ? Math.round(netTx * 4) : null,
      },
      uptimeSec: Math.floor(os.uptime()),
    },
    processes: {
      scanned: processes.length,
      topCpu,
      topMemory,
      allowlist,
      allowlistMatches,
    },
  });
}

function isPrivateOrLocalHost(hostValue) {
  const host = String(hostValue || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^127./.test(host) || host === '::1') return true;
  if (/^10./.test(host)) return true;
  if (/^192.168./.test(host)) return true;
  if (/^172.(1[6-9]|2\d|3[0-1])./.test(host)) return true;
  return false;
}

function runExecFile(bin, args, timeoutMs = 2000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 512 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function handleApiHomeDevicePing(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/home-devices/ping.' });
  if (!isLocalRequest(req) && !HOME_DEVICE_ALLOW_REMOTE) {
    return sendJson(res, 403, { ok: false, error: 'forbidden_remote', message: 'Home-device endpoint only accepts local requests.' });
  }
  const bodyRaw = await readBody(req);
  const parsed = parseJsonSafely(bodyRaw || '{}', 'home_device_ping');
  if (!parsed.ok) return sendJson(res, 400, { ok: false, error: parsed.error, message: parsed.message });
  const host = String(parsed.value?.host || '').trim();
  if (!host) return sendJson(res, 400, { ok: false, error: 'missing_host', message: 'host is required.' });
  if (!isPrivateOrLocalHost(host)) return sendJson(res, 400, { ok: false, error: 'host_not_local', message: 'host must be local/private IP or .local hostname.' });

  const start = Date.now();
  const out = await runExecFile('ping', ['-c', '1', '-W', '1', host], HOME_DEVICE_TIMEOUT_MS);
  const latencyMs = Date.now() - start;
  if (out.ok) return sendJson(res, 200, { ok: true, reachable: true, host, latencyMs, message: 'Host reachable.' });
  return sendJson(res, 200, { ok: true, reachable: false, host, latencyMs: null, message: out.stderr || out.error?.message || 'Ping failed.' });
}

async function handleApiHomeDeviceWake(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/home-devices/wake.' });
  if (!isLocalRequest(req) && !HOME_DEVICE_ALLOW_REMOTE) {
    return sendJson(res, 403, { ok: false, error: 'forbidden_remote', message: 'Home-device endpoint only accepts local requests.' });
  }
  const bodyRaw = await readBody(req);
  const parsed = parseJsonSafely(bodyRaw || '{}', 'home_device_wake');
  if (!parsed.ok) return sendJson(res, 400, { ok: false, error: parsed.error, message: parsed.message });
  const macAddress = String(parsed.value?.macAddress || '').trim().replace(/-/g, ':').toUpperCase();
  const host = String(parsed.value?.host || '').trim();
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(macAddress)) {
    return sendJson(res, 400, { ok: false, error: 'invalid_mac', message: 'macAddress must be AA:BB:CC:DD:EE:FF.' });
  }
  if (host && !isPrivateOrLocalHost(host)) {
    return sendJson(res, 400, { ok: false, error: 'host_not_local', message: 'host must be local/private IP or .local hostname.' });
  }

  const attempts = [
    { tool: 'wakeonlan', args: [macAddress] },
    { tool: 'etherwake', args: [macAddress] },
  ];
  for (const attempt of attempts) {
    const out = await runExecFile(attempt.tool, attempt.args, HOME_DEVICE_TIMEOUT_MS);
    if (out.ok) return sendJson(res, 200, { ok: true, tool: attempt.tool, macAddress, message: 'Wake packet sent.' });
  }

  return sendJson(res, 503, { ok: false, error: 'wake_unavailable', message: 'No wake utility available (install wakeonlan or etherwake).' });
}

function parseJsonSafely(raw, sourceLabel = 'json') {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return {
      ok: false,
      error: `${sourceLabel}_json_parse_failed`,
      message: String(err?.message || err),
    };
  }
}

function fetchJsonViaCurl(upstreamUrl, timeoutMs = CRYPTO_PROXY_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timeoutSec = Math.max(2, Math.ceil(timeoutMs / 1000));
    execFile(
      'curl',
      ['-fsSL', '--max-time', String(timeoutSec), upstreamUrl],
      {
        timeout: timeoutMs + 1000,
        maxBuffer: 2 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          const details = String(stderr || err?.message || err).trim() || 'curl execution failed';
          return reject(new Error(details));
        }

        const parsed = parseJsonSafely(String(stdout || ''), 'curl');
        if (!parsed.ok) {
          return reject(new Error(parsed.message));
        }

        return resolve(parsed.value);
      }
    );
  });
}

function fetchTextViaCurl(upstreamUrl, timeoutMs = RSS_FETCH_TIMEOUT_MS, maxBytes = RSS_FETCH_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const timeoutSec = Math.max(2, Math.ceil(timeoutMs / 1000));
    execFile(
      'curl',
      ['-fsSL', '--max-time', String(timeoutSec), upstreamUrl],
      {
        timeout: timeoutMs + 1000,
        maxBuffer: maxBytes,
      },
      (err, stdout, stderr) => {
        if (err) {
          const details = String(stderr || err?.message || err).trim() || 'curl execution failed';
          return reject(new Error(details));
        }

        const text = String(stdout || '');
        if (Buffer.byteLength(text, 'utf8') > maxBytes) {
          return reject(new Error(`Feed too large (curl payload exceeded ${maxBytes} bytes)`));
        }

        return resolve(text);
      }
    );
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function ensureDataDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(BACKUPS_DIR, { recursive: true });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function isLoopbackAddress(value) {
  const address = String(value || '').replace(/^::ffff:/, '');
  return address === '127.0.0.1' || address === '::1' || address === 'localhost';
}

function isLocalRequest(req) {
  return isLoopbackAddress(req.socket?.remoteAddress);
}

function stateRichnessScore(state) {
  const arrLen = (v) => Array.isArray(v) ? v.length : 0;
  return (
    arrLen(state?.tasks) * 5 +
    arrLen(state?.notes) * 3 +
    arrLen(state?.ideas) * 2 +
    arrLen(state?.reminders) +
    arrLen(state?.shortcuts) * 2 +
    arrLen(state?.changelog)
  );
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function stripIntegrityMeta(stateObj) {
  const clone = deepClone(stateObj || {});
  if (clone && typeof clone === 'object') {
    delete clone.__integrity;
    delete clone.__writeControl;
  }
  return clone;
}

function computeChecksum(stateObj) {
  const canonical = JSON.stringify(stripIntegrityMeta(stateObj));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function buildBackupFileName() {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const nonce = crypto.randomBytes(3).toString('hex');
  return `state-${iso}-${nonce}.json`;
}

async function listBackupFiles() {
  await ensureDataDir();
  const entries = await fsp.readdir(BACKUPS_DIR, { withFileTypes: true });
  const files = [];

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.startsWith('state-') || !ent.name.endsWith('.json')) continue;
    const abs = path.join(BACKUPS_DIR, ent.name);
    try {
      const st = await fsp.stat(abs);
      let snapshotMeta = null;
      try {
        const raw = await fsp.readFile(abs, 'utf8');
        const parsed = JSON.parse(raw);
        const checksum = String(parsed?.__integrity?.checksum || '').trim() || null;
        snapshotMeta = {
          snapshotSchemaVersion: Number(parsed?.__snapshotMeta?.snapshotSchemaVersion || SNAPSHOT_SCHEMA_VERSION),
          stateSchemaVersion: Number(parsed?.__integrity?.stateSchemaVersion || STATE_SCHEMA_VERSION),
          revision: Number(parsed?.__integrity?.revision || 0),
          reason: String(parsed?.__backupMeta?.reason || '').trim() || 'unspecified',
          checksum,
          hasChecksum: !!checksum,
          criticalCounts: parsed?.__snapshotMeta?.criticalCounts || null,
        };
      } catch {
        snapshotMeta = {
          snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
          stateSchemaVersion: STATE_SCHEMA_VERSION,
          revision: 0,
          reason: 'unknown',
          checksum: null,
          hasChecksum: false,
          criticalCounts: null,
        };
      }

      files.push({
        backupFile: ent.name,
        size: st.size,
        createdAt: st.birthtime?.toISOString?.() || st.mtime.toISOString(),
        mtimeMs: st.mtimeMs,
        snapshotMeta,
      });
    } catch {
      // ignore race/deleted file
    }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

async function pruneBackups(maxKeep = BACKUP_RETENTION) {
  const files = await listBackupFiles();
  const stale = files.slice(maxKeep);
  await Promise.all(stale.map((f) => fsp.unlink(path.join(BACKUPS_DIR, f.backupFile)).catch(() => {})));
}

async function readStateFileSafe() {
  try {
    const raw = await fsp.readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { state: null, integrity: 'invalid' };

    const storedChecksum = String(parsed?.__integrity?.checksum || '').trim();
    if (!storedChecksum) return { state: parsed, integrity: 'missing_checksum' };

    const computed = computeChecksum(parsed);
    return { state: parsed, integrity: computed === storedChecksum ? 'ok' : 'checksum_mismatch' };
  } catch {
    return { state: null, integrity: 'not_found' };
  }
}

async function writeBackupSnapshot(stateObj, reason = 'write') {
  if (!stateObj || typeof stateObj !== 'object') return null;
  await ensureDataDir();
  const backupFile = buildBackupFileName();
  const backupPath = path.join(BACKUPS_DIR, backupFile);
  const clone = deepClone(stateObj);
  const payload = {
    ...clone,
    __backupMeta: {
      reason,
      createdAt: new Date().toISOString(),
    },
    __snapshotMeta: {
      snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
      criticalCounts: {
        tasks: Array.isArray(clone.tasks) ? clone.tasks.length : 0,
        notes: Array.isArray(clone.notes) ? clone.notes.length : 0,
        projects: Array.isArray(clone.projects) ? clone.projects.length : 0,
        reminders: Array.isArray(clone.reminders) ? clone.reminders.length : 0,
        layoutRows: Array.isArray(clone?.layout?.utilityRows) ? clone.layout.utilityRows.length : 0,
      },
    },
  };
  await fsp.writeFile(backupPath, JSON.stringify(payload, null, 2), 'utf8');
  await pruneBackups(BACKUP_RETENTION);
  return backupFile;
}

async function writeStateWithIntegrity(incomingState, opts = {}) {
  const savedAt = new Date().toISOString();
  const next = deepClone(incomingState || {});
  const previousRevision = Number(opts?.previousRevision || 0);
  const revision = previousRevision + 1;
  next.__integrity = {
    savedAt,
    revision,
    stateSchemaVersion: STATE_SCHEMA_VERSION,
    source: String(opts?.source || 'unknown'),
    reason: String(opts?.reason || 'state_write'),
    checksum: computeChecksum(next),
  };

  await fsp.writeFile(STATE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next.__integrity;
}

function isAllowedCameraHost(hostname) {
  if (!hostname) return false;
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  if (!CAMERA_PROXY_ALLOWLIST.length) return false;
  return CAMERA_PROXY_ALLOWLIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function isPrivateCameraHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (host.startsWith('10.')) return true;
    if (host.startsWith('127.')) return true;
    if (host.startsWith('192.168.')) return true;
    const second = Number(host.split('.')[1]);
    if (host.startsWith('172.') && second >= 16 && second <= 31) return true;
  }
  return false;
}

function isCameraProxyTargetAllowed(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, code: 'invalid_protocol', message: 'Only http/https camera URLs are allowed.' };
    }

    const host = parsed.hostname;
    if (isAllowedCameraHost(host)) return { ok: true };

    if (isPrivateCameraHost(host)) {
      return { ok: true };
    }

    return {
      ok: false,
      code: 'host_not_allowed',
      message: 'Camera host is not in local/private ranges or CAMERA_PROXY_ALLOWLIST.',
    };
  } catch {
    return { ok: false, code: 'invalid_url', message: 'Invalid camera URL.' };
  }
}

async function relayRowanMessage(text) {
  if (!ROWAN_RELAY_URL) {
    return { ok: false, code: 'relay_not_configured', message: 'ROWAN_RELAY_URL is not configured on the server.' };
  }

  const payload = {
    text,
    source: 'project-mission-control-lite',
    sentAt: new Date().toISOString(),
  };

  if (ROWAN_RELAY_OPENCLAW_CHANNEL || ROWAN_RELAY_OPENCLAW_TARGET) {
    payload.openclaw = {
      channel: ROWAN_RELAY_OPENCLAW_CHANNEL || undefined,
      target: ROWAN_RELAY_OPENCLAW_TARGET || undefined,
    };
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (ROWAN_RELAY_AUTH_BEARER) {
    headers[ROWAN_RELAY_AUTH_HEADER] = ROWAN_RELAY_AUTH_HEADER.toLowerCase() === 'authorization'
      ? `Bearer ${ROWAN_RELAY_AUTH_BEARER}`
      : ROWAN_RELAY_AUTH_BEARER;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ROWAN_RELAY_TIMEOUT_MS);

    const response = await fetch(ROWAN_RELAY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      return {
        ok: false,
        code: 'relay_http_error',
        message: `Relay endpoint returned HTTP ${response.status}.`,
        details: responseText.slice(0, 300),
      };
    }

    return { ok: true };
  } catch (err) {
    const msg = String(err?.name === 'AbortError' ? 'relay request timed out' : (err?.message || err));
    return { ok: false, code: 'relay_request_failed', message: msg };
  }
}

function normalizeDiaryText(raw) {
  return String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function isTemplateOnlyDiary(content) {
  const lc = String(content || '').toLowerCase();
  if (!lc) return true;
  const normalized = lc.replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  if (normalized.length < 30) return true;
  return (
    normalized === 'template'
    || normalized.includes('placeholder')
    || normalized.includes('todo')
    || normalized.includes('tbd')
    || normalized.includes('[insert')
  ) && normalized.length < 120;
}

function guessDiaryProject(absPath) {
  const clean = String(absPath || '').replace(/\\/g, '/');
  const parts = clean.split('/').filter(Boolean);
  const idx = parts.indexOf('workspace');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  if (parts.length >= 3) return parts[parts.length - 3];
  return 'project';
}

function guessDiaryDate(absPath, rawContent = '') {
  const fromPath = String(absPath || '').match(/(\d{4}-\d{2}-\d{2})/);
  if (fromPath) return fromPath[1];
  const fromContent = String(rawContent || '').match(/(\d{4}-\d{2}-\d{2})/);
  return fromContent ? fromContent[1] : null;
}

function formatDateYYYYMMDDLocal(tsMs) {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function walkDiaryMarkdownFiles(rootAbs) {
  const files = [];
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (DIARY_INDEX_ALLOWED_EXT.has(ext)) files.push(full);
    }
  }
  await walk(rootAbs);
  return files;
}

async function rebuildDiaryIndex() {
  const entriesByDate = {};
  let scannedFiles = 0;
  let includedEntries = 0;
  let skippedEntries = 0;

  for (const rootAbs of DIARY_INDEX_ROOTS) {
    let stats;
    try {
      stats = await fsp.stat(rootAbs);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) continue;

    const files = await walkDiaryMarkdownFiles(rootAbs);
    for (const file of files) {
      scannedFiles += 1;
      if (!DIARY_INDEX_FILE_PATTERN.test(path.basename(file))) {
        skippedEntries += 1;
        continue;
      }
      const raw = await fsp.readFile(file, 'utf8');
      const normalized = normalizeDiaryText(raw);
      if (isTemplateOnlyDiary(normalized)) {
        skippedEntries += 1;
        continue;
      }

      const guessedDate = guessDiaryDate(file, raw);
      const stat = await fsp.stat(file);
      const mtimeLocalDate = formatDateYYYYMMDDLocal(stat.mtimeMs);
      const bucketDates = [...new Set([guessedDate, mtimeLocalDate].filter(Boolean))];
      if (!bucketDates.length) {
        skippedEntries += 1;
        continue;
      }

      const primaryDate = guessedDate || mtimeLocalDate;
      const project = guessDiaryProject(file);
      const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
      const preview = lines.join(' ').slice(0, DIARY_INDEX_MAX_PREVIEW_LEN);
      const entry = {
        id: crypto.createHash('sha1').update(file).digest('hex').slice(0, 16),
        date: primaryDate,
        time: new Date(stat.mtimeMs).toISOString(),
        project,
        title: path.basename(file),
        preview,
        content: normalized,
        rawContent: String(raw || ''),
      };

      for (const bucketDate of bucketDates) {
        if (!entriesByDate[bucketDate]) entriesByDate[bucketDate] = [];
        entriesByDate[bucketDate].push(entry);
      }
      includedEntries += 1;
    }
  }

  for (const date of Object.keys(entriesByDate)) {
    entriesByDate[date].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }

  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    datesWithEntries: Object.keys(entriesByDate).sort(),
    entriesByDate,
    sourceStats: {
      scannedRoots: DIARY_INDEX_ROOTS.length,
      scannedFiles,
      includedEntries,
      skippedEntries,
    },
  };
  diaryIndexCache = payload;
  return payload;
}

async function handleApiDiaryIndex(req, res) {
  const pathname = new URL(req.url || '/api/diary-index', `http://localhost:${PORT}`).pathname;

  if (pathname === '/api/diary-index/refresh') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/diary-index/refresh.' });
    }
    try {
      const payload = await rebuildDiaryIndex();
      return sendJson(res, 200, payload);
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: 'diary_index_refresh_failed', message: String(err?.message || err) });
    }
  }

  if (pathname !== '/api/diary-index') return sendJson(res, 404, { ok: false, error: 'not_found' });
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/diary-index.' });
  }

  if (diaryIndexCache.generatedAt) {
    return sendJson(res, 200, diaryIndexCache);
  }

  try {
    const payload = await rebuildDiaryIndex();
    return sendJson(res, 200, payload);
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'diary_index_unavailable', message: String(err?.message || err), fallback: diaryIndexCache });
  }
}

async function handleApiState(req, res) {
  await ensureDataDir();
  const pathname = new URL(req.url || '/api/state', `http://localhost:${PORT}`).pathname;

  if (pathname === '/api/state/backups') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    const backups = await listBackupFiles();
    return sendJson(res, 200, { ok: true, backups: backups.map(({ mtimeMs, ...rest }) => rest) });
  }

  if (pathname === '/api/state/restore') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body || '{}');
      const backupFile = path.basename(String(parsed?.backupFile || '').trim());
      if (!backupFile || !backupFile.startsWith('state-') || !backupFile.endsWith('.json')) {
        return sendJson(res, 400, { ok: false, error: 'invalid_backup_file' });
      }

      const backupPath = path.join(BACKUPS_DIR, backupFile);
      const raw = await fsp.readFile(backupPath, 'utf8');
      const backupState = JSON.parse(raw);

      const { state: currentState } = await readStateFileSafe();
      let preRestoreSnapshot = null;
      if (currentState) {
        preRestoreSnapshot = await writeBackupSnapshot(currentState, 'pre_restore');
      }

      const previousRevision = Number(currentState?.__integrity?.revision || 0);
      const integrity = await writeStateWithIntegrity(backupState, {
        source: 'manual_restore',
        reason: 'manual_restore_from_backup',
        previousRevision,
      });
      return sendJson(res, 200, {
        ok: true,
        restoredFrom: backupFile,
        preRestoreSnapshot,
        savedAt: integrity.savedAt,
        checksum: integrity.checksum,
      });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: 'restore_failed', message: String(err?.message || err) });
    }
  }

  if (pathname !== '/api/state') {
    return sendJson(res, 404, { error: 'not_found' });
  }

  if (req.method === 'GET') {
    try {
      const raw = await fsp.readFile(STATE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return sendJson(res, 200, parsed);
    } catch {
      return sendJson(res, 404, { error: 'state_not_found' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body || '{}');
      if (!parsed || typeof parsed !== 'object') {
        return sendJson(res, 400, { error: 'invalid_json', message: 'State payload must be an object.' });
      }

      const overrideDowngrade = parsed?.__writeControl?.overrideDowngrade === true;
      const source = String(parsed?.__writeControl?.source || '').trim();
      const explicitLiveOverride = parsed?.__writeControl?.explicitLiveOverride === true;
      const allowOverride = overrideDowngrade && (
        source === 'manual_restore'
        || source === 'manual_import'
        || (source === 'qa_script' && explicitLiveOverride)
      );

      const cleanIncoming = deepClone(parsed);
      delete cleanIncoming.__writeControl;

      const { state: current, integrity } = await readStateFileSafe();
      if (source === 'qa_script' && !explicitLiveOverride) {
        return sendJson(res, 409, {
          ok: false,
          error: 'qa_override_requires_explicit_opt_in',
          message: 'QA/script overwrite is blocked unless __writeControl.explicitLiveOverride=true.',
        });
      }

      if (current) {
        const incomingScore = stateRichnessScore(cleanIncoming);
        const currentScore = stateRichnessScore(current);

        const looksLikeDangerousDowngrade = currentScore >= 20 && incomingScore <= Math.floor(currentScore * 0.35);
        if (looksLikeDangerousDowngrade && !allowOverride) {
          return sendJson(res, 409, {
            ok: false,
            error: 'state_downgrade_blocked',
            message: 'Incoming state looks much smaller than current shared state; write blocked to prevent accidental data loss.',
            currentScore,
            incomingScore,
          });
        }

        await writeBackupSnapshot(current, 'pre_write');
      }

      const previousRevision = Number(current?.__integrity?.revision || 0);
      const writeIntegrity = await writeStateWithIntegrity(cleanIncoming, {
        source: source || 'api_state_post',
        reason: 'api_state_post',
        previousRevision,
      });
      return sendJson(res, 200, {
        ok: true,
        savedAt: writeIntegrity.savedAt,
        checksum: writeIntegrity.checksum,
        previousStateIntegrity: integrity,
      });
    } catch (err) {
      return sendJson(res, 400, { error: 'invalid_json', message: String(err?.message || err) });
    }
  }

  sendJson(res, 405, { error: 'method_not_allowed' });
}

async function handleApiRowanSend(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/rowan-send.' });
  }

  if (!ROWAN_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, {
      ok: false,
      error: 'local_only',
      message: 'Relay endpoint only accepts local requests by default. Set ROWAN_ALLOW_REMOTE=1 to override.',
    });
  }

  let parsed;
  try {
    const body = await readBody(req);
    parsed = JSON.parse(body || '{}');
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: 'invalid_json', message: String(err?.message || err) });
  }

  const text = String(parsed?.text || '').trim();
  if (!text) {
    return sendJson(res, 400, { ok: false, error: 'invalid_text', message: 'text is required and must be non-empty.' });
  }

  if (text.length > ROWAN_MAX_TEXT_LENGTH) {
    return sendJson(res, 400, {
      ok: false,
      error: 'text_too_long',
      message: `text exceeds ${ROWAN_MAX_TEXT_LENGTH} characters.`,
    });
  }

  const relay = await relayRowanMessage(text);
  if (!relay.ok) {
    return sendJson(res, 502, {
      ok: false,
      error: relay.code || 'relay_failed',
      message: relay.message || 'Unable to relay message to Rowan transport.',
      details: relay.details,
    });
  }

  return sendJson(res, 200, {
    ok: true,
    message: 'Message relayed to Rowan transport.',
    transport: 'rowan-relay',
  });
}

async function handleApiCameraSnapshot(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/camera-snapshot?url=...' });
  }

  if (!CAMERA_PROXY_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, {
      ok: false,
      error: 'local_only',
      message: 'Camera proxy is local-only by default. Set CAMERA_PROXY_ALLOW_REMOTE=1 to allow remote requests.',
    });
  }

  const reqUrl = new URL(req.url || '/api/camera-snapshot', `http://localhost:${PORT}`);
  const targetUrl = String(reqUrl.searchParams.get('url') || '').trim();
  if (!targetUrl) {
    return sendJson(res, 400, { ok: false, error: 'missing_url', message: 'Query parameter "url" is required.' });
  }

  const targetCheck = isCameraProxyTargetAllowed(targetUrl);
  if (!targetCheck.ok) {
    return sendJson(res, 403, { ok: false, error: targetCheck.code, message: targetCheck.message });
  }

  let upstream;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAMERA_PROXY_TIMEOUT_MS);
  try {
    upstream = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'mission-control-lite-camera-proxy/1.0',
        'Accept': 'image/*,*/*;q=0.8',
      },
    });
  } catch (err) {
    return sendJson(res, 502, { ok: false, error: 'upstream_fetch_failed', message: String(err?.message || err) });
  } finally {
    clearTimeout(timeout);
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return sendJson(res, 502, {
      ok: false,
      error: 'redirect_not_allowed',
      message: 'Camera source redirects are blocked by proxy safety policy.',
    });
  }

  if (!upstream.ok) {
    return sendJson(res, 502, {
      ok: false,
      error: 'upstream_http_error',
      message: `Camera source returned HTTP ${upstream.status}.`,
    });
  }

  const contentType = String(upstream.headers.get('content-type') || 'application/octet-stream');
  const contentLength = Number(upstream.headers.get('content-length') || 0);
  if (contentLength && contentLength > CAMERA_PROXY_MAX_BYTES) {
    return sendJson(res, 413, {
      ok: false,
      error: 'payload_too_large',
      message: `Snapshot exceeds CAMERA_PROXY_MAX_BYTES (${CAMERA_PROXY_MAX_BYTES}).`,
    });
  }

  const arrayBuf = await upstream.arrayBuffer();
  const body = Buffer.from(arrayBuf);
  if (body.length > CAMERA_PROXY_MAX_BYTES) {
    return sendJson(res, 413, {
      ok: false,
      error: 'payload_too_large',
      message: `Snapshot exceeds CAMERA_PROXY_MAX_BYTES (${CAMERA_PROXY_MAX_BYTES}).`,
    });
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function decodeXmlEntities(input) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  const toCodePoint = (value, fallback) => {
    if (!Number.isInteger(value) || value < 0 || value > 0x10FFFF) return fallback;
    try {
      return String.fromCodePoint(value);
    } catch {
      return fallback;
    }
  };

  return String(input || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (m, code) => toCodePoint(Number.parseInt(code, 10), m))
    .replace(/&#x([\da-f]+);/gi, (m, code) => toCodePoint(Number.parseInt(code, 16), m))
    .replace(/&([a-z]+);/gi, (m, name) => named[name.toLowerCase()] || m);
}

function stripTags(input) {
  const decoded = decodeXmlEntities(String(input || ''));
  return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function excerptSummary(summary, maxLen = 80) {
  const clean = String(summary || '').trim();
  if (!clean) return '';
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen).trimEnd()}…`;
}

function deriveTitleFromUrlish(candidate, feedUrl) {
  const tryParse = (value) => {
    const parsed = new URL(String(value || '').trim());
    const host = parsed.hostname.replace(/^www\./i, '');
    const pathPart = parsed.pathname
      .split('/')
      .filter(Boolean)
      .pop() || '';
    const decodedPath = decodeURIComponent(pathPart)
      .replace(/[-_]+/g, ' ')
      .replace(/\.[a-z0-9]{1,6}$/i, '')
      .trim();
    if (decodedPath) return `${host} — ${decodedPath}`;
    return host || '';
  };

  // First try candidate (link/guid). If it isn't a real URL (e.g., tag: GUID), fallback to feed URL.
  try {
    const fromCandidate = tryParse(candidate);
    if (fromCandidate) return fromCandidate;
  } catch {}

  try {
    const fromFeed = tryParse(feedUrl);
    if (fromFeed) return `${fromFeed} item`;
  } catch {}

  return 'Feed item';
}

function extractTagValue(block, tags) {
  const names = Array.isArray(tags) ? tags : [tags];
  for (const name of names) {
    const rx = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
    const m = block.match(rx);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

function extractTagAttr(block, tagName, attrName) {
  const rx = new RegExp(`<${tagName}[^>]*\\b${attrName}=["']([^"']+)["'][^>]*>`, 'i');
  return block.match(rx)?.[1] || '';
}

function deriveItemId(item) {
  const base = `${item.link || ''}|${item.guid || ''}|${item.title || ''}|${item.publishedAt || ''}`;
  return crypto.createHash('sha1').update(base).digest('hex').slice(0, 20);
}

function parseFeedXml(xmlRaw, feedUrl) {
  const xml = String(xmlRaw || '');
  if (!xml.trim()) return [];

  const isAtom = /<feed[\s>]/i.test(xml) && /xmlns=["'][^"']*atom/i.test(xml);
  const channelBlock = xml.match(/<channel[\s\S]*?<\/channel>/i)?.[0] || '';
  const feedTitle = stripTags(isAtom ? extractTagValue(xml, 'title') : extractTagValue(channelBlock, 'title')) || new URL(feedUrl).hostname;

  const entryBlocks = isAtom
    ? (xml.match(/<entry[\s\S]*?<\/entry>/gi) || [])
    : (xml.match(/<item[\s\S]*?<\/item>/gi) || []);

  return entryBlocks.slice(0, 40).map((block) => {
    const link = isAtom
      ? (extractTagAttr(block, 'link', 'href') || stripTags(extractTagValue(block, 'link')))
      : stripTags(extractTagValue(block, 'link'));
    const guid = stripTags(extractTagValue(block, ['guid', 'id']));
    const summaryRaw = extractTagValue(block, isAtom ? ['summary', 'content'] : ['description', 'content:encoded']);
    const publishedRaw = extractTagValue(block, isAtom ? ['updated', 'published'] : ['pubDate', 'dc:date']);
    let publishedAt = '';
    if (publishedRaw) {
      const parsed = new Date(publishedRaw);
      if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
    }
    const summary = stripTags(summaryRaw).slice(0, 220);

    const titleFromTag = stripTags(extractTagValue(block, 'title'));
    const titleFromSummary = excerptSummary(summary, 80);
    const titleFallback = deriveTitleFromUrlish(link || guid, feedUrl);
    const title = titleFromTag || titleFromSummary || titleFallback;

    const item = {
      id: '',
      title,
      link: link.trim(),
      summary,
      publishedAt,
      feedTitle,
      feedUrl,
      guid,
    };
    item.id = deriveItemId(item);
    return item;
  }).filter((item) => /^https?:\/\//i.test(item.link));
}

async function fetchFeedXml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'mission-control-lite-rss/1.0',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && contentLength > RSS_FETCH_MAX_BYTES) {
      throw new Error(`Feed too large (${contentLength} bytes)`);
    }

    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length > RSS_FETCH_MAX_BYTES) {
      throw new Error(`Feed too large (${buf.length} bytes)`);
    }

    return buf.toString('utf8');
  } catch (err) {
    try {
      return await fetchTextViaCurl(url, RSS_FETCH_TIMEOUT_MS, RSS_FETCH_MAX_BYTES);
    } catch (curlErr) {
      const fetchReason = String(err?.message || err || 'fetch failed');
      const curlReason = String(curlErr?.message || curlErr || 'curl failed');
      throw new Error(`${fetchReason} (curl fallback failed: ${curlReason})`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

const CRYPTO_PROXY_TARGETS = [
  { prefix: '/api/crypto/coins/list', upstream: 'https://api.coingecko.com/api/v3/coins/list' },
  { prefix: '/api/crypto/coingecko/coins/markets', upstream: 'https://api.coingecko.com/api/v3/coins/markets' },
  { prefix: '/api/crypto/coincap/assets', upstream: 'https://api.coincap.io/v2/assets' },
  { prefix: '/api/crypto/cryptocompare/data/pricemultifull', upstream: 'https://min-api.cryptocompare.com/data/pricemultifull' },
];

async function handleApiCryptoProxy(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/crypto/*.' });
  }

  if (!CRYPTO_PROXY_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, {
      ok: false,
      error: 'local_only',
      message: 'Crypto proxy endpoint is local-only by default. Set CRYPTO_PROXY_ALLOW_REMOTE=1 to allow remote requests.',
    });
  }

  const reqUrl = new URL(req.url || '/api/crypto/coins/list', `http://localhost:${PORT}`);
  const route = CRYPTO_PROXY_TARGETS.find((entry) => reqUrl.pathname === entry.prefix);
  if (!route) {
    return sendJson(res, 404, { ok: false, error: 'unknown_crypto_route', message: 'Unsupported crypto proxy route.' });
  }

  const upstreamUrl = new URL(route.upstream);
  reqUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.set(key, value));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRYPTO_PROXY_TIMEOUT_MS);
  let fetchFailure = null;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'mission-control-lite-crypto-proxy/1.0',
        'Accept': 'application/json, text/plain;q=0.8, */*;q=0.5',
      },
    });

    if (!upstream.ok) {
      return sendJson(res, upstream.status, {
        ok: false,
        error: 'crypto_upstream_error',
        status: upstream.status,
        message: `Upstream request failed (HTTP ${upstream.status}).`,
      });
    }

    const raw = await upstream.text();
    const parsed = parseJsonSafely(raw, 'fetch');
    if (parsed.ok) {
      return sendJson(res, 200, parsed.value);
    }

    fetchFailure = {
      error: parsed.error,
      message: parsed.message,
    };
  } catch (err) {
    const isAbort = String(err?.name || '') === 'AbortError';
    fetchFailure = {
      error: isAbort ? 'timeout' : 'crypto_proxy_fetch_failed',
      message: isAbort ? 'Crypto upstream request timed out.' : String(err?.message || err),
    };
  } finally {
    clearTimeout(timeout);
  }

  try {
    const json = await fetchJsonViaCurl(upstreamUrl.toString(), CRYPTO_PROXY_TIMEOUT_MS);
    return sendJson(res, 200, json);
  } catch (curlErr) {
    return sendJson(res, 502, {
      ok: false,
      error: 'crypto_proxy_upstream_failed',
      message: 'Upstream request failed via both fetch and curl fallback.',
      details: {
        fetch: {
          error: fetchFailure?.error || 'crypto_proxy_fetch_failed',
          message: fetchFailure?.message || 'Unknown fetch failure.',
        },
        curl: {
          error: 'crypto_proxy_curl_failed',
          message: String(curlErr?.message || curlErr),
        },
      },
    });
  }
}

function execFileSafe(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        error,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      });
    });
  });
}

function round1(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(1)) : null;
}

function normalizeBackendSpeedResult(tool, json) {
  if (!json || typeof json !== 'object') return null;

  if (tool === 'speedtest') {
    const pingMs = round1(json?.ping?.latency);
    const downloadMbps = round1((Number(json?.download?.bandwidth) * 8) / 1_000_000);
    const uploadMbps = round1((Number(json?.upload?.bandwidth) * 8) / 1_000_000);
    if (downloadMbps == null && uploadMbps == null && pingMs == null) return null;
    return { pingMs, downloadMbps, uploadMbps };
  }

  if (tool === 'speedtest-cli') {
    const pingMs = round1(json?.ping);
    const downloadMbps = round1(Number(json?.download) / 1_000_000);
    const uploadMbps = round1(Number(json?.upload) / 1_000_000);
    if (downloadMbps == null && uploadMbps == null && pingMs == null) return null;
    return { pingMs, downloadMbps, uploadMbps };
  }

  if (tool === 'fast') {
    const pingMs = round1(json?.latency ?? json?.ping);
    const downloadRaw = Number(json?.downloadSpeed ?? json?.download);
    const uploadRaw = Number(json?.uploadSpeed ?? json?.upload);
    const unit = String(json?.downloadUnit || json?.unit || 'Mbps').toLowerCase();
    const mul = unit === 'kbps' ? 0.001 : unit === 'gbps' ? 1000 : 1;
    const downloadMbps = round1(downloadRaw * mul);
    const uploadMbps = round1(uploadRaw * mul);
    if (downloadMbps == null && uploadMbps == null && pingMs == null) return null;
    return { pingMs, downloadMbps, uploadMbps };
  }

  return null;
}

async function runBackendSpeedTest() {
  const candidates = [
    { tool: 'speedtest', cmd: 'speedtest', args: ['--accept-license', '--accept-gdpr', '-f', 'json'] },
    { tool: 'speedtest-cli', cmd: 'speedtest-cli', args: ['--json'] },
    { tool: 'fast', cmd: 'fast', args: ['--upload', '--json'] },
  ];

  const checked = [];
  for (const candidate of candidates) {
    checked.push(candidate.tool);
    const result = await execFileSafe(candidate.cmd, candidate.args, {
      timeout: SPEED_TEST_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (!result.ok) continue;

    const parsed = parseJsonSafely(result.stdout, `${candidate.tool}_json`);
    if (!parsed.ok) continue;

    const metrics = normalizeBackendSpeedResult(candidate.tool, parsed.value);
    if (!metrics) continue;

    return { ok: true, tool: candidate.tool, metrics, checked };
  }

  return {
    ok: false,
    checked,
    reason: 'backend_tools_unavailable',
    message: 'No supported backend speed test CLI found (tried speedtest, speedtest-cli, fast).',
  };
}

async function handleApiSpeedTest(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/speed-test.' });
  }

  if (!SPEED_TEST_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, {
      ok: false,
      error: 'local_only',
      message: 'Speed test endpoint is local-only by default. Set SPEED_TEST_ALLOW_REMOTE=1 to allow remote requests.',
    });
  }

  try {
    const run = await runBackendSpeedTest();
    if (!run.ok) {
      return sendJson(res, 200, {
        ok: true,
        mode: 'fallback_required',
        sampledAt: new Date().toISOString(),
        reason: run.reason,
        message: run.message,
        checkedTools: run.checked,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      mode: 'backend',
      sampledAt: new Date().toISOString(),
      backendTool: run.tool,
      checkedTools: run.checked,
      metrics: run.metrics,
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: 'speed_test_failed',
      message: String(err?.message || err || 'Speed test failed').slice(0, 180),
    });
  }
}

const US_STATE_ALIASES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC', dc: 'DC',
};

function parseAaaCurrentAvgRow(html) {
  const rowMatch = html.match(/<tr>\s*<td>\s*Current Avg\.?\s*<\/td>([\s\S]*?)<\/tr>/i);
  if (!rowMatch) return null;
  const cells = [...rowMatch[1].matchAll(/<td>\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\s*<\/td>/gi)].map((m) => Number(m[1]));
  if (!cells.length) return null;
  return {
    regular: Number.isFinite(cells[0]) ? cells[0].toFixed(3) : '',
    mid: Number.isFinite(cells[1]) ? cells[1].toFixed(3) : '',
    premium: Number.isFinite(cells[2]) ? cells[2].toFixed(3) : '',
    diesel: Number.isFinite(cells[3]) ? cells[3].toFixed(3) : '',
  };
}

async function resolveUsStateFromLocation(input) {
  const raw = String(input || '').trim();
  if (!raw) return { code: null, label: '' };

  const zip = raw.match(/^\d{5}$/)?.[0] || null;
  if (zip) {
    try {
      const zipJson = await fetchJsonViaCurl(`https://api.zippopotam.us/us/${zip}`, GAS_PROXY_TIMEOUT_MS);
      const place = zipJson?.places?.[0] || {};
      const code = String(place['state abbreviation'] || '').trim().toUpperCase();
      const city = String(place['place name'] || '').trim();
      const stateName = String(place.state || '').trim();
      if (code) {
        return { code, label: city && stateName ? `${city}, ${stateName}` : (stateName || zip) };
      }
    } catch {
      return { code: null, label: zip };
    }
  }

  const upper = raw.toUpperCase();
  const trailingCode = upper.match(/\b([A-Z]{2})\s*$/)?.[1] || null;
  if (trailingCode && Object.values(US_STATE_ALIASES).includes(trailingCode)) {
    return { code: trailingCode, label: raw };
  }

  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const fromAlias = US_STATE_ALIASES[normalized];
  if (fromAlias) return { code: fromAlias, label: raw };

  for (const [name, code] of Object.entries(US_STATE_ALIASES)) {
    if (normalized.includes(name)) return { code, label: raw };
  }

  return { code: null, label: raw };
}

async function handleApiGasPrices(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/gas-prices?location=ZIP_OR_CITY_STATE.' });
  }

  if (!GAS_PROXY_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, {
      ok: false,
      error: 'local_only',
      message: 'Gas proxy endpoint is local-only by default. Set GAS_PROXY_ALLOW_REMOTE=1 to allow remote requests.',
    });
  }

  const reqUrl = new URL(req.url || '/api/gas-prices', `http://localhost:${PORT}`);
  const location = String(reqUrl.searchParams.get('location') || '').trim();
  if (!location) {
    return sendJson(res, 400, { ok: false, error: 'missing_location', message: 'Provide location query param (ZIP or City, ST).' });
  }

  const resolved = await resolveUsStateFromLocation(location);
  if (!resolved.code) {
    return sendJson(res, 400, {
      ok: false,
      error: 'state_unresolved',
      message: 'Could not resolve a U.S. state from that location. Try a 5-digit ZIP or include state (e.g., "Akron, OH").',
    });
  }

  const upstreamUrl = `https://gasprices.aaa.com/?state=${encodeURIComponent(resolved.code)}`;
  try {
    const html = await fetchTextViaCurl(upstreamUrl, GAS_PROXY_TIMEOUT_MS, 600 * 1024);
    const prices = parseAaaCurrentAvgRow(html);
    if (!prices) {
      return sendJson(res, 502, { ok: false, error: 'parse_failed', message: 'AAA page format changed or prices were unavailable.' });
    }

    return sendJson(res, 200, {
      ok: true,
      provider: 'aaa-state-average',
      stateCode: resolved.code,
      resolvedLocation: resolved.label || resolved.code,
      sourceUrl: upstreamUrl,
      fetchedAt: new Date().toISOString(),
      prices,
    });
  } catch (err) {
    return sendJson(res, 502, {
      ok: false,
      error: 'gas_upstream_failed',
      message: String(err?.message || err || 'Failed to fetch gas prices from AAA').slice(0, 180),
    });
  }
}

async function handleApiRssFetch(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/rss/fetch.' });
  }

  if (!RSS_FETCH_ALLOW_REMOTE && !isLocalRequest(req)) {
    return sendJson(res, 403, {
      ok: false,
      error: 'local_only',
      message: 'RSS fetch endpoint is local-only by default. Set RSS_FETCH_ALLOW_REMOTE=1 to allow remote requests.',
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: 'invalid_json', message: String(err?.message || err) });
  }

  const urls = [...new Set((Array.isArray(parsed?.feeds) ? parsed.feeds : [])
    .map((v) => String(v || '').trim())
    .filter((v) => /^https?:\/\//i.test(v)))].slice(0, RSS_FETCH_MAX_FEEDS);

  if (!urls.length) {
    return sendJson(res, 400, { ok: false, error: 'missing_feeds', message: 'Provide at least one valid http(s) feed URL in feeds[].' });
  }

  const items = [];
  const errors = [];

  for (const url of urls) {
    try {
      const xml = await fetchFeedXml(url);
      const parsedItems = parseFeedXml(xml, url);
      items.push(...parsedItems);
    } catch (err) {
      errors.push({ feedUrl: url, message: String(err?.message || err).slice(0, 180) });
    }
  }

  return sendJson(res, 200, { ok: true, items, errors });
}

function safePathFromUrl(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  const rel = pathname === '/' ? '/index.html' : pathname;
  const candidate = path.normalize(path.join(ROOT, rel));
  if (!candidate.startsWith(ROOT)) return null;
  return candidate;
}

async function handleStatic(req, res) {
  const target = safePathFromUrl(req.url || '/');
  if (!target) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const st = await fsp.stat(target);
    if (st.isDirectory()) {
      const idx = path.join(target, 'index.html');
      const raw = await fsp.readFile(idx);
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(raw);
    }

    const ext = path.extname(target).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const raw = await fsp.readFile(target);
    res.writeHead(200, { 'Content-Type': type });
    res.end(raw);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  if ((req.url || '').startsWith('/api/state')) return handleApiState(req, res);
  if ((req.url || '').startsWith('/api/rowan-send')) return handleApiRowanSend(req, res);
  if ((req.url || '').startsWith('/api/camera-snapshot')) return handleApiCameraSnapshot(req, res);
  if ((req.url || '').startsWith('/api/rss/fetch')) return handleApiRssFetch(req, res);
  if ((req.url || '').startsWith('/api/gas-prices')) return handleApiGasPrices(req, res);
  if ((req.url || '').startsWith('/api/crypto/')) return handleApiCryptoProxy(req, res);
  if ((req.url || '').startsWith('/api/system-resources')) return handleApiSystemResources(req, res);
  if ((req.url || '').startsWith('/api/speed-test')) return handleApiSpeedTest(req, res);
  if ((req.url || '').startsWith('/api/home-devices/ping')) return handleApiHomeDevicePing(req, res);
  if ((req.url || '').startsWith('/api/home-devices/wake')) return handleApiHomeDeviceWake(req, res);
  if ((req.url || '').startsWith('/api/diary-index')) return handleApiDiaryIndex(req, res);
  if ((req.url || '').startsWith('/api/facebook-followers')) return handleApiFacebookFollowers(req, res);
  if ((req.url || '').startsWith('/api/instagram-followers')) return handleApiInstagramFollowers(req, res);
  if ((req.url || '').startsWith('/api/tiktok-followers')) return handleApiTikTokFollowers(req, res);
  if ((req.url || '').startsWith('/api/youtube-subscribers')) return handleApiYoutubeSubscribers(req, res);
  return handleStatic(req, res);
});

if (require.main === module) {
  initFacebookFollowersService().catch((err) => {
    console.error('Facebook followers service init failed:', err?.message || err);
  });
  initInstagramFollowersService().catch((err) => {
    console.error('Instagram followers service init failed:', err?.message || err);
  });
  initTikTokFollowersService().catch((err) => {
    console.error('TikTok followers service init failed:', err?.message || err);
  });
  initYoutubeSubscribersService().catch((err) => {
    console.error('YouTube subscribers service init failed:', err?.message || err);
  });
  server.listen(PORT, () => {
    console.log(`Mission Control running on http://localhost:${PORT}`);
    console.log(`Shared state file: ${STATE_PATH}`);
    console.log(`State backup dir: ${BACKUPS_DIR} (retain latest ${BACKUP_RETENTION})`);
    console.log(`Voice-to-Rowan relay: ${ROWAN_RELAY_URL ? 'configured' : 'not configured'} (${ROWAN_ALLOW_REMOTE ? 'remote enabled' : 'local only'})`);
    console.log(`Camera snapshot proxy: enabled (${CAMERA_PROXY_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; allowlist entries: ${CAMERA_PROXY_ALLOWLIST.length})`);
    console.log(`RSS fetch API: enabled (${RSS_FETCH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; max feeds/request: ${RSS_FETCH_MAX_FEEDS})`);
    console.log(`Gas price proxy API: enabled (${GAS_PROXY_ALLOW_REMOTE ? 'remote enabled' : 'local only'})`);
    console.log(`Speed test API: enabled (${SPEED_TEST_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; timeout ${SPEED_TEST_TIMEOUT_MS}ms)`);
    console.log(`Facebook followers pod API: enabled (${META_GRAPH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; poll ${META_GRAPH_POLL_INTERVAL_MS}ms)`);
    console.log(`Instagram followers pod API: enabled (${META_GRAPH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; poll ${INSTAGRAM_POLL_INTERVAL_MS}ms; provider ${INSTAGRAM_PROVIDER})`);
    console.log(`TikTok followers pod API: enabled (${META_GRAPH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; poll ${TIKTOK_POLL_INTERVAL_MS}ms; provider public_scrape_estimate)`);
    console.log(`YouTube subscribers pod API: enabled (${META_GRAPH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; poll ${YOUTUBE_POLL_INTERVAL_MS}ms; provider public_scrape_estimate)`);
  });
}

module.exports = {
  parseJsonSafely,
  fetchJsonViaCurl,
  classifyFacebookFollowerStaleLevel,
  ensureFacebookFollowersShape,
  facebookFollowerResponsePayload,
  extractFacebookPublicFollowerEstimate,
  extractInstagramPublicFollowerEstimate,
  extractTikTokPublicFollowerEstimate,
  extractYouTubePublicSubscriberEstimate,
  parseCompactCount,
};
