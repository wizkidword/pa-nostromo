const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { pipeline } = require('stream/promises');
const os = require('os');
const { fetchGmailImapMessageBody, fetchGmailImapAccountSnapshot, markGmailImapMessagesRead, markGmailImapMessageRead, moveGmailImapMessageToSpam, moveGmailImapMessageToTrash, moveGmailImapMessagesToSpam, moveGmailImapMessagesToTrash } = require('./lib/email-imap.js');
const { resolveRuntimeStorage, ensurePrivateRuntimeStorage } = require('./lib/runtime-storage.js');
const { SECURITY_RESPONSE_HEADERS, createHostPolicy, validateHostHeader, parseScopedTokens, bearerTokenHasScope, hasBrowserMetadata, validateBrowserIntent, createCsrfToken } = require('./lib/route-security.js');
const { buildRouteManifest, resolveRoute } = require('./lib/route-manifest.js');
const { safeFetch } = require('./lib/safe-fetch.js');
const { createWorkCoordinator } = require('./lib/work-coordinator.js');
const { StateSchemaError } = require('./lib/state-schema.js');
const { StateStore, StateStoreError } = require('./lib/state-store.js');

const ROOT = __dirname;
const PUBLIC_ROOT = path.join(ROOT, 'public');
const BACKUP_RETENTION = 200;

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

const PORT = Number(process.env.PORT || 4287);
const HOST = String(process.env.HOST || '127.0.0.1').trim() || '127.0.0.1';
const DISABLE_BACKGROUND_SERVICES = parseBool(process.env.NOSTROMO_DISABLE_BACKGROUND_SERVICES);
const RUNTIME_STORAGE = resolveRuntimeStorage({ root: ROOT });
const DATA_DIR = RUNTIME_STORAGE.dataDir;
const LOG_DIR = RUNTIME_STORAGE.logDir;
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

function parsePositiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

const STATE_STORE = new StateStore({
  statePath: STATE_PATH,
  backupsDir: BACKUPS_DIR,
  backupRetention: BACKUP_RETENTION,
  backupMinIntervalMs: Math.max(1_000, parsePositiveInt(process.env.STATE_BACKUP_MIN_INTERVAL_MS, 30_000)),
});

function parseBool(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeEmailUnreadAppPassword(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function normalizeEmailUnreadOpenUrl(value) {
  return String(value || '').trim();
}

function defaultSentOpenUrl(inboxUrl = '') {
  const source = String(inboxUrl || '').trim();
  if (!source) return '';
  if (/#inbox\b/i.test(source)) return source.replace(/#inbox\b/i, '#sent');
  if (!/#/i.test(source)) return `${source}#sent`;
  return source;
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
const RSS_FETCH_MAX_ENTRIES = Math.max(1, Math.min(100, parsePositiveInt(process.env.RSS_FETCH_MAX_ENTRIES, 40)));
const RSS_FETCH_CACHE_TTL_MS = Math.max(5_000, parsePositiveInt(process.env.RSS_FETCH_CACHE_TTL_MS, 5 * 60_000));
const OUTBOUND_MAX_CONCURRENCY = Math.max(1, Math.min(16, parsePositiveInt(process.env.OUTBOUND_MAX_CONCURRENCY, 4)));
const OUTBOUND_PER_HOST_CONCURRENCY = Math.max(1, Math.min(8, parsePositiveInt(process.env.OUTBOUND_PER_HOST_CONCURRENCY, 1)));
const MANUAL_REFRESH_COOLDOWN_MS = Math.max(0, parsePositiveInt(process.env.MANUAL_REFRESH_COOLDOWN_MS, 3_000));
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
const EMAIL_UNREAD_ALLOW_REMOTE = parseBool(process.env.EMAIL_UNREAD_ALLOW_REMOTE);
const EMAIL_UNREAD_TIMEOUT_MS = Math.max(1500, parsePositiveInt(process.env.EMAIL_UNREAD_TIMEOUT_MS, 8000));
const EMAIL_UNREAD_PROVIDER = String(process.env.EMAIL_UNREAD_PROVIDER || 'gmail_atom').trim().toLowerCase() || 'gmail_atom';
const EMAIL_UNREAD_URL = String(process.env.EMAIL_UNREAD_URL || 'https://mail.google.com/mail/feed/atom').trim() || 'https://mail.google.com/mail/feed/atom';
const EMAIL_UNREAD_LABEL = String(process.env.EMAIL_UNREAD_LABEL || 'Inbox').trim() || 'Inbox';
const EMAIL_UNREAD_USERNAME = String(process.env.EMAIL_UNREAD_USERNAME || '').trim();
const EMAIL_UNREAD_APP_PASSWORD = normalizeEmailUnreadAppPassword(process.env.EMAIL_UNREAD_APP_PASSWORD);
const EMAIL_UNREAD_OPEN_URL = String(process.env.EMAIL_UNREAD_OPEN_URL || 'https://mail.google.com/mail/u/0/#inbox').trim() || 'https://mail.google.com/mail/u/0/#inbox';
const EMAIL_UNREAD_ACCOUNTS_JSON = String(process.env.EMAIL_UNREAD_ACCOUNTS_JSON || '').trim();
const EMAIL_UNREAD_IMAP_HOST = String(process.env.EMAIL_UNREAD_IMAP_HOST || 'imap.gmail.com').trim() || 'imap.gmail.com';
const EMAIL_UNREAD_IMAP_PORT = Math.max(1, parsePositiveInt(process.env.EMAIL_UNREAD_IMAP_PORT, 993));
const EMAIL_UNREAD_PREVIEW_LIMIT = Math.max(1, Math.min(10, parsePositiveInt(process.env.EMAIL_UNREAD_PREVIEW_LIMIT, 5)));
const STATE_API_ALLOW_REMOTE = parseBool(process.env.STATE_API_ALLOW_REMOTE);
const NOSTROMO_API_TOKEN = String(process.env.NOSTROMO_API_TOKEN || '').trim();
const NOSTROMO_API_TOKENS_JSON = String(process.env.NOSTROMO_API_TOKENS_JSON || '').trim();
const HOST_POLICY = createHostPolicy(process.env.NOSTROMO_ALLOWED_HOSTS || '');
const API_TOKEN_CONFIG = parseScopedTokens({ tokensJson: NOSTROMO_API_TOKENS_JSON, legacyStateToken: NOSTROMO_API_TOKEN });
const CSRF_TOKEN = createCsrfToken();
const REQUEST_BODY_LIMIT_ACTION_BYTES = Math.max(1024, parsePositiveInt(process.env.REQUEST_BODY_LIMIT_ACTION_BYTES, 64 * 1024));
const REQUEST_BODY_LIMIT_STATE_BYTES = Math.max(128 * 1024, parsePositiveInt(process.env.REQUEST_BODY_LIMIT_STATE_BYTES, 2 * 1024 * 1024));
const REQUEST_BODY_LIMIT_RSS_BYTES = Math.max(8 * 1024, parsePositiveInt(process.env.REQUEST_BODY_LIMIT_RSS_BYTES, 256 * 1024));
const EBAY_TRAFFIC_ALLOW_REMOTE = parseBool(process.env.EBAY_TRAFFIC_ALLOW_REMOTE);
const EBAY_TRAFFIC_TIMEOUT_MS = Math.max(2_000, parsePositiveInt(process.env.EBAY_TRAFFIC_TIMEOUT_MS, 12_000));
const EBAY_TRAFFIC_RANGE_DAYS = Math.max(1, Math.min(90, parsePositiveInt(process.env.EBAY_TRAFFIC_RANGE_DAYS, 30)));
const EBAY_TRAFFIC_TOP_LISTINGS_LIMIT = Math.max(3, Math.min(20, parsePositiveInt(process.env.EBAY_TRAFFIC_TOP_LISTINGS_LIMIT, 8)));
const EBAY_TRAFFIC_CACHE_TTL_MS = Math.max(60_000, parsePositiveInt(process.env.EBAY_TRAFFIC_CACHE_TTL_MS, 30 * 60 * 1000));
const EBAY_TRAFFIC_ENVIRONMENT = String(process.env.EBAY_TRAFFIC_ENVIRONMENT || 'production').trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
const EBAY_TRAFFIC_BASE_URL = String(
  process.env.EBAY_TRAFFIC_BASE_URL
  || (EBAY_TRAFFIC_ENVIRONMENT === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com')
).trim() || (EBAY_TRAFFIC_ENVIRONMENT === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com');
const EBAY_TRADING_API_URL = String(
  process.env.EBAY_TRADING_API_URL
  || (EBAY_TRAFFIC_ENVIRONMENT === 'sandbox' ? 'https://api.sandbox.ebay.com/ws/api.dll' : 'https://api.ebay.com/ws/api.dll')
).trim() || (EBAY_TRAFFIC_ENVIRONMENT === 'sandbox' ? 'https://api.sandbox.ebay.com/ws/api.dll' : 'https://api.ebay.com/ws/api.dll');
const EBAY_MARKETING_API_URL = String(
  process.env.EBAY_MARKETING_API_URL
  || (EBAY_TRAFFIC_ENVIRONMENT === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com')
).trim() || (EBAY_TRAFFIC_ENVIRONMENT === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com');
const EBAY_TRAFFIC_TOKEN_URL = String(
  process.env.EBAY_TRAFFIC_TOKEN_URL
  || (EBAY_TRAFFIC_ENVIRONMENT === 'sandbox'
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token')
).trim() || (EBAY_TRAFFIC_ENVIRONMENT === 'sandbox'
  ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
  : 'https://api.ebay.com/identity/v1/oauth2/token');
const EBAY_TRAFFIC_SCOPE = String(process.env.EBAY_TRAFFIC_SCOPE || 'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly').trim() || 'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly';
const EBAY_ALLOWED_HOSTS = ['api.ebay.com', 'api.sandbox.ebay.com'];
const EBAY_TRAFFIC_LABEL = String(process.env.EBAY_TRAFFIC_LABEL || 'eBay Store').trim() || 'eBay Store';
const EBAY_TRAFFIC_MARKETPLACE_ID = String(process.env.EBAY_TRAFFIC_MARKETPLACE_ID || 'EBAY_US').trim().toUpperCase() || 'EBAY_US';
const EBAY_TRAFFIC_CLIENT_ID = String(process.env.EBAY_TRAFFIC_CLIENT_ID || '').trim();
const EBAY_TRAFFIC_CLIENT_SECRET = String(process.env.EBAY_TRAFFIC_CLIENT_SECRET || '').trim();
const EBAY_TRAFFIC_REFRESH_TOKEN = String(process.env.EBAY_TRAFFIC_REFRESH_TOKEN || '').trim();
const EBAY_TRAFFIC_STORE_URL = String(process.env.EBAY_TRAFFIC_STORE_URL || '').trim();
const EBAY_TRAFFIC_STORES_JSON = String(process.env.EBAY_TRAFFIC_STORES_JSON || '').trim();
const EBAY_TRADING_API_COMPATIBILITY_LEVEL = String(process.env.EBAY_TRADING_API_COMPATIBILITY_LEVEL || '1451').trim() || '1451';
const EBAY_TRADING_API_SITE_ID = String(process.env.EBAY_TRADING_API_SITE_ID || '0').trim() || '0';
const EBAY_TRAFFIC_RATE_LIMIT_BACKOFF_MS = Math.max(60_000, parsePositiveInt(process.env.EBAY_TRAFFIC_RATE_LIMIT_BACKOFF_MS, 60 * 60 * 1000));
const EBAY_MARKETING_REPORT_CACHE_TTL_MS = Math.max(60_000, parsePositiveInt(process.env.EBAY_MARKETING_REPORT_CACHE_TTL_MS, 15 * 60 * 1000));
const EBAY_MARKETING_REPORT_TASK_REUSE_MS = Math.max(60_000, parsePositiveInt(process.env.EBAY_MARKETING_REPORT_TASK_REUSE_MS, 30 * 60 * 1000));
const EBAY_TRAFFIC_CACHE_PATH = path.join(DATA_DIR, 'ebay-traffic-cache.json');

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
const FACEBOOK_FOLLOWERS_LOG_PATH = path.join(LOG_DIR, 'facebook-followers-poller.log');
const FACEBOOK_FOLLOWERS_HISTORY_LIMIT = 1440;
const FACEBOOK_GROUP_URL = String(process.env.FACEBOOK_GROUP_URL || 'https://www.facebook.com/groups/blastfromtheads').trim() || 'https://www.facebook.com/groups/blastfromtheads';
const FACEBOOK_GROUP_MEMBERS_PATH = path.join(DATA_DIR, 'facebook-group-members.json');
const FACEBOOK_GROUP_MEMBERS_LOG_PATH = path.join(LOG_DIR, 'facebook-group-members-poller.log');
const FACEBOOK_GROUP_MEMBERS_HISTORY_LIMIT = 1440;
const FACEBOOK_GROUP_POLL_INTERVAL_MS = Math.max(60_000, parsePositiveInt(process.env.FACEBOOK_GROUP_POLL_INTERVAL_MS, 180_000));
const FACEBOOK_SESSION_SCRIPT_PATH = path.resolve(ROOT, String(process.env.FACEBOOK_SESSION_SCRIPT_PATH || path.join('scripts', 'facebook-page-session-scraper.mjs')).trim() || path.join('scripts', 'facebook-page-session-scraper.mjs'));
const FACEBOOK_GROUP_SESSION_SCRIPT_PATH = path.resolve(ROOT, String(process.env.FACEBOOK_GROUP_SESSION_SCRIPT_PATH || path.join('scripts', 'facebook-group-session-scraper.mjs')).trim() || path.join('scripts', 'facebook-group-session-scraper.mjs'));
const FACEBOOK_SESSION_STORAGE_PATH = path.resolve(ROOT, String(process.env.FACEBOOK_SESSION_STORAGE_PATH || process.env.INSTAGRAM_META_SUITE_STORAGE_PATH || path.join(DATA_DIR, '.auth', 'meta-suite-instagram-storage.json')).trim() || path.join(DATA_DIR, '.auth', 'meta-suite-instagram-storage.json'));
const FACEBOOK_SESSION_TIMEOUT_MS = Math.max(5_000, parsePositiveInt(process.env.FACEBOOK_SESSION_TIMEOUT_MS, parsePositiveInt(process.env.INSTAGRAM_META_SUITE_TIMEOUT_MS, 45_000)));
const FACEBOOK_SESSION_HEADLESS = !parseBool(process.env.FACEBOOK_SESSION_HEADFUL || process.env.INSTAGRAM_META_SUITE_HEADFUL);
const FACEBOOK_CONTENT_CACHE_TTL_MS = Math.max(60_000, parsePositiveInt(process.env.FACEBOOK_CONTENT_CACHE_TTL_MS, 10 * 60_000));
const FACEBOOK_GRAPH_LOOKBACK_DAYS = Math.max(1, Math.min(90, parsePositiveInt(process.env.FACEBOOK_GRAPH_LOOKBACK_DAYS, 7)));
const FACEBOOK_GRAPH_POST_LIMIT = Math.max(1, Math.min(24, parsePositiveInt(process.env.FACEBOOK_GRAPH_POST_LIMIT, 12)));
const INSTAGRAM_PROFILE_HANDLE = String(process.env.INSTAGRAM_PROFILE_HANDLE || 'ablastfromtheads').trim().replace(/^@+/, '');
const INSTAGRAM_PROFILE_NAME = String(process.env.INSTAGRAM_PROFILE_NAME || 'Blast From The Ads').trim() || 'Blast From The Ads';
const INSTAGRAM_PROFILE_URL = String(process.env.INSTAGRAM_PROFILE_URL || ('https://www.instagram.com/' + INSTAGRAM_PROFILE_HANDLE + '/')).trim() || ('https://www.instagram.com/' + INSTAGRAM_PROFILE_HANDLE + '/');
const INSTAGRAM_FOLLOWERS_COUNT = parsePositiveInt(process.env.INSTAGRAM_FOLLOWERS_COUNT, NaN);
const INSTAGRAM_FOLLOWERS_PATH = path.join(DATA_DIR, 'instagram-followers.json');
const INSTAGRAM_FOLLOWERS_LOG_PATH = path.join(LOG_DIR, 'instagram-followers-poller.log');
const INSTAGRAM_FOLLOWERS_HISTORY_LIMIT = 1440;
const INSTAGRAM_POLL_INTERVAL_MS = Math.max(60_000, parsePositiveInt(process.env.INSTAGRAM_POLL_INTERVAL_MS, 180_000));
const INSTAGRAM_PROVIDER = String(process.env.INSTAGRAM_PROVIDER || 'auto').trim().toLowerCase() || 'auto';
const INSTAGRAM_META_SUITE_SCRIPT_PATH = path.resolve(ROOT, String(process.env.INSTAGRAM_META_SUITE_SCRIPT_PATH || path.join('scripts', 'instagram-meta-suite-scraper.mjs')).trim() || path.join('scripts', 'instagram-meta-suite-scraper.mjs'));
const INSTAGRAM_PROFILE_SESSION_SCRIPT_PATH = path.resolve(ROOT, String(process.env.INSTAGRAM_PROFILE_SESSION_SCRIPT_PATH || path.join('scripts', 'instagram-profile-session-scraper.mjs')).trim() || path.join('scripts', 'instagram-profile-session-scraper.mjs'));
const INSTAGRAM_CONTENT_SESSION_SCRIPT_PATH = path.resolve(ROOT, String(process.env.INSTAGRAM_CONTENT_SESSION_SCRIPT_PATH || path.join('scripts', 'instagram-content-session-scraper.mjs')).trim() || path.join('scripts', 'instagram-content-session-scraper.mjs'));
const INSTAGRAM_META_SUITE_STORAGE_PATH = path.resolve(ROOT, String(process.env.INSTAGRAM_META_SUITE_STORAGE_PATH || path.join(DATA_DIR, '.auth', 'meta-suite-instagram-storage.json')).trim() || path.join(DATA_DIR, '.auth', 'meta-suite-instagram-storage.json'));
const INSTAGRAM_META_SUITE_URL = String(process.env.INSTAGRAM_META_SUITE_URL || 'https://business.facebook.com/latest/insights').trim() || 'https://business.facebook.com/latest/insights';
const INSTAGRAM_META_SUITE_TIMEOUT_MS = Math.max(5_000, parsePositiveInt(process.env.INSTAGRAM_META_SUITE_TIMEOUT_MS, 45_000));
const INSTAGRAM_META_SUITE_HEADLESS = !parseBool(process.env.INSTAGRAM_META_SUITE_HEADFUL);
const INSTAGRAM_CONTENT_CACHE_TTL_MS = Math.max(60_000, parsePositiveInt(process.env.INSTAGRAM_CONTENT_CACHE_TTL_MS, 10 * 60_000));
const INSTAGRAM_GRAPH_PAGE_ID = String(process.env.INSTAGRAM_GRAPH_PAGE_ID || META_GRAPH_PAGE_ID || '').trim();
const INSTAGRAM_GRAPH_ACCOUNT_ID = String(process.env.INSTAGRAM_GRAPH_ACCOUNT_ID || '').trim();
const INSTAGRAM_GRAPH_ACCESS_TOKEN = String(process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN || META_GRAPH_PAGE_ACCESS_TOKEN || '').trim();
const INSTAGRAM_GRAPH_TIMEOUT_MS = Math.max(1000, parsePositiveInt(process.env.INSTAGRAM_GRAPH_TIMEOUT_MS, META_GRAPH_TIMEOUT_MS));
const INSTAGRAM_GRAPH_LOOKBACK_DAYS = Math.max(1, Math.min(30, parsePositiveInt(process.env.INSTAGRAM_GRAPH_LOOKBACK_DAYS, 7)));
const INSTAGRAM_GRAPH_MEDIA_LIMIT = Math.max(1, Math.min(24, parsePositiveInt(process.env.INSTAGRAM_GRAPH_MEDIA_LIMIT, 12)));
const TIKTOK_PROFILE_HANDLE = String(process.env.TIKTOK_PROFILE_HANDLE || 'ablastfromtheads').trim().replace(/^@+/, '');
const TIKTOK_PROFILE_NAME = String(process.env.TIKTOK_PROFILE_NAME || 'Blast From The Ads').trim() || 'Blast From The Ads';
const TIKTOK_PROFILE_URL = String(process.env.TIKTOK_PROFILE_URL || ('https://www.tiktok.com/@' + TIKTOK_PROFILE_HANDLE)).trim() || ('https://www.tiktok.com/@' + TIKTOK_PROFILE_HANDLE);
const TIKTOK_FOLLOWERS_COUNT = parsePositiveInt(process.env.TIKTOK_FOLLOWERS_COUNT, NaN);
const TIKTOK_FOLLOWERS_PATH = path.join(DATA_DIR, 'tiktok-followers.json');
const TIKTOK_FOLLOWERS_LOG_PATH = path.join(LOG_DIR, 'tiktok-followers-poller.log');
const TIKTOK_FOLLOWERS_HISTORY_LIMIT = 1440;
const TIKTOK_POLL_INTERVAL_MS = Math.max(60_000, parsePositiveInt(process.env.TIKTOK_POLL_INTERVAL_MS, 180_000));
const YOUTUBE_CHANNEL_URL = String(process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@Blastfromtheads').trim() || 'https://www.youtube.com/@Blastfromtheads';
const YOUTUBE_CHANNEL_NAME = String(process.env.YOUTUBE_CHANNEL_NAME || 'Blast From The Ads').trim() || 'Blast From The Ads';
const YOUTUBE_SUBSCRIBERS_COUNT = parsePositiveInt(process.env.YOUTUBE_SUBSCRIBERS_COUNT, NaN);
const YOUTUBE_SUBSCRIBERS_PATH = path.join(DATA_DIR, 'youtube-subscribers.json');
const YOUTUBE_SUBSCRIBERS_LOG_PATH = path.join(LOG_DIR, 'youtube-subscribers-poller.log');
const YOUTUBE_SUBSCRIBERS_HISTORY_LIMIT = 1440;
const YOUTUBE_POLL_INTERVAL_MS = Math.max(60_000, parsePositiveInt(process.env.YOUTUBE_POLL_INTERVAL_MS, 180_000));

const ROUTE_MANIFEST = buildRouteManifest({
  limits: {
    action: REQUEST_BODY_LIMIT_ACTION_BYTES,
    state: REQUEST_BODY_LIMIT_STATE_BYTES,
    rss: REQUEST_BODY_LIMIT_RSS_BYTES,
  },
  remote: {
    state: () => STATE_API_ALLOW_REMOTE,
    relay: () => ROWAN_ALLOW_REMOTE,
    camera: () => CAMERA_PROXY_ALLOW_REMOTE,
    rss: () => RSS_FETCH_ALLOW_REMOTE,
    gas: () => GAS_PROXY_ALLOW_REMOTE,
    crypto: () => CRYPTO_PROXY_ALLOW_REMOTE,
    system: () => SYS_MONITOR_ALLOW_REMOTE,
    speedTest: () => SPEED_TEST_ALLOW_REMOTE,
    devices: () => HOME_DEVICE_ALLOW_REMOTE,
    email: () => EMAIL_UNREAD_ALLOW_REMOTE,
    ebay: () => EBAY_TRAFFIC_ALLOW_REMOTE,
    social: () => META_GRAPH_ALLOW_REMOTE,
  },
});

const WORK_COORDINATOR = createWorkCoordinator({
  globalLimit: OUTBOUND_MAX_CONCURRENCY,
  perIntegrationLimit: 1,
  perHostLimit: OUTBOUND_PER_HOST_CONCURRENCY,
});
const rssFeedCache = new Map();

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

let facebookGroupMembersState = {
  schemaVersion: 1,
  group: { url: FACEBOOK_GROUP_URL, name: 'Blast From the Ads Community' },
  latest: null,
  status: { ok: false, setupRequired: !FACEBOOK_GROUP_URL, lastSuccessAt: '', lastAttemptAt: '', consecutiveFailures: 0, lastError: '' },
  history: [],
  updatedAt: '',
};
let facebookGroupMembersPollTimer = null;
let facebookGroupMembersPollInFlight = null;
let facebookContentCacheState = {
  payload: null,
  expiresAt: 0,
  lastAttemptAt: '',
  lastSuccessAt: '',
  consecutiveFailures: 0,
  lastError: '',
};

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
let instagramContentCacheState = {
  payload: null,
  expiresAt: 0,
  lastAttemptAt: '',
  lastSuccessAt: '',
  consecutiveFailures: 0,
  lastError: '',
};
let instagramGraphProfileCache = {
  profile: null,
  expiresAt: 0,
  lastError: '',
};

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
let ebayTrafficCacheState = {
  payload: null,
  expiresAt: 0,
  lastAttemptAt: '',
  lastSuccessAt: '',
  consecutiveFailures: 0,
  lastError: '',
  rateLimitedUntil: 0,
};
let ebayTrafficFetchInFlight = null;
const ebayMarketingReportState = new Map();

const ebayPersistedTrafficPayload = loadPersistedEbayTrafficCache();
if (ebayPersistedTrafficPayload) {
  ebayTrafficCacheState.payload = deepClone(ebayPersistedTrafficPayload);
  ebayTrafficCacheState.lastSuccessAt = String(ebayPersistedTrafficPayload.fetchedAt || '');
}

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

function ensureFacebookGroupMembersShape(input){
  const base = input && typeof input === 'object' ? input : {};
  const historyRaw = Array.isArray(base.history) ? base.history : [];
  return {
    schemaVersion: 1,
    group: {
      url: String(base?.group?.url || FACEBOOK_GROUP_URL || '').trim(),
      name: String(base?.group?.name || 'Blast From the Ads Community').trim() || 'Blast From the Ads Community',
    },
    latest: base.latest && typeof base.latest === 'object' ? {
      membersCount: Number.isFinite(Number(base.latest.membersCount)) ? Number(base.latest.membersCount) : null,
      fetchedAt: String(base.latest.fetchedAt || '').trim(),
      source: String(base.latest.source || 'facebook_group_playwright').trim() || 'facebook_group_playwright',
      requestId: String(base.latest.requestId || '').trim(),
      latencyMs: Number.isFinite(Number(base.latest.latencyMs)) ? Math.max(0, Number(base.latest.latencyMs)) : 0,
      stale: !!base.latest.stale,
    } : null,
    status: {
      ok: !!base?.status?.ok,
      setupRequired: !!base?.status?.setupRequired,
      lastSuccessAt: String(base?.status?.lastSuccessAt || '').trim(),
      lastAttemptAt: String(base?.status?.lastAttemptAt || '').trim(),
      consecutiveFailures: Number.isFinite(Number(base?.status?.consecutiveFailures)) ? Math.max(0, Number(base.status.consecutiveFailures)) : 0,
      lastError: String(base?.status?.lastError || '').trim().slice(0, 280),
    },
    history: historyRaw.map((h) => ({
      membersCount: Number.isFinite(Number(h?.membersCount)) ? Number(h.membersCount) : null,
      fetchedAt: String(h?.fetchedAt || '').trim(),
    })).filter((h) => Number.isFinite(h.membersCount) && h.fetchedAt).slice(-FACEBOOK_GROUP_MEMBERS_HISTORY_LIMIT),
    updatedAt: String(base.updatedAt || '').trim(),
  };
}

async function persistFacebookGroupMembersState(){
  const body = JSON.stringify(ensureFacebookGroupMembersShape(facebookGroupMembersState), null, 2);
  const tmpPath = FACEBOOK_GROUP_MEMBERS_PATH + '.tmp';
  await fsp.mkdir(path.dirname(FACEBOOK_GROUP_MEMBERS_PATH), { recursive: true });
  await fsp.writeFile(tmpPath, body, 'utf8');
  await fsp.rename(tmpPath, FACEBOOK_GROUP_MEMBERS_PATH);
}

async function loadFacebookGroupMembersState(){
  try {
    const raw = await fsp.readFile(FACEBOOK_GROUP_MEMBERS_PATH, 'utf8');
    const parsed = parseJsonSafely(raw, 'facebook_group_members_state');
    if (!parsed.ok) return;
    facebookGroupMembersState = ensureFacebookGroupMembersShape(parsed.value);
  } catch {}
}

async function appendFacebookGroupMembersLog(event){
  try {
    await fsp.mkdir(path.dirname(FACEBOOK_GROUP_MEMBERS_LOG_PATH), { recursive: true });
    await fsp.appendFile(FACEBOOK_GROUP_MEMBERS_LOG_PATH, JSON.stringify(event) + '\n', 'utf8');
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

function decodeXmlEntities(value){
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function stripHtmlTags(value){
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function readXmlTagText(block, tag){
  const match = String(block || '').match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXmlEntities(match[1]).trim() : '';
}

function readXmlAttr(block, tag, attr){
  const match = String(block || '').match(new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"[^>]*>`, 'i'));
  return match ? decodeXmlEntities(match[1]).trim() : '';
}

function extractUnreadEmailAtomFeed(xml){
  const source = String(xml || '').trim();
  const fullCountRaw = readXmlTagText(source, 'fullcount');
  const unreadCount = Number(fullCountRaw);
  if (!Number.isFinite(unreadCount) || unreadCount < 0) {
    throw new Error('Unread email feed did not include a valid <fullcount>.');
  }

  const entries = [];
  const entryMatches = source.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const block of entryMatches.slice(0, 10)) {
    const rawSummary = readXmlTagText(block, 'summary');
    entries.push({
      title: stripHtmlTags(readXmlTagText(block, 'title')).slice(0, 180),
      summary: stripHtmlTags(rawSummary).slice(0, 280),
      authorName: stripHtmlTags(readXmlTagText(block, 'name')).slice(0, 120),
      authorEmail: stripHtmlTags(readXmlTagText(block, 'email')).slice(0, 160),
      issuedAt: readXmlTagText(block, 'issued'),
      link: readXmlAttr(block, 'link', 'href').slice(0, 500),
    });
  }

  return {
    unreadCount,
    entries,
  };
}

function getEmailUnreadAccountConfigs(){
  const accounts = [];

  if (EMAIL_UNREAD_ACCOUNTS_JSON) {
    try {
      const parsed = JSON.parse(EMAIL_UNREAD_ACCOUNTS_JSON);
      if (Array.isArray(parsed)) {
        parsed.forEach((entry, index) => {
          const item = entry && typeof entry === 'object' ? entry : {};
          const username = String(item.username || item.account || item.email || '').trim();
          const appPassword = normalizeEmailUnreadAppPassword(item.appPassword || item.password);
          const label = String(item.label || item.name || username || `Account ${index + 1}`).trim().slice(0, 60);
          const feedUrl = String(item.feedUrl || item.url || EMAIL_UNREAD_URL).trim() || EMAIL_UNREAD_URL;
          const openUrl = normalizeEmailUnreadOpenUrl(item.openUrl || item.inboxUrl || EMAIL_UNREAD_OPEN_URL) || EMAIL_UNREAD_OPEN_URL;
          const sentOpenUrl = normalizeEmailUnreadOpenUrl(item.sentOpenUrl || item.sentUrl || defaultSentOpenUrl(openUrl));
          const includeSent = parseBool(item.includeSent);
          if (!username && !appPassword && !label) return;
          accounts.push({
            id: `email-${index + 1}`,
            username,
            appPassword,
            label: label || `Account ${index + 1}`,
            feedUrl,
            openUrl,
            sentOpenUrl,
            includeSent,
          });
        });
      }
    } catch (error) {
      const err = new Error(`EMAIL_UNREAD_ACCOUNTS_JSON is not valid JSON: ${error?.message || error}`);
      err.status = 400;
      throw err;
    }
  }

  if (!accounts.length) {
    accounts.push({
      id: 'email-1',
      username: EMAIL_UNREAD_USERNAME,
      appPassword: EMAIL_UNREAD_APP_PASSWORD,
      label: EMAIL_UNREAD_LABEL || (EMAIL_UNREAD_USERNAME || 'Inbox'),
      feedUrl: EMAIL_UNREAD_URL,
      openUrl: EMAIL_UNREAD_OPEN_URL,
      sentOpenUrl: defaultSentOpenUrl(EMAIL_UNREAD_OPEN_URL),
      includeSent: false,
    });
  }

  return accounts.slice(0, 12).map((account, index) => ({
    id: String(account.id || `email-${index + 1}`),
    username: String(account.username || '').trim(),
    appPassword: String(account.appPassword || '').trim(),
    label: String(account.label || account.username || `Account ${index + 1}`).trim().slice(0, 60),
    feedUrl: String(account.feedUrl || EMAIL_UNREAD_URL).trim() || EMAIL_UNREAD_URL,
    openUrl: normalizeEmailUnreadOpenUrl(account.openUrl || EMAIL_UNREAD_OPEN_URL) || EMAIL_UNREAD_OPEN_URL,
    sentOpenUrl: normalizeEmailUnreadOpenUrl(account.sentOpenUrl || defaultSentOpenUrl(account.openUrl || EMAIL_UNREAD_OPEN_URL)),
    includeSent: !!account.includeSent,
  }));
}

function emailUnreadSetupPayload(){
  const accounts = getEmailUnreadAccountConfigs().map((account) => ({
    id: account.id,
    label: account.label,
    account: account.username,
    unreadCount: null,
    entries: [],
    recentEntries: [],
    sentEntries: [],
    inboxUrl: account.openUrl,
    sentOpenUrl: account.sentOpenUrl,
    includeSent: !!account.includeSent,
    fetchedAt: '',
    status: (account.username && account.appPassword) ? 'configured' : 'setup',
    message: (account.username && account.appPassword)
      ? 'Configured. Refresh after the server restarts.'
      : 'Add username and app password.',
  }));
  return {
    ok: true,
    provider: EMAIL_UNREAD_PROVIDER,
    configured: false,
    setupRequired: true,
    label: EMAIL_UNREAD_LABEL,
    account: EMAIL_UNREAD_USERNAME || '',
    accountCount: accounts.length,
    accounts,
    unreadCount: null,
    entries: [],
    inboxUrl: EMAIL_UNREAD_OPEN_URL,
    fetchedAt: '',
    message: 'Set Gmail unread-email credentials in .env to enable this pod.',
  };
}

function normalizeEbayTrafficStoreUrl(value) {
  return String(value || '').trim();
}

function getEbayTrafficStoreConfigs() {
  const stores = [];

  if (EBAY_TRAFFIC_STORES_JSON) {
    try {
      const parsed = JSON.parse(EBAY_TRAFFIC_STORES_JSON);
      if (Array.isArray(parsed)) {
        parsed.forEach((entry, index) => {
          const item = entry && typeof entry === 'object' ? entry : {};
          const label = String(item.label || item.name || `Store ${index + 1}`).trim().slice(0, 80);
          stores.push({
            id: String(item.id || `ebay-store-${index + 1}`).trim() || `ebay-store-${index + 1}`,
            label: label || `Store ${index + 1}`,
            marketplaceId: String(item.marketplaceId || item.marketplace || EBAY_TRAFFIC_MARKETPLACE_ID).trim().toUpperCase() || EBAY_TRAFFIC_MARKETPLACE_ID,
            clientId: String(item.clientId || item.appId || '').trim(),
            clientSecret: String(item.clientSecret || item.certId || '').trim(),
            refreshToken: String(item.refreshToken || '').trim(),
            scope: String(item.scope || EBAY_TRAFFIC_SCOPE).trim() || EBAY_TRAFFIC_SCOPE,
            storeUrl: normalizeEbayTrafficStoreUrl(item.storeUrl || item.url || item.openUrl || ''),
            rangeDays: Math.max(1, Math.min(90, parsePositiveInt(item.rangeDays, EBAY_TRAFFIC_RANGE_DAYS))),
          });
        });
      }
    } catch (error) {
      const err = new Error(`EBAY_TRAFFIC_STORES_JSON is not valid JSON: ${error?.message || error}`);
      err.status = 400;
      throw err;
    }
  }

  if (!stores.length) {
    stores.push({
      id: 'ebay-store-1',
      label: EBAY_TRAFFIC_LABEL,
      marketplaceId: EBAY_TRAFFIC_MARKETPLACE_ID,
      clientId: EBAY_TRAFFIC_CLIENT_ID,
      clientSecret: EBAY_TRAFFIC_CLIENT_SECRET,
      refreshToken: EBAY_TRAFFIC_REFRESH_TOKEN,
      scope: EBAY_TRAFFIC_SCOPE,
      storeUrl: EBAY_TRAFFIC_STORE_URL,
      rangeDays: EBAY_TRAFFIC_RANGE_DAYS,
    });
  }

  return stores.slice(0, 12).map((store, index) => ({
    id: String(store.id || `ebay-store-${index + 1}`).trim() || `ebay-store-${index + 1}`,
    label: String(store.label || `Store ${index + 1}`).trim().slice(0, 80) || `Store ${index + 1}`,
    marketplaceId: String(store.marketplaceId || EBAY_TRAFFIC_MARKETPLACE_ID).trim().toUpperCase() || EBAY_TRAFFIC_MARKETPLACE_ID,
    clientId: String(store.clientId || '').trim(),
    clientSecret: String(store.clientSecret || '').trim(),
    refreshToken: String(store.refreshToken || '').trim(),
    scope: String(store.scope || EBAY_TRAFFIC_SCOPE).trim() || EBAY_TRAFFIC_SCOPE,
    storeUrl: normalizeEbayTrafficStoreUrl(store.storeUrl || ''),
    rangeDays: Math.max(1, Math.min(90, parsePositiveInt(store.rangeDays, EBAY_TRAFFIC_RANGE_DAYS))),
    configured: !!(String(store.clientId || '').trim() && String(store.clientSecret || '').trim() && String(store.refreshToken || '').trim()),
  }));
}

function ebayTrafficSetupPayload() {
  const stores = getEbayTrafficStoreConfigs();
  return {
    ok: true,
    configured: false,
    setupRequired: true,
    partialFailure: false,
    fetchedAt: '',
    source: 'ebay_analytics_api',
    environment: EBAY_TRAFFIC_ENVIRONMENT,
    rangeDays: EBAY_TRAFFIC_RANGE_DAYS,
    storeCount: stores.length,
    healthyStoreCount: 0,
    summary: {
      views: 0,
      impressions: 0,
      storeImpressions: 0,
      transactions: 0,
      clickThroughRate: null,
      salesConversionRate: null,
      storeSharePercent: null,
    },
    stores: stores.map((store) => ({
      id: store.id,
      label: store.label,
      marketplaceId: store.marketplaceId,
      storeUrl: store.storeUrl,
      configured: store.configured,
      setupRequired: !store.configured,
      status: store.configured ? 'configured' : 'setup',
      message: store.configured
        ? 'Configured. Refresh to fetch analytics.'
        : 'Add eBay OAuth client, secret, and refresh token.',
      rangeDays: store.rangeDays,
      summary: null,
      daily: [],
      topListings: [],
      warnings: [],
      lastUpdatedDate: '',
      fetchedAt: '',
      error: '',
    })),
    message: 'Add eBay Sell Analytics credentials in .env to enable store traffic.',
  };
}

function formatEbayTrafficOffset(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function formatEbayTrafficDateRangeValue(date, isEnd = false) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const time = isEnd ? '23:59:59.000' : '00:00:00.000';
  return `${year}-${month}-${day}T${time}${formatEbayTrafficOffset(date)}`;
}

function buildEbayTrafficDateRange(rangeDays = EBAY_TRAFFIC_RANGE_DAYS) {
  const totalDays = Math.max(1, Math.min(90, parsePositiveInt(rangeDays, EBAY_TRAFFIC_RANGE_DAYS)));
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  start.setDate(start.getDate() - (totalDays - 1));
  const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return `[${formatEbayTrafficDateRangeValue(start, false)}..${formatEbayTrafficDateRangeValue(endLocal, true)}]`;
}

function buildEbayTrafficFilter(marketplaceId, rangeDays) {
  return [
    `marketplace_ids:{${String(marketplaceId || EBAY_TRAFFIC_MARKETPLACE_ID).trim().toUpperCase() || EBAY_TRAFFIC_MARKETPLACE_ID}}`,
    `date_range:${buildEbayTrafficDateRange(rangeDays)}`,
  ].join(',');
}

function parseNumericMetric(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseEbayTrafficReport(report) {
  const metricKeys = Array.isArray(report?.header?.metrics)
    ? report.header.metrics.map((metric) => String(metric?.key || '').trim()).filter(Boolean)
    : [];
  const records = Array.isArray(report?.records) ? report.records : [];
  return {
    metricKeys,
    records: records.map((record) => {
      const dimensionValue = String(record?.dimensionValues?.[0]?.value || '').trim();
      const metrics = {};
      metricKeys.forEach((key, index) => {
        metrics[key] = parseNumericMetric(record?.metricValues?.[index]?.value);
      });
      return { dimensionValue, metrics };
    }).filter((record) => record.dimensionValue),
  };
}

function parseEbayListingMetadata(report) {
  const metadataEntries = Array.isArray(report?.dimensionMetadata) ? report.dimensionMetadata : [];
  const titleMap = new Map();
  metadataEntries.forEach((entry) => {
    if (String(entry?.metadataHeader?.key || '').trim().toUpperCase() !== 'LISTING_ID') return;
    const metadataKeys = Array.isArray(entry?.metadataHeader?.metadataKeys) ? entry.metadataHeader.metadataKeys : [];
    const titleIndex = metadataKeys.findIndex((item) => String(item?.key || '').trim().toUpperCase() === 'LISTING_TITLE');
    if (titleIndex < 0) return;
    const rows = Array.isArray(entry?.metadataRecords) ? entry.metadataRecords : [];
    rows.forEach((row) => {
      const listingId = String(row?.value?.value || '').trim();
      const title = String(row?.metadataValues?.[titleIndex]?.value || '').trim();
      if (listingId) titleMap.set(listingId, title);
    });
  });
  return titleMap;
}

function sumEbayMetric(records, key) {
  return records.reduce((total, record) => total + (Number.isFinite(Number(record?.metrics?.[key])) ? Number(record.metrics[key]) : 0), 0);
}

function weightedAverageEbayMetric(records, key, weightKey) {
  const totals = records.reduce((accumulator, record) => {
    const value = Number(record?.metrics?.[key]);
    const weight = Number(record?.metrics?.[weightKey]);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) return accumulator;
    accumulator.weighted += value * weight;
    accumulator.weight += weight;
    return accumulator;
  }, { weighted: 0, weight: 0 });
  return totals.weight > 0 ? totals.weighted / totals.weight : null;
}

function roundEbayTrafficRate(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : null;
}

function getEbayTrafficMetricValue(record, key) {
  const value = Number(record?.metrics?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function sortEbayTrafficRecordsByDay(records = []) {
  return [...(Array.isArray(records) ? records : [])].sort((left, right) => (
    String(left?.dimensionValue || '').localeCompare(String(right?.dimensionValue || ''))
  ));
}

function normalizeEbayTrafficDailyRecord(record) {
  const totalImpressions = getEbayTrafficMetricValue(record, 'TOTAL_IMPRESSION_TOTAL');
  const listingImpressions = getEbayTrafficMetricValue(record, 'LISTING_IMPRESSION_TOTAL');
  const searchImpressions = getEbayTrafficMetricValue(record, 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE');
  const storeImpressions = getEbayTrafficMetricValue(record, 'LISTING_IMPRESSION_STORE');
  const views = getEbayTrafficMetricValue(record, 'LISTING_VIEWS_TOTAL');
  const transactions = getEbayTrafficMetricValue(record, 'TRANSACTION');
  const sourceViews = {
    search: getEbayTrafficMetricValue(record, 'LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE'),
    store: getEbayTrafficMetricValue(record, 'LISTING_VIEWS_SOURCE_STORE'),
    direct: getEbayTrafficMetricValue(record, 'LISTING_VIEWS_SOURCE_DIRECT'),
    otherEbay: getEbayTrafficMetricValue(record, 'LISTING_VIEWS_SOURCE_OTHER_EBAY'),
    offEbay: getEbayTrafficMetricValue(record, 'LISTING_VIEWS_SOURCE_OFF_EBAY'),
  };
  return {
    label: record.dimensionValue,
    totalImpressions,
    impressions: totalImpressions,
    listingImpressions,
    searchImpressions,
    storeImpressions,
    views,
    transactions,
    clickThroughRate: roundEbayTrafficRate(totalImpressions > 0 ? (views / totalImpressions) * 100 : null),
    salesConversionRate: roundEbayTrafficRate(views > 0 ? (transactions / views) * 100 : null),
    sourceViews,
  };
}

function computeEbayTrafficDeltaPercent(currentValue, previousValue) {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return roundEbayTrafficRate(((current - previous) / previous) * 100);
}

function buildEbayTrafficSnapshotMetric(currentValue, previousValue) {
  const current = Number.isFinite(Number(currentValue)) ? Number(currentValue) : 0;
  const previous = Number.isFinite(Number(previousValue)) ? Number(previousValue) : 0;
  const deltaPercent = computeEbayTrafficDeltaPercent(current, previous);
  return {
    value: current,
    previousValue: previous,
    deltaPercent,
    direction: deltaPercent == null ? 'flat' : (deltaPercent > 0 ? 'up' : (deltaPercent < 0 ? 'down' : 'flat')),
  };
}

function buildEbayTrafficViewSourceBreakdown(dailyRecord) {
  const sourceViews = dailyRecord?.sourceViews && typeof dailyRecord.sourceViews === 'object' ? dailyRecord.sourceViews : {};
  const totalViews = Number(dailyRecord?.views || 0);
  return [
    ['Search results', 'search'],
    ['Store', 'store'],
    ['Off eBay', 'offEbay'],
    ['Other eBay', 'otherEbay'],
    ['Direct', 'direct'],
  ].map(([label, key]) => {
    const value = Number(sourceViews[key] || 0);
    return {
      key,
      label,
      value,
      sharePercent: totalViews > 0 ? roundEbayTrafficRate((value / totalViews) * 100) : null,
    };
  });
}

function buildEbayTrafficDailySnapshot(daily = []) {
  const records = Array.isArray(daily) ? daily : [];
  if (!records.length) return null;
  const latest = records[records.length - 1];
  const previous = records[records.length - 2] || null;
  return {
    label: latest.label,
    previousLabel: previous?.label || '',
    metrics: {
      impressions: buildEbayTrafficSnapshotMetric(latest.totalImpressions, previous?.totalImpressions),
      views: buildEbayTrafficSnapshotMetric(latest.views, previous?.views),
      quantitySold: buildEbayTrafficSnapshotMetric(latest.transactions, previous?.transactions),
      clickThroughRate: buildEbayTrafficSnapshotMetric(latest.clickThroughRate, previous?.clickThroughRate),
      salesConversionRate: buildEbayTrafficSnapshotMetric(latest.salesConversionRate, previous?.salesConversionRate),
    },
    viewSources: buildEbayTrafficViewSourceBreakdown(latest),
  };
}

function getEbayMarketingStateKey(store) {
  return [
    String(store?.id || '').trim(),
    String(store?.marketplaceId || '').trim(),
    Math.max(1, parsePositiveInt(store?.rangeDays, EBAY_TRAFFIC_RANGE_DAYS)),
  ].join('::');
}

function getEbayMarketingState(store) {
  const key = getEbayMarketingStateKey(store);
  if (!ebayMarketingReportState.has(key)) {
    ebayMarketingReportState.set(key, {
      report: null,
      reportMeta: null,
      expiresAt: 0,
      taskId: '',
      taskHref: '',
      taskStatus: '',
      lastRequestedAt: 0,
      lastPolledAt: 0,
      lastCompletedAt: 0,
      lastError: '',
    });
  }
  return ebayMarketingReportState.get(key);
}

function normalizeEbayMarketingDateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return raw;
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseEbayMarketingNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildEbayPromotionLiftWindow({
  id = 'day',
  label = '',
  sampleSize = 1,
  totalImpressions = 0,
  totalSales = 0,
  promotedImpressions = null,
  promotedSales = null,
}) {
  const impressions = Math.max(0, Number(totalImpressions || 0));
  const sales = Math.max(0, Number(totalSales || 0));
  const promotedImpr = Number.isFinite(Number(promotedImpressions)) ? Math.max(0, Number(promotedImpressions)) : null;
  const promotedSaleCount = Number.isFinite(Number(promotedSales)) ? Math.max(0, Number(promotedSales)) : null;
  const organicImpressions = Number.isFinite(promotedImpr) ? Math.max(0, impressions - promotedImpr) : null;
  const organicSales = Number.isFinite(promotedSaleCount) ? Math.max(0, sales - promotedSaleCount) : null;
  const promotedReachShare = impressions > 0 && Number.isFinite(promotedImpr) ? promotedImpr / impressions : null;
  const organicReachShare = impressions > 0 && Number.isFinite(organicImpressions) ? organicImpressions / impressions : null;
  const promotedSalesShare = sales > 0 && Number.isFinite(promotedSaleCount) ? promotedSaleCount / sales : null;
  const organicSalesShare = sales > 0 && Number.isFinite(organicSales) ? organicSales / sales : null;
  const promotedEfficiencyIndex = promotedReachShare > 0 && Number.isFinite(promotedSalesShare)
    ? promotedSalesShare / promotedReachShare
    : null;
  const organicEfficiencyIndex = organicReachShare > 0 && Number.isFinite(organicSalesShare)
    ? organicSalesShare / organicReachShare
    : null;
  const liftVsOrganicPercent = organicEfficiencyIndex > 0 && Number.isFinite(promotedEfficiencyIndex)
    ? roundEbayTrafficRate(((promotedEfficiencyIndex - organicEfficiencyIndex) / organicEfficiencyIndex) * 100)
    : null;
  const resolvedSampleSize = Math.max(1, parsePositiveInt(sampleSize, 1));
  const confidenceLevel = sales >= 12
    ? 'high'
    : sales >= 6
      ? 'medium'
      : 'low';
  const confidenceLabel = confidenceLevel === 'high'
    ? 'Higher confidence'
    : confidenceLevel === 'medium'
      ? 'Moderate confidence'
      : 'Low confidence';
  const confidenceReason = confidenceLevel === 'high'
    ? `${sales} sales across ${resolvedSampleSize} day${resolvedSampleSize === 1 ? '' : 's'} gives this read a steadier base.`
    : confidenceLevel === 'medium'
      ? `${sales} sales across ${resolvedSampleSize} day${resolvedSampleSize === 1 ? '' : 's'} is useful, but still a bit swingy.`
      : `${sales} sale${sales === 1 ? '' : 's'} across ${resolvedSampleSize} day${resolvedSampleSize === 1 ? '' : 's'} means this read can move fast.`;
  return {
    id,
    label,
    sampleSize: resolvedSampleSize,
    totalImpressions: impressions,
    totalSales: sales,
    promotedImpressions: promotedImpr,
    organicImpressions,
    promotedSales: promotedSaleCount,
    organicSales,
    promotedImpressionsPerDay: Number.isFinite(promotedImpr) ? roundEbayTrafficRate(promotedImpr / Math.max(1, parsePositiveInt(sampleSize, 1))) : null,
    organicImpressionsPerDay: Number.isFinite(organicImpressions) ? roundEbayTrafficRate(organicImpressions / Math.max(1, parsePositiveInt(sampleSize, 1))) : null,
    promotedSalesPerDay: Number.isFinite(promotedSaleCount) ? roundEbayTrafficRate(promotedSaleCount / Math.max(1, parsePositiveInt(sampleSize, 1))) : null,
    organicSalesPerDay: Number.isFinite(organicSales) ? roundEbayTrafficRate(organicSales / Math.max(1, parsePositiveInt(sampleSize, 1))) : null,
    promotedReachSharePercent: Number.isFinite(promotedReachShare) ? roundEbayTrafficRate(promotedReachShare * 100) : null,
    organicReachSharePercent: Number.isFinite(organicReachShare) ? roundEbayTrafficRate(organicReachShare * 100) : null,
    promotedSalesSharePercent: Number.isFinite(promotedSalesShare) ? roundEbayTrafficRate(promotedSalesShare * 100) : null,
    organicSalesSharePercent: Number.isFinite(organicSalesShare) ? roundEbayTrafficRate(organicSalesShare * 100) : null,
    promotedEfficiencyIndex: Number.isFinite(promotedEfficiencyIndex) ? roundEbayTrafficRate(promotedEfficiencyIndex) : null,
    organicEfficiencyIndex: Number.isFinite(organicEfficiencyIndex) ? roundEbayTrafficRate(organicEfficiencyIndex) : null,
    liftVsOrganicPercent,
    leader: Number.isFinite(liftVsOrganicPercent)
      ? (liftVsOrganicPercent > 3 ? 'promoted' : liftVsOrganicPercent < -3 ? 'organic' : 'even')
      : '',
    estimated: true,
    confidence: {
      level: confidenceLevel,
      label: confidenceLabel,
      reason: confidenceReason,
    },
  };
}

function parseEbayMarketingReport(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length < 2) return { rows: [], headers: [] };
  const headers = lines[0].split('\t').map((header) => String(header || '').trim());
  const normalizedHeaders = headers.map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const values = line.split('\t');
    const entry = {};
    normalizedHeaders.forEach((header, index) => {
      entry[header] = values[index] == null ? '' : String(values[index]).trim();
    });
    const label = String(entry.day || entry.date || '').trim();
    return {
      label,
      dayKey: normalizeEbayMarketingDateKey(label),
      impressions: parseEbayMarketingNumber(entry.impressions),
      clicks: parseEbayMarketingNumber(entry.clicks),
      sales: parseEbayMarketingNumber(entry.sales),
      ctr: parseEbayMarketingNumber(entry.ctr),
      channels: String(entry.channels || '').trim(),
    };
  }).filter((row) => row.dayKey);
  return { rows, headers };
}

function buildEbayMarketingDateRange(rangeDays = EBAY_TRAFFIC_RANGE_DAYS) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(6, Math.min(30, parsePositiveInt(rangeDays, EBAY_TRAFFIC_RANGE_DAYS) - 1)));
  start.setUTCHours(0, 0, 0, 0);
  return {
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
  };
}

async function fetchEbayMarketingJson(accessToken, input, init = {}) {
  const response = await coordinatedSafeFetch(input, {
      method: init.method || 'GET',
      timeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      firstByteTimeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      maxBytes: 5 * 1024 * 1024,
      maxRedirects: 2,
      allowedHosts: EBAY_ALLOWED_HOSTS,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
  }, { integration: 'ebay', key: `ebay:marketing:${new URL(input).pathname}` });
  const text = await response.text();
  const parsed = parseJsonSafely(text || '{}', 'ebay_marketing_response');
  const payload = parsed.ok && parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
  if (!response.ok) {
    const message = String(
      payload?.errors?.[0]?.longMessage
      || payload?.errors?.[0]?.message
      || payload?.message
      || `HTTP ${response.status}`
    ).trim();
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return { payload, headers: response.headers, status: response.status };
}

async function createEbayMarketingReportTask(accessToken, store) {
  const range = buildEbayMarketingDateRange(store?.rangeDays);
  const url = new URL('/sell/marketing/v1/ad_report_task', EBAY_MARKETING_API_URL);
  const { payload, headers } = await fetchEbayMarketingJson(accessToken, url, {
    method: 'POST',
    body: {
      reportType: 'ACCOUNT_PERFORMANCE_REPORT',
      reportFormat: 'TSV_GZIP',
      marketplaceId: store?.marketplaceId || EBAY_TRAFFIC_MARKETPLACE_ID,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      dimensions: [{ dimensionKey: 'day' }],
      metricKeys: ['impressions', 'clicks', 'sales', 'ctr'],
    },
  });
  return {
    payload,
    taskHref: String(headers.get('location') || '').trim(),
  };
}

async function fetchEbayMarketingReportTask(accessToken, taskHrefOrId) {
  const target = String(taskHrefOrId || '').trim();
  if (!target) return null;
  const url = /^https?:\/\//i.test(target)
    ? target
    : new URL(`/sell/marketing/v1/ad_report_task/${encodeURIComponent(target)}`, EBAY_MARKETING_API_URL);
  const { payload } = await fetchEbayMarketingJson(accessToken, url);
  return payload;
}

async function fetchRecentSuccessfulEbayMarketingReportTask(accessToken, store) {
  const url = new URL('/sell/marketing/v1/ad_report_task', EBAY_MARKETING_API_URL);
  url.searchParams.set('limit', '10');
  const { payload } = await fetchEbayMarketingJson(accessToken, url);
  const tasks = Array.isArray(payload?.reportTasks) ? payload.reportTasks : [];
  return tasks.find((task) => (
    String(task?.reportTaskStatus || '').trim().toUpperCase() === 'SUCCESS'
    && String(task?.reportType || '').trim() === 'ACCOUNT_PERFORMANCE_REPORT'
    && String(task?.marketplaceId || '').trim().toUpperCase() === String(store?.marketplaceId || '').trim().toUpperCase()
    && String(task?.reportHref || '').trim()
  )) || null;
}

async function downloadEbayMarketingReport(accessToken, reportHref) {
  const target = String(reportHref || '').trim();
  if (!target) return { rows: [], headers: [] };
  const response = await coordinatedSafeFetch(target, {
      method: 'GET',
      timeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      firstByteTimeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      maxBytes: 10 * 1024 * 1024,
      maxRedirects: 2,
      allowedHosts: EBAY_ALLOWED_HOSTS,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: '*/*',
      },
  }, { integration: 'ebay', key: `ebay:marketing-report:${new URL(target).pathname}` });
  if (!response.ok) {
    const message = `Unable to download eBay marketing report (HTTP ${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
    ? zlib.gunzipSync(buffer).toString('utf8')
    : buffer.toString('utf8');
  return parseEbayMarketingReport(text);
}

function createEbayMarketingReportMeta(task = null) {
  return {
    reportTaskId: String(task?.reportTaskId || '').trim(),
    reportId: String(task?.reportId || '').trim(),
    reportTaskStatus: String(task?.reportTaskStatus || '').trim().toUpperCase(),
    reportTaskCreationDate: String(task?.reportTaskCreationDate || '').trim(),
    reportTaskCompletionDate: String(task?.reportTaskCompletionDate || '').trim(),
    reportExpirationDate: String(task?.reportExpirationDate || '').trim(),
    reportUpdatedAt: String(task?.reportTaskCompletionDate || task?.reportTaskCreationDate || '').trim(),
  };
}

function buildEbayPromotionMixFromReport(report, baselineStore, options = {}) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const reportMeta = options?.reportMeta && typeof options.reportMeta === 'object' ? options.reportMeta : null;
  const targetDayKey = normalizeEbayMarketingDateKey(baselineStore?.dailySnapshot?.label || baselineStore?.lastUpdatedDate || '');
  const dailyRecords = Array.isArray(baselineStore?.daily) ? baselineStore.daily : [];
  const reportMap = new Map(rows.map((row) => [row.dayKey, row]));
  const matchedRow = rows.find((row) => row.dayKey === targetDayKey)
    || [...rows].reverse().find((row) => !targetDayKey || row.dayKey <= targetDayKey)
    || rows[rows.length - 1]
    || null;
  const totalImpressions = Number(baselineStore?.dailySnapshot?.metrics?.impressions?.value || 0);
  const totalSales = Math.max(0, Number(baselineStore?.dailySnapshot?.metrics?.quantitySold?.value || 0));
  const promotedImpressions = matchedRow ? Math.max(0, Number(matchedRow.impressions || 0)) : null;
  const offsiteImpressions = 0;
  const organicImpressions = Number.isFinite(promotedImpressions)
    ? Math.max(0, totalImpressions - promotedImpressions - offsiteImpressions)
    : null;
  const promotedSales = matchedRow ? Math.max(0, Number(matchedRow.sales || 0)) : null;
  const organicSales = Number.isFinite(promotedSales) ? Math.max(0, totalSales - promotedSales) : null;
  const dailyLift = buildEbayPromotionLiftWindow({
    id: 'day',
    label: targetDayKey || matchedRow?.dayKey || '',
    sampleSize: 1,
    totalImpressions,
    totalSales,
    promotedImpressions,
    promotedSales,
  });
  const overlappingDays = dailyRecords
    .map((entry) => {
      const dayKey = normalizeEbayMarketingDateKey(entry?.label || '');
      const reportRow = reportMap.get(dayKey);
      if (!dayKey || !reportRow) return null;
      return {
        dayKey,
        totalImpressions: Math.max(0, Number(entry?.totalImpressions || entry?.impressions || 0)),
        totalSales: Math.max(0, Number(entry?.transactions || 0)),
        promotedImpressions: Math.max(0, Number(reportRow?.impressions || 0)),
        promotedSales: Math.max(0, Number(reportRow?.sales || 0)),
      };
    })
    .filter(Boolean)
    .slice(-7);
  const avg7Lift = overlappingDays.length >= 2
    ? buildEbayPromotionLiftWindow({
        id: 'avg7',
        label: overlappingDays[overlappingDays.length - 1]?.dayKey || '',
        sampleSize: overlappingDays.length,
        totalImpressions: overlappingDays.reduce((sum, entry) => sum + Number(entry.totalImpressions || 0), 0),
        totalSales: overlappingDays.reduce((sum, entry) => sum + Number(entry.totalSales || 0), 0),
        promotedImpressions: overlappingDays.reduce((sum, entry) => sum + Number(entry.promotedImpressions || 0), 0),
        promotedSales: overlappingDays.reduce((sum, entry) => sum + Number(entry.promotedSales || 0), 0),
      })
    : null;
  const baseImpressions = Math.max(
    1,
    totalImpressions,
    Number.isFinite(promotedImpressions) ? promotedImpressions : 0,
    Number.isFinite(organicImpressions) ? organicImpressions : 0
  );
  const reportStatus = String(options.taskStatus || '').trim().toUpperCase();
  const warnings = [...(Array.isArray(options.warnings) ? options.warnings : [])];
  if (!matchedRow && reportStatus && reportStatus !== 'SUCCESS') {
    warnings.push('Promoted-listing report is warming up. Showing the latest analytics snapshot until eBay finishes the export.');
  }
  if (!matchedRow && reportStatus === 'SUCCESS') {
    warnings.push('eBay returned a marketing report, but it did not include a day that matches the current analytics snapshot.');
  }
  return {
    status: matchedRow ? 'ok' : (reportStatus && reportStatus !== 'SUCCESS' ? 'pending' : 'unavailable'),
    taskStatus: reportStatus || '',
    label: matchedRow?.dayKey || targetDayKey || '',
    sourceLabel: matchedRow?.label || '',
    totalImpressions,
    promotedImpressions,
    organicImpressions,
    offsiteImpressions,
    promotedClicks: matchedRow ? Math.max(0, Number(matchedRow.clicks || 0)) : null,
    totalSales,
    promotedSales,
    organicSales,
    promotedCtr: matchedRow ? roundEbayTrafficRate(Number(matchedRow.ctr || 0) * 100) : null,
    reportUpdatedAt: String(reportMeta?.reportUpdatedAt || '').trim(),
    reportTaskCompletionDate: String(reportMeta?.reportTaskCompletionDate || '').trim(),
    reportTaskCreationDate: String(reportMeta?.reportTaskCreationDate || '').trim(),
    reportStatusLabel: String(reportMeta?.reportTaskStatus || reportStatus || '').trim(),
    lift: dailyLift,
    liftWindows: {
      day: dailyLift,
      avg7: avg7Lift,
    },
    items: Number.isFinite(promotedImpressions)
      ? [
          {
            id: 'organic',
            label: 'Organic',
            description: 'Impressions on eBay that were not driven by promoted listings.',
            value: organicImpressions,
            sharePercent: roundEbayTrafficRate((Math.max(0, organicImpressions || 0) / baseImpressions) * 100),
          },
          {
            id: 'promoted',
            label: 'Promoted listings',
            description: 'Impressions attributed to your promoted listings campaigns.',
            value: promotedImpressions,
            sharePercent: roundEbayTrafficRate((promotedImpressions / baseImpressions) * 100),
          },
          {
            id: 'offsite',
            label: 'Promoted offsite',
            description: 'Off-eBay promoted impression share returned by the report.',
            value: offsiteImpressions,
            sharePercent: 0,
          },
        ]
      : [],
    warnings: warnings.slice(0, 6),
  };
}

async function hydrateEbayPromotionMixFromRecentReport(accessToken, store, state) {
  try {
    const recentTask = await fetchRecentSuccessfulEbayMarketingReportTask(accessToken, store);
    if (!recentTask?.reportHref) return false;
    state.report = await downloadEbayMarketingReport(accessToken, recentTask.reportHref);
    state.reportMeta = createEbayMarketingReportMeta(recentTask);
    state.expiresAt = Date.now() + EBAY_MARKETING_REPORT_CACHE_TTL_MS;
    state.lastCompletedAt = Date.now();
    state.taskStatus = 'SUCCESS';
    state.lastError = '';
    return true;
  } catch (error) {
    state.lastError = String(error?.message || error || 'Unable to bootstrap eBay marketing report.').slice(0, 200);
    return false;
  }
}

async function fetchEbayPromotionMix(accessToken, store, baselineStore) {
  const state = getEbayMarketingState(store);
  const nowTs = Date.now();
  const fallbackWarnings = [];

  if (state.report && state.expiresAt > nowTs) {
    return buildEbayPromotionMixFromReport(state.report, baselineStore, {
      taskStatus: state.taskStatus,
      reportMeta: state.reportMeta,
      warnings: fallbackWarnings,
    });
  }

  if (state.taskHref) {
    try {
      const task = await fetchEbayMarketingReportTask(accessToken, state.taskHref);
      state.taskStatus = String(task?.reportTaskStatus || '').trim().toUpperCase();
      state.taskId = String(task?.reportTaskId || state.taskId || '').trim();
      state.lastPolledAt = nowTs;
      if (state.taskStatus === 'SUCCESS' && task?.reportHref) {
        state.report = await downloadEbayMarketingReport(accessToken, task.reportHref);
        state.reportMeta = createEbayMarketingReportMeta(task);
        state.expiresAt = nowTs + EBAY_MARKETING_REPORT_CACHE_TTL_MS;
        state.lastCompletedAt = nowTs;
        state.lastError = '';
        state.taskHref = '';
        state.taskStatus = 'SUCCESS';
        return buildEbayPromotionMixFromReport(state.report, baselineStore, {
          taskStatus: 'SUCCESS',
          reportMeta: state.reportMeta,
        });
      }
      if (state.taskStatus && state.taskStatus !== 'PENDING' && state.taskStatus !== 'IN_PROGRESS') {
        state.lastError = `Marketing report task ended with ${state.taskStatus.toLowerCase()}.`;
        state.taskHref = '';
      } else if (state.report) {
        fallbackWarnings.push('Refreshing promoted-listing mix in the background. Showing the latest finished report for now.');
        return buildEbayPromotionMixFromReport(state.report, baselineStore, {
          taskStatus: state.taskStatus,
          reportMeta: state.reportMeta,
          warnings: fallbackWarnings,
        });
      } else if (await hydrateEbayPromotionMixFromRecentReport(accessToken, store, state)) {
        fallbackWarnings.push('Showing the latest finished promoted-listings report while a fresher export is still processing.');
        return buildEbayPromotionMixFromReport(state.report, baselineStore, {
          taskStatus: state.taskStatus,
          reportMeta: state.reportMeta,
          warnings: fallbackWarnings,
        });
      }
      return buildEbayPromotionMixFromReport(null, baselineStore, {
        taskStatus: state.taskStatus || 'PENDING',
        warnings: fallbackWarnings,
      });
    } catch (error) {
      state.lastError = String(error?.message || error || 'Unable to refresh eBay marketing report.').slice(0, 200);
      if (state.report) {
        fallbackWarnings.push('Promoted-listing report refresh hit a snag. Showing the latest completed report.');
        return buildEbayPromotionMixFromReport(state.report, baselineStore, {
          taskStatus: state.taskStatus,
          reportMeta: state.reportMeta,
          warnings: fallbackWarnings,
        });
      }
      return {
        status: 'unavailable',
        taskStatus: state.taskStatus || '',
        label: normalizeEbayMarketingDateKey(baselineStore?.dailySnapshot?.label || ''),
        sourceLabel: '',
        totalImpressions: Number(baselineStore?.dailySnapshot?.metrics?.impressions?.value || 0),
        promotedImpressions: null,
        organicImpressions: null,
        offsiteImpressions: 0,
        promotedClicks: null,
        promotedSales: null,
        promotedCtr: null,
        items: [],
        warnings: [state.lastError],
      };
    }
  }

  if (!state.report && await hydrateEbayPromotionMixFromRecentReport(accessToken, store, state)) {
    return buildEbayPromotionMixFromReport(state.report, baselineStore, {
      taskStatus: state.taskStatus,
      reportMeta: state.reportMeta,
      warnings: fallbackWarnings,
    });
  }

  if (!state.taskHref && nowTs - state.lastRequestedAt >= EBAY_MARKETING_REPORT_TASK_REUSE_MS) {
    try {
      const created = await createEbayMarketingReportTask(accessToken, store);
      const createdTaskId = String(created?.payload?.reportTaskId || '').trim();
      const createdTaskHref = String(created?.taskHref || '').trim();
      state.taskId = createdTaskId;
      state.taskHref = createdTaskHref || (createdTaskId ? `${EBAY_MARKETING_API_URL}/sell/marketing/v1/ad_report_task/${createdTaskId}` : '');
      state.taskStatus = 'PENDING';
      state.lastRequestedAt = nowTs;
      if (state.report) {
        fallbackWarnings.push('Refreshing promoted-listing mix in the background. Showing the latest finished report for now.');
        return buildEbayPromotionMixFromReport(state.report, baselineStore, {
          taskStatus: 'PENDING',
          reportMeta: state.reportMeta,
          warnings: fallbackWarnings,
        });
      }
      return buildEbayPromotionMixFromReport(null, baselineStore, {
        taskStatus: 'PENDING',
        warnings: ['Promoted-listing report requested from eBay. It should populate after the export finishes.'],
      });
    } catch (error) {
      state.lastError = String(error?.message || error || 'Unable to request eBay marketing report.').slice(0, 200);
      if (state.report) {
        fallbackWarnings.push('Promoted-listing refresh could not start right now. Showing the latest completed report.');
        return buildEbayPromotionMixFromReport(state.report, baselineStore, {
          taskStatus: state.taskStatus,
          reportMeta: state.reportMeta,
          warnings: fallbackWarnings,
        });
      }
      return {
        status: 'unavailable',
        taskStatus: '',
        label: normalizeEbayMarketingDateKey(baselineStore?.dailySnapshot?.label || ''),
        sourceLabel: '',
        totalImpressions: Number(baselineStore?.dailySnapshot?.metrics?.impressions?.value || 0),
        promotedImpressions: null,
        organicImpressions: null,
        offsiteImpressions: 0,
        promotedClicks: null,
        promotedSales: null,
        promotedCtr: null,
        items: [],
        warnings: [state.lastError],
      };
    }
  }

  if (state.report) {
    fallbackWarnings.push('Refreshing promoted-listing mix in the background. Showing the latest finished report for now.');
    return buildEbayPromotionMixFromReport(state.report, baselineStore, {
      taskStatus: state.taskStatus,
      reportMeta: state.reportMeta,
      warnings: fallbackWarnings,
    });
  }

  return buildEbayPromotionMixFromReport(null, baselineStore, {
    taskStatus: state.taskStatus || 'PENDING',
    warnings: ['Promoted-listing report is warming up.'],
  });
}

async function fetchEbayTradingWatchCount(accessToken, itemId) {
  const listingId = String(itemId || '').trim();
  if (!listingId) return null;
  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${listingId}</ItemID>
  <IncludeWatchCount>true</IncludeWatchCount>
  <OutputSelector>Item.WatchCount</OutputSelector>
</GetItemRequest>`;
  const response = await coordinatedSafeFetch(EBAY_TRADING_API_URL, {
      method: 'POST',
      timeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      firstByteTimeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      maxBytes: 512 * 1024,
      maxRedirects: 0,
      allowedHosts: EBAY_ALLOWED_HOSTS,
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-COMPATIBILITY-LEVEL': EBAY_TRADING_API_COMPATIBILITY_LEVEL,
        'X-EBAY-API-SITEID': EBAY_TRADING_API_SITE_ID,
        'X-EBAY-API-IAF-TOKEN': accessToken,
        Accept: 'text/xml',
      },
      body,
  }, { integration: 'ebay', key: `ebay:watch:${listingId}` });
  const xml = await response.text();
  if (!response.ok) {
    const message = readXmlTagText(xml, 'LongMessage')
      || readXmlTagText(xml, 'ShortMessage')
      || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const ack = readXmlTagText(xml, 'Ack');
  if (ack && !/^success|warning$/i.test(ack)) {
    const error = new Error(readXmlTagText(xml, 'LongMessage') || readXmlTagText(xml, 'ShortMessage') || `GetItem ${ack}`);
    error.status = 502;
    throw error;
  }
  const watchCountRaw = readXmlTagText(xml, 'WatchCount');
  const watchCount = Number(watchCountRaw);
  return Number.isFinite(watchCount) && watchCount >= 0 ? watchCount : 0;
}

async function enrichEbayTopListingsWithWatchCounts(accessToken, topListings = []) {
  const entries = Array.isArray(topListings) ? topListings : [];
  if (!entries.length) return { topListings: entries, warnings: [] };
  try {
    const watchCounts = await Promise.all(entries.map(async (entry) => {
      const watchCount = await fetchEbayTradingWatchCount(accessToken, entry?.listingId);
      return { listingId: String(entry?.listingId || ''), watchCount };
    }));
    const watchMap = new Map(watchCounts.map((entry) => [entry.listingId, entry.watchCount]));
    return {
      topListings: entries.map((entry) => ({
        ...entry,
        watchCount: Number.isFinite(Number(watchMap.get(String(entry?.listingId || ''))))
          ? Number(watchMap.get(String(entry?.listingId || '')))
          : null,
      })),
      warnings: [],
    };
  } catch (error) {
    return {
      topListings: entries.map((entry) => ({ ...entry, watchCount: null })),
      warnings: [`Watch counts are unavailable right now: ${String(error?.message || error).slice(0, 140)}`],
    };
  }
}

function normalizeEbayTrafficStoreSnapshot(store, dayReport, listingReport, options = {}) {
  const parsedDay = parseEbayTrafficReport(dayReport);
  const parsedListing = parseEbayTrafficReport(listingReport);
  const listingTitles = parseEbayListingMetadata(listingReport);
  const sortedDayRecords = sortEbayTrafficRecordsByDay(parsedDay.records);
  const views = sumEbayMetric(parsedDay.records, 'LISTING_VIEWS_TOTAL');
  const totalImpressions = sumEbayMetric(parsedDay.records, 'TOTAL_IMPRESSION_TOTAL');
  const listingImpressions = sumEbayMetric(parsedDay.records, 'LISTING_IMPRESSION_TOTAL');
  const storeImpressions = sumEbayMetric(parsedDay.records, 'LISTING_IMPRESSION_STORE');
  const searchImpressions = sumEbayMetric(parsedDay.records, 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE');
  const transactions = sumEbayMetric(parsedDay.records, 'TRANSACTION');
  const clickThroughRate = totalImpressions > 0
    ? (views / totalImpressions) * 100
    : weightedAverageEbayMetric(parsedDay.records, 'CLICK_THROUGH_RATE', 'TOTAL_IMPRESSION_TOTAL');
  const salesConversionRate = views > 0
    ? (transactions / views) * 100
    : weightedAverageEbayMetric(parsedDay.records, 'SALES_CONVERSION_RATE', 'LISTING_VIEWS_TOTAL');
  const daily = sortedDayRecords
    .map((record) => normalizeEbayTrafficDailyRecord(record))
    .slice(-Math.min(sortedDayRecords.length, 21));
  const dailySnapshot = buildEbayTrafficDailySnapshot(daily);
  const rawTopListings = parsedListing.records.slice(0, EBAY_TRAFFIC_TOP_LISTINGS_LIMIT).map((record) => {
    const listingId = record.dimensionValue;
    const listingViews = Number.isFinite(Number(record.metrics.LISTING_VIEWS_TOTAL)) ? Number(record.metrics.LISTING_VIEWS_TOTAL) : 0;
    const listingTransactions = Number.isFinite(Number(record.metrics.TRANSACTION)) ? Number(record.metrics.TRANSACTION) : 0;
    const listingStoreImpressions = Number.isFinite(Number(record.metrics.LISTING_IMPRESSION_STORE)) ? Number(record.metrics.LISTING_IMPRESSION_STORE) : 0;
    return {
      listingId,
      title: listingTitles.get(listingId) || `Listing ${listingId}`,
      views: listingViews,
      storeImpressions: listingStoreImpressions,
      transactions: listingTransactions,
      clickThroughRate: roundEbayTrafficRate(
        Number.isFinite(Number(record.metrics.CLICK_THROUGH_RATE))
          ? Number(record.metrics.CLICK_THROUGH_RATE)
          : (listingStoreImpressions > 0 ? (listingViews / listingStoreImpressions) * 100 : null)
      ),
      salesConversionRate: roundEbayTrafficRate(
        Number.isFinite(Number(record.metrics.SALES_CONVERSION_RATE))
          ? Number(record.metrics.SALES_CONVERSION_RATE)
          : (listingViews > 0 ? (listingTransactions / listingViews) * 100 : null)
      ),
    };
  });
  const topListings = Array.isArray(options?.topListings) ? options.topListings : rawTopListings;
  const warnings = [
    ...(Array.isArray(dayReport?.warnings) ? dayReport.warnings : []),
    ...(Array.isArray(listingReport?.warnings) ? listingReport.warnings : []),
    ...(Array.isArray(options?.warnings) ? options.warnings : []),
  ]
    .map((item) => String(item?.message || item?.longMessage || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  return {
    id: store.id,
    label: store.label,
    marketplaceId: store.marketplaceId,
    storeUrl: store.storeUrl,
    configured: true,
    setupRequired: false,
    status: 'ok',
    message: '',
    rangeDays: store.rangeDays,
    source: 'ebay_analytics_api',
    summary: {
      views,
      impressions: totalImpressions,
      totalImpressions,
      listingImpressions,
      storeImpressions,
      searchImpressions,
      transactions,
      clickThroughRate: roundEbayTrafficRate(clickThroughRate),
      salesConversionRate: roundEbayTrafficRate(salesConversionRate),
      storeSharePercent: listingImpressions > 0 ? roundEbayTrafficRate((storeImpressions / listingImpressions) * 100) : null,
    },
    dailySnapshot,
    daily,
    promotionMix: options?.promotionMix && typeof options.promotionMix === 'object'
      ? deepClone(options.promotionMix)
      : null,
    topListings,
    warnings,
    lastUpdatedDate: String(dayReport?.lastUpdatedDate || listingReport?.lastUpdatedDate || '').trim(),
    fetchedAt: new Date().toISOString(),
    error: '',
  };
}

async function refreshEbayTrafficAccessToken(store) {
  const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: store.refreshToken,
      scope: store.scope || EBAY_TRAFFIC_SCOPE,
    });
  const auth = Buffer.from(`${store.clientId}:${store.clientSecret}`, 'utf8').toString('base64');
  const response = await coordinatedSafeFetch(EBAY_TRAFFIC_TOKEN_URL, {
      method: 'POST',
      timeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      firstByteTimeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      maxBytes: 512 * 1024,
      maxRedirects: 0,
      allowedHosts: EBAY_ALLOWED_HOSTS,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
  }, { integration: 'ebay', key: `ebay:token:${store.id}` });
  const text = await response.text();
  const parsed = parseJsonSafely(text || '{}', 'ebay_token_response');
  const payload = parsed.ok && parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
  if (!response.ok) {
    const message = String(payload?.error_description || payload?.error || `HTTP ${response.status}`).trim();
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const accessToken = String(payload?.access_token || '').trim();
  if (!accessToken) {
    const error = new Error('eBay token response did not include access_token.');
    error.status = 502;
    throw error;
  }
  return accessToken;
}

async function fetchEbayTrafficReport({ accessToken, dimension, metrics, filter, sort = '' }) {
  const url = new URL('/sell/analytics/v1/traffic_report', EBAY_TRAFFIC_BASE_URL);
  url.searchParams.set('dimension', dimension);
  url.searchParams.set('metric', metrics.join(','));
  url.searchParams.set('filter', filter);
  if (sort) url.searchParams.set('sort', sort);
  const response = await coordinatedSafeFetch(url, {
      method: 'GET',
      timeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      firstByteTimeoutMs: EBAY_TRAFFIC_TIMEOUT_MS,
      maxBytes: 5 * 1024 * 1024,
      maxRedirects: 2,
      allowedHosts: EBAY_ALLOWED_HOSTS,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Accept-Language': 'en-US',
      },
  }, { integration: 'ebay', key: `ebay:traffic:${dimension}:${sort || 'default'}` });
  const text = await response.text();
  const parsed = parseJsonSafely(text || '{}', 'ebay_traffic_report');
  const payload = parsed.ok && parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
  if (!response.ok) {
    const message = String(payload?.errors?.[0]?.message || payload?.message || `HTTP ${response.status}`).trim();
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function fetchEbayTrafficStoreSnapshot(store) {
  const accessToken = await refreshEbayTrafficAccessToken(store);
  const filter = buildEbayTrafficFilter(store.marketplaceId, store.rangeDays);
  const dayReport = await fetchEbayTrafficReport({
    accessToken,
    dimension: 'DAY',
    metrics: [
      'TOTAL_IMPRESSION_TOTAL',
      'LISTING_VIEWS_TOTAL',
      'LISTING_IMPRESSION_TOTAL',
      'LISTING_IMPRESSION_STORE',
      'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE',
      'LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE',
      'LISTING_VIEWS_SOURCE_STORE',
      'LISTING_VIEWS_SOURCE_DIRECT',
      'LISTING_VIEWS_SOURCE_OTHER_EBAY',
      'LISTING_VIEWS_SOURCE_OFF_EBAY',
      'TRANSACTION',
      'CLICK_THROUGH_RATE',
      'SALES_CONVERSION_RATE',
    ],
    filter,
  });
  const listingReport = await fetchEbayTrafficReport({
    accessToken,
    dimension: 'LISTING',
    metrics: [
      'LISTING_VIEWS_TOTAL',
      'LISTING_IMPRESSION_STORE',
      'TRANSACTION',
      'CLICK_THROUGH_RATE',
      'SALES_CONVERSION_RATE',
    ],
    filter,
    sort: '-LISTING_VIEWS_TOTAL',
  });
  const preliminary = normalizeEbayTrafficStoreSnapshot(store, dayReport, listingReport);
  const watchCountResult = await enrichEbayTopListingsWithWatchCounts(accessToken, preliminary.topListings);
  const promotionMixResult = await fetchEbayPromotionMix(accessToken, store, preliminary);
  return normalizeEbayTrafficStoreSnapshot(store, dayReport, listingReport, {
    topListings: watchCountResult.topListings,
    promotionMix: promotionMixResult,
    warnings: [
      ...(Array.isArray(watchCountResult.warnings) ? watchCountResult.warnings : []),
      ...(Array.isArray(promotionMixResult?.warnings) ? promotionMixResult.warnings : []),
    ],
  });
}

function summarizeEbayTrafficStores(stores) {
  return stores.reduce((summary, store) => {
    if (!store?.summary) return summary;
    summary.views += Number(store.summary.views || 0);
    summary.impressions += Number(store.summary.impressions || 0);
    summary.listingImpressions += Number(store.summary.listingImpressions || 0);
    summary.storeImpressions += Number(store.summary.storeImpressions || 0);
    summary.transactions += Number(store.summary.transactions || 0);
    return summary;
  }, {
    views: 0,
    impressions: 0,
    listingImpressions: 0,
    storeImpressions: 0,
    transactions: 0,
  });
}

function loadPersistedEbayTrafficCache() {
  try {
    if (!fs.existsSync(EBAY_TRAFFIC_CACHE_PATH)) return null;
    const raw = fs.readFileSync(EBAY_TRAFFIC_CACHE_PATH, 'utf8');
    const parsed = parseJsonSafely(raw, 'ebay_traffic_cache');
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') return null;
    return Array.isArray(parsed.value.stores) ? parsed.value : null;
  } catch (error) {
    console.warn('Unable to read persisted eBay traffic cache:', error?.message || error);
    return null;
  }
}

function persistEbayTrafficCachePayload(payload) {
  try {
    if (!payload || !payload.ok || !Array.isArray(payload.stores) || !payload.stores.length) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(EBAY_TRAFFIC_CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.warn('Unable to persist eBay traffic cache:', error?.message || error);
  }
}

function isEbayTrafficRateLimitedPayload(payload) {
  const haystack = [
    String(payload?.message || ''),
    ...(Array.isArray(payload?.stores) ? payload.stores.map((store) => `${store?.message || ''} ${store?.error || ''}`) : []),
  ].join(' ').toLowerCase();
  return haystack.includes('too many requests')
    || haystack.includes('rate limit')
    || haystack.includes('rate-limited')
    || haystack.includes('429');
}

function buildStaleEbayTrafficPayloadFromCache(cachedPayload, reason = '') {
  if (!cachedPayload || typeof cachedPayload !== 'object') return null;
  const detail = String(reason || 'Showing the last successful eBay traffic snapshot while live analytics catch up.').trim();
  const payload = deepClone(cachedPayload);
  payload.ok = true;
  payload.partialFailure = false;
  payload.stale = true;
  payload.message = detail;
  payload.refreshSource = 'stale_cache';
  payload.servedAt = new Date().toISOString();
  payload.stores = (Array.isArray(payload.stores) ? payload.stores : []).map((store) => {
    if (!store || typeof store !== 'object') return store;
    const warnings = Array.isArray(store.warnings) ? store.warnings : [];
    return {
      ...store,
      status: String(store.status || '') === 'setup' ? 'setup' : 'ok',
      stale: true,
      warnings: [...warnings, detail].filter(Boolean).slice(-6),
    };
  });
  payload.healthyStoreCount = (Array.isArray(payload.stores) ? payload.stores : []).filter((store) => String(store?.status || '') === 'ok').length;
  return payload;
}

function mergeEbayTrafficWithCachedStoreState(results = [], cachedPayload = null) {
  const previousStores = Array.isArray(cachedPayload?.stores) ? cachedPayload.stores : [];
  if (!previousStores.length) return results;
  const previousMap = new Map(previousStores.map((store) => [String(store?.id || ''), store]));
  return (Array.isArray(results) ? results : []).map((store) => {
    if (!store || typeof store !== 'object') return store;
    const previous = previousMap.get(String(store.id || ''));
    const currentStatus = String(store.status || '').trim();
    const previousStatus = String(previous?.status || '').trim();
    if (currentStatus === 'error' && previous && previousStatus === 'ok') {
      const staleReason = String(store.error || store.message || 'Live eBay analytics are temporarily unavailable.');
      return {
        ...deepClone(previous),
        stale: true,
        warnings: [
          ...(Array.isArray(previous?.warnings) ? previous.warnings : []),
          `Showing the last successful eBay traffic snapshot while live analytics recover. ${staleReason}`.trim(),
        ].slice(-6),
      };
    }
    const hasCurrentListings = Array.isArray(store.topListings) && store.topListings.length > 0;
    const hasPreviousListings = Array.isArray(previous?.topListings) && previous.topListings.length > 0;
    if (hasCurrentListings || !hasPreviousListings || currentStatus !== 'ok') return store;
    return {
      ...store,
      topListings: deepClone(previous.topListings),
      watchersSummary: previous?.watchersSummary ? deepClone(previous.watchersSummary) : store.watchersSummary,
      warnings: [
        ...(Array.isArray(store.warnings) ? store.warnings : []),
        'Showing the last successful top-listings snapshot while eBay refreshes listing-level rows.',
      ].slice(0, 6),
    };
  });
}

async function buildEbayTrafficPayload(source = 'auto') {
  const stores = getEbayTrafficStoreConfigs();
  const configuredStores = stores.filter((store) => store.configured);
  if (!configuredStores.length) return ebayTrafficSetupPayload();

  const results = await Promise.all(stores.map(async (store) => {
    if (!store.configured) {
      return {
        id: store.id,
        label: store.label,
        marketplaceId: store.marketplaceId,
        storeUrl: store.storeUrl,
        configured: false,
        setupRequired: true,
        status: 'setup',
        message: 'Add eBay OAuth client, secret, and refresh token.',
        rangeDays: store.rangeDays,
        summary: null,
        daily: [],
        topListings: [],
        warnings: [],
        lastUpdatedDate: '',
        fetchedAt: '',
        error: '',
      };
    }
    try {
      return await fetchEbayTrafficStoreSnapshot(store);
    } catch (error) {
      return {
        id: store.id,
        label: store.label,
        marketplaceId: store.marketplaceId,
        storeUrl: store.storeUrl,
        configured: true,
        setupRequired: false,
        status: 'error',
        message: 'Unable to load eBay analytics for this store right now.',
        rangeDays: store.rangeDays,
        summary: null,
        daily: [],
        topListings: [],
        warnings: [],
        lastUpdatedDate: '',
        fetchedAt: '',
        error: String(error?.message || error || 'eBay traffic fetch failed').slice(0, 240),
      };
    }
  }));

  const mergedResults = mergeEbayTrafficWithCachedStoreState(results, ebayTrafficCacheState.payload);
  const healthyStores = mergedResults.filter((store) => store.status === 'ok');
  const summary = summarizeEbayTrafficStores(healthyStores);
  const clickThroughRate = summary.impressions > 0 ? (summary.views / summary.impressions) * 100 : null;
  const salesConversionRate = summary.views > 0 ? (summary.transactions / summary.views) * 100 : null;
  return {
    ok: healthyStores.length > 0,
    configured: true,
    setupRequired: false,
    partialFailure: healthyStores.length > 0 && healthyStores.length < configuredStores.length,
    fetchedAt: new Date().toISOString(),
    source: 'ebay_analytics_api',
    refreshSource: source,
    environment: EBAY_TRAFFIC_ENVIRONMENT,
    rangeDays: EBAY_TRAFFIC_RANGE_DAYS,
    storeCount: stores.length,
    healthyStoreCount: healthyStores.length,
    summary: {
      views: summary.views,
      impressions: summary.impressions,
      listingImpressions: summary.listingImpressions,
      storeImpressions: summary.storeImpressions,
      transactions: summary.transactions,
      clickThroughRate: roundEbayTrafficRate(clickThroughRate),
      salesConversionRate: roundEbayTrafficRate(salesConversionRate),
      storeSharePercent: summary.listingImpressions > 0 ? roundEbayTrafficRate((summary.storeImpressions / summary.listingImpressions) * 100) : null,
    },
    stores: mergedResults,
    message: healthyStores.length
      ? ''
      : 'eBay analytics is configured, but no store traffic data could be loaded right now.',
  };
}

async function getEbayTrafficPayload({ force = false, source = 'auto' } = {}) {
  const nowTs = Date.now();
  if (!force && ebayTrafficFetchInFlight) return ebayTrafficFetchInFlight;
  if (!force && ebayTrafficCacheState.payload && ebayTrafficCacheState.expiresAt > nowTs) {
    return deepClone(ebayTrafficCacheState.payload);
  }
  if (ebayTrafficCacheState.rateLimitedUntil > nowTs) {
    const retryInSeconds = Math.max(1, Math.ceil((ebayTrafficCacheState.rateLimitedUntil - nowTs) / 1000));
    const cachedPayload = ebayTrafficCacheState.payload || loadPersistedEbayTrafficCache();
    if (cachedPayload) {
      const stalePayload = buildStaleEbayTrafficPayloadFromCache(
        cachedPayload,
        `Showing the last successful eBay traffic snapshot while eBay rate-limits the Sell Analytics API. Retry in ${retryInSeconds}s.`
      );
      if (stalePayload) return deepClone(stalePayload);
    }
    return {
      ok: false,
      configured: true,
      setupRequired: false,
      partialFailure: false,
      fetchedAt: new Date().toISOString(),
      source: 'ebay_analytics_api',
      refreshSource: 'rate_limited_backoff',
      environment: EBAY_TRAFFIC_ENVIRONMENT,
      rangeDays: EBAY_TRAFFIC_RANGE_DAYS,
      storeCount: getEbayTrafficStoreConfigs().length,
      healthyStoreCount: 0,
      summary: {
        views: 0,
        impressions: 0,
        listingImpressions: 0,
        storeImpressions: 0,
        transactions: 0,
        clickThroughRate: 0,
        salesConversionRate: 0,
        storeSharePercent: null,
      },
      stores: getEbayTrafficStoreConfigs().map((store) => ({
        id: store.id,
        label: store.label,
        marketplaceId: store.marketplaceId,
        storeUrl: store.storeUrl,
        configured: store.configured,
        setupRequired: false,
        status: 'error',
        message: 'eBay Sell Analytics is rate limiting this app right now.',
        rangeDays: store.rangeDays,
        summary: null,
        daily: [],
        topListings: [],
        warnings: [],
        lastUpdatedDate: '',
        fetchedAt: '',
        error: `Retry in ${retryInSeconds}s.`,
      })),
      message: `eBay Sell Analytics is rate limiting this app right now. Retry in ${retryInSeconds}s.`,
    };
  }

  ebayTrafficFetchInFlight = (async () => {
    ebayTrafficCacheState.lastAttemptAt = new Date().toISOString();
    const payload = await buildEbayTrafficPayload(source);
    if (payload.ok || payload.partialFailure || payload.setupRequired) {
      ebayTrafficCacheState.payload = deepClone(payload);
      ebayTrafficCacheState.expiresAt = Date.now() + EBAY_TRAFFIC_CACHE_TTL_MS;
      ebayTrafficCacheState.lastSuccessAt = String(payload.fetchedAt || '');
      ebayTrafficCacheState.consecutiveFailures = payload.ok ? 0 : ebayTrafficCacheState.consecutiveFailures;
      ebayTrafficCacheState.lastError = String(payload.message || '').slice(0, 240);
      ebayTrafficCacheState.rateLimitedUntil = 0;
      if (payload.ok) persistEbayTrafficCachePayload(payload);
    } else {
      ebayTrafficCacheState.consecutiveFailures += 1;
      ebayTrafficCacheState.lastError = String(payload.message || 'eBay traffic fetch failed').slice(0, 240);
      ebayTrafficCacheState.rateLimitedUntil = isEbayTrafficRateLimitedPayload(payload)
        ? Date.now() + EBAY_TRAFFIC_RATE_LIMIT_BACKOFF_MS
        : 0;
      const cachedPayload = ebayTrafficCacheState.payload || loadPersistedEbayTrafficCache();
      if (cachedPayload) {
        const staleReason = isEbayTrafficRateLimitedPayload(payload)
          ? 'Showing the last successful eBay traffic snapshot while eBay rate-limits the Sell Analytics API for this app.'
          : 'Showing the last successful eBay traffic snapshot while live analytics are temporarily unavailable.';
        const stalePayload = buildStaleEbayTrafficPayloadFromCache(cachedPayload, staleReason);
        if (stalePayload) {
          ebayTrafficCacheState.payload = deepClone(cachedPayload);
          ebayTrafficCacheState.expiresAt = Date.now() + EBAY_TRAFFIC_CACHE_TTL_MS;
          return deepClone(stalePayload);
        }
      }
    }
    return deepClone(payload);
  })();

  try {
    return await ebayTrafficFetchInFlight;
  } finally {
    ebayTrafficFetchInFlight = null;
  }
}

function summarizeUnreadEmailAccounts(accounts = []){
  return (Array.isArray(accounts) ? accounts : []).map((account) => ({
    id: String(account?.id || ''),
    label: String(account?.label || ''),
    account: String(account?.account || ''),
    unreadCount: account?.unreadCount == null
      ? null
      : Number.isFinite(Number(account.unreadCount))
        ? Math.max(0, Number(account.unreadCount))
        : null,
    entries: [],
    recentEntries: [],
    sentEntries: [],
    inboxUrl: String(account?.inboxUrl || ''),
    sentOpenUrl: String(account?.sentOpenUrl || ''),
    includeSent: !!account?.includeSent,
    fetchedAt: String(account?.fetchedAt || ''),
    status: String(account?.status || ''),
    message: String(account?.message || ''),
    errorCode: String(account?.errorCode || ''),
  }));
}

async function fetchUnreadEmailFeedForAccountViaAtom(account){
  if (!account?.username || !account?.appPassword) {
    return {
      id: String(account?.id || ''),
      label: String(account?.label || account?.username || 'Inbox'),
      account: String(account?.username || ''),
      unreadCount: null,
      entries: [],
      recentEntries: [],
      sentEntries: [],
      inboxUrl: String(account?.openUrl || EMAIL_UNREAD_OPEN_URL),
      sentOpenUrl: String(account?.sentOpenUrl || defaultSentOpenUrl(account?.openUrl || EMAIL_UNREAD_OPEN_URL)),
      includeSent: !!account?.includeSent,
      fetchedAt: '',
      status: 'setup',
      message: 'Add username and app password.',
    };
  }

  try {
    const auth = Buffer.from(`${account.username}:${account.appPassword}`, 'utf8').toString('base64');
    const res = await coordinatedSafeFetch(account.feedUrl || EMAIL_UNREAD_URL, {
      method: 'GET',
      timeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
      firstByteTimeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
      maxBytes: 1024 * 1024,
      maxRedirects: 2,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.1',
        'User-Agent': 'pa-nostromo-unread-email/1.0',
      },
    }, { integration: 'email', key: `email:atom:${account.id}` });
    if (!res.ok) {
      const err = new Error(`Mail feed request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    const xml = await res.text();
    const parsed = extractUnreadEmailAtomFeed(xml);
    return {
      id: String(account.id || ''),
      label: String(account.label || account.username || 'Inbox'),
      account: account.username,
      unreadCount: parsed.unreadCount,
      entries: parsed.entries.slice(0, EMAIL_UNREAD_PREVIEW_LIMIT),
      recentEntries: [],
      sentEntries: [],
      inboxUrl: String(account.openUrl || EMAIL_UNREAD_OPEN_URL),
      sentOpenUrl: String(account.sentOpenUrl || defaultSentOpenUrl(account.openUrl || EMAIL_UNREAD_OPEN_URL)),
      includeSent: !!account.includeSent,
      fetchedAt: new Date().toISOString(),
      status: 'fresh',
      message: '',
    };
  } catch (error) {
    if (error?.code === 'request_timeout') {
      const timeoutError = new Error(`Mail feed timed out after ${EMAIL_UNREAD_TIMEOUT_MS}ms`);
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  }
}

async function fetchUnreadEmailFeedForAccountViaImap(account){
  if (!account?.username || !account?.appPassword) {
    return {
      id: String(account?.id || ''),
      label: String(account?.label || account?.username || 'Inbox'),
      account: String(account?.username || ''),
      unreadCount: null,
      entries: [],
      recentEntries: [],
      sentEntries: [],
      inboxUrl: String(account?.openUrl || EMAIL_UNREAD_OPEN_URL),
      sentOpenUrl: String(account?.sentOpenUrl || defaultSentOpenUrl(account?.openUrl || EMAIL_UNREAD_OPEN_URL)),
      includeSent: !!account?.includeSent,
      fetchedAt: '',
      status: 'setup',
      message: 'Add username and app password.',
    };
  }

  const snapshot = await fetchGmailImapAccountSnapshot({
    host: EMAIL_UNREAD_IMAP_HOST,
    port: EMAIL_UNREAD_IMAP_PORT,
    timeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
    username: account.username,
    password: account.appPassword,
    inboxLimit: EMAIL_UNREAD_PREVIEW_LIMIT,
    sentLimit: EMAIL_UNREAD_PREVIEW_LIMIT,
    includeSent: !!account.includeSent,
  });

  return {
    id: String(account.id || ''),
    label: String(account.label || account.username || 'Inbox'),
    account: account.username,
    unreadCount: snapshot.unreadCount,
    entries: Array.isArray(snapshot.inboxEntries) ? snapshot.inboxEntries.slice(0, EMAIL_UNREAD_PREVIEW_LIMIT) : [],
    recentEntries: Array.isArray(snapshot.recentInboxEntries) ? snapshot.recentInboxEntries.slice(0, EMAIL_UNREAD_PREVIEW_LIMIT) : [],
    sentEntries: Array.isArray(snapshot.sentEntries) ? snapshot.sentEntries.slice(0, EMAIL_UNREAD_PREVIEW_LIMIT) : [],
    inboxUrl: String(account.openUrl || EMAIL_UNREAD_OPEN_URL),
    sentOpenUrl: String(account.sentOpenUrl || defaultSentOpenUrl(account.openUrl || EMAIL_UNREAD_OPEN_URL)),
    includeSent: !!account.includeSent,
    fetchedAt: new Date().toISOString(),
    status: 'fresh',
    message: '',
  };
}

async function fetchUnreadEmailFeedForAccount(account){
  if (EMAIL_UNREAD_PROVIDER === 'gmail_atom') {
    return fetchUnreadEmailFeedForAccountViaAtom(account);
  }
  if (EMAIL_UNREAD_PROVIDER === 'gmail_imap') {
    return fetchUnreadEmailFeedForAccountViaImap(account);
  }
  const err = new Error(`Unsupported email provider: ${EMAIL_UNREAD_PROVIDER}`);
  err.status = 400;
  throw err;
}

function isAllowedUnreadEmailMailbox(mailboxName = '') {
  const mailbox = String(mailboxName || '').trim().toLowerCase();
  return mailbox === 'inbox'
    || mailbox === '[gmail]/sent mail'
    || mailbox === 'sent mail'
    || mailbox === 'sent';
}

function isAllowedUnreadEmailSpamMailbox(mailboxName = '') {
  const mailbox = String(mailboxName || '').trim().toLowerCase();
  return mailbox === 'inbox';
}

function getUnreadEmailAccountForDelete(accountId = '') {
  const normalizedAccountId = String(accountId || '').trim();
  if (!normalizedAccountId) {
    const error = new Error('Account ID is required.');
    error.status = 400;
    throw error;
  }

  const account = getEmailUnreadAccountConfigs().find((entry) => String(entry?.id || '').trim() === normalizedAccountId);
  if (!account) {
    const error = new Error('Email account was not found.');
    error.status = 404;
    throw error;
  }
  if (!account.username || !account.appPassword) {
    const error = new Error('This email account is missing credentials.');
    error.status = 400;
    throw error;
  }
  return account;
}

async function moveUnreadEmailMessageToTrash(payload = {}){
  if (EMAIL_UNREAD_PROVIDER !== 'gmail_imap') {
    const error = new Error('Delete is only available when EMAIL_UNREAD_PROVIDER=gmail_imap.');
    error.status = 400;
    throw error;
  }

  const accountId = String(payload.accountId || '').trim();
  const mailbox = String(payload.mailbox || '').trim();
  const uid = Number(payload.uid);

  if (!accountId) {
    const error = new Error('Account ID is required.');
    error.status = 400;
    throw error;
  }
  if (!isAllowedUnreadEmailMailbox(mailbox)) {
    const error = new Error('Mailbox is not supported for delete.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(uid) || uid <= 0) {
    const error = new Error('UID must be a positive integer.');
    error.status = 400;
    throw error;
  }

  const account = getUnreadEmailAccountForDelete(accountId);

  return moveGmailImapMessageToTrash({
    host: EMAIL_UNREAD_IMAP_HOST,
    port: EMAIL_UNREAD_IMAP_PORT,
    timeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
    username: account.username,
    password: account.appPassword,
    mailbox,
    uid,
  });
}

async function moveUnreadEmailMessageToSpam(payload = {}){
  if (EMAIL_UNREAD_PROVIDER !== 'gmail_imap') {
    const error = new Error('Spam is only available when EMAIL_UNREAD_PROVIDER=gmail_imap.');
    error.status = 400;
    throw error;
  }

  const accountId = String(payload.accountId || '').trim();
  const mailbox = String(payload.mailbox || '').trim();
  const uid = Number(payload.uid);

  if (!accountId) {
    const error = new Error('Account ID is required.');
    error.status = 400;
    throw error;
  }
  if (!isAllowedUnreadEmailSpamMailbox(mailbox)) {
    const error = new Error('Mailbox is not supported for spam.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(uid) || uid <= 0) {
    const error = new Error('UID must be a positive integer.');
    error.status = 400;
    throw error;
  }

  const account = getUnreadEmailAccountForDelete(accountId);

  return moveGmailImapMessageToSpam({
    host: EMAIL_UNREAD_IMAP_HOST,
    port: EMAIL_UNREAD_IMAP_PORT,
    timeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
    username: account.username,
    password: account.appPassword,
    mailbox,
    uid,
  });
}

async function markUnreadEmailMessageRead(payload = {}){
  if (EMAIL_UNREAD_PROVIDER !== 'gmail_imap') {
    const error = new Error('Mark read is only available when EMAIL_UNREAD_PROVIDER=gmail_imap.');
    error.status = 400;
    throw error;
  }

  const accountId = String(payload.accountId || '').trim();
  const mailbox = String(payload.mailbox || '').trim();
  const uid = Number(payload.uid);

  if (!accountId) {
    const error = new Error('Account ID is required.');
    error.status = 400;
    throw error;
  }
  if (!isAllowedUnreadEmailMailbox(mailbox)) {
    const error = new Error('Mailbox is not supported for mark read.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(uid) || uid <= 0) {
    const error = new Error('UID must be a positive integer.');
    error.status = 400;
    throw error;
  }

  const account = getUnreadEmailAccountForDelete(accountId);

  return markGmailImapMessageRead({
    host: EMAIL_UNREAD_IMAP_HOST,
    port: EMAIL_UNREAD_IMAP_PORT,
    timeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
    username: account.username,
    password: account.appPassword,
    mailbox,
    uid,
  });
}

async function moveUnreadEmailMessagesToSpam(payload = {}){
  if (EMAIL_UNREAD_PROVIDER !== 'gmail_imap') {
    const error = new Error('Bulk spam is only available when EMAIL_UNREAD_PROVIDER=gmail_imap.');
    error.status = 400;
    throw error;
  }

  const accountId = String(payload.accountId || '').trim();
  const itemsInput = Array.isArray(payload.items) ? payload.items : [];
  const normalizedItems = [];
  const seen = new Set();

  for (const item of itemsInput) {
    const mailbox = String(item?.mailbox || '').trim();
    const uid = Number(item?.uid);
    if (!isAllowedUnreadEmailSpamMailbox(mailbox)) {
      const error = new Error('One or more selected mailboxes are not supported for spam.');
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(uid) || uid <= 0) {
      const error = new Error('Each selected email must include a positive UID.');
      error.status = 400;
      throw error;
    }
    const key = `${mailbox}::${uid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedItems.push({ mailbox, uid });
  }

  if (!normalizedItems.length) {
    const error = new Error('Select at least one inbox email to send to spam.');
    error.status = 400;
    throw error;
  }
  if (normalizedItems.length > 25) {
    const error = new Error('Bulk spam is limited to 25 emails at a time.');
    error.status = 400;
    throw error;
  }

  const account = getUnreadEmailAccountForDelete(accountId);
  return moveGmailImapMessagesToSpam({
    host: EMAIL_UNREAD_IMAP_HOST,
    port: EMAIL_UNREAD_IMAP_PORT,
    timeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
    username: account.username,
    password: account.appPassword,
    items: normalizedItems,
  });
}

async function markUnreadEmailMessagesRead(payload = {}){
  if (EMAIL_UNREAD_PROVIDER !== 'gmail_imap') {
    const error = new Error('Bulk mark read is only available when EMAIL_UNREAD_PROVIDER=gmail_imap.');
    error.status = 400;
    throw error;
  }

  const accountId = String(payload.accountId || '').trim();
  const itemsInput = Array.isArray(payload.items) ? payload.items : [];
  const normalizedItems = [];
  const seen = new Set();

  for (const item of itemsInput) {
    const mailbox = String(item?.mailbox || '').trim();
    const uid = Number(item?.uid);
    if (!isAllowedUnreadEmailMailbox(mailbox)) {
      const error = new Error('One or more selected mailboxes are not supported for mark read.');
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(uid) || uid <= 0) {
      const error = new Error('Each selected email must include a positive UID.');
      error.status = 400;
      throw error;
    }
    const key = `${mailbox}::${uid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedItems.push({ mailbox, uid });
  }

  if (!normalizedItems.length) {
    const error = new Error('Select at least one email to mark read.');
    error.status = 400;
    throw error;
  }
  if (normalizedItems.length > 50) {
    const error = new Error('Bulk mark read is limited to 50 emails at a time.');
    error.status = 400;
    throw error;
  }

  const account = getUnreadEmailAccountForDelete(accountId);
  return markGmailImapMessagesRead({
    host: EMAIL_UNREAD_IMAP_HOST,
    port: EMAIL_UNREAD_IMAP_PORT,
    timeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
    username: account.username,
    password: account.appPassword,
    items: normalizedItems,
  });
}

async function moveUnreadEmailMessagesToTrash(payload = {}){
  if (EMAIL_UNREAD_PROVIDER !== 'gmail_imap') {
    const error = new Error('Bulk delete is only available when EMAIL_UNREAD_PROVIDER=gmail_imap.');
    error.status = 400;
    throw error;
  }

  const accountId = String(payload.accountId || '').trim();
  const itemsInput = Array.isArray(payload.items) ? payload.items : [];
  const normalizedItems = [];
  const seen = new Set();

  for (const item of itemsInput) {
    const mailbox = String(item?.mailbox || '').trim();
    const uid = Number(item?.uid);
    if (!isAllowedUnreadEmailMailbox(mailbox)) {
      const error = new Error('One or more selected mailboxes are not supported for delete.');
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(uid) || uid <= 0) {
      const error = new Error('Each selected email must include a positive UID.');
      error.status = 400;
      throw error;
    }
    const key = `${mailbox}::${uid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedItems.push({ mailbox, uid });
  }

  if (!normalizedItems.length) {
    const error = new Error('Select at least one email to delete.');
    error.status = 400;
    throw error;
  }
  if (normalizedItems.length > 25) {
    const error = new Error('Bulk delete is limited to 25 emails at a time.');
    error.status = 400;
    throw error;
  }

  const account = getUnreadEmailAccountForDelete(accountId);
  return moveGmailImapMessagesToTrash({
    host: EMAIL_UNREAD_IMAP_HOST,
    port: EMAIL_UNREAD_IMAP_PORT,
    timeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
    username: account.username,
    password: account.appPassword,
    items: normalizedItems,
  });
}

async function fetchUnreadEmailMessageBody(payload = {}){
  if (EMAIL_UNREAD_PROVIDER !== 'gmail_imap') {
    const error = new Error('Full message view is only available when EMAIL_UNREAD_PROVIDER=gmail_imap.');
    error.status = 400;
    throw error;
  }

  const accountId = String(payload.accountId || '').trim();
  const mailbox = String(payload.mailbox || '').trim();
  const uid = Number(payload.uid);

  if (!accountId) {
    const error = new Error('Account ID is required.');
    error.status = 400;
    throw error;
  }
  if (!isAllowedUnreadEmailMailbox(mailbox)) {
    const error = new Error('Mailbox is not supported for full message view.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(uid) || uid <= 0) {
    const error = new Error('UID must be a positive integer.');
    error.status = 400;
    throw error;
  }

  const account = getUnreadEmailAccountForDelete(accountId);
  return fetchGmailImapMessageBody({
    host: EMAIL_UNREAD_IMAP_HOST,
    port: EMAIL_UNREAD_IMAP_PORT,
    timeoutMs: EMAIL_UNREAD_TIMEOUT_MS,
    username: account.username,
    password: account.appPassword,
    mailbox,
    uid,
  });
}

function createEmailUnreadAccountErrorPayload(account, error){
  const status = Number(error?.status || 0);
  const message = String(error?.message || 'Unread email fetch failed').slice(0, 180);
  return {
    id: String(account?.id || ''),
    label: String(account?.label || account?.username || 'Inbox'),
    account: String(account?.username || ''),
    unreadCount: null,
    entries: [],
    recentEntries: [],
    sentEntries: [],
    inboxUrl: String(account?.openUrl || EMAIL_UNREAD_OPEN_URL),
    sentOpenUrl: String(account?.sentOpenUrl || defaultSentOpenUrl(account?.openUrl || EMAIL_UNREAD_OPEN_URL)),
    includeSent: !!account?.includeSent,
    fetchedAt: '',
    status: 'error',
    message,
    errorCode: status === 401 || status === 403
      && error?.code !== 'blocked_address'
      ? 'mail_auth_failed'
      : status === 404
        ? 'mail_feed_not_found'
        : status === 504
          ? 'mail_timeout'
          : 'mail_fetch_failed',
  };
}

async function fetchUnreadEmailFeed(){
  const accounts = getEmailUnreadAccountConfigs();
  const configuredAccounts = accounts.filter((account) => account.username && account.appPassword);
  if (!configuredAccounts.length) {
    return emailUnreadSetupPayload();
  }

  const accountResults = await Promise.all(accounts.map(async (account) => {
    if (!account.username || !account.appPassword) {
      return {
        id: String(account.id || ''),
        label: String(account.label || account.username || 'Inbox'),
        account: String(account.username || ''),
        unreadCount: null,
        entries: [],
        recentEntries: [],
        sentEntries: [],
        inboxUrl: String(account.openUrl || EMAIL_UNREAD_OPEN_URL),
        sentOpenUrl: String(account.sentOpenUrl || defaultSentOpenUrl(account.openUrl || EMAIL_UNREAD_OPEN_URL)),
        includeSent: !!account.includeSent,
        fetchedAt: '',
        status: 'setup',
        message: 'Add username and app password.',
      };
    }

    try {
      return await fetchUnreadEmailFeedForAccount(account);
    } catch (error) {
      return createEmailUnreadAccountErrorPayload(account, error);
    }
  }));

  const healthyAccounts = accountResults.filter((account) => account.status === 'fresh');
  const setupAccounts = accountResults.filter((account) => account.status === 'setup');
  const erroredAccounts = accountResults.filter((account) => account.status === 'error');

  if (!healthyAccounts.length && !setupAccounts.length) {
    const aggregateError = new Error(erroredAccounts.map((account) => `${account.label}: ${account.message}`).join(' | ') || 'Unread email fetch failed');
    aggregateError.status = 502;
    aggregateError.accounts = accountResults;
    throw aggregateError;
  }

  const unreadCount = healthyAccounts.reduce((sum, account) => sum + Math.max(0, Number(account.unreadCount || 0)), 0);
  const entries = healthyAccounts
    .flatMap((account) => (Array.isArray(account.entries) ? account.entries : []).map((entry) => ({
      ...entry,
      accountLabel: account.label,
      accountEmail: account.account,
      inboxUrl: account.inboxUrl,
    })))
    .sort((a, b) => Date.parse(String(b?.issuedAt || '')) - Date.parse(String(a?.issuedAt || '')))
    .slice(0, 12);

  const latestFetchedAt = healthyAccounts
    .map((account) => Date.parse(String(account.fetchedAt || '')))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  const accountsSummary = accountResults.map((account) => ({
    id: account.id,
    label: account.label,
    account: account.account,
    unreadCount: account?.unreadCount == null
      ? null
      : Number.isFinite(Number(account.unreadCount))
        ? Math.max(0, Number(account.unreadCount))
        : null,
    entries: Array.isArray(account.entries) ? account.entries.slice(0, EMAIL_UNREAD_PREVIEW_LIMIT) : [],
    recentEntries: Array.isArray(account.recentEntries) ? account.recentEntries.slice(0, EMAIL_UNREAD_PREVIEW_LIMIT) : [],
    sentEntries: Array.isArray(account.sentEntries) ? account.sentEntries.slice(0, EMAIL_UNREAD_PREVIEW_LIMIT) : [],
    inboxUrl: account.inboxUrl,
    sentOpenUrl: account.sentOpenUrl || '',
    includeSent: !!account.includeSent,
    fetchedAt: account.fetchedAt,
    status: account.status,
    message: account.message,
    errorCode: account.errorCode || '',
  }));

  return {
    ok: true,
    provider: EMAIL_UNREAD_PROVIDER,
    configured: healthyAccounts.length > 0,
    setupRequired: healthyAccounts.length === 0 && setupAccounts.length > 0,
    partialFailure: erroredAccounts.length > 0 || setupAccounts.length > 0,
    label: EMAIL_UNREAD_LABEL,
    account: '',
    accountCount: accountsSummary.length,
    healthyAccountCount: healthyAccounts.length,
    accounts: accountsSummary,
    unreadCount,
    entries,
    inboxUrl: healthyAccounts[0]?.inboxUrl || EMAIL_UNREAD_OPEN_URL,
    fetchedAt: Number.isFinite(latestFetchedAt) ? new Date(latestFetchedAt).toISOString() : '',
    message: '',
  };
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
  if (!baseline) {
    baseline = records.find((record) => record.ts >= windowStart) || null;
  }
  if (!baseline || !Number.isFinite(baseline.followersCount)) return null;
  const baselineAge = latestTs - baseline.ts;
  const allowableShortfall = Math.min(15 * 60 * 1000, Math.floor(window * 0.1));
  if (!Number.isFinite(baselineAge) || baselineAge < Math.max(0, window - allowableShortfall)) return null;
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

async function fetchInstagramWebProfileInfo(handle, timeoutMs = META_GRAPH_TIMEOUT_MS){
  const cleanHandle = String(handle || INSTAGRAM_PROFILE_HANDLE || '').trim().replace(/^@+/, '');
  if (!cleanHandle) throw Object.assign(new Error('instagram_handle_missing'), { httpStatus: 400 });

  const endpoint = 'https://i.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(cleanHandle);
  try {
    const res = await coordinatedSafeFetch(endpoint, {
      method: 'GET',
      timeoutMs: Math.max(1000, Number(timeoutMs || META_GRAPH_TIMEOUT_MS)),
      firstByteTimeoutMs: Math.max(1000, Number(timeoutMs || META_GRAPH_TIMEOUT_MS)),
      maxBytes: 2 * 1024 * 1024,
      maxRedirects: 1,
      allowedHosts: ['i.instagram.com'],
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'origin': 'https://www.instagram.com',
        'referer': 'https://www.instagram.com/' + cleanHandle + '/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'x-ig-app-id': '936619743392459',
        'x-requested-with': 'XMLHttpRequest',
      },
    }, { integration: 'social', key: `social:instagram-web:${cleanHandle}` });

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
    if (err?.code === 'request_timeout') {
      throw Object.assign(new Error('instagram_web_profile_info_timeout'), { httpStatus: 504 });
    }
    throw err;
  }
}

function isInstagramGraphConfigured(){
  return !!(INSTAGRAM_GRAPH_ACCESS_TOKEN && (INSTAGRAM_GRAPH_ACCOUNT_ID || INSTAGRAM_GRAPH_PAGE_ID));
}

async function fetchMetaGraphJson(endpoint, { timeoutMs = META_GRAPH_TIMEOUT_MS, label = 'meta_graph' } = {}){
  try {
    const res = await coordinatedSafeFetch(endpoint, {
      method: 'GET',
      timeoutMs: Math.max(1000, Number(timeoutMs) || META_GRAPH_TIMEOUT_MS),
      firstByteTimeoutMs: Math.max(1000, Number(timeoutMs) || META_GRAPH_TIMEOUT_MS),
      maxBytes: 2 * 1024 * 1024,
      maxRedirects: 1,
      allowedHosts: ['graph.facebook.com'],
      headers: { 'Accept': 'application/json' },
    }, { integration: 'social', key: `social:meta:${new URL(endpoint).pathname}` });
    const text = await res.text();
    const parsed = parseJsonSafely(text, label);
    const body = parsed.ok && parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
    if (!res.ok) {
      const detail = String(body?.error?.message || ('HTTP ' + res.status)).trim();
      const err = new Error(detail || `${label}_http_${res.status}`);
      err.httpStatus = Number(res.status || 502);
      err.retryAfter = res.headers.get('retry-after') || '';
      err.responseBody = String(text || '').slice(0, 240);
      throw err;
    }
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
      throw Object.assign(new Error(label + '_invalid_json'), { httpStatus: 502 });
    }
    if (body?.error?.message) {
      const err = new Error(String(body.error.message).trim() || `${label}_error`);
      err.httpStatus = Number(body?.error?.code || 502);
      err.details = body.error;
      throw err;
    }
    return body;
  } catch (err) {
    if (err?.code === 'request_timeout') {
      throw Object.assign(new Error(label + '_timeout'), { httpStatus: 504 });
    }
    throw err;
  }
}

function extractInstagramCodeFromPermalink(permalink, fallback = ''){
  const source = String(permalink || '').trim();
  if (source) {
    try {
      const parsed = new URL(source);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const code = parts.length ? parts[parts.length - 1] : '';
      if (code) return code;
    } catch {}
    const match = source.match(/instagram\.com\/(?:reel|p|stories)\/([^/?#]+)/i);
    if (match && match[1]) return String(match[1]).trim();
  }
  return String(fallback || '').trim();
}

function firstFiniteNumber(...values){
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function parseInstagramInsightValue(metric){
  const totalValue = metric?.total_value;
  if (Number.isFinite(Number(totalValue?.value))) return Number(totalValue.value);
  if (Array.isArray(metric?.values) && Number.isFinite(Number(metric.values[0]?.value))) return Number(metric.values[0].value);
  if (Number.isFinite(Number(metric?.value))) return Number(metric.value);
  return null;
}

function summarizeInstagramAccountInsights(summary = {}){
  const metrics = summary && typeof summary === 'object' ? summary : {};
  return {
    rangeDays: Number.isFinite(Number(metrics.rangeDays)) ? Number(metrics.rangeDays) : INSTAGRAM_GRAPH_LOOKBACK_DAYS,
    since: String(metrics.since || '').trim(),
    until: String(metrics.until || '').trim(),
    followersCount: Number.isFinite(Number(metrics.followersCount)) ? Number(metrics.followersCount) : null,
    accountsEngaged: Number.isFinite(Number(metrics.accountsEngaged)) ? Number(metrics.accountsEngaged) : null,
    reach: Number.isFinite(Number(metrics.reach)) ? Number(metrics.reach) : null,
    views: Number.isFinite(Number(metrics.views)) ? Number(metrics.views) : null,
    totalInteractions: Number.isFinite(Number(metrics.totalInteractions)) ? Number(metrics.totalInteractions) : null,
    likes: Number.isFinite(Number(metrics.likes)) ? Number(metrics.likes) : null,
    comments: Number.isFinite(Number(metrics.comments)) ? Number(metrics.comments) : null,
    shares: Number.isFinite(Number(metrics.shares)) ? Number(metrics.shares) : null,
    saves: Number.isFinite(Number(metrics.saves)) ? Number(metrics.saves) : null,
    replies: Number.isFinite(Number(metrics.replies)) ? Number(metrics.replies) : null,
    reposts: Number.isFinite(Number(metrics.reposts)) ? Number(metrics.reposts) : null,
  };
}

function parseFacebookSummaryCount(value){
  return firstFiniteNumber(
    value?.summary?.total_count,
    value?.summary?.count,
    value?.count
  );
}

function parseFacebookInsightValue(metric){
  if (Number.isFinite(Number(metric?.value))) return Number(metric.value);
  if (Number.isFinite(Number(metric?.values?.[0]?.value))) return Number(metric.values[0].value);
  if (Number.isFinite(Number(metric?.values?.[0]?.value?.value))) return Number(metric.values[0].value.value);
  return null;
}

function extractFacebookPostCode(permalink, fallback = ''){
  const source = String(permalink || '').trim();
  if (source) {
    try {
      const parsed = new URL(source);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length) {
        const last = parts[parts.length - 1];
        if (last) return String(last).trim();
      }
    } catch {}
  }
  const fallbackText = String(fallback || '').trim();
  if (fallbackText.includes('_')) {
    const parts = fallbackText.split('_').filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return fallbackText;
}

function normalizeFacebookContentItems(items = []){
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const id = String(item?.id || '').trim();
      const permalink = String(item?.permalink || item?.permalink_url || '').trim();
      const code = extractFacebookPostCode(permalink, id);
      if (!code) return null;
      const likeCount = item?.likeCount != null && Number.isFinite(Number(item.likeCount)) ? Math.max(0, Math.round(Number(item.likeCount))) : null;
      const commentCount = item?.commentCount != null && Number.isFinite(Number(item.commentCount)) ? Math.max(0, Math.round(Number(item.commentCount))) : null;
      const shareCount = item?.shareCount != null && Number.isFinite(Number(item.shareCount)) ? Math.max(0, Math.round(Number(item.shareCount))) : null;
      const reachCount = item?.reachCount != null && Number.isFinite(Number(item.reachCount)) ? Math.max(0, Math.round(Number(item.reachCount))) : null;
      const viewCount = item?.viewCount != null && Number.isFinite(Number(item.viewCount)) ? Math.max(0, Math.round(Number(item.viewCount))) : null;
      const interactionCount = item?.interactionCount != null && Number.isFinite(Number(item.interactionCount))
        ? Math.max(0, Math.round(Number(item.interactionCount)))
        : (likeCount || 0) + (commentCount || 0) + (shareCount || 0);
      return {
        code,
        id,
        permalink,
        caption: String(item?.caption || '').replace(/\s+/g, ' ').trim(),
        takenAt: String(item?.takenAt || item?.created_time || '').trim(),
        productType: String(item?.productType || item?.type || '').trim(),
        mediaType: null,
        likeCount,
        commentCount,
        shareCount,
        saveCount: null,
        reachCount,
        repostCount: shareCount,
        viewCount,
        interactionCount,
        thumbnailUrl: String(item?.thumbnailUrl || item?.full_picture || '').trim(),
      };
    })
    .filter(Boolean);
}

function summarizeFacebookContentItems(items = []){
  const rows = normalizeFacebookContentItems(items);
  const averageFor = (key) => {
    const values = rows.map((item) => item?.[key]).filter((value) => Number.isFinite(Number(value)));
    if (!values.length) return null;
    const total = values.reduce((sum, value) => sum + Number(value), 0);
    return Math.round(total / values.length);
  };
  if (!rows.length) {
    return {
      itemCount: 0,
      avgLikes: null,
      avgComments: null,
      avgShares: null,
      avgSaves: null,
      avgReach: null,
      avgViews: null,
      avgReposts: null,
      avgInteractions: null,
      topInteractionCount: null,
      topInteractionCode: '',
      latestTakenAt: '',
      oldestTakenAt: '',
    };
  }
  const totalInteractions = rows.reduce((sum, item) => sum + (item.interactionCount || 0), 0);
  const sortedByInteraction = rows.slice().sort((a, b) => (b.interactionCount || 0) - (a.interactionCount || 0));
  const takenAts = rows
    .map((item) => Date.parse(String(item.takenAt || '')))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  return {
    itemCount: rows.length,
    avgLikes: averageFor('likeCount'),
    avgComments: averageFor('commentCount'),
    avgShares: averageFor('shareCount'),
    avgSaves: null,
    avgReach: averageFor('reachCount'),
    avgViews: averageFor('viewCount'),
    avgReposts: averageFor('shareCount'),
    avgInteractions: Math.round(totalInteractions / rows.length),
    topInteractionCount: sortedByInteraction[0]?.interactionCount ?? null,
    topInteractionCode: String(sortedByInteraction[0]?.code || ''),
    latestTakenAt: takenAts.length ? new Date(takenAts[takenAts.length - 1]).toISOString() : '',
    oldestTakenAt: takenAts.length ? new Date(takenAts[0]).toISOString() : '',
  };
}

function summarizeFacebookContentInsights(summary = {}){
  const metrics = summary && typeof summary === 'object' ? summary : {};
  return {
    rangeDays: Number.isFinite(Number(metrics.rangeDays)) ? Number(metrics.rangeDays) : FACEBOOK_GRAPH_LOOKBACK_DAYS,
    since: String(metrics.since || '').trim(),
    until: String(metrics.until || '').trim(),
    followersCount: Number.isFinite(Number(metrics.followersCount)) ? Number(metrics.followersCount) : null,
    accountsEngaged: Number.isFinite(Number(metrics.accountsEngaged)) ? Number(metrics.accountsEngaged) : null,
    reach: Number.isFinite(Number(metrics.reach)) ? Number(metrics.reach) : null,
    views: Number.isFinite(Number(metrics.views)) ? Number(metrics.views) : null,
    totalInteractions: Number.isFinite(Number(metrics.totalInteractions)) ? Number(metrics.totalInteractions) : null,
    likes: Number.isFinite(Number(metrics.likes)) ? Number(metrics.likes) : null,
    comments: Number.isFinite(Number(metrics.comments)) ? Number(metrics.comments) : null,
    shares: Number.isFinite(Number(metrics.shares)) ? Number(metrics.shares) : null,
    saves: null,
    replies: null,
    reposts: Number.isFinite(Number(metrics.shares)) ? Number(metrics.shares) : null,
  };
}

async function resolveInstagramGraphProfile({ force = false } = {}){
  if (!isInstagramGraphConfigured()) {
    throw Object.assign(new Error('instagram_graph_missing_config'), { httpStatus: 428 });
  }
  if (!force && instagramGraphProfileCache.profile && Date.now() < instagramGraphProfileCache.expiresAt) {
    return { ...instagramGraphProfileCache.profile };
  }

  let profile = null;
  if (INSTAGRAM_GRAPH_ACCOUNT_ID) {
    const directUrl = new URL(`https://graph.facebook.com/${encodeURIComponent(META_GRAPH_API_VERSION)}/${encodeURIComponent(INSTAGRAM_GRAPH_ACCOUNT_ID)}`);
    directUrl.searchParams.set('fields', 'id,username,name,followers_count,media_count,profile_picture_url');
    directUrl.searchParams.set('access_token', INSTAGRAM_GRAPH_ACCESS_TOKEN);
    const body = await fetchMetaGraphJson(directUrl.toString(), { timeoutMs: INSTAGRAM_GRAPH_TIMEOUT_MS, label: 'instagram_graph_profile' });
    profile = body;
  } else {
    const pageUrl = new URL(`https://graph.facebook.com/${encodeURIComponent(META_GRAPH_API_VERSION)}/${encodeURIComponent(INSTAGRAM_GRAPH_PAGE_ID)}`);
    pageUrl.searchParams.set('fields', 'instagram_business_account{id,username,name,followers_count,media_count,profile_picture_url},connected_instagram_account{id,username,name,followers_count,media_count,profile_picture_url}');
    pageUrl.searchParams.set('access_token', INSTAGRAM_GRAPH_ACCESS_TOKEN);
    const body = await fetchMetaGraphJson(pageUrl.toString(), { timeoutMs: INSTAGRAM_GRAPH_TIMEOUT_MS, label: 'instagram_graph_page_lookup' });
    profile = body?.instagram_business_account || body?.connected_instagram_account || null;
  }

  if (!profile || !String(profile?.id || '').trim()) {
    throw Object.assign(new Error('instagram_graph_account_not_connected'), { httpStatus: 404 });
  }

  const normalized = {
    id: String(profile.id || '').trim(),
    handle: String(profile.username || INSTAGRAM_PROFILE_HANDLE || '').trim().replace(/^@+/, ''),
    name: String(profile.name || INSTAGRAM_PROFILE_NAME || '').trim() || INSTAGRAM_PROFILE_NAME,
    followersCount: firstFiniteNumber(profile.followers_count),
    mediaCount: firstFiniteNumber(profile.media_count),
    profilePictureUrl: String(profile.profile_picture_url || '').trim(),
  };

  instagramGraphProfileCache.profile = normalized;
  instagramGraphProfileCache.expiresAt = Date.now() + (15 * 60 * 1000);
  instagramGraphProfileCache.lastError = '';
  return { ...normalized };
}

async function fetchInstagramFollowersViaGraphApi(){
  const profile = await resolveInstagramGraphProfile();
  const count = firstFiniteNumber(profile.followersCount);
  if (!Number.isFinite(count) || count <= 0) {
    throw Object.assign(new Error('instagram_graph_followers_missing'), { httpStatus: 502 });
  }
  return {
    count,
    profileId: profile.id,
    profileHandle: profile.handle,
    profileName: profile.name,
    provider: 'graph_api',
    signal: 'followers_count',
  };
}

async function fetchInstagramAccountInsightsViaGraphApi({ accountId, rangeDays = INSTAGRAM_GRAPH_LOOKBACK_DAYS } = {}){
  const until = Math.floor(Date.now() / 1000);
  const since = until - (Math.max(1, Number(rangeDays) || INSTAGRAM_GRAPH_LOOKBACK_DAYS) * 24 * 60 * 60);
  const metrics = [
    'accounts_engaged',
    'comments',
    'likes',
    'reach',
    'replies',
    'reposts',
    'saves',
    'shares',
    'total_interactions',
    'views',
  ];
  const insightsUrl = new URL(`https://graph.facebook.com/${encodeURIComponent(META_GRAPH_API_VERSION)}/${encodeURIComponent(accountId)}/insights`);
  insightsUrl.searchParams.set('metric', metrics.join(','));
  insightsUrl.searchParams.set('period', 'day');
  insightsUrl.searchParams.set('metric_type', 'total_value');
  insightsUrl.searchParams.set('since', String(since));
  insightsUrl.searchParams.set('until', String(until));
  insightsUrl.searchParams.set('access_token', INSTAGRAM_GRAPH_ACCESS_TOKEN);
  const body = await fetchMetaGraphJson(insightsUrl.toString(), { timeoutMs: INSTAGRAM_GRAPH_TIMEOUT_MS, label: 'instagram_graph_account_insights' });
  const byName = new Map();
  for (const item of Array.isArray(body?.data) ? body.data : []) {
    const key = String(item?.name || '').trim();
    if (!key) continue;
    byName.set(key, item);
  }
  return summarizeInstagramAccountInsights({
    rangeDays: Math.max(1, Number(rangeDays) || INSTAGRAM_GRAPH_LOOKBACK_DAYS),
    since: new Date(since * 1000).toISOString(),
    until: new Date(until * 1000).toISOString(),
    accountsEngaged: parseInstagramInsightValue(byName.get('accounts_engaged')),
    reach: parseInstagramInsightValue(byName.get('reach')),
    views: parseInstagramInsightValue(byName.get('views')),
    totalInteractions: parseInstagramInsightValue(byName.get('total_interactions')),
    likes: parseInstagramInsightValue(byName.get('likes')),
    comments: parseInstagramInsightValue(byName.get('comments')),
    shares: parseInstagramInsightValue(byName.get('shares')),
    saves: parseInstagramInsightValue(byName.get('saves')),
    replies: parseInstagramInsightValue(byName.get('replies')),
    reposts: parseInstagramInsightValue(byName.get('reposts')),
  });
}

async function fetchInstagramMediaViaGraphApi({ accountId, limit = INSTAGRAM_GRAPH_MEDIA_LIMIT } = {}){
  const listUrl = new URL(`https://graph.facebook.com/${encodeURIComponent(META_GRAPH_API_VERSION)}/${encodeURIComponent(accountId)}/media`);
  listUrl.searchParams.set('fields', 'id,caption,media_product_type,media_type,permalink,timestamp,thumbnail_url');
  listUrl.searchParams.set('limit', String(Math.max(1, Math.min(24, Number(limit) || INSTAGRAM_GRAPH_MEDIA_LIMIT))));
  listUrl.searchParams.set('access_token', INSTAGRAM_GRAPH_ACCESS_TOKEN);
  const mediaBody = await fetchMetaGraphJson(listUrl.toString(), { timeoutMs: INSTAGRAM_GRAPH_TIMEOUT_MS, label: 'instagram_graph_media_list' });
  const mediaItems = Array.isArray(mediaBody?.data) ? mediaBody.data : [];
  const enriched = await Promise.allSettled(mediaItems.map(async (item) => {
    const id = String(item?.id || '').trim();
    if (!id) return null;
    const permalink = String(item?.permalink || '').trim();
    const productTypeRaw = String(item?.media_product_type || '').trim().toUpperCase();
    const metrics = productTypeRaw === 'STORY'
      ? ['reach', 'replies', 'views']
      : ['comments', 'likes', 'reach', 'saved', 'shares', 'total_interactions', 'views'];
    const insightsUrl = new URL(`https://graph.facebook.com/${encodeURIComponent(META_GRAPH_API_VERSION)}/${encodeURIComponent(id)}/insights`);
    insightsUrl.searchParams.set('metric', metrics.join(','));
    insightsUrl.searchParams.set('period', 'lifetime');
    insightsUrl.searchParams.set('access_token', INSTAGRAM_GRAPH_ACCESS_TOKEN);

    let insights = {};
    try {
      const insightBody = await fetchMetaGraphJson(insightsUrl.toString(), { timeoutMs: INSTAGRAM_GRAPH_TIMEOUT_MS, label: 'instagram_graph_media_insights' });
      for (const metric of Array.isArray(insightBody?.data) ? insightBody.data : []) {
        const key = String(metric?.name || '').trim();
        if (!key) continue;
        insights[key] = parseInstagramInsightValue(metric);
      }
    } catch (error) {
      insights = { __error: String(error?.message || error || 'instagram_graph_media_insights_failed').slice(0, 200) };
    }

    const shareCount = firstFiniteNumber(insights.shares);
    const saveCount = firstFiniteNumber(insights.saved);
    const reachCount = firstFiniteNumber(insights.reach);
    const viewCount = firstFiniteNumber(insights.views);
    const likeCount = firstFiniteNumber(insights.likes);
    const commentCount = firstFiniteNumber(insights.comments, insights.replies);
    const interactionCount = firstFiniteNumber(insights.total_interactions)
      ?? [likeCount, commentCount, shareCount, saveCount].filter((value) => Number.isFinite(value)).reduce((sum, value) => sum + Number(value), 0);
    return {
      id,
      code: extractInstagramCodeFromPermalink(permalink, id),
      permalink,
      caption: String(item?.caption || '').replace(/\s+/g, ' ').trim(),
      takenAt: String(item?.timestamp || '').trim(),
      productType: productTypeRaw === 'REELS'
        ? 'clips'
        : productTypeRaw === 'CAROUSEL_ALBUM'
          ? 'carousel_container'
          : String(productTypeRaw || '').trim().toLowerCase(),
      mediaType: Number.isFinite(Number(item?.media_type)) ? Number(item.media_type) : null,
      likeCount,
      commentCount,
      shareCount,
      saveCount,
      reachCount,
      repostCount: shareCount,
      viewCount,
      interactionCount: Number.isFinite(interactionCount) ? Math.max(0, Math.round(interactionCount)) : null,
      thumbnailUrl: String(item?.thumbnail_url || '').trim(),
    };
  }));

  return enriched
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value);
}

async function fetchInstagramContentViaGraphApi({ maxItems = INSTAGRAM_GRAPH_MEDIA_LIMIT } = {}){
  const profile = await resolveInstagramGraphProfile();
  const [items, insights] = await Promise.all([
    fetchInstagramMediaViaGraphApi({ accountId: profile.id, limit: maxItems }),
    fetchInstagramAccountInsightsViaGraphApi({ accountId: profile.id, rangeDays: INSTAGRAM_GRAPH_LOOKBACK_DAYS }),
  ]);
  if (!items.length) {
    throw Object.assign(new Error('instagram_graph_media_missing'), { httpStatus: 502 });
  }
  return {
    profile: {
      id: profile.id,
      handle: profile.handle,
      name: profile.name,
    },
    source: 'graph_api',
    insights: summarizeInstagramAccountInsights({
      ...insights,
      followersCount: firstFiniteNumber(profile.followersCount),
    }),
    items,
    summary: summarizeInstagramContentItems(items),
  };
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

async function fetchFacebookFollowersViaPageSession({ pageUrl = FACEBOOK_PAGE_URL, timeoutMs = FACEBOOK_SESSION_TIMEOUT_MS } = {}) {
  const scriptArgs = [
    FACEBOOK_SESSION_SCRIPT_PATH,
    '--url', String(pageUrl || FACEBOOK_PAGE_URL).trim(),
    '--storage', FACEBOOK_SESSION_STORAGE_PATH,
    '--timeout-ms', String(Math.max(5000, Number(timeoutMs) || FACEBOOK_SESSION_TIMEOUT_MS)),
    '--headless', FACEBOOK_SESSION_HEADLESS ? '1' : '0',
  ];

  const result = await execFileSafe('node', scriptArgs, {
    timeout: Math.max(10_000, Number(timeoutMs) + 5_000),
    maxBuffer: 1024 * 1024,
  });

  if (!result.ok) {
    const stderrSnippet = String(result.stderr || '').trim().slice(0, 280);
    const stdoutSnippet = String(result.stdout || '').trim().slice(0, 280);
    const msg = stderrSnippet || stdoutSnippet || String(result.error?.message || 'facebook_session_script_exec_failed');
    const err = new Error('facebook_session_exec_failed: ' + msg);
    err.httpStatus = /timed out/i.test(msg) ? 504 : 502;
    throw err;
  }

  const parsed = parseJsonSafely(result.stdout, 'facebook_page_session_scraper');
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
    throw Object.assign(new Error('facebook_session_invalid_json_output'), { httpStatus: 502 });
  }

  if (!parsed.value.ok) {
    const reason = String(parsed.value.reason || parsed.value.error || 'facebook_session_failed');
    const err = new Error(reason);
    err.httpStatus = reason === 'facebook_session_setup_required' ? 428 : 502;
    err.setupRequired = reason === 'facebook_session_setup_required';
    err.details = parsed.value;
    throw err;
  }

  const count = Number(parsed.value.followersCount);
  if (!Number.isFinite(count) || count <= 0) {
    throw Object.assign(new Error('facebook_session_followers_missing'), { httpStatus: 502 });
  }

  return {
    count,
    pageName: String(parsed.value.pageName || '').trim(),
    signal: String(parsed.value.signal || ''),
    provider: String(parsed.value.provider || 'facebook_session_playwright').trim() || 'facebook_session_playwright',
  };
}

async function fetchFacebookGroupMembersViaSession({ groupUrl = FACEBOOK_GROUP_URL, timeoutMs = FACEBOOK_SESSION_TIMEOUT_MS } = {}) {
  const scriptArgs = [
    FACEBOOK_GROUP_SESSION_SCRIPT_PATH,
    '--url', String(groupUrl || FACEBOOK_GROUP_URL).trim(),
    '--storage', FACEBOOK_SESSION_STORAGE_PATH,
    '--timeout-ms', String(Math.max(5000, Number(timeoutMs) || FACEBOOK_SESSION_TIMEOUT_MS)),
    '--headless', FACEBOOK_SESSION_HEADLESS ? '1' : '0',
  ];

  const result = await execFileSafe('node', scriptArgs, {
    timeout: Math.max(10_000, Number(timeoutMs) + 5_000),
    maxBuffer: 1024 * 1024,
  });

  if (!result.ok) {
    const stderrSnippet = String(result.stderr || '').trim().slice(0, 280);
    const stdoutSnippet = String(result.stdout || '').trim().slice(0, 280);
    const msg = stderrSnippet || stdoutSnippet || String(result.error?.message || 'facebook_group_session_script_exec_failed');
    const err = new Error('facebook_group_session_exec_failed: ' + msg);
    err.httpStatus = /timed out/i.test(msg) ? 504 : 502;
    throw err;
  }

  const parsed = parseJsonSafely(result.stdout, 'facebook_group_session_scraper');
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
    throw Object.assign(new Error('facebook_group_session_invalid_json_output'), { httpStatus: 502 });
  }

  if (!parsed.value.ok) {
    const reason = String(parsed.value.reason || parsed.value.error || 'facebook_group_session_failed');
    const err = new Error(reason);
    err.httpStatus = reason === 'facebook_group_session_setup_required' ? 428 : 502;
    err.setupRequired = reason === 'facebook_group_session_setup_required';
    err.details = parsed.value;
    throw err;
  }

  const count = Number(parsed.value.membersCount);
  if (!Number.isFinite(count) || count <= 0) {
    throw Object.assign(new Error('facebook_group_members_missing'), { httpStatus: 502 });
  }

  return {
    count,
    groupName: String(parsed.value.groupName || '').trim(),
    signal: String(parsed.value.signal || ''),
    provider: String(parsed.value.provider || 'facebook_group_playwright').trim() || 'facebook_group_playwright',
  };
}

async function fetchInstagramFollowersViaProfileSession({ handle, profileUrl = INSTAGRAM_PROFILE_URL, timeoutMs = INSTAGRAM_META_SUITE_TIMEOUT_MS } = {}) {
  const scriptArgs = [
    INSTAGRAM_PROFILE_SESSION_SCRIPT_PATH,
    '--handle', String(handle || '').trim().replace(/^@+/, ''),
    '--url', String(profileUrl || INSTAGRAM_PROFILE_URL).trim(),
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
    const msg = stderrSnippet || stdoutSnippet || String(result.error?.message || 'instagram_session_script_exec_failed');
    const err = new Error('instagram_session_exec_failed: ' + msg);
    err.httpStatus = /timed out/i.test(msg) ? 504 : 502;
    throw err;
  }

  const parsed = parseJsonSafely(result.stdout, 'instagram_profile_session_scraper');
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
    throw Object.assign(new Error('instagram_session_invalid_json_output'), { httpStatus: 502 });
  }

  if (!parsed.value.ok) {
    const reason = String(parsed.value.reason || parsed.value.error || 'instagram_session_failed');
    const err = new Error(reason);
    err.httpStatus = reason === 'instagram_session_setup_required' ? 428 : 502;
    err.setupRequired = reason === 'instagram_session_setup_required';
    err.details = parsed.value;
    throw err;
  }

  const count = Number(parsed.value.followersCount);
  if (!Number.isFinite(count) || count <= 0) {
    throw Object.assign(new Error('instagram_session_followers_missing'), { httpStatus: 502 });
  }

  return {
    count,
    profileName: String(parsed.value.profileName || '').trim(),
    signal: String(parsed.value.signal || ''),
    provider: String(parsed.value.provider || 'instagram_session_playwright').trim() || 'instagram_session_playwright',
  };
}

async function fetchFacebookGraphPageProfile(){
  if (!(META_GRAPH_PAGE_ID && META_GRAPH_PAGE_ACCESS_TOKEN)) {
    throw Object.assign(new Error('facebook_graph_missing_config'), { httpStatus: 428 });
  }
  const pageUrl = new URL(`https://graph.facebook.com/${encodeURIComponent(META_GRAPH_API_VERSION)}/${encodeURIComponent(META_GRAPH_PAGE_ID)}`);
  pageUrl.searchParams.set('fields', 'id,name,link');
  pageUrl.searchParams.set('access_token', META_GRAPH_PAGE_ACCESS_TOKEN);
  const body = await fetchMetaGraphJson(pageUrl.toString(), { timeoutMs: META_GRAPH_TIMEOUT_MS, label: 'facebook_graph_page_profile' });
  return {
    id: String(body?.id || META_GRAPH_PAGE_ID).trim(),
    name: String(body?.name || facebookFollowersState.page?.name || '').trim(),
    url: String(body?.link || FACEBOOK_PAGE_URL).trim() || FACEBOOK_PAGE_URL,
  };
}

async function fetchFacebookPostInsightsViaGraphApi(postId){
  const id = String(postId || '').trim();
  if (!id) return {};
  const insightsUrl = new URL(`https://graph.facebook.com/${encodeURIComponent(META_GRAPH_API_VERSION)}/${encodeURIComponent(id)}/insights`);
  insightsUrl.searchParams.set('metric', 'post_impressions,post_impressions_unique,post_engaged_users,post_video_views');
  insightsUrl.searchParams.set('access_token', META_GRAPH_PAGE_ACCESS_TOKEN);
  try {
    const body = await fetchMetaGraphJson(insightsUrl.toString(), { timeoutMs: META_GRAPH_TIMEOUT_MS, label: 'facebook_graph_post_insights' });
    const out = {};
    for (const metric of Array.isArray(body?.data) ? body.data : []) {
      const key = String(metric?.name || '').trim();
      if (!key) continue;
      out[key] = parseFacebookInsightValue(metric);
    }
    return out;
  } catch (error) {
    return { __error: String(error?.message || error || 'facebook_graph_post_insights_failed').slice(0, 200) };
  }
}

async function fetchFacebookContentViaGraphApi({ maxItems = FACEBOOK_GRAPH_POST_LIMIT } = {}){
  if (!(META_GRAPH_PAGE_ID && META_GRAPH_PAGE_ACCESS_TOKEN)) {
    throw Object.assign(new Error('facebook_graph_missing_config'), { httpStatus: 428 });
  }
  const profile = await fetchFacebookGraphPageProfile();
  const listUrl = new URL(`https://graph.facebook.com/${encodeURIComponent(META_GRAPH_API_VERSION)}/${encodeURIComponent(profile.id)}/posts`);
  listUrl.searchParams.set(
    'fields',
    [
      'id',
      'message',
      'story',
      'created_time',
      'permalink_url',
      'full_picture',
      'status_type',
      'shares',
      'comments.limit(0).summary(true)',
      'reactions.limit(0).summary(true)'
    ].join(',')
  );
  listUrl.searchParams.set('limit', String(Math.max(1, Math.min(24, Number(maxItems) || FACEBOOK_GRAPH_POST_LIMIT))));
  listUrl.searchParams.set('access_token', META_GRAPH_PAGE_ACCESS_TOKEN);

  const body = await fetchMetaGraphJson(listUrl.toString(), { timeoutMs: META_GRAPH_TIMEOUT_MS, label: 'facebook_graph_posts' });
  const entries = Array.isArray(body?.data) ? body.data : [];
  const items = await Promise.all(entries.map(async (entry) => {
    const insights = await fetchFacebookPostInsightsViaGraphApi(entry?.id);
    const likeCount = firstFiniteNumber(parseFacebookSummaryCount(entry?.reactions));
    const commentCount = firstFiniteNumber(parseFacebookSummaryCount(entry?.comments));
    const shareCount = firstFiniteNumber(entry?.shares?.count);
    const reachCount = firstFiniteNumber(insights.post_impressions_unique, insights.post_impressions);
    const viewCount = firstFiniteNumber(insights.post_video_views);
    const engagedCount = firstFiniteNumber(insights.post_engaged_users);
    const interactionCount = firstFiniteNumber(engagedCount, (likeCount || 0) + (commentCount || 0) + (shareCount || 0));
    return {
      id: String(entry?.id || '').trim(),
      code: extractFacebookPostCode(entry?.permalink_url, entry?.id),
      permalink: String(entry?.permalink_url || '').trim(),
      caption: String(entry?.message || entry?.story || '').trim(),
      takenAt: String(entry?.created_time || '').trim(),
      productType: String(entry?.status_type || '').trim().toLowerCase(),
      likeCount,
      commentCount,
      shareCount,
      reachCount,
      viewCount,
      interactionCount,
      thumbnailUrl: String(entry?.full_picture || '').trim(),
    };
  }));

  const cutoffTs = Date.now() - (FACEBOOK_GRAPH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const normalizedItems = normalizeFacebookContentItems(items).filter((item) => {
    const ts = Date.parse(String(item.takenAt || ''));
    return !Number.isFinite(ts) || ts >= cutoffTs;
  });
  if (!normalizedItems.length) {
    throw Object.assign(new Error('facebook_graph_posts_missing'), { httpStatus: 502 });
  }

  const takenAts = normalizedItems
    .map((item) => Date.parse(String(item.takenAt || '')))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const aggregate = normalizedItems.reduce((acc, item) => {
    acc.likes += item.likeCount || 0;
    acc.comments += item.commentCount || 0;
    acc.shares += item.shareCount || 0;
    acc.reach += item.reachCount || 0;
    acc.views += item.viewCount || 0;
    acc.totalInteractions += item.interactionCount || 0;
    acc.accountsEngaged += item.interactionCount || 0;
    return acc;
  }, { likes: 0, comments: 0, shares: 0, reach: 0, views: 0, totalInteractions: 0, accountsEngaged: 0 });

  return {
    profile,
    source: 'graph_api',
    items: normalizedItems,
    summary: summarizeFacebookContentItems(normalizedItems),
    insights: summarizeFacebookContentInsights({
      rangeDays: FACEBOOK_GRAPH_LOOKBACK_DAYS,
      since: takenAts.length ? new Date(takenAts[0]).toISOString() : '',
      until: takenAts.length ? new Date(takenAts[takenAts.length - 1]).toISOString() : '',
      followersCount: firstFiniteNumber(facebookFollowersState.latest?.followersCount, facebookFollowersState.latest?.fanCount),
      ...aggregate,
    }),
  };
}

function normalizeInstagramContentItems(items = []){
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const code = String(item?.code || '').trim();
      if (!code) return null;
      const likeCount = item?.likeCount != null && Number.isFinite(Number(item.likeCount)) ? Math.max(0, Math.round(Number(item.likeCount))) : null;
      const commentCount = item?.commentCount != null && Number.isFinite(Number(item.commentCount)) ? Math.max(0, Math.round(Number(item.commentCount))) : null;
      const shareCount = item?.shareCount != null && Number.isFinite(Number(item.shareCount))
        ? Math.max(0, Math.round(Number(item.shareCount)))
        : (item?.repostCount != null && Number.isFinite(Number(item.repostCount)) ? Math.max(0, Math.round(Number(item.repostCount))) : null);
      const saveCount = item?.saveCount != null && Number.isFinite(Number(item.saveCount)) ? Math.max(0, Math.round(Number(item.saveCount))) : null;
      const reachCount = item?.reachCount != null && Number.isFinite(Number(item.reachCount)) ? Math.max(0, Math.round(Number(item.reachCount))) : null;
      const repostCount = shareCount;
      const viewCount = item?.viewCount != null && Number.isFinite(Number(item.viewCount)) ? Math.max(0, Math.round(Number(item.viewCount))) : null;
      const interactionCount = Number.isFinite(Number(item?.interactionCount))
        ? Math.max(0, Math.round(Number(item.interactionCount)))
        : (likeCount || 0) + (commentCount || 0) + (shareCount || 0) + (saveCount || 0);
      return {
        code,
        id: String(item?.id || '').trim(),
        permalink: String(item?.permalink || ('https://www.instagram.com/' + (String(item?.productType || '').trim() === 'clips' ? 'reel/' : 'p/') + code + '/')).trim(),
        caption: String(item?.caption || '').replace(/\s+/g, ' ').trim(),
        takenAt: String(item?.takenAt || '').trim(),
        productType: String(item?.productType || '').trim(),
        mediaType: Number.isFinite(Number(item?.mediaType)) ? Number(item.mediaType) : null,
        likeCount,
        commentCount,
        shareCount,
        saveCount,
        reachCount,
        repostCount,
        viewCount,
        interactionCount,
        thumbnailUrl: String(item?.thumbnailUrl || '').trim(),
      };
    })
    .filter(Boolean);
}

function summarizeInstagramContentItems(items = []){
  const rows = normalizeInstagramContentItems(items);
  const averageFor = (key) => {
    const values = rows.map((item) => item?.[key]).filter((value) => Number.isFinite(Number(value)));
    if (!values.length) return null;
    const total = values.reduce((sum, value) => sum + Number(value), 0);
    return Math.round(total / values.length);
  };
  if (!rows.length) {
    return {
      itemCount: 0,
      avgLikes: null,
      avgComments: null,
      avgShares: null,
      avgSaves: null,
      avgReach: null,
      avgViews: null,
      avgReposts: null,
      avgInteractions: null,
      topInteractionCount: null,
      topInteractionCode: '',
      latestTakenAt: '',
      oldestTakenAt: '',
    };
  }
  const totalInteractions = rows.reduce((sum, item) => sum + (item.interactionCount || 0), 0);
  const sortedByInteraction = rows.slice().sort((a, b) => (b.interactionCount || 0) - (a.interactionCount || 0));
  const takenAts = rows
    .map((item) => Date.parse(String(item.takenAt || '')))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  return {
    itemCount: rows.length,
    avgLikes: averageFor('likeCount'),
    avgComments: averageFor('commentCount'),
    avgShares: averageFor('shareCount'),
    avgSaves: averageFor('saveCount'),
    avgReach: averageFor('reachCount'),
    avgViews: averageFor('viewCount'),
    avgReposts: averageFor('shareCount'),
    avgInteractions: Math.round(totalInteractions / rows.length),
    topInteractionCount: sortedByInteraction[0]?.interactionCount ?? null,
    topInteractionCode: String(sortedByInteraction[0]?.code || ''),
    latestTakenAt: takenAts.length ? new Date(takenAts[takenAts.length - 1]).toISOString() : '',
    oldestTakenAt: takenAts.length ? new Date(takenAts[0]).toISOString() : '',
  };
}

function instagramContentResponsePayload(){
  const successTs = instagramContentCacheState.lastSuccessAt || instagramContentCacheState.payload?.fetchedAt || '';
  const freshness = classifyFacebookFollowerStaleLevel(successTs);
  const payload = instagramContentCacheState.payload || null;
  return {
    ok: !!payload,
    profile: {
      handle: String(payload?.profile?.handle || instagramFollowersState.profile?.handle || INSTAGRAM_PROFILE_HANDLE || '').trim(),
      name: String(payload?.profile?.name || instagramFollowersState.profile?.name || INSTAGRAM_PROFILE_NAME || '').trim(),
      url: INSTAGRAM_PROFILE_URL,
    },
    fetchedAt: String(payload?.fetchedAt || ''),
    source: String(payload?.source || ''),
    summary: payload?.summary || summarizeInstagramContentItems([]),
    insights: payload?.insights ? summarizeInstagramAccountInsights(payload.insights) : null,
    items: Array.isArray(payload?.items) ? payload.items : [],
    status: {
      stale: freshness.stale,
      staleLevel: freshness.staleLevel,
      ageMs: freshness.ageMs,
      lastSuccessAt: instagramContentCacheState.lastSuccessAt || '',
      lastAttemptAt: instagramContentCacheState.lastAttemptAt || '',
      consecutiveFailures: instagramContentCacheState.consecutiveFailures || 0,
      lastError: instagramContentCacheState.lastError || '',
    },
  };
}

function facebookContentResponsePayload(){
  const successTs = facebookContentCacheState.lastSuccessAt || facebookContentCacheState.payload?.fetchedAt || '';
  const freshness = classifyFacebookFollowerStaleLevel(successTs);
  const payload = facebookContentCacheState.payload || null;
  return {
    ok: !!payload,
    profile: {
      id: String(payload?.profile?.id || facebookFollowersState.page?.id || META_GRAPH_PAGE_ID || '').trim(),
      name: String(payload?.profile?.name || facebookFollowersState.page?.name || '').trim(),
      url: String(payload?.profile?.url || FACEBOOK_PAGE_URL).trim() || FACEBOOK_PAGE_URL,
    },
    fetchedAt: String(payload?.fetchedAt || ''),
    source: String(payload?.source || ''),
    summary: payload?.summary || summarizeFacebookContentItems([]),
    insights: payload?.insights ? summarizeFacebookContentInsights(payload.insights) : null,
    items: Array.isArray(payload?.items) ? payload.items : [],
    status: {
      stale: freshness.stale,
      staleLevel: freshness.staleLevel,
      ageMs: freshness.ageMs,
      lastSuccessAt: facebookContentCacheState.lastSuccessAt || '',
      lastAttemptAt: facebookContentCacheState.lastAttemptAt || '',
      consecutiveFailures: facebookContentCacheState.consecutiveFailures || 0,
      lastError: facebookContentCacheState.lastError || '',
    },
  };
}

async function fetchInstagramContentViaSession({ handle, profileUrl = INSTAGRAM_PROFILE_URL, timeoutMs = INSTAGRAM_META_SUITE_TIMEOUT_MS, maxItems = 12 } = {}){
  const scriptArgs = [
    INSTAGRAM_CONTENT_SESSION_SCRIPT_PATH,
    '--handle', String(handle || '').trim().replace(/^@+/, ''),
    '--url', String(profileUrl || INSTAGRAM_PROFILE_URL).trim(),
    '--storage', INSTAGRAM_META_SUITE_STORAGE_PATH,
    '--timeout-ms', String(Math.max(5000, Number(timeoutMs) || INSTAGRAM_META_SUITE_TIMEOUT_MS)),
    '--max-items', String(Math.max(1, Math.min(24, Number(maxItems) || 12))),
    '--headless', INSTAGRAM_META_SUITE_HEADLESS ? '1' : '0',
  ];

  const result = await execFileSafe('node', scriptArgs, {
    timeout: Math.max(15_000, Number(timeoutMs) + 8_000),
    maxBuffer: 2 * 1024 * 1024,
  });

  if (!result.ok) {
    const stderrSnippet = String(result.stderr || '').trim().slice(0, 280);
    const stdoutSnippet = String(result.stdout || '').trim().slice(0, 280);
    const msg = stderrSnippet || stdoutSnippet || String(result.error?.message || 'instagram_content_script_exec_failed');
    const err = new Error('instagram_content_exec_failed: ' + msg);
    err.httpStatus = /timed out/i.test(msg) ? 504 : 502;
    throw err;
  }

  const parsed = parseJsonSafely(result.stdout, 'instagram_content_session_scraper');
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
    throw Object.assign(new Error('instagram_content_invalid_json_output'), { httpStatus: 502 });
  }

  if (!parsed.value.ok) {
    const reason = String(parsed.value.reason || parsed.value.error || 'instagram_content_failed');
    const err = new Error(reason);
    err.httpStatus = reason === 'instagram_content_setup_required' ? 428 : 502;
    err.setupRequired = reason === 'instagram_content_setup_required';
    err.details = parsed.value;
    throw err;
  }

  const items = normalizeInstagramContentItems(parsed.value.items);
  if (!items.length) {
    throw Object.assign(new Error('instagram_content_items_missing'), { httpStatus: 502 });
  }

  return {
    profile: {
      handle: String(parsed.value.profileHandle || handle || instagramFollowersState.profile?.handle || INSTAGRAM_PROFILE_HANDLE || '').trim(),
      name: String(parsed.value.profileName || instagramFollowersState.profile?.name || INSTAGRAM_PROFILE_NAME || '').trim(),
    },
    source: String(parsed.value.provider || 'instagram_session_graphql').trim() || 'instagram_session_graphql',
    items,
    summary: summarizeInstagramContentItems(items),
  };
}

async function getInstagramContentPayload({ force = false, source = 'auto' } = {}){
  if (!force && instagramContentCacheState.payload && Date.now() < instagramContentCacheState.expiresAt) {
    return instagramContentResponsePayload();
  }

  instagramContentCacheState.lastAttemptAt = new Date().toISOString();
  let graphReason = '';

  try {
    let fresh = null;
    if (isInstagramGraphConfigured() && INSTAGRAM_PROVIDER !== 'public') {
      try {
        fresh = await fetchInstagramContentViaGraphApi({ maxItems: INSTAGRAM_GRAPH_MEDIA_LIMIT });
      } catch (error) {
        graphReason = String(error?.message || error || 'instagram_graph_failed').slice(0, 220);
      }
    }
    if (!fresh) {
      const profile = instagramFollowersState.profile || {};
      fresh = await fetchInstagramContentViaSession({
        handle: String(profile.handle || INSTAGRAM_PROFILE_HANDLE).trim().replace(/^@+/, ''),
        profileUrl: INSTAGRAM_PROFILE_URL,
        timeoutMs: INSTAGRAM_META_SUITE_TIMEOUT_MS,
        maxItems: 12,
      });
    }
    const fetchedAt = new Date().toISOString();
    instagramContentCacheState.payload = {
      profile: fresh.profile,
      source: fresh.source,
      fetchedAt,
      items: fresh.items,
      summary: fresh.summary,
      insights: fresh.insights ? summarizeInstagramAccountInsights(fresh.insights) : null,
      requestedBy: String(source || 'auto').trim() || 'auto',
    };
    instagramContentCacheState.expiresAt = Date.now() + INSTAGRAM_CONTENT_CACHE_TTL_MS;
    instagramContentCacheState.lastSuccessAt = fetchedAt;
    instagramContentCacheState.consecutiveFailures = 0;
    instagramContentCacheState.lastError = graphReason && fresh.source !== 'graph_api'
      ? ('graph_unavailable_using_fallback: ' + graphReason).slice(0, 280)
      : '';
    return instagramContentResponsePayload();
  } catch (error) {
    instagramContentCacheState.consecutiveFailures = (instagramContentCacheState.consecutiveFailures || 0) + 1;
    instagramContentCacheState.lastError = String(error?.message || error || 'instagram_content_failed').slice(0, 280);
    if (instagramContentCacheState.payload) return instagramContentResponsePayload();
    throw error;
  }
}

async function handleApiInstagramContent(req, res) {
  const pathname = new URL(req.url || '/api/instagram-content', 'http://localhost:' + PORT).pathname;
  if (pathname === '/api/instagram-content/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/instagram-content/refresh.' });
    let source = 'manual';
    try {
      const reqUrl = new URL(req.url || '/api/instagram-content/refresh', 'http://localhost:' + PORT);
      source = String(reqUrl.searchParams.get('source') || '').trim() || source;
    } catch {}
    try {
      const payload = await getInstagramContentPayload({ force: true, source });
      return sendJson(res, payload.ok ? 200 : 503, payload);
    } catch (error) {
      return sendJson(res, Number(error?.httpStatus || 503), { ok: false, error: 'instagram_content_refresh_failed', message: String(error?.message || error || 'Unable to refresh Instagram content').slice(0, 220) });
    }
  }
  if (pathname === '/api/instagram-content/health') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/instagram-content/health.' });
    return sendJson(res, 200, { ok: true, profile: instagramContentResponsePayload().profile, status: instagramContentResponsePayload().status });
  }
  if (pathname !== '/api/instagram-content') return sendJson(res, 404, { ok: false, error: 'not_found' });
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/instagram-content.' });
  try {
    return sendJson(res, 200, await getInstagramContentPayload({ force: false, source: 'auto' }));
  } catch (error) {
    return sendJson(res, Number(error?.httpStatus || 503), { ok: false, error: 'instagram_content_failed', message: String(error?.message || error || 'Unable to load Instagram content').slice(0, 220) });
  }
}

async function getFacebookContentPayload({ force = false, source = 'auto' } = {}){
  if (!force && facebookContentCacheState.payload && Date.now() < facebookContentCacheState.expiresAt) {
    return facebookContentResponsePayload();
  }

  facebookContentCacheState.lastAttemptAt = new Date().toISOString();
  try {
    const fresh = await fetchFacebookContentViaGraphApi({ maxItems: FACEBOOK_GRAPH_POST_LIMIT });
    const fetchedAt = new Date().toISOString();
    facebookContentCacheState.payload = {
      profile: fresh.profile,
      source: fresh.source,
      fetchedAt,
      items: fresh.items,
      summary: fresh.summary,
      insights: fresh.insights ? summarizeFacebookContentInsights(fresh.insights) : null,
      requestedBy: String(source || 'auto').trim() || 'auto',
    };
    facebookContentCacheState.expiresAt = Date.now() + FACEBOOK_CONTENT_CACHE_TTL_MS;
    facebookContentCacheState.lastSuccessAt = fetchedAt;
    facebookContentCacheState.consecutiveFailures = 0;
    facebookContentCacheState.lastError = '';
    return facebookContentResponsePayload();
  } catch (error) {
    facebookContentCacheState.consecutiveFailures = (facebookContentCacheState.consecutiveFailures || 0) + 1;
    facebookContentCacheState.lastError = String(error?.message || error || 'facebook_content_failed').slice(0, 280);
    if (facebookContentCacheState.payload) return facebookContentResponsePayload();
    throw error;
  }
}

async function handleApiFacebookContent(req, res) {
  const pathname = new URL(req.url || '/api/facebook-content', 'http://localhost:' + PORT).pathname;
  if (pathname === '/api/facebook-content/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/facebook-content/refresh.' });
    let source = 'manual';
    try {
      const reqUrl = new URL(req.url || '/api/facebook-content/refresh', 'http://localhost:' + PORT);
      source = String(reqUrl.searchParams.get('source') || '').trim() || source;
    } catch {}
    try {
      const payload = await getFacebookContentPayload({ force: true, source });
      return sendJson(res, payload.ok ? 200 : 503, payload);
    } catch (error) {
      return sendJson(res, Number(error?.httpStatus || 503), { ok: false, error: 'facebook_content_refresh_failed', message: String(error?.message || error || 'Unable to refresh Facebook content').slice(0, 220) });
    }
  }
  if (pathname === '/api/facebook-content/health') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/facebook-content/health.' });
    return sendJson(res, 200, { ok: true, profile: facebookContentResponsePayload().profile, status: facebookContentResponsePayload().status });
  }
  if (pathname !== '/api/facebook-content') return sendJson(res, 404, { ok: false, error: 'not_found' });
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/facebook-content.' });
  try {
    return sendJson(res, 200, await getFacebookContentPayload({ force: false, source: 'auto' }));
  } catch (error) {
    return sendJson(res, Number(error?.httpStatus || 503), { ok: false, error: 'facebook_content_failed', message: String(error?.message || error || 'Unable to load Facebook content').slice(0, 220) });
  }
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
        try {
          const endpoint = 'https://graph.facebook.com/' + encodeURIComponent(META_GRAPH_API_VERSION) + '/' + encodeURIComponent(META_GRAPH_PAGE_ID) + '?fields=followers_count,fan_count,name&access_token=' + encodeURIComponent(META_GRAPH_PAGE_ACCESS_TOKEN);
          const res = await coordinatedSafeFetch(endpoint, {
            method: 'GET',
            timeoutMs: META_GRAPH_TIMEOUT_MS,
            firstByteTimeoutMs: META_GRAPH_TIMEOUT_MS,
            maxBytes: 2 * 1024 * 1024,
            maxRedirects: 1,
            allowedHosts: ['graph.facebook.com'],
            headers: { 'Accept': 'application/json' },
          }, { integration: 'social', key: 'social:facebook-followers-graph' });
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
        }
      }
    }

    let sessionReason = '';
    try {
      const sessionPage = await fetchFacebookFollowersViaPageSession({ pageUrl: FACEBOOK_PAGE_URL, timeoutMs: FACEBOOK_SESSION_TIMEOUT_MS });
      const fetchedAt = new Date().toISOString();
      const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
      const latencyMs = Math.max(0, Date.now() - startedAt);
      facebookFollowersState.page = {
        id: facebookFollowersState.page?.id || META_GRAPH_PAGE_ID || FACEBOOK_PAGE_URL,
        name: sessionPage.pageName || facebookFollowersState.page?.name || ''
      };
      facebookFollowersState.latest = { followersCount: sessionPage.count, fanCount: null, fetchedAt, source: sessionPage.provider, requestId, latencyMs, stale };
      facebookFollowersState.status = {
        ok: true,
        lastSuccessAt: fetchedAt,
        lastAttemptAt: fetchedAt,
        consecutiveFailures: 0,
        lastError: graphErrorReason ? ('graph_unavailable_using_fallback: ' + graphErrorReason).slice(0, 280) : ''
      };
      facebookFollowersState.history.push({ followersCount: sessionPage.count, fetchedAt });
      if (facebookFollowersState.history.length > FACEBOOK_FOLLOWERS_HISTORY_LIMIT) facebookFollowersState.history = facebookFollowersState.history.slice(-FACEBOOK_FOLLOWERS_HISTORY_LIMIT);
      facebookFollowersState.updatedAt = new Date().toISOString();
      await persistFacebookFollowersState();
      await appendFacebookFollowersLog({
        ts: new Date().toISOString(),
        event: 'facebook_followers_poll',
        ok: true,
        source,
        requestId,
        httpStatus,
        latencyMs,
        followersCount: sessionPage.count,
        provider: sessionPage.provider,
        ageMs: 0,
        error: graphErrorReason || '',
        signal: sessionPage.signal || '',
        fallbackFrom: graphErrorReason || ''
      });
      return facebookFollowerResponsePayload();
    } catch (err) {
      const status = Number(err?.httpStatus || 0);
      const message = String(err?.message || err || 'facebook_session_failed').slice(0, 220);
      sessionReason = ((status === 428 || err?.setupRequired)
        ? 'facebook_session_setup_required'
        : /abort|timeout|timed out/i.test(message)
          ? 'facebook_session_timeout'
          : 'facebook_session_failed') + ': ' + message;
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
      const fallbackReason = [graphErrorReason, sessionReason].filter(Boolean).join(' | ');
      facebookFollowersState.status = { ok: true, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: fallbackReason ? ('fallback_chain: ' + fallbackReason).slice(0, 280) : '' };
      facebookFollowersState.history.push({ followersCount: parsed.count, fetchedAt });
      if (facebookFollowersState.history.length > FACEBOOK_FOLLOWERS_HISTORY_LIMIT) facebookFollowersState.history = facebookFollowersState.history.slice(-FACEBOOK_FOLLOWERS_HISTORY_LIMIT);
      facebookFollowersState.updatedAt = new Date().toISOString();
      await persistFacebookFollowersState();
      await appendFacebookFollowersLog({ ts: new Date().toISOString(), event: 'facebook_followers_poll', ok: true, source, requestId, httpStatus, latencyMs, followersCount: parsed.count, provider: 'public_scrape_estimate', ageMs: 0, error: fallbackReason || '', signal: parsed.signal || '', fallbackFrom: fallbackReason || '' });
      return facebookFollowerResponsePayload();
    } catch (err) {
      const message = String(err?.message || err || 'public_scrape_failed').slice(0, 220);
      const status = Number(err?.httpStatus || 0);
      httpStatus = status || httpStatus;
      const publicReason = ((status === 401 || status === 403) ? 'public_scrape_blocked' : /not_found/i.test(message) ? 'public_signal_not_found' : /abort|timeout/i.test(message) ? 'public_scrape_timeout' : 'public_scrape_failed') + ': ' + message;
      facebookFollowersState.status.ok = false;
      facebookFollowersState.status.consecutiveFailures = (facebookFollowersState.status.consecutiveFailures || 0) + 1;
      facebookFollowersState.status.lastError = [graphErrorReason, sessionReason, publicReason].filter(Boolean).join(' | ');
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
  if (pathname === '/api/facebook-followers/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/facebook-followers/refresh.' });
    let source = 'manual';
    try {
      const reqUrl = new URL(req.url || '/api/facebook-followers/refresh', 'http://localhost:' + PORT);
      source = String(reqUrl.searchParams.get('source') || '').trim() || source;
      const bodyRaw = await readBody(req, { maxBytes: REQUEST_BODY_LIMIT_ACTION_BYTES });
      if (bodyRaw) {
        const parsed = parseJsonSafely(bodyRaw, 'facebook_followers_refresh_body');
        if (parsed.ok && parsed.value && typeof parsed.value === 'object' && parsed.value.source) source = String(parsed.value.source).trim();
      }
    } catch (err) {
      if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
    }
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

function facebookGroupMembersResponsePayload(opts = {}){
  const successTs = facebookGroupMembersState.status.lastSuccessAt || facebookGroupMembersState.latest?.fetchedAt || '';
  const freshness = classifyFacebookFollowerStaleLevel(successTs);
  const normalizedHistory = facebookGroupMembersState.history.map((h) => ({ followersCount: h.membersCount, fetchedAt: h.fetchedAt }));
  const hasLatestCount = Number.isFinite(Number(facebookGroupMembersState.latest?.membersCount)) && Number(facebookGroupMembersState.latest?.membersCount) > 0;
  return {
    ok: !!facebookGroupMembersState.latest,
    group: { ...facebookGroupMembersState.group },
    latest: facebookGroupMembersState.latest ? {
      membersCount: facebookGroupMembersState.latest.membersCount,
      fetchedAt: facebookGroupMembersState.latest.fetchedAt,
      source: facebookGroupMembersState.latest.source || 'facebook_group_playwright',
      delta: calculateFollowerDelta(normalizedHistory, facebookGroupMembersState.latest.membersCount),
      rollingDelta1h: calculateFollowerRollingDelta(normalizedHistory, facebookGroupMembersState.latest.membersCount, facebookGroupMembersState.latest.fetchedAt, 60 * 60 * 1000),
      rollingDelta24h: calculateFollowerRollingDelta(normalizedHistory, facebookGroupMembersState.latest.membersCount, facebookGroupMembersState.latest.fetchedAt, 24 * 60 * 60 * 1000),
    } : null,
    status: {
      stale: freshness.stale,
      staleLevel: freshness.staleLevel,
      ageMs: freshness.ageMs,
      setupRequired: hasLatestCount ? false : !!facebookGroupMembersState.status.setupRequired,
      lastSuccessAt: facebookGroupMembersState.status.lastSuccessAt || '',
      lastAttemptAt: facebookGroupMembersState.status.lastAttemptAt || '',
      consecutiveFailures: facebookGroupMembersState.status.consecutiveFailures || 0,
      lastError: facebookGroupMembersState.status.lastError || '',
    },
    history: opts.includeHistory === false ? [] : facebookGroupMembersState.history,
  };
}

async function pollFacebookGroupMembers({ source = 'interval' } = {}){
  if (facebookGroupMembersPollInFlight) return facebookGroupMembersPollInFlight;
  const run = (async () => {
    const requestId = 'fbg_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex');
    const startedAt = Date.now();
    facebookGroupMembersState.status.lastAttemptAt = new Date().toISOString();

    const groupUrl = String(facebookGroupMembersState.group.url || FACEBOOK_GROUP_URL || '').trim();
    if (!groupUrl) {
      facebookGroupMembersState.status.ok = false;
      facebookGroupMembersState.status.setupRequired = true;
      facebookGroupMembersState.status.consecutiveFailures = (facebookGroupMembersState.status.consecutiveFailures || 0) + 1;
      facebookGroupMembersState.status.lastError = 'setup_required: set FACEBOOK_GROUP_URL';
      facebookGroupMembersState.updatedAt = new Date().toISOString();
      await persistFacebookGroupMembersState();
      await appendFacebookGroupMembersLog({ ts: new Date().toISOString(), event: 'facebook_group_members_poll', ok: false, source, requestId, provider: 'setup_required', error: facebookGroupMembersState.status.lastError });
      return facebookGroupMembersResponsePayload();
    }

    try {
      const sessionGroup = await fetchFacebookGroupMembersViaSession({ groupUrl, timeoutMs: FACEBOOK_SESSION_TIMEOUT_MS });
      const fetchedAt = new Date().toISOString();
      const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
      const latencyMs = Math.max(0, Date.now() - startedAt);
      facebookGroupMembersState.group.url = groupUrl;
      if (sessionGroup.groupName) facebookGroupMembersState.group.name = sessionGroup.groupName;
      facebookGroupMembersState.latest = { membersCount: sessionGroup.count, fetchedAt, source: sessionGroup.provider, requestId, latencyMs, stale };
      facebookGroupMembersState.status = { ok: true, setupRequired: false, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: '' };
      facebookGroupMembersState.history.push({ membersCount: sessionGroup.count, fetchedAt });
      if (facebookGroupMembersState.history.length > FACEBOOK_GROUP_MEMBERS_HISTORY_LIMIT) facebookGroupMembersState.history = facebookGroupMembersState.history.slice(-FACEBOOK_GROUP_MEMBERS_HISTORY_LIMIT);
      facebookGroupMembersState.updatedAt = new Date().toISOString();
      await persistFacebookGroupMembersState();
      const normalizedHistory = facebookGroupMembersState.history.map((h) => ({ followersCount: h.membersCount, fetchedAt: h.fetchedAt }));
      await appendFacebookGroupMembersLog({ ts: new Date().toISOString(), event: 'facebook_group_members_poll', ok: true, source, requestId, membersCount: sessionGroup.count, delta: calculateFollowerDelta(normalizedHistory, sessionGroup.count), provider: sessionGroup.provider, signal: sessionGroup.signal || '', latencyMs });
      return facebookGroupMembersResponsePayload();
    } catch (err) {
      const status = Number(err?.httpStatus || 0);
      const message = String(err?.message || err || 'facebook_group_session_failed').slice(0, 220);
      facebookGroupMembersState.status.ok = false;
      facebookGroupMembersState.status.setupRequired = !!err?.setupRequired;
      facebookGroupMembersState.status.lastAttemptAt = new Date().toISOString();
      facebookGroupMembersState.status.consecutiveFailures = (facebookGroupMembersState.status.consecutiveFailures || 0) + 1;
      facebookGroupMembersState.status.lastError = (((status === 428 || err?.setupRequired) ? 'facebook_group_session_setup_required' : /abort|timeout|timed out/i.test(message) ? 'facebook_group_session_timeout' : 'facebook_group_session_failed') + ': ' + message).slice(0, 280);
      if (facebookGroupMembersState.latest && Number.isFinite(Number(facebookGroupMembersState.latest.membersCount)) && Number(facebookGroupMembersState.latest.membersCount) > 0) {
        facebookGroupMembersState.latest.stale = true;
        facebookGroupMembersState.latest.source = 'last_known_fallback';
      }
      facebookGroupMembersState.updatedAt = new Date().toISOString();
      await persistFacebookGroupMembersState();
      const freshness = classifyFacebookFollowerStaleLevel(facebookGroupMembersState.status.lastSuccessAt || '');
      await appendFacebookGroupMembersLog({ ts: new Date().toISOString(), event: 'facebook_group_members_poll', ok: false, source, requestId, membersCount: facebookGroupMembersState.latest?.membersCount ?? null, ageMs: freshness.ageMs, provider: facebookGroupMembersState.latest?.source === 'last_known_fallback' ? 'last_known_fallback' : 'facebook_group_playwright', error: facebookGroupMembersState.status.lastError });
      return facebookGroupMembersResponsePayload();
    }
  })();

  facebookGroupMembersPollInFlight = run;
  try { return await run; } finally { facebookGroupMembersPollInFlight = null; }
}

async function initFacebookGroupMembersService(){
  await loadFacebookGroupMembersState();
  await pollFacebookGroupMembers({ source: 'startup_bootstrap' });
  if (facebookGroupMembersPollTimer) clearInterval(facebookGroupMembersPollTimer);
  facebookGroupMembersPollTimer = setInterval(() => {
    pollFacebookGroupMembers({ source: 'interval' }).catch(() => {});
  }, FACEBOOK_GROUP_POLL_INTERVAL_MS);
}

async function handleApiFacebookGroupMembers(req, res) {
  const pathname = new URL(req.url || '/api/facebook-group-members', 'http://localhost:' + PORT).pathname;
  if (pathname === '/api/facebook-group-members/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/facebook-group-members/refresh.' });
    let source = 'manual';
    try {
      const reqUrl = new URL(req.url || '/api/facebook-group-members/refresh', 'http://localhost:' + PORT);
      source = String(reqUrl.searchParams.get('source') || 'manual');
    } catch {}
    const payload = await pollFacebookGroupMembers({ source: source || 'manual' });
    return sendJson(res, payload.ok ? 200 : 503, payload);
  }
  if (pathname === '/api/facebook-group-members/health') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/facebook-group-members/health.' });
    return sendJson(res, 200, { ok: true, status: facebookGroupMembersResponsePayload({ includeHistory: false }).status, group: facebookGroupMembersState.group });
  }
  if (pathname !== '/api/facebook-group-members') return sendJson(res, 404, { ok: false, error: 'not_found' });
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/facebook-group-members.' });
  return sendJson(res, 200, facebookGroupMembersResponsePayload());
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
    let tertiaryReason = '';
    const mode = INSTAGRAM_PROVIDER;
    const allowGraph = mode === 'auto' || mode === 'meta_suite' || mode === 'graph_api';

    if (allowGraph && isInstagramGraphConfigured()) {
      try {
        const graphProfile = await fetchInstagramFollowersViaGraphApi();
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
          if (graphProfile.count < minAllowed || graphProfile.count > maxAllowed) {
            throw Object.assign(new Error('instagram_graph_count_outlier_' + graphProfile.count + '_expected_near_' + referenceCount), { httpStatus: 502 });
          }
        }

        const fetchedAt = new Date().toISOString();
        const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
        const latencyMs = Math.max(0, Date.now() - startedAt);

        if (graphProfile.profileName) instagramFollowersState.profile.name = graphProfile.profileName;
        instagramFollowersState.profile.handle = graphProfile.profileHandle || handle;
        instagramFollowersState.latest = { followersCount: graphProfile.count, fetchedAt, source: graphProfile.provider, requestId, latencyMs, stale };
        instagramFollowersState.status = { ok: true, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: '' };
        instagramFollowersState.history.push({ followersCount: graphProfile.count, fetchedAt });
        if (instagramFollowersState.history.length > INSTAGRAM_FOLLOWERS_HISTORY_LIMIT) instagramFollowersState.history = instagramFollowersState.history.slice(-INSTAGRAM_FOLLOWERS_HISTORY_LIMIT);
        instagramFollowersState.updatedAt = new Date().toISOString();
        await persistInstagramFollowersState();
        await appendInstagramFollowersLog({ ts: new Date().toISOString(), event: 'instagram_followers_poll', ok: true, source, requestId, followersCount: graphProfile.count, delta: calculateFollowerDelta(instagramFollowersState.history, graphProfile.count), provider: graphProfile.provider, signal: graphProfile.signal || '', latencyMs, mode });
        return instagramFollowerResponsePayload();
      } catch (err) {
        const status = Number(err?.httpStatus || 0);
        const message = String(err?.message || err || 'instagram_graph_failed').slice(0, 220);
        primaryReason = ((status === 428 || err?.setupRequired) ? 'instagram_graph_setup_required' : /abort|timeout|timed out/i.test(message) ? 'instagram_graph_timeout' : 'instagram_graph_failed') + ': ' + message;
      }
    } else if (allowGraph) {
      primaryReason = 'instagram_graph_missing_config';
    }

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
        await appendInstagramFollowersLog({ ts: new Date().toISOString(), event: 'instagram_followers_poll', ok: true, source, requestId, followersCount: meta.count, delta: calculateFollowerDelta(instagramFollowersState.history, meta.count), provider: meta.provider, signal: meta.signal || '', latencyMs, fallbackFrom: primaryReason || '', mode });
        return instagramFollowerResponsePayload();
      } catch (err) {
        const status = Number(err?.httpStatus || 0);
        const message = String(err?.message || err || 'meta_suite_failed').slice(0, 220);
        secondaryReason = ((status === 428 || err?.setupRequired) ? 'meta_suite_setup_required' : /abort|timeout|timed out/i.test(message) ? 'meta_suite_timeout' : 'meta_suite_failed') + ': ' + message;
      }
    }

    if (mode === 'meta_suite' || mode === 'auto') {
      try {
        const sessionProfile = await fetchInstagramFollowersViaProfileSession({ handle, profileUrl, timeoutMs: INSTAGRAM_META_SUITE_TIMEOUT_MS });
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
          if (sessionProfile.count < minAllowed || sessionProfile.count > maxAllowed) {
            throw Object.assign(new Error('instagram_session_count_outlier_' + sessionProfile.count + '_expected_near_' + referenceCount), { httpStatus: 502 });
          }
        }

        const fetchedAt = new Date().toISOString();
        const stale = classifyFacebookFollowerStaleLevel(fetchedAt).stale;
        const latencyMs = Math.max(0, Date.now() - startedAt);

        if (sessionProfile.profileName) instagramFollowersState.profile.name = sessionProfile.profileName;
        instagramFollowersState.profile.handle = handle;
        instagramFollowersState.latest = { followersCount: sessionProfile.count, fetchedAt, source: sessionProfile.provider, requestId, latencyMs, stale };
        instagramFollowersState.status = { ok: true, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: [primaryReason, secondaryReason].filter(Boolean).join(' | ').slice(0, 280) };
        instagramFollowersState.history.push({ followersCount: sessionProfile.count, fetchedAt });
        if (instagramFollowersState.history.length > INSTAGRAM_FOLLOWERS_HISTORY_LIMIT) instagramFollowersState.history = instagramFollowersState.history.slice(-INSTAGRAM_FOLLOWERS_HISTORY_LIMIT);
        instagramFollowersState.updatedAt = new Date().toISOString();
        await persistInstagramFollowersState();
        await appendInstagramFollowersLog({ ts: new Date().toISOString(), event: 'instagram_followers_poll', ok: true, source, requestId, followersCount: sessionProfile.count, delta: calculateFollowerDelta(instagramFollowersState.history, sessionProfile.count), provider: sessionProfile.provider, signal: sessionProfile.signal || '', latencyMs, fallbackFrom: [primaryReason, secondaryReason].filter(Boolean).join(' | ') || '', mode });
        return instagramFollowerResponsePayload();
      } catch (err) {
        const status = Number(err?.httpStatus || 0);
        const message = String(err?.message || err || 'instagram_session_failed').slice(0, 220);
        tertiaryReason = ((status === 428 || err?.setupRequired) ? 'instagram_session_setup_required' : /abort|timeout|timed out/i.test(message) ? 'instagram_session_timeout' : 'instagram_session_failed') + ': ' + message;
      }
    }

    if (mode === 'public' || mode === 'auto' || mode === 'meta_suite' || mode === 'graph_api') {
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
        instagramFollowersState.status = { ok: true, lastSuccessAt: fetchedAt, lastAttemptAt: fetchedAt, consecutiveFailures: 0, lastError: [primaryReason, secondaryReason, tertiaryReason].filter(Boolean).join(' | ').slice(0, 280) };
        instagramFollowersState.history.push({ followersCount: parsed.count, fetchedAt });
        if (instagramFollowersState.history.length > INSTAGRAM_FOLLOWERS_HISTORY_LIMIT) instagramFollowersState.history = instagramFollowersState.history.slice(-INSTAGRAM_FOLLOWERS_HISTORY_LIMIT);
        instagramFollowersState.updatedAt = new Date().toISOString();
        await persistInstagramFollowersState();
        await appendInstagramFollowersLog({ ts: new Date().toISOString(), event: 'instagram_followers_poll', ok: true, source, requestId, followersCount: parsed.count, delta: calculateFollowerDelta(instagramFollowersState.history, parsed.count), provider: 'instagram_public_scrape_estimate', signal: parsed.signal || '', latencyMs, fallbackFrom: [primaryReason, secondaryReason, tertiaryReason].filter(Boolean).join(' | ') || '', mode });
        return instagramFollowerResponsePayload();
      } catch (err) {
        const status = Number(err?.httpStatus || 0);
        const message = String(err?.message || err || 'instagram_public_scrape_failed').slice(0, 220);
        const publicReason = ((status === 401 || status === 403) ? 'instagram_public_scrape_blocked' : /not_found/i.test(message) ? 'instagram_public_signal_not_found' : /abort|timeout/i.test(message) ? 'instagram_public_scrape_timeout' : 'instagram_public_scrape_failed') + ': ' + message;
        if (!tertiaryReason || mode === 'public') tertiaryReason = publicReason;
        else tertiaryReason = [tertiaryReason, publicReason].filter(Boolean).join(' | ').slice(0, 280);
      }
    }

    const chainReason = [primaryReason, secondaryReason, tertiaryReason].filter(Boolean).join(' | ').slice(0, 280);
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
  if (pathname === '/api/instagram-followers/refresh') {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/instagram-followers/refresh.' });
    let source = 'manual';
    let followersCount = null;
    try {
      const reqUrl = new URL(req.url || '/api/instagram-followers/refresh', 'http://localhost:' + PORT);
      source = String(reqUrl.searchParams.get('source') || '').trim() || source;
      const bodyRaw = await readBody(req, { maxBytes: REQUEST_BODY_LIMIT_ACTION_BYTES });
      if (bodyRaw) {
        const parsed = parseJsonSafely(bodyRaw, 'instagram_followers_refresh_body');
        if (parsed.ok && parsed.value && typeof parsed.value === 'object') {
          if (parsed.value.source) source = String(parsed.value.source).trim();
          if (Number.isFinite(Number(parsed.value.followersCount)) && Number(parsed.value.followersCount) > 0) {
            followersCount = Number(parsed.value.followersCount);
          }
        }
      }
    } catch (err) {
      if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
    }
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
      rollingDelta1h: calculateFollowerRollingDelta(tiktokFollowersState.history, tiktokFollowersState.latest.followersCount, tiktokFollowersState.latest.fetchedAt, 60 * 60 * 1000),
      rollingDelta24h: calculateFollowerRollingDelta(tiktokFollowersState.history, tiktokFollowersState.latest.followersCount, tiktokFollowersState.latest.fetchedAt, 24 * 60 * 60 * 1000),
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
  if (process.platform === 'win32') return null;
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
    if (process.platform === 'win32') {
      const rawSystemDrive = String(process.env.SystemDrive || path.parse(os.homedir()).root.slice(0, 2) || 'C:').replace(/\\+$/, '');
      const systemDrive = /^[A-Za-z]:$/.test(rawSystemDrive) ? rawSystemDrive.toUpperCase() : 'C:';
      const command = `$d=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${systemDrive}'"; if($d -and $d.Size){ [Math]::Round((($d.Size - $d.FreeSpace) / $d.Size) * 100, 1) }`;
      execFile('powershell.exe', ['-NoProfile', '-Command', command], { timeout: SYS_MONITOR_TIMEOUT_MS, maxBuffer: 512 * 1024 }, (err, stdout) => {
        if (err) return resolve(null);
        const percent = Number(String(stdout || '').trim());
        resolve(Number.isFinite(percent) ? percent : null);
      });
      return;
    }

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
    if (process.platform === 'win32') {
      const limit = Math.max(10, Math.min(500, SYS_MONITOR_MAX_PROCESSES));
      const command = `Get-Process | Sort-Object CPU -Descending | Select-Object -First ${limit} Id,ProcessName,CPU,WS | ConvertTo-Json -Compress`;
      execFile('powershell.exe', ['-NoProfile', '-Command', command], { timeout: SYS_MONITOR_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve([]);
        try {
          const parsed = JSON.parse(String(stdout || '[]').trim() || '[]');
          const rows = (Array.isArray(parsed) ? parsed : [parsed])
            .map((proc) => {
              const pid = Number(proc?.Id);
              const name = String(proc?.ProcessName || '').trim();
              const cpu = Number(proc?.CPU);
              const workingSet = Number(proc?.WS);
              if (!Number.isFinite(pid) || !name) return null;
              return {
                pid,
                name,
                cpuPercent: Number.isFinite(cpu) ? Math.max(0, Number(cpu.toFixed(1))) : 0,
                memPercent: Number.isFinite(workingSet) && os.totalmem() > 0
                  ? Math.max(0, Number(((workingSet / os.totalmem()) * 100).toFixed(1)))
                  : 0,
              };
            })
            .filter(Boolean)
            .slice(0, SYS_MONITOR_MAX_PROCESSES);
          resolve(rows);
        } catch {
          resolve([]);
        }
      });
      return;
    }

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
    platform: {
      os: process.platform,
      diskAdapter: process.platform === 'win32' ? 'powershell_cim' : 'df',
      processAdapter: process.platform === 'win32' ? 'powershell_get_process' : 'ps',
      networkAdapter: process.platform === 'win32' ? 'unavailable' : 'proc_net_dev',
    },
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

function buildPingArgs(host) {
  return process.platform === 'win32'
    ? ['-n', '1', '-w', '1000', host]
    : ['-c', '1', '-W', '1', host];
}

async function handleApiHomeDevicePing(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/home-devices/ping.' });
  const bodyRaw = await readBody(req);
  const parsed = parseJsonSafely(bodyRaw || '{}', 'home_device_ping');
  if (!parsed.ok) return sendJson(res, 400, { ok: false, error: parsed.error, message: parsed.message });
  const host = String(parsed.value?.host || '').trim();
  if (!host) return sendJson(res, 400, { ok: false, error: 'missing_host', message: 'host is required.' });
  if (!isPrivateOrLocalHost(host)) return sendJson(res, 400, { ok: false, error: 'host_not_local', message: 'host must be local/private IP or .local hostname.' });

  const start = Date.now();
  const out = await runExecFile('ping', buildPingArgs(host), HOME_DEVICE_TIMEOUT_MS);
  const latencyMs = Date.now() - start;
  if (out.ok) return sendJson(res, 200, { ok: true, reachable: true, host, latencyMs, message: 'Host reachable.' });
  return sendJson(res, 200, { ok: true, reachable: false, host, latencyMs: null, message: out.stderr || out.error?.message || 'Ping failed.' });
}

async function handleApiHomeDeviceWake(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/home-devices/wake.' });
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
  return coordinatedSafeFetch(upstreamUrl, {
    method: 'GET',
    timeoutMs,
    firstByteTimeoutMs: timeoutMs,
    maxBytes: 2 * 1024 * 1024,
    maxRedirects: 3,
    headers: { Accept: 'application/json, text/plain;q=0.8, */*;q=0.5' },
  }, { integration: 'json-fetch' }).then(async (response) => {
    if (!response.ok) throw Object.assign(new Error('upstream_http_error'), { code: 'upstream_http_error', status: response.status });
    const parsed = parseJsonSafely(await response.text(), 'safe_fetch');
    if (!parsed.ok) throw Object.assign(new Error(parsed.message), { code: parsed.error });
    return parsed.value;
  });
}

function fetchTextViaCurl(upstreamUrl, timeoutMs = RSS_FETCH_TIMEOUT_MS, maxBytes = RSS_FETCH_MAX_BYTES) {
  return coordinatedSafeFetch(upstreamUrl, {
    method: 'GET',
    timeoutMs,
    firstByteTimeoutMs: timeoutMs,
    maxBytes,
    maxRedirects: 3,
    headers: { 'User-Agent': 'pa-nostromo-safe-fetch/1.0', Accept: 'text/html, application/xml, text/xml;q=0.9, */*;q=0.5' },
  }, { integration: 'public-fetch' }).then(async (response) => {
    if (!response.ok) throw Object.assign(new Error('upstream_http_error'), { code: 'upstream_http_error', status: response.status });
    return response.text();
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

let runtimeStorageReadyPromise = null;

async function ensureRuntimeStorageReady() {
  if (!runtimeStorageReadyPromise) {
    runtimeStorageReadyPromise = ensurePrivateRuntimeStorage(RUNTIME_STORAGE);
  }
  try {
    return await runtimeStorageReadyPromise;
  } catch (error) {
    runtimeStorageReadyPromise = null;
    throw error;
  }
}

async function ensureDataDir() {
  await ensureRuntimeStorageReady();
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

function createPayloadTooLargeError(maxBytes) {
  const error = new Error(`Request body exceeds ${maxBytes} bytes.`);
  error.status = 413;
  error.code = 'payload_too_large';
  error.maxBytes = maxBytes;
  return error;
}

function isPayloadTooLargeError(error) {
  return Number(error?.status || 0) === 413 || error?.code === 'payload_too_large';
}

function sendPayloadTooLarge(res, error) {
  return sendJson(res, 413, {
    ok: false,
    error: 'payload_too_large',
    message: String(error?.message || 'Request body is too large.'),
    maxBytes: Number(error?.maxBytes || 0) || undefined,
  });
}

async function readBody(req, options = {}) {
  const maxBytes = Math.max(1, Number(options.maxBytes || REQUEST_BODY_LIMIT_ACTION_BYTES));
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > maxBytes) {
      throw createPayloadTooLargeError(maxBytes);
    }
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function isLoopbackAddress(value) {
  const address = String(value || '').replace(/^::ffff:/, '');
  return address === '127.0.0.1' || address === '::1' || address === 'localhost';
}

function isLocalRequest(req) {
  return isLoopbackAddress(req.socket?.remoteAddress);
}

function applySecurityHeaders(res) {
  if (typeof res?.setHeader !== 'function') return;
  for (const [name, value] of Object.entries(SECURITY_RESPONSE_HEADERS)) {
    res.setHeader(name, value);
  }
}

function sendSecurityError(res, status, error, message) {
  return sendJson(res, status, { ok: false, error, message });
}

function routeRemoteEnabled(route) {
  try {
    return route.remoteAllowed && route.remoteEnabled() === true;
  } catch {
    return false;
  }
}

function authorizeManifestRoute(req, res, route, host, securityContext = {}) {
  const apiTokenConfig = securityContext.apiTokenConfig || API_TOKEN_CONFIG;
  const csrfToken = securityContext.csrfToken || CSRF_TOKEN;
  const remote = !isLocalRequest(req);
  if (remote) {
    if (!route.remoteAllowed || !routeRemoteEnabled(route)) {
      sendSecurityError(res, 403, 'remote_route_disabled', 'This route is not available for remote access.');
      return false;
    }
    if (route.scope !== 'public') {
      if (apiTokenConfig.configurationError || !apiTokenConfig.tokens.length) {
        sendSecurityError(res, 403, 'remote_token_not_configured', 'Remote access requires a configured scoped bearer token.');
        return false;
      }
      const authorization = String(req.headers?.authorization || '');
      if (!authorization) {
        sendSecurityError(res, 401, 'auth_required', 'Remote access requires a scoped bearer token.');
        return false;
      }
      if (!bearerTokenHasScope(authorization, route.scope, apiTokenConfig.tokens)) {
        sendSecurityError(res, 403, 'insufficient_scope', 'The bearer token is not authorized for this route.');
        return false;
      }
    }
  } else if (!route.localAllowed) {
    sendSecurityError(res, 403, 'local_route_disabled', 'This route is not available for local access.');
    return false;
  }

  const contentLength = Number(req.headers?.['content-length']);
  if (route.bodyLimit > 0 && Number.isFinite(contentLength) && contentLength > route.bodyLimit) {
    sendPayloadTooLarge(res, createPayloadTooLargeError(route.bodyLimit));
    return false;
  }

  const csrfRequired = route.sideEffect && (!remote || hasBrowserMetadata(req.headers));
  if (route.id === 'security.bootstrap') {
    const bootstrapIntent = validateBrowserIntent(req, { host, requireCsrf: false });
    if (!bootstrapIntent.ok) {
      sendSecurityError(res, 403, bootstrapIntent.code, 'The bootstrap request must be same-origin.');
      return false;
    }
  } else if (csrfRequired) {
    const browserIntent = validateBrowserIntent(req, { host, csrfToken, requireCsrf: true });
    if (!browserIntent.ok) {
      sendSecurityError(res, 403, browserIntent.code, 'This browser request was not authorized as same-origin.');
      return false;
    }
  }
  return true;
}

function handleApiSecurityBootstrap(req, res) {
  return sendJson(res, 200, { ok: true, csrfToken: CSRF_TOKEN });
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

function isAllowedCameraHost(hostname) {
  if (!hostname) return false;
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  if (!CAMERA_PROXY_ALLOWLIST.length) return false;
  return CAMERA_PROXY_ALLOWLIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function isCameraProxyTargetAllowed(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, code: 'invalid_protocol', message: 'Only http/https camera URLs are allowed.' };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, code: 'credentials_not_allowed', message: 'Camera URL credentials are not allowed.' };
    }
    if (!CAMERA_PROXY_ALLOWLIST.length) {
      return { ok: false, code: 'camera_allowlist_required', message: 'Set CAMERA_PROXY_ALLOWLIST to an explicit public camera hostname.' };
    }
    if (isAllowedCameraHost(parsed.hostname)) return { ok: true, url: parsed };

    return {
      ok: false,
      code: 'host_not_allowed',
      message: 'Camera host is not in CAMERA_PROXY_ALLOWLIST.',
    };
  } catch {
    return { ok: false, code: 'invalid_url', message: 'Invalid camera URL.' };
  }
}

function createClientAbortSignal(req, res) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (req?.aborted) abort();
  else req?.once?.('aborted', abort);
  res?.once?.('close', abort);
  return {
    signal: controller.signal,
    dispose() {
      req?.removeListener?.('aborted', abort);
      res?.removeListener?.('close', abort);
    },
  };
}

function coordinatedSafeFetch(input, requestOptions = {}, coordination = {}) {
  let parsed;
  try {
    parsed = input instanceof URL ? new URL(input.toString()) : new URL(String(input));
  } catch {
    return safeFetch(input, requestOptions);
  }
  const integration = String(coordination.integration || 'outbound').trim() || 'outbound';
  const key = String(coordination.key || `${integration}:${parsed.protocol}//${parsed.host}${parsed.pathname}`);
  return WORK_COORDINATOR.run({
    key,
    integration,
    host: parsed.hostname,
    signal: requestOptions.signal,
    timeoutMs: requestOptions.timeoutMs,
    manual: coordination.manual === true,
    cooldownMs: coordination.cooldownMs || 0,
  }, ({ signal }) => safeFetch(parsed, { ...requestOptions, signal }));
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

async function handleApiUnreadEmail(req, res) {
  const pathname = new URL(req.url || '/api/email-unread', `http://localhost:${PORT}`).pathname;

  if (pathname === '/api/email-unread/delete') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/email-unread/delete.' });
    }
    const rawBody = await readBody(req);
    const parsed = parseJsonSafely(rawBody || '{}', 'email_unread_delete_body');
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      return sendJson(res, 400, {
        ok: false,
        error: parsed.error || 'invalid_json',
        message: parsed.message || 'Delete payload must be a JSON object.',
      });
    }

    try {
      const result = await moveUnreadEmailMessageToTrash(parsed.value);
      return sendJson(res, 200, {
        ok: true,
        accountId: String(parsed.value.accountId || '').trim(),
        mailbox: result.mailbox,
        uid: result.uid,
        trashMailbox: result.trashMailbox,
        message: 'Message moved to Gmail Trash.',
      });
    } catch (error) {
      const status = Number(error?.status || 0);
      return sendJson(res, status >= 400 ? status : 502, {
        ok: false,
        error: status === 404 ? 'account_not_found' : status === 400 ? 'delete_bad_request' : 'delete_failed',
        message: String(error?.message || 'Email delete failed').slice(0, 220),
      });
    }
  }

  if (pathname === '/api/email-unread/spam') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/email-unread/spam.' });
    }
    const rawBody = await readBody(req);
    const parsed = parseJsonSafely(rawBody || '{}', 'email_unread_spam_body');
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      return sendJson(res, 400, {
        ok: false,
        error: parsed.error || 'invalid_json',
        message: parsed.message || 'Spam payload must be a JSON object.',
      });
    }

    try {
      const result = await moveUnreadEmailMessageToSpam(parsed.value);
      return sendJson(res, 200, {
        ok: true,
        accountId: String(parsed.value.accountId || '').trim(),
        mailbox: result.mailbox,
        uid: result.uid,
        spamMailbox: result.spamMailbox,
        message: 'Message moved to Gmail Spam.',
      });
    } catch (error) {
      const status = Number(error?.status || 0);
      return sendJson(res, status >= 400 ? status : 502, {
        ok: false,
        error: status === 404 ? 'account_not_found' : status === 400 ? 'spam_bad_request' : 'spam_failed',
        message: String(error?.message || 'Email spam move failed').slice(0, 220),
      });
    }
  }

  if (pathname === '/api/email-unread/read-batch') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/email-unread/read-batch.' });
    }
    const rawBody = await readBody(req);
    const parsed = parseJsonSafely(rawBody || '{}', 'email_unread_read_batch_body');
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      return sendJson(res, 400, {
        ok: false,
        error: parsed.error || 'invalid_json',
        message: parsed.message || 'Bulk mark read payload must be a JSON object.',
      });
    }

    try {
      const result = await markUnreadEmailMessagesRead(parsed.value);
      return sendJson(res, 200, {
        ok: true,
        accountId: String(parsed.value.accountId || '').trim(),
        updatedCount: Array.isArray(result.items) ? result.items.length : 0,
        items: Array.isArray(result.items) ? result.items : [],
        message: 'Selected messages marked read.',
      });
    } catch (error) {
      const status = Number(error?.status || 0);
      return sendJson(res, status >= 400 ? status : 502, {
        ok: false,
        error: status === 404 ? 'account_not_found' : status === 400 ? 'read_bad_request' : 'read_failed',
        updatedCount: Array.isArray(error?.updatedItems) ? error.updatedItems.length : 0,
        message: String(error?.message || 'Bulk mark read failed').slice(0, 220),
      });
    }
  }

  if (pathname === '/api/email-unread/spam-batch') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/email-unread/spam-batch.' });
    }
    const rawBody = await readBody(req);
    const parsed = parseJsonSafely(rawBody || '{}', 'email_unread_spam_batch_body');
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      return sendJson(res, 400, {
        ok: false,
        error: parsed.error || 'invalid_json',
        message: parsed.message || 'Bulk spam payload must be a JSON object.',
      });
    }

    try {
      const result = await moveUnreadEmailMessagesToSpam(parsed.value);
      return sendJson(res, 200, {
        ok: true,
        accountId: String(parsed.value.accountId || '').trim(),
        movedCount: Array.isArray(result.items) ? result.items.length : 0,
        items: Array.isArray(result.items) ? result.items : [],
        message: 'Selected messages moved to Gmail Spam.',
      });
    } catch (error) {
      const status = Number(error?.status || 0);
      return sendJson(res, status >= 400 ? status : 502, {
        ok: false,
        error: status === 404 ? 'account_not_found' : status === 400 ? 'spam_bad_request' : 'spam_failed',
        movedCount: Array.isArray(error?.movedItems) ? error.movedItems.length : 0,
        message: String(error?.message || 'Bulk spam failed').slice(0, 220),
      });
    }
  }

  if (pathname === '/api/email-unread/read') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/email-unread/read.' });
    }
    const rawBody = await readBody(req);
    const parsed = parseJsonSafely(rawBody || '{}', 'email_unread_read_body');
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      return sendJson(res, 400, {
        ok: false,
        error: parsed.error || 'invalid_json',
        message: parsed.message || 'Mark read payload must be a JSON object.',
      });
    }

    try {
      const result = await markUnreadEmailMessageRead(parsed.value);
      return sendJson(res, 200, {
        ok: true,
        accountId: String(parsed.value.accountId || '').trim(),
        mailbox: result.mailbox,
        uid: result.uid,
        message: 'Message marked read.',
      });
    } catch (error) {
      const status = Number(error?.status || 0);
      return sendJson(res, status >= 400 ? status : 502, {
        ok: false,
        error: status === 404 ? 'account_not_found' : status === 400 ? 'read_bad_request' : 'read_failed',
        message: String(error?.message || 'Email mark read failed').slice(0, 220),
      });
    }
  }

  if (pathname === '/api/email-unread/message') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/email-unread/message.' });
    }
    const rawBody = await readBody(req);
    const parsed = parseJsonSafely(rawBody || '{}', 'email_unread_message_body');
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      return sendJson(res, 400, {
        ok: false,
        error: parsed.error || 'invalid_json',
        message: parsed.message || 'Message payload must be a JSON object.',
      });
    }

    try {
      const result = await fetchUnreadEmailMessageBody(parsed.value);
      return sendJson(res, 200, {
        ok: true,
        accountId: String(parsed.value.accountId || '').trim(),
        mailbox: result.mailbox,
        uid: result.uid,
        bodyText: String(result.bodyText || ''),
      });
    } catch (error) {
      const status = Number(error?.status || 0);
      return sendJson(res, status >= 400 ? status : 502, {
        ok: false,
        error: status === 404 ? 'account_not_found' : status === 400 ? 'message_bad_request' : 'message_fetch_failed',
        message: String(error?.message || 'Full email fetch failed').slice(0, 220),
      });
    }
  }

  if (pathname === '/api/email-unread/delete-batch') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/email-unread/delete-batch.' });
    }
    const rawBody = await readBody(req);
    const parsed = parseJsonSafely(rawBody || '{}', 'email_unread_delete_batch_body');
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      return sendJson(res, 400, {
        ok: false,
        error: parsed.error || 'invalid_json',
        message: parsed.message || 'Bulk delete payload must be a JSON object.',
      });
    }

    try {
      const result = await moveUnreadEmailMessagesToTrash(parsed.value);
      return sendJson(res, 200, {
        ok: true,
        accountId: String(parsed.value.accountId || '').trim(),
        movedCount: Array.isArray(result.items) ? result.items.length : 0,
        items: Array.isArray(result.items) ? result.items : [],
        message: 'Selected messages moved to Gmail Trash.',
      });
    } catch (error) {
      const status = Number(error?.status || 0);
      return sendJson(res, status >= 400 ? status : 502, {
        ok: false,
        error: status === 404 ? 'account_not_found' : status === 400 ? 'delete_bad_request' : 'delete_failed',
        movedCount: Array.isArray(error?.movedItems) ? error.movedItems.length : 0,
        message: String(error?.message || 'Bulk email delete failed').slice(0, 220),
      });
    }
  }

  if (pathname !== '/api/email-unread') {
    return sendJson(res, 404, { ok: false, error: 'not_found', message: 'Unknown unread email route.' });
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/email-unread.' });
  }

  try {
    const payload = await fetchUnreadEmailFeed();
    return sendJson(res, 200, payload);
  } catch (error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || 'Unread email fetch failed').slice(0, 220);
    const accountConfigs = (() => {
      try { return getEmailUnreadAccountConfigs(); } catch { return []; }
    })();
    const configuredCount = accountConfigs.filter((account) => account.username && account.appPassword).length;
    const code = status === 401 || status === 403
      ? 'mail_auth_failed'
      : status === 400
        ? 'mail_bad_request'
        : status === 504
          ? 'mail_timeout'
          : 'mail_fetch_failed';
    return sendJson(res, status >= 400 ? status : 502, {
      ok: false,
      error: code,
      message,
      provider: EMAIL_UNREAD_PROVIDER,
      configured: configuredCount > 0,
      setupRequired: configuredCount === 0,
      label: EMAIL_UNREAD_LABEL,
      account: '',
      accountCount: Array.isArray(error?.accounts) ? error.accounts.length : accountConfigs.length,
      accounts: summarizeUnreadEmailAccounts(Array.isArray(error?.accounts) ? error.accounts : accountConfigs.map((account) => ({
        ...account,
        account: account.username,
        unreadCount: null,
        entries: [],
        recentEntries: [],
        sentEntries: [],
        inboxUrl: account.openUrl,
        sentOpenUrl: account.sentOpenUrl,
        includeSent: !!account.includeSent,
        fetchedAt: '',
        status: (account.username && account.appPassword) ? 'error' : 'setup',
        message: (account.username && account.appPassword) ? message : 'Add username and app password.',
      }))),
      unreadCount: null,
      entries: [],
      inboxUrl: EMAIL_UNREAD_OPEN_URL,
      fetchedAt: '',
    });
  }
}

async function handleApiEbayTraffic(req, res) {
  const pathname = new URL(req.url || '/api/ebay-traffic', `http://localhost:${PORT}`).pathname;

  if (pathname === '/api/ebay-traffic/refresh') {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/ebay-traffic/refresh.' });
    }
    try {
      let source = 'manual';
      const rawBody = await readBody(req, { maxBytes: REQUEST_BODY_LIMIT_ACTION_BYTES });
      if (rawBody) {
        const parsed = parseJsonSafely(rawBody, 'ebay_traffic_refresh_body');
        if (parsed.ok && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value) && parsed.value.source) {
          source = String(parsed.value.source).trim() || source;
        }
      }
      const payload = await getEbayTrafficPayload({ force: false, source });
      return sendJson(res, 200, payload);
    } catch (error) {
      if (isPayloadTooLargeError(error)) return sendPayloadTooLarge(res, error);
      const status = Number(error?.status || 0);
      return sendJson(res, status >= 400 ? status : 500, {
        ok: false,
        error: status === 400 ? 'invalid_ebay_config' : 'ebay_traffic_refresh_failed',
        message: String(error?.message || 'Unable to refresh eBay traffic').slice(0, 240),
      });
    }
  }

  if (pathname !== '/api/ebay-traffic') {
    return sendJson(res, 404, { ok: false, error: 'not_found', message: 'Unknown eBay traffic route.' });
  }
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/ebay-traffic.' });
  }

  try {
    const payload = await getEbayTrafficPayload({ force: false, source: 'auto' });
    return sendJson(res, 200, payload);
  } catch (error) {
    const status = Number(error?.status || 0);
    return sendJson(res, status >= 400 ? status : 500, {
      ok: false,
      error: status === 400 ? 'invalid_ebay_config' : 'ebay_traffic_failed',
      message: String(error?.message || 'Unable to load eBay traffic').slice(0, 240),
    });
  }
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

function parseExpectedStateRevision(req, body) {
  const header = String(req.headers['if-match'] || '').trim();
  const fallback = body?.__writeControl?.expectedRevision;
  const supplied = header || (fallback == null ? '' : String(fallback).trim());
  if (!supplied) return undefined;
  const match = supplied.match(/^(?:W\/)?"?(\d+)"?$/i);
  if (!match) throw new StateStoreError('invalid_revision', 'If-Match must be a non-negative integer revision.');
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision)) throw new StateStoreError('invalid_revision', 'If-Match revision is not safe.');
  return revision;
}

function sendStateStoreError(res, err, { restore = false } = {}) {
  if (err instanceof StateStoreError) {
    if (err.code === 'revision_conflict') {
      return sendJson(res, 409, { ok: false, error: 'state_revision_conflict', message: err.message, currentRevision: err.details?.currentRevision });
    }
    if (err.code === 'state_downgrade_blocked') {
      return sendJson(res, 409, { ok: false, error: err.code, message: err.message, ...err.details });
    }
    if (err.code === 'revision_required') {
      return sendJson(res, 428, { ok: false, error: 'state_revision_required', message: err.message, currentRevision: err.details?.currentRevision });
    }
    if (err.code === 'invalid_revision' || err.code === 'invalid_backup_file') {
      return sendJson(res, 400, { ok: false, error: err.code, message: err.message });
    }
    return sendJson(res, restore ? 400 : 500, { ok: false, error: restore ? 'restore_failed' : err.code, message: err.message });
  }
  if (err instanceof StateSchemaError) {
    const status = err.code === 'unsupported_future_schema' ? 409 : 422;
    return sendJson(res, status, { ok: false, error: err.code, message: err.message });
  }
  return sendJson(res, restore ? 400 : 500, { ok: false, error: restore ? 'restore_failed' : 'state_unavailable', message: String(err?.message || err) });
}

async function handleApiState(req, res) {
  const pathname = new URL(req.url || '/api/state', `http://localhost:${PORT}`).pathname;

  if (pathname === '/api/state/backups') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    try {
      const backups = await STATE_STORE.listBackups();
      return sendJson(res, 200, { ok: true, backups: backups.map(({ mtimeMs, ...rest }) => rest) });
    } catch (err) {
      return sendStateStoreError(res, err);
    }
  }

  if (pathname === '/api/state/restore') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    try {
      const body = await readBody(req, { maxBytes: REQUEST_BODY_LIMIT_ACTION_BYTES });
      const parsed = JSON.parse(body || '{}');
      const result = await STATE_STORE.restore(parsed?.backupFile, {
        expectedRevision: parseExpectedStateRevision(req, parsed),
      });
      return sendJson(res, 200, {
        ok: true,
        restoredFrom: String(parsed?.backupFile || ''),
        preRestoreSnapshot: result.backupFile,
        savedAt: result.integrity.savedAt,
        checksum: result.integrity.checksum,
        revision: result.integrity.revision,
      });
    } catch (err) {
      if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
      return sendStateStoreError(res, err, { restore: true });
    }
  }

  if (pathname !== '/api/state') return sendJson(res, 404, { error: 'not_found' });

  if (req.method === 'GET') {
    try {
      const result = await STATE_STORE.load();
      if (!result.state) {
        if (result.integrity === 'not_found') return sendJson(res, 404, { error: 'state_not_found' });
        return sendJson(res, 409, { ok: false, error: 'state_corrupt_quarantined', message: 'Invalid saved state was quarantined; a new state can be created.' });
      }
      return sendJson(res, 200, result.state);
    } catch (err) {
      return sendStateStoreError(res, err);
    }
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  try {
    const body = await readBody(req, { maxBytes: REQUEST_BODY_LIMIT_STATE_BYTES });
    const parsed = JSON.parse(body || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return sendJson(res, 400, { error: 'invalid_json', message: 'State payload must be an object.' });
    }

    const overrideDowngrade = parsed?.__writeControl?.overrideDowngrade === true;
    const source = String(parsed?.__writeControl?.source || '').trim();
    const explicitLiveOverride = parsed?.__writeControl?.explicitLiveOverride === true;
    const allowOverride = overrideDowngrade && (
      source === 'manual_restore'
      || source === 'manual_import'
      || source === 'conflict_overwrite'
      || (source === 'qa_script' && explicitLiveOverride)
    );
    if (source === 'qa_script' && !explicitLiveOverride) {
      return sendJson(res, 409, {
        ok: false,
        error: 'qa_override_requires_explicit_opt_in',
        message: 'QA/script overwrite is blocked unless __writeControl.explicitLiveOverride=true.',
      });
    }

    const cleanIncoming = deepClone(parsed);
    delete cleanIncoming.__writeControl;
    const result = await STATE_STORE.write(cleanIncoming, {
      expectedRevision: parseExpectedStateRevision(req, parsed),
      source: source || 'api_state_post',
      reason: 'api_state_post',
      validateCurrent: (current, incoming) => {
        if (!current) return;
        const incomingScore = stateRichnessScore(incoming);
        const currentScore = stateRichnessScore(current);
        if (currentScore >= 20 && incomingScore <= Math.floor(currentScore * 0.35) && !allowOverride) {
          throw new StateStoreError('state_downgrade_blocked', 'Incoming state looks much smaller than current shared state; write blocked to prevent accidental data loss.', { currentScore, incomingScore });
        }
      },
    });
    return sendJson(res, 200, {
      ok: true,
      savedAt: result.integrity.savedAt,
      checksum: result.integrity.checksum,
      revision: result.integrity.revision,
      previousStateIntegrity: result.previousStateIntegrity,
      backupFile: result.backupFile,
    });
  } catch (err) {
    if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
    return sendStateStoreError(res, err);
  }
}

async function handleApiRowanSend(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/rowan-send.' });
  }

  let parsed;
  try {
    const body = await readBody(req, { maxBytes: REQUEST_BODY_LIMIT_ACTION_BYTES });
    parsed = JSON.parse(body || '{}');
  } catch (err) {
    if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
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
  const clientRequest = createClientAbortSignal(req, res);
  try {
    const normalizedUrl = targetCheck.url.toString();
    upstream = await WORK_COORDINATOR.run({
      key: `camera:${normalizedUrl}`,
      integration: 'camera',
      host: targetCheck.url.hostname,
      signal: clientRequest.signal,
      timeoutMs: CAMERA_PROXY_TIMEOUT_MS,
    }, ({ signal }) => safeFetch(normalizedUrl, {
      method: 'GET',
      signal,
      timeoutMs: CAMERA_PROXY_TIMEOUT_MS,
      firstByteTimeoutMs: CAMERA_PROXY_TIMEOUT_MS,
      maxBytes: CAMERA_PROXY_MAX_BYTES,
      maxRedirects: 0,
      allowedHosts: CAMERA_PROXY_ALLOWLIST,
      headers: {
        'User-Agent': 'mission-control-lite-camera-proxy/1.0',
        'Accept': 'image/jpeg,image/png,image/webp,image/gif;q=0.9',
      },
    }));
  } catch (err) {
    const status = Number(err?.status || 0) || (err?.code === 'response_too_large' ? 413 : err?.code === 'blocked_address' ? 403 : 502);
    return sendJson(res, status, { ok: false, error: err?.code || 'upstream_fetch_failed', message: 'Camera source could not be fetched safely.' });
  } finally {
    clientRequest.dispose();
  }

  if (!upstream.ok) {
    return sendJson(res, 502, {
      ok: false,
      error: 'upstream_http_error',
      message: `Camera source returned HTTP ${upstream.status}.`,
    });
  }

  const contentType = String(upstream.headers.get('content-type') || 'application/octet-stream');
  if (!/^image\/(?:jpeg|png|webp|gif)$/i.test(contentType.split(';', 1)[0].trim())) {
    return sendJson(res, 415, {
      ok: false,
      error: 'unsupported_media_type',
      message: 'Camera proxy only returns JPEG, PNG, WebP, or GIF images.',
    });
  }
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

  return entryBlocks.slice(0, RSS_FETCH_MAX_ENTRIES).map((block) => {
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

async function fetchFeedXml(url, options = {}) {
  let normalized;
  try {
    normalized = new URL(url);
  } catch {
    throw Object.assign(new Error('rss_invalid_url'), { code: 'invalid_url', status: 400 });
  }
  const key = normalized.toString();
  const cached = rssFeedCache.get(key);
  const cachedFresh = cached && (Date.now() - cached.fetchedAt) < RSS_FETCH_CACHE_TTL_MS;
  if (cachedFresh) return { xml: cached.xml, stale: false, cached: true, fetchedAt: cached.fetchedAt };

  try {
    const response = await WORK_COORDINATOR.run({
      key: `rss:${key}`,
      integration: 'rss',
      host: normalized.hostname,
      signal: options.signal,
      timeoutMs: RSS_FETCH_TIMEOUT_MS,
      manual: options.manual === true,
      cooldownMs: MANUAL_REFRESH_COOLDOWN_MS,
    }, ({ signal }) => safeFetch(normalized, {
      method: 'GET',
      signal,
      timeoutMs: RSS_FETCH_TIMEOUT_MS,
      firstByteTimeoutMs: RSS_FETCH_TIMEOUT_MS,
      maxBytes: RSS_FETCH_MAX_BYTES,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'mission-control-lite-rss/1.0',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
      },
    }));
    if (!response.ok) throw Object.assign(new Error('rss_upstream_http_error'), { code: 'rss_upstream_http_error', status: response.status });
    const xml = await response.text();
    const fetchedAt = Date.now();
    rssFeedCache.set(key, { xml, fetchedAt });
    return { xml, stale: false, cached: false, fetchedAt };
  } catch (err) {
    if (cached) return { xml: cached.xml, stale: true, cached: true, fetchedAt: cached.fetchedAt, errorCode: err?.code || 'rss_refresh_failed' };
    throw err;
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

  const reqUrl = new URL(req.url || '/api/crypto/coins/list', `http://localhost:${PORT}`);
  const route = CRYPTO_PROXY_TARGETS.find((entry) => reqUrl.pathname === entry.prefix);
  if (!route) {
    return sendJson(res, 404, { ok: false, error: 'unknown_crypto_route', message: 'Unsupported crypto proxy route.' });
  }

  const upstreamUrl = new URL(route.upstream);
  reqUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.set(key, value));

  const clientRequest = createClientAbortSignal(req, res);
  try {
    const upstream = await WORK_COORDINATOR.run({
      key: `crypto:${upstreamUrl.toString()}`,
      integration: 'crypto',
      host: upstreamUrl.hostname,
      signal: clientRequest.signal,
      timeoutMs: CRYPTO_PROXY_TIMEOUT_MS,
    }, ({ signal }) => safeFetch(upstreamUrl, {
      method: 'GET',
      signal,
      timeoutMs: CRYPTO_PROXY_TIMEOUT_MS,
      firstByteTimeoutMs: CRYPTO_PROXY_TIMEOUT_MS,
      maxBytes: 2 * 1024 * 1024,
      maxRedirects: 2,
      allowedHosts: [new URL(route.upstream).hostname],
      headers: {
        'User-Agent': 'mission-control-lite-crypto-proxy/1.0',
        'Accept': 'application/json, text/plain;q=0.8, */*;q=0.5',
      },
    }));

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
    return sendJson(res, 502, { ok: false, error: parsed.error, message: 'Crypto upstream returned invalid JSON.' });
  } catch (err) {
    return sendJson(res, Number(err?.status || 0) || 502, {
      ok: false,
      error: err?.code || 'crypto_proxy_fetch_failed',
      message: 'Crypto upstream could not be fetched safely.',
    });
  } finally {
    clientRequest.dispose();
  }
}

function execFileSafe(command, args, options = {}) {
  return new Promise((resolve) => {
    const { signal, ...execOptions } = options;
    let killTimer = null;
    let child;
    const terminate = () => {
      child?.kill('SIGTERM');
      killTimer = setTimeout(() => child?.kill('SIGKILL'), 2_000);
    };
    child = execFile(command, args, execOptions, (error, stdout, stderr) => {
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener?.('abort', terminate);
      resolve({
        ok: !error,
        error,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      });
    });
    if (signal?.aborted) terminate();
    else signal?.addEventListener?.('abort', terminate, { once: true });
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

async function runBackendSpeedTest(signal) {
  const candidates = [
    { tool: 'speedtest', cmd: 'speedtest', args: ['--accept-license', '--accept-gdpr', '-f', 'json'] },
    { tool: 'speedtest-cli', cmd: 'speedtest-cli', args: ['--json'] },
    { tool: 'fast', cmd: 'fast', args: ['--upload', '--json'] },
  ];

  const checked = [];
  for (const candidate of candidates) {
    if (signal?.aborted) throw Object.assign(new Error('speed_test_cancelled'), { code: 'work_cancelled' });
    checked.push(candidate.tool);
    const result = await execFileSafe(candidate.cmd, candidate.args, {
      timeout: SPEED_TEST_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      signal,
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

  const clientRequest = createClientAbortSignal(req, res);
  try {
    const run = await WORK_COORDINATOR.run({
      key: 'speed-test',
      integration: 'speed-test',
      host: 'local',
      signal: clientRequest.signal,
      timeoutMs: SPEED_TEST_TIMEOUT_MS,
      manual: true,
      cooldownMs: MANUAL_REFRESH_COOLDOWN_MS,
    }, ({ signal }) => runBackendSpeedTest(signal));
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
  } finally {
    clientRequest.dispose();
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

  let parsed;
  try {
    parsed = JSON.parse(await readBody(req, { maxBytes: REQUEST_BODY_LIMIT_RSS_BYTES }));
  } catch (err) {
    if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
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
  const feedStatus = [];
  const clientRequest = createClientAbortSignal(req, res);

  try {
    for (const url of urls) {
      try {
        const feed = await fetchFeedXml(url, { signal: clientRequest.signal, manual: true });
        const parsedItems = parseFeedXml(feed.xml, url);
        items.push(...parsedItems);
        feedStatus.push({ feedUrl: url, stale: feed.stale, cached: feed.cached, fetchedAt: new Date(feed.fetchedAt).toISOString() });
        if (feed.stale) errors.push({ feedUrl: url, error: feed.errorCode || 'rss_refresh_failed', message: 'Refresh failed; showing the last cached feed.', stale: true });
      } catch (err) {
        errors.push({ feedUrl: url, error: err?.code || 'rss_fetch_failed', message: 'Feed could not be fetched safely.' });
      }
    }
  } finally {
    clientRequest.dispose();
  }

  return sendJson(res, 200, { ok: true, items: items.slice(0, RSS_FETCH_MAX_FEEDS * RSS_FETCH_MAX_ENTRIES), feeds: feedStatus, errors });
}

function decodeStaticPath(urlPath) {
  const rawPath = String(urlPath || '/').split(/[?#]/, 1)[0] || '/';
  let decoded = rawPath;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }

  const normalized = decoded.normalize('NFKC').replace(/\\/g, '/');
  if (!normalized.startsWith('/') || normalized.includes('\0')) return null;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => (
    segment === '.'
    || segment === '..'
    || segment.startsWith('.')
    || segment.includes(':')
    || path.isAbsolute(segment)
    || path.win32.isAbsolute(segment)
  ))) return null;
  return segments;
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function safePathFromUrl(urlPath) {
  const segments = decodeStaticPath(urlPath);
  if (!segments) return null;
  const candidate = path.resolve(PUBLIC_ROOT, ...(segments.length ? segments : ['index.html']));
  return isPathInside(PUBLIC_ROOT, candidate) ? candidate : null;
}

async function resolveStaticFile(urlPath) {
  const candidate = safePathFromUrl(urlPath);
  if (!candidate) return null;
  try {
    const [publicRootReal, targetReal] = await Promise.all([
      fsp.realpath(PUBLIC_ROOT),
      fsp.realpath(candidate),
    ]);
    if (!isPathInside(publicRootReal, targetReal)) return null;
    const stat = await fsp.stat(targetReal);
    return stat.isFile() ? { path: targetReal, stat } : null;
  } catch {
    return null;
  }
}

function staticHeaders(filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const isHtml = ext === '.html';
  const etag = `W/\"${stat.size}-${Math.floor(stat.mtimeMs)}\"`;
  return {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: etag,
    'Cache-Control': isHtml ? 'no-store' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  };
}

function staticNotModified(req, headers, stat) {
  if (String(req.headers['if-none-match'] || '') === headers.ETag) return true;
  const since = Date.parse(String(req.headers['if-modified-since'] || ''));
  return Number.isFinite(since) && Math.floor(stat.mtimeMs / 1000) <= Math.floor(since / 1000);
}

async function handleStatic(req, res) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end();
  }

  const file = await resolveStaticFile(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end('Not found');
  }

  const headers = staticHeaders(file.path, file.stat);
  if (staticNotModified(req, headers, file.stat)) {
    res.writeHead(304, headers);
    return res.end();
  }
  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    return res.end();
  }

  res.writeHead(200, headers);
  try {
    await pipeline(fs.createReadStream(file.path), res);
  } catch {
    if (!res.writableEnded) res.destroy();
  }
}

async function dispatchApiRoute(req, res, pathname) {
  if (pathname.startsWith('/api/state')) return handleApiState(req, res);
  if (pathname === '/api/rowan-send') return handleApiRowanSend(req, res);
  if (pathname === '/api/camera-snapshot') return handleApiCameraSnapshot(req, res);
  if (pathname === '/api/rss/fetch') return handleApiRssFetch(req, res);
  if (pathname === '/api/gas-prices') return handleApiGasPrices(req, res);
  if (pathname.startsWith('/api/crypto/')) return handleApiCryptoProxy(req, res);
  if (pathname === '/api/system-resources') return handleApiSystemResources(req, res);
  if (pathname === '/api/speed-test') return handleApiSpeedTest(req, res);
  if (pathname === '/api/home-devices/ping') return handleApiHomeDevicePing(req, res);
  if (pathname === '/api/home-devices/wake') return handleApiHomeDeviceWake(req, res);
  if (pathname.startsWith('/api/email-unread')) return handleApiUnreadEmail(req, res);
  if (pathname.startsWith('/api/ebay-traffic')) return handleApiEbayTraffic(req, res);
  if (pathname.startsWith('/api/diary-index')) return handleApiDiaryIndex(req, res);
  if (pathname.startsWith('/api/facebook-followers')) return handleApiFacebookFollowers(req, res);
  if (pathname.startsWith('/api/facebook-group-members')) return handleApiFacebookGroupMembers(req, res);
  if (pathname.startsWith('/api/facebook-content')) return handleApiFacebookContent(req, res);
  if (pathname.startsWith('/api/instagram-content')) return handleApiInstagramContent(req, res);
  if (pathname.startsWith('/api/instagram-followers')) return handleApiInstagramFollowers(req, res);
  if (pathname.startsWith('/api/tiktok-followers')) return handleApiTikTokFollowers(req, res);
  if (pathname.startsWith('/api/youtube-subscribers')) return handleApiYoutubeSubscribers(req, res);
  return sendJson(res, 404, { ok: false, error: 'not_found' });
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  try {
    const hostResult = validateHostHeader(req.headers?.host, HOST_POLICY);
    if (!hostResult.ok) return sendSecurityError(res, 400, hostResult.code, 'The Host header is missing, malformed, or not allowed.');

    const requestUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;
    if (!pathname.startsWith('/api/')) return handleStatic(req, res);

    const resolved = resolveRoute(ROUTE_MANIFEST, pathname, req.method || 'GET');
    if (!resolved.route) {
      if (resolved.methods.length) {
        res.writeHead(405, { Allow: resolved.methods.join(', '), 'Cache-Control': 'no-store' });
        return res.end();
      }
      return sendJson(res, 404, { ok: false, error: 'not_found' });
    }
    if (!authorizeManifestRoute(req, res, resolved.route, hostResult.host)) return;
    if (resolved.route.id === 'security.bootstrap') return handleApiSecurityBootstrap(req, res);
    return dispatchApiRoute(req, res, pathname);
  } catch (err) {
    if (res.writableEnded) return;
    if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
    return sendJson(res, 500, { ok: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

if (require.main === module) {
  let shutdownRequested = false;
  const shutdown = () => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    WORK_COORDINATOR.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  void (async () => {
    const migrationResults = await ensureRuntimeStorageReady();
    for (const result of migrationResults) {
      if (result.status === 'migrated') console.log(`Private ${result.label} storage migration verified; legacy files were preserved.`);
    }
    if (!DISABLE_BACKGROUND_SERVICES) {
      initFacebookFollowersService().catch((err) => {
        console.error('Facebook followers service init failed:', err?.message || err);
      });
      initFacebookGroupMembersService().catch((err) => {
        console.error('Facebook group members service init failed:', err?.message || err);
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
    }
    server.listen(PORT, HOST, () => {
      console.log(`Mission Control running on http://${HOST}:${PORT}`);
      console.log(`Private runtime storage: configured (retain latest ${BACKUP_RETENTION} state backups)`);
      console.log(`State API: enabled (${STATE_API_ALLOW_REMOTE ? 'remote token required' : 'local only'})`);
      console.log(`Voice-to-Rowan relay: ${ROWAN_RELAY_URL ? 'configured' : 'not configured'} (${ROWAN_ALLOW_REMOTE ? 'remote enabled' : 'local only'})`);
      console.log(`Camera snapshot proxy: enabled (${CAMERA_PROXY_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; allowlist entries: ${CAMERA_PROXY_ALLOWLIST.length})`);
      console.log(`RSS fetch API: enabled (${RSS_FETCH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; max feeds/request: ${RSS_FETCH_MAX_FEEDS})`);
      console.log(`Gas price proxy API: enabled (${GAS_PROXY_ALLOW_REMOTE ? 'remote enabled' : 'local only'})`);
      console.log(`Speed test API: enabled (${SPEED_TEST_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; timeout ${SPEED_TEST_TIMEOUT_MS}ms)`);
      console.log(`Unread email pod API: enabled (${EMAIL_UNREAD_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; provider ${EMAIL_UNREAD_PROVIDER}; accounts ${(() => { try { return getEmailUnreadAccountConfigs().length; } catch { return 0; } })()})`);
      console.log(`eBay traffic pod API: enabled (${EBAY_TRAFFIC_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; env ${EBAY_TRAFFIC_ENVIRONMENT}; stores ${(() => { try { return getEbayTrafficStoreConfigs().length; } catch { return 0; } })()}; range ${EBAY_TRAFFIC_RANGE_DAYS}d)`);
      console.log(`Facebook followers pod API: enabled (${META_GRAPH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; poll ${META_GRAPH_POLL_INTERVAL_MS}ms)`);
      console.log(`Facebook group members API: enabled (${META_GRAPH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; poll ${FACEBOOK_GROUP_POLL_INTERVAL_MS}ms; url ${FACEBOOK_GROUP_URL})`);
      console.log(`Instagram followers pod API: enabled (${META_GRAPH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; poll ${INSTAGRAM_POLL_INTERVAL_MS}ms; provider ${INSTAGRAM_PROVIDER})`);
      console.log(`TikTok followers pod API: enabled (${META_GRAPH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; poll ${TIKTOK_POLL_INTERVAL_MS}ms; provider public_scrape_estimate)`);
      console.log(`YouTube subscribers pod API: enabled (${META_GRAPH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; poll ${YOUTUBE_POLL_INTERVAL_MS}ms; provider public_scrape_estimate)`);
    });
  })().catch((err) => {
    console.error('Private runtime storage setup failed; server did not start:', err?.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  server,
  HOST,
  PUBLIC_ROOT,
  ROUTE_MANIFEST,
  DATA_DIR,
  LOG_DIR,
  STATE_PATH,
  BACKUPS_DIR,
  parseJsonSafely,
  fetchJsonViaCurl,
  safePathFromUrl,
  resolveStaticFile,
  readBody,
  isPayloadTooLargeError,
  authorizeManifestRoute,
  buildPingArgs,
  classifyFacebookFollowerStaleLevel,
  calculateFollowerRollingDelta,
  ensureFacebookFollowersShape,
  facebookFollowerResponsePayload,
  extractFacebookPublicFollowerEstimate,
  extractInstagramPublicFollowerEstimate,
  extractTikTokPublicFollowerEstimate,
  extractYouTubePublicSubscriberEstimate,
  parseCompactCount,
  extractUnreadEmailAtomFeed,
  emailUnreadSetupPayload,
};
