const STORAGE_KEY = 'mission-control-lite-v1';
const LOCAL_ZIP = '44224';
const LOCAL_TZ = 'America/New_York';
const RSS_DEFAULT_REFRESH_MIN = 30;
const CRYPTO_DIR_CACHE_KEY = 'mission-control-crypto-directory-v1';
const CRYPTO_DIR_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CRYPTO_WATCH_CACHE_KEY = 'mission-control-crypto-watch-cache-v1';
const CRYPTO_MANUAL_COOLDOWN_MS = 45 * 1000;
const CRYPTO_FAILURE_BACKOFF_BASE_MS = 20 * 1000;
const CRYPTO_FAILURE_BACKOFF_MAX_MS = 3 * 60 * 1000;
const SHARED_STATE_API = '/api/state';
const SHARED_STATE_BACKUPS_API = '/api/state/backups';
const SHARED_STATE_RESTORE_API = '/api/state/restore';
const SHARED_STATE_SYNC_EVENT_KEY = 'mission-control-shared-sync-event-v1';
const SHARED_STATE_SYNC_CHANNEL = 'mission-control-shared-sync-channel-v1';
const UNDO_WINDOW_MS = 12000;
const SHORTCUT_GLOBAL_PROJECT_ID = '__global__';
const CRYPTO_PROXY_API = '/api/crypto';
const HOME_DEVICES_PING_API = '/api/home-devices/ping';
const HOME_DEVICES_WAKE_API = '/api/home-devices/wake';
const UNREAD_EMAIL_API = '/api/email-unread';
const EBAY_TRAFFIC_API = '/api/ebay-traffic';
const EBAY_TRAFFIC_REFRESH_API = '/api/ebay-traffic/refresh';
const EBAY_TRAFFIC_POLL_INTERVAL_MS = 30 * 60 * 1000;
const UNREAD_EMAIL_MESSAGE_API = '/api/email-unread/message';
const UNREAD_EMAIL_MARK_READ_API = '/api/email-unread/read';
const UNREAD_EMAIL_MARK_READ_BATCH_API = '/api/email-unread/read-batch';
const UNREAD_EMAIL_SPAM_API = '/api/email-unread/spam';
const UNREAD_EMAIL_SPAM_BATCH_API = '/api/email-unread/spam-batch';
const UNREAD_EMAIL_DELETE_API = '/api/email-unread/delete';
const UNREAD_EMAIL_DELETE_BATCH_API = '/api/email-unread/delete-batch';
const EBAY_TRAFFIC_ACTIVE_STORE_KEY = 'mission-control-ebay-traffic-active-store-v1';
const EBAY_TRAFFIC_ACTIVE_INSIGHT_KEY = 'mission-control-ebay-traffic-active-insight-v1';
const EBAY_TRAFFIC_ACTIVE_LISTINGS_KEY = 'mission-control-ebay-traffic-active-listings-v1';
const EBAY_TRAFFIC_PROMO_LIFT_WINDOW_KEY = 'mission-control-ebay-traffic-promo-lift-window-v1';
const UNREAD_EMAIL_ACTIVE_ACCOUNT_KEY = 'mission-control-unread-email-active-account-v1';
const debugCounters = window.MissionControlModules?.debug || null;

const CSRF_BOOTSTRAP_API = '/api/security/bootstrap';
const APP_INFO_API = '/api/app-info';
const CSRF_HEADER_NAME = 'X-PA-Nostromo-CSRF';
let csrfTokenPromise = null;

function fetchTargetUrl(input){
  if (input instanceof Request) return new URL(input.url, window.location.href);
  return new URL(String(input || ''), window.location.href);
}

async function getCsrfToken(){
  if (!csrfTokenPromise) {
    csrfTokenPromise = window.fetch(CSRF_BOOTSTRAP_API, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to initialize same-origin request protection.');
        const payload = await response.json();
        const token = String(payload?.csrfToken || '').trim();
        if (!token) throw new Error('Same-origin request protection did not return a token.');
        return token;
      })
      .catch((error) => {
        csrfTokenPromise = null;
        throw error;
      });
  }
  return csrfTokenPromise;
}

function installSameOriginCsrfFetch(){
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const target = fetchTargetUrl(input);
    const protectsMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
      && target.origin === window.location.origin
      && target.pathname.startsWith('/api/')
      && target.pathname !== CSRF_BOOTSTRAP_API;
    if (!protectsMutation) return nativeFetch(input, init);

    const token = await getCsrfToken();
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set(CSRF_HEADER_NAME, token);
    return nativeFetch(input, { ...init, headers });
  };
}

installSameOriginCsrfFetch();
window.NostromoSafeUI.installActiveUrlPolicy();

const themeFeature = window.MissionControlModules?.theme;
if (!themeFeature) throw new Error('Theme feature failed to load.');
const normalizeThemePreference = themeFeature.normalizeThemePreference;
const projectsFeature = window.MissionControlModules?.projects;
if (!projectsFeature) throw new Error('Projects feature failed to load.');
const notesFeature = window.MissionControlModules?.notes;
if (!notesFeature) throw new Error('Notes feature failed to load.');
const remindersFeature = window.MissionControlModules?.reminders;
if (!remindersFeature) throw new Error('Reminders feature failed to load.');
const tasksFeature = window.MissionControlModules?.tasks;
if (!tasksFeature) throw new Error('Tasks feature failed to load.');
const shortcutsFeature = window.MissionControlModules?.shortcuts;
if (!shortcutsFeature) throw new Error('Shortcuts feature failed to load.');
const unreadEmailStateFeature = window.MissionControlModules?.unreadEmailState;
if (!unreadEmailStateFeature) throw new Error('Unread email state feature failed to load.');
const ebayTrafficStateFeature = window.MissionControlModules?.ebayTrafficState;
if (!ebayTrafficStateFeature) throw new Error('eBay Traffic state feature failed to load.');
const socialFollowersAnalyticsFeature = window.MissionControlModules?.socialFollowersAnalytics;
if (!socialFollowersAnalyticsFeature) throw new Error('Social Followers analytics feature failed to load.');
const nbaScoreStateFeature = window.MissionControlModules?.nbaScoreState;
if (!nbaScoreStateFeature) throw new Error('NBA Scores state feature failed to load.');
const gasPricesStateFeature = window.MissionControlModules?.gasPricesState;
if (!gasPricesStateFeature) throw new Error('Gas Prices state feature failed to load.');
const everydayCalculatorStateFeature = window.MissionControlModules?.everydayCalculatorState;
if (!everydayCalculatorStateFeature) throw new Error('Everyday Calculator state feature failed to load.');
const systemMonitorStateFeature = window.MissionControlModules?.systemMonitorState;
if (!systemMonitorStateFeature) throw new Error('System Monitor state feature failed to load.');
const speedTestStateFeature = window.MissionControlModules?.speedTestState;
if (!speedTestStateFeature) throw new Error('Speed Test state feature failed to load.');
const homeDeviceStateFeature = window.MissionControlModules?.homeDeviceState;
if (!homeDeviceStateFeature) throw new Error('Home Device state feature failed to load.');
const cameraFeedStateFeature = window.MissionControlModules?.cameraFeedState;
if (!cameraFeedStateFeature) throw new Error('Camera Feed state feature failed to load.');
const normalizeTaskColumn = tasksFeature.normalizeTaskColumn;

const DEFAULT_SETTINGS = {
  theme: 'dark',
  weatherIntervalMin: 15,
  defaultTaskColumn: 'inbox',
};

const MERGED_SOCIAL_FOLLOWERS_POD_ID = 'social-followers';
const LEGACY_SOCIAL_FOLLOWERS_POD_IDS = [
  'facebook-followers',
  'instagram-followers',
  'tiktok-followers',
  'youtube-subscribers',
];
const MERGED_VOICE_POD_ID = 'voice-desk';
const LEGACY_VOICE_POD_IDS = [
  'voice-note',
  'voice-to-rowan',
];

const DEFAULT_UTILITY_LAYOUT_ROWS = [
  ['shortcuts'],
  ['date-time', 'calendar', 'gas-prices'],
  ['nba-scores', 'crypto-tracker', MERGED_SOCIAL_FOLLOWERS_POD_ID, 'ebay-traffic', 'speed-test', 'rss-feed', 'unread-email', 'everyday-calculator', 'system-resource-monitor', 'home-device-control'],
  ['camera-feed', 'live-streams'],
  [MERGED_VOICE_POD_ID, 'music-player'],
];

function createDefaultUtilityLayoutState(){
  return {
    utilityRows: DEFAULT_UTILITY_LAYOUT_ROWS.map((row) => [...row]),
    visibility: Object.fromEntries(DEFAULT_UTILITY_LAYOUT_ROWS.flat().map((podId) => [podId, true])),
  };
}

function normalizeUtilityLayoutState(layoutInput, knownPodIds = []){
  const defaults = createDefaultUtilityLayoutState();
  const fallbackRows = defaults.utilityRows;
  const fallbackIds = fallbackRows.flat();
  const allKnown = [...new Set([
    ...fallbackIds,
    ...LEGACY_SOCIAL_FOLLOWERS_POD_IDS,
    ...LEGACY_VOICE_POD_IDS,
    ...knownPodIds.map((v) => String(v || '').trim()).filter(Boolean),
  ])];
  const allowed = new Set(allKnown);
  const incomingRows = Array.isArray(layoutInput?.utilityRows) ? layoutInput.utilityRows : fallbackRows;
  const seen = new Set();
  const rows = incomingRows
    .map((row) => Array.isArray(row) ? row.map((v) => String(v || '').trim()).filter(Boolean) : [])
    .map((row) => row.filter((podId) => {
      if (!allowed.has(podId)) return false;
      if (seen.has(podId)) return false;
      seen.add(podId);
      return true;
    }))
    .filter((row) => row.length > 0);

  const missing = allKnown.filter((podId) => !seen.has(podId));
  if (!rows.length) rows.push([...fallbackRows[0]]);
  if (missing.length) {
    const pending = new Set(missing);
    for (const baseRow of fallbackRows) {
      const targets = baseRow.filter((podId) => pending.has(podId));
      if (!targets.length) continue;
      const rowIndex = rows.findIndex((row) => row.some((id) => baseRow.includes(id)));
      if (rowIndex >= 0) {
        rows[rowIndex].push(...targets);
      } else {
        rows.push([...targets]);
      }
      for (const podId of targets) pending.delete(podId);
    }
    if (pending.size) rows.push([...pending]);
  }

  // Migration: early gas-prices builds could append this pod as a lone tail row.
  // Move it into row 2 (with date-time/calendar) unless user already placed it there.
  const gasPodId = 'gas-prices';
  const gasRowIndex = rows.findIndex((row) => row.includes(gasPodId));
  const dateRowIndex = rows.findIndex((row) => row.includes('date-time') || row.includes('calendar'));
  if (gasRowIndex >= 0 && dateRowIndex >= 0 && gasRowIndex !== dateRowIndex && !rows[dateRowIndex].includes(gasPodId)) {
    rows[gasRowIndex] = rows[gasRowIndex].filter((podId) => podId !== gasPodId);
    rows[dateRowIndex].push(gasPodId);
  }

  const mergedSocialIndex = rows.findIndex((row) => row.includes(MERGED_SOCIAL_FOLLOWERS_POD_ID));
  let socialInsertRow = mergedSocialIndex;
  let socialInsertIndex = mergedSocialIndex >= 0 ? rows[mergedSocialIndex].indexOf(MERGED_SOCIAL_FOLLOWERS_POD_ID) : -1;
  if (socialInsertRow < 0) {
    rows.some((row, rowIndex) => row.some((podId, podIndex) => {
      if (!LEGACY_SOCIAL_FOLLOWERS_POD_IDS.includes(podId)) return false;
      socialInsertRow = rowIndex;
      socialInsertIndex = podIndex;
      return true;
    }));
  }

  rows.forEach((row, rowIndex) => {
    rows[rowIndex] = row.filter((podId) => podId !== MERGED_SOCIAL_FOLLOWERS_POD_ID && !LEGACY_SOCIAL_FOLLOWERS_POD_IDS.includes(podId));
  });

  if (socialInsertRow < 0) {
    socialInsertRow = fallbackRows.findIndex((row) => row.includes(MERGED_SOCIAL_FOLLOWERS_POD_ID));
    socialInsertIndex = 0;
  }
  if (socialInsertRow < 0) socialInsertRow = Math.max(0, rows.length - 1);
  while (rows.length <= socialInsertRow) rows.push([]);
  const socialTargetRow = rows[socialInsertRow];
  const socialTargetIndex = Number.isInteger(socialInsertIndex) ? Math.max(0, Math.min(socialInsertIndex, socialTargetRow.length)) : socialTargetRow.length;
  socialTargetRow.splice(socialTargetIndex, 0, MERGED_SOCIAL_FOLLOWERS_POD_ID);

  const mergedVoiceIndex = rows.findIndex((row) => row.includes(MERGED_VOICE_POD_ID));
  let voiceInsertRow = mergedVoiceIndex;
  let voiceInsertIndex = mergedVoiceIndex >= 0 ? rows[mergedVoiceIndex].indexOf(MERGED_VOICE_POD_ID) : -1;
  if (voiceInsertRow < 0) {
    rows.some((row, rowIndex) => row.some((podId, podIndex) => {
      if (!LEGACY_VOICE_POD_IDS.includes(podId)) return false;
      voiceInsertRow = rowIndex;
      voiceInsertIndex = podIndex;
      return true;
    }));
  }

  rows.forEach((row, rowIndex) => {
    rows[rowIndex] = row.filter((podId) => podId !== MERGED_VOICE_POD_ID && !LEGACY_VOICE_POD_IDS.includes(podId));
  });

  if (voiceInsertRow < 0) {
    voiceInsertRow = fallbackRows.findIndex((row) => row.includes(MERGED_VOICE_POD_ID));
    voiceInsertIndex = 0;
  }
  if (voiceInsertRow < 0) voiceInsertRow = Math.max(0, rows.length - 1);
  while (rows.length <= voiceInsertRow) rows.push([]);
  const voiceTargetRow = rows[voiceInsertRow];
  const voiceTargetIndex = Number.isInteger(voiceInsertIndex) ? Math.max(0, Math.min(voiceInsertIndex, voiceTargetRow.length)) : voiceTargetRow.length;
  voiceTargetRow.splice(voiceTargetIndex, 0, MERGED_VOICE_POD_ID);

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (!rows[i].length) rows.splice(i, 1);
  }

  const visibilityInput = (layoutInput && typeof layoutInput.visibility === 'object' && layoutInput.visibility)
    ? layoutInput.visibility
    : {};
  const visibility = {};
  const rowIds = rows.flat();
  for (const podId of rowIds) {
    if (podId === MERGED_SOCIAL_FOLLOWERS_POD_ID) {
      const legacyVisible = LEGACY_SOCIAL_FOLLOWERS_POD_IDS.some((legacyId) => visibilityInput[legacyId] !== false);
      visibility[podId] = visibilityInput[podId] !== false && legacyVisible;
    } else if (podId === MERGED_VOICE_POD_ID) {
      const legacyVisible = LEGACY_VOICE_POD_IDS.some((legacyId) => visibilityInput[legacyId] !== false);
      visibility[podId] = visibilityInput[podId] !== false && legacyVisible;
    } else {
      visibility[podId] = visibilityInput[podId] !== false;
    }
  }

  return { utilityRows: rows, visibility };
}

function normalizeGasPricesState(input){
  return gasPricesStateFeature.normalizeState(input, LOCAL_ZIP);
}

function normalizeEverydayCalculatorState(input){
  return everydayCalculatorStateFeature.normalizeState(input);
}

function normalizeSystemMonitorState(input){
  return systemMonitorStateFeature.normalizeState(input);
}

function normalizeSpeedTestState(input){
  return speedTestStateFeature.normalizeState(input, { createId: id, getNow: now });
}


function normalizeHomeDeviceControlState(input){
  return homeDeviceStateFeature.normalizeState(input);
}

const NBA_VIEW_MODES = nbaScoreStateFeature.viewModes;
const NBA_TEAM_OPTIONS = nbaScoreStateFeature.teamOptions;

function normalizeNbaState(input){
  return nbaScoreStateFeature.normalizeState(input);
}

function normalizeUnreadEmailBlockedSenders(input){
  return unreadEmailStateFeature.normalizeBlockedSenders(input);
}

const REQUIRED_PROJECTS = [
  { name: 'Blast From The Ads', summary: 'Vintage ad content pipeline to social + WordPress', status: 'active', appLink: '', repoLink: '' },
  { name: 'Radio Map (Leaflet)', summary: 'Interactive radio station map web app', status: 'active', appLink: 'http://localhost:3399', repoLink: '' },
  { name: 'Mission Control Dashboard', summary: 'Project ops dashboard for all active workstreams', status: 'active', appLink: '', repoLink: '' },
  { name: 'PDF Ads Extractor (v2)', summary: 'Run pdf-analyzer-v2 on large PDFs to extract ad creatives for social channels', status: 'active', appLink: '', repoLink: '' },
  { name: 'Retro Flash Games Portal', summary: 'Build a playable Flash games platform (emulation-based) with accounts, XP, levels, achievements, and community progression—mini Kongregate 2000 vibe', status: 'planning', appLink: '', repoLink: '' },
  { name: 'Therian/Mist-Style MMO Project', summary: 'Design an MMO inspired by WoW systems with Therian Saga + Mist Legacy style', status: 'planning', appLink: '', repoLink: '' },
  { name: 'Resume + Job Hunt Automation', summary: 'Redo resume and build automation for job discovery, tracking, and applications', status: 'planning', appLink: '', repoLink: '' },
];

const seed = {
  projects: REQUIRED_PROJECTS.map((p) => ({ id: id(), ...p, lastUpdated: now() })),
  tasks: [],
  notes: [],
  ideas: [],
  reminders: [],
  settings: { ...DEFAULT_SETTINGS },
  nba: normalizeNbaState(),
  unreadEmailBlockedSenders: {},
  cryptoWatchlist: ['bitcoin', 'ethereum'],
  cryptoHoldings: {},
  musicPlayer: {
    sourceType: 'stream', // stream | local
    mode: 'stream', // stream | ambient
    currentStreamUrl: '',
    streamMode: 'unknown', // youtube | direct | embed | unknown
    favoriteStreamUrl: '',
    currentTrackName: '',
    volume: 0.7,
    isPlaying: false,
    ambientPresetId: 'rain',
    ambientSourceIndex: 0,
    sleepTimerMin: 0,
  },
  cameraFeed: {
    sourceUrl: '',
    mode: 'stream', // stream | snapshot | local
    refreshIntervalSec: 5,
    active: false,
    status: 'idle', // idle | loading | live | error
    lastError: '',
    useProxy: true,
    deviceId: '',
    viewportWidth: 640,
    viewportHeight: 360,
  },
  liveStreams: {
    sourceType: 'youtube', // youtube | twitch | kick | vaughn | rumble | xlive | facebook | generic | local
    inputs: {
      youtube: '',
      twitch: '',
      kick: '',
      vaughn: '',
      rumble: '',
      xlive: '',
      facebook: '',
      generic: '',
      local: '',
    },
    active: false,
    status: 'idle', // idle | loading | live | error
    lastError: '',
    embedUrl: '',
    externalUrl: '',
    renderMode: 'iframe', // iframe | video
    presets: [],
  },
  rss: {
    feeds: [],
    items: [],
    readItemIds: [],
    showRead: false,
    refreshIntervalMin: RSS_DEFAULT_REFRESH_MIN,
    lastUpdatedAt: '',
    lastError: '',
  },
  facebookFollowers: {
    followersCount: null,
    fanCount: null,
    delta: null,
    rollingDelta1h: null,
    rollingDelta24h: null,
    pageName: '',
    pageId: '',
    fetchedAt: '',
    source: '',
    staleLevel: 'fresh',
    ageMs: null,
    lastError: '',
    loading: false,
  },
  facebookGroupMembers: {
    membersCount: null,
    delta: null,
    rollingDelta1h: null,
    rollingDelta24h: null,
    groupName: 'Blast From the Ads Community',
    groupUrl: 'https://www.facebook.com/groups/blastfromtheads',
    fetchedAt: '',
    source: '',
    staleLevel: 'fresh',
    ageMs: null,
    setupRequired: false,
    lastError: '',
    loading: false,
  },
  instagramFollowers: {
    followersCount: null,
    delta: null,
    rollingDelta1h: null,
    rollingDelta24h: null,
    profileName: '',
    profileHandle: '',
    fetchedAt: '',
    source: '',
    staleLevel: 'fresh',
    ageMs: null,
    lastError: '',
    loading: false,
  },
  gasPrices: {
    location: LOCAL_ZIP,
    resolvedLocation: '',
    source: 'manual',
    sourceUrl: '',
    fetchedAt: '',
    updatedAt: '',
    lastError: '',
    manualUpdatedAt: '',
    values: {
      regular: '',
      mid: '',
      premium: '',
      diesel: '',
    },
    manualValues: {
      regular: '',
      mid: '',
      premium: '',
      diesel: '',
    },
  },
  everydayCalculator: {
    display: '0',
    firstOperand: null,
    operator: null,
    waitingForSecondOperand: false,
    lastOperator: null,
    lastOperand: null,
    tipPercent: 18,
    taxPercent: 8,
    tipPanelOpen: true,
  },
  systemMonitor: {
    allowlist: ['node', 'chrome', 'openclaw', 'code', 'python'],
    settingsOpen: false,
  },
  speedTest: {
    autoIntervalMin: 0,
    warningThresholds: {
      pingMs: 100,
      downloadMbps: 100,
      uploadMbps: 20,
    },
    history: [],
    lastError: '',
    running: false,
  },
  homeDeviceControl: {
    devices: [],
    settingsOpen: false,
    pingByDevice: {},
    wakeModalDeviceId: '',
    scanRunning: false,
    lastScanAt: '',
    toast: '',
    toastAt: '',
  },
  changelog: [],
  layout: createDefaultUtilityLayoutState(),
  shortcuts: [
    {
      id: id(),
      title: 'Mission Control Repo',
      url: 'https://github.com/wizkidword/pa-nostromo',
      category: 'Development',
      projectIds: [SHORTCUT_GLOBAL_PROJECT_ID],
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: id(),
      title: 'Radio Map Local',
      url: 'http://localhost:3399',
      category: 'Tools',
      projectIds: [SHORTCUT_GLOBAL_PROJECT_ID],
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    },
  ]
};

let state;
let coinDirectory = [];
let topSymbolMap = new Map();
let cryptoRefreshCooldownUntil = 0;
let cryptoRefreshCooldownTimer = null;
let cryptoFailureCount = 0;
let cryptoBackoffUntil = 0;
const POLLING_BACKOFF_BASE_MS = 20 * 1000;
const POLLING_BACKOFF_MAX_MS = 3 * 60 * 1000;
const POLLING_DIAG_LOG_MIN_MS = 60 * 1000;
const TRANSIENT_UPSTREAM_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const pollingFailureState = {
  weather: { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'gas-prices': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'nba-scores': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'rss-feed': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'crypto-tracker': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'facebook-followers': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'instagram-followers': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'tiktok-followers': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'youtube-subscribers': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'ebay-traffic': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'unread-email': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'system-resource-monitor': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'speed-test': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
};
let systemMonitorTimer = null;
let speedTestAutoTimer = null;
let speedTestInFlight = false;
let systemMonitorLastPayload = null;
let systemMonitorLastUpdatedAt = '';
let systemMonitorLastError = '';
let systemMonitorInFlight = false;
let unreadEmailLastPayload = null;
let unreadEmailLastUpdatedAt = '';
let unreadEmailLastError = '';
let unreadEmailInFlight = false;
let unreadEmailMarkReadInFlight = '';
let unreadEmailSpamInFlight = '';
let unreadEmailDeleteInFlight = '';
let unreadEmailSelectedKeys = new Set();
let unreadEmailExpandedKeys = new Set();
let unreadEmailExpandedBodies = new Map();
let unreadEmailExpandedErrors = new Map();
let unreadEmailExpandedLoadingKeys = new Set();
let unreadEmailShowRecentInbox = false;
let unreadEmailBlockedSenderQueries = {};
let ebayTrafficLastPayload = null;
let ebayTrafficLastUpdatedAt = '';
let ebayTrafficLastError = '';
let ebayTrafficInFlight = false;
let ebayTrafficActiveStoreId = (() => {
  try { return String(localStorage.getItem(EBAY_TRAFFIC_ACTIVE_STORE_KEY) || '').trim(); } catch { return ''; }
})();
let ebayTrafficActiveInsightView = (() => {
  try {
    const value = String(localStorage.getItem(EBAY_TRAFFIC_ACTIVE_INSIGHT_KEY) || '').trim();
    return value === 'trend' || value === 'promo' ? value : 'sources';
  } catch {
    return 'sources';
  }
})();
let ebayTrafficActiveListingsView = (() => {
  try {
    const value = String(localStorage.getItem(EBAY_TRAFFIC_ACTIVE_LISTINGS_KEY) || '').trim();
    return value === 'watchers' ? 'watchers' : 'traffic';
  } catch {
    return 'traffic';
  }
})();
let ebayTrafficPromoLiftWindow = (() => {
  try {
    const value = String(localStorage.getItem(EBAY_TRAFFIC_PROMO_LIFT_WINDOW_KEY) || '').trim();
    return value === 'avg7' ? 'avg7' : 'day';
  } catch {
    return 'day';
  }
})();
let unreadEmailActiveAccountId = (() => {
  try { return String(localStorage.getItem(UNREAD_EMAIL_ACTIVE_ACCOUNT_KEY) || '').trim(); } catch { return ''; }
})();
let changeLogVisible = false;
let changeLogLimit = 10;
let pendingChanges = [];
let settingsPodDragState = null;
let activeSettingsSection = 'general';
let settingsPaneDragState = null;
let alarmTimer = null;
let alarmEndTs = null;
let alarmAudioCtx = null;
let alarmRepeatTimer = null;
let selectedCalendarDate = null;
let streamIframePlayer = null;
let streamIframeEl = null;
let youtubeApiLoading = false;
let youtubePlayerReady = false;
let pendingYoutubeAction = null;
let ambientYoutubeFallbackTimer = null;
let youtubePlayGuardTimer = null;
let musicSleepTimer = null;
let musicSleepEndsAt = 0;
const AMBIENT_PRESETS = [
  {
    id: 'rain',
    label: 'Rain',
    sources: [
      { type: 'youtube', label: 'YouTube · Steady rain ambience', url: 'https://www.youtube.com/watch?v=mPZkdNFkNps' },
      { type: 'youtube', label: 'YouTube · Rain + distant ambience', url: 'https://www.youtube.com/watch?v=jX6kn9_U8qk' },
      { type: 'direct', label: 'Built-in fallback · Rain loop', url: '/assets/ambient/rain-fallback.ogg' },
    ],
  },
  {
    id: 'thunder',
    label: 'Thunder',
    sources: [
      { type: 'youtube', label: 'YouTube · Thunderstorm ambience', url: 'https://www.youtube.com/watch?v=yMRoNNKWuqQ' },
      { type: 'youtube', label: 'YouTube · Heavy rain thunder', url: 'https://www.youtube.com/watch?v=q76bMs-NwRk' },
      { type: 'direct', label: 'Built-in fallback · Thunder loop', url: '/assets/ambient/thunder-fallback.ogg' },
    ],
  },
  {
    id: 'forest',
    label: 'Forest',
    sources: [
      { type: 'youtube', label: 'YouTube · Forest birds ambience', url: 'https://www.youtube.com/watch?v=OdIJ2x3nxzQ' },
      { type: 'youtube', label: 'YouTube · Deep forest ambience', url: 'https://www.youtube.com/watch?v=xNN7iTA57jM' },
      { type: 'direct', label: 'Built-in fallback · Forest loop', url: '/assets/ambient/forest-fallback.ogg' },
    ],
  },
  {
    id: 'fireplace',
    label: 'Fireplace',
    sources: [
      { type: 'youtube', label: 'YouTube · Fireplace crackling', url: 'https://www.youtube.com/watch?v=L_LUpnjgPso' },
      { type: 'youtube', label: 'YouTube · Fireplace room tone', url: 'https://www.youtube.com/watch?v=eyU3bRy2x44' },
      { type: 'direct', label: 'Built-in fallback · Fireplace loop', url: '/assets/ambient/fireplace-fallback.ogg' },
    ],
  },
  {
    id: 'ocean',
    label: 'Ocean',
    sources: [
      { type: 'youtube', label: 'YouTube · Ocean waves ambience', url: 'https://www.youtube.com/watch?v=bn9F19Hi1Lk' },
      { type: 'youtube', label: 'YouTube · Shoreline waves', url: 'https://www.youtube.com/watch?v=V-_O7nl0Ii0' },
      { type: 'direct', label: 'Built-in fallback · Ocean loop', url: '/assets/ambient/ocean-fallback.ogg' },
    ],
  },
  {
    id: 'cafe',
    label: 'Cafe',
    sources: [
      { type: 'youtube', label: 'YouTube · Cafe ambience', url: 'https://www.youtube.com/watch?v=gaGrHUekGrc' },
      { type: 'youtube', label: 'YouTube · Coffee shop ambience (clean start)', url: 'https://www.youtube.com/watch?v=gaGrHUekGrc' },
      { type: 'direct', label: 'Built-in fallback · Cafe murmur loop', url: '/assets/ambient/cafe-fallback.ogg' },
    ],
  },
  {
    id: 'wind',
    label: 'Wind',
    sources: [
      { type: 'youtube', label: 'YouTube · Wind ambience', url: 'https://www.youtube.com/watch?v=7WPsftkv1ZY' },
      { type: 'youtube', label: 'YouTube · Windy woods ambience (wind-dominant)', url: 'https://www.youtube.com/watch?v=7WPsftkv1ZY' },
      { type: 'direct', label: 'Built-in fallback · Wind loop', url: '/assets/ambient/wind-fallback.ogg' },
    ],
  },
  {
    id: 'night',
    label: 'Night Crickets',
    sources: [
      { type: 'youtube', label: 'YouTube · Night crickets ambience', url: 'https://www.youtube.com/watch?v=g1w3IT5WnYw' },
      { type: 'youtube', label: 'YouTube · Summer night insects', url: 'https://www.youtube.com/watch?v=-zWS52fBtSE' },
      { type: 'direct', label: 'Built-in fallback · Crickets loop', url: '/assets/ambient/night-crickets-fallback.ogg' },
    ],
  },
  {
    id: 'pink-noise',
    label: 'Pink Noise',
    sources: [
      { type: 'youtube', label: 'YouTube · Pink noise generator', url: 'https://www.youtube.com/watch?v=8SHf6wmX5MU' },
      { type: 'youtube', label: 'YouTube · Deep pink noise', url: 'https://www.youtube.com/watch?v=HIkAOMw_sjw' },
      { type: 'direct', label: 'Built-in fallback · Pink noise loop', url: '/assets/ambient/pink-noise-fallback.ogg' },
    ],
  },
];

state = load();

const themeController = themeFeature.createThemeController({
  document,
  window,
  getState: () => state,
  escapeHtml,
  onPreferenceChanged: ({ theme }) => {
    logChange(`Theme changed to ${theme.label}`);
    commitState('theme_changed');
  },
  onPreferenceUnchanged: () => renderSettings(),
});

const projectsController = projectsFeature.createProjectsController({
  document,
  getState: () => state,
  id,
  now,
  escapeText,
  escapeAttribute,
  safeExternalUrl,
  onProjectCreated: () => commitState('project_created'),
});

const notesController = notesFeature.createNotesController({
  document,
  getState: () => state,
  id,
  now,
  escapeText,
  escapeAttribute,
  escapeHtml,
  renderFormattedText,
  markdownToolbarButtons,
  bindMarkdownToolbar,
  save,
  commitState,
  deleteWithUndo,
});

const remindersController = remindersFeature.createRemindersController({
  document,
  getState: () => state,
  getSelectedDate: () => selectedCalendarDate,
  setSelectedDate: (date) => { selectedCalendarDate = date; },
  dateKey,
  id,
  now,
  escapeText,
  escapeHtml,
  escapeAttribute,
  commitState,
  deleteWithUndo,
});

const tasksController = tasksFeature.createTasksController({
  document,
  getState: () => state,
  id,
  now,
  escapeText,
  escapeAttribute,
  escapeHtml,
  renderFormattedText,
  markdownToolbarButtons,
  bindMarkdownToolbar,
  projectName: (projectId) => projectsController.projectName(projectId),
  commitState,
  deleteWithUndo,
  logChange,
  confirm: window.confirm.bind(window),
});

const shortcutsController = shortcutsFeature.createShortcutsController({
  document,
  getState: () => state,
  id,
  now,
  globalProjectId: SHORTCUT_GLOBAL_PROJECT_ID,
  safeExternalUrl,
  escapeText,
  escapeAttribute,
  escapeHtml,
  projectDisplayName: (projectId) => projectsController.projectDisplayName(projectId, SHORTCUT_GLOBAL_PROJECT_ID),
  commitState,
  deleteWithUndo,
  logChange,
  confirm: window.confirm.bind(window),
  alert: window.alert.bind(window),
});

let cameraSnapshotTimer = null;
let cameraSnapshotBust = 0;
let cameraLocalStream = null;
let cameraDeviceList = [];
let cameraDeviceRefreshInFlight = false;
const CAMERA_VIEWPORT_DEFAULT = { width: 640, height: 360 };
const CAMERA_VIEWPORT_MIN = { width: 280, height: 180 };
const CAMERA_VIEWPORT_MAX = { width: 1200, height: 900 };
let voiceNoteRecognizer = null;
let voiceNoteListening = false;
let voiceNoteSupported = false;
let voiceNoteSessionTranscript = '';
let voiceNoteManualStop = false;
let voiceNoteAutoRestartLeft = 0;
let voiceNoteLastError = '';
let voiceToRowanRecognizer = null;
let voiceToRowanListening = false;
let voiceToRowanSupported = false;
let voiceToRowanFinalTranscript = '';
let voiceToRowanDraft = '';
let voiceToRowanManualStop = false;
let voiceToRowanLastError = '';
let sharedSaveTimer = null;
let sharedHydrationResolved = false;
let sharedHydrationLastOutcome = 'pending';
let sharedPushPendingUntilHydration = false;
let sharedHydrateInFlight = null;
let sharedHydrateSeq = 0;
let sharedHydrateScheduledTimer = null;
let sharedHydrateQueuedReason = '';
let sharedHydrateLastRunAt = 0;
let sharedStateConflictDraft = null;
const SHARED_HYDRATE_MIN_INTERVAL_MS = 250;
let suppressCrossTabSync = false;
let sharedSyncChannel = null;
let undoState = {
  actionId: '',
  status: 'idle',
  expiresAt: 0,
  timer: null,
};
let safetyBackupsCache = [];
let lastSafetyBackupsRefreshAt = 0;
let nbaScoreboardCache = {
  dateKey: '',
  fetchedAt: '',
  data: null,
};
let weatherSnapshotCache = {
  zip: '',
  fetchedAt: '',
  snapshot: null,
};

function id(){ return Math.random().toString(36).slice(2,10); }
function now(){ return new Date().toISOString(); }
function ensureChangelogPatch(stateObj, message){
  if (!Array.isArray(stateObj?.changelog) || !message) return;
  if (stateObj.changelog.some((entry) => entry?.message === message)) return;
  stateObj.changelog.unshift({ id: id(), ts: now(), message });
  stateObj.changelog = stateObj.changelog.slice(0, 200);
}
function normalizeSettingsState(input){
  const settings = { ...DEFAULT_SETTINGS, ...(input || {}) };
  settings.theme = normalizeThemePreference(settings.theme);
  settings.defaultTaskColumn = normalizeTaskColumn(settings.defaultTaskColumn);
  settings.shortcutsFilterProjectIds = Array.isArray(settings.shortcutsFilterProjectIds)
    ? settings.shortcutsFilterProjectIds
    : [];
  return settings;
}

function migrateIdeasTasksToNotes(stateObj){
  if (!Array.isArray(stateObj?.tasks) || !Array.isArray(stateObj?.notes)) return 0;
  const ideasTasks = stateObj.tasks.filter((task) => task?.column === 'ideas');
  if (!ideasTasks.length) return 0;

  const migratedAt = now();
  ideasTasks.forEach((task) => {
    const nextAction = String(task.nextAction || '').trim();
    const owner = String(task.owner || 'Rowan').trim();
    const lines = [
      `Migrated from Kanban ideas column (${migratedAt}).`,
      `Original task id: ${task.id || 'unknown'}`,
    ];
    if (nextAction) lines.push(`Next action: ${nextAction}`);
    if (owner) lines.push(`Owner: ${owner}`);

    stateObj.notes.unshift({
      id: id(),
      title: String(task.title || 'Idea from task').trim() || 'Idea from task',
      body: lines.join('\n'),
      projectId: task.projectId || stateObj.projects?.[0]?.id || '',
      pinned: false,
      createdAt: migratedAt,
      updatedAt: migratedAt,
    });
  });

  stateObj.tasks = stateObj.tasks.filter((task) => task?.column !== 'ideas');
  stateObj.notes = stateObj.notes.slice(0, 500);
  return ideasTasks.length;
}
function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  let state;
  try {
    state = raw ? JSON.parse(raw) : seed;
  } catch {
    state = seed;
  }

  state.projects = Array.isArray(state.projects) ? state.projects : [];
  state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
  // Migration: normalize renamed project + ensure required projects exist.
  const legacy = state.projects.find((p) => p.name === 'Retro Flash Homage Site');
  if (legacy) {
    legacy.name = 'Retro Flash Games Portal';
    legacy.summary = 'Build a playable Flash games platform (emulation-based) with accounts, XP, levels, achievements, and community progression—mini Kongregate 2000 vibe';
    legacy.status = legacy.status || 'planning';
    legacy.lastUpdated = now();
  }
  state.notes = Array.isArray(state.notes) ? state.notes : [];
  state.notes = state.notes.map((n)=>({ pinned: !!n.pinned, ...n }));
  state.ideas = Array.isArray(state.ideas) ? state.ideas : [];
  state.reminders = Array.isArray(state.reminders) ? state.reminders : [];
  state.settings = normalizeSettingsState(state.settings);
  const migratedIdeasTaskCount = migrateIdeasTasksToNotes(state);
  if (migratedIdeasTaskCount > 0) {
    ensureChangelogPatch(state, `Cleanup: migrated ${migratedIdeasTaskCount} idea task${migratedIdeasTaskCount === 1 ? '' : 's'} into Ideas notes and removed Kanban ideas column usage.`);
  }
  state.tasks = state.tasks.map((task) => ({
    ...task,
    column: normalizeTaskColumn(task?.column),
  }));
  state.layout = normalizeUtilityLayoutState(state.layout);
  state.cryptoWatchlist = Array.isArray(state.cryptoWatchlist) ? state.cryptoWatchlist : ['bitcoin', 'ethereum'];
  // Migration: repair legacy/ambiguous crypto watchlist ids from older resolver behavior.
  const cryptoIdAliases = {
    btc: 'bitcoin',
    eth: 'ethereum',
    doge: 'dogecoin',
    sol: 'solana',
  };
  state.cryptoWatchlist = [...new Set(
    state.cryptoWatchlist
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean)
      .map((v) => v.replace(/^[@#$]+/, ''))
      .map((v) => cryptoIdAliases[v] || v)
  )];

  const holdingsRaw = (state.cryptoHoldings && typeof state.cryptoHoldings === 'object') ? state.cryptoHoldings : {};
  state.cryptoHoldings = {};
  for (const [coinIdRaw, holding] of Object.entries(holdingsRaw)) {
    const coinIdNorm = String(coinIdRaw || '').trim().toLowerCase();
    const coinId = cryptoIdAliases[coinIdNorm] || coinIdNorm;
    if (!coinId) continue;
    const quantity = Number(holding?.quantity ?? 0);
    const avgBuyPrice = Number(holding?.avgBuyPrice ?? holding?.averageBuyPrice ?? 0);
    state.cryptoHoldings[coinId] = {
      quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
      avgBuyPrice: Number.isFinite(avgBuyPrice) && avgBuyPrice >= 0 ? avgBuyPrice : 0,
    };
  }
  state.musicPlayer = {
    sourceType: 'stream',
    mode: 'stream',
    currentStreamUrl: '',
    streamMode: 'unknown',
    favoriteStreamUrl: '',
    currentTrackName: '',
    volume: 0.7,
    isPlaying: false,
    ambientPresetId: 'rain',
    ambientSourceIndex: 0,
    sleepTimerMin: 0,
    ...(state.musicPlayer || {}),
  };
  state.musicPlayer.mode = state.musicPlayer.mode === 'ambient' ? 'ambient' : 'stream';
  state.musicPlayer.volume = Math.min(1, Math.max(0, Number(state.musicPlayer.volume ?? 0.7)));
  state.musicPlayer.ambientPresetId = AMBIENT_PRESETS.some((preset) => preset.id === state.musicPlayer.ambientPresetId)
    ? state.musicPlayer.ambientPresetId
    : 'rain';
  state.musicPlayer.ambientSourceIndex = Math.max(0, Math.floor(Number(state.musicPlayer.ambientSourceIndex || 0)));
  state.musicPlayer.sleepTimerMin = [0, 15, 30, 60].includes(Number(state.musicPlayer.sleepTimerMin))
    ? Number(state.musicPlayer.sleepTimerMin)
    : 0;

  state.cameraFeed = cameraFeedStateFeature.normalizeState(state.cameraFeed);

  state.liveStreams = {
    sourceType: 'youtube',
    inputs: {
      youtube: '',
      twitch: '',
      kick: '',
      vaughn: '',
      rumble: '',
      xlive: '',
      facebook: '',
      generic: '',
      local: '',
    },
    active: false,
    status: 'idle',
    lastError: '',
    embedUrl: '',
    externalUrl: '',
    renderMode: 'iframe',
    presets: [],
    ...(state.liveStreams || {}),
  };
  state.liveStreams.sourceType = ['youtube', 'twitch', 'kick', 'vaughn', 'rumble', 'xlive', 'facebook', 'generic', 'local'].includes(state.liveStreams.sourceType)
    ? state.liveStreams.sourceType
    : 'youtube';
  const liveInputs = (state.liveStreams.inputs && typeof state.liveStreams.inputs === 'object') ? state.liveStreams.inputs : {};
  state.liveStreams.inputs = {
    youtube: String(liveInputs.youtube || '').trim(),
    twitch: String(liveInputs.twitch || '').trim(),
    kick: String(liveInputs.kick || '').trim(),
    vaughn: String(liveInputs.vaughn || '').trim(),
    rumble: String(liveInputs.rumble || '').trim(),
    xlive: String(liveInputs.xlive || '').trim(),
    facebook: String(liveInputs.facebook || '').trim(),
    generic: String(liveInputs.generic || '').trim(),
    local: String(liveInputs.local || '').trim(),
  };
  state.liveStreams.active = !!state.liveStreams.active;
  state.liveStreams.status = ['idle', 'loading', 'live', 'error'].includes(state.liveStreams.status) ? state.liveStreams.status : 'idle';
  state.liveStreams.lastError = String(state.liveStreams.lastError || '').slice(0, 300);
  state.liveStreams.embedUrl = String(state.liveStreams.embedUrl || '').trim();
  state.liveStreams.externalUrl = String(state.liveStreams.externalUrl || '').trim();
  state.liveStreams.renderMode = ['iframe', 'video'].includes(state.liveStreams.renderMode) ? state.liveStreams.renderMode : 'iframe';
  state.liveStreams.presets = Array.isArray(state.liveStreams.presets)
    ? state.liveStreams.presets.slice(0, 20).map((p) => ({
      id: String(p?.id || id()),
      name: String(p?.name || '').trim().slice(0, 40),
      sourceType: ['youtube', 'twitch', 'kick', 'vaughn', 'rumble', 'xlive', 'facebook', 'generic', 'local'].includes(p?.sourceType) ? p.sourceType : 'youtube',
      value: String(p?.value || '').trim().slice(0, 500),
      createdAt: String(p?.createdAt || now()),
    })).filter((p) => p.name && p.value)
    : [];
  state.rss = {
    feeds: [],
    items: [],
    readItemIds: [],
    showRead: false,
    refreshIntervalMin: RSS_DEFAULT_REFRESH_MIN,
    lastUpdatedAt: '',
    lastError: '',
    ...(state.rss || {}),
  };
  state.rss.feeds = Array.isArray(state.rss.feeds)
    ? state.rss.feeds.map((f) => ({
      id: String(f?.id || id()),
      url: String(f?.url || '').trim(),
      tag: String(f?.tag || '').trim().slice(0, 40),
      addedAt: f?.addedAt || now(),
    })).filter((f) => /^https?:\/\//i.test(f.url))
      .sort((a, b) => String(a.addedAt || '').localeCompare(String(b.addedAt || '')) || String(a.id || '').localeCompare(String(b.id || '')))
    : [];
  state.rss.items = Array.isArray(state.rss.items)
    ? state.rss.items.map((item) => ({
      id: String(item?.id || '').trim(),
      feedId: String(item?.feedId || '').trim(),
      title: String(item?.title || 'Untitled').trim() || 'Untitled',
      link: String(item?.link || '').trim(),
      summary: String(item?.summary || '').trim(),
      publishedAt: String(item?.publishedAt || '').trim(),
      feedTitle: String(item?.feedTitle || '').trim(),
      tag: String(item?.tag || '').trim(),
    })).filter((item) => item.id && /^https?:\/\//i.test(item.link))
    : [];
  state.rss.readItemIds = [...new Set((Array.isArray(state.rss.readItemIds) ? state.rss.readItemIds : []).map((v) => String(v || '').trim()).filter(Boolean))];
  state.rss.showRead = !!state.rss.showRead;
  const rssRefresh = Number(state.rss.refreshIntervalMin || RSS_DEFAULT_REFRESH_MIN);
  state.rss.refreshIntervalMin = Number.isFinite(rssRefresh) ? Math.min(180, Math.max(5, Math.round(rssRefresh))) : RSS_DEFAULT_REFRESH_MIN;
  state.rss.lastUpdatedAt = String(state.rss.lastUpdatedAt || '');
  state.rss.lastError = String(state.rss.lastError || '').slice(0, 300);
  state.gasPrices = normalizeGasPricesState(state.gasPrices); state.everydayCalculator = normalizeEverydayCalculatorState(state.everydayCalculator);
  state.systemMonitor = normalizeSystemMonitorState(state.systemMonitor);
  state.speedTest = normalizeSpeedTestState(state.speedTest); state.speedTest.running = false; state.homeDeviceControl = normalizeHomeDeviceControlState(state.homeDeviceControl);
  state.nba = normalizeNbaState(state.nba);
  state.unreadEmailBlockedSenders = normalizeUnreadEmailBlockedSenders(state.unreadEmailBlockedSenders);
  state.changelog = Array.isArray(state.changelog) ? state.changelog : [];

  ensureChangelogPatch(state, 'Patch: Crypto Tracker now supports portfolio holdings (qty + avg buy) with unrealized P/L summary.');
  ensureChangelogPatch(state, 'Patch: Utility Pod order now supports drag-and-drop across rows in Settings (arrow buttons still reorder within each row).');
  ensureChangelogPatch(state, 'Patch: Music Player now includes compact Ambient mode with one-click nature presets, sleep timer, and quick fallback switching.');
  ensureChangelogPatch(state, 'Patch: Ambient playback now auto-recovers from failed sources and includes direct-audio fallbacks with clearer error status.');
  ensureChangelogPatch(state, 'Patch: Ambient presets now use category-matched source sets with built-in non-YouTube fallbacks for Rain/Thunder/Forest/Fireplace/Ocean/Cafe/Wind/Night Crickets/Pink Noise.');
  ensureChangelogPatch(state, 'Patch: Music hotfix restored reliable Stream favorite/manual playback, isolated ambient fallback handling, and refreshed Thunder/Forest/Fireplace fallback audio assets.');
  ensureChangelogPatch(state, 'Patch: Ambient source tuning corrected Cafe/Wind/Night Crickets/Pink Noise links and realigned fallback audio tone for category accuracy.');
  ensureChangelogPatch(state, 'Patch: Renamed Mini Notes Board to Ideas and retired the Kanban Ideas column (legacy idea tasks are migrated into Ideas notes).');
  ensureChangelogPatch(state, 'New utility pod: Everyday Calculator added with keyboard-friendly basic math + collapsible tip/tax helper (tip applies to subtotal only).');

  // Ensure reminder task exists for pod drag/drop idea.
  const mission = (state.projects || []).find((p) => p.name === 'Mission Control Dashboard');
  const taskTitle = 'Evaluate draggable/reorderable pods (drag-drop layout + reset layout)';
  const existingPodTask = (state.tasks || []).find((t) => t.title === taskTitle);
  if (mission && !existingPodTask) {
    state.tasks.push({
      id: id(),
      title: taskTitle,
      projectId: mission.id,
      column: 'inbox',
      blockerType: null,
      owner: 'Rowan',
      nextAction: 'Design Phase 2 approach for draggable pod reordering with local persistence.',
      dueDate: '',
      createdAt: now(),
      updatedAt: now(),
    });
  } else if (existingPodTask) {
    existingPodTask.column = normalizeTaskColumn(existingPodTask.column);
    existingPodTask.updatedAt = now();
  }

  // Ensure Ollama setup follow-up task exists.
  const ollamaTaskTitle = 'Set up Ollama local fallback in OpenClaw';
  const existingOllamaTask = (state.tasks || []).find((t) => t.title === ollamaTaskTitle);
  if (mission && !existingOllamaTask) {
    state.tasks.push({
      id: id(),
      title: ollamaTaskTitle,
      projectId: mission.id,
      column: 'inbox',
      blockerType: null,
      owner: 'Rowan',
      nextAction: 'Install/verify Ollama, pull a local model, then add ollama provider + fallback chain entry.',
      dueDate: '',
      createdAt: now(),
      updatedAt: now(),
    });
  } else if (existingOllamaTask) {
    existingOllamaTask.column = existingOllamaTask.column || 'inbox';
    existingOllamaTask.updatedAt = now();
  }

  const byName = new Set((state.projects || []).map((p) => p.name));
  for (const p of REQUIRED_PROJECTS) {
    if (!byName.has(p.name)) {
      state.projects.push({ id: id(), ...p, lastUpdated: now() });
    }
  }

  state.shortcuts = Array.isArray(state.shortcuts) ? state.shortcuts : [];
  state.shortcuts = state.shortcuts.map((sc) => {
    const projectIdsRaw = Array.isArray(sc.projectIds)
      ? sc.projectIds
      : (sc.projectId ? [sc.projectId] : [SHORTCUT_GLOBAL_PROJECT_ID]);
    const projectIds = [...new Set(projectIdsRaw.map((v) => String(v || '').trim()).filter(Boolean))];
    return {
      id: sc.id || id(),
      title: String(sc.title || sc.label || 'Shortcut').trim(),
      url: String(sc.url || '').trim(),
      category: String(sc.category || sc.tag || '').trim(),
      projectIds: projectIds.length ? projectIds : [SHORTCUT_GLOBAL_PROJECT_ID],
      enabled: sc.enabled !== false,
      createdAt: sc.createdAt || now(),
      updatedAt: sc.updatedAt || now(),
    };
  }).filter((sc) => sc.url);

  if (!state.shortcuts.length) {
    state.shortcuts = [
      {
        id: id(),
        title: 'Mission Control Repo',
        url: 'https://github.com/wizkidword/pa-nostromo',
        category: 'Development',
        projectIds: [SHORTCUT_GLOBAL_PROJECT_ID],
        enabled: true,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: id(),
        title: 'Radio Map Local',
        url: 'http://localhost:3399',
        category: 'Tools',
        projectIds: [SHORTCUT_GLOBAL_PROJECT_ID],
        enabled: true,
        createdAt: now(),
        updatedAt: now(),
      },
    ];
  }

  return state;
}


function extractStateRevision(obj){
  const rev = Number(obj?.__integrity?.revision || 0);
  return Number.isFinite(rev) ? rev : 0;
}

function applySharedWriteIntegrity(target, result){
  if (!target || typeof target !== 'object' || !result?.ok) return;
  const schemaVersion = Number(result.schemaVersion || result?.integrity?.stateSchemaVersion || target.schemaVersion || 1);
  target.schemaVersion = Number.isInteger(schemaVersion) && schemaVersion > 0 ? schemaVersion : 1;
  target.__integrity = {
    ...(target.__integrity || {}),
    revision: Number(result.revision || 0),
    savedAt: String(result.savedAt || now()),
    checksum: String(result.checksum || ''),
    stateSchemaVersion: target.schemaVersion,
  };
}

async function loadApplicationVersion(){
  const el = document.getElementById('appVersion');
  if (!el) return;
  try {
    const response = await fetch(APP_INFO_API, { cache: 'no-store' });
    if (!response.ok) throw new Error('app_info_unavailable');
    const info = await response.json();
    const appVersion = String(info?.appVersion || '').trim();
    const schemaVersion = Number(info?.stateSchemaVersion);
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(appVersion) || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw new Error('app_info_invalid');
    }
    el.textContent = `v${appVersion} · state schema ${schemaVersion}`;
    document.title = `PA Nostromo v${appVersion}`;
  } catch {
    el.textContent = 'Version unavailable';
  }
}

function clearSharedStateConflict(){
  sharedStateConflictDraft = null;
  document.getElementById('sharedStateConflictNotice')?.remove();
}

function showSharedStateConflict(error){
  if (!sharedStateConflictDraft) {
    try { sharedStateConflictDraft = JSON.parse(JSON.stringify(state)); } catch { sharedStateConflictDraft = state; }
  }
  const existing = document.getElementById('sharedStateConflictNotice');
  if (existing) return;
  const notice = document.createElement('section');
  notice.id = 'sharedStateConflictNotice';
  notice.className = 'change-log-item shared-state-conflict-notice';
  notice.setAttribute('role', 'alert');
  notice.innerHTML = `<strong>Shared state changed elsewhere</strong><div class="note-meta shared-state-conflict-copy">Your local edits are still kept in this browser. Reload the newer shared copy, export your edits, or explicitly overwrite it.</div><div class="shared-state-conflict-actions"><button class="btn ghost" data-state-conflict="reload" type="button">Reload shared</button><button class="btn ghost" data-state-conflict="export" type="button">Export my edits</button><button class="btn" data-state-conflict="overwrite" type="button">Keep my edits</button></div>`;
  document.body.appendChild(notice);
  notice.querySelector('[data-state-conflict="reload"]')?.addEventListener('click', async () => {
    await runSharedHydrateNow();
    clearSharedStateConflict();
  });
  notice.querySelector('[data-state-conflict="export"]')?.addEventListener('click', () => {
    downloadJsonFile(`pa-nostromo-conflict-draft-${now().replace(/[:.]/g, '-')}.json`, sharedStateConflictDraft || state);
  });
  notice.querySelector('[data-state-conflict="overwrite"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!window.confirm('Replace the newer shared state with your preserved local edits?')) return;
    button.disabled = true;
    try {
      const remoteResponse = await fetch(`${SHARED_STATE_API}?_=${Date.now()}`, { cache: 'no-store' });
      const remote = remoteResponse.ok ? await remoteResponse.json() : null;
      const draft = sharedStateConflictDraft || state;
      const result = await writeStateToSharedApi({
        ...draft,
        __writeControl: { overrideDowngrade: true, source: 'conflict_overwrite', explicitLiveOverride: true },
      }, { expectedRevision: extractStateRevision(remote) });
      applySharedWriteIntegrity(draft, result);
      applyIncomingState(draft, { render: true });
      broadcastCrossTabSync('state_conflict_overwrite', { reason: 'explicit_conflict_overwrite' });
      clearSharedStateConflict();
    } catch (overwriteError) {
      alert(`Could not keep local edits: ${String(overwriteError?.message || overwriteError)}`);
    } finally {
      button.disabled = false;
    }
  });
}

function applyIncomingState(incoming, { render = false } = {}){
  if (!incoming || typeof incoming !== 'object') return false;
  suppressCrossTabSync = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));
    state = load();
  } finally {
    suppressCrossTabSync = false;
  }
  if (render) renderAll();
  return true;
}

function broadcastCrossTabSync(eventType = 'state_changed', meta = {}){
  if (suppressCrossTabSync) return;
  const payload = {
    eventType,
    ts: Date.now(),
    reason: String(meta?.reason || ''),
    actionId: String(meta?.actionId || ''),
    source: 'mission-control-lite',
  };

  try {
    localStorage.setItem(SHARED_STATE_SYNC_EVENT_KEY, JSON.stringify(payload));
    localStorage.removeItem(SHARED_STATE_SYNC_EVENT_KEY);
  } catch {}

  try {
    if (!sharedSyncChannel && typeof BroadcastChannel !== 'undefined') {
      sharedSyncChannel = new BroadcastChannel(SHARED_STATE_SYNC_CHANNEL);
    }
    sharedSyncChannel?.postMessage(payload);
  } catch {}
}

async function runSharedHydrateNow(){
  if (sharedHydrateInFlight) return sharedHydrateInFlight;
  const seq = ++sharedHydrateSeq;
  sharedHydrateLastRunAt = Date.now();
  sharedHydrateInFlight = (async () => {
    const hydrated = await hydrateStateFromSharedApi();
    if (hydrated && seq === sharedHydrateSeq) renderAll();
    return hydrated;
  })().finally(() => {
    sharedHydrateInFlight = null;
  });
  return sharedHydrateInFlight;
}

async function scheduleSharedHydrate(reason = 'cross_tab_sync'){
  if (sharedHydrateInFlight) return sharedHydrateInFlight;
  const elapsed = Date.now() - sharedHydrateLastRunAt;
  if (elapsed >= SHARED_HYDRATE_MIN_INTERVAL_MS) {
    return runSharedHydrateNow();
  }

  sharedHydrateQueuedReason = reason;
  if (sharedHydrateScheduledTimer) return Promise.resolve(false);

  const waitMs = Math.max(0, SHARED_HYDRATE_MIN_INTERVAL_MS - elapsed);
  sharedHydrateScheduledTimer = setTimeout(() => {
    sharedHydrateScheduledTimer = null;
    const queued = sharedHydrateQueuedReason || 'queued_cross_tab_sync';
    sharedHydrateQueuedReason = '';
    runSharedHydrateNow(queued);
  }, waitMs);

  return Promise.resolve(false);
}

async function hydrateStateFromSharedApi(){
  try {
    const res = await fetch(`${SHARED_STATE_API}?_=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 404) return false;
    if (!res.ok) return false;
    const remote = await res.json();
    if (!remote || typeof remote !== 'object') return false;
    const applied = applyIncomingState(remote, { render: false });
    return !!applied;
  } catch {
    return false;
  }
}

async function writeStateToSharedApi(payload, { expectedRevision = extractStateRevision(state) } = {}){
  const headers = { 'Content-Type': 'application/json' };
  if (Number.isSafeInteger(expectedRevision) && expectedRevision >= 0) headers['If-Match'] = `"${expectedRevision}"`;
  const res = await fetch(SHARED_STATE_API, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let details = '';
    let errorBody = null;
    try {
      errorBody = await res.json();
      details = errorBody?.message || errorBody?.error || '';
    } catch {
      // ignore
    }
    const error = new Error(details || `State sync failed (HTTP ${res.status})`);
    error.code = errorBody?.error || 'state_sync_failed';
    error.status = res.status;
    error.currentRevision = errorBody?.currentRevision;
    throw error;
  }

  return res.json().catch(() => null);
}

async function pushStateToSharedApi(reason = 'unspecified'){
  if (!sharedHydrationResolved) {
    sharedPushPendingUntilHydration = true;
    return false;
  }

  try {
    const result = await writeStateToSharedApi(state);
    applySharedWriteIntegrity(state, result);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    clearSharedStateConflict();
    broadcastCrossTabSync('state_changed', { reason });
    return true;
  } catch (error) {
    if (error?.code === 'state_revision_conflict') showSharedStateConflict(error);
    // Local fallback only
    return false;
  }
}

function flushPendingSharedPush(reason = 'hydration_resolved'){
  if (!sharedHydrationResolved || !sharedPushPendingUntilHydration) return;
  sharedPushPendingUntilHydration = false;
  pushStateToSharedApi(reason);
}

function save(reason = 'unspecified', { pushShared = true } = {}){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!pushShared) return;
  if (sharedSaveTimer) clearTimeout(sharedSaveTimer);
  sharedSaveTimer = setTimeout(() => {
    if (!sharedHydrationResolved) {
      sharedPushPendingUntilHydration = true;
      return;
    }
    pushStateToSharedApi(reason);
  }, 300);
}

function commitState(reason = 'state_commit', { render = true } = {}){
  save(reason);
  if (render) renderAll();
}

function downloadJsonFile(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportStateSnapshot(){
  const stamp = now().replace(/[:.]/g, '-');
  downloadJsonFile(`pa-nostromo-state-${stamp}.json`, state);
}

function clearUndoPrompt(status = 'cleared'){
  if (undoState.timer) clearTimeout(undoState.timer);
  undoState = {
    actionId: '',
    status,
    expiresAt: 0,
    timer: null,
  };
  const bar = document.getElementById('stateSafetyUndoBar');
  if (bar) bar.hidden = true;
}

function offerUndoAction({ label, undoFn, actionId = '' }){
  const bar = document.getElementById('stateSafetyUndoBar');
  const text = document.getElementById('stateSafetyUndoText');
  const btn = document.getElementById('stateSafetyUndoBtn');
  if (!bar || !text || !btn || typeof undoFn !== 'function') return;

  if (undoState.timer) clearTimeout(undoState.timer);
  const resolvedActionId = String(actionId || `undo-${Date.now()}`);
  undoState = {
    actionId: resolvedActionId,
    status: 'offered',
    expiresAt: Date.now() + UNDO_WINDOW_MS,
    timer: null,
  };

  text.textContent = label;
  bar.hidden = false;

  btn.onclick = () => {
    if (undoState.actionId !== resolvedActionId) return;
    if (undoState.status !== 'offered') return;
    if (Date.now() > undoState.expiresAt) {
      clearUndoPrompt('expired');
      return;
    }
    clearUndoPrompt('undone');
    undoFn();
    commitState('destructive_action_undo_restored');
    broadcastCrossTabSync('undo_restored', { actionId: resolvedActionId, reason: 'destructive_action_undo_restored' });
  };

  undoState.timer = setTimeout(() => {
    if (undoState.actionId !== resolvedActionId) return;
    if (undoState.status !== 'offered') return;
    clearUndoPrompt('expired');
    broadcastCrossTabSync('undo_expired', { actionId: resolvedActionId, reason: 'undo_window_expired' });
  }, UNDO_WINDOW_MS);
}

function deleteWithUndo({ collection, itemId, reason, buildUndoLabel }){
  const list = collection();
  if (!Array.isArray(list)) return false;
  const idx = list.findIndex((x) => x?.id === itemId);
  if (idx < 0) return false;

  const [removed] = list.splice(idx, 1);
  commitState(reason);

  const actionId = `delete:${String(removed?.id || itemId)}:${Date.now()}`;
  offerUndoAction({
    actionId,
    label: typeof buildUndoLabel === 'function' ? buildUndoLabel(removed) : 'Item deleted. Undo?',
    undoFn: () => {
      const next = collection();
      if (!Array.isArray(next)) return;
      const exists = next.some((x) => x?.id === removed.id);
      if (!exists) next.splice(Math.min(idx, next.length), 0, removed);
    },
  });
  broadcastCrossTabSync('destructive_action_deleted', { actionId, reason });

  return true;
}

function summarizeBackupMeta(backup){
  const meta = backup?.snapshotMeta || {};
  const counts = meta?.criticalCounts || {};
  const pieces = [];
  if (Number.isFinite(counts.tasks)) pieces.push(`tasks ${counts.tasks}`);
  if (Number.isFinite(counts.notes)) pieces.push(`notes ${counts.notes}`);
  if (Number.isFinite(counts.reminders)) pieces.push(`reminders ${counts.reminders}`);
  return pieces.slice(0, 3).join(' · ');
}

async function refreshStateSafetyBackups(force = false){
  const list = document.getElementById('stateSafetyBackupsList');
  if (!list) return;
  const nowMs = Date.now();
  if (!force && nowMs - lastSafetyBackupsRefreshAt < 30000) return;
  lastSafetyBackupsRefreshAt = nowMs;
  list.innerHTML = '<div class="note-meta">Loading recent backups…</div>';
  try {
    const res = await fetch(SHARED_STATE_BACKUPS_API, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    safetyBackupsCache = Array.isArray(data?.backups) ? data.backups : [];

    if (!safetyBackupsCache.length) {
      list.innerHTML = '<div class="note-meta">No backups found yet.</div>';
      return;
    }

    list.innerHTML = safetyBackupsCache.slice(0, 12).map((b) => {
      const stamp = new Date(b.createdAt || Date.now()).toLocaleString();
      const meta = b.snapshotMeta || {};
      const label = summarizeBackupMeta(b);
      const checksumShort = meta.checksum ? String(meta.checksum).slice(0, 10) : 'n/a';
      return `<div class="change-log-item">
        <strong>${escapeHtml(stamp)}</strong>
        <div class="note-meta">${escapeHtml(meta.reason || 'backup')} · rev ${escapeHtml(String(meta.revision || 0))} · checksum ${escapeHtml(checksumShort)}…</div>
        ${label ? `<div class="note-meta">${escapeHtml(label)}</div>` : ''}
        <button class="btn ghost" data-state-restore="${escapeHtml(b.backupFile)}" type="button">Restore</button>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-state-restore]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const backupFile = String(btn.getAttribute('data-state-restore') || '').trim();
        if (!backupFile) return;
        const backup = safetyBackupsCache.find((x) => x.backupFile === backupFile);
        const stamp = new Date(backup?.createdAt || Date.now()).toLocaleString();
        const confirmText = `Restore shared state from backup ${stamp}?\n\nThis creates an automatic pre-restore snapshot and then replaces current shared state for all browsers.`;
        if (!window.confirm(confirmText)) return;
        btn.disabled = true;
        try {
          const resp = await fetch(SHARED_STATE_RESTORE_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'If-Match': `"${extractStateRevision(state)}"` },
            body: JSON.stringify({ backupFile }),
          });
          const payload = await resp.json();
          if (!resp.ok || !payload?.ok) {
            const restoreError = new Error(payload?.message || payload?.error || `HTTP ${resp.status}`);
            restoreError.code = payload?.error || 'restore_failed';
            if (restoreError.code === 'state_revision_conflict') showSharedStateConflict(restoreError);
            throw restoreError;
          }
          clearUndoPrompt('restore_applied');
          await scheduleSharedHydrate('manual_restore_applied');
          broadcastCrossTabSync('state_restored', { reason: 'manual_restore_applied' });
          logChange(`Restored state from backup ${backupFile}`);
          await refreshStateSafetyBackups(true);
          alert(`State restored. Pre-restore snapshot: ${payload.preRestoreSnapshot || 'created'}`);
        } catch (err) {
          alert(`Restore failed: ${String(err?.message || err)}`);
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    list.innerHTML = `<div class="note-meta">Failed to load backups: ${escapeHtml(String(err?.message || err))}</div>`;
  }
}

async function importStateSnapshotFromFile(file){
  if (!file) return;
  const warning = 'Importing state will overwrite the current shared dashboard state for all browsers. Continue?';
  if (!window.confirm(warning)) return;
  const secondConfirm = window.prompt('Type IMPORT to confirm shared overwrite.');
  if (String(secondConfirm || '').trim().toUpperCase() !== 'IMPORT') return;

  const text = await file.text();
  const incoming = JSON.parse(text);
  if (!incoming || typeof incoming !== 'object') {
    throw new Error('Selected file is not a valid state object.');
  }

  const result = await writeStateToSharedApi({
    ...incoming,
    __writeControl: {
      overrideDowngrade: true,
      source: 'manual_import',
      explicitLiveOverride: true,
    },
  });

  applySharedWriteIntegrity(incoming, result);
  applyIncomingState(incoming, { render: true });
  broadcastCrossTabSync('state_imported', { reason: 'manual_import' });
}

function applyTheme(){
  return themeController.applyTheme();
}

function setThemePreference(themeId){
  return themeController.setThemePreference(themeId);
}

function setupWeatherTimer(){
  const registry = getPodRegistry();
  if (registry?.destroy) registry.destroy('weather', { state });
  syncUtilityPodLifecycle();
}

function setupNbaTimer(){
  const registry = getPodRegistry();
  if (registry?.destroy) registry.destroy('nba-scores', { state });
  syncUtilityPodLifecycle();
}

function setupCryptoTimer(){
  const registry = getPodRegistry();
  if (registry?.destroy) registry.destroy('crypto-tracker', { state });
  syncUtilityPodLifecycle();
}

function setupRssTimer(){
  const registry = getPodRegistry();
  if (registry?.destroy) registry.destroy('rss-feed', { state });
  syncUtilityPodLifecycle();
}

function flushPendingChanges(){
  if (pendingChanges.length < 3) return;
  const bundled = pendingChanges.slice(0, 3);
  pendingChanges = pendingChanges.slice(3);

  const message = `Batch update:\n- ${bundled.join('\n- ')}`;
  state.changelog.unshift({ id: id(), ts: now(), message });
  state.changelog = state.changelog.slice(0, 200);
  save();
  renderChangeLog();
}

function logChange(message){
  pendingChanges.push(message);
  flushPendingChanges();
}

function setActiveSettingsSection(sectionId, options = {}){
  const target = String(sectionId || '').trim();
  if (!target) return;
  const sections = [...document.querySelectorAll('[data-settings-section]')];
  const navButtons = [...document.querySelectorAll('[data-settings-section-btn]')];
  if (!sections.length || !navButtons.length) return;

  let matched = false;
  sections.forEach((section) => {
    const isActive = section.dataset.settingsSection === target;
    section.hidden = !isActive;
    section.classList.toggle('is-active', isActive);
    if (isActive) matched = true;
  });

  if (!matched) return;

  navButtons.forEach((btn) => {
    const isActive = btn.dataset.settingsSectionBtn === target;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  activeSettingsSection = target;
  if (!options.preserveScroll) {
    const pane = document.getElementById('settingsContentPane');
    if (pane) {
      pane.scrollTop = 0;
      const isNarrowLayout = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 980px)').matches;
      if (isNarrowLayout && options.revealPane !== false) {
        pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
}

function setupSettingsSectionNav(){
  document.querySelectorAll('[data-settings-section-btn]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveSettingsSection(btn.dataset.settingsSectionBtn));
  });
  setActiveSettingsSection(activeSettingsSection, { preserveScroll: true });
}

function setupSettingsPaneDragScroll(){
  const pane = document.getElementById('settingsContentPane');
  if (!pane || pane.dataset.dragScrollBound === '1') return;
  pane.dataset.dragScrollBound = '1';

  const interactiveSelector = 'input, select, textarea, button, a, label, [contenteditable="true"], [draggable="true"], .btn, .change-log-list, .patch-notes-scroll';

  pane.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target?.closest?.(interactiveSelector)) return;

    settingsPaneDragState = {
      startY: e.clientY,
      startScrollTop: pane.scrollTop,
      moved: false,
    };
    pane.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!settingsPaneDragState) return;
    const deltaY = e.clientY - settingsPaneDragState.startY;
    if (Math.abs(deltaY) > 2) settingsPaneDragState.moved = true;
    pane.scrollTop = settingsPaneDragState.startScrollTop - deltaY;
    e.preventDefault();
  });

  document.addEventListener('mouseup', () => {
    if (!settingsPaneDragState) return;
    settingsPaneDragState = null;
    pane.classList.remove('dragging');
  });

  pane.addEventListener('mouseleave', () => {
    if (!settingsPaneDragState) pane.classList.remove('dragging');
  });
}

function updatePatchNotesOverflowAffordance(){
  const list = document.getElementById('changeLogList');
  if (!list) return;
  const hasOverflow = list.scrollHeight - list.clientHeight > 4;
  const hasTop = list.scrollTop > 2;
  const hasBottom = list.scrollTop + list.clientHeight < list.scrollHeight - 2;

  list.classList.toggle('has-overflow-top', !!hasOverflow && hasTop);
  list.classList.toggle('has-overflow-bottom', !!hasOverflow && hasBottom);
}

function renderChangeLog(){
  const section = document.getElementById('changeLogSection');
  const toggleBtn = document.getElementById('toggleChangeLogBtn');
  const el = document.getElementById('changeLogList');
  const moreBtn = document.getElementById('changeLogLoadMoreBtn');
  if (!section || !toggleBtn || !el) return;

  section.classList.toggle('is-hidden', !changeLogVisible);
  toggleBtn.textContent = changeLogVisible ? 'Hide Patch Notes' : 'Show Patch Notes';

  if (!changeLogVisible) {
    updatePatchNotesOverflowAffordance();
    return;
  }

  if (!state.changelog.length) {
    el.innerHTML = '<div class="note-meta">No patch notes yet.</div>';
    if (moreBtn) moreBtn.classList.add('is-hidden');
    updatePatchNotesOverflowAffordance();
    return;
  }

  const shown = state.changelog.slice(0, changeLogLimit);
  el.innerHTML = shown
    .map((c)=>`<div class="change-log-item"><strong>${new Date(c.ts).toLocaleString()}</strong><br/>${escapeHtml(c.message)}</div>`)
    .join('');

  if (moreBtn) {
    moreBtn.classList.toggle('is-hidden', state.changelog.length <= changeLogLimit);
  }
  updatePatchNotesOverflowAffordance();
}

themeController.bindSystemThemeListener();

function formatRemaining(ms){
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatUsdPrice(value){
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs === 0) return '$0';

  let digits = 2;
  if (abs >= 1000) digits = 0;
  else if (abs >= 1) digits = 2;
  else if (abs >= 0.01) digits = 4;
  else if (abs >= 0.0001) digits = 6;
  else digits = 8;

  const rounded = Number(n.toFixed(digits));
  if (rounded === 0 && n !== 0) {
    const floor = (1 / (10 ** digits)).toFixed(digits);
    return n < 0 ? `-$${floor}` : `<$${floor}`;
  }

  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatSignedUsd(value){
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n > 0) return `+${formatUsdPrice(n)}`;
  if (n < 0) return `-${formatUsdPrice(Math.abs(n))}`;
  return formatUsdPrice(0);
}

function playAlarmTone(){
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!alarmAudioCtx) alarmAudioCtx = new Ctx();
    const ctx = alarmAudioCtx;

    const nowT = ctx.currentTime;
    // Louder + longer multi-beep sequence (~3.2s)
    for (let i = 0; i < 8; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? 'square' : 'sine';
      osc.frequency.value = i % 2 === 0 ? 880 : 1046;
      const start = nowT + i * 0.4;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.32, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.34);
    }
  } catch {}
}

function updateAlarmStatus(){
  const el = document.getElementById('alarmStatus');
  if (!el) return;
  el.classList.remove('is-idle', 'is-active', 'is-done');
  if (!alarmEndTs) {
    el.textContent = 'No active timer';
    el.classList.add('is-idle');
    return;
  }
  const remaining = alarmEndTs - Date.now();
  if (remaining <= 0) {
    el.textContent = '⏰ Timer done! (repeating every 10s until canceled)';
    el.classList.add('is-done');
    alarmEndTs = null;
    if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
    playAlarmTone();
    if (alarmRepeatTimer) clearInterval(alarmRepeatTimer);
    alarmRepeatTimer = setInterval(playAlarmTone, 10 * 1000);
    return;
  }
  el.textContent = `Timer running: ${formatRemaining(remaining)} remaining`;
  el.classList.add('is-active');
}

function startAlarm(minutes){
  if (!minutes || minutes < 1) return;
  alarmEndTs = Date.now() + minutes * 60 * 1000;
  if (alarmTimer) clearInterval(alarmTimer);
  if (alarmRepeatTimer) { clearInterval(alarmRepeatTimer); alarmRepeatTimer = null; }
  alarmTimer = setInterval(updateAlarmStatus, 1000);
  updateAlarmStatus();
}

function cancelAlarm(){
  alarmEndTs = null;
  if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
  if (alarmRepeatTimer) { clearInterval(alarmRepeatTimer); alarmRepeatTimer = null; }
  updateAlarmStatus();
}

function renderDateTime(){
  const el = document.getElementById('dateTimeWidget');
  if (!el) return;
  const nowDt = new Date();
  const hour = nowDt.getHours();
  const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Night shift';
  const moodClass = hour < 5 ? 'is-midnight' : hour < 12 ? 'is-morning' : hour < 17 ? 'is-afternoon' : hour < 21 ? 'is-evening' : 'is-night';
  const timeParts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(nowDt);
  const timePart = (type) => timeParts.find((part) => part.type === type)?.value || '';
  const hourMinute = `${timePart('hour')}:${timePart('minute')}`;
  const seconds = timePart('second');
  const meridiem = timePart('dayPeriod');
  const weekdayLabel = nowDt.toLocaleDateString(undefined, { weekday: 'long' });
  const fullDateLabel = nowDt.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeZoneLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: LOCAL_TZ,
    timeZoneName: 'short',
  }).formatToParts(nowDt).find((part) => part.type === 'timeZoneName')?.value || 'Local';
  el.innerHTML = `
    <div class="date-time-hero ${moodClass}">
      <div class="date-time-kicker-row">
        <span class="date-time-kicker">${greeting}</span>
        <span class="date-time-chip">${timeZoneLabel}</span>
      </div>
      <div class="date-time-clock">
        <span class="date-time-hour-minute">${hourMinute}</span>
        <span class="date-time-seconds">:${seconds}</span>
        <span class="date-time-ampm">${meridiem}</span>
      </div>
      <div class="date-time-date-row">
        <span class="date-time-weekday">${weekdayLabel}</span>
        <span class="date-time-date">${fullDateLabel}</span>
      </div>
    </div>
  `;
  updateAlarmStatus();
}

function dateKey(d){
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function renderCalendar(){
  const el = document.getElementById('calendarWidget');
  if (!el) return;
  const nowDt = new Date();
  const year = nowDt.getFullYear();
  const month = nowDt.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = first.getDay();
  const days = last.getDate();
  const todayKey = dateKey(nowDt);

  if (!selectedCalendarDate) selectedCalendarDate = todayKey;

  const reminderDates = remindersController.reminderDateSet();
  const reminderDayCount = reminderDates.size;
  const heads = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-cell cal-head">${d}</div>`).join('');
  let cells = '';
  for (let i=0;i<start;i++) cells += '<div class="cal-cell cal-cell-empty">&nbsp;</div>';
  for (let d=1; d<=days; d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = key===todayKey;
    const isSel = key===selectedCalendarDate;
    const has = reminderDates.has(key);
    cells += `<div class="cal-cell ${isToday?'cal-today':''} ${isSel?'selected':''} ${has?'has-reminder':''}" data-date="${key}">${d}</div>`;
  }
  el.innerHTML = `
    <div class="calendar-v2-shell">
      <div class="calendar-v2-head">
        <div>
          <div class="calendar-month-label">${nowDt.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</div>
          <div class="calendar-month-subtitle">Pick a day to manage reminders.</div>
        </div>
        <div class="calendar-month-stats">
          <span class="calendar-stat-pill">${reminderDayCount} reminder ${reminderDayCount === 1 ? 'day' : 'days'}</span>
        </div>
      </div>
      <div class="calendar-grid">${heads}${cells}</div>
    </div>
  `;

  el.querySelectorAll('[data-date]').forEach((cell)=>{
    cell.addEventListener('click', ()=>{
      selectedCalendarDate = cell.dataset.date;
      renderCalendar();
      renderCalendarRemindersPanel();
    });
  });
}

function renderCalendarRemindersPanel(){
  return remindersController.renderCalendarPanel();
}

function renderTodayReminders(){
  return remindersController.renderToday();
}

function renderThemeChoices(){
  return themeController.renderChoices();
}

function renderSettings(){
  const theme = document.getElementById('settingTheme');
  const weather = document.getElementById('settingWeatherInterval');
  const col = document.getElementById('settingDefaultTaskColumn');
  const fs = document.getElementById('settingFullscreen');
  const rssInterval = document.getElementById('settingRssInterval');
  renderChangeLog();
  if (theme) theme.value = state.settings.theme;
  renderThemeChoices();
  if (weather) weather.value = String(state.settings.weatherIntervalMin);
  if (col) col.value = state.settings.defaultTaskColumn;
  if (fs) fs.checked = !!document.fullscreenElement;
  if (rssInterval) rssInterval.value = String(state.rss?.refreshIntervalMin || RSS_DEFAULT_REFRESH_MIN);

  tasksController.applyDefaultColumn();

  renderPodVisibilitySettings();
  mountRssSettingsFeeds();
  mountHomeDevicesSettingsEditor();
  if (settingsPanel?.classList.contains('open')) refreshStateSafetyBackups();
}

function renderWeatherSnapshot(snapshot, { stale = false, retryInMs = 0, fetchedAt = '' } = {}){
  const el = document.getElementById('weatherWidget');
  if (!el) return;
  const current = snapshot.weather?.current || {};
  const daily = snapshot.weather?.daily || {};
  const hi = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null;
  const lo = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null;
  const times = Array.isArray(daily.time) ? daily.time : [];
  const highs = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const lows = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const codes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
  const codeMap = {
    0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',
    45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
    61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
    80:'Rain showers',81:'Rain showers',82:'Heavy showers',95:'Thunderstorm'
  };
  const iconForCode = (code) => {
    if (code === 0) return '☀️';
    if ([1,2].includes(code)) return '🌤️';
    if (code === 3) return '☁️';
    if ([45,48].includes(code)) return '🌫️';
    if ([51,53,55,61,63,65,80,81,82].includes(code)) return '🌧️';
    if ([71,73,75].includes(code)) return '❄️';
    if (code === 95) return '⛈️';
    return '🌡️';
  };
  const forecast = times.slice(0, 3).map((d, i) => {
    const day = new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
    const code = Number(codes[i]);
    const c = codeMap[code] || 'Conditions';
    const h = highs[i] != null ? Math.round(highs[i]) : '--';
    const l = lows[i] != null ? Math.round(lows[i]) : '--';
    return `
      <div class="forecast-item date-forecast-item">
        <div class="forecast-day">${escapeText(day)}</div>
        <div class="forecast-icon">${escapeText(iconForCode(code))}</div>
        <div class="forecast-cond">${escapeText(c)}</div>
        <div class="forecast-temp">H ${h}° / L ${l}°</div>
      </div>
    `;
  }).join('');
  const desc = codeMap[current.weather_code] || 'Current conditions';

  el.innerHTML = `
    <div class="date-weather-shell">
      <div class="date-weather-current">
        <div class="date-weather-temp">${Math.round(current.temperature_2m ?? 0)}°</div>
        <div class="date-weather-summary">
          <div class="date-weather-condition">${escapeText(desc)}</div>
          <div class="date-weather-location">${escapeText(snapshot.location?.label || 'Local weather')}</div>
        </div>
      </div>
      <div class="date-weather-facts">
        <div class="date-weather-fact">
          <span>Feels like</span>
          <strong>${Math.round(current.apparent_temperature ?? 0)}°F</strong>
        </div>
        <div class="date-weather-fact">
          <span>Humidity</span>
          <strong>${escapeText(current.relative_humidity_2m ?? '--')}%</strong>
        </div>
        <div class="date-weather-fact">
          <span>Today</span>
          <strong>H ${hi != null ? Math.round(hi) : '--'}° / L ${lo != null ? Math.round(lo) : '--'}°</strong>
        </div>
      </div>
      <div class="date-weather-forecast-head">
        <strong>3-Day Forecast</strong>
        <span>Quick look ahead</span>
      </div>
      <div class="forecast-row date-weather-forecast">${forecast}</div>
    </div>
  `;
  const ts = document.getElementById('weatherUpdatedAt');
  if (stale) {
    const cachedAt = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : 'earlier';
    if (ts) ts.textContent = `Showing cached weather from ${cachedAt}; retry in ${Math.ceil(retryInMs / 1000)}s`;
    return;
  }
  if (ts) ts.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
}

async function renderWeather(options = {}){
  const el = document.getElementById('weatherWidget');
  if (!el) return;
  const manual = !!options.manual;
  const ts = document.getElementById('weatherUpdatedAt');
  const weatherBackoff = pollingBackoffState('weather').backoffUntil - Date.now();
  if (!manual && weatherBackoff > 0) {
    if (ts) ts.textContent = `Updated: waiting ${Math.ceil(weatherBackoff / 1000)}s before retry`;
    return;
  }
  try {
    const weatherApi = window.MissionControlModules?.weatherRefresh;
    if (!weatherApi?.fetchWeatherSnapshot) throw new Error('weather_refresh_module_unavailable');
    const cacheHit = options.useCached === true && weatherSnapshotCache.zip === LOCAL_ZIP && weatherSnapshotCache.snapshot;
    const snapshot = cacheHit
      ? weatherSnapshotCache.snapshot
      : await weatherApi.fetchWeatherSnapshot(LOCAL_ZIP, LOCAL_TZ);
    if (!cacheHit) {
      weatherSnapshotCache = { zip: LOCAL_ZIP, fetchedAt: now(), snapshot };
    }
    renderWeatherSnapshot(snapshot);
    clearPollingBackoff('weather');
  } catch (error) {
    const backoffMs = registerPollingFailure('weather', error, 'Weather service temporarily unavailable');
    const cached = weatherSnapshotCache.zip === LOCAL_ZIP && weatherSnapshotCache.snapshot;
    if (cached) {
      renderWeatherSnapshot(weatherSnapshotCache.snapshot, {
        stale: true,
        retryInMs: backoffMs,
        fetchedAt: weatherSnapshotCache.fetchedAt,
      });
      return;
    }
    el.textContent = 'Weather unavailable right now.';
    if (ts) ts.textContent = `Update delayed: retry in ${Math.ceil(backoffMs / 1000)}s`;
  }
}

function formatGasPriceValue(input){
  return gasPricesStateFeature.formatPrice(input);
}

function renderGasPricesView(){
  const widget = document.getElementById('gasPricesWidget');
  const meta = document.getElementById('gasPricesMeta');
  const locationInput = document.getElementById('gasLocationInput');
  if (!widget || !meta) return;

  const gas = state.gasPrices || {};
  if (locationInput && document.activeElement !== locationInput) {
    locationInput.value = String(gas.location || '');
  }

  const displayValues = {
    regular: gas.values?.regular || '',
    mid: gas.values?.mid || '',
    premium: gas.values?.premium || '',
    diesel: gas.values?.diesel || '',
  };

  const cards = [
    ['Regular', displayValues.regular],
    ['Mid', displayValues.mid],
    ['Premium', displayValues.premium],
    ['Diesel', displayValues.diesel],
  ].map(([label, value]) => `
    <div class="change-log-item gas-price-card">
      <div class="note-meta">${label}</div>
      <div class="gas-price-value">${escapeHtml(value || '—')}</div>
    </div>
  `).join('');

  widget.innerHTML = `<div class="gas-price-grid">${cards}</div>`;

  const parts = [];
  if (gas.resolvedLocation) parts.push(`Area: ${gas.resolvedLocation}`);
  if (gas.source === 'aaa-state-average') parts.push('Source: AAA state average');
  else parts.push('Source: manual override');
  if (gas.updatedAt) parts.push(`Updated: ${new Date(gas.updatedAt).toLocaleString()}`);
  if (gas.lastError && gas.updatedAt) parts.push('Showing last successful prices');
  if (gas.lastError) parts.push(`Auto fetch unavailable: ${gas.lastError}`);
  meta.textContent = parts.join(' · ');

  const manual = gas.manualValues || {};
  const manualFields = {
    regular: document.getElementById('gasManualRegular'),
    mid: document.getElementById('gasManualMid'),
    premium: document.getElementById('gasManualPremium'),
    diesel: document.getElementById('gasManualDiesel'),
  };
  Object.entries(manualFields).forEach(([key, input]) => {
    if (!input || document.activeElement === input) return;
    input.value = String(manual[key] || '');
  });

  if (gas.lastError) {
    setPodStatusSignal('gas-prices', gas.updatedAt ? 'degraded' : 'error', 'manual fallback');
  } else if (gas.updatedAt) {
    setPodStatusSignal('gas-prices', 'fresh');
  } else {
    setPodStatusSignal('gas-prices', 'neutral');
  }
}

async function fetchGasPricesAuto(locationInput = ''){
  const location = String(locationInput || state.gasPrices?.location || '').trim();
  if (!location) {
    state.gasPrices.lastError = 'Enter a ZIP or City, ST first.';
    renderGasPricesView();
    return;
  }

  state.gasPrices.location = location;
  const backoffMs = pollingBackoffState('gas-prices').backoffUntil - Date.now();
  if (backoffMs > 0) {
    state.gasPrices.lastError = `Retrying in ${Math.ceil(backoffMs / 1000)}s due to upstream throttling.`;
    renderGasPricesView();
    return;
  }

  setPodStatusSignal('gas-prices', 'neutral', 'fetching');

  try {
    const res = await fetch(`/api/gas-prices?location=${encodeURIComponent(location)}`);
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (!res.ok || !data?.ok || !data?.prices) {
      const fallbackMsg = raw && !data ? raw.slice(0, 140) : '';
      const err = new Error(data?.message || fallbackMsg || `Gas upstream failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    const normalized = gasPricesStateFeature.normalizePriceValues(data.prices);

    const hasAutoValue = Object.values(normalized).some(Boolean);
    if (!hasAutoValue) {
      throw new Error('No grade prices were returned from auto source.');
    }

    state.gasPrices.values = normalized;
    state.gasPrices.source = 'aaa-state-average';
    state.gasPrices.sourceUrl = String(data.sourceUrl || 'https://gasprices.aaa.com/');
    state.gasPrices.resolvedLocation = String(data.resolvedLocation || '');
    state.gasPrices.fetchedAt = now();
    state.gasPrices.updatedAt = now();
    state.gasPrices.lastError = '';

    clearPollingBackoff('gas-prices');
    save('gas_prices_auto_fetch');
  } catch (error) {
    const fallbackMs = registerPollingFailure('gas-prices', error, 'Gas price service temporarily unavailable');
    state.gasPrices.lastError = `${String(error?.message || 'Auto fetch unavailable').slice(0, 140)} (retry in ${Math.ceil(fallbackMs / 1000)}s)`;
    if (!state.gasPrices.updatedAt && state.gasPrices.manualUpdatedAt) {
      state.gasPrices.values = { ...(state.gasPrices.manualValues || {}) };
      state.gasPrices.source = 'manual';
      state.gasPrices.updatedAt = state.gasPrices.manualUpdatedAt;
    }
    save('gas_prices_auto_fetch_failed');
  }

  renderGasPricesView();
}

function saveGasPricesManual(){
  const fields = {
    regular: document.getElementById('gasManualRegular')?.value,
    mid: document.getElementById('gasManualMid')?.value,
    premium: document.getElementById('gasManualPremium')?.value,
    diesel: document.getElementById('gasManualDiesel')?.value,
  };

  const manual = gasPricesStateFeature.normalizePriceValues(fields);

  if (!Object.values(manual).some(Boolean)) {
    state.gasPrices.lastError = 'Enter at least one manual price to save.';
    renderGasPricesView();
    return;
  }

  state.gasPrices.manualValues = manual;
  state.gasPrices.values = { ...manual };
  state.gasPrices.source = 'manual';
  state.gasPrices.sourceUrl = '';
  state.gasPrices.updatedAt = now();
  state.gasPrices.manualUpdatedAt = state.gasPrices.updatedAt;
  state.gasPrices.lastError = '';

  save('gas_prices_manual_saved');
  renderGasPricesView();
}

function renderGasPricesPod(){
  renderPodWithFallback('gas-prices', renderGasPricesView);
}

function performEverydayCalculatorAction(type, payload = '', options = {}){
  const result = everydayCalculatorStateFeature.applyAction(state.everydayCalculator, type, payload);
  state.everydayCalculator = result.state;
  if (!result.changed) return;
  save('everyday_calculator_updated', { pushShared: options.pushShared !== false });
  if (!options.skipRender) renderEverydayCalculatorPod();
}

function updateEverydayCalculatorSummary(root, tipPercentRaw, taxPercentRaw){
  if (!root) return;
  state.everydayCalculator = normalizeEverydayCalculatorState(state.everydayCalculator);
  const calc = state.everydayCalculator;
  const { subtotal: safeSubtotal, tipAmount, taxAmount, finalTotal } = everydayCalculatorStateFeature.calculateSummary(
    calc,
    tipPercentRaw,
    taxPercentRaw,
  );

  const subtotalEl = root.querySelector('[data-calc-summary="subtotal"]');
  const taxEl = root.querySelector('[data-calc-summary="tax"]');
  const tipEl = root.querySelector('[data-calc-summary="tip"]');
  const finalEl = root.querySelector('[data-calc-summary="final"]');

  if (subtotalEl) subtotalEl.textContent = `$${safeSubtotal.toFixed(2)}`;
  if (taxEl) taxEl.textContent = `$${taxAmount.toFixed(2)}`;
  if (tipEl) tipEl.textContent = `$${tipAmount.toFixed(2)}`;
  if (finalEl) finalEl.textContent = `$${finalTotal.toFixed(2)}`;
}

function renderEverydayCalculatorPod(){
  const el = document.getElementById('everydayCalculatorWidget');
  if (!el) return;

  const priorRoot = el.querySelector('[data-pod="everyday-calculator"]');
  const activeElement = document.activeElement;
  const activeCalcInput = activeElement && typeof activeElement.closest === 'function'
    ? activeElement.closest('[data-calc-input]')
    : null;
  const activeCalcInputName = activeCalcInput ? String(activeCalcInput.dataset.calcInput || '').trim() : '';
  const activeCalcInputSelectionStart = typeof activeCalcInput?.selectionStart === 'number' ? activeCalcInput.selectionStart : null;
  const activeCalcInputSelectionEnd = typeof activeCalcInput?.selectionEnd === 'number' ? activeCalcInput.selectionEnd : null;
  const wasPodFocused = !!(priorRoot && activeElement && (activeElement === priorRoot || (typeof activeElement.closest === 'function' && activeElement.closest('[data-pod="everyday-calculator"]'))));

  state.everydayCalculator = normalizeEverydayCalculatorState(state.everydayCalculator);
  const calc = state.everydayCalculator;
  const { subtotal: safeSubtotal, tipAmount, taxAmount, finalTotal } = everydayCalculatorStateFeature.calculateSummary(
    calc,
    calc.tipPercent,
    calc.taxPercent,
  );

  el.innerHTML = `
    <div class="everyday-calculator" data-pod="everyday-calculator" tabindex="0" aria-label="Everyday Calculator">
      <div class="everyday-calculator-display" aria-live="polite">${escapeHtml(calc.display)}</div>
      <div class="everyday-calculator-grid" role="group" aria-label="Calculator keypad">
        <button class="btn ghost" data-calc-action="clear" type="button">C</button>
        <button class="btn ghost" data-calc-action="backspace" type="button">⌫</button>
        <button class="btn ghost" data-calc-action="operator" data-calc-value="/" type="button">÷</button>
        <button class="btn ghost" data-calc-action="operator" data-calc-value="*" type="button">×</button>

        <button class="btn" data-calc-action="digit" data-calc-value="7" type="button">7</button>
        <button class="btn" data-calc-action="digit" data-calc-value="8" type="button">8</button>
        <button class="btn" data-calc-action="digit" data-calc-value="9" type="button">9</button>
        <button class="btn ghost" data-calc-action="operator" data-calc-value="-" type="button">−</button>

        <button class="btn" data-calc-action="digit" data-calc-value="4" type="button">4</button>
        <button class="btn" data-calc-action="digit" data-calc-value="5" type="button">5</button>
        <button class="btn" data-calc-action="digit" data-calc-value="6" type="button">6</button>
        <button class="btn ghost" data-calc-action="operator" data-calc-value="+" type="button">+</button>

        <button class="btn" data-calc-action="digit" data-calc-value="1" type="button">1</button>
        <button class="btn" data-calc-action="digit" data-calc-value="2" type="button">2</button>
        <button class="btn" data-calc-action="digit" data-calc-value="3" type="button">3</button>
        <button class="btn everyday-calc-equals" data-calc-action="equals" type="button">=</button>

        <button class="btn everyday-calc-zero" data-calc-action="digit" data-calc-value="0" type="button">0</button>
        <button class="btn" data-calc-action="decimal" type="button">.</button>
      </div>
      <button class="btn ghost mt8" data-calc-action="toggle-tip-tax" type="button">${calc.tipPanelOpen ? 'Hide' : 'Show'} Tip/Tax</button>
      <div class="everyday-calc-tip-tax ${calc.tipPanelOpen ? '' : 'is-hidden'}">
        <div class="row-wrap mt8 gap10">
          <label>Tip % <input type="number" min="0" step="0.1" data-calc-input="tip-percent" value="${escapeHtml(calc.tipPercent)}" class="w-110" /></label>
          <label>Tax % <input type="number" min="0" step="0.1" data-calc-input="tax-percent" value="${escapeHtml(calc.taxPercent)}" class="w-110" /></label>
        </div>
        <div class="note-meta mt6">Tip is applied to subtotal only (before tax).</div>
        <div class="everyday-calc-summary mt8">
          <div><span>Subtotal</span><strong data-calc-summary="subtotal">$${safeSubtotal.toFixed(2)}</strong></div>
          <div><span>Tax</span><strong data-calc-summary="tax">$${taxAmount.toFixed(2)}</strong></div>
          <div><span>Tip</span><strong data-calc-summary="tip">$${tipAmount.toFixed(2)}</strong></div>
          <div class="is-total"><span>Final Total</span><strong data-calc-summary="final">$${finalTotal.toFixed(2)}</strong></div>
        </div>
      </div>
    </div>
  `;

  const root = el.querySelector('[data-pod="everyday-calculator"]');
  if (!root) return;

  root.onclick = (event) => {
    const button = getEventClosestTarget(event, '[data-calc-action]');
    if (!button) return;
    const action = String(button.dataset.calcAction || '').trim();
    const value = String(button.dataset.calcValue || '').trim();
    performEverydayCalculatorAction(action, value);
  };

  root.oninput = (event) => {
    const input = getEventClosestTarget(event, '[data-calc-input]');
    if (!input) return;
    const action = String(input.dataset.calcInput || '').trim();
    performEverydayCalculatorAction(action, input.value, { skipRender: true, pushShared: false });

    const tipInput = root.querySelector('[data-calc-input="tip-percent"]');
    const taxInput = root.querySelector('[data-calc-input="tax-percent"]');
    updateEverydayCalculatorSummary(root, tipInput?.value, taxInput?.value);
  };

  root.onchange = (event) => {
    const input = getEventClosestTarget(event, '[data-calc-input]');
    if (!input) return;
    save('everyday_calculator_input_commit');
  };

  root.onkeydown = (event) => {
    const isTypingContext = !!getEventClosestTarget(event, 'input, textarea, [contenteditable=""], [contenteditable="true"], [data-calc-input]');
    const activeElement = document.activeElement;
    const calcInputFocused = !!(activeElement && typeof activeElement.closest === 'function' && activeElement.closest('[data-calc-input]'));
    if (isTypingContext || calcInputFocused) return;

    const k = event.key;
    if (/^[0-9]$/.test(k)) {
      event.preventDefault();
      performEverydayCalculatorAction('digit', k);
      return;
    }
    if (k === '.') {
      event.preventDefault();
      performEverydayCalculatorAction('decimal');
      return;
    }
    if (['+', '-', '*', '/'].includes(k)) {
      event.preventDefault();
      performEverydayCalculatorAction('operator', k);
      return;
    }
    if (k === 'Enter' || k === '=') {
      event.preventDefault();
      performEverydayCalculatorAction('equals');
      return;
    }
    if (k === 'Backspace') {
      event.preventDefault();
      performEverydayCalculatorAction('backspace');
      return;
    }
    if (k === 'Escape' || k.toLowerCase() === 'c' || k === 'Delete') {
      event.preventDefault();
      performEverydayCalculatorAction('clear');
    }
  };

  if (activeCalcInputName) {
    const refreshedInput = root.querySelector(`[data-calc-input="${activeCalcInputName}"]`);
    if (refreshedInput) {
      refreshedInput.focus({ preventScroll: true });
      const canRestoreSelection = typeof refreshedInput.setSelectionRange === 'function'
        && typeof activeCalcInputSelectionStart === 'number'
        && typeof activeCalcInputSelectionEnd === 'number';
      if (canRestoreSelection) {
        try {
          refreshedInput.setSelectionRange(activeCalcInputSelectionStart, activeCalcInputSelectionEnd);
        } catch (_) {
          // Number inputs may not support selection restoration in all browsers.
        }
      }
    }
  } else if (wasPodFocused) {
    root.focus({ preventScroll: true });
  }

  setPodStatusSignal('everyday-calculator', 'fresh', 'ready');
}

function estDateYmdCompact(){
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LOCAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}${get('month')}${get('day')}`;
}

function normalizeNbaEvent(event, favoriteTeams = new Set()){
  return nbaScoreStateFeature.normalizeEvent(event, favoriteTeams);
}

function compareNbaGames(a, b){
  return nbaScoreStateFeature.compareGames(a, b);
}

function pickFeaturedNbaGame(games, viewMode){
  return nbaScoreStateFeature.pickFeaturedGame(games, viewMode);
}

function filterNbaGamesByView(games, viewMode){
  return nbaScoreStateFeature.filterGamesByView(games, viewMode);
}

function renderNbaFavoriteTeamOptions(selectedTeams){
  const selected = new Set(selectedTeams);
  const options = NBA_TEAM_OPTIONS.filter((team) => !selected.has(team.abbr));
  return options.map((team) => `<option value="${escapeHtml(team.abbr)}">${escapeHtml(team.name)}</option>`).join('');
}

function renderNbaSummaryChips(games){
  const liveCount = games.filter((game) => game.statusBucket === 'live').length;
  const upcomingCount = games.filter((game) => game.statusBucket === 'upcoming').length;
  const finalCount = games.filter((game) => game.statusBucket === 'final').length;
  return `
    <span class="nba-summary-chip nba-summary-chip--live">${liveCount} live</span>
    <span class="nba-summary-chip">${upcomingCount} upcoming</span>
    <span class="nba-summary-chip">${finalCount} final</span>
  `;
}

function renderNbaControls(games){
  const currentView = state.nba?.viewMode || 'live';
  const favoriteTeams = state.nba?.favoriteTeams || [];
  const favoriteChips = favoriteTeams.length
    ? favoriteTeams.map((team) => `<button class="nba-favorite-chip" type="button" data-nba-favorite-remove="${escapeHtml(team)}">${escapeHtml(team)} <span aria-hidden="true">×</span></button>`).join('')
    : '<span class="note-meta">No favorite teams yet.</span>';
  const viewOptions = [
    ['my-teams', 'My Teams'],
    ['live', 'Live'],
    ['all', 'All'],
    ['recap', 'Recap'],
  ].map(([value, label]) => `<button class="nba-view-tab${currentView === value ? ' is-active' : ''}" type="button" data-nba-view="${value}">${label}</button>`).join('');
  const addOptions = renderNbaFavoriteTeamOptions(favoriteTeams);
  return `
    <div class="nba-v2-controls">
      <div class="nba-v2-topline">
        <div class="nba-v2-summary">${renderNbaSummaryChips(games)}</div>
        <div class="nba-view-tabs">${viewOptions}</div>
      </div>
      <div class="nba-favorites-row">
        <div class="nba-favorite-chips">${favoriteChips}</div>
        <div class="nba-favorite-add">
          <select id="nbaFavoriteTeamSelect">
            <option value="">Add team...</option>
            ${addOptions}
          </select>
          <button class="btn ghost" type="button" data-nba-favorite-add>Add</button>
        </div>
      </div>
    </div>
  `;
}

function renderNbaActionLinks(game){
  const actions = [];
  const add = (url, label) => {
    const safe = safeExternalUrl(url);
    if (safe) actions.push(`<a class="btn ghost" href="${escapeAttribute(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  };
  add(game.actions.gamecast, 'Gamecast');
  add(game.actions.boxScore, 'Box Score');
  if (game.statusBucket === 'final') add(game.actions.recap, 'Recap');
  else if (game.statusBucket === 'live') add(game.actions.playByPlay, 'Play-by-Play');
  return actions.slice(0, 3).join('');
}

function renderNbaTeamLine(team, emphasis = ''){
  const score = team.score == null ? '—' : String(team.score);
  return `
    <div class="nba-team-line ${emphasis}">
      <div class="nba-team-ident">
        ${safeMediaUrl(team.logo) ? `<img class="nba-team-logo" src="${escapeAttribute(safeMediaUrl(team.logo))}" alt="${escapeAttribute(team.name)} logo" loading="lazy" />` : '<span class="nba-team-logo nba-team-logo--placeholder"></span>'}
        <div>
          <div class="nba-team-name">${escapeHtml(team.abbr)}</div>
          <div class="nba-team-record">${escapeHtml(team.record || team.name)}</div>
        </div>
      </div>
      <div class="nba-team-score">${escapeHtml(score)}</div>
    </div>
  `;
}

function renderNbaGameCard(game, { featured = false } = {}){
  const badgeLabel = game.statusBucket === 'live' ? 'LIVE' : (game.statusBucket === 'final' ? 'FINAL' : 'UPCOMING');
  const tags = game.tags.length
    ? `<div class="nba-game-tags">${game.tags.map((tag) => `<span class="nba-game-tag nba-game-tag--${escapeHtml(tag.tone || 'neutral')}">${escapeHtml(tag.label || '')}</span>`).join('')}</div>`
    : '';
  const headline = game.headline ? `<div class="nba-game-headline">${escapeHtml(game.headline)}</div>` : '';
  const metaBits = [game.statusText, game.broadcastLabel && `On ${game.broadcastLabel}`].filter(Boolean);
  const leaderBits = [game.away.leaderText, game.home.leaderText].filter(Boolean).slice(0, 2);
  return `
    <article class="nba-game-card${featured ? ' nba-game-card--featured' : ''}">
      <div class="nba-game-card-head">
        <div>
          <div class="nba-game-shortname">${escapeHtml(game.shortName)}</div>
          <div class="nba-game-meta">${escapeHtml(metaBits.join(' · '))}</div>
        </div>
        <span class="badge nba-game-badge nba-game-badge--${game.statusBucket}">${badgeLabel}</span>
      </div>
      ${tags}
      <div class="nba-scoreboard">
        ${renderNbaTeamLine(game.away, game.away.winner ? 'is-winning' : '')}
        ${renderNbaTeamLine(game.home, game.home.winner ? 'is-winning' : '')}
      </div>
      ${headline}
      ${leaderBits.length ? `<div class="nba-game-leaders">${leaderBits.map((text) => `<div>${escapeHtml(text)}</div>`).join('')}</div>` : ''}
      <div class="nba-game-actions">${renderNbaActionLinks(game)}</div>
    </article>
  `;
}

function renderNbaScoreboard(parsedScoreboard, { stale = false, retryInMs = 0, fetchedAt = '' } = {}){
  const el = document.getElementById('nbaScoresWidget');
  if (!el) return;

  const events = parsedScoreboard.events;
  const favoriteTeams = new Set(state.nba?.favoriteTeams || []);
  const normalizedGames = events.map((event) => normalizeNbaEvent(event, favoriteTeams))
    .sort(compareNbaGames);
  const filteredGames = filterNbaGamesByView(normalizedGames, state.nba?.viewMode || 'live');
  const featuredGame = filteredGames.length ? pickFeaturedNbaGame(filteredGames, state.nba?.viewMode || 'live') : null;
  const restGames = filteredGames.filter((game) => game.id !== featuredGame?.id);
  const emptyMessage = events.length === 0
    ? 'No NBA games scheduled for today.'
    : ((state.nba?.viewMode === 'my-teams' && !(state.nba?.favoriteTeams || []).length)
        ? 'Pick a few favorite teams to unlock a personal scoreboard.'
        : `No games match the ${state.nba?.viewMode === 'live' ? 'Live' : state.nba?.viewMode === 'recap' ? 'Recap' : 'My Teams'} view right now.`);

  const summaryMarkup = renderNbaControls(normalizedGames);
  const featuredMarkup = featuredGame
    ? `<section class="nba-featured-block">
        <div class="nba-section-title">Featured Matchup</div>
        ${renderNbaGameCard(featuredGame, { featured: true })}
      </section>`
    : '';
  const listMarkup = restGames.length
    ? `<section class="nba-games-block">
        <div class="nba-section-title">${state.nba?.viewMode === 'recap' ? 'Game Recaps' : state.nba?.viewMode === 'my-teams' ? 'My Team Games' : state.nba?.viewMode === 'live' ? 'Live Games' : 'Full Slate'}</div>
        <div class="nba-v2-list">
          ${restGames.map((game) => renderNbaGameCard(game)).join('')}
        </div>
      </section>`
    : (featuredGame ? '' : `<div class="note-meta nba-empty-state">${escapeHtml(emptyMessage)}</div>`);

  el.innerHTML = `<div class="scroll-box nba-scroll nba-v2-shell">${summaryMarkup}${featuredMarkup}${listMarkup}</div>`;
  const liveCount = normalizedGames.filter((game) => game.statusBucket === 'live').length;
  const ts = document.getElementById('nbaUpdatedAt');
  if (stale) {
    setPodStatusSignal('nba-scores', 'stale', `retry ${Math.ceil(retryInMs / 1000)}s`);
    if (ts) {
      const cachedAt = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : 'earlier';
      ts.textContent = `Showing cached scores from ${cachedAt}; retry in ${Math.ceil(retryInMs / 1000)}s`;
    }
    return;
  }
  setPodStatusSignal('nba-scores', 'fresh', liveCount ? `${liveCount} live` : 'today');
  if (ts) ts.textContent = `Updated: ${new Date().toLocaleTimeString()} (auto: every 1 min)`;
}

async function renderNbaScores(options = {}){
  const el = document.getElementById('nbaScoresWidget');
  if (!el) return;

  const manual = !!options.manual;
  const ts = document.getElementById('nbaUpdatedAt');
  const nbaBackoff = pollingBackoffState('nba-scores').backoffUntil - Date.now();
  if (!manual && nbaBackoff > 0) {
    if (ts) ts.textContent = `Updated: waiting ${Math.ceil(nbaBackoff / 1000)}s before retry`;
    return;
  }

  try {
    const dateKey = estDateYmdCompact();
    const scoreboardApi = window.MissionControlModules?.nbaScoreboard;
    const cacheHit = options.useCached === true && nbaScoreboardCache.dateKey === dateKey && nbaScoreboardCache.data;
    let data = nbaScoreboardCache.data;
    let parsedScoreboard = null;
    if (cacheHit) {
      parsedScoreboard = scoreboardApi?.parseNbaScoreboard(data);
    } else {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateKey}`;
      if (scoreboardApi?.fetchNbaScoreboard) {
        const result = await scoreboardApi.fetchNbaScoreboard(url);
        data = result.payload;
        parsedScoreboard = result.parsed;
      } else {
        const res = await fetch(url);
        if (!res.ok) {
          const err = new Error(`NBA upstream failed (${res.status})`);
          err.status = res.status;
          throw err;
        }
        data = await res.json();
        parsedScoreboard = scoreboardApi?.parseNbaScoreboard(data);
      }
    }

    if (!parsedScoreboard?.ok) {
      const error = new Error(parsedScoreboard?.errorCode || 'nba_scoreboard_parser_required_fields_missing');
      error.code = parsedScoreboard?.errorCode || 'nba_scoreboard_parser_required_fields_missing';
      throw error;
    }
    if (!cacheHit) {
      nbaScoreboardCache = { dateKey, fetchedAt: now(), data };
    }
    renderNbaScoreboard(parsedScoreboard);
    clearPollingBackoff('nba-scores');
  } catch (error) {
    const backoffMs = registerPollingFailure('nba-scores', error, 'NBA feed temporarily unavailable');
    const cached = nbaScoreboardCache.dateKey === estDateYmdCompact() && nbaScoreboardCache.data;
    const parsedCached = cached && window.MissionControlModules?.nbaScoreboard?.parseNbaScoreboard(nbaScoreboardCache.data);
    if (parsedCached?.ok) {
      renderNbaScoreboard(parsedCached, {
        stale: true,
        retryInMs: backoffMs,
        fetchedAt: nbaScoreboardCache.fetchedAt,
      });
      return;
    }
    el.innerHTML = `<div class="note-meta nba-empty-state">NBA scores unavailable right now.</div>`;
    setPodStatusSignal('nba-scores', 'stale', `retry ${Math.ceil(backoffMs / 1000)}s`);
    if (ts) ts.textContent = `Update delayed: retry in ${Math.ceil(backoffMs / 1000)}s`;
  }
}

async function getCoinDirectory(force = false){
  const nowTs = Date.now();

  if (!force) {
    try {
      const raw = localStorage.getItem(CRYPTO_DIR_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.updatedAt && Array.isArray(parsed?.coins)) {
          const age = nowTs - Number(parsed.updatedAt);
          if (age < CRYPTO_DIR_CACHE_MAX_AGE_MS) {
            coinDirectory = parsed.coins;
            return coinDirectory;
          }
        }
      }
    } catch {}
  }

  const res = await fetch(`${CRYPTO_PROXY_API}/coins/list?include_platform=false`);
  const coins = await res.json();
  coinDirectory = Array.isArray(coins) ? coins : [];

  try {
    localStorage.setItem(CRYPTO_DIR_CACHE_KEY, JSON.stringify({ updatedAt: nowTs, coins: coinDirectory }));
  } catch {}

  return coinDirectory;
}

const CRYPTO_PROVIDER_CHAIN = ['coincap', 'coingecko', 'cryptocompare'];
const CRYPTO_PROVIDER_LABELS = {
  coingecko: 'CoinGecko',
  coincap: 'CoinCap',
  cryptocompare: 'CryptoCompare',
};
const CRYPTO_PROVIDER_DEFAULT = 'coincap';
const CRYPTO_PROVIDER_PREFERRED_FALLBACK = 'coingecko';
const CRYPTO_PROVIDER_RETRY_COUNT = 1;
const CRYPTO_PROVIDER_RETRY_BASE_MS = 500;
const CRYPTO_PROVIDER_RETRY_MAX_MS = 2200;
const CRYPTO_PROVIDER_OPERATION_TIMEOUT_MS = 12000;
const CRYPTO_PROVIDER_ATTEMPT_TIMEOUT_MS = 4500;
const CRYPTO_PROVIDER_UNHEALTHY_COOLDOWN_MS = 30000;

const CRYPTO_SYMBOL_ALIASES = {
  btc: 'bitcoin',
  xbt: 'bitcoin',
  eth: 'ethereum',
  doge: 'dogecoin',
  sol: 'solana',
  matic: 'polygon',
  wmatic: 'polygon',
  avax: 'avalanche-2',
  link: 'chainlink',
  dot: 'polkadot',
  ltc: 'litecoin',
  xrp: 'ripple',
  bch: 'bitcoin-cash',
  uni: 'uniswap',
  atom: 'cosmos',
  etc: 'ethereum-classic',
};

let activeCryptoProvider = CRYPTO_PROVIDER_DEFAULT;
let cryptoLastSuccessAt = '';
let cryptoLastSuccessProvider = CRYPTO_PROVIDER_DEFAULT;

function mapCoinIdToSymbolMap(){
  const m = new Map();
  for (const c of coinDirectory) {
    const id = String(c?.id || '').toLowerCase();
    const sym = String(c?.symbol || '').toUpperCase();
    if (id && sym) m.set(id, sym);
  }
  return m;
}

function resolveCoinId(query){
  const qRaw = String(query || '').trim().toLowerCase();
  if (!qRaw) return null;

  // Normalize common ticker prefixes users type (e.g., ticker symbols with leading punctuation)
  const q = qRaw.replace(/^[^a-z0-9]+/, '');

  const aliasId = CRYPTO_SYMBOL_ALIASES[q] || CRYPTO_SYMBOL_ALIASES[qRaw];
  if (aliasId) return aliasId;

  // Prefer canonical symbol mapping first so short tickers like "doge" resolve to top-market-cap coin.
  if (q && topSymbolMap.has(q)) return topSymbolMap.get(q);

  // exact id
  const exactId = coinDirectory.find((c) => String(c.id || '').toLowerCase() === qRaw || String(c.id || '').toLowerCase() === q);
  if (exactId) return exactId.id;

  // exact symbol
  const exactSymbol = coinDirectory.find((c) => String(c.symbol || '').toLowerCase() === qRaw || String(c.symbol || '').toLowerCase() === q);
  if (exactSymbol) return exactSymbol.id;

  // exact name
  const exactName = coinDirectory.find((c) => String(c.name || '').toLowerCase() === qRaw || String(c.name || '').toLowerCase() === q);
  if (exactName) return exactName.id;

  // partial fallback
  const partial = coinDirectory.find((c) => {
    const sym = String(c.symbol || '').toLowerCase();
    const name = String(c.name || '').toLowerCase();
    const id = String(c.id || '').toLowerCase();
    return sym.includes(q) || name.includes(q) || id.includes(q) || sym.includes(qRaw) || name.includes(qRaw) || id.includes(qRaw);
  });
  return partial?.id || null;
}

function findCoinMatches(query, limit = 5){
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const c of coinDirectory) {
    const sym = String(c.symbol || '').toLowerCase();
    const name = String(c.name || '').toLowerCase();
    const id = String(c.id || '').toLowerCase();
    if (sym.startsWith(q) || name.startsWith(q) || id.startsWith(q) || sym.includes(q) || name.includes(q) || id.includes(q)) {
      out.push(c);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function getCryptoWatchCache(){
  try {
    const raw = localStorage.getItem(CRYPTO_WATCH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.updatedAt || !Array.isArray(parsed?.watch)) return null;
    if (!parsed.provider) parsed.provider = 'coincap';
    return parsed;
  } catch {
    return null;
  }
}

function setCryptoWatchCache(payload){
  try {
    localStorage.setItem(CRYPTO_WATCH_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

function normalizeCryptoProviderChain(chain){
  const allowed = new Set(Object.keys(CRYPTO_PROVIDER_LABELS));
  const ordered = [];

  const add = (provider) => {
    const key = String(provider || '').toLowerCase();
    if (!allowed.has(key) || ordered.includes(key)) return;
    ordered.push(key);
  };

  add(CRYPTO_PROVIDER_DEFAULT);
  add(CRYPTO_PROVIDER_PREFERRED_FALLBACK);
  for (const provider of Array.isArray(chain) ? chain : []) add(provider);
  for (const provider of CRYPTO_PROVIDER_CHAIN) add(provider);

  return ordered;
}

function getCryptoProviderChain(){
  return normalizeCryptoProviderChain(CRYPTO_PROVIDER_CHAIN);
}

function setPodStatusSignal(podId, status = 'neutral', detail = ''){
  const el = document.getElementById(`${podId}StatusSignal`);
  if (!el) return;
  const normalized = String(status || 'neutral').toLowerCase();
  const allowed = new Set(['neutral', 'fresh', 'stale', 'degraded', 'error']);
  const mode = allowed.has(normalized) ? normalized : 'neutral';
  const labelMap = {
    neutral: 'Ready',
    fresh: 'Fresh',
    stale: 'Stale',
    degraded: 'Degraded',
    error: 'Error',
  };
  const iconMap = {
    fresh: '✓',
    stale: '◔',
    degraded: '⚠',
    error: '⨯',
  };

  const message = detail ? `${labelMap[mode]} · ${detail}` : labelMap[mode];
  el.className = `badge pod-signal pod-signal-${mode}`;
  el.setAttribute('aria-label', message);

  const nodes = [];
  const icon = iconMap[mode];
  if (icon) {
    const iconEl = document.createElement('span');
    iconEl.className = 'pod-signal-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;
    nodes.push(iconEl);
  }

  const labelEl = document.createElement('span');
  labelEl.className = 'pod-signal-label';
  labelEl.textContent = message;
  nodes.push(labelEl);

  el.replaceChildren(...nodes);
}

function formatLastSuccessMeta(lastSuccessAt, provider){
  if (!lastSuccessAt) return 'Last success: none yet';
  const providerLabel = CRYPTO_PROVIDER_LABELS[String(provider || '').toLowerCase()] || provider || 'Unknown';
  return `Last success: ${new Date(lastSuccessAt).toLocaleTimeString()} · Source: ${providerLabel}`;
}

function isCacheStale(updatedAt, maxAgeMs = CRYPTO_WATCH_CACHE_MAX_AGE_MS){
  const ts = Number(updatedAt || 0);
  if (!Number.isFinite(ts) || ts <= 0) return true;
  return Date.now() - ts > maxAgeMs;
}

function isTransientPollingFailure(error){
  const status = Number(error?.status || 0);
  if (status && TRANSIENT_UPSTREAM_STATUS.has(status)) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('network')
    || msg.includes('timeout')
    || msg.includes('temporar')
    || msg.includes('upstream')
    || msg.includes('failed to fetch')
    || msg.includes('fetch failed');
}

function pollingBackoffState(podId){
  return pollingFailureState[podId] || (pollingFailureState[podId] = { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' });
}

function clearPollingBackoff(podId){
  const slot = pollingBackoffState(podId);
  slot.count = 0;
  slot.backoffUntil = 0;
}

function registerPollingFailure(podId, error, reasonForUser){
  const slot = pollingBackoffState(podId);
  slot.count += 1;
  const backoffMs = Math.min(POLLING_BACKOFF_BASE_MS * (2 ** (slot.count - 1)), POLLING_BACKOFF_MAX_MS);
  slot.backoffUntil = Date.now() + backoffMs;

  if (isTransientPollingFailure(error)) {
    const nowTs = Date.now();
    const reason = String(reasonForUser || error?.message || 'Transient upstream failure').slice(0, 180);
    if ((nowTs - slot.lastLogAt >= POLLING_DIAG_LOG_MIN_MS) || slot.lastReason !== reason) {
      slot.lastLogAt = nowTs;
      slot.lastReason = reason;
      console.warn(`[${podId}] transient upstream fetch failure (backoff ${Math.ceil(backoffMs / 1000)}s): ${reason}`);
    }
  }

  return backoffMs;
}

function formatCryptoError(error){
  const status = Number(error?.status || 0);
  if (status === 429) return 'Rate limited (429)';
  if (status === 401 || status === 403) return 'API access denied';
  if (status >= 500) {
    const providerLabel = CRYPTO_PROVIDER_LABELS[String(error?.provider || '').toLowerCase()] || 'Provider';
    return `${providerLabel} server error (${status})`;
  }
  if (status >= 400) return `Request failed (${status})`;
  if (error?.name === 'AbortError') return 'Request timed out';
  return 'Network/API error';
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000, externalSignal = null){
  const controller = new AbortController();
  const onAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onAbort();
  else externalSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
  }
}

async function postJsonWithTimeout(url, payload, timeoutMs = 12000){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {}
    }
    if (!res.ok) {
      const err = new Error(String(data?.message || `HTTP ${res.status}`));
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function cryptoProviderError(provider, error){
  if (error && typeof error === 'object') {
    error.provider = provider;
    return error;
  }
  const wrapped = new Error(String(error || 'Provider error'));
  wrapped.provider = provider;
  return wrapped;
}

async function fetchTopSymbolMapWithFailover(){
  const nextMap = new Map();
  let lastErr = null;

  for (const provider of ['coingecko', 'coincap']) {
    try {
      if (provider === 'coingecko') {
        const topMapCoins = await fetchJsonWithTimeout(`${CRYPTO_PROXY_API}/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false`);
        if (Array.isArray(topMapCoins)) {
          for (const c of topMapCoins) {
            const sym = String(c.symbol || '').toLowerCase();
            const id = String(c.id || '').toLowerCase();
            if (sym && id && !nextMap.has(sym)) nextMap.set(sym, id);
          }
        }
      } else {
        const topAssets = await fetchJsonWithTimeout(`${CRYPTO_PROXY_API}/coincap/assets?limit=300`);
        const assets = Array.isArray(topAssets?.data) ? topAssets.data : [];
        for (const a of assets) {
          const sym = String(a?.symbol || '').toLowerCase();
          const id = resolveCoinId(a?.id || a?.name || sym);
          if (sym && id && !nextMap.has(sym)) nextMap.set(sym, id);
        }
      }

      if (nextMap.size) {
        topSymbolMap = nextMap;
        return;
      }
    } catch (error) {
      lastErr = cryptoProviderError(provider, error);
    }
  }

  if (lastErr) throw lastErr;
}

async function fetchWatchFromCoinGecko(watchIds, { signal } = {}){
  if (!watchIds.length) return [];
  const watchUrl = `${CRYPTO_PROXY_API}/coingecko/coins/markets?vs_currency=usd&ids=${encodeURIComponent(watchIds.join(','))}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
  const watchRes = await fetchJsonWithTimeout(watchUrl, 12000, signal);
  const watch = Array.isArray(watchRes) ? watchRes : [];
  return watch.map((c) => ({
    id: String(c.id || '').toLowerCase(),
    symbol: String(c.symbol || '').toLowerCase(),
    name: c.name || c.id || '',
    current_price: Number(c.current_price || 0),
    price_change_percentage_24h: Number(c.price_change_percentage_24h || 0),
    market_cap: Number(c.market_cap || 0),
  }));
}

async function fetchWatchFromCoinCap(watchIds, { signal } = {}){
  if (!watchIds.length) return [];
  const idToSymbol = mapCoinIdToSymbolMap();
  const symbols = [...new Set(watchIds.map((id) => idToSymbol.get(id)).filter(Boolean))];
  if (!symbols.length) return [];

  const assetsRes = await fetchJsonWithTimeout(`${CRYPTO_PROXY_API}/coincap/assets?limit=2000`, 12000, signal);
  const assets = Array.isArray(assetsRes?.data) ? assetsRes.data : [];
  const symbolSet = new Set(symbols.map((s) => String(s || '').toUpperCase()));
  const bySymbol = new Map();
  for (const a of assets) {
    const sym = String(a?.symbol || '').toUpperCase();
    if (!sym || !symbolSet.has(sym) || bySymbol.has(sym)) continue;
    bySymbol.set(sym, a);
  }

  const out = [];
  for (const id of watchIds) {
    const sym = idToSymbol.get(id);
    if (!sym) continue;
    const a = bySymbol.get(sym);
    if (!a) continue;
    const change24 = Number(a?.changePercent24Hr || 0);
    out.push({
      id,
      symbol: sym.toLowerCase(),
      name: a?.name || id,
      current_price: Number(a?.priceUsd || 0),
      price_change_percentage_24h: Number.isFinite(change24) ? change24 : 0,
      market_cap: Number(a?.marketCapUsd || 0),
    });
  }
  return out;
}

async function fetchWatchFromCryptoCompare(watchIds, { signal } = {}){
  if (!watchIds.length) return [];
  const idToSymbol = mapCoinIdToSymbolMap();
  const symbols = [...new Set(watchIds.map((id) => idToSymbol.get(id)).filter(Boolean))];
  if (!symbols.length) return [];

  const fsyms = symbols.join(',');
  const priceUrl = `${CRYPTO_PROXY_API}/cryptocompare/data/pricemultifull?fsyms=${encodeURIComponent(fsyms)}&tsyms=USD`;
  const res = await fetchJsonWithTimeout(priceUrl, 12000, signal);
  const raw = res?.RAW || {};

  const out = [];
  for (const id of watchIds) {
    const sym = idToSymbol.get(id);
    if (!sym) continue;
    const usd = raw?.[sym]?.USD;
    if (!usd) continue;
    out.push({
      id,
      symbol: sym.toLowerCase(),
      name: usd?.FROMSYMBOL || sym,
      current_price: Number(usd?.PRICE || 0),
      price_change_percentage_24h: Number(usd?.CHANGEPCT24HOUR || 0),
      market_cap: Number(usd?.MKTCAP || 0),
    });
  }
  return out;
}

async function fetchCryptoWatchWithFailover(watchIds, options = {}){
  const providerChain = getCryptoProviderChain();
  const failoverApi = window?.MissionControlModules?.cryptoFailover;
  if (!failoverApi?.fetchWithFailover) {
    let lastErr = null;
    for (const provider of providerChain) {
      try {
        let watch = [];
        if (provider === 'coingecko') watch = await fetchWatchFromCoinGecko(watchIds);
        else if (provider === 'coincap') watch = await fetchWatchFromCoinCap(watchIds);
        else if (provider === 'cryptocompare') watch = await fetchWatchFromCryptoCompare(watchIds);
        if (watchIds.length && !watch.length) throw cryptoProviderError(provider, new Error('Empty watchlist response'));
        return { provider, watch, attempts: 1, errors: [] };
      } catch (error) {
        lastErr = cryptoProviderError(provider, error);
      }
    }
    throw lastErr || new Error('All crypto providers failed');
  }

  const result = await failoverApi.fetchWithFailover({
    providers: providerChain,
    retries: CRYPTO_PROVIDER_RETRY_COUNT,
    backoffBaseMs: CRYPTO_PROVIDER_RETRY_BASE_MS,
    backoffMaxMs: CRYPTO_PROVIDER_RETRY_MAX_MS,
    operationTimeoutMs: CRYPTO_PROVIDER_OPERATION_TIMEOUT_MS,
    attemptTimeoutMs: CRYPTO_PROVIDER_ATTEMPT_TIMEOUT_MS,
    unhealthyCooldownMs: CRYPTO_PROVIDER_UNHEALTHY_COOLDOWN_MS,
    signal: options.signal,
    isRetryableError(error){
      return failoverApi.defaultIsRetryableError(error);
    },
    async tryProvider(provider, _attempt, { signal } = {}){
      if (provider === 'coingecko') return fetchWatchFromCoinGecko(watchIds, { signal });
      if (provider === 'coincap') return fetchWatchFromCoinCap(watchIds, { signal });
      if (provider === 'cryptocompare') return fetchWatchFromCryptoCompare(watchIds, { signal });
      throw new Error(`Unknown provider: ${provider}`);
    },
    shouldAcceptResult(watch){
      return !watchIds.length || (Array.isArray(watch) && watch.length > 0);
    },
  });

  return { provider: result.provider, watch: result.result, attempts: result.attempts, errors: result.errors };
}

function updateCryptoRefreshButton(){
  const btn = document.getElementById('cryptoRefreshBtn');
  if (!btn) return;
  const leftMs = cryptoRefreshCooldownUntil - Date.now();
  if (leftMs > 0) {
    btn.disabled = true;
    btn.textContent = `Refresh (${Math.ceil(leftMs / 1000)}s)`;
    return;
  }
  btn.disabled = false;
  btn.textContent = 'Refresh';
  if (cryptoRefreshCooldownTimer) {
    clearInterval(cryptoRefreshCooldownTimer);
    cryptoRefreshCooldownTimer = null;
  }
}

function startCryptoRefreshCooldown(){
  cryptoRefreshCooldownUntil = Date.now() + CRYPTO_MANUAL_COOLDOWN_MS;
  updateCryptoRefreshButton();
  if (cryptoRefreshCooldownTimer) clearInterval(cryptoRefreshCooldownTimer);
  cryptoRefreshCooldownTimer = setInterval(updateCryptoRefreshButton, 1000);
}

function formatCryptoCompactUsd(value){
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '$0';
  const abs = Math.abs(numeric);
  if (abs < 1000) return formatUsdPrice(numeric);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: abs >= 1e9 ? 2 : 1,
  }).format(numeric);
}

function formatCryptoSignedPercent(value, digits = 2){
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0.00%';
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(digits)}%`;
}

function getCryptoToneClass(value, { positive = 'is-up', negative = 'is-down', zero = 'is-flat' } = {}){
  const numeric = Number(value || 0);
  if (numeric > 0) return positive;
  if (numeric < 0) return negative;
  return zero;
}

function buildCryptoAssetModel(coin, index){
  const coinId = String(coin?.id || '').toLowerCase();
  const holding = state.cryptoHoldings?.[coinId] || { quantity: 0, avgBuyPrice: 0 };
  const quantity = Number(holding.quantity || 0);
  const avgBuyPrice = Number(holding.avgBuyPrice || 0);
  const currentPrice = Number(coin?.current_price || 0);
  const marketCap = Number(coin?.market_cap || 0);
  const changePct = Number(coin?.price_change_percentage_24h || 0);
  const positionValue = quantity * currentPrice;
  const costBasis = quantity * avgBuyPrice;
  const pnl = positionValue - costBasis;
  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  const dailyMoveUsd = positionValue * (changePct / 100);
  return {
    index,
    id: coinId,
    name: String(coin?.name || coin?.id || 'Unknown').trim(),
    symbol: String(coin?.symbol || '').trim().toUpperCase() || 'COIN',
    currentPrice,
    marketCap,
    changePct,
    quantity,
    avgBuyPrice,
    positionValue,
    costBasis,
    pnl,
    pnlPct,
    dailyMoveUsd,
    hasPosition: quantity > 0,
  };
}

function renderCryptoWidget(el, watch){
  const items = Array.isArray(watch) ? watch.map((coin, index) => buildCryptoAssetModel(coin, index)) : [];
  const heldItems = items.filter((item) => item.hasPosition);
  const watchOnlyItems = items.filter((item) => !item.hasPosition);
  const totalValue = heldItems.reduce((sum, item) => sum + item.positionValue, 0);
  const totalCostBasis = heldItems.reduce((sum, item) => sum + item.costBasis, 0);
  const totalPnl = totalValue - totalCostBasis;
  const totalPnlPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;
  const totalDayDrift = heldItems.reduce((sum, item) => sum + item.dailyMoveUsd, 0);
  const topMover = items.reduce((best, item) => {
    if (!best) return item;
    return Math.abs(item.changePct) > Math.abs(best.changePct) ? item : best;
  }, null);
  const largestHolding = heldItems.reduce((best, item) => {
    if (!best) return item;
    return item.positionValue > best.positionValue ? item : best;
  }, null);
  const upCount = items.filter((item) => item.changePct > 0).length;
  const downCount = items.filter((item) => item.changePct < 0).length;
  const flatCount = items.length - upCount - downCount;

  const renderAssetRow = (item) => {
    const changeTone = getCryptoToneClass(item.changePct);
    const pnlTone = getCryptoToneClass(item.pnl);
    const positionSummary = item.hasPosition
      ? `Position ${formatUsdPrice(item.positionValue)} · Cost ${formatUsdPrice(item.costBasis)} · 24h drift ${formatSignedUsd(item.dailyMoveUsd)}`
      : 'No position set yet. Add qty and avg cost to track real P/L.';
    const performanceSummary = item.hasPosition
      ? `Unrealized ${formatSignedUsd(item.pnl)} (${formatCryptoSignedPercent(item.pnlPct)})`
      : `24h move ${formatCryptoSignedPercent(item.changePct)}`;
    return `
      <article class="crypto-asset-row${item.hasPosition ? ' crypto-asset-row--held' : ''}">
        <div class="crypto-asset-head">
          <div class="crypto-asset-identity">
            <div class="crypto-asset-symbol">${escapeHtml(item.symbol)}</div>
            <div>
              <div class="crypto-asset-name">${escapeHtml(item.name)}</div>
              <div class="crypto-asset-meta">
                <span class="crypto-chip">${escapeHtml(item.hasPosition ? 'Held' : 'Watch')}</span>
                <span class="crypto-chip">MCap ${escapeHtml(formatCryptoCompactUsd(item.marketCap))}</span>
              </div>
            </div>
          </div>
          <div class="crypto-asset-price-stack">
            <div class="crypto-asset-price">${escapeHtml(formatUsdPrice(item.currentPrice))}</div>
            <div class="crypto-asset-change ${changeTone}">${escapeHtml(formatCryptoSignedPercent(item.changePct))}</div>
          </div>
        </div>
        <div class="crypto-asset-body">
          <div class="crypto-asset-summary">
            <div class="crypto-asset-position">${escapeHtml(positionSummary)}</div>
            <div class="crypto-asset-performance ${item.hasPosition ? pnlTone : changeTone}">${escapeHtml(performanceSummary)}</div>
          </div>
          <div class="crypto-asset-controls">
            <label class="crypto-field">
              <span>Qty</span>
              <input data-crypto-qty="${escapeHtml(item.id)}" type="number" min="0" step="any" value="${Number.isFinite(item.quantity) ? item.quantity : 0}" />
            </label>
            <label class="crypto-field">
              <span>Avg $</span>
              <input data-crypto-avg="${escapeHtml(item.id)}" type="number" min="0" step="any" value="${Number.isFinite(item.avgBuyPrice) ? item.avgBuyPrice : 0}" />
            </label>
            <button class="btn ghost crypto-remove-btn" data-crypto-remove="${escapeHtml(item.id)}" type="button">Remove</button>
          </div>
        </div>
      </article>
    `;
  };

  const overviewMarkup = `
    <section class="crypto-overview-grid">
      <article class="crypto-overview-card crypto-overview-card--hero">
        <div class="crypto-overview-label">Portfolio Value</div>
        <div class="crypto-overview-value">${escapeHtml(formatUsdPrice(totalValue))}</div>
        <div class="crypto-overview-meta">${heldItems.length ? `${heldItems.length} active position${heldItems.length === 1 ? '' : 's'}` : 'No active positions yet'}${largestHolding ? ` · Largest ${escapeHtml(largestHolding.symbol)} ${escapeHtml(formatUsdPrice(largestHolding.positionValue))}` : ''}</div>
      </article>
      <article class="crypto-overview-card">
        <div class="crypto-overview-label">Unrealized P/L</div>
        <div class="crypto-overview-value ${getCryptoToneClass(totalPnl)}">${escapeHtml(formatSignedUsd(totalPnl))}</div>
        <div class="crypto-overview-meta">${escapeHtml(formatCryptoSignedPercent(totalPnlPct))} vs cost basis</div>
      </article>
      <article class="crypto-overview-card">
        <div class="crypto-overview-label">24h Drift</div>
        <div class="crypto-overview-value ${getCryptoToneClass(totalDayDrift)}">${escapeHtml(formatSignedUsd(totalDayDrift))}</div>
        <div class="crypto-overview-meta">${heldItems.length ? 'Estimated move across held positions' : 'Activates once holdings are entered'}</div>
      </article>
      <article class="crypto-overview-card">
        <div class="crypto-overview-label">Market Pulse</div>
        <div class="crypto-overview-value">${topMover ? escapeHtml(`${topMover.symbol} ${formatCryptoSignedPercent(topMover.changePct)}`) : 'Quiet'}</div>
        <div class="crypto-overview-meta">${items.length ? `${upCount} up · ${downCount} down${flatCount ? ` · ${flatCount} flat` : ''}` : 'Build a watchlist to see breadth'}</div>
      </article>
    </section>
  `;

  const heldSection = heldItems.length
    ? `
      <section class="crypto-section">
        <div class="crypto-section-head">
          <span>Held Positions</span>
          <span>${heldItems.length}</span>
        </div>
        <div class="crypto-asset-list">${heldItems.map((item) => renderAssetRow(item)).join('')}</div>
      </section>
    `
    : '';

  const watchSection = `
    <section class="crypto-section">
      <div class="crypto-section-head">
        <span>${heldItems.length ? 'Market Radar' : 'Watchlist'}</span>
        <span>${watchOnlyItems.length}</span>
      </div>
      <div class="crypto-asset-list">${watchOnlyItems.length ? watchOnlyItems.map((item) => renderAssetRow(item)).join('') : '<div class="crypto-empty-state">No watch-only assets right now. Add a coin to start tracking the market.</div>'}</div>
    </section>
  `;

  el.innerHTML = `
    <div class="scroll-box crypto-scroll crypto-v2-shell">
      <div class="crypto-command-bar">
        <div class="crypto-command-main">
          <input id="cryptoAddInput" class="crypto-search-input" placeholder="Search coin by ticker, name, or id" />
          <div class="crypto-command-actions">
            <button id="cryptoAddBtn" class="btn" type="button">Add Coin</button>
            <button id="cryptoDirRefreshBtn" class="btn ghost" type="button">Refresh Directory</button>
          </div>
        </div>
        <div id="cryptoAddHint" class="crypto-add-hint note-meta"></div>
      </div>
      ${overviewMarkup}
      ${heldSection}
      ${watchSection}
    </div>
  `;

  const addInput = document.getElementById('cryptoAddInput');
  const hint = document.getElementById('cryptoAddHint');

  const renderHintMatches = () => {
    if (!hint) return;
    const val = (addInput?.value || '').trim().toLowerCase();
    if (!val) {
      hint.textContent = 'Search supports ticker, project name, or provider id.';
      return;
    }

    const preferred = topSymbolMap.get(val);
    const matches = findCoinMatches(val, 5);
    if (!matches.length && !preferred) {
      hint.textContent = 'No matching coin found in cached list.';
      return;
    }

    const preferredText = preferred ? `Default for ${val.toUpperCase()}: ${preferred}` : '';
    const matchText = matches.length
      ? `Matches: ${matches.map((m) => `${escapeHtml((m.symbol || '').toUpperCase())} (${escapeHtml(m.id)})`).join(' · ')}`
      : '';

    hint.innerHTML = [preferredText, matchText].filter(Boolean).join('<br/>');
  };

  addInput?.addEventListener('input', renderHintMatches);
  renderHintMatches();

  document.getElementById('cryptoAddBtn')?.addEventListener('click', () => {
    const val = (addInput?.value || '').trim();
    const id = resolveCoinId(val);
    if (!id) {
      if (hint) hint.textContent = 'Could not resolve coin from cached list. Try a different name/symbol.';
      return;
    }
    if (!state.cryptoWatchlist.includes(id)) state.cryptoWatchlist.push(id);
    if (!state.cryptoHoldings[id]) state.cryptoHoldings[id] = { quantity: 0, avgBuyPrice: 0 };
    if (addInput) addInput.value = '';
    save();
    renderCryptoPod();
  });

  document.getElementById('cryptoDirRefreshBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('cryptoDirRefreshBtn');
    if (btn) btn.textContent = 'Refreshing...';
    await getCoinDirectory(true);
    if (btn) btn.textContent = 'Refresh Directory';
    if (hint) hint.textContent = `Coin directory refreshed (${coinDirectory.length.toLocaleString()} assets).`;
  });

  el.querySelectorAll('[data-crypto-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-crypto-remove');
      if (!id) return;
      state.cryptoWatchlist = state.cryptoWatchlist.filter((x) => x !== id);
      delete state.cryptoHoldings[id];
      save();
      renderCryptoPod();
    });
  });

  el.querySelectorAll('[data-crypto-qty]').forEach((input) => {
    input.addEventListener('change', () => {
      const coinId = String(input.getAttribute('data-crypto-qty') || '').toLowerCase();
      if (!coinId) return;
      const qty = Number(input.value);
      if (!state.cryptoHoldings[coinId]) state.cryptoHoldings[coinId] = { quantity: 0, avgBuyPrice: 0 };
      state.cryptoHoldings[coinId].quantity = Number.isFinite(qty) && qty >= 0 ? qty : 0;
      save();
      renderCryptoPod();
    });
  });

  el.querySelectorAll('[data-crypto-avg]').forEach((input) => {
    input.addEventListener('change', () => {
      const coinId = String(input.getAttribute('data-crypto-avg') || '').toLowerCase();
      if (!coinId) return;
      const avg = Number(input.value);
      if (!state.cryptoHoldings[coinId]) state.cryptoHoldings[coinId] = { quantity: 0, avgBuyPrice: 0 };
      state.cryptoHoldings[coinId].avgBuyPrice = Number.isFinite(avg) && avg >= 0 ? avg : 0;
      save();
      renderCryptoPod();
    });
  });
}

async function renderCrypto(options = {}){
  const el = document.getElementById('cryptoWidget');
  if (!el) return;

  const manual = !!options.manual;
  const ts = document.getElementById('cryptoUpdatedAt');
  const nowTs = Date.now();
  const backoffLeftMs = cryptoBackoffUntil - nowTs;

  updateCryptoRefreshButton();

  const cachedWarm = getCryptoWatchCache();
  if (!cryptoLastSuccessAt && cachedWarm?.updatedAt) {
    cryptoLastSuccessAt = cachedWarm.updatedAt;
    cryptoLastSuccessProvider = cachedWarm.provider || cryptoLastSuccessProvider;
  }

  if (!manual && backoffLeftMs > 0) {
    const cached = getCryptoWatchCache();
    if (cached?.watch?.length) {
      renderCryptoWidget(el, cached.watch);
      const providerLabel = CRYPTO_PROVIDER_LABELS[cached.provider] || CRYPTO_PROVIDER_LABELS[activeCryptoProvider];
      setPodStatusSignal('crypto', 'stale', `retry ${Math.ceil(backoffLeftMs / 1000)}s`);
      if (ts) ts.textContent = `Updated: ${new Date(cached.updatedAt).toLocaleTimeString()} · stale snapshot (${Math.ceil(backoffLeftMs / 1000)}s backoff) · Data: ${providerLabel} · ${formatLastSuccessMeta(cryptoLastSuccessAt, cryptoLastSuccessProvider)}`;
      return;
    }
  }

  try {
    if (!coinDirectory.length) await getCoinDirectory(false);

    await fetchTopSymbolMapWithFailover();

    const watchIds = (state.cryptoWatchlist || []).filter(Boolean).slice(0, 40);
    const { provider, watch, attempts, errors } = await fetchCryptoWatchWithFailover(watchIds);
    activeCryptoProvider = provider;

    renderCryptoWidget(el, watch);
    const updatedAt = Date.now();
    setCryptoWatchCache({ updatedAt, watch, provider });
    cryptoLastSuccessAt = updatedAt;
    cryptoLastSuccessProvider = provider;
    cryptoFailureCount = 0;
    cryptoBackoffUntil = 0;
    clearPollingBackoff('crypto-tracker');

    const providerLabel = CRYPTO_PROVIDER_LABELS[provider] || provider;
    const fallbackNote = provider !== getCryptoProviderChain()[0]
      ? ` · fallback active (${providerLabel})`
      : '';
    const retryNote = Number(attempts || 1) > 1
      ? ` · retried ${Number(attempts || 1) - 1}x`
      : '';
    const previousFailures = Array.isArray(errors) ? errors.length : 0;
    const failureNote = previousFailures > 0 ? ` · recovered after ${previousFailures} provider error${previousFailures > 1 ? 's' : ''}` : '';
    setPodStatusSignal('crypto', 'fresh');
    if (ts) ts.textContent = `Updated: ${new Date(updatedAt).toLocaleTimeString()} (portfolio + radar · auto: every 15 min) · Data: ${providerLabel}${fallbackNote}${retryNote}${failureNote} · ${formatLastSuccessMeta(cryptoLastSuccessAt, cryptoLastSuccessProvider)}`;
  } catch (error) {
    cryptoFailureCount += 1;
    const backoffMs = Math.min(CRYPTO_FAILURE_BACKOFF_BASE_MS * (2 ** (cryptoFailureCount - 1)), CRYPTO_FAILURE_BACKOFF_MAX_MS);
    cryptoBackoffUntil = Date.now() + backoffMs;
    const reason = formatCryptoError(error);
    const providerFailures = Array.isArray(error?.errors)
      ? error.errors.slice(-3).map((e) => {
        const label = CRYPTO_PROVIDER_LABELS[String(e?.provider || '').toLowerCase()] || String(e?.provider || 'provider');
        const code = Number(e?.status || 0);
        return code ? `${label} ${code}` : `${label}`;
      }).filter(Boolean)
      : [];
    const reasonDetail = providerFailures.length ? `${reason} (${providerFailures.join(' → ')})` : reason;
    registerPollingFailure('crypto-tracker', error, reasonDetail);

    const cached = getCryptoWatchCache();
    if (cached?.watch?.length) {
      renderCryptoWidget(el, cached.watch);
      const providerLabel = CRYPTO_PROVIDER_LABELS[cached.provider] || CRYPTO_PROVIDER_LABELS[activeCryptoProvider];
      setPodStatusSignal('crypto', 'stale', `retry ${Math.ceil(backoffMs / 1000)}s`);
      if (ts) ts.textContent = `Updated: ${new Date(cached.updatedAt).toLocaleTimeString()} · stale snapshot (${reasonDetail}; retry in ${Math.ceil(backoffMs / 1000)}s) · Data: ${providerLabel} · ${formatLastSuccessMeta(cryptoLastSuccessAt || cached.updatedAt, cryptoLastSuccessProvider || cached.provider)}`;
      return;
    }

    setPodStatusSignal('crypto', 'error', `retry ${Math.ceil(backoffMs / 1000)}s`);
    el.textContent = 'Crypto data unavailable right now.';
    if (ts) ts.textContent = `Update failed: ${reasonDetail} (retry in ${Math.ceil(backoffMs / 1000)}s) · ${formatLastSuccessMeta(cryptoLastSuccessAt, cryptoLastSuccessProvider)}`;
  }
}

async function fetchRssFeedBundle(){
  const feedUrls = (state.rss?.feeds || []).map((f) => f.url).filter(Boolean);
  if (!feedUrls.length) return { ok: true, items: [], errors: [] };

  const res = await fetch('/api/rss/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feeds: feedUrls }),
  });
  const payload = await res.json();
  if (!res.ok || payload?.ok === false) {
    throw new Error(payload?.message || `RSS fetch failed (${res.status})`);
  }
  return payload;
}

function mountRssSettingsFeeds(){
  const wrap = document.getElementById('settingsRssFeedsList');
  if (!wrap) return;
  const feeds = Array.isArray(state.rss?.feeds) ? state.rss.feeds : [];
  if (!feeds.length) {
    wrap.innerHTML = '<div class="note-meta">No feeds configured yet.</div>';
    return;
  }

  wrap.innerHTML = feeds.map((feed) => `
    <div class="change-log-item row-between-wrap rss-feed-setting-row">
      <div class="rss-feed-setting-copy">
        <div class="rss-feed-setting-url">${escapeHtml(feed.url)}</div>
        <div class="note-meta">${escapeHtml(feed.tag || 'General')}</div>
      </div>
      <button class="btn note-delete" data-rss-feed-remove="${escapeAttribute(feed.id)}" type="button">Remove</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-rss-feed-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const feedId = String(btn.getAttribute('data-rss-feed-remove') || '');
      if (!feedId) return;
      const feedIndex = state.rss.feeds.findIndex((f) => f.id === feedId);
      if (feedIndex < 0) return;
      const [removedFeed] = state.rss.feeds.splice(feedIndex, 1);
      const removedItems = state.rss.items.filter((item) => item.feedId === feedId);
      const removedItemIds = new Set(removedItems.map((item) => item.id));
      const removedReadIds = state.rss.readItemIds.filter((itemId) => removedItemIds.has(itemId));
      state.rss.items = state.rss.items.filter((item) => item.feedId !== feedId);
      state.rss.readItemIds = state.rss.readItemIds.filter((itemId) => !removedItemIds.has(itemId));
      commitState('rss_feed_removed');
      offerUndoAction({
        actionId: `rss:${removedFeed?.id || 'feed'}:${Date.now()}`,
        label: `RSS feed removed (${removedFeed?.tag || 'General'}). Undo?`,
        undoFn: () => {
          const exists = state.rss.feeds.some((f) => f.id === removedFeed.id);
          if (!exists) state.rss.feeds.splice(Math.min(feedIndex, state.rss.feeds.length), 0, removedFeed);
          const itemIds = new Set(state.rss.items.map((item) => item.id));
          removedItems.forEach((item) => {
            if (!itemIds.has(item.id)) state.rss.items.push(item);
          });
          const readSet = new Set(state.rss.readItemIds);
          removedReadIds.forEach((idVal) => readSet.add(idVal));
          state.rss.readItemIds = [...readSet];
        },
      });
      mountRssSettingsFeeds();
      renderRssPod({ skipFetch: true });
    });
  });
}

function hasFollowerMetricValue(value){
  return socialFollowersAnalyticsFeature.hasMetricValue(value);
}

function formatFollowerMetricValue(value){
  return socialFollowersAnalyticsFeature.formatMetricValue(value);
}

function formatFollowerAge(ageMs){
  return socialFollowersAnalyticsFeature.formatAge(ageMs);
}

const socialAnalyticsRuntime = {
  facebookHistory: [],
  communityHistory: [],
  instagramHistory: [],
  tiktokHistory: [],
  contentByNetwork: {
    facebook: {
      ok: false,
      profile: { id: '', name: '', url: '' },
      fetchedAt: '',
      source: '',
      insights: null,
      summary: null,
      items: [],
      status: { staleLevel: 'critical', ageMs: null, lastError: '' },
    },
    instagram: {
      ok: false,
      profile: { handle: '', name: '', url: '' },
      fetchedAt: '',
      source: '',
      insights: null,
      summary: null,
      items: [],
      status: { staleLevel: 'critical', ageMs: null, lastError: '' },
    },
  },
  rangeByNetwork: {
    facebook: '7d',
    community: '30d',
    instagram: '7d',
    tiktok: '7d',
  },
};

function formatDurationCompact(durationMs){
  return socialFollowersAnalyticsFeature.formatDuration(durationMs);
}

function formatFollowerTimestamp(value){
  return socialFollowersAnalyticsFeature.formatTimestamp(value);
}

function normalizeFollowerHistory(history, valueKey = 'followersCount'){
  return socialFollowersAnalyticsFeature.normalizeHistory(history, valueKey);
}

function averageFollowerInterval(history){
  return socialFollowersAnalyticsFeature.averageInterval(history);
}

function buildFollowerSparkline(history, options = {}){
  const points = Array.isArray(history) ? history : [];
  if (!points.length) return '';
  const width = Math.max(240, Number(options.width) || 640);
  const height = Math.max(120, Number(options.height) || 220);
  const padX = 16;
  const padY = 16;
  const innerWidth = width - (padX * 2);
  const innerHeight = height - (padY * 2);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padX + ((innerWidth * index) / (points.length - 1));
    const y = padY + innerHeight - (((point.value - min) / range) * innerHeight);
    return [x, y];
  });
  const polyline = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${padX},${height - padY} ${polyline} ${width - padX},${height - padY}`;
  const last = coords[coords.length - 1];
  return `<svg viewBox="0 0 ${width} ${height}" class="social-analytics-chart" role="img" aria-label="Instagram follower trend">
    <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" class="social-analytics-chart-axis"></line>
    <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}" class="social-analytics-chart-axis"></line>
    <polygon points="${area}" class="social-analytics-chart-area"></polygon>
    <polyline points="${polyline}" class="social-analytics-chart-line"></polyline>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" class="social-analytics-chart-dot"></circle>
  </svg>`;
}

const SOCIAL_ANALYTICS_RANGE_WINDOWS = socialFollowersAnalyticsFeature.rangeWindows;

function getSocialAnalyticsRange(network){
  const key = String(network || '').trim().toLowerCase() || 'instagram';
  return socialAnalyticsRuntime.rangeByNetwork[key] || '7d';
}

function setSocialAnalyticsRange(network, rangeKey){
  const key = String(network || '').trim().toLowerCase() || 'instagram';
  const next = Object.prototype.hasOwnProperty.call(SOCIAL_ANALYTICS_RANGE_WINDOWS, rangeKey) ? rangeKey : '7d';
  socialAnalyticsRuntime.rangeByNetwork[key] = next;
}

function filterFollowerHistoryByRange(history, rangeKey){
  return socialFollowersAnalyticsFeature.filterHistoryByRange(history, rangeKey);
}

function buildFollowerPointDiffs(history){
  return socialFollowersAnalyticsFeature.buildPointDiffs(history);
}

function formatFollowerRatePerHour(value){
  return socialFollowersAnalyticsFeature.formatRatePerHour(value);
}

function computeFollowerWindowStats(history){
  return socialFollowersAnalyticsFeature.computeWindowStats(history);
}

function buildFollowerDailyRollups(history){
  return socialFollowersAnalyticsFeature.buildDailyRollups(history);
}

function normalizeSocialContentItems(items){
  return socialFollowersAnalyticsFeature.normalizeContentItems(items);
}

function formatSocialMetricValue(value){
  return socialFollowersAnalyticsFeature.formatSocialMetric(value);
}

function formatSocialContentType(item){
  return socialFollowersAnalyticsFeature.formatContentType(item);
}

function trimSocialCaption(text, maxLen = 160){
  return socialFollowersAnalyticsFeature.trimCaption(text, maxLen);
}

function getSocialContentDataset(network){
  const key = String(network || '').trim().toLowerCase();
  if (key === 'facebook') {
    const payload = socialAnalyticsRuntime.contentByNetwork.facebook || {};
    const source = String(payload.source || '');
    const official = /graph_api/i.test(source);
    return {
      supported: true,
      label: 'Recent post performance',
      note: official
        ? 'Ranked by official Facebook Page interactions from the connected Meta page.'
        : 'Facebook post metrics will appear here after the Graph connection succeeds.',
      profile: payload.profile || { id: '', name: '', url: '' },
      source,
      fetchedAt: String(payload.fetchedAt || ''),
      insights: payload.insights || null,
      summary: payload.summary || null,
      status: payload.status || { staleLevel: 'critical', ageMs: null, lastError: '' },
      items: normalizeSocialContentItems(payload.items),
    };
  }
  if (key === 'instagram') {
    const payload = socialAnalyticsRuntime.contentByNetwork.instagram || {};
    const source = String(payload.source || '');
    const official = /graph_api/i.test(source);
    return {
      supported: true,
      label: 'Recent post performance',
      note: official
        ? 'Ranked by official Meta total interactions from the connected professional account.'
        : 'Ranked by visible interactions from the authenticated Instagram feed payload.',
      profile: payload.profile || { handle: '', name: '', url: '' },
      source,
      fetchedAt: String(payload.fetchedAt || ''),
      insights: payload.insights || null,
      summary: payload.summary || null,
      status: payload.status || { staleLevel: 'critical', ageMs: null, lastError: '' },
      items: normalizeSocialContentItems(payload.items),
    };
  }
  return {
    supported: false,
    label: 'Recent post performance',
    note: 'Post-level stats are wired for Instagram first.',
    profile: { handle: '', name: '', url: '' },
    source: '',
    fetchedAt: '',
    insights: null,
    summary: null,
    status: { staleLevel: 'critical', ageMs: null, lastError: '' },
    items: [],
  };
}

function summarizeSocialFollowersStatus(networks){
  return socialFollowersAnalyticsFeature.summarizeStatus(networks);
}

const FACEBOOK_FOLLOWER_FALLBACK_SOURCES = new Set([
  'public_scrape_estimate',
  'facebook_page_playwright_public',
  'facebook_session_playwright',
]);

function formatFacebookFollowerSourceLabel(source){
  const value = String(source || '').trim();
  if (!value) return 'unknown';
  if (FACEBOOK_FOLLOWER_FALLBACK_SOURCES.has(value)) return value;
  return value;
}

function renderSocialFollowersTile(config){
  const {
    kind,
    forceRollingLabels,
    icon,
    label,
    audienceLabel,
    count,
    delta,
    rollingDelta1h,
    rollingDelta24h,
    source,
    staleLevel,
    ageMs,
    identityLabel,
    href,
    analyticsKey,
    setupRequired,
    lastError,
  } = config;
  const stale = String(staleLevel || 'critical');
  const tone = stale === 'fresh' ? 'fresh' : (stale === 'stale' ? 'stale' : 'issue');
  const statusLabel = kind === 'community' ? 'Open' : (stale === 'fresh' ? 'Live' : (stale === 'stale' ? 'Stale' : 'Issue'));
  const countText = hasFollowerMetricValue(count) ? new Intl.NumberFormat().format(Number(count)) : 'n/a';
  const deltaVal = hasFollowerMetricValue(delta) ? Number(delta) : null;
  const deltaClass = deltaVal == null ? 'followers-delta--neutral' : (deltaVal > 0 ? 'followers-delta--up' : (deltaVal < 0 ? 'followers-delta--down' : 'followers-delta--neutral'));
  const deltaText = deltaVal == null ? 'Δ n/a' : `Δ ${formatFollowerMetricValue(deltaVal)}`;
  const useRollingLabels = !!forceRollingLabels || hasFollowerMetricValue(rollingDelta1h) || hasFollowerMetricValue(rollingDelta24h);
  const metricPrimaryLabel = useRollingLabels ? '1h' : 'Change';
  const metricPrimaryValue = hasFollowerMetricValue(rollingDelta1h)
    ? formatFollowerMetricValue(rollingDelta1h)
    : (useRollingLabels ? 'n/a' : formatFollowerMetricValue(deltaVal));
  const metricSecondaryLabel = useRollingLabels ? '24h' : 'Updated';
  const metricSecondaryValue = hasFollowerMetricValue(rollingDelta24h)
    ? formatFollowerMetricValue(rollingDelta24h)
    : (useRollingLabels ? 'n/a' : formatFollowerAge(ageMs));
  const analyticsButton = analyticsKey
    ? `<button class="social-followers-analytics-btn" type="button" data-social-analytics-open="${escapeHtml(String(analyticsKey))}">Analytics</button>`
    : '';

  if (setupRequired && !hasFollowerMetricValue(count)) {
    return `<article class="social-followers-tile social-followers-tile--${tone}">
      <div class="social-followers-tile-head">
        <div class="social-followers-tile-title"><span>${icon}</span><span>${escapeHtml(label)}</span></div>
        <div class="social-followers-tile-actions">${analyticsButton}<span class="badge social-followers-tile-badge social-followers-tile-badge--${tone}">${statusLabel}</span></div>
      </div>
      <div class="note-meta">Setup required for ${escapeHtml(label.toLowerCase())} tracking.</div>
      ${lastError ? `<div class="note-meta mt6">${escapeHtml(lastError)}</div>` : ''}
    </article>`;
  }

  if (kind === 'community' && !hasFollowerMetricValue(count)) {
    const groupHref = String(href || '').trim();
    return `<article class="social-followers-tile social-followers-tile--${tone}">
      <div class="social-followers-tile-head">
        <div class="social-followers-tile-title"><span>${icon}</span><span>${escapeHtml(label)}</span></div>
        <div class="social-followers-tile-actions">${analyticsButton}<span class="badge social-followers-tile-badge social-followers-tile-badge--${tone}">${statusLabel}</span></div>
      </div>
      <div class="social-followers-tile-subtitle">${escapeHtml(audienceLabel)}</div>
      <div class="social-followers-tile-count social-followers-tile-count--label">Blast From the Ads</div>
      <div class="note-meta">Community member counts are not publicly exposed while logged out.</div>
      <div class="social-followers-tile-meta">${escapeText(identityLabel || 'Facebook Group')}${safeExternalUrl(groupHref) ? ` <a class="social-followers-link" href="${escapeAttribute(safeExternalUrl(groupHref))}" target="_blank" rel="noopener noreferrer">Open group</a>` : ''}</div>
    </article>`;
  }

  return `<article class="social-followers-tile social-followers-tile--${tone}">
    <div class="social-followers-tile-head">
      <div class="social-followers-tile-title"><span>${icon}</span><span>${escapeHtml(label)}</span></div>
      <div class="social-followers-tile-actions">${analyticsButton}<span class="badge social-followers-tile-badge social-followers-tile-badge--${tone}">${statusLabel}</span></div>
    </div>
    <div class="social-followers-tile-subtitle">${escapeHtml(audienceLabel)}</div>
    <div class="social-followers-tile-count">${countText}</div>
    <div class="followers-delta ${deltaClass}">${deltaText}</div>
    <div class="social-followers-tile-metrics">
      <div class="social-followers-tile-metric">
        <span>${escapeHtml(metricPrimaryLabel)}</span>
        <strong>${escapeHtml(metricPrimaryValue)}</strong>
      </div>
      <div class="social-followers-tile-metric">
        <span>${escapeHtml(metricSecondaryLabel)}</span>
        <strong>${escapeHtml(metricSecondaryValue)}</strong>
      </div>
    </div>
    <div class="social-followers-tile-meta">${escapeText(identityLabel || 'Unknown')} <span class="badge">${escapeText(source || 'fallback')}</span>${safeExternalUrl(String(href || '')) ? ` <a class="social-followers-link" href="${escapeAttribute(safeExternalUrl(String(href || '')))}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}</div>
  </article>`;
}

function renderSocialFollowersPod(options = {}){
  const el = document.getElementById('socialFollowersWidget');
  const meta = document.getElementById('socialFollowersUpdatedAt');
  if (!el || !meta) return;

  const loaders = options.skipFetch
    ? [Promise.resolve(), Promise.resolve(), Promise.resolve(), Promise.resolve()]
    : [
      fetchFacebookFollowers(options),
      fetchFacebookGroupMembers(options),
      fetchInstagramFollowers(options),
      fetchTikTokFollowers(options),
    ];

  Promise.allSettled(loaders).then(() => {
    const facebook = state.facebookFollowers || {};
    const community = state.facebookGroupMembers || {};
    const instagram = state.instagramFollowers || {};
    const tiktok = state.tiktokFollowers || {};
    const networks = [
      {
        key: 'facebook',
        icon: '📘',
        label: 'Facebook',
        audienceLabel: 'Followers',
        count: hasFollowerMetricValue(facebook.followersCount) ? Number(facebook.followersCount) : (hasFollowerMetricValue(facebook.fanCount) ? Number(facebook.fanCount) : null),
        delta: facebook.delta,
        rollingDelta1h: facebook.rollingDelta1h,
        rollingDelta24h: facebook.rollingDelta24h,
        source: formatFacebookFollowerSourceLabel(facebook.source),
        staleLevel: facebook.staleLevel,
        ageMs: facebook.ageMs,
        identityLabel: facebook.pageName || facebook.pageId || 'Facebook',
        analyticsKey: 'facebook',
        lastError: facebook.lastError,
      },
      {
        key: 'instagram',
        icon: '📸',
        label: 'Instagram',
        audienceLabel: 'Followers',
        count: instagram.followersCount,
        delta: instagram.delta,
        rollingDelta1h: instagram.rollingDelta1h,
        rollingDelta24h: instagram.rollingDelta24h,
        source: instagram.source,
        staleLevel: instagram.staleLevel,
        ageMs: instagram.ageMs,
        identityLabel: instagram.profileName || (instagram.profileHandle ? `@${instagram.profileHandle}` : 'Instagram'),
        analyticsKey: 'instagram',
        lastError: instagram.lastError,
      },
      {
        key: 'tiktok',
        icon: '🎵',
        label: 'TikTok',
        audienceLabel: 'Followers',
        count: tiktok.followersCount,
        delta: tiktok.delta,
        forceRollingLabels: true,
        rollingDelta1h: tiktok.rollingDelta1h,
        rollingDelta24h: tiktok.rollingDelta24h,
        source: tiktok.source || 'tiktok_public_scrape_estimate',
        staleLevel: tiktok.staleLevel,
        ageMs: tiktok.ageMs,
        identityLabel: tiktok.profileName || (tiktok.profileHandle ? `@${tiktok.profileHandle}` : 'TikTok'),
        analyticsKey: 'tiktok',
        setupRequired: !!tiktok.setupRequired,
        lastError: tiktok.lastError,
      },
      {
        key: 'community',
        kind: 'community',
        icon: '👥',
        label: 'Community',
        audienceLabel: 'Members',
        count: community.membersCount,
        delta: community.delta,
        forceRollingLabels: true,
        rollingDelta1h: community.rollingDelta1h,
        rollingDelta24h: community.rollingDelta24h,
        source: community.source || 'facebook_group_playwright',
        staleLevel: community.staleLevel || 'fresh',
        ageMs: community.ageMs,
        identityLabel: community.groupName || 'Blast From the Ads Community',
        href: community.groupUrl || 'https://www.facebook.com/groups/blastfromtheads',
        analyticsKey: 'community',
        setupRequired: !!community.setupRequired,
        lastError: community.lastError,
      },
    ];

    const statusSummary = summarizeSocialFollowersStatus(networks);
    setPodStatusSignal(MERGED_SOCIAL_FOLLOWERS_POD_ID, statusSummary.mode, statusSummary.detail);
    el.innerHTML = `<div class="social-followers-grid">${networks.map(renderSocialFollowersTile).join('')}</div>`;

    const lastFetched = networks
      .map((network) => Date.parse(
        network.key === 'facebook' ? facebook.fetchedAt
          : network.key === 'community' ? community.fetchedAt
          : network.key === 'instagram' ? instagram.fetchedAt
          : network.key === 'tiktok' ? tiktok.fetchedAt
          : ''
      ))
      .filter((value) => Number.isFinite(value));
    const lastFetchedText = lastFetched.length ? new Date(Math.max(...lastFetched)).toLocaleTimeString() : 'n/a';
    meta.textContent = `Last grid refresh: ${lastFetchedText} · Auto refresh checks every minute.`;
    const analyticsDialog = document.getElementById('socialAnalyticsDialog');
    if (analyticsDialog?.open) renderInstagramAnalyticsDialog();
  });
}

function getSocialAnalyticsDataset(network){
  const key = String(network || '').trim().toLowerCase();
  if (key === 'facebook') {
    const fb = state.facebookFollowers || {};
    const fbContent = socialAnalyticsRuntime.contentByNetwork.facebook || {};
    return {
      key,
      title: fb.pageName || 'Facebook Analytics',
      subtitle: fb.pageId || 'Facebook followers',
      sourceLabel: String(fb.source || 'facebook_page_playwright_public'),
      profileUrl: String(fbContent?.profile?.url || ''),
      currentValue: hasFollowerMetricValue(fb.followersCount) ? Number(fb.followersCount) : (hasFollowerMetricValue(fb.fanCount) ? Number(fb.fanCount) : null),
      currentLabel: 'followers',
      ageMs: fb.ageMs,
      rollingDelta1h: fb.rollingDelta1h,
      rollingDelta24h: fb.rollingDelta24h,
      history: normalizeFollowerHistory(socialAnalyticsRuntime.facebookHistory, 'followersCount'),
      emptyMessage: 'No Facebook analytics data yet.',
    };
  }
  if (key === 'tiktok') {
    const tt = state.tiktokFollowers || {};
    const handle = String(tt.profileHandle || '').trim();
    return {
      key,
      title: tt.profileName || (handle ? `@${handle}` : 'TikTok Analytics'),
      subtitle: handle ? `@${handle}` : 'TikTok followers',
      sourceLabel: String(tt.source || 'tiktok_public_scrape_estimate'),
      profileUrl: String(tt.profileUrl || ''),
      currentValue: hasFollowerMetricValue(tt.followersCount) ? Number(tt.followersCount) : null,
      currentLabel: 'followers',
      ageMs: tt.ageMs,
      rollingDelta1h: tt.rollingDelta1h,
      rollingDelta24h: tt.rollingDelta24h,
      history: normalizeFollowerHistory(socialAnalyticsRuntime.tiktokHistory, 'followersCount'),
      emptyMessage: 'No TikTok analytics data yet.',
    };
  }
  if (key === 'community') {
    const group = state.facebookGroupMembers || {};
    return {
      key,
      title: group.groupName || 'Community Analytics',
      subtitle: 'Blast From the Ads Community',
      sourceLabel: String(group.source || 'facebook_group_playwright'),
      profileUrl: String(group.groupUrl || 'https://www.facebook.com/groups/blastfromtheads'),
      currentValue: hasFollowerMetricValue(group.membersCount) ? Number(group.membersCount) : null,
      currentLabel: 'members',
      ageMs: group.ageMs,
      rollingDelta1h: group.rollingDelta1h,
      rollingDelta24h: group.rollingDelta24h,
      history: normalizeFollowerHistory(socialAnalyticsRuntime.communityHistory, 'membersCount'),
      emptyMessage: 'No community analytics data yet.',
    };
  }
  const ig = state.instagramFollowers || {};
  const handle = String(ig.profileHandle || '').trim();
  return {
    key: 'instagram',
    title: ig.profileName || (handle ? `@${handle}` : 'Instagram Analytics'),
    subtitle: handle ? `@${handle}` : 'Instagram followers',
    sourceLabel: String(ig.source || 'instagram_profile_session'),
    profileUrl: handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : '',
    currentValue: hasFollowerMetricValue(ig.followersCount) ? Number(ig.followersCount) : null,
    currentLabel: 'followers',
    ageMs: ig.ageMs,
    rollingDelta1h: ig.rollingDelta1h,
    rollingDelta24h: ig.rollingDelta24h,
    history: normalizeFollowerHistory(socialAnalyticsRuntime.instagramHistory, 'followersCount'),
    emptyMessage: 'No Instagram analytics data yet.',
  };
}

function renderInstagramAnalyticsDialog(){
  const dialog = document.getElementById('socialAnalyticsDialog');
  const title = document.getElementById('socialAnalyticsDialogTitle');
  const meta = document.getElementById('socialAnalyticsDialogMeta');
  const body = document.getElementById('socialAnalyticsDialogBody');
  if (!dialog || !title || !meta || !body) return;

  const analytics = getSocialAnalyticsDataset(dialog.dataset.network || 'instagram');
  const activeRange = getSocialAnalyticsRange(analytics.key);
  const visibleHistory = filterFollowerHistoryByRange(analytics.history, activeRange);
  const windowStats = computeFollowerWindowStats(visibleHistory);
  const dailyRollups = buildFollowerDailyRollups(visibleHistory).slice(-7).reverse();
  const latestCount = Number.isFinite(analytics.currentValue) ? Number(analytics.currentValue) : null;
  const visibleHigh = visibleHistory.length ? Math.max(...visibleHistory.map((entry) => entry.value)) : null;
  const visibleLow = visibleHistory.length ? Math.min(...visibleHistory.map((entry) => entry.value)) : null;
  const avgIntervalMs = averageFollowerInterval(visibleHistory);
  const contentAnalytics = getSocialContentDataset(analytics.key);
  const contentItems = contentAnalytics.items
    .slice()
    .sort((a, b) => (b.interactionCount || 0) - (a.interactionCount || 0))
    .slice(0, 8);
  const contentSummary = contentAnalytics.summary || null;
  const contentInsights = contentAnalytics.insights && typeof contentAnalytics.insights === 'object' ? contentAnalytics.insights : null;
  title.textContent = analytics.title;
  meta.innerHTML = `<span>${escapeText(analytics.subtitle)}</span> <span class="badge">${escapeText(analytics.sourceLabel)}</span>${safeExternalUrl(analytics.profileUrl) ? ` <a class="social-followers-link" href="${escapeAttribute(safeExternalUrl(analytics.profileUrl))}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}`;

  if (latestCount == null) {
    body.innerHTML = `<div class="note-meta">${escapeHtml(analytics.emptyMessage)}</div>`;
    return;
  }

  const recentRows = visibleHistory.slice(-12).reverse().map((entry, index, rows) => {
    const previous = rows[index + 1];
    const delta = previous ? entry.value - previous.value : null;
    return `<div class="social-analytics-row">
      <span>${escapeHtml(formatFollowerTimestamp(entry.fetchedAt))}</span>
      <strong>${new Intl.NumberFormat().format(entry.value)}</strong>
      <span>${escapeHtml(formatFollowerMetricValue(delta))}</span>
    </div>`;
  }).join('');

  const rangePills = Object.keys(SOCIAL_ANALYTICS_RANGE_WINDOWS).map((rangeKey) => {
    const active = rangeKey === activeRange;
    return `<button type="button" class="social-analytics-range-pill${active ? ' is-active' : ''}" data-social-analytics-range="${escapeHtml(rangeKey)}">${escapeHtml(rangeKey)}</button>`;
  }).join('');

  const dailyRows = dailyRollups.map((entry) => `<div class="social-analytics-row">
      <span>${escapeHtml(entry.label)} <span class="note-meta">(${entry.samples} pts)</span></span>
      <strong>${escapeHtml(formatFollowerMetricValue(entry.net))}</strong>
      <span>${new Intl.NumberFormat().format(entry.close)}</span>
    </div>`).join('');

  const contentRows = contentItems.map((item, index) => {
    const shareCount = item.shareCount != null ? item.shareCount : item.repostCount;
    const primaryReactionLabel = analytics.key === 'facebook' ? 'Reactions' : 'Likes';
    return `<div class="social-analytics-content-item">
      <div class="social-analytics-content-item-head">
        <div>
          <span class="social-analytics-kicker">#${index + 1} · ${escapeHtml(formatSocialContentType(item))}</span>
          <strong>${escapeHtml(trimSocialCaption(item.caption, 132))}</strong>
        </div>
        ${safeExternalUrl(item.permalink) ? `<a class="social-followers-link" href="${escapeAttribute(safeExternalUrl(item.permalink))}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
      </div>
      <div class="social-analytics-content-metrics">
        <span>Posted ${escapeHtml(formatFollowerTimestamp(item.takenAt))}</span>
        <span>Interactions ${escapeHtml(formatSocialMetricValue(item.interactionCount))}</span>
        <span>${escapeHtml(primaryReactionLabel)} ${escapeHtml(formatSocialMetricValue(item.likeCount))}</span>
        <span>Comments ${escapeHtml(formatSocialMetricValue(item.commentCount))}</span>
        ${shareCount != null ? `<span>Shares ${escapeHtml(formatSocialMetricValue(shareCount))}</span>` : ''}
        ${item.saveCount != null ? `<span>Saves ${escapeHtml(formatSocialMetricValue(item.saveCount))}</span>` : ''}
        ${item.reachCount != null ? `<span>Reach ${escapeHtml(formatSocialMetricValue(item.reachCount))}</span>` : ''}
        ${item.viewCount != null ? `<span>Views ${escapeHtml(formatSocialMetricValue(item.viewCount))}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  const summaryReactionLabel = analytics.key === 'facebook' ? 'Reactions' : 'Likes';
  const insightEntries = contentInsights ? [
    ['Followers', contentInsights.followersCount],
    ['Views', contentInsights.views],
    ['Reach', contentInsights.reach],
    ['Engaged', contentInsights.accountsEngaged],
    ['Interactions', contentInsights.totalInteractions],
    [summaryReactionLabel, contentInsights.likes],
    ['Comments', contentInsights.comments],
    ['Shares', contentInsights.shares],
    ['Saves', contentInsights.saves],
    ['Replies', contentInsights.replies],
  ].filter(([, value]) => Number.isFinite(Number(value))) : [];
  const insightsHeading = analytics.key === 'facebook' ? 'Page post snapshot' : 'Account insight snapshot';
  const insightsNote = analytics.key === 'facebook'
    ? 'Official Meta metrics aggregated from recent Facebook Page posts.'
    : 'Official Meta insights from the connected Instagram professional account.';

  const insightsPanel = insightEntries.length
    ? `<section class="social-analytics-panel">
        <div class="social-analytics-panel-head">
          <div>
            <span class="social-analytics-kicker">${escapeHtml(insightsHeading)}</span>
            <strong>Last ${escapeHtml(String(contentInsights?.rangeDays || 7))} days</strong>
          </div>
          <div class="social-analytics-chart-meta">
            ${contentInsights?.since ? `<span>${escapeHtml(formatFollowerTimestamp(contentInsights.since))}</span>` : ''}
            ${contentInsights?.until ? `<span>${escapeHtml(formatFollowerTimestamp(contentInsights.until))}</span>` : ''}
          </div>
        </div>
        <div class="note-meta">${escapeHtml(insightsNote)}</div>
        <div class="social-analytics-content-summary">
          ${insightEntries.map(([label, value]) => `<span>${escapeHtml(label)} <strong>${escapeHtml(formatSocialMetricValue(value))}</strong></span>`).join('')}
        </div>
      </section>`
    : ((contentAnalytics.supported && contentAnalytics.status?.lastError && /graph|token|meta/i.test(String(contentAnalytics.status.lastError || '')))
      ? `<section class="social-analytics-panel">
          <div class="social-analytics-panel-head">
            <div>
              <span class="social-analytics-kicker">${escapeHtml(insightsHeading)}</span>
              <strong>Official insights unavailable</strong>
            </div>
          </div>
          <div class="note-meta">${escapeHtml(String(contentAnalytics.status.lastError || '').slice(0, 260))}</div>
        </section>`
    : '');

  const contentPanel = !contentAnalytics.supported
    ? `<section class="social-analytics-panel">
        <div class="social-analytics-panel-head">
          <div>
            <span class="social-analytics-kicker">${escapeHtml(contentAnalytics.label)}</span>
            <strong>Coming online</strong>
          </div>
        </div>
        <div class="note-meta">${escapeHtml(contentAnalytics.note)}</div>
      </section>`
    : `<section class="social-analytics-panel">
        <div class="social-analytics-panel-head">
          <div>
            <span class="social-analytics-kicker">${escapeHtml(contentAnalytics.label)}</span>
            <strong>${contentSummary?.itemCount ? `${contentSummary.itemCount} recent posts sampled` : 'No recent posts yet'}</strong>
          </div>
          <div class="social-analytics-chart-meta">
            ${contentAnalytics.source ? `<span>${escapeHtml(contentAnalytics.source)}</span>` : ''}
            ${contentAnalytics.fetchedAt ? `<span>${escapeHtml(formatFollowerTimestamp(contentAnalytics.fetchedAt))}</span>` : ''}
          </div>
        </div>
        <div class="note-meta">${escapeHtml(contentAnalytics.note)}</div>
        ${contentSummary?.itemCount ? `<div class="social-analytics-content-summary">
          <span>Avg interactions <strong>${escapeHtml(formatSocialMetricValue(contentSummary.avgInteractions))}</strong></span>
          <span>Avg ${escapeHtml(summaryReactionLabel.toLowerCase())} <strong>${escapeHtml(formatSocialMetricValue(contentSummary.avgLikes))}</strong></span>
          <span>Avg comments <strong>${escapeHtml(formatSocialMetricValue(contentSummary.avgComments))}</strong></span>
          ${contentSummary?.avgShares != null ? `<span>Avg shares <strong>${escapeHtml(formatSocialMetricValue(contentSummary.avgShares))}</strong></span>` : ''}
          <span>Best post <strong>${escapeHtml(formatSocialMetricValue(contentSummary.topInteractionCount))}</strong></span>
        </div>` : ''}
        ${contentRows || `<div class="note-meta">${escapeHtml(contentAnalytics.status?.lastError || 'No content metrics available yet.')}</div>`}
      </section>`;

  body.innerHTML = `
    <section class="social-analytics-panel social-analytics-range-panel">
      <div class="social-analytics-panel-head">
        <div>
          <span class="social-analytics-kicker">Window</span>
          <strong>${escapeHtml(activeRange)}</strong>
        </div>
      </div>
      <div class="social-analytics-range-pills">${rangePills}</div>
    </section>
    <div class="social-analytics-summary-grid">
      <section class="social-analytics-panel">
        <span class="social-analytics-kicker">Current ${escapeHtml(analytics.currentLabel)}</span>
        <strong>${new Intl.NumberFormat().format(latestCount)}</strong>
        <div class="note-meta">${escapeHtml(formatFollowerAge(analytics.ageMs))}</div>
      </section>
      <section class="social-analytics-panel">
        <span class="social-analytics-kicker">Net change</span>
        <strong>${escapeHtml(formatFollowerMetricValue(analytics.rollingDelta1h))}</strong>
        <div class="note-meta">Past 1h</div>
      </section>
      <section class="social-analytics-panel">
        <span class="social-analytics-kicker">Net change</span>
        <strong>${escapeHtml(formatFollowerMetricValue(analytics.rollingDelta24h))}</strong>
        <div class="note-meta">Past 24h</div>
      </section>
      <section class="social-analytics-panel">
        <span class="social-analytics-kicker">Capture cadence</span>
        <strong>${escapeHtml(formatDurationCompact(avgIntervalMs))}</strong>
        <div class="note-meta">${visibleHistory.length} samples in view</div>
      </section>
      <section class="social-analytics-panel">
        <span class="social-analytics-kicker">Window net</span>
        <strong>${escapeHtml(formatFollowerMetricValue(windowStats.net))}</strong>
        <div class="note-meta">${escapeHtml(formatDurationCompact(windowStats.spanMs))}</div>
      </section>
      <section class="social-analytics-panel">
        <span class="social-analytics-kicker">Average pace</span>
        <strong>${escapeHtml(formatFollowerRatePerHour(windowStats.avgPerHour))}</strong>
        <div class="note-meta">Across the active window</div>
      </section>
      <section class="social-analytics-panel">
        <span class="social-analytics-kicker">Best jump</span>
        <strong>${escapeHtml(formatFollowerMetricValue(windowStats.bestGain))}</strong>
        <div class="note-meta">Largest positive sample delta</div>
      </section>
      <section class="social-analytics-panel">
        <span class="social-analytics-kicker">Worst dip</span>
        <strong>${escapeHtml(formatFollowerMetricValue(windowStats.worstDrop))}</strong>
        <div class="note-meta">Largest negative sample delta</div>
      </section>
      <section class="social-analytics-panel">
        <span class="social-analytics-kicker">Momentum</span>
        <strong>${escapeHtml(formatFollowerRatePerHour(windowStats.momentum))}</strong>
        <div class="note-meta">Recent pace vs earlier pace</div>
      </section>
    </div>
    <section class="social-analytics-panel social-analytics-chart-panel">
      <div class="social-analytics-panel-head">
        <div>
          <span class="social-analytics-kicker">Follower trend</span>
          <strong>${escapeHtml(formatFollowerMetricValue(windowStats.net))}</strong>
        </div>
        <div class="social-analytics-chart-meta">
          <span>Window ${escapeHtml(formatDurationCompact(windowStats.spanMs))}</span>
          <span>High ${Number.isFinite(visibleHigh) ? new Intl.NumberFormat().format(visibleHigh) : 'n/a'}</span>
          <span>Low ${Number.isFinite(visibleLow) ? new Intl.NumberFormat().format(visibleLow) : 'n/a'}</span>
        </div>
      </div>
      ${visibleHistory.length > 1
        ? buildFollowerSparkline(visibleHistory)
        : '<div class="note-meta">More snapshots will fill this chart in.</div>'}
      <div class="social-analytics-range">
        <span>${escapeHtml(visibleHistory.length ? formatFollowerTimestamp(visibleHistory[0].fetchedAt) : 'n/a')}</span>
        <span>${escapeHtml(visibleHistory.length ? formatFollowerTimestamp(visibleHistory[visibleHistory.length - 1].fetchedAt) : 'n/a')}</span>
      </div>
    </section>
    ${insightsPanel}
    ${contentPanel}
    <section class="social-analytics-panel">
      <div class="social-analytics-panel-head">
        <div>
          <span class="social-analytics-kicker">Recent snapshots</span>
          <strong>Latest 12 points</strong>
        </div>
      </div>
      <div class="social-analytics-table">
        <div class="social-analytics-row social-analytics-row--head">
          <span>Captured</span>
          <span>Followers</span>
          <span>Δ</span>
        </div>
        ${recentRows || '<div class="note-meta">No snapshots yet.</div>'}
      </div>
    </section>
    <section class="social-analytics-panel">
      <div class="social-analytics-panel-head">
        <div>
          <span class="social-analytics-kicker">Daily rollup</span>
          <strong>Latest 7 days in range</strong>
        </div>
      </div>
      <div class="social-analytics-table">
        <div class="social-analytics-row social-analytics-row--head">
          <span>Day</span>
          <span>Net</span>
          <span>Close</span>
        </div>
        ${dailyRows || '<div class="note-meta">Not enough history for daily rollups yet.</div>'}
      </div>
    </section>`;
}

async function openSocialAnalyticsDialog(network){
  const key = String(network || '').trim().toLowerCase();
  if (key === 'facebook') await Promise.allSettled([fetchFacebookFollowers(), fetchFacebookContent()]);
  else if (key === 'tiktok') await fetchTikTokFollowers();
  else if (key === 'community') await fetchFacebookGroupMembers();
  else await Promise.allSettled([fetchInstagramFollowers(), fetchInstagramContent()]);
  const dialog = document.getElementById('socialAnalyticsDialog');
  if (!dialog) return;
  dialog.dataset.network = key;
  renderInstagramAnalyticsDialog();
  if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
}

async function refreshSocialAnalyticsDialog(){
  const dialog = document.getElementById('socialAnalyticsDialog');
  const key = String(dialog?.dataset?.network || '').trim().toLowerCase();
  const btn = document.getElementById('socialAnalyticsRefreshBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
  }
  try {
    if (key === 'facebook') await Promise.allSettled([fetchFacebookFollowers({ manual: true }), fetchFacebookContent({ manual: true })]);
    else if (key === 'tiktok') await fetchTikTokFollowers({ manual: true });
    else if (key === 'community') await fetchFacebookGroupMembers({ manual: true });
    else await Promise.allSettled([fetchInstagramFollowers({ manual: true }), fetchInstagramContent({ manual: true })]);
    renderSocialFollowersPod({ skipFetch: true });
    renderInstagramAnalyticsDialog();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Refresh';
    }
  }
}

async function fetchFacebookFollowers(options = {}){
  state.facebookFollowers = state.facebookFollowers && typeof state.facebookFollowers === 'object' ? state.facebookFollowers : { followersCount: null, fanCount: null, delta: null, rollingDelta1h: null, rollingDelta24h: null, pageName: '', pageId: '', fetchedAt: '', source: '', staleLevel: 'fresh', ageMs: null, lastError: '', loading: false };
  const manual = !!options.manual;
  const endpoint = manual ? '/api/facebook-followers/refresh?source=manual' : '/api/facebook-followers';
  const method = manual ? 'POST' : 'GET';
  const backoffMs = pollingBackoffState('facebook-followers').backoffUntil - Date.now();
  if (!manual && backoffMs > 0) return null;
  state.facebookFollowers.loading = true;
  try {
    const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && !payload?.status) throw new Error(payload?.error || payload?.message || 'facebook followers fetch failed');
    state.facebookFollowers.followersCount = Number.isFinite(Number(payload?.latest?.followersCount)) ? Number(payload.latest.followersCount) : null;
    state.facebookFollowers.fanCount = Number.isFinite(Number(payload?.latest?.fanCount)) ? Number(payload.latest.fanCount) : null;
    state.facebookFollowers.delta = Number.isFinite(Number(payload?.latest?.delta)) ? Number(payload.latest.delta) : null;
    state.facebookFollowers.rollingDelta1h = Number.isFinite(Number(payload?.latest?.rollingDelta1h)) ? Number(payload.latest.rollingDelta1h) : null;
    state.facebookFollowers.rollingDelta24h = Number.isFinite(Number(payload?.latest?.rollingDelta24h)) ? Number(payload.latest.rollingDelta24h) : null;
    state.facebookFollowers.pageName = String(payload?.page?.name || '');
    state.facebookFollowers.pageId = String(payload?.page?.id || '');
    state.facebookFollowers.fetchedAt = String(payload?.latest?.fetchedAt || payload?.status?.lastSuccessAt || '');
    state.facebookFollowers.source = String(payload?.latest?.source || '');
    state.facebookFollowers.staleLevel = String(payload?.status?.staleLevel || 'critical');
    state.facebookFollowers.ageMs = Number.isFinite(Number(payload?.status?.ageMs)) ? Number(payload.status.ageMs) : null;
    state.facebookFollowers.lastError = String(payload?.status?.lastError || '').slice(0, 300);
    socialAnalyticsRuntime.facebookHistory = Array.isArray(payload?.history) ? payload.history.slice() : [];
    clearPollingBackoff('facebook-followers');
  } catch (error) {
    const backoff = registerPollingFailure('facebook-followers', error, 'Facebook followers unavailable');
    state.facebookFollowers.lastError = String(error?.message || error || 'fetch_failed').slice(0, 300);
    if (!state.facebookFollowers.staleLevel) state.facebookFollowers.staleLevel = 'critical';
    setPodStatusSignal('facebook-followers', 'stale', 'retry ' + Math.ceil(backoff / 1000) + 's');
  } finally {
    state.facebookFollowers.loading = false;
  }
  return state.facebookFollowers;
}

async function fetchFacebookContent(options = {}){
  const manual = !!options.manual;
  const endpoint = manual ? '/api/facebook-content/refresh?source=manual' : '/api/facebook-content';
  const method = manual ? 'POST' : 'GET';
  try {
    const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && !payload?.status) throw new Error(payload?.message || payload?.error || 'facebook content fetch failed');
    socialAnalyticsRuntime.contentByNetwork.facebook = {
      ok: !!payload?.ok,
      profile: {
        id: String(payload?.profile?.id || state.facebookFollowers?.pageId || ''),
        name: String(payload?.profile?.name || state.facebookFollowers?.pageName || ''),
        url: String(payload?.profile?.url || ''),
      },
      fetchedAt: String(payload?.fetchedAt || ''),
      source: String(payload?.source || ''),
      insights: payload?.insights || null,
      summary: payload?.summary || null,
      items: Array.isArray(payload?.items) ? payload.items.slice() : [],
      status: {
        staleLevel: String(payload?.status?.staleLevel || 'critical'),
        ageMs: Number.isFinite(Number(payload?.status?.ageMs)) ? Number(payload.status.ageMs) : null,
        lastError: String(payload?.status?.lastError || '').slice(0, 300),
      },
    };
  } catch (error) {
    const current = socialAnalyticsRuntime.contentByNetwork.facebook || {};
    socialAnalyticsRuntime.contentByNetwork.facebook = {
      ok: !!current.ok,
      profile: current.profile || { id: '', name: '', url: '' },
      fetchedAt: String(current.fetchedAt || ''),
      source: String(current.source || ''),
      insights: current.insights || null,
      summary: current.summary || null,
      items: Array.isArray(current.items) ? current.items.slice() : [],
      status: {
        staleLevel: String(current?.status?.staleLevel || 'critical'),
        ageMs: Number.isFinite(Number(current?.status?.ageMs)) ? Number(current.status.ageMs) : null,
        lastError: String(error?.message || error || 'fetch_failed').slice(0, 300),
      },
    };
  }
  return socialAnalyticsRuntime.contentByNetwork.facebook;
}

async function fetchFacebookGroupMembers(options = {}){
  state.facebookGroupMembers = state.facebookGroupMembers && typeof state.facebookGroupMembers === 'object' ? state.facebookGroupMembers : { membersCount: null, delta: null, rollingDelta1h: null, rollingDelta24h: null, groupName: 'Blast From the Ads Community', groupUrl: 'https://www.facebook.com/groups/blastfromtheads', fetchedAt: '', source: '', staleLevel: 'fresh', ageMs: null, setupRequired: false, lastError: '', loading: false };
  const manual = !!options.manual;
  const endpoint = manual ? '/api/facebook-group-members/refresh?source=manual' : '/api/facebook-group-members';
  const method = manual ? 'POST' : 'GET';
  state.facebookGroupMembers.loading = true;
  try {
    const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && !payload?.status) throw new Error(payload?.error || payload?.message || 'facebook group members fetch failed');
    state.facebookGroupMembers.membersCount = Number.isFinite(Number(payload?.latest?.membersCount)) ? Number(payload.latest.membersCount) : null;
    state.facebookGroupMembers.delta = Number.isFinite(Number(payload?.latest?.delta)) ? Number(payload.latest.delta) : null;
    state.facebookGroupMembers.rollingDelta1h = Number.isFinite(Number(payload?.latest?.rollingDelta1h)) ? Number(payload.latest.rollingDelta1h) : null;
    state.facebookGroupMembers.rollingDelta24h = Number.isFinite(Number(payload?.latest?.rollingDelta24h)) ? Number(payload.latest.rollingDelta24h) : null;
    state.facebookGroupMembers.groupName = String(payload?.group?.name || 'Blast From the Ads Community');
    state.facebookGroupMembers.groupUrl = String(payload?.group?.url || 'https://www.facebook.com/groups/blastfromtheads');
    state.facebookGroupMembers.fetchedAt = String(payload?.latest?.fetchedAt || payload?.status?.lastSuccessAt || '');
    state.facebookGroupMembers.source = String(payload?.latest?.source || '');
    state.facebookGroupMembers.staleLevel = String(payload?.status?.staleLevel || 'critical');
    state.facebookGroupMembers.ageMs = Number.isFinite(Number(payload?.status?.ageMs)) ? Number(payload.status.ageMs) : null;
    state.facebookGroupMembers.setupRequired = !!payload?.status?.setupRequired;
    state.facebookGroupMembers.lastError = String(payload?.status?.lastError || '').slice(0, 300);
    socialAnalyticsRuntime.communityHistory = Array.isArray(payload?.history) ? payload.history.slice() : [];
  } catch (error) {
    state.facebookGroupMembers.lastError = String(error?.message || error || 'fetch_failed').slice(0, 300);
    if (!state.facebookGroupMembers.staleLevel) state.facebookGroupMembers.staleLevel = 'critical';
  } finally {
    state.facebookGroupMembers.loading = false;
  }
  return state.facebookGroupMembers;
}

function renderFacebookFollowersPod(options = {}){
  const el = document.getElementById('facebookFollowersWidget');
  const meta = document.getElementById('facebookFollowersUpdatedAt');
  if (!el || !meta) return;
  fetchFacebookFollowers(options).then(() => {
    const ff = state.facebookFollowers || {};
    const count = Number.isFinite(Number(ff.followersCount)) ? Number(ff.followersCount) : null;
    const fallback = Number.isFinite(Number(ff.fanCount)) ? Number(ff.fanCount) : null;
    const displayCount = Number.isFinite(count) ? count : fallback;
    const stale = String(ff.staleLevel || 'critical');
    if (stale === 'fresh') setPodStatusSignal('facebook-followers', 'fresh', 'live');
    else if (stale === 'stale') setPodStatusSignal('facebook-followers', 'stale', 'stale');
    else setPodStatusSignal('facebook-followers', 'error', 'critical stale');

    if (displayCount == null) {
      el.innerHTML = '<div class="note-meta">No Facebook follower data yet. Configure Meta Graph credentials or set FACEBOOK_PAGE_URL for fallback scrape mode, then refresh.</div>';
      meta.textContent = ff.lastError ? ('Error: ' + ff.lastError) : 'Waiting for first successful fetch.';
      return;
    }

    const sourceLabel = formatFacebookFollowerSourceLabel(ff.source);
    const deltaVal = Number.isFinite(Number(ff.delta)) ? Number(ff.delta) : null;
    const deltaClass = deltaVal == null ? 'followers-delta--neutral' : (deltaVal > 0 ? 'followers-delta--up' : (deltaVal < 0 ? 'followers-delta--down' : 'followers-delta--neutral'));
    const deltaPrefix = deltaVal != null && deltaVal > 0 ? '+' : '';
    const deltaText = deltaVal == null ? 'Δ n/a' : ('Δ ' + deltaPrefix + new Intl.NumberFormat().format(deltaVal));
    const rolling1h = Number.isFinite(Number(ff.rollingDelta1h)) ? Number(ff.rollingDelta1h) : null;
    const rolling24h = Number.isFinite(Number(ff.rollingDelta24h)) ? Number(ff.rollingDelta24h) : null;
    const rolling1hPrefix = rolling1h != null && rolling1h > 0 ? '+' : '';
    const rolling24hPrefix = rolling24h != null && rolling24h > 0 ? '+' : '';
    const formatRolling = (value, prefix) => value == null ? 'n/a' : (prefix + new Intl.NumberFormat().format(value));

    el.innerHTML = '<div class="followers-count">' + new Intl.NumberFormat().format(displayCount) + '</div>' +
      '<div class="followers-delta ' + deltaClass + '">' + deltaText + '</div>' +
      '<div class="followers-metrics-grid">' +
        '<div class="followers-metric"><div class="followers-metric-label">New followers · 1h</div><div class="followers-metric-value">' + formatRolling(rolling1h, rolling1hPrefix) + '</div></div>' +
        '<div class="followers-metric"><div class="followers-metric-label">New followers · 24h</div><div class="followers-metric-value">' + formatRolling(rolling24h, rolling24hPrefix) + '</div></div>' +
      '</div>' +
      '<div class="note-meta">Page: ' + escapeHtml(ff.pageName || ff.pageId || 'Unknown') + ' <span class="badge">' + escapeHtml(sourceLabel) + '</span>' + (count == null && fallback != null ? ' · source fan_count fallback' : '') + '</div>';

    const ageLabel = Number.isFinite(Number(ff.ageMs)) ? Math.floor(Number(ff.ageMs) / 60000) + 'm ago' : 'unknown';
    meta.textContent = 'Updated: ' + (ff.fetchedAt ? new Date(ff.fetchedAt).toLocaleTimeString() : 'n/a') + ' · ' + stale + ' · ' + ageLabel;
  });
}



async function fetchInstagramFollowers(options = {}){
  state.instagramFollowers = state.instagramFollowers && typeof state.instagramFollowers === 'object' ? state.instagramFollowers : { followersCount: null, delta: null, rollingDelta1h: null, rollingDelta24h: null, profileName: '', profileHandle: '', fetchedAt: '', source: '', staleLevel: 'fresh', ageMs: null, lastError: '', loading: false };
  const manual = !!options.manual;
  const endpoint = manual ? '/api/instagram-followers/refresh?source=manual' : '/api/instagram-followers';
  const method = manual ? 'POST' : 'GET';
  const backoffMs = pollingBackoffState('instagram-followers').backoffUntil - Date.now();
  if (!manual && backoffMs > 0) return null;
  state.instagramFollowers.loading = true;
  try {
    const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && !payload?.status) throw new Error(payload?.error || payload?.message || 'instagram followers fetch failed');
    state.instagramFollowers.followersCount = Number.isFinite(Number(payload?.latest?.followersCount)) ? Number(payload.latest.followersCount) : null;
    state.instagramFollowers.delta = Number.isFinite(Number(payload?.latest?.delta)) ? Number(payload.latest.delta) : null;
    state.instagramFollowers.rollingDelta1h = Number.isFinite(Number(payload?.latest?.rollingDelta1h)) ? Number(payload.latest.rollingDelta1h) : null;
    state.instagramFollowers.rollingDelta24h = Number.isFinite(Number(payload?.latest?.rollingDelta24h)) ? Number(payload.latest.rollingDelta24h) : null;
    state.instagramFollowers.profileName = String(payload?.profile?.name || '');
    state.instagramFollowers.profileHandle = String(payload?.profile?.handle || '');
    state.instagramFollowers.fetchedAt = String(payload?.latest?.fetchedAt || payload?.status?.lastSuccessAt || '');
    state.instagramFollowers.source = String(payload?.latest?.source || '');
    state.instagramFollowers.staleLevel = String(payload?.status?.staleLevel || 'critical');
    state.instagramFollowers.ageMs = Number.isFinite(Number(payload?.status?.ageMs)) ? Number(payload.status.ageMs) : null;
    state.instagramFollowers.lastError = String(payload?.status?.lastError || '').slice(0, 300);
    socialAnalyticsRuntime.instagramHistory = Array.isArray(payload?.history) ? payload.history.slice() : [];
    clearPollingBackoff('instagram-followers');
  } catch (error) {
    const backoff = registerPollingFailure('instagram-followers', error, 'Instagram followers unavailable');
    state.instagramFollowers.lastError = String(error?.message || error || 'fetch_failed').slice(0, 300);
    if (!state.instagramFollowers.staleLevel) state.instagramFollowers.staleLevel = 'critical';
    setPodStatusSignal('instagram-followers', 'stale', 'retry ' + Math.ceil(backoff / 1000) + 's');
  } finally {
    state.instagramFollowers.loading = false;
  }
  return state.instagramFollowers;
}

async function fetchInstagramContent(options = {}){
  const manual = !!options.manual;
  const endpoint = manual ? '/api/instagram-content/refresh?source=manual' : '/api/instagram-content';
  const method = manual ? 'POST' : 'GET';
  try {
    const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && !payload?.status) throw new Error(payload?.message || payload?.error || 'instagram content fetch failed');
    socialAnalyticsRuntime.contentByNetwork.instagram = {
      ok: !!payload?.ok,
      profile: {
        handle: String(payload?.profile?.handle || state.instagramFollowers?.profileHandle || ''),
        name: String(payload?.profile?.name || state.instagramFollowers?.profileName || ''),
        url: String(payload?.profile?.url || (state.instagramFollowers?.profileHandle ? `https://www.instagram.com/${state.instagramFollowers.profileHandle}/` : '')),
      },
      fetchedAt: String(payload?.fetchedAt || ''),
      source: String(payload?.source || ''),
      insights: payload?.insights || null,
      summary: payload?.summary || null,
      items: Array.isArray(payload?.items) ? payload.items.slice() : [],
      status: {
        staleLevel: String(payload?.status?.staleLevel || 'critical'),
        ageMs: Number.isFinite(Number(payload?.status?.ageMs)) ? Number(payload.status.ageMs) : null,
        lastError: String(payload?.status?.lastError || '').slice(0, 300),
      },
    };
  } catch (error) {
    const current = socialAnalyticsRuntime.contentByNetwork.instagram || {};
    socialAnalyticsRuntime.contentByNetwork.instagram = {
      ok: !!current.ok,
      profile: current.profile || { handle: '', name: '', url: '' },
      fetchedAt: String(current.fetchedAt || ''),
      source: String(current.source || ''),
      insights: current.insights || null,
      summary: current.summary || null,
      items: Array.isArray(current.items) ? current.items.slice() : [],
      status: {
        staleLevel: String(current?.status?.staleLevel || 'critical'),
        ageMs: Number.isFinite(Number(current?.status?.ageMs)) ? Number(current.status.ageMs) : null,
        lastError: String(error?.message || error || 'fetch_failed').slice(0, 300),
      },
    };
  }
  return socialAnalyticsRuntime.contentByNetwork.instagram;
}

function renderInstagramFollowersPod(options = {}){
  const el = document.getElementById('instagramFollowersWidget');
  const meta = document.getElementById('instagramFollowersUpdatedAt');
  if (!el || !meta) return;
  fetchInstagramFollowers(options).then(() => {
    const ig = state.instagramFollowers || {};
    const count = Number.isFinite(Number(ig.followersCount)) ? Number(ig.followersCount) : null;
    const stale = String(ig.staleLevel || 'critical');
    if (stale === 'fresh') setPodStatusSignal('instagram-followers', 'fresh', 'live');
    else if (stale === 'stale') setPodStatusSignal('instagram-followers', 'stale', 'stale');
    else setPodStatusSignal('instagram-followers', 'error', 'critical stale');

    if (count == null) {
      el.innerHTML = '<div class="note-meta">No Instagram follower data yet. Run one-time Meta Suite login: <code>node scripts/instagram-meta-suite-login.mjs --storage ./data/.auth/meta-suite-instagram-storage.json</code>, then refresh.</div>';
      meta.textContent = 'Waiting for first successful fetch.';
      return;
    }

    const deltaVal = Number.isFinite(Number(ig.delta)) ? Number(ig.delta) : null;
    const deltaClass = deltaVal == null ? 'followers-delta--neutral' : (deltaVal > 0 ? 'followers-delta--up' : (deltaVal < 0 ? 'followers-delta--down' : 'followers-delta--neutral'));
    const deltaPrefix = deltaVal != null && deltaVal > 0 ? '+' : '';
    const deltaText = deltaVal == null ? 'Δ n/a' : ('Δ ' + deltaPrefix + new Intl.NumberFormat().format(deltaVal));
    const rolling1h = Number.isFinite(Number(ig.rollingDelta1h)) ? Number(ig.rollingDelta1h) : null;
    const rolling24h = Number.isFinite(Number(ig.rollingDelta24h)) ? Number(ig.rollingDelta24h) : null;
    const rolling1hPrefix = rolling1h != null && rolling1h > 0 ? '+' : '';
    const rolling24hPrefix = rolling24h != null && rolling24h > 0 ? '+' : '';
    const formatRolling = (value, prefix) => value == null ? 'n/a' : (prefix + new Intl.NumberFormat().format(value));
    const profileLabel = ig.profileName || (ig.profileHandle ? ('@' + ig.profileHandle) : 'Unknown');
    el.innerHTML = '<div class="followers-count">' + new Intl.NumberFormat().format(count) + '</div>' +
      '<div class="followers-delta ' + deltaClass + '">' + deltaText + '</div>' +
      '<div class="followers-metrics-grid">' +
        '<div class="followers-metric"><div class="followers-metric-label">New followers · 1h</div><div class="followers-metric-value">' + formatRolling(rolling1h, rolling1hPrefix) + '</div></div>' +
        '<div class="followers-metric"><div class="followers-metric-label">New followers · 24h</div><div class="followers-metric-value">' + formatRolling(rolling24h, rolling24hPrefix) + '</div></div>' +
      '</div>' +
      '<div class="note-meta">Profile: ' + escapeHtml(profileLabel) + ' <span class="badge">' + escapeHtml(ig.source || 'placeholder_env') + '</span></div>';

    const ageLabel = Number.isFinite(Number(ig.ageMs)) ? Math.floor(Number(ig.ageMs) / 60000) + 'm ago' : 'unknown';
    meta.textContent = 'Updated: ' + (ig.fetchedAt ? new Date(ig.fetchedAt).toLocaleTimeString() : 'n/a') + ' · ' + stale + ' · ' + ageLabel;
  });
}

async function fetchTikTokFollowers(options = {}){
  state.tiktokFollowers = state.tiktokFollowers && typeof state.tiktokFollowers === 'object' ? state.tiktokFollowers : { followersCount: null, delta: null, rollingDelta1h: null, rollingDelta24h: null, profileName: '', profileHandle: '', profileUrl: '', fetchedAt: '', source: '', staleLevel: 'fresh', ageMs: null, setupRequired: false, lastError: '', loading: false };
  const manual = !!options.manual;
  const endpoint = manual ? '/api/tiktok-followers/refresh?source=manual' : '/api/tiktok-followers';
  const method = manual ? 'POST' : 'GET';
  const backoffMs = pollingBackoffState('tiktok-followers').backoffUntil - Date.now();
  if (!manual && backoffMs > 0) return null;
  state.tiktokFollowers.loading = true;
  try {
    const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && !payload?.status) throw new Error(payload?.error || payload?.message || 'tiktok followers fetch failed');
    state.tiktokFollowers.followersCount = Number.isFinite(Number(payload?.latest?.followersCount)) ? Number(payload.latest.followersCount) : null;
    state.tiktokFollowers.delta = Number.isFinite(Number(payload?.latest?.delta)) ? Number(payload.latest.delta) : null;
    state.tiktokFollowers.rollingDelta1h = Number.isFinite(Number(payload?.latest?.rollingDelta1h)) ? Number(payload.latest.rollingDelta1h) : null;
    state.tiktokFollowers.rollingDelta24h = Number.isFinite(Number(payload?.latest?.rollingDelta24h)) ? Number(payload.latest.rollingDelta24h) : null;
    state.tiktokFollowers.profileName = String(payload?.profile?.name || 'TikTok');
    state.tiktokFollowers.profileHandle = String(payload?.profile?.handle || '');
    state.tiktokFollowers.profileUrl = String(payload?.profile?.url || '');
    state.tiktokFollowers.fetchedAt = String(payload?.latest?.fetchedAt || payload?.status?.lastSuccessAt || '');
    state.tiktokFollowers.source = String(payload?.latest?.source || '');
    state.tiktokFollowers.staleLevel = String(payload?.status?.staleLevel || 'critical');
    state.tiktokFollowers.ageMs = Number.isFinite(Number(payload?.status?.ageMs)) ? Number(payload.status.ageMs) : null;
    state.tiktokFollowers.setupRequired = !!payload?.status?.setupRequired;
    state.tiktokFollowers.lastError = String(payload?.status?.lastError || '').slice(0, 300);
    socialAnalyticsRuntime.tiktokHistory = Array.isArray(payload?.history) ? payload.history.slice() : [];
    clearPollingBackoff('tiktok-followers');
  } catch (error) {
    const backoff = registerPollingFailure('tiktok-followers', error, 'TikTok followers unavailable');
    state.tiktokFollowers.lastError = String(error?.message || error || 'fetch_failed').slice(0, 300);
    if (!state.tiktokFollowers.staleLevel) state.tiktokFollowers.staleLevel = 'critical';
    setPodStatusSignal('tiktok-followers', 'stale', 'retry ' + Math.ceil(backoff / 1000) + 's');
  } finally {
    state.tiktokFollowers.loading = false;
  }
  return state.tiktokFollowers;
}

function renderTikTokFollowersPod(options = {}){
  const el = document.getElementById('tiktokFollowersWidget');
  const meta = document.getElementById('tiktokFollowersUpdatedAt');
  if (!el || !meta) return;
  fetchTikTokFollowers(options).then(() => {
    const tt = state.tiktokFollowers || {};
    const count = Number.isFinite(Number(tt.followersCount)) ? Number(tt.followersCount) : null;
    const stale = String(tt.staleLevel || 'critical');
    if (stale === 'fresh') setPodStatusSignal('tiktok-followers', 'fresh', 'live');
    else if (stale === 'stale') setPodStatusSignal('tiktok-followers', 'stale', 'stale');
    else setPodStatusSignal('tiktok-followers', 'error', 'critical stale');

    if (tt.setupRequired) {
      el.innerHTML = '<div class="note-meta">Setup required: set <code>TIKTOK_PROFILE_HANDLE</code> (without @) or <code>TIKTOK_PROFILE_URL</code>, then refresh.</div>';
      meta.textContent = tt.lastError ? ('Error: ' + tt.lastError) : 'Waiting for TikTok profile setup.';
      return;
    }

    if (count == null) {
      el.innerHTML = '<div class="note-meta">No TikTok follower data yet. Add your profile handle/url and refresh.</div>';
      meta.textContent = tt.lastError ? ('Error: ' + tt.lastError) : 'Waiting for first successful fetch.';
      return;
    }

    const deltaVal = Number.isFinite(Number(tt.delta)) ? Number(tt.delta) : null;
    const deltaClass = deltaVal == null ? 'followers-delta--neutral' : (deltaVal > 0 ? 'followers-delta--up' : (deltaVal < 0 ? 'followers-delta--down' : 'followers-delta--neutral'));
    const deltaPrefix = deltaVal != null && deltaVal > 0 ? '+' : '';
    const deltaText = deltaVal == null ? 'Δ n/a' : ('Δ ' + deltaPrefix + new Intl.NumberFormat().format(deltaVal));
    const rolling1h = Number.isFinite(Number(tt.rollingDelta1h)) ? Number(tt.rollingDelta1h) : null;
    const rolling24h = Number.isFinite(Number(tt.rollingDelta24h)) ? Number(tt.rollingDelta24h) : null;
    const rolling1hPrefix = rolling1h != null && rolling1h > 0 ? '+' : '';
    const rolling24hPrefix = rolling24h != null && rolling24h > 0 ? '+' : '';
    const formatRolling = (value, prefix) => value == null ? 'n/a' : (prefix + new Intl.NumberFormat().format(value));
    const profileLabel = tt.profileName || (tt.profileHandle ? ('@' + tt.profileHandle) : 'Unknown');
    el.innerHTML = '<div class="followers-count">' + new Intl.NumberFormat().format(count) + '</div>' +
      '<div class="followers-delta ' + deltaClass + '">' + deltaText + '</div>' +
      '<div class="followers-metrics-grid">' +
        '<div class="followers-metric"><div class="followers-metric-label">New followers · 1h</div><div class="followers-metric-value">' + formatRolling(rolling1h, rolling1hPrefix) + '</div></div>' +
        '<div class="followers-metric"><div class="followers-metric-label">New followers · 24h</div><div class="followers-metric-value">' + formatRolling(rolling24h, rolling24hPrefix) + '</div></div>' +
      '</div>' +
      '<div class="note-meta">Profile: ' + escapeHtml(profileLabel) + ' <span class="badge">' + escapeHtml(tt.source || 'tiktok_public_scrape_estimate') + '</span></div>' +
      (tt.lastError ? ('<div class="note-meta">Last error: ' + escapeHtml(tt.lastError) + '</div>') : '');

    const ageLabel = Number.isFinite(Number(tt.ageMs)) ? Math.floor(Number(tt.ageMs) / 60000) + 'm ago' : 'unknown';
    meta.textContent = 'Updated: ' + (tt.fetchedAt ? new Date(tt.fetchedAt).toLocaleTimeString() : 'n/a') + ' · ' + stale + ' · ' + ageLabel;
  });
}

async function fetchYouTubeSubscribers(options = {}){
  state.youtubeSubscribers = state.youtubeSubscribers && typeof state.youtubeSubscribers === 'object' ? state.youtubeSubscribers : { subscribersCount: null, delta: null, channelName: '', channelUrl: '', fetchedAt: '', source: '', staleLevel: 'fresh', ageMs: null, setupRequired: false, lastError: '', loading: false };
  const manual = !!options.manual;
  const endpoint = manual ? '/api/youtube-subscribers/refresh?source=manual' : '/api/youtube-subscribers';
  const method = manual ? 'POST' : 'GET';
  const backoffMs = pollingBackoffState('youtube-subscribers').backoffUntil - Date.now();
  if (!manual && backoffMs > 0) return null;
  state.youtubeSubscribers.loading = true;
  try {
    const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok && !payload?.status) throw new Error(payload?.error || payload?.message || 'youtube subscribers fetch failed');
    state.youtubeSubscribers.subscribersCount = Number.isFinite(Number(payload?.latest?.subscribersCount)) ? Number(payload.latest.subscribersCount) : null;
    state.youtubeSubscribers.delta = Number.isFinite(Number(payload?.latest?.delta)) ? Number(payload.latest.delta) : null;
    state.youtubeSubscribers.channelName = String(payload?.channel?.name || 'YouTube');
    state.youtubeSubscribers.channelUrl = String(payload?.channel?.url || '');
    state.youtubeSubscribers.fetchedAt = String(payload?.latest?.fetchedAt || payload?.status?.lastSuccessAt || '');
    state.youtubeSubscribers.source = String(payload?.latest?.source || '');
    state.youtubeSubscribers.staleLevel = String(payload?.status?.staleLevel || 'critical');
    state.youtubeSubscribers.ageMs = Number.isFinite(Number(payload?.status?.ageMs)) ? Number(payload.status.ageMs) : null;
    state.youtubeSubscribers.setupRequired = !!payload?.status?.setupRequired;
    state.youtubeSubscribers.lastError = String(payload?.status?.lastError || '').slice(0, 300);
    clearPollingBackoff('youtube-subscribers');
  } catch (error) {
    const backoff = registerPollingFailure('youtube-subscribers', error, 'YouTube subscribers unavailable');
    state.youtubeSubscribers.lastError = String(error?.message || error || 'fetch_failed').slice(0, 300);
    if (!state.youtubeSubscribers.staleLevel) state.youtubeSubscribers.staleLevel = 'critical';
    setPodStatusSignal('youtube-subscribers', 'stale', 'retry ' + Math.ceil(backoff / 1000) + 's');
  } finally {
    state.youtubeSubscribers.loading = false;
  }
  return state.youtubeSubscribers;
}

function renderYouTubeSubscribersPod(options = {}){
  const el = document.getElementById('youtubeSubscribersWidget');
  const meta = document.getElementById('youtubeSubscribersUpdatedAt');
  if (!el || !meta) return;
  fetchYouTubeSubscribers(options).then(() => {
    const yt = state.youtubeSubscribers || {};
    const count = Number.isFinite(Number(yt.subscribersCount)) ? Number(yt.subscribersCount) : null;
    const stale = String(yt.staleLevel || 'critical');
    if (stale === 'fresh') setPodStatusSignal('youtube-subscribers', 'fresh', 'live');
    else if (stale === 'stale') setPodStatusSignal('youtube-subscribers', 'stale', 'stale');
    else setPodStatusSignal('youtube-subscribers', 'error', 'critical stale');

    if (yt.setupRequired) {
      el.innerHTML = '<div class="note-meta">Setup required: set <code>YOUTUBE_CHANNEL_URL</code>, then refresh.</div>';
      meta.textContent = yt.lastError ? ('Error: ' + yt.lastError) : 'Waiting for YouTube channel setup.';
      return;
    }

    if (count == null) {
      el.innerHTML = '<div class="note-meta">No YouTube subscriber data yet. Add your channel URL and refresh.</div>';
      meta.textContent = yt.lastError ? ('Error: ' + yt.lastError) : 'Waiting for first successful fetch.';
      return;
    }

    const deltaVal = Number.isFinite(Number(yt.delta)) ? Number(yt.delta) : null;
    const deltaClass = deltaVal == null ? 'followers-delta--neutral' : (deltaVal > 0 ? 'followers-delta--up' : (deltaVal < 0 ? 'followers-delta--down' : 'followers-delta--neutral'));
    const deltaPrefix = deltaVal != null && deltaVal > 0 ? '+' : '';
    const deltaText = deltaVal == null ? 'Δ n/a' : ('Δ ' + deltaPrefix + new Intl.NumberFormat().format(deltaVal));
    const channelLabel = yt.channelName || yt.channelUrl || 'Unknown';
    el.innerHTML = '<div class="followers-count">' + new Intl.NumberFormat().format(count) + '</div>' +
      '<div class="followers-delta ' + deltaClass + '">' + deltaText + '</div>' +
      '<div class="note-meta">Channel: ' + escapeHtml(channelLabel) + ' <span class="badge">' + escapeHtml(yt.source || 'youtube_public_scrape_estimate') + '</span></div>' +
      (yt.lastError ? ('<div class="note-meta">Last error: ' + escapeHtml(yt.lastError) + '</div>') : '');

    const ageLabel = Number.isFinite(Number(yt.ageMs)) ? Math.floor(Number(yt.ageMs) / 60000) + 'm ago' : 'unknown';
    meta.textContent = 'Updated: ' + (yt.fetchedAt ? new Date(yt.fetchedAt).toLocaleTimeString() : 'n/a') + ' · ' + stale + ' · ' + ageLabel;
  });
}

function updateEbayTrafficRefreshButton(){
  const btn = document.getElementById('ebayTrafficRefreshBtn');
  if (!btn) return;
  btn.disabled = ebayTrafficInFlight;
  btn.textContent = ebayTrafficInFlight ? 'Refreshing…' : 'Refresh';
}

function setEbayTrafficActiveStoreId(storeId){
  ebayTrafficActiveStoreId = String(storeId || '').trim();
  try { localStorage.setItem(EBAY_TRAFFIC_ACTIVE_STORE_KEY, ebayTrafficActiveStoreId); } catch {}
}

function setEbayTrafficActiveInsightView(view){
  ebayTrafficActiveInsightView = ebayTrafficStateFeature.normalizeInsightView(view);
  try { localStorage.setItem(EBAY_TRAFFIC_ACTIVE_INSIGHT_KEY, ebayTrafficActiveInsightView); } catch {}
}

function setEbayTrafficActiveListingsView(view){
  ebayTrafficActiveListingsView = ebayTrafficStateFeature.normalizeListingsView(view);
  try { localStorage.setItem(EBAY_TRAFFIC_ACTIVE_LISTINGS_KEY, ebayTrafficActiveListingsView); } catch {}
}

function setEbayTrafficPromoLiftWindow(view){
  ebayTrafficPromoLiftWindow = ebayTrafficStateFeature.normalizePromoLiftWindow(view);
  try { localStorage.setItem(EBAY_TRAFFIC_PROMO_LIFT_WINDOW_KEY, ebayTrafficPromoLiftWindow); } catch {}
}

function resolveEbayTrafficActiveStore(stores = []){
  const resolved = ebayTrafficStateFeature.resolveActiveStore(stores, ebayTrafficActiveStoreId);
  if (resolved.changed) setEbayTrafficActiveStoreId(resolved.storeId);
  return resolved.store;
}

function formatEbayTrafficNumber(value, options = {}){
  return ebayTrafficStateFeature.formatNumber(value, options);
}

function formatEbayTrafficPercent(value){
  return ebayTrafficStateFeature.formatPercent(value);
}

function formatEbayTrafficDecimal(value, options = {}){
  return ebayTrafficStateFeature.formatDecimal(value, options);
}

function formatEbayTrafficDateTimeLabel(value){
  return ebayTrafficStateFeature.formatDateTimeLabel(value);
}

function classifyEbayMarketingReportAge(value){
  return ebayTrafficStateFeature.classifyMarketingReportAge(value);
}

function buildEbayListingUrl(listingId, marketplaceId = 'EBAY_US'){
  return ebayTrafficStateFeature.buildListingUrl(listingId, marketplaceId);
}

function formatEbayTrafficDateLabel(value){
  return ebayTrafficStateFeature.formatDateLabel(value);
}

function renderEbayTrafficTag(label, tone = 'neutral'){
  return `<span class="ebay-traffic-tag ebay-traffic-tag-${tone}">${escapeHtml(label)}</span>`;
}

function renderEbayTrafficMetricCard(label, value, meta = '', tone = 'neutral'){
  return `
    <div class="ebay-traffic-metric-card ebay-traffic-metric-card-${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
    </div>
  `;
}

function formatEbayTrafficDeltaText(metric, suffix = 'vs previous day'){
  return ebayTrafficStateFeature.formatDeltaText(metric, suffix);
}

function renderEbayTrafficSnapshotMetricCard(label, metric, formatter, tone = 'neutral'){
  const direction = String(metric?.direction || 'flat');
  const deltaTone = direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'flat';
  const value = typeof formatter === 'function' ? formatter(metric?.value || 0) : String(metric?.value || 0);
  return `
    <article class="ebay-traffic-snapshot-card ebay-traffic-snapshot-card-${tone}">
      <span class="ebay-traffic-snapshot-label">${escapeHtml(label)}</span>
      <strong class="ebay-traffic-snapshot-value">${escapeHtml(value)}</strong>
      <small class="ebay-traffic-snapshot-delta ebay-traffic-snapshot-delta-${deltaTone}">${escapeHtml(formatEbayTrafficDeltaText(metric))}</small>
    </article>
  `;
}

function renderEbayTrafficStoreTabs(stores = [], activeStoreId = ''){
  const list = Array.isArray(stores) ? stores : [];
  if (list.length < 2) return '';
  return `
    <div class="ebay-traffic-store-tabs" role="tablist" aria-label="eBay stores">
      ${list.map((store) => {
        const isActive = String(store?.id || '') === String(activeStoreId || '');
        const status = String(store?.status || '').trim();
        const badgeTone = status === 'ok' ? 'fresh' : status === 'setup' ? 'neutral' : 'issue';
        const badgeLabel = status === 'ok' ? formatEbayTrafficNumber(store?.summary?.views || 0, { compact: true }) : status === 'setup' ? 'Setup' : 'Issue';
        return `
          <button
            class="ebay-traffic-store-tab ${isActive ? 'is-active' : ''}"
            type="button"
            role="tab"
            aria-selected="${isActive ? 'true' : 'false'}"
            data-ebay-traffic-store-id="${escapeHtml(String(store?.id || ''))}"
          >
            <span class="ebay-traffic-store-tab-label">${escapeHtml(String(store?.label || 'Store'))}</span>
            <span class="ebay-traffic-store-tab-badge ebay-traffic-store-tab-badge-${badgeTone}">${escapeHtml(badgeLabel)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderEbayTrafficTopListings(store){
  const { activeView, listings, hasWatchCounts } = ebayTrafficStateFeature.selectTopListings(store, ebayTrafficActiveListingsView);
  if (!listings.length) {
    return `
      <div class="ebay-traffic-empty-state">
        <strong>${activeView === 'watchers' ? 'No watcher counts returned' : 'No listing traffic returned'}</strong>
        <p>${activeView === 'watchers'
          ? (hasWatchCounts
            ? 'None of the current top listings have watchers yet.'
            : 'eBay did not return watcher counts for these listings right now.')
          : 'eBay did not return listing-level traffic rows for this store and date range yet.'}</p>
      </div>
    `;
  }
  return `
    <div class="ebay-traffic-table-wrap">
      <table class="ebay-traffic-table">
        <thead>
          <tr>
            <th>Listing</th>
            ${activeView === 'watchers' ? '<th>Watchers</th>' : '<th>Views</th>'}
            ${activeView === 'watchers' ? '<th>Views</th>' : '<th>Store</th>'}
            <th>Sales</th>
            <th>Conv.</th>
          </tr>
        </thead>
        <tbody>
          ${listings.map((entry) => `
            <tr>
              <td>
                <div class="ebay-traffic-listing-title">
                  <a
                    class="ebay-traffic-listing-link"
                    href="${escapeAttribute(safeExternalUrl(buildEbayListingUrl(entry?.listingId, store?.marketplaceId || 'EBAY_US')) || '#')}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >${escapeHtml(String(entry?.title || 'Untitled listing'))}</a>
                </div>
                <div class="ebay-traffic-listing-meta">${escapeHtml(String(entry?.listingId || ''))}</div>
              </td>
              <td>${escapeHtml(activeView === 'watchers' ? formatEbayTrafficNumber(entry?.watchCount || 0) : formatEbayTrafficNumber(entry?.views || 0))}</td>
              <td>${escapeHtml(activeView === 'watchers' ? formatEbayTrafficNumber(entry?.views || 0) : formatEbayTrafficNumber(entry?.storeImpressions || 0))}</td>
              <td>${escapeHtml(formatEbayTrafficNumber(entry?.transactions || 0))}</td>
              <td>${escapeHtml(formatEbayTrafficPercent(entry?.salesConversionRate))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEbayTrafficViewSources(store){
  const items = Array.isArray(store?.dailySnapshot?.viewSources) ? store.dailySnapshot.viewSources : [];
  if (!items.length) {
    return `
      <div class="ebay-traffic-empty-state">
        <strong>No source breakdown yet</strong>
        <p>eBay has not returned channel-level daily view sources for this store yet.</p>
      </div>
    `;
  }
  const maxValue = Math.max(...items.map((entry) => Number(entry?.value || 0)), 1);
  return `
    <div class="ebay-traffic-source-list">
      ${items.map((entry) => {
        const value = Number(entry?.value || 0);
        const width = Math.max(value > 0 ? 12 : 0, Math.round((value / maxValue) * 100));
        return `
          <div class="ebay-traffic-source-row">
            <div class="ebay-traffic-source-labels">
              <strong>${escapeHtml(String(entry?.label || 'Source'))}</strong>
              <span>${escapeHtml(formatEbayTrafficPercent(entry?.sharePercent))} of views</span>
            </div>
            <div class="ebay-traffic-source-bar"><span class="${ebayTrafficWidthClass(width)}"></span></div>
            <div class="ebay-traffic-source-value">${escapeHtml(formatEbayTrafficNumber(value))}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function ebayTrafficWidthClass(width){
  return ebayTrafficStateFeature.widthClass(width);
}

function renderEbayTrafficPromotionMix(store){
  const mix = store?.promotionMix && typeof store.promotionMix === 'object' ? store.promotionMix : null;
  const items = Array.isArray(mix?.items) ? mix.items : [];
  if (!items.length) {
    const pending = String(mix?.status || '').trim() === 'pending';
    const detail = Array.isArray(mix?.warnings) && mix.warnings.length
      ? String(mix.warnings[0] || '')
      : (pending
        ? 'eBay is still building the promoted-listings report for this store.'
        : 'Promoted-listing impression data is not available for this store yet.');
    return `
      <div class="ebay-traffic-empty-state">
        <strong>${pending ? 'Promoted mix warming up' : 'No promoted mix yet'}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
    `;
  }
  const maxValue = Math.max(...items.map((entry) => Number(entry?.value || 0)), 1);
  const toneClassMap = {
    organic: 'ebay-traffic-bar-fill--organic',
    promoted: 'ebay-traffic-bar-fill--promoted',
    offsite: 'linear-gradient(90deg, rgba(251, 191, 36, 0.82), rgba(244, 114, 182, 0.52))',
  };
  const lead = Number.isFinite(Number(mix?.promotedImpressions))
    ? `Promoted listings generated ${formatEbayTrafficNumber(mix?.promotedImpressions || 0)} impressions`
    : 'Promoted listings report is still syncing';
  const suffixParts = [
    mix?.label ? formatEbayTrafficDateLabel(mix.label) : '',
    Number.isFinite(Number(mix?.promotedClicks)) ? `${formatEbayTrafficNumber(mix.promotedClicks)} clicks` : '',
    Number.isFinite(Number(mix?.promotedSales)) ? `${formatEbayTrafficNumber(mix.promotedSales)} sales` : '',
    Number.isFinite(Number(mix?.promotedCtr)) ? `CTR ${formatEbayTrafficPercent(mix.promotedCtr)}` : '',
  ].filter(Boolean);
  const marketingReportUpdatedAt = formatEbayTrafficDateTimeLabel(mix?.reportUpdatedAt || mix?.reportTaskCompletionDate || mix?.reportTaskCreationDate || '');
  const marketingReportAge = classifyEbayMarketingReportAge(mix?.reportUpdatedAt || mix?.reportTaskCompletionDate || mix?.reportTaskCreationDate || '');
  const marketingStatus = String(mix?.reportStatusLabel || mix?.taskStatus || '').trim().toUpperCase();
  const liftWindows = mix?.liftWindows && typeof mix.liftWindows === 'object' ? mix.liftWindows : {};
  const hasAvg7Lift = !!(liftWindows?.avg7 && typeof liftWindows.avg7 === 'object');
  const activeLiftWindow = hasAvg7Lift && ebayTrafficPromoLiftWindow === 'avg7' ? 'avg7' : 'day';
  const lift = liftWindows?.[activeLiftWindow] && typeof liftWindows[activeLiftWindow] === 'object'
    ? liftWindows[activeLiftWindow]
    : (mix?.lift && typeof mix.lift === 'object' ? mix.lift : null);
  const liftLeader = String(lift?.leader || '').trim();
  const confidence = lift?.confidence && typeof lift.confidence === 'object' ? lift.confidence : null;
  const liftWindowPrefix = activeLiftWindow === 'avg7'
    ? `Over the last ${Math.max(2, Number(lift?.sampleSize || 7))} days, `
    : '';
  const liftSummary = !lift || !Number.isFinite(Number(lift?.liftVsOrganicPercent))
    ? ''
    : liftLeader === 'promoted'
      ? `${liftWindowPrefix}promoted reach was ${formatEbayTrafficPercent(Math.abs(lift.liftVsOrganicPercent))} more sales-efficient than organic.`
      : liftLeader === 'organic'
        ? `${liftWindowPrefix}organic reach was ${formatEbayTrafficPercent(Math.abs(lift.liftVsOrganicPercent))} more sales-efficient than promoted.`
        : `${liftWindowPrefix}promoted and organic reach performed about evenly.`;
  return `
    <div class="ebay-traffic-promo-mix">
      <div class="ebay-traffic-inline-note">${escapeHtml([lead, ...suffixParts].join(' · '))}</div>
      ${marketingReportUpdatedAt
        ? `
          <div class="ebay-traffic-inline-note ebay-traffic-inline-note-report">
            <span>eBay Marketing updated ${escapeHtml(marketingReportUpdatedAt)}${marketingStatus && marketingStatus !== 'SUCCESS' ? ` · ${escapeHtml(marketingStatus.toLowerCase())}` : ''}</span>
            ${marketingReportAge
              ? `<span class="ebay-traffic-promo-confidence ebay-traffic-promo-confidence-${escapeHtml(marketingReportAge.tone)}">${escapeHtml(marketingReportAge.label)}</span>`
              : ''}
          </div>
        `
        : ''}
      ${Array.isArray(mix?.warnings) && mix.warnings.length
        ? `<div class="ebay-traffic-inline-note">${escapeHtml(String(mix.warnings[0] || ''))}</div>`
        : ''}
      <div class="ebay-traffic-source-list">
        ${items.map((entry) => {
          const value = Number(entry?.value || 0);
          const width = Math.max(value > 0 ? 12 : 0, Math.round((value / maxValue) * 100));
          const toneClass = toneClassMap[String(entry?.id || '').trim()] || toneClassMap.organic;
          return `
            <div class="ebay-traffic-source-row">
              <div class="ebay-traffic-source-labels">
                <strong>${escapeHtml(String(entry?.label || 'Channel'))}</strong>
                <span>${escapeHtml(formatEbayTrafficPercent(entry?.sharePercent))} of daily impressions</span>
              </div>
              <div class="ebay-traffic-source-bar"><span class="${ebayTrafficWidthClass(width)} ${toneClass}"></span></div>
              <div class="ebay-traffic-source-value">${escapeHtml(formatEbayTrafficNumber(value))}</div>
            </div>
          `;
        }).join('')}
      </div>
      ${lift
        ? `
          <div class="ebay-traffic-promo-lift">
            <div class="ebay-traffic-promo-lift-head">
              <div class="ebay-traffic-promo-lift-title">
                <strong>Estimated sales lift</strong>
                <div class="ebay-traffic-promo-lift-meta">
                  ${lift?.estimated ? '<span>Based on sales share vs reach share</span>' : ''}
                  ${confidence
                    ? `<span class="ebay-traffic-promo-confidence ebay-traffic-promo-confidence-${escapeHtml(String(confidence.level || 'low'))}">${escapeHtml(String(confidence.label || 'Confidence'))}</span>`
                    : ''}
                </div>
              </div>
              <div class="ebay-traffic-insight-tabs" role="tablist" aria-label="Promo lift window">
                <button
                  class="ebay-traffic-insight-tab ${activeLiftWindow === 'day' ? 'is-active' : ''}"
                  type="button"
                  role="tab"
                  aria-selected="${activeLiftWindow === 'day' ? 'true' : 'false'}"
                  data-ebay-traffic-promo-lift-window="day"
                >Today</button>
                ${hasAvg7Lift
                  ? `
                    <button
                      class="ebay-traffic-insight-tab ${activeLiftWindow === 'avg7' ? 'is-active' : ''}"
                      type="button"
                      role="tab"
                      aria-selected="${activeLiftWindow === 'avg7' ? 'true' : 'false'}"
                      data-ebay-traffic-promo-lift-window="avg7"
                    >7d avg</button>
                  `
                  : ''}
              </div>
            </div>
            ${liftSummary ? `<div class="ebay-traffic-promo-lift-summary">${escapeHtml(liftSummary)}</div>` : ''}
            ${confidence?.reason ? `<div class="ebay-traffic-promo-lift-summary">${escapeHtml(String(confidence.reason || ''))}</div>` : ''}
            <div class="ebay-traffic-promo-lift-grid">
              <article class="ebay-traffic-promo-lift-card ${liftLeader === 'promoted' ? 'is-leading' : ''}">
                <div class="ebay-traffic-promo-lift-label">Promoted</div>
                <strong>${escapeHtml(formatEbayTrafficPercent(lift?.promotedSalesSharePercent))} of sales</strong>
                <span>${escapeHtml(formatEbayTrafficPercent(lift?.promotedReachSharePercent))} of reach</span>
                <span>${escapeHtml(formatEbayTrafficDecimal(lift?.promotedSalesPerDay))} sales/day · ${escapeHtml(formatEbayTrafficNumber(lift?.promotedImpressionsPerDay || 0))} impr/day</span>
              </article>
              <article class="ebay-traffic-promo-lift-card ${liftLeader === 'organic' ? 'is-leading' : ''}">
                <div class="ebay-traffic-promo-lift-label">Organic</div>
                <strong>${escapeHtml(formatEbayTrafficPercent(lift?.organicSalesSharePercent))} of sales</strong>
                <span>${escapeHtml(formatEbayTrafficPercent(lift?.organicReachSharePercent))} of reach</span>
                <span>${escapeHtml(formatEbayTrafficDecimal(lift?.organicSalesPerDay))} sales/day · ${escapeHtml(formatEbayTrafficNumber(lift?.organicImpressionsPerDay || 0))} impr/day</span>
              </article>
            </div>
          </div>
        `
        : ''}
    </div>
  `;
}

function renderEbayTrafficInsightTabs(activeView = 'sources'){
  const normalized = String(activeView || '').trim();
  const current = normalized === 'trend' || normalized === 'promo' ? normalized : 'sources';
  const options = [
    { id: 'sources', label: 'Source mix' },
    { id: 'trend', label: 'Trend' },
    { id: 'promo', label: 'Promo mix' },
  ];
  return `
    <div class="ebay-traffic-insight-tabs" role="tablist" aria-label="eBay traffic views">
      ${options.map((option) => `
        <button
          class="ebay-traffic-insight-tab ${current === option.id ? 'is-active' : ''}"
          type="button"
          role="tab"
          aria-selected="${current === option.id ? 'true' : 'false'}"
          data-ebay-traffic-insight-view="${option.id}"
        >${escapeHtml(option.label)}</button>
      `).join('')}
    </div>
  `;
}

function renderEbayTrafficListingsTabs(activeView = 'traffic'){
  const current = String(activeView || '').trim() === 'watchers' ? 'watchers' : 'traffic';
  const options = [
    { id: 'traffic', label: 'Traffic' },
    { id: 'watchers', label: 'Watchers' },
  ];
  return `
    <div class="ebay-traffic-insight-tabs" role="tablist" aria-label="Top listing views">
      ${options.map((option) => `
        <button
          class="ebay-traffic-insight-tab ${current === option.id ? 'is-active' : ''}"
          type="button"
          role="tab"
          aria-selected="${current === option.id ? 'true' : 'false'}"
          data-ebay-traffic-listings-view="${option.id}"
        >${escapeHtml(option.label)}</button>
      `).join('')}
    </div>
  `;
}

function renderEbayTrafficDailyTrend(store){
  const daily = Array.isArray(store?.daily) ? store.daily.slice(-14) : [];
  if (!daily.length) return '';
  const maxImpressions = Math.max(...daily.map((entry) => Number(entry?.totalImpressions || entry?.impressions || 0)), 1);
  return `
    <div class="ebay-traffic-trend-list">
      ${daily.map((entry) => {
        const views = Number(entry?.views || 0);
        const impressions = Number(entry?.totalImpressions || entry?.impressions || 0);
        const width = Math.max(impressions > 0 ? 8 : 0, Math.round((impressions / maxImpressions) * 100));
        return `
          <div class="ebay-traffic-trend-row">
            <div class="ebay-traffic-trend-date">${escapeHtml(formatEbayTrafficDateLabel(entry?.label || ''))}</div>
            <div class="ebay-traffic-trend-bar"><span class="${ebayTrafficWidthClass(width)}"></span></div>
            <div class="ebay-traffic-trend-values">
              <strong>${escapeHtml(formatEbayTrafficNumber(impressions))} impr.</strong>
              <span>${escapeHtml(formatEbayTrafficNumber(views))} views · ${escapeHtml(formatEbayTrafficNumber(entry?.transactions || 0))} sold</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function wireEbayTrafficInteractions(options = {}){
  const el = document.getElementById('ebayTrafficWidget');
  if (!el) return;
  el.querySelectorAll('[data-ebay-traffic-store-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextId = String(btn.getAttribute('data-ebay-traffic-store-id') || '').trim();
      if (!nextId || nextId === ebayTrafficActiveStoreId) return;
      setEbayTrafficActiveStoreId(nextId);
      if (ebayTrafficLastPayload) renderEbayTrafficWidget(ebayTrafficLastPayload, options);
    });
  });
  el.querySelectorAll('[data-ebay-traffic-insight-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextView = String(btn.getAttribute('data-ebay-traffic-insight-view') || '').trim();
      if (!nextView || nextView === ebayTrafficActiveInsightView) return;
      setEbayTrafficActiveInsightView(nextView);
      if (ebayTrafficLastPayload) renderEbayTrafficWidget(ebayTrafficLastPayload, options);
    });
  });
  el.querySelectorAll('[data-ebay-traffic-listings-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextView = String(btn.getAttribute('data-ebay-traffic-listings-view') || '').trim();
      if (!nextView || nextView === ebayTrafficActiveListingsView) return;
      setEbayTrafficActiveListingsView(nextView);
      if (ebayTrafficLastPayload) renderEbayTrafficWidget(ebayTrafficLastPayload, options);
    });
  });
  el.querySelectorAll('[data-ebay-traffic-promo-lift-window]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextWindow = String(btn.getAttribute('data-ebay-traffic-promo-lift-window') || '').trim();
      if (!nextWindow || nextWindow === ebayTrafficPromoLiftWindow) return;
      setEbayTrafficPromoLiftWindow(nextWindow);
      if (ebayTrafficLastPayload) renderEbayTrafficWidget(ebayTrafficLastPayload, options);
    });
  });
}

function renderEbayTrafficWidget(payload = {}, options = {}){
  const el = document.getElementById('ebayTrafficWidget');
  if (!el) return;
  const stores = Array.isArray(payload?.stores) ? payload.stores : [];
  const stale = !!options.stale || !!payload?.stale;
  const backoffLeftMs = Number(options.backoffLeftMs || 0);
  const activeStore = resolveEbayTrafficActiveStore(stores);

  if (!stores.length && payload?.setupRequired) {
    el.innerHTML = `
      <div class="ebay-traffic-shell">
        <div class="ebay-traffic-empty-state">
          <strong>Configuration needed</strong>
          <p>Set <code>EBAY_TRAFFIC_CLIENT_ID</code>, <code>EBAY_TRAFFIC_CLIENT_SECRET</code>, and <code>EBAY_TRAFFIC_REFRESH_TOKEN</code>. For multiple stores, use <code>EBAY_TRAFFIC_STORES_JSON</code>.</p>
        </div>
      </div>
    `;
    return;
  }

  const storeCount = Number(payload?.storeCount || stores.length || 0);
  const healthyCount = Number(payload?.healthyStoreCount || 0);
  const activeSummary = activeStore?.summary && typeof activeStore.summary === 'object' ? activeStore.summary : {};
  const dailySnapshot = activeStore?.dailySnapshot && typeof activeStore.dailySnapshot === 'object' ? activeStore.dailySnapshot : null;
  const healthLabel = payload?.setupRequired
    ? 'Setup required'
    : payload?.partialFailure
      ? `${healthyCount}/${storeCount} stores healthy`
      : storeCount
        ? `${storeCount} store${storeCount === 1 ? '' : 's'} connected`
        : 'No stores';
  const latestDayLabel = formatEbayTrafficDateLabel(dailySnapshot?.label || activeStore?.lastUpdatedDate || '');
  const previousDayLabel = dailySnapshot?.previousLabel ? formatEbayTrafficDateLabel(dailySnapshot.previousLabel) : '';
  const freshnessLabel = stale
    ? (payload?.message
      ? `${String(payload.message)}${backoffLeftMs > 0 ? ` · retry in ${Math.ceil(backoffLeftMs / 1000)}s` : ''}`
      : `Stale snapshot${backoffLeftMs > 0 ? ` · retry in ${Math.ceil(backoffLeftMs / 1000)}s` : ''}`)
    : (activeStore?.lastUpdatedDate ? `eBay updated ${formatEbayTrafficDateLabel(activeStore.lastUpdatedDate)}` : 'Latest available snapshot');
  const activeStatus = stale && activeStore ? 'ok' : String(activeStore?.status || '').trim();
  const activeStatusTone = activeStatus === 'ok' ? 'fresh' : activeStatus === 'setup' ? 'neutral' : 'issue';
  const promotionMix = activeStore?.promotionMix && typeof activeStore.promotionMix === 'object' ? activeStore.promotionMix : null;
  const activeInsightView = ebayTrafficActiveInsightView === 'trend' || ebayTrafficActiveInsightView === 'promo'
    ? ebayTrafficActiveInsightView
    : 'sources';
  const activeListingsView = ebayTrafficActiveListingsView === 'watchers' ? 'watchers' : 'traffic';
  const insightTitle = activeInsightView === 'trend'
    ? 'Recent daily pace'
    : activeInsightView === 'promo'
      ? 'Promoted vs organic'
      : 'Where listing views came from';
  const insightKicker = activeInsightView === 'trend'
    ? 'Trend'
    : activeInsightView === 'promo'
      ? 'Ad mix'
      : 'Source mix';
  const insightBody = activeInsightView === 'trend'
    ? renderEbayTrafficDailyTrend(activeStore)
    : activeInsightView === 'promo'
      ? renderEbayTrafficPromotionMix(activeStore)
      : renderEbayTrafficViewSources(activeStore);
  const insightTags = activeInsightView === 'trend'
    ? `
        ${renderEbayTrafficTag(`${formatEbayTrafficNumber((activeStore?.daily || []).length)} days`, 'neutral')}
        ${renderEbayTrafficTag(latestDayLabel, 'count')}
      `
    : activeInsightView === 'promo'
      ? `
          ${renderEbayTrafficTag(
            promotionMix?.label ? formatEbayTrafficDateLabel(promotionMix.label) : latestDayLabel,
            'count'
          )}
          ${Number.isFinite(Number(promotionMix?.promotedImpressions))
            ? renderEbayTrafficTag(`${formatEbayTrafficNumber(promotionMix.promotedImpressions)} promoted impr.`, 'success')
            : renderEbayTrafficTag(
                String(promotionMix?.status || '').trim() === 'pending' ? 'Report warming up' : 'No report yet',
                'neutral'
              )}
        `
    : `
        ${renderEbayTrafficTag(latestDayLabel, 'count')}
        ${renderEbayTrafficTag(`${formatEbayTrafficNumber(dailySnapshot?.metrics?.views?.value || 0)} views`, 'neutral')}
      `;
  const focusContent = !activeStore ? `
    <div class="ebay-traffic-empty-state">
      <strong>No store selected</strong>
      <p>Refresh this pod after adding eBay traffic credentials.</p>
    </div>
  ` : activeStatus === 'setup' ? `
    <div class="ebay-traffic-empty-state">
      <strong>${escapeHtml(String(activeStore?.label || 'Store'))}</strong>
      <p>${escapeHtml(String(activeStore?.message || 'Add eBay credentials to load this store.'))}</p>
    </div>
  ` : activeStatus === 'error' ? `
    <div class="ebay-traffic-empty-state">
      <strong>${escapeHtml(String(activeStore?.label || 'Store'))}</strong>
      <p>${escapeHtml(String(activeStore?.error || activeStore?.message || 'Unable to load this store right now.'))}</p>
    </div>
  ` : `
    <div class="ebay-traffic-sections">
      <section class="ebay-traffic-section">
        <div class="ebay-traffic-section-head">
          <div>
            <div class="ebay-traffic-section-kicker">${escapeHtml(insightKicker)}</div>
            <strong>${escapeHtml(insightTitle)}</strong>
          </div>
          <div class="ebay-traffic-section-tools">
            ${renderEbayTrafficInsightTabs(activeInsightView)}
            <div class="ebay-traffic-section-tags">
              ${insightTags}
            </div>
          </div>
        </div>
        ${insightBody}
      </section>
      <section class="ebay-traffic-section">
        <div class="ebay-traffic-section-head">
          <div>
            <div class="ebay-traffic-section-kicker">Listings</div>
            <strong>Top traffic drivers</strong>
          </div>
          <div class="ebay-traffic-section-tools">
            ${renderEbayTrafficListingsTabs(activeListingsView)}
            <div class="ebay-traffic-section-tags">
              ${renderEbayTrafficTag(`${formatEbayTrafficNumber((activeStore?.topListings || []).length)} rows`, 'count')}
              ${activeListingsView === 'watchers'
                ? renderEbayTrafficTag(
                    `${formatEbayTrafficNumber(
                      Math.max(
                        0,
                        ...((activeStore?.topListings || []).map((entry) => Number(entry?.watchCount || 0)))
                      )
                    )} max watchers`,
                    'success'
                  )
                : ''}
              ${renderEbayTrafficTag(activeStore?.marketplaceId || 'eBay', 'neutral')}
            </div>
          </div>
        </div>
        ${renderEbayTrafficTopListings(activeStore)}
      </section>
    </div>
  `;

  el.innerHTML = `
    <div class="ebay-traffic-shell">
      <div class="ebay-traffic-overview">
        <section class="ebay-traffic-summary-card">
          <div class="ebay-traffic-summary-head">
            <div>
              <div class="ebay-traffic-summary-kicker">Daily live view</div>
              <div class="ebay-traffic-summary-title">${escapeHtml(latestDayLabel)}</div>
              <p>${escapeHtml(previousDayLabel ? `Compared with ${previousDayLabel}` : healthLabel)}</p>
            </div>
            <strong>${escapeHtml(formatEbayTrafficNumber(dailySnapshot?.metrics?.impressions?.value || 0, { compact: true }))}</strong>
          </div>
          <div class="ebay-traffic-summary-subtitle">Latest eBay day with day-over-day movement.</div>
          <div class="ebay-traffic-snapshot-grid">
            ${renderEbayTrafficSnapshotMetricCard('Impressions', dailySnapshot?.metrics?.impressions || {}, formatEbayTrafficNumber, 'primary')}
            ${renderEbayTrafficSnapshotMetricCard('Listing views', dailySnapshot?.metrics?.views || {}, formatEbayTrafficNumber, 'neutral')}
            ${renderEbayTrafficSnapshotMetricCard('Quantity sold', dailySnapshot?.metrics?.quantitySold || {}, formatEbayTrafficNumber, 'success')}
            ${renderEbayTrafficSnapshotMetricCard('Click-through rate', dailySnapshot?.metrics?.clickThroughRate || {}, formatEbayTrafficPercent, 'neutral')}
            ${renderEbayTrafficSnapshotMetricCard('Sales conversion rate', dailySnapshot?.metrics?.salesConversionRate || {}, formatEbayTrafficPercent, 'success')}
          </div>
        </section>
        <section class="ebay-traffic-focus-card">
          <div class="ebay-traffic-focus-head">
            <div>
              <div class="ebay-traffic-summary-kicker">Store focus</div>
              <div class="ebay-traffic-focus-title">${escapeHtml(String(activeStore?.label || 'No store selected'))}</div>
              <div class="ebay-traffic-focus-meta">${escapeHtml(String(activeStore?.marketplaceId || ''))}</div>
            </div>
            <div class="ebay-traffic-focus-stats">
              <span class="ebay-traffic-focus-status ebay-traffic-focus-status-${activeStatusTone}">${escapeHtml(activeStatus === 'ok' ? 'Live' : activeStatus === 'setup' ? 'Setup' : 'Issue')}</span>
              <span class="ebay-traffic-focus-count">${escapeHtml(formatEbayTrafficNumber(dailySnapshot?.metrics?.views?.value || activeSummary?.views || 0, { compact: true }))}</span>
            </div>
          </div>
          <p>${escapeHtml(freshnessLabel)}</p>
          <div class="ebay-traffic-focus-actions">
            ${safeExternalUrl(activeStore?.storeUrl) ? `<a class="btn ghost" href="${escapeAttribute(safeExternalUrl(activeStore.storeUrl))}" target="_blank" rel="noopener noreferrer">Open store</a>` : ''}
            ${renderEbayTrafficTag(`30d ${formatEbayTrafficNumber(activeSummary?.impressions || 0)} impressions`, 'neutral')}
            ${renderEbayTrafficTag(`30d ${formatEbayTrafficNumber(activeSummary?.transactions || 0)} sold`, 'success')}
            ${renderEbayTrafficTag(`CTR ${formatEbayTrafficPercent(dailySnapshot?.metrics?.clickThroughRate?.value ?? activeSummary?.clickThroughRate)}`, 'neutral')}
            ${renderEbayTrafficTag(`Conv. ${formatEbayTrafficPercent(dailySnapshot?.metrics?.salesConversionRate?.value ?? activeSummary?.salesConversionRate)}`, 'success')}
          </div>
        </section>
      </div>
      ${renderEbayTrafficStoreTabs(stores, activeStore?.id || '')}
      ${payload?.message && !payload?.ok ? `<div class="ebay-traffic-inline-note">${escapeHtml(String(payload.message || ''))}</div>` : ''}
      ${focusContent}
    </div>
  `;

  wireEbayTrafficInteractions(options);
}

async function fetchEbayTrafficPayload(manual = false){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(manual ? EBAY_TRAFFIC_REFRESH_API : EBAY_TRAFFIC_API, {
      method: manual ? 'POST' : 'GET',
      signal: controller.signal,
      headers: manual ? { 'Content-Type': 'application/json' } : undefined,
      body: manual ? JSON.stringify({ source: 'manual' }) : undefined,
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function renderEbayTrafficPod(options = {}){
  const meta = document.getElementById('ebayTrafficMeta');
  const manual = !!options.manual;
  const backoffLeftMs = pollingBackoffState('ebay-traffic').backoffUntil - Date.now();

  updateEbayTrafficRefreshButton();

  if (ebayTrafficInFlight) {
    if (ebayTrafficLastPayload) renderEbayTrafficWidget(ebayTrafficLastPayload, { stale: true, backoffLeftMs: Math.max(0, backoffLeftMs) });
    setPodStatusSignal('ebay-traffic', 'neutral', 'refreshing');
    if (meta) meta.textContent = 'Refresh already in progress.';
    return;
  }

  if (!manual && backoffLeftMs > 0 && ebayTrafficLastPayload) {
    renderEbayTrafficWidget(ebayTrafficLastPayload, { stale: true, backoffLeftMs });
    setPodStatusSignal('ebay-traffic', 'stale', `retry ${Math.ceil(backoffLeftMs / 1000)}s`);
    if (meta) {
      const lastSeen = ebayTrafficLastUpdatedAt ? new Date(ebayTrafficLastUpdatedAt).toLocaleTimeString() : 'unknown';
      meta.textContent = `Updated: ${lastSeen} · stale snapshot · retry in ${Math.ceil(backoffLeftMs / 1000)}s`;
    }
    return;
  }

  ebayTrafficInFlight = true;
  updateEbayTrafficRefreshButton();
  try {
    const payload = await fetchEbayTrafficPayload(manual);
    ebayTrafficLastPayload = payload;
    ebayTrafficLastUpdatedAt = String(payload?.fetchedAt || now());
    ebayTrafficLastError = '';
    clearPollingBackoff('ebay-traffic');
    renderEbayTrafficWidget(payload);

    if (payload?.setupRequired) {
      setPodStatusSignal('ebay-traffic', 'neutral', 'setup');
      if (meta) meta.textContent = 'Setup required · add eBay Sell Analytics credentials in .env';
    } else if (!payload?.ok) {
      const rateLimited = String(payload?.refreshSource || '') === 'rate_limited_backoff'
        || /rate limit/i.test(String(payload?.message || ''));
      setPodStatusSignal('ebay-traffic', rateLimited ? 'stale' : 'error', rateLimited ? 'cooling down' : 'unavailable');
      if (meta) {
        meta.textContent = payload?.message
          ? String(payload.message)
          : 'eBay traffic is configured, but no live store data was returned.';
      }
    } else {
      const detail = payload?.partialFailure
        ? `${Number(payload?.healthyStoreCount || 0)}/${Number(payload?.storeCount || 0)} stores healthy`
        : `${Number(payload?.storeCount || 0)} store${Number(payload?.storeCount || 0) === 1 ? '' : 's'}`;
      setPodStatusSignal('ebay-traffic', payload?.stale ? 'stale' : (payload?.partialFailure ? 'degraded' : 'fresh'), payload?.stale ? 'stale cache' : detail);
      if (meta) {
        const parts = [
          `Updated: ${new Date(ebayTrafficLastUpdatedAt).toLocaleTimeString()}`,
          'Auto: every 30 min',
          Number(payload?.storeCount || 0) ? `Stores: ${payload.storeCount}` : '',
          payload?.partialFailure ? `Healthy: ${payload.healthyStoreCount || 0}` : '',
          payload?.stale ? 'Last good snapshot' : '',
        ].filter(Boolean);
        meta.textContent = parts.join(' · ');
      }
    }
  } catch (error) {
    ebayTrafficLastError = String(error?.message || error || 'eBay traffic refresh failed').slice(0, 220);
    const backoffMs = registerPollingFailure('ebay-traffic', error, ebayTrafficLastError);
    if (ebayTrafficLastPayload) {
      renderEbayTrafficWidget(ebayTrafficLastPayload, { stale: true, backoffLeftMs: backoffMs });
      setPodStatusSignal('ebay-traffic', 'stale', `retry ${Math.ceil(backoffMs / 1000)}s`);
      if (meta) {
        const lastSeen = ebayTrafficLastUpdatedAt ? new Date(ebayTrafficLastUpdatedAt).toLocaleTimeString() : 'unknown';
        meta.textContent = `Updated: ${lastSeen} · ${ebayTrafficLastError} · retry in ${Math.ceil(backoffMs / 1000)}s`;
      }
    } else {
      const routeUnavailable = Number(error?.status || 0) === 404;
      document.getElementById('ebayTrafficWidget').innerHTML = `
        <div class="ebay-traffic-shell">
          <div class="ebay-traffic-empty-state">
            <strong>${routeUnavailable ? 'Server restart needed' : 'eBay traffic unavailable'}</strong>
            <p>${escapeHtml(routeUnavailable
              ? 'The new eBay traffic API route is not loaded yet. Restart the local server.'
              : ebayTrafficLastError)}</p>
          </div>
        </div>
      `;
      setPodStatusSignal('ebay-traffic', 'error', routeUnavailable ? 'server restart' : `retry ${Math.ceil(backoffMs / 1000)}s`);
      if (meta) {
        meta.textContent = routeUnavailable
          ? 'eBay traffic API route not found. Restart the local server so it loads the new endpoint.'
          : `${ebayTrafficLastError} · retry in ${Math.ceil(backoffMs / 1000)}s`;
      }
    }
  } finally {
    ebayTrafficInFlight = false;
    updateEbayTrafficRefreshButton();
  }
}

function renderRssListFromState(){
  const el = document.getElementById('rssWidget');
  const ts = document.getElementById('rssUpdatedAt');
  const showReadToggle = document.getElementById('rssShowReadToggle');
  if (!el) return;

  if (showReadToggle) showReadToggle.checked = !!state.rss?.showRead;

  const allItems = Array.isArray(state.rss?.items) ? state.rss.items : [];
  const readIds = new Set(Array.isArray(state.rss?.readItemIds) ? state.rss.readItemIds : []);
  const showRead = !!state.rss?.showRead;
  const visible = showRead ? allItems : allItems.filter((item) => !readIds.has(item.id));
  const unreadCount = allItems.filter((item) => !readIds.has(item.id)).length;
  const sourceCount = new Set(allItems.map((item) => String(item.feedTitle || item.tag || 'Feed').trim()).filter(Boolean)).size;
  const formatRelativeTime = (publishedAt) => {
    const publishedMs = Date.parse(String(publishedAt || ''));
    if (!Number.isFinite(publishedMs)) return 'Unknown time';
    const diffMs = Date.now() - publishedMs;
    const absMinutes = Math.round(Math.abs(diffMs) / 60000);
    if (absMinutes < 1) return 'Just now';
    if (absMinutes < 60) return `${absMinutes}m ago`;
    const absHours = Math.round(absMinutes / 60);
    if (absHours < 24) return `${absHours}h ago`;
    const absDays = Math.round(absHours / 24);
    if (absDays < 7) return `${absDays}d ago`;
    return new Date(publishedMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const renderOverview = () => `
    <div class="rss-overview-grid">
      <div class="rss-overview-card rss-overview-card--hero">
        <span class="rss-overview-label">Unread</span>
        <strong>${unreadCount}</strong>
        <span class="rss-overview-meta">${showRead ? `${visible.length} visible in archive view` : `${visible.length} visible right now`}</span>
      </div>
      <div class="rss-overview-card">
        <span class="rss-overview-label">Sources</span>
        <strong>${sourceCount || 0}</strong>
        <span class="rss-overview-meta">${Array.isArray(state.rss?.feeds) ? state.rss.feeds.length : 0} configured feeds</span>
      </div>
      <div class="rss-overview-card">
        <span class="rss-overview-label">Mode</span>
        <strong>${showRead ? 'Archive' : 'Fresh'}</strong>
        <span class="rss-overview-meta">${showRead ? 'Read items included' : 'Unread stories prioritized'}</span>
      </div>
    </div>
  `;

  if (!allItems.length) {
    el.innerHTML = `
      <div class="rss-v2-shell">
        ${renderOverview()}
        <div class="rss-empty-state">
          <strong>No feed items yet.</strong>
          <span>Add a feed in Settings, then refresh to start building your news stream.</span>
        </div>
      </div>
    `;
  } else if (!visible.length) {
    el.innerHTML = `
      <div class="rss-v2-shell">
        ${renderOverview()}
        <div class="rss-empty-state">
          <strong>All caught up.</strong>
          <span>Enable "Show read" to browse older items, or wait for the next refresh.</span>
        </div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div class="rss-v2-shell">
        ${renderOverview()}
        <div class="rss-list rss-v2-list">${visible.slice(0, 40).map((item) => {
      const isRead = readIds.has(item.id);
      const published = item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Unknown time';
      const relative = formatRelativeTime(item.publishedAt);
      const sourceLabel = escapeHtml(item.feedTitle || item.tag || 'Feed');
      const summary = escapeHtml(item.summary || '');
      return `
        <article class="rss-story-card ${isRead ? 'is-read' : ''}">
          <div class="rss-story-meta">
            <span class="rss-source-chip">${sourceLabel}</span>
            <span class="rss-story-time">${escapeHtml(relative)} · ${escapeHtml(published)}</span>
          </div>
          <a class="rss-story-title" href="${escapeAttribute(safeExternalUrl(item.link) || '#')}" target="_blank" rel="noopener noreferrer">${escapeText(item.title || 'Untitled')}</a>
          ${summary ? `<div class="rss-story-summary">${summary}</div>` : '<div class="rss-story-summary rss-story-summary-empty">Open the story for the full article.</div>'}
          <div class="rss-story-actions">
            ${isRead ? '<span class="rss-read-state">Read</span>' : `<button class="btn ghost rss-mark-read-btn" data-rss-read="${escapeAttribute(item.id)}" type="button">Mark read</button>`}
            <a class="btn rss-open-link-btn" href="${escapeAttribute(safeExternalUrl(item.link) || '#')}" target="_blank" rel="noopener noreferrer">Open story</a>
          </div>
        </article>
      `;
    }).join('')}</div>
      </div>
    `;

    el.querySelectorAll('[data-rss-read]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemId = String(btn.getAttribute('data-rss-read') || '');
        if (!itemId) return;
        if (!state.rss.readItemIds.includes(itemId)) state.rss.readItemIds.push(itemId);
        save('rss_item_mark_read');
        renderRssListFromState();
      });
    });
  }

  if (ts) {
    if (state.rss?.lastUpdatedAt) {
      ts.textContent = `Updated: ${new Date(state.rss.lastUpdatedAt).toLocaleTimeString()} · Last success: ${new Date(state.rss.lastUpdatedAt).toLocaleTimeString()}${state.rss.lastError ? ` · Last error: ${state.rss.lastError}` : ''}`;
    } else {
      ts.textContent = state.rss?.lastError
        ? `Update failed: ${state.rss.lastError} · Last success: none yet`
        : 'Not refreshed yet. · Last success: none yet';
    }
  }
}

function mergeRssItems(existingItems, incomingItems){
  // Deduplicate by stable natural key first (guid/link), then by id.
  // This prevents stale "Untitled" rows from lingering when title parsing improves.
  const map = new Map();

  const naturalKey = (item) => {
    const link = String(item?.link || '').trim();
    const guid = String(item?.guid || '').trim();
    // Prefer link as primary key: most stable across parser revisions/providers.
    if (link) return `l:${link}`;
    if (guid) return `g:${guid}`;
    return `i:${String(item?.id || '').trim()}`;
  };

  const prefer = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const aUntitled = String(a.title || '').trim().toLowerCase() === 'untitled';
    const bUntitled = String(b.title || '').trim().toLowerCase() === 'untitled';
    if (aUntitled && !bUntitled) return b;
    if (bUntitled && !aUntitled) return a;
    return b; // prefer newer incoming/update by default
  };

  for (const item of existingItems || []) {
    if (!item?.id && !item?.link && !item?.guid) continue;
    const key = naturalKey(item);
    map.set(key, item);
  }
  for (const item of incomingItems || []) {
    if (!item?.id && !item?.link && !item?.guid) continue;
    const key = naturalKey(item);
    map.set(key, prefer(map.get(key), item));
  }

  return [...map.values()].sort((a, b) => {
    const ta = Date.parse(a.publishedAt || '') || 0;
    const tb = Date.parse(b.publishedAt || '') || 0;
    if (tb !== ta) return tb - ta;
    const ka = `${String(a.id || '')}|${String(a.link || '')}|${String(a.title || '')}`;
    const kb = `${String(b.id || '')}|${String(b.link || '')}|${String(b.title || '')}`;
    return ka.localeCompare(kb);
  }).slice(0, 200);
}

async function renderRss(options = {}){
  const skipFetch = !!options.skipFetch;
  const manual = !!options.manual;
  const hasFeeds = Array.isArray(state.rss?.feeds) && state.rss.feeds.length > 0;
  const rssBackoff = pollingBackoffState('rss-feed').backoffUntil - Date.now();

  if (!skipFetch && hasFeeds && !manual && rssBackoff > 0) {
    state.rss.lastError = `Update delayed: retry in ${Math.ceil(rssBackoff / 1000)}s`;
    setPodStatusSignal('rss', 'stale', `retry ${Math.ceil(rssBackoff / 1000)}s`);
  } else if (!skipFetch && hasFeeds) {
    try {
      const payload = await fetchRssFeedBundle();
      const feedByUrl = new Map(state.rss.feeds.map((f) => [f.url, f]));
      const normalized = (Array.isArray(payload.items) ? payload.items : []).map((item) => {
        const feedConfig = feedByUrl.get(item.feedUrl) || {};
        return {
          id: String(item.id || '').trim(),
          guid: String(item.guid || '').trim(),
          feedId: String(feedConfig.id || ''),
          title: String(item.title || 'Untitled').trim() || 'Untitled',
          link: String(item.link || '').trim(),
          summary: String(item.summary || '').trim().slice(0, 220),
          publishedAt: String(item.publishedAt || '').trim(),
          feedTitle: String(item.feedTitle || '').trim(),
          tag: String(feedConfig.tag || '').trim(),
        };
      }).filter((item) => item.id && /^https?:\/\//i.test(item.link));

      state.rss.items = mergeRssItems(state.rss.items, normalized);
      const itemIds = new Set(state.rss.items.map((item) => item.id));
      state.rss.readItemIds = state.rss.readItemIds.filter((itemId) => itemIds.has(itemId));
      state.rss.lastUpdatedAt = now();
      state.rss.lastError = Array.isArray(payload.errors) && payload.errors.length
        ? `${payload.errors.length} feed(s) failed`
        : '';
      clearPollingBackoff('rss-feed');
      setPodStatusSignal('rss', state.rss.lastError ? 'stale' : 'fresh', state.rss.lastError ? 'partial failure' : '');
      save('rss_refresh_success');
    } catch (err) {
      const reason = String(err?.message || err || 'RSS refresh failed').slice(0, 200);
      const backoffMs = registerPollingFailure('rss-feed', err, reason);
      state.rss.lastError = `Update delayed: ${reason} (retry in ${Math.ceil(backoffMs / 1000)}s)`;
      setPodStatusSignal('rss', state.rss.lastUpdatedAt ? 'stale' : 'error', `retry ${Math.ceil(backoffMs / 1000)}s`);
      save('rss_refresh_failed');
    }
  }

  if (!hasFeeds) {
    setPodStatusSignal('rss', state.rss?.lastUpdatedAt ? 'stale' : 'fresh', state.rss?.lastUpdatedAt ? 'no feeds configured' : 'idle');
  }

  renderRssListFromState();
}

function updateUnreadEmailRefreshButton(){
  const btn = document.getElementById('unreadEmailRefreshBtn');
  if (!btn) return;
  const anyMutationInFlight = !!unreadEmailMarkReadInFlight || !!unreadEmailSpamInFlight || !!unreadEmailDeleteInFlight;
  btn.disabled = unreadEmailInFlight || anyMutationInFlight;
  btn.textContent = anyMutationInFlight ? 'Working…' : unreadEmailInFlight ? 'Refreshing…' : 'Refresh';
}

function setUnreadEmailActiveAccountId(accountId){
  unreadEmailActiveAccountId = String(accountId || '').trim();
  try { localStorage.setItem(UNREAD_EMAIL_ACTIVE_ACCOUNT_KEY, unreadEmailActiveAccountId); } catch {}
}

function resolveUnreadEmailActiveAccount(accounts = []){
  const resolved = unreadEmailStateFeature.resolveActiveAccount(accounts, unreadEmailActiveAccountId);
  if (resolved.changed) setUnreadEmailActiveAccountId(resolved.accountId);
  return resolved.account;
}

function unreadEmailDeleteKey(accountId, mailbox, uid){
  return unreadEmailStateFeature.deleteKey(accountId, mailbox, uid);
}

function createUnreadEmailMessageKey(accountId = '', mailbox = '', uid = ''){
  return unreadEmailStateFeature.messageKey(accountId, mailbox, uid);
}

function setUnreadEmailSelection(itemKey, selected){
  const key = String(itemKey || '').trim();
  if (!key) return;
  const next = new Set(unreadEmailSelectedKeys);
  if (selected) next.add(key);
  else next.delete(key);
  unreadEmailSelectedKeys = next;
}

function setUnreadEmailSelections(items = [], selected = true){
  const next = new Set(unreadEmailSelectedKeys);
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = String(item?.key || '').trim();
    if (!key) return;
    if (selected) next.add(key);
    else next.delete(key);
  });
  unreadEmailSelectedKeys = next;
}

function clearUnreadEmailSelections(accountId = ''){
  const normalizedAccountId = String(accountId || '').trim();
  if (!normalizedAccountId) {
    unreadEmailSelectedKeys = new Set();
    return;
  }
  unreadEmailSelectedKeys = new Set([...unreadEmailSelectedKeys].filter((key) => !key.startsWith(`${normalizedAccountId}::`)));
}

function pruneUnreadEmailSelectionsFromPayload(payload){
  unreadEmailSelectedKeys = unreadEmailStateFeature.pruneSet(
    unreadEmailSelectedKeys,
    unreadEmailStateFeature.payloadSelectionKeys(payload),
  );
}

function pruneUnreadEmailExpandedStateFromPayload(payload){
  const validKeys = unreadEmailStateFeature.payloadKeys(payload);
  unreadEmailExpandedKeys = unreadEmailStateFeature.pruneSet(unreadEmailExpandedKeys, validKeys);
  unreadEmailExpandedLoadingKeys = unreadEmailStateFeature.pruneSet(unreadEmailExpandedLoadingKeys, validKeys);
  unreadEmailExpandedBodies = unreadEmailStateFeature.pruneMap(unreadEmailExpandedBodies, validKeys);
  unreadEmailExpandedErrors = unreadEmailStateFeature.pruneMap(unreadEmailExpandedErrors, validKeys);
}

function getUnreadEmailBlockedSenderList(accountId = ''){
  const normalizedAccountId = String(accountId || '').trim();
  if (!normalizedAccountId) return [];
  const source = (state?.unreadEmailBlockedSenders && typeof state.unreadEmailBlockedSenders === 'object')
    ? state.unreadEmailBlockedSenders
    : {};
  return Array.isArray(source[normalizedAccountId]) ? source[normalizedAccountId] : [];
}

function getUnreadEmailBlockedSenderSet(accountId = ''){
  return new Set(getUnreadEmailBlockedSenderList(accountId).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
}

function getUnreadEmailBlockedSenderQuery(accountId = ''){
  const normalizedAccountId = String(accountId || '').trim();
  if (!normalizedAccountId) return '';
  return String(unreadEmailBlockedSenderQueries[normalizedAccountId] || '').trim();
}

function setUnreadEmailBlockedSenderQuery(accountId = '', query = ''){
  const normalizedAccountId = String(accountId || '').trim();
  if (!normalizedAccountId) return;
  const normalizedQuery = String(query || '').trim().toLowerCase().slice(0, 120);
  if (normalizedQuery) unreadEmailBlockedSenderQueries[normalizedAccountId] = normalizedQuery;
  else delete unreadEmailBlockedSenderQueries[normalizedAccountId];
}

function filterUnreadEmailEntriesByBlockedSenders(entries = [], blockedSenders = new Set()){
  return unreadEmailStateFeature.filterBlockedEntries(entries, blockedSenders);
}

function blockUnreadEmailSender(accountId = '', senderEmail = ''){
  const normalizedAccountId = String(accountId || '').trim();
  const normalizedEmail = String(senderEmail || '').trim().toLowerCase();
  if (!normalizedAccountId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) return false;
  const next = normalizeUnreadEmailBlockedSenders({
    ...(state.unreadEmailBlockedSenders || {}),
    [normalizedAccountId]: [
      ...getUnreadEmailBlockedSenderList(normalizedAccountId),
      normalizedEmail,
    ],
  });
  state.unreadEmailBlockedSenders = next;
  save('unread_email_sender_blocked');
  return true;
}

function unblockUnreadEmailSender(accountId = '', senderEmail = ''){
  const normalizedAccountId = String(accountId || '').trim();
  const normalizedEmail = String(senderEmail || '').trim().toLowerCase();
  if (!normalizedAccountId || !normalizedEmail) return false;
  const nextList = getUnreadEmailBlockedSenderList(normalizedAccountId).filter((email) => email !== normalizedEmail);
  const next = {
    ...(state.unreadEmailBlockedSenders || {}),
  };
  if (nextList.length) next[normalizedAccountId] = nextList;
  else delete next[normalizedAccountId];
  state.unreadEmailBlockedSenders = normalizeUnreadEmailBlockedSenders(next);
  save('unread_email_sender_unblocked');
  return true;
}

function getUnreadEmailFilteredEntrySets(activeAccount = null, accountId = ''){
  const blockedSenderList = getUnreadEmailBlockedSenderList(accountId);
  const blockedSenderSet = getUnreadEmailBlockedSenderSet(accountId);
  const unread = filterUnreadEmailEntriesByBlockedSenders(Array.isArray(activeAccount?.entries) ? activeAccount.entries.slice(0, 5) : [], blockedSenderSet);
  const recent = filterUnreadEmailEntriesByBlockedSenders(Array.isArray(activeAccount?.recentEntries) ? activeAccount.recentEntries.slice(0, 5) : [], blockedSenderSet);
  return {
    blockedSenderList,
    activeEntries: unread.entries,
    activeRecentEntries: recent.entries,
    filteredUnreadHiddenCount: unread.hiddenCount,
    filteredRecentHiddenCount: recent.hiddenCount,
  };
}

function renderUnreadEmailBlockedSenderPanel(activeAccountId = '', blockedSenderList = []){
  const list = Array.isArray(blockedSenderList) ? blockedSenderList.slice().sort((a, b) => String(a || '').localeCompare(String(b || ''))) : [];
  if (!list.length) return '';
  const query = getUnreadEmailBlockedSenderQuery(activeAccountId);
  const filteredList = query
    ? list.filter((email) => String(email || '').toLowerCase().includes(query))
    : list;
  const showSearch = list.length > 4;
  const resultsLabel = query
    ? `${filteredList.length} of ${list.length} sender${list.length === 1 ? '' : 's'}`
    : `${list.length} sender${list.length === 1 ? '' : 's'}`;
  return `
    <details class="unread-email-blocklist-panel" open>
      <summary class="unread-email-blocklist-summary">
        <span class="unread-email-blocklist-label">Blocked senders</span>
        <span class="unread-email-blocklist-count">${escapeHtml(String(list.length))}</span>
      </summary>
      <div class="unread-email-blocklist">
        <div class="unread-email-blocklist-meta">${escapeHtml(resultsLabel)}${query ? ` for "${escapeHtml(query)}"` : ''}</div>
        ${showSearch ? `
          <label class="unread-email-blocklist-search">
            <input
              type="search"
              value="${escapeHtml(query)}"
              placeholder="Search blocked senders"
              data-unread-email-block-filter="1"
              data-unread-email-account-id="${escapeHtml(activeAccountId)}"
            >
          </label>
        ` : ''}
        ${filteredList.length ? `
          <div class="unread-email-blocklist-chips">
            ${filteredList.map((email) => `
              <button
                class="unread-email-block-chip"
                type="button"
                data-unread-email-unblock-sender="1"
                data-unread-email-account-id="${escapeHtml(activeAccountId)}"
                data-unread-email-sender-email="${escapeHtml(email)}"
              >${escapeHtml(email)} <span aria-hidden="true">x</span></button>
            `).join('')}
          </div>
        ` : `
          <div class="unread-email-blocklist-empty">No blocked senders match this search.</div>
        `}
      </div>
    </details>
  `;
}

function renderUnreadEmailBulkBar({
  bulkSelectionSummary = '',
  inboxDeleteItems = [],
  sentDeleteItems = [],
  selectedVisibleItems = [],
  selectedInboxItems = [],
  anyActionInFlight = false,
  anyMarkReadInFlight = false,
  anySpamInFlight = false,
  anyDeleteInFlight = false,
} = {}){
  const visibleSelectionCount = Array.isArray(selectedVisibleItems) ? selectedVisibleItems.length : 0;
  const inboxSelectionCount = Array.isArray(selectedInboxItems) ? selectedInboxItems.length : 0;
  const inboxCount = Array.isArray(inboxDeleteItems) ? inboxDeleteItems.length : 0;
  const sentCount = Array.isArray(sentDeleteItems) ? sentDeleteItems.length : 0;
  if (!inboxCount && !sentCount) return '';
  return `
    <div class="unread-email-bulk-bar">
      <div class="unread-email-bulk-summary">
        <strong>${escapeHtml(bulkSelectionSummary)}</strong>
        <span>Bulk actions clear inbox items fast or move selected messages to Gmail Trash.</span>
      </div>
      <div class="unread-email-bulk-actions">
        ${inboxCount ? `<button class="btn ghost unread-email-bulk-btn" type="button" data-unread-email-select-scope="inbox" ${anyActionInFlight ? 'disabled' : ''}>Select unread</button>` : ''}
        ${sentCount ? `<button class="btn ghost unread-email-bulk-btn" type="button" data-unread-email-select-scope="sent" ${anyActionInFlight ? 'disabled' : ''}>Select sent</button>` : ''}
        <button class="btn ghost unread-email-bulk-btn" type="button" data-unread-email-select-scope="all" ${anyActionInFlight ? 'disabled' : ''}>Select all visible</button>
        <button class="btn ghost unread-email-bulk-btn" type="button" data-unread-email-clear-selection="1" ${(!visibleSelectionCount || anyActionInFlight) ? 'disabled' : ''}>Clear</button>
        <button class="btn ghost unread-email-mark-read-btn" type="button" data-unread-email-mark-read-selected="1" ${(!inboxSelectionCount || anyActionInFlight) ? 'disabled' : ''}>${anyMarkReadInFlight ? 'Marking…' : `Mark selected read (${inboxSelectionCount})`}</button>
        <button class="btn ghost unread-email-spam-btn" type="button" data-unread-email-spam-selected="1" ${(!inboxSelectionCount || anyActionInFlight) ? 'disabled' : ''}>${anySpamInFlight ? 'Sending…' : `Spam selected (${inboxSelectionCount})`}</button>
        <button class="btn ghost unread-email-delete-btn" type="button" data-unread-email-delete-selected="1" ${(!visibleSelectionCount || anyActionInFlight) ? 'disabled' : ''}>${anyDeleteInFlight ? 'Deleting…' : `Delete selected (${visibleSelectionCount})`}</button>
      </div>
    </div>
  `;
}

async function fetchUnreadEmailMessageBody({ accountId = '', mailbox = '', uid = '' } = {}){
  return postJsonWithTimeout(UNREAD_EMAIL_MESSAGE_API, {
    accountId: String(accountId || '').trim(),
    mailbox: String(mailbox || '').trim(),
    uid: Number(uid),
  }, 20000);
}

async function handleUnreadEmailDeleteAction({ accountId = '', mailbox = '', uid = '', title = '', direction = 'received' } = {}, renderOptions = {}){
  const normalizedAccountId = String(accountId || '').trim();
  const normalizedMailbox = String(mailbox || '').trim();
  const normalizedUid = String(uid || '').trim();
  if (!normalizedAccountId || !normalizedMailbox || !normalizedUid) return;

  unreadEmailDeleteInFlight = unreadEmailDeleteKey(normalizedAccountId, normalizedMailbox, normalizedUid);
  if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
  updateUnreadEmailRefreshButton();

  try {
    await postJsonWithTimeout(UNREAD_EMAIL_DELETE_API, {
      accountId: normalizedAccountId,
      mailbox: normalizedMailbox,
      uid: Number(normalizedUid),
    }, 15000);
    setUnreadEmailSelection(unreadEmailDeleteKey(normalizedAccountId, normalizedMailbox, normalizedUid), false);
    unreadEmailDeleteInFlight = '';
    updateUnreadEmailRefreshButton();
    await renderUnreadEmailPod({ manual: true });
  } catch (error) {
    unreadEmailDeleteInFlight = '';
    if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
    updateUnreadEmailRefreshButton();
    window.alert(String(error?.message || 'Unable to move this email to Gmail Trash.'));
  }
}

async function handleUnreadEmailMarkReadAction({ accountId = '', mailbox = '', uid = '' } = {}, renderOptions = {}){
  const normalizedAccountId = String(accountId || '').trim();
  const normalizedMailbox = String(mailbox || '').trim();
  const normalizedUid = String(uid || '').trim();
  if (!normalizedAccountId || !normalizedMailbox || !normalizedUid) return;

  unreadEmailMarkReadInFlight = unreadEmailDeleteKey(normalizedAccountId, normalizedMailbox, normalizedUid);
  if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
  updateUnreadEmailRefreshButton();

  try {
    await postJsonWithTimeout(UNREAD_EMAIL_MARK_READ_API, {
      accountId: normalizedAccountId,
      mailbox: normalizedMailbox,
      uid: Number(normalizedUid),
    }, 15000);
    setUnreadEmailSelection(unreadEmailDeleteKey(normalizedAccountId, normalizedMailbox, normalizedUid), false);
    unreadEmailMarkReadInFlight = '';
    updateUnreadEmailRefreshButton();
    await renderUnreadEmailPod({ manual: true });
  } catch (error) {
    unreadEmailMarkReadInFlight = '';
    if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
    updateUnreadEmailRefreshButton();
    window.alert(String(error?.message || 'Unable to mark this email as read.'));
  }
}

async function handleUnreadEmailSpamAction({ accountId = '', mailbox = '', uid = '' } = {}, renderOptions = {}){
  const normalizedAccountId = String(accountId || '').trim();
  const normalizedMailbox = String(mailbox || '').trim();
  const normalizedUid = String(uid || '').trim();
  if (!normalizedAccountId || !normalizedMailbox || !normalizedUid) return;

  unreadEmailSpamInFlight = unreadEmailDeleteKey(normalizedAccountId, normalizedMailbox, normalizedUid);
  if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
  updateUnreadEmailRefreshButton();

  try {
    await postJsonWithTimeout(UNREAD_EMAIL_SPAM_API, {
      accountId: normalizedAccountId,
      mailbox: normalizedMailbox,
      uid: Number(normalizedUid),
    }, 15000);
    setUnreadEmailSelection(unreadEmailDeleteKey(normalizedAccountId, normalizedMailbox, normalizedUid), false);
    unreadEmailSpamInFlight = '';
    updateUnreadEmailRefreshButton();
    await renderUnreadEmailPod({ manual: true });
  } catch (error) {
    unreadEmailSpamInFlight = '';
    if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
    updateUnreadEmailRefreshButton();
    window.alert(String(error?.message || 'Unable to move this email to spam.'));
  }
}

async function handleUnreadEmailBulkDeleteAction({ accountId = '', items = [] } = {}, renderOptions = {}){
  const normalizedAccountId = String(accountId || '').trim();
  const selectedItems = (Array.isArray(items) ? items : []).filter((item) => item?.key && item?.mailbox && Number.isFinite(Number(item?.uid)));
  if (!normalizedAccountId || !selectedItems.length) return;

  unreadEmailDeleteInFlight = `batch::${normalizedAccountId}`;
  if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
  updateUnreadEmailRefreshButton();

  try {
    const result = await postJsonWithTimeout(UNREAD_EMAIL_DELETE_BATCH_API, {
      accountId: normalizedAccountId,
      items: selectedItems.map((item) => ({
        mailbox: item.mailbox,
        uid: Number(item.uid),
      })),
    }, 20000);
    const failedKeys = new Set((Array.isArray(result?.items) ? result.items : [])
      .filter((item) => item?.status === 'failed')
      .map((item) => unreadEmailDeleteKey(normalizedAccountId, item.mailbox, item.uid)));
    setUnreadEmailSelections(selectedItems.filter((item) => !failedKeys.has(item.key)), false);
    unreadEmailDeleteInFlight = '';
    updateUnreadEmailRefreshButton();
    await renderUnreadEmailPod({ manual: true });
    if (failedKeys.size) window.alert(`${failedKeys.size} selected email${failedKeys.size === 1 ? '' : 's'} could not be moved. They remain selected so you can retry them.`);
  } catch (error) {
    unreadEmailDeleteInFlight = '';
    updateUnreadEmailRefreshButton();
    await renderUnreadEmailPod({ manual: true });
    window.alert(String(error?.message || 'Unable to move the selected emails to Gmail Trash.'));
  }
}

async function handleUnreadEmailBulkMarkReadAction({ accountId = '', items = [] } = {}, renderOptions = {}){
  const normalizedAccountId = String(accountId || '').trim();
  const selectedItems = (Array.isArray(items) ? items : []).filter((item) => item?.key && item?.mailbox && Number.isFinite(Number(item?.uid)));
  if (!normalizedAccountId || !selectedItems.length) return;

  unreadEmailMarkReadInFlight = `batch::${normalizedAccountId}`;
  if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
  updateUnreadEmailRefreshButton();

  try {
    const result = await postJsonWithTimeout(UNREAD_EMAIL_MARK_READ_BATCH_API, {
      accountId: normalizedAccountId,
      items: selectedItems.map((item) => ({
        mailbox: item.mailbox,
        uid: Number(item.uid),
      })),
    }, 20000);
    const failedKeys = new Set((Array.isArray(result?.items) ? result.items : [])
      .filter((item) => item?.status === 'failed')
      .map((item) => unreadEmailDeleteKey(normalizedAccountId, item.mailbox, item.uid)));
    setUnreadEmailSelections(selectedItems.filter((item) => !failedKeys.has(item.key)), false);
    unreadEmailMarkReadInFlight = '';
    updateUnreadEmailRefreshButton();
    await renderUnreadEmailPod({ manual: true });
    if (failedKeys.size) window.alert(`${failedKeys.size} selected email${failedKeys.size === 1 ? '' : 's'} could not be marked read. They remain selected so you can retry them.`);
  } catch (error) {
    unreadEmailMarkReadInFlight = '';
    updateUnreadEmailRefreshButton();
    await renderUnreadEmailPod({ manual: true });
    window.alert(String(error?.message || 'Unable to mark the selected emails as read.'));
  }
}

async function handleUnreadEmailBulkSpamAction({ accountId = '', items = [] } = {}, renderOptions = {}){
  const normalizedAccountId = String(accountId || '').trim();
  const selectedItems = (Array.isArray(items) ? items : []).filter((item) => item?.key && item?.mailbox && Number.isFinite(Number(item?.uid)));
  if (!normalizedAccountId || !selectedItems.length) return;

  unreadEmailSpamInFlight = `batch::${normalizedAccountId}`;
  if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
  updateUnreadEmailRefreshButton();

  try {
    const result = await postJsonWithTimeout(UNREAD_EMAIL_SPAM_BATCH_API, {
      accountId: normalizedAccountId,
      items: selectedItems.map((item) => ({
        mailbox: item.mailbox,
        uid: Number(item.uid),
      })),
    }, 20000);
    const failedKeys = new Set((Array.isArray(result?.items) ? result.items : [])
      .filter((item) => item?.status === 'failed')
      .map((item) => unreadEmailDeleteKey(normalizedAccountId, item.mailbox, item.uid)));
    setUnreadEmailSelections(selectedItems.filter((item) => !failedKeys.has(item.key)), false);
    unreadEmailSpamInFlight = '';
    updateUnreadEmailRefreshButton();
    await renderUnreadEmailPod({ manual: true });
    if (failedKeys.size) window.alert(`${failedKeys.size} selected email${failedKeys.size === 1 ? '' : 's'} could not be moved to spam. They remain selected so you can retry them.`);
  } catch (error) {
    unreadEmailSpamInFlight = '';
    updateUnreadEmailRefreshButton();
    await renderUnreadEmailPod({ manual: true });
    window.alert(String(error?.message || 'Unable to move the selected emails to spam.'));
  }
}

async function handleUnreadEmailMessageToggle({ accountId = '', mailbox = '', uid = '' } = {}, renderOptions = {}){
  const messageKey = createUnreadEmailMessageKey(accountId, mailbox, uid);
  if (!messageKey) return;

  if (unreadEmailExpandedKeys.has(messageKey)) {
    unreadEmailExpandedKeys = new Set([...unreadEmailExpandedKeys].filter((key) => key !== messageKey));
    if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
    return;
  }

  unreadEmailExpandedKeys = new Set([...unreadEmailExpandedKeys, messageKey]);
  if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);

  if (unreadEmailExpandedBodies.has(messageKey) || unreadEmailExpandedLoadingKeys.has(messageKey)) return;

  unreadEmailExpandedErrors.delete(messageKey);
  unreadEmailExpandedLoadingKeys = new Set([...unreadEmailExpandedLoadingKeys, messageKey]);
  if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);

  try {
    const payload = await fetchUnreadEmailMessageBody({ accountId, mailbox, uid });
    const truncationNote = payload?.bodyTruncated ? '\n\n[Only the first part of this message was loaded.]' : '';
    const attachmentNote = Array.isArray(payload?.attachmentMetadata) && payload.attachmentMetadata.length
      ? `\n\n[Attachments: ${payload.attachmentMetadata.map((item) => String(item?.fileName || '')).filter(Boolean).join(', ')}]`
      : '';
    unreadEmailExpandedBodies.set(messageKey, `${String(payload?.bodyText || '').trim()}${truncationNote}${attachmentNote}`.trim());
    unreadEmailExpandedErrors.delete(messageKey);
  } catch (error) {
    unreadEmailExpandedErrors.set(messageKey, String(error?.message || 'Unable to load the full email.'));
  } finally {
    unreadEmailExpandedLoadingKeys = new Set([...unreadEmailExpandedLoadingKeys].filter((key) => key !== messageKey));
    if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, renderOptions);
  }
}

function unreadEmailVisualState({ routeUnavailable = false, setupRequired = false, stale = false, partialFailure = false, displayUnreadCount = null } = {}){
  return routeUnavailable
    ? 'route-error'
    : setupRequired
      ? 'setup'
      : stale
        ? 'stale'
        : partialFailure
          ? 'partial'
          : displayUnreadCount == null
            ? 'neutral'
            : displayUnreadCount
              ? 'active'
              : 'clear';
}

function renderUnreadEmailTag(label, tone = 'neutral'){
  return `<span class="unread-email-tag unread-email-tag-${tone}">${escapeHtml(label)}</span>`;
}

function renderUnreadEmailSectionTags(tags = []){
  const markup = tags.filter(Boolean).join('');
  return markup ? `<div class="unread-email-section-tags">${markup}</div>` : '';
}

function normalizeUnreadEmailReaderText(value = ''){
  return String(value || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
}

function unreadEmailReaderParagraphs(lines = []){
  const paragraphs = [];
  let current = [];
  (Array.isArray(lines) ? lines : []).forEach((line) => {
    const normalized = String(line || '').trim();
    if (!normalized) {
      if (current.length) {
        paragraphs.push(current.join(' '));
        current = [];
      }
      return;
    }
    current.push(normalized);
  });
  if (current.length) paragraphs.push(current.join(' '));
  return paragraphs;
}

function renderUnreadEmailReaderParagraph(paragraph = '', className = ''){
  const text = String(paragraph || '').trim();
  const attrs = className ? ` class="${className}"` : '';
  if (!text) return `<p${attrs}></p>`;
  const urlPattern = /(https?:\/\/[^\s<>"']+)/g;
  const parts = text.split(urlPattern);
  const markup = parts.map((part, index) => {
    if (index % 2 === 1) {
      const safe = safeExternalUrl(part);
      return safe
        ? `<a href="${escapeAttribute(safe)}" target="_blank" rel="noopener noreferrer">${escapeText(part)}</a>`
        : escapeText(part);
    }
    return escapeText(part);
  }).join('');
  return `<p${attrs}>${markup}</p>`;
}

function formatUnreadEmailReaderBody(bodyText = ''){
  const source = normalizeUnreadEmailReaderText(bodyText);
  if (!source) {
    return {
      lead: [],
      quotes: [],
      footer: [],
      rawHtmlHidden: false,
    };
  }

  const htmlStart = source.search(/(?:^|\n)\s*<(?:div|p|br|img|a|table|html|body)\b/i);
  const readableSlice = htmlStart > 0 ? source.slice(0, htmlStart).trim() : source;
  const rawHtmlHidden = htmlStart > 0;
  const footerPatterns = [
    /^reply to this email directly/i,
    /^view (?:it|this pull request|on github)/i,
    /^or unsubscribe/i,
    /^you are receiving this because/i,
    /^message id:/i,
    /^id:\s/i,
    /^charset=/i,
    /^content-(?:type|transfer-encoding|language):/i,
    /^mime-version:/i,
    /^boundary=/i,
    /^https:\/\/github\.com\/notifications\/unsubscribe/i,
    /^on github[,.:]?$/i,
  ];
  const quoteBoundaryPatterns = [
    /\b(?:wrote|napisa[łl]|schrieb|escribi[oó]|ha scritto|a écrit)\s*:?$/i,
    /^on .+\bwrote:?$/i,
    /^dnia .+napisa[łl]:?$/i,
  ];

  const leadLines = [];
  const quoteLines = [];
  const footerLines = [];
  let inFooter = false;
  let inQuote = false;

  readableSlice.split('\n').forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed && !inFooter) {
      if ((inQuote || quoteLines.length) && quoteLines[quoteLines.length - 1] !== '') quoteLines.push('');
      else if (leadLines.length && leadLines[leadLines.length - 1] !== '') leadLines.push('');
      return;
    }
    if (!inFooter && footerPatterns.some((pattern) => pattern.test(trimmed))) {
      inFooter = true;
    }
    if (inFooter) {
      footerLines.push(trimmed);
      return;
    }
    if (quoteBoundaryPatterns.some((pattern) => pattern.test(trimmed))) {
      inQuote = true;
      quoteLines.push(trimmed.replace(/^>\s?/, ''));
      return;
    }
    if (inQuote || /^>/.test(trimmed)) {
      quoteLines.push(trimmed.replace(/^>\s?/, ''));
      return;
    }
    leadLines.push(trimmed);
  });

  return {
    lead: unreadEmailReaderParagraphs(leadLines),
    quotes: unreadEmailReaderParagraphs(quoteLines),
    footer: unreadEmailReaderParagraphs(footerLines),
    rawHtmlHidden,
  };
}

function renderUnreadEmailExpandedBody(messageKey = ''){
  const key = String(messageKey || '').trim();
  if (!key || !unreadEmailExpandedKeys.has(key)) return '';

  const isLoading = unreadEmailExpandedLoadingKeys.has(key);
  const errorText = String(unreadEmailExpandedErrors.get(key) || '').trim();
  const bodyText = String(unreadEmailExpandedBodies.get(key) || '').trim();
  let content = '<p class="unread-email-item-full-note">No readable body content was returned for this email.</p>';

  if (isLoading) {
    content = '<p class="unread-email-item-full-note">Loading full email…</p>';
  } else if (errorText) {
    content = `<p class="unread-email-item-full-note is-error">${escapeHtml(errorText)}</p>`;
  } else if (bodyText) {
    const formatted = formatUnreadEmailReaderBody(bodyText);
    const leadMarkup = formatted.lead.length
      ? formatted.lead.map((paragraph) => renderUnreadEmailReaderParagraph(paragraph)).join('')
      : '<p class="unread-email-item-full-note">This message does not have a clean plain-text body, so some technical content was hidden.</p>';
    const quoteMarkup = formatted.quotes.length
      ? `
        <details class="unread-email-reader-details">
          <summary>Quoted thread</summary>
          <div class="unread-email-reader-quote">
            ${formatted.quotes.map((paragraph) => renderUnreadEmailReaderParagraph(paragraph)).join('')}
          </div>
        </details>
      `
      : '';
    const footerSummary = [
      formatted.footer.length ? 'notification footer' : '',
      formatted.rawHtmlHidden ? 'raw HTML' : '',
    ].filter(Boolean).join(' and ');
    const footerMarkup = (formatted.footer.length || formatted.rawHtmlHidden)
      ? `
        <details class="unread-email-reader-details unread-email-reader-details-muted">
          <summary>${escapeHtml(footerSummary ? `Hidden ${footerSummary}` : 'Hidden details')}</summary>
          <div class="unread-email-reader-footer">
            ${formatted.footer.length ? formatted.footer.map((paragraph) => renderUnreadEmailReaderParagraph(paragraph)).join('') : '<p>Raw HTML and email metadata were hidden to keep this readable.</p>'}
          </div>
        </details>
      `
      : '';
    content = `
      <div class="unread-email-item-full-text unread-email-reader">
        ${leadMarkup}
        ${quoteMarkup}
        ${footerMarkup}
      </div>
    `;
  }

  return `
    <div class="unread-email-item-full">
      <div class="unread-email-item-full-head">
        <strong>Reader view</strong>
      </div>
      ${content}
    </div>
  `;
}

function createUnreadEmailDeleteItem(activeAccountId = '', entry = {}, direction = 'received'){
  const accountId = String(activeAccountId || '').trim();
  const mailbox = String(entry?.mailbox || '').trim();
  const uid = Number(entry?.uid);
  if (!accountId || !mailbox || !Number.isFinite(uid) || uid <= 0) return null;
  return {
    key: unreadEmailDeleteKey(accountId, mailbox, uid),
    accountId,
    mailbox,
    uid,
    title: String(entry?.title || 'Untitled message'),
    direction,
  };
}

function renderUnreadEmailMessageCard({
  entry,
  direction = 'received',
  activeAccountId = '',
  showActions = true,
  anyActionInFlight = false,
} = {}){
  const personLabel = direction === 'sent' ? 'To' : 'From';
  const personText = escapeHtml(entry?.counterpartyName || entry?.counterpartyEmail || 'Unknown');
  const issuedLabel = escapeHtml(entry?.issuedAt ? new Date(entry.issuedAt).toLocaleString() : 'Unknown time');
  const summary = String(entry?.summary || '').trim();
  const preview = summary ? escapeHtml(summary) : 'Preview unavailable from the mailbox bridge.';
  const deleteItem = createUnreadEmailDeleteItem(activeAccountId, entry, direction);
  const deleteKey = String(deleteItem?.key || '').trim();
  const messageKey = createUnreadEmailMessageKey(activeAccountId, entry?.mailbox, entry?.uid);
  const canDelete = !!deleteItem;
  const senderEmailRaw = String(entry?.counterpartyEmail || '').trim().toLowerCase();
  const canMarkRead = direction === 'received' && !!deleteItem && showActions;
  const canSpam = direction === 'received' && !!deleteItem && showActions;
  const canBlockSender = direction === 'received' && !!deleteItem && showActions && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(senderEmailRaw);
  const isMarkingRead = deleteKey && unreadEmailMarkReadInFlight === deleteKey;
  const isSpamming = deleteKey && unreadEmailSpamInFlight === deleteKey;
  const isDeleting = deleteKey && unreadEmailDeleteInFlight === deleteKey;
  const isSelected = deleteKey && unreadEmailSelectedKeys.has(deleteKey);
  const isExpanded = messageKey && unreadEmailExpandedKeys.has(messageKey);
  const isLoading = messageKey && unreadEmailExpandedLoadingKeys.has(messageKey);
  const markReadLabel = isMarkingRead ? 'Marking…' : 'Mark read';
  const spamLabel = isSpamming ? 'Sending…' : 'Spam';
  const deleteLabel = isDeleting ? 'Deleting…' : 'Delete';
  const counterpartyEmail = (entry?.counterpartyEmail && entry?.counterpartyName) ? escapeHtml(entry.counterpartyEmail) : '';
  const directionTag = direction === 'sent'
    ? renderUnreadEmailTag('Sent', 'sent')
    : renderUnreadEmailTag('Unread', 'unread');
  const expandLabel = isExpanded ? 'Collapse' : (isLoading ? 'Loading…' : 'Expand');
  return `
    <article class="unread-email-item unread-email-item-${direction} ${isSelected ? 'is-selected' : ''} ${isDeleting ? 'is-deleting' : ''} ${isExpanded ? 'is-expanded' : ''}">
      <button
        class="unread-email-item-main unread-email-item-toggle"
        type="button"
        ${messageKey ? `data-unread-email-toggle="1" data-unread-email-account-id="${escapeHtml(activeAccountId)}" data-unread-email-mailbox="${escapeHtml(String(entry?.mailbox || ''))}" data-unread-email-uid="${escapeHtml(String(entry?.uid || ''))}" aria-expanded="${isExpanded ? 'true' : 'false'}"` : 'disabled'}
      >
        <div class="unread-email-item-topline">
          <div class="unread-email-item-tags">
            ${directionTag}
            ${renderUnreadEmailTag(issuedLabel, 'time')}
          </div>
          <span class="unread-email-item-expand-hint">${expandLabel}</span>
        </div>
        <div class="unread-email-item-head">
          <strong>${escapeHtml(entry?.title || 'Untitled message')}</strong>
          <span>${personLabel}: ${personText}</span>
        </div>
        ${counterpartyEmail ? `
          <div class="unread-email-item-meta">
            <span>${counterpartyEmail}</span>
          </div>
        ` : ''}
        <p class="unread-email-item-preview ${summary ? '' : 'is-muted'}">${preview}</p>
      </button>
      <div class="unread-email-item-side">
        <div class="unread-email-item-side-meta">
          <span class="unread-email-item-side-label">${personLabel}</span>
          <strong>${personText}</strong>
          ${counterpartyEmail ? `<span>${counterpartyEmail}</span>` : ''}
        </div>
        ${(canDelete && showActions) ? `
          <div class="unread-email-item-actions">
            <label class="unread-email-select-toggle">
              <input
                type="checkbox"
                data-unread-email-select="1"
                data-unread-email-select-key="${escapeHtml(deleteKey)}"
                ${isSelected ? 'checked' : ''}
                ${anyActionInFlight ? 'disabled' : ''}
              >
              <span>Keep selected</span>
            </label>
            ${canMarkRead ? `
              <button
                class="btn ghost unread-email-mark-read-btn"
                type="button"
                data-unread-email-mark-read="1"
                data-unread-email-account-id="${escapeHtml(deleteItem.accountId || '')}"
                data-unread-email-mailbox="${escapeHtml(deleteItem.mailbox || '')}"
                data-unread-email-uid="${escapeHtml(String(deleteItem.uid || ''))}"
                ${anyActionInFlight ? 'disabled' : ''}
              >${markReadLabel}</button>
            ` : ''}
            ${canSpam ? `
              <button
                class="btn ghost unread-email-spam-btn"
                type="button"
                data-unread-email-spam="1"
                data-unread-email-account-id="${escapeHtml(deleteItem.accountId || '')}"
                data-unread-email-mailbox="${escapeHtml(deleteItem.mailbox || '')}"
                data-unread-email-uid="${escapeHtml(String(deleteItem.uid || ''))}"
                ${anyActionInFlight ? 'disabled' : ''}
              >${spamLabel}</button>
            ` : ''}
            ${canBlockSender ? `
              <button
                class="btn ghost unread-email-block-btn"
                type="button"
                data-unread-email-block-sender="1"
                data-unread-email-account-id="${escapeHtml(deleteItem.accountId || '')}"
                data-unread-email-sender-email="${escapeHtml(senderEmailRaw)}"
                ${anyActionInFlight ? 'disabled' : ''}
              >Block sender</button>
            ` : ''}
            <button
              class="btn ghost unread-email-delete-btn"
              type="button"
              data-unread-email-delete="1"
              data-unread-email-account-id="${escapeHtml(deleteItem.accountId || '')}"
              data-unread-email-mailbox="${escapeHtml(deleteItem.mailbox || '')}"
              data-unread-email-uid="${escapeHtml(String(deleteItem.uid || ''))}"
              data-unread-email-title="${escapeHtml(deleteItem.title || 'Untitled message')}"
              data-unread-email-direction="${escapeHtml(deleteItem.direction || direction)}"
              ${anyActionInFlight ? 'disabled' : ''}
            >${deleteLabel}</button>
          </div>
        ` : ''}
      </div>
      ${renderUnreadEmailExpandedBody(messageKey)}
    </article>
  `;
}

function bindUnreadEmailWidgetInteractions({
  el,
  options = {},
  activeAccount = null,
  inboxDeleteItems = [],
  sentDeleteItems = [],
  visibleDeleteItems = [],
  selectedVisibleItems = [],
  selectedInboxItems = [],
} = {}){
  if (!el) return;

  el.querySelectorAll('[data-unread-email-account]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextId = String(button.getAttribute('data-unread-email-account') || '').trim();
      if (!nextId || nextId === unreadEmailActiveAccountId) return;
      setUnreadEmailActiveAccountId(nextId);
      if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, options);
    });
  });

  el.querySelectorAll('[data-unread-email-toggle-recent]').forEach((button) => {
    button.addEventListener('click', () => {
      unreadEmailShowRecentInbox = !unreadEmailShowRecentInbox;
      if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, options);
    });
  });

  el.querySelectorAll('[data-unread-email-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      await handleUnreadEmailMessageToggle({
        accountId: button.getAttribute('data-unread-email-account-id') || '',
        mailbox: button.getAttribute('data-unread-email-mailbox') || '',
        uid: button.getAttribute('data-unread-email-uid') || '',
      }, options);
    });
  });

  el.querySelectorAll('[data-unread-email-select]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = String(input.getAttribute('data-unread-email-select-key') || '').trim();
      setUnreadEmailSelection(key, !!input.checked);
      if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, options);
    });
  });

  el.querySelectorAll('[data-unread-email-select-scope]').forEach((button) => {
    button.addEventListener('click', () => {
      const scope = String(button.getAttribute('data-unread-email-select-scope') || '').trim();
      const items = scope === 'inbox'
        ? inboxDeleteItems
        : scope === 'sent'
          ? sentDeleteItems
          : visibleDeleteItems;
      setUnreadEmailSelections(items, true);
      if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, options);
    });
  });

  el.querySelectorAll('[data-unread-email-clear-selection]').forEach((button) => {
    button.addEventListener('click', () => {
      setUnreadEmailSelections(visibleDeleteItems, false);
      if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, options);
    });
  });

  el.querySelectorAll('[data-unread-email-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      await handleUnreadEmailDeleteAction({
        accountId: button.getAttribute('data-unread-email-account-id') || '',
        mailbox: button.getAttribute('data-unread-email-mailbox') || '',
        uid: button.getAttribute('data-unread-email-uid') || '',
        title: button.getAttribute('data-unread-email-title') || '',
        direction: button.getAttribute('data-unread-email-direction') || 'received',
      }, options);
    });
  });

  el.querySelectorAll('[data-unread-email-mark-read]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      await handleUnreadEmailMarkReadAction({
        accountId: button.getAttribute('data-unread-email-account-id') || '',
        mailbox: button.getAttribute('data-unread-email-mailbox') || '',
        uid: button.getAttribute('data-unread-email-uid') || '',
      }, options);
    });
  });

  el.querySelectorAll('[data-unread-email-spam]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      await handleUnreadEmailSpamAction({
        accountId: button.getAttribute('data-unread-email-account-id') || '',
        mailbox: button.getAttribute('data-unread-email-mailbox') || '',
        uid: button.getAttribute('data-unread-email-uid') || '',
      }, options);
    });
  });

  el.querySelectorAll('[data-unread-email-block-sender]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const accountId = button.getAttribute('data-unread-email-account-id') || '';
      const senderEmail = button.getAttribute('data-unread-email-sender-email') || '';
      if (!blockUnreadEmailSender(accountId, senderEmail)) return;
      clearUnreadEmailSelections(accountId);
      if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, options);
    });
  });

  el.querySelectorAll('[data-unread-email-unblock-sender]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const accountId = button.getAttribute('data-unread-email-account-id') || '';
      const senderEmail = button.getAttribute('data-unread-email-sender-email') || '';
      if (!unblockUnreadEmailSender(accountId, senderEmail)) return;
      if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, options);
    });
  });

  el.querySelectorAll('[data-unread-email-block-filter]').forEach((input) => {
    input.addEventListener('input', () => {
      const accountId = input.getAttribute('data-unread-email-account-id') || '';
      setUnreadEmailBlockedSenderQuery(accountId, input.value || '');
      if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, options);
    });
  });

  el.querySelectorAll('[data-unread-email-delete-selected]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled || !activeAccount?.id) return;
      await handleUnreadEmailBulkDeleteAction({
        accountId: activeAccount.id,
        items: selectedVisibleItems,
      }, options);
    });
  });

  el.querySelectorAll('[data-unread-email-mark-read-selected]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled || !activeAccount?.id) return;
      await handleUnreadEmailBulkMarkReadAction({
        accountId: activeAccount.id,
        items: selectedInboxItems,
      }, options);
    });
  });

  el.querySelectorAll('[data-unread-email-spam-selected]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled || !activeAccount?.id) return;
      await handleUnreadEmailBulkSpamAction({
        accountId: activeAccount.id,
        items: selectedInboxItems,
      }, options);
    });
  });
}

function renderUnreadEmailWidget(payload, options = {}){
  const el = document.getElementById('unreadEmailWidget');
  if (!el) return;

  const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
  const activeAccount = resolveUnreadEmailActiveAccount(accounts);
  const activeAccountId = String(activeAccount?.id || '').trim();
  const {
    blockedSenderList,
    activeEntries,
    activeRecentEntries,
    filteredUnreadHiddenCount,
    filteredRecentHiddenCount,
  } = getUnreadEmailFilteredEntrySets(activeAccount, activeAccountId);
  const activeSentEntries = Array.isArray(activeAccount?.sentEntries) ? activeAccount.sentEntries.slice(0, 5) : [];
  const totalUnreadCount = Number.isFinite(Number(payload?.unreadCount)) ? Math.max(0, Number(payload.unreadCount)) : null;
  const activeUnreadCount = Number.isFinite(Number(activeAccount?.unreadCount)) ? Math.max(0, Number(activeAccount.unreadCount)) : null;
  const displayUnreadCount = activeAccount ? activeUnreadCount : totalUnreadCount;
  const inboxUrl = String(activeAccount?.inboxUrl || payload?.inboxUrl || '').trim();
  const sentOpenUrl = String(activeAccount?.sentOpenUrl || '').trim();
  const setupRequired = !!payload?.setupRequired;
  const partialFailure = !!payload?.partialFailure;
  const routeUnavailable = !!payload?.routeUnavailable;
  const stale = !!options.stale;
  const backoffLeftMs = Number(options.backoffLeftMs || 0);
  const activeLabel = String(activeAccount?.label || 'Unread email').trim();
  const activeStatus = String(activeAccount?.status || '').trim();
  const anyActionInFlight = !!unreadEmailMarkReadInFlight || !!unreadEmailSpamInFlight || !!unreadEmailDeleteInFlight;
  const anyDeleteInFlight = !!unreadEmailDeleteInFlight;
  const stateLabel = routeUnavailable
    ? 'Server route unavailable'
    : setupRequired
    ? 'Setup required'
    : stale
      ? 'Using last successful snapshot'
      : partialFailure
        ? 'Partial inbox coverage'
      : displayUnreadCount == null
        ? 'Waiting for inbox data'
      : displayUnreadCount === 0
        ? `${activeLabel} is clear`
        : `${activeLabel} · ${displayUnreadCount} unread right now`;
  const helper = routeUnavailable
    ? 'The browser reached the app, but the running server does not yet expose `/api/email-unread`. Restart the local server after pulling the latest code.'
    : setupRequired
    ? 'Add Gmail credentials in `.env` to enable live inbox snapshots.'
    : stale
      ? `Retrying in ${Math.ceil(backoffLeftMs / 1000)}s while keeping the latest working snapshot visible.`
      : partialFailure
        ? 'Some inboxes are healthy while others still need credentials or attention.'
      : displayUnreadCount == null
        ? 'The mailbox bridge has not returned a count yet.'
      : activeAccount?.includeSent
        ? 'Showing unread inbox items by default. Use the latest 5 overall button for recent mail; Tavern sent items stay separate.'
        : 'Showing unread inbox items by default. Use the latest 5 overall button for recent mail.';
  const inboxDeleteItems = activeEntries.map((entry) => createUnreadEmailDeleteItem(activeAccountId, entry, 'received')).filter(Boolean);
  const sentDeleteItems = activeSentEntries.map((entry) => createUnreadEmailDeleteItem(activeAccountId, entry, 'sent')).filter(Boolean);
  const visibleDeleteItems = [...inboxDeleteItems, ...sentDeleteItems];
  const selectedVisibleItems = visibleDeleteItems.filter((item) => unreadEmailSelectedKeys.has(item.key));
  const selectedInboxItems = inboxDeleteItems.filter((item) => unreadEmailSelectedKeys.has(item.key));
  const bulkSelectionSummary = selectedVisibleItems.length ? `${selectedVisibleItems.length} selected` : `${visibleDeleteItems.length} available`;
  const visualState = unreadEmailVisualState({ routeUnavailable, setupRequired, stale, partialFailure, displayUnreadCount });

  const accountTabs = accounts.map((account) => {
    const isActive = String(account?.id || '') === String(activeAccount?.id || '');
    const countLabel = account?.unreadCount == null ? '—' : escapeHtml(String(account.unreadCount));
    return `
      <button class="unread-email-account-tab ${isActive ? 'is-active' : ''}" type="button" data-unread-email-account="${escapeHtml(account.id || '')}">
        <span class="unread-email-account-tab-label">${escapeHtml(account.label || account.account || 'Inbox')}</span>
        <strong class="unread-email-account-tab-count">${countLabel}</strong>
      </button>
    `;
  }).join('');

  el.innerHTML = `
    <div class="unread-email-shell" data-pod="unread-email">
      ${accounts.length ? `<div class="unread-email-account-tabs">${accountTabs}</div>` : ''}
      <div class="unread-email-overview">
        <div class="unread-email-summary-card is-${visualState}">
          <div class="unread-email-summary-head">
            <div>
              <span class="unread-email-summary-kicker">Inbox pulse</span>
              ${activeAccount ? `<div class="unread-email-summary-account">${escapeHtml(activeLabel)} · ${escapeHtml(activeAccount.account || '')}</div>` : ''}
            </div>
            <strong>${displayUnreadCount == null ? '—' : displayUnreadCount}</strong>
          </div>
          <div class="unread-email-summary-body">
            <div class="unread-email-summary-title">${escapeHtml(stateLabel)}</div>
            <p>${escapeHtml(helper)}</p>
          </div>
        </div>
        ${activeAccount ? `
          <div class="unread-email-focus-card is-${visualState}">
            <div class="unread-email-focus-head">
              <div>
                <strong>${escapeHtml(activeLabel)}</strong>
                <div class="unread-email-focus-meta">${escapeHtml(activeAccount.account || 'Not configured')}</div>
              </div>
              <div class="unread-email-focus-stats">
                <span class="unread-email-focus-status">${escapeHtml(activeStatus || stateLabel)}</span>
                <span class="unread-email-focus-count">${displayUnreadCount == null ? '—' : escapeHtml(String(displayUnreadCount))}</span>
              </div>
            </div>
            <div class="unread-email-focus-actions">
              ${safeExternalUrl(inboxUrl) ? `<a class="btn ghost" href="${escapeAttribute(safeExternalUrl(inboxUrl))}" target="_blank" rel="noopener noreferrer">Open inbox</a>` : ''}
              <button class="btn ghost unread-email-bulk-btn" type="button" data-unread-email-toggle-recent="1">${unreadEmailShowRecentInbox ? 'Hide latest 5 overall' : 'Show latest 5 overall'}</button>
              ${(activeAccount.includeSent && safeExternalUrl(sentOpenUrl)) ? `<a class="btn ghost" href="${escapeAttribute(safeExternalUrl(sentOpenUrl))}" target="_blank" rel="noopener noreferrer">Open sent</a>` : ''}
            </div>
            ${renderUnreadEmailBlockedSenderPanel(activeAccountId, blockedSenderList)}
            ${activeAccount.message ? `<p>${escapeHtml(activeAccount.message)}</p>` : ''}
          </div>
        ` : ''}
      </div>
      ${renderUnreadEmailBulkBar({
        bulkSelectionSummary,
        inboxDeleteItems,
        sentDeleteItems,
        selectedVisibleItems,
        selectedInboxItems,
        anyActionInFlight,
        anyMarkReadInFlight: !!unreadEmailMarkReadInFlight,
        anySpamInFlight: !!unreadEmailSpamInFlight,
        anyDeleteInFlight,
      })}
      ${setupRequired ? `
        <div class="unread-email-setup-card">
          <strong>Configuration</strong>
          <p>For one inbox, set <code>EMAIL_UNREAD_USERNAME</code> and <code>EMAIL_UNREAD_APP_PASSWORD</code>. For multiple inboxes, use <code>EMAIL_UNREAD_ACCOUNTS_JSON</code> with one object per Gmail address.</p>
          <p class="note-meta">This pod keeps mailbox credentials on the local server and only sends snapshots to the browser.</p>
        </div>
      ` : ''}
      ${activeEntries.length ? `
        <section class="unread-email-section">
          <div class="unread-email-section-head">
            <div>
              <div class="unread-email-section-kicker">Unread</div>
              <strong>Latest unread inbox emails</strong>
            </div>
            ${renderUnreadEmailSectionTags([
              renderUnreadEmailTag(`${activeEntries.length} message${activeEntries.length === 1 ? '' : 's'}`, 'count'),
              renderUnreadEmailTag('Unread only', 'neutral'),
              filteredUnreadHiddenCount ? renderUnreadEmailTag(`${filteredUnreadHiddenCount} blocked hidden`, 'neutral') : '',
            ])}
          </div>
          <div class="unread-email-list">
            ${activeEntries.map((entry) => renderUnreadEmailMessageCard({ entry, direction: 'received', activeAccountId, anyActionInFlight })).join('')}
          </div>
        </section>
      ` : (!setupRequired && !routeUnavailable ? `
        <div class="unread-email-empty-state">
          <strong>No unread email previews available</strong>
          <p>The mailbox bridge returned the account status, but there were no unread inbox messages to show.</p>
        </div>
      ` : '')}
      ${unreadEmailShowRecentInbox ? `
        <section class="unread-email-section">
          <div class="unread-email-section-head">
            <div>
              <div class="unread-email-section-kicker">Recent</div>
              <strong>Latest 5 inbox emails overall</strong>
            </div>
            ${renderUnreadEmailSectionTags([
              renderUnreadEmailTag(`${activeRecentEntries.length} message${activeRecentEntries.length === 1 ? '' : 's'}`, 'count'),
              renderUnreadEmailTag('Read + unread', 'neutral'),
              filteredRecentHiddenCount ? renderUnreadEmailTag(`${filteredRecentHiddenCount} blocked hidden`, 'neutral') : '',
            ])}
          </div>
          ${activeRecentEntries.length ? `
            <div class="unread-email-list">
              ${activeRecentEntries.map((entry) => renderUnreadEmailMessageCard({ entry, direction: 'received', activeAccountId, showActions: false, anyActionInFlight })).join('')}
            </div>
          ` : `
            <div class="unread-email-empty-state">
              <strong>No recent inbox emails available</strong>
              <p>The mailbox bridge did not return any recent inbox messages for this account.</p>
            </div>
          `}
        </section>
      ` : ''}
      ${activeAccount?.includeSent ? `
        <section class="unread-email-section">
          <div class="unread-email-section-head">
            <div>
              <div class="unread-email-section-kicker">Sent</div>
              <strong>Latest 5 sent emails</strong>
            </div>
            ${renderUnreadEmailSectionTags([
              renderUnreadEmailTag(`${activeSentEntries.length} message${activeSentEntries.length === 1 ? '' : 's'}`, 'count'),
              renderUnreadEmailTag('Tavern only', 'sent'),
            ])}
          </div>
          ${activeSentEntries.length ? `
            <div class="unread-email-list unread-email-list-sent">
              ${activeSentEntries.map((entry) => renderUnreadEmailMessageCard({ entry, direction: 'sent', activeAccountId, anyActionInFlight })).join('')}
            </div>
          ` : `
            <div class="unread-email-empty-state">
              <strong>No sent previews available</strong>
              <p>The selected mailbox did not return any recent sent-message previews.</p>
            </div>
          `}
        </section>
      ` : ''}
    </div>
  `;
  bindUnreadEmailWidgetInteractions({
    el,
    options,
    activeAccount,
    inboxDeleteItems,
    sentDeleteItems,
    visibleDeleteItems,
    selectedVisibleItems,
    selectedInboxItems,
  });
}

async function renderUnreadEmailPod(options = {}){
  const meta = document.getElementById('unreadEmailMeta');
  const manual = !!options.manual;
  const backoffLeftMs = pollingBackoffState('unread-email').backoffUntil - Date.now();

  updateUnreadEmailRefreshButton();

  if (unreadEmailInFlight) {
    if (unreadEmailLastPayload) renderUnreadEmailWidget(unreadEmailLastPayload, { stale: true, backoffLeftMs: Math.max(0, backoffLeftMs) });
    setPodStatusSignal('unread-email', 'neutral', 'refreshing');
    if (meta) meta.textContent = 'Refresh already in progress.';
    return;
  }

  if (!manual && backoffLeftMs > 0 && unreadEmailLastPayload) {
    renderUnreadEmailWidget(unreadEmailLastPayload, { stale: true, backoffLeftMs });
    setPodStatusSignal('unread-email', 'stale', `retry ${Math.ceil(backoffLeftMs / 1000)}s`);
    if (meta) {
      const lastSeen = unreadEmailLastUpdatedAt ? new Date(unreadEmailLastUpdatedAt).toLocaleTimeString() : 'unknown';
      meta.textContent = `Updated: ${lastSeen} · stale snapshot · retry in ${Math.ceil(backoffLeftMs / 1000)}s`;
    }
    return;
  }

  unreadEmailInFlight = true;
  updateUnreadEmailRefreshButton();
  try {
    const payload = await fetchJsonWithTimeout(UNREAD_EMAIL_API, 10000);
    unreadEmailLastPayload = payload;
    unreadEmailLastUpdatedAt = String(payload?.fetchedAt || now());
    unreadEmailLastError = '';
    pruneUnreadEmailSelectionsFromPayload(payload);
    pruneUnreadEmailExpandedStateFromPayload(payload);
    clearPollingBackoff('unread-email');
    renderUnreadEmailWidget(payload);

    if (payload?.setupRequired) {
      setPodStatusSignal('unread-email', 'neutral', 'setup');
      if (meta) meta.textContent = 'Setup required · add Gmail Atom credentials in .env';
    } else {
      const unreadCount = Number.isFinite(Number(payload?.unreadCount)) ? Math.max(0, Number(payload.unreadCount)) : 0;
      const detail = payload?.partialFailure
        ? `${Number(payload?.healthyAccountCount || 0)}/${Number(payload?.accountCount || 0)} accounts healthy`
        : unreadCount ? `${unreadCount} unread` : 'zero unread';
      setPodStatusSignal('unread-email', payload?.partialFailure ? 'degraded' : 'fresh', detail);
      if (meta) {
        const parts = [
          `Updated: ${new Date(unreadEmailLastUpdatedAt).toLocaleTimeString()}`,
          'Auto: every 3 min',
          Number(payload?.accountCount || 0) ? `Accounts: ${payload.accountCount}` : '',
          payload?.partialFailure ? `Healthy: ${payload.healthyAccountCount || 0}` : '',
        ].filter(Boolean);
        meta.textContent = parts.join(' · ');
      }
    }
  } catch (error) {
    unreadEmailLastError = String(error?.message || error || 'Unread email refresh failed').slice(0, 220);
    const backoffMs = registerPollingFailure('unread-email', error, unreadEmailLastError);
    if (unreadEmailLastPayload) {
      renderUnreadEmailWidget(unreadEmailLastPayload, { stale: true, backoffLeftMs: backoffMs });
      setPodStatusSignal('unread-email', 'stale', `retry ${Math.ceil(backoffMs / 1000)}s`);
      if (meta) {
        const lastSeen = unreadEmailLastUpdatedAt ? new Date(unreadEmailLastUpdatedAt).toLocaleTimeString() : 'unknown';
        meta.textContent = `Updated: ${lastSeen} · ${unreadEmailLastError} · retry in ${Math.ceil(backoffMs / 1000)}s`;
      }
    } else {
      renderUnreadEmailWidget({
        unreadCount: null,
        entries: [],
        setupRequired: false,
        routeUnavailable: Number(error?.status || 0) === 404,
      });
      setPodStatusSignal('unread-email', 'error', Number(error?.status || 0) === 404 ? 'server restart' : `retry ${Math.ceil(backoffMs / 1000)}s`);
      if (meta) {
        meta.textContent = Number(error?.status || 0) === 404
          ? 'Unread email API route not found. Restart the local server so it loads the new endpoint.'
          : `${unreadEmailLastError} · retry in ${Math.ceil(backoffMs / 1000)}s`;
      }
    }
  } finally {
    unreadEmailInFlight = false;
    updateUnreadEmailRefreshButton();
  }
}

function normalizeYoutubeId(candidate){
  const value = String(candidate || '').trim();
  return /^[a-zA-Z0-9_-]{11}$/.test(value) ? value : null;
}

function extractYoutubeId(url){
  try {
    const u = new URL(String(url || '').trim());
    const host = u.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return normalizeYoutubeId(id);
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const watchId = normalizeYoutubeId(u.searchParams.get('v'));
      if (watchId) return watchId;

      const parts = u.pathname.split('/').filter(Boolean);
      const embedIdx = parts.indexOf('embed');
      if (embedIdx >= 0 && parts[embedIdx + 1]) {
        const embedId = normalizeYoutubeId(parts[embedIdx + 1]);
        if (embedId) return embedId;
      }

      const liveIdx = parts.indexOf('live');
      if (liveIdx >= 0 && parts[liveIdx + 1]) {
        const liveId = normalizeYoutubeId(parts[liveIdx + 1]);
        if (liveId) return liveId;
      }

      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) {
        const shortsId = normalizeYoutubeId(parts[shortsIdx + 1]);
        if (shortsId) return shortsId;
      }
    }
  } catch {}
  return null;
}

function ensureYoutubeApi(){
  if (window.YT?.Player || youtubeApiLoading) return;
  youtubeApiLoading = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = () => {
    youtubeApiLoading = false;
    if (pendingYoutubeAction) {
      setMusicStatus('Failed to load YouTube player API. Check connection and try again.');
    }
  };
  document.head.appendChild(tag);
}

function runPendingYoutubeAction(){
  if (!youtubePlayerReady || !streamIframePlayer || !pendingYoutubeAction) return false;

  if (pendingYoutubeAction === 'play' && streamIframePlayer.playVideo) {
    streamIframePlayer.playVideo();
    clearAmbientYoutubeFallbackTimer();
    clearYoutubePlayGuardTimer();
    pendingYoutubeAction = null;
    state.musicPlayer.isPlaying = true;
    save();
    setMusicStatus('Playing YouTube stream (audio via embed player).');
    return true;
  }

  pendingYoutubeAction = null;
  return false;
}

function ensureMusicIframe(){
  let iframe = document.getElementById('musicStreamIframe');
  if (iframe) return iframe;
  const pod = document.getElementById('musicPlayerWidget')?.querySelector('[data-pod="music-player"]');
  if (!pod) return null;
  const audioEl = pod.querySelector('[data-music-role="audio"]');
  iframe = document.createElement('iframe');
  iframe.id = 'musicStreamIframe';
  iframe.className = 'music-player-hidden';
  iframe.setAttribute('data-music-role', 'iframe');
  iframe.setAttribute('title', 'Music stream player');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  iframe.setAttribute('allow', 'autoplay; encrypted-media');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  if (audioEl?.parentElement === pod) {
    pod.insertBefore(iframe, audioEl);
  } else {
    pod.appendChild(iframe);
  }
  return iframe;
}

function clearAmbientYoutubeFallbackTimer(){
  if (ambientYoutubeFallbackTimer) {
    clearTimeout(ambientYoutubeFallbackTimer);
    ambientYoutubeFallbackTimer = null;
  }
}

function clearYoutubePlayGuardTimer(){
  if (youtubePlayGuardTimer) {
    clearTimeout(youtubePlayGuardTimer);
    youtubePlayGuardTimer = null;
  }
}

function handleAmbientSourceFailure(reason = 'Ambient source failed.'){
  clearAmbientYoutubeFallbackTimer();
  if (state.musicPlayer.mode !== 'ambient') {
    setMusicStatus(reason);
    return;
  }
  const current = getAmbientSourceForPreset();
  const sourceName = current.source?.label || `Source ${current.sourceIndex + 1}`;
  if (!current.hasFallback) {
    setMusicStatus(`${reason} ${sourceName} failed and no alternate source is available for ${current.preset.label}.`);
    return;
  }
  const nextIndex = (current.sourceIndex + 1) % current.preset.sources.length;
  const nextSource = normalizeAmbientSource(current.preset.sources[nextIndex], nextIndex);
  setMusicStatus(`${reason} Source ${current.sourceIndex + 1}/${current.preset.sources.length} failed (${sourceName}). Trying ${nextIndex + 1}/${current.preset.sources.length}: ${nextSource.label}...`);
  playAmbientPreset(current.preset.id, nextIndex);
}

function initYouTubePlayerIfReady(){
  const iframe = ensureMusicIframe();
  if (!iframe || !window.YT?.Player) return false;

  if (streamIframePlayer && streamIframeEl === iframe) {
    return true;
  }

  youtubePlayerReady = false;
  try {
    if (streamIframePlayer?.destroy) streamIframePlayer.destroy();
  } catch {}

  streamIframePlayer = null;
  streamIframeEl = iframe;

  streamIframePlayer = new window.YT.Player('musicStreamIframe', {
    events: {
      onReady: () => {
        youtubePlayerReady = true;
        syncMusicVolume(state.musicPlayer.volume);
        runPendingYoutubeAction();
      },
      onError: (event) => {
        const code = Number(event?.data || 0);
        if (state.musicPlayer.mode === 'ambient') {
          handleAmbientSourceFailure(`YouTube source error (${code || 'unknown'}).`);
          return;
        }
        state.musicPlayer.isPlaying = false;
        save();
        setMusicStatus(`YouTube stream error (${code || 'unknown'}). Try another URL or retry.`);
      },
    },
  });
  return true;
}

function getMusicEls(){
  const root = document.getElementById('musicPlayerWidget')?.querySelector('[data-pod="music-player"]') || null;
  return {
    root,
    streamInput: root?.querySelector('[data-music-role="stream-input"]') || document.getElementById('musicStreamUrlInput'),
    fileInput: root?.querySelector('[data-music-role="local-file"]') || document.getElementById('musicLocalFileInput'),
    volume: root?.querySelector('[data-music-role="volume"]') || document.getElementById('musicVolumeInput'),
    status: document.getElementById('musicPlayerStatus'),
    audio: root?.querySelector('[data-music-role="audio"]') || document.getElementById('musicLocalAudio'),
    iframe: root?.querySelector('[data-music-role="iframe"]') || document.getElementById('musicStreamIframe'),
  };
}

function getMusicPresentation(statusText = ''){
  const isAmbientMode = state.musicPlayer.mode === 'ambient';
  const ambient = getAmbientSourceForPreset();
  const currentLabel = isAmbientMode
    ? ambient.preset.label
    : (state.musicPlayer.currentTrackName || (state.musicPlayer.sourceType === 'local' ? 'Local audio file' : 'Stream source'));
  const hasSource = isAmbientMode
    ? !!ambient?.source?.url
    : !!String(state.musicPlayer.currentStreamUrl || '').trim() || state.musicPlayer.sourceType === 'local';
  const rawStatus = String(statusText || '').toLowerCase();

  let tone = 'idle';
  let signal = 'neutral';
  let signalDetail = isAmbientMode ? 'ambient' : 'ready';
  let badge = 'Ready';
  let heroTitle = isAmbientMode ? `Ambient mode: ${ambient.preset.label}` : (hasSource ? currentLabel : 'Load a stream to start');
  let fallbackMeta = isAmbientMode
    ? `Set a mood, then press Play. Current source ${ambient.sourceIndex + 1} of ${ambient.preset.sources.length}.`
    : hasSource
      ? 'Playback source is loaded. Use the transport controls when you are ready.'
      : 'Paste a stream URL, use a favorite, or drop in a local file.';

  if (state.musicPlayer.isPlaying) {
    tone = 'playing';
    signal = 'fresh';
    signalDetail = isAmbientMode ? 'ambient live' : (state.musicPlayer.sourceType === 'local' ? 'local playback' : 'playing');
    badge = 'Playing';
    heroTitle = currentLabel;
    fallbackMeta = isAmbientMode
      ? `Ambient playback is live with ${ambient.source.label}.`
      : state.musicPlayer.sourceType === 'local'
        ? `Local audio is playing: ${currentLabel}.`
        : `Playback is active from ${state.musicPlayer.streamMode === 'youtube' ? 'YouTube' : state.musicPlayer.streamMode === 'embed' ? 'embedded player' : 'stream source'}.`;
  } else if (hasSource) {
    tone = 'loaded';
    signal = 'degraded';
    signalDetail = 'loaded';
    badge = 'Loaded';
  }

  if (/failed|error|blocked|could not|unavailable/.test(rawStatus)) {
    tone = 'error';
    signal = 'error';
    signalDetail = 'attention';
    badge = 'Issue';
    fallbackMeta = statusText || fallbackMeta;
  }

  return {
    tone,
    signal,
    signalDetail,
    badge,
    heroTitle,
    heroMeta: String(statusText || fallbackMeta || '').trim(),
    sourceLine: state.musicPlayer.sourceType === 'local'
      ? 'Local file'
      : isAmbientMode
        ? `Ambient · ${ambient.preset.label}`
        : (state.musicPlayer.streamMode === 'youtube' ? 'YouTube stream' : state.musicPlayer.streamMode === 'embed' ? 'Embedded stream' : 'Stream URL'),
    favoriteLine: state.musicPlayer.favoriteStreamUrl ? 'Favorite saved' : 'No favorite saved',
    sleepLine: state.musicPlayer.sleepTimerMin ? `Sleep ${state.musicPlayer.sleepTimerMin}m` : 'Sleep off',
    volumePercent: Math.round((Number(state.musicPlayer.volume || 0) || 0) * 100),
    hasSource,
    currentLabel,
  };
}

function syncMusicUiStatus(statusText = ''){
  const meta = getMusicPresentation(statusText);
  const hero = document.querySelector('[data-music-role="hero"]');
  if (hero) hero.className = `music-player-hero music-player-hero--${meta.tone}`;

  const badge = document.querySelector('[data-music-role="status-badge"]');
  if (badge) {
    badge.textContent = meta.badge;
    badge.className = `music-player-status-pill music-player-status-pill--${meta.tone}`;
  }

  const title = document.querySelector('[data-music-role="hero-title"]');
  if (title) title.textContent = meta.heroTitle;

  const heroMeta = document.querySelector('[data-music-role="hero-meta"]');
  if (heroMeta) heroMeta.textContent = meta.heroMeta;

  const sourceLine = document.querySelector('[data-music-role="summary-source"]');
  if (sourceLine) sourceLine.textContent = meta.sourceLine;

  const favoriteLine = document.querySelector('[data-music-role="summary-favorite"]');
  if (favoriteLine) favoriteLine.textContent = meta.favoriteLine;

  const sleepLine = document.querySelector('[data-music-role="summary-sleep"]');
  if (sleepLine) sleepLine.textContent = meta.sleepLine;

  const volumeLine = document.querySelector('[data-music-role="summary-volume"]');
  if (volumeLine) volumeLine.textContent = `${meta.volumePercent}%`;

  setPodStatusSignal('music-player', meta.signal, meta.signalDetail);
}

function setMusicStatus(text){
  const el = document.getElementById('musicPlayerStatus');
  if (el) el.textContent = text;
  syncMusicUiStatus(text);
}

function getAmbientPreset(presetId = state.musicPlayer.ambientPresetId){
  return AMBIENT_PRESETS.find((preset) => preset.id === presetId) || AMBIENT_PRESETS[0];
}

function normalizeAmbientSource(rawSource, fallbackIndex = 0){
  if (rawSource && typeof rawSource === 'object') {
    return {
      type: rawSource.type === 'direct' ? 'direct' : 'youtube',
      label: String(rawSource.label || '').trim() || `Source ${fallbackIndex + 1}`,
      url: String(rawSource.url || '').trim(),
    };
  }
  return {
    type: 'youtube',
    label: `Source ${fallbackIndex + 1}`,
    url: String(rawSource || '').trim(),
  };
}

function getAmbientSourceForPreset(presetId = state.musicPlayer.ambientPresetId, sourceIndex = state.musicPlayer.ambientSourceIndex){
  const preset = getAmbientPreset(presetId);
  const safeIndex = Math.max(0, Math.floor(Number(sourceIndex || 0))) % Math.max(1, preset.sources.length);
  const source = normalizeAmbientSource(preset.sources[safeIndex], safeIndex);
  return {
    preset,
    sourceIndex: safeIndex,
    source,
    sourceUrl: source.url,
    hasFallback: preset.sources.length > 1,
  };
}

function clearMusicSleepTimer(){
  if (musicSleepTimer) {
    clearTimeout(musicSleepTimer);
    musicSleepTimer = null;
  }
  musicSleepEndsAt = 0;
}

function armMusicSleepTimer(minutes){
  const mins = Number(minutes || 0);
  clearMusicSleepTimer();
  state.musicPlayer.sleepTimerMin = [15, 30, 60].includes(mins) ? mins : 0;
  save();
  if (!state.musicPlayer.sleepTimerMin) return;
  const ms = state.musicPlayer.sleepTimerMin * 60 * 1000;
  musicSleepEndsAt = Date.now() + ms;
  musicSleepTimer = setTimeout(() => {
    stopMusic();
    setMusicStatus(`Sleep timer ended (${state.musicPlayer.sleepTimerMin} min). Playback stopped.`);
    state.musicPlayer.sleepTimerMin = 0;
    save();
    clearMusicSleepTimer();
    renderMusicPlayer();
  }, ms);
}

function loadAmbientPreset(presetId, sourceIndex = 0){
  const { preset, sourceIndex: nextIndex, sourceUrl, source } = getAmbientSourceForPreset(presetId, sourceIndex);
  state.musicPlayer.mode = 'ambient';
  state.musicPlayer.sourceType = 'stream';
  state.musicPlayer.ambientPresetId = preset.id;
  state.musicPlayer.ambientSourceIndex = nextIndex;
  state.musicPlayer.currentTrackName = `Ambient · ${preset.label}`;
  state.musicPlayer.currentStreamUrl = sourceUrl;
  save();
  setMusicStatus(`Trying ${preset.label} source ${nextIndex + 1}/${preset.sources.length}: ${source.label}...`);
  loadStreamIntoPlayer(sourceUrl);
}

function playAmbientPreset(presetId, sourceIndex = 0){
  loadAmbientPreset(presetId, sourceIndex);
  playMusic();
}

function tryNextAmbientSource(){
  const { preset, sourceIndex, hasFallback } = getAmbientSourceForPreset();
  if (!hasFallback) {
    setMusicStatus(`No alternate source available for ${preset.label}.`);
    return;
  }
  const nextIndex = (sourceIndex + 1) % preset.sources.length;
  const nextSource = normalizeAmbientSource(preset.sources[nextIndex], nextIndex);
  setMusicStatus(`Trying ${preset.label} source ${nextIndex + 1}/${preset.sources.length}: ${nextSource.label}...`);
  playAmbientPreset(preset.id, nextIndex);
}

function setMusicMode(mode){
  state.musicPlayer.mode = mode === 'ambient' ? 'ambient' : 'stream';
  if (state.musicPlayer.mode !== 'ambient') {
    clearAmbientYoutubeFallbackTimer();
  }
  save();
}

function loadManualStream(url){
  const trimmed = safeMediaUrl(String(url || '').trim()) || safeFrameUrl(String(url || '').trim());
  if (!trimmed) return false;
  state.musicPlayer.mode = 'stream';
  state.musicPlayer.sourceType = 'stream';
  state.musicPlayer.currentStreamUrl = trimmed;
  state.musicPlayer.currentTrackName = 'Stream URL';
  save();
  loadStreamIntoPlayer(trimmed);
  return true;
}

function saveFavoriteStream(url){
  const trimmed = safeMediaUrl(String(url || '').trim()) || safeFrameUrl(String(url || '').trim());
  if (!trimmed) return false;
  state.musicPlayer.favoriteStreamUrl = trimmed;
  save();
  return true;
}

function useFavoriteStream(){
  const favorite = String(state.musicPlayer.favoriteStreamUrl || '').trim();
  if (!favorite) return false;
  state.musicPlayer.mode = 'stream';
  state.musicPlayer.sourceType = 'stream';
  state.musicPlayer.currentStreamUrl = favorite;
  save();
  loadStreamIntoPlayer(favorite);
  return true;
}

function selectAmbientPreset(presetId){
  const preset = getAmbientPreset(presetId);
  state.musicPlayer.mode = 'ambient';
  state.musicPlayer.ambientPresetId = preset.id;
  state.musicPlayer.ambientSourceIndex = 0;
  save();
}

function loadLocalMusicFile(file, audioEl){
  if (!file || !audioEl) return false;
  state.musicPlayer.mode = 'stream';
  state.musicPlayer.sourceType = 'local';
  state.musicPlayer.streamMode = 'unknown';
  pendingYoutubeAction = null;
  clearYoutubePlayGuardTimer();
  state.musicPlayer.currentTrackName = file.name;
  audioEl.src = URL.createObjectURL(file);
  audioEl.volume = state.musicPlayer.volume;
  save();
  setMusicStatus(`Local file loaded: ${file.name}`);
  return true;
}

function syncMusicVolume(value){

  const vol = Math.min(1, Math.max(0, Number(value || 0)));
  state.musicPlayer.volume = vol;
  const { audio } = getMusicEls();
  if (audio) audio.volume = vol;
  if (streamIframePlayer?.setVolume) streamIframePlayer.setVolume(Math.round(vol * 100));
}

function loadStreamIntoPlayer(url){
  const { audio } = getMusicEls();
  const iframe = ensureMusicIframe();
  if (!iframe || !audio) return;

  const rawUrl = String(url || '').trim();
  const ytId = extractYoutubeId(rawUrl);
  if (ytId) {
    state.musicPlayer.streamMode = 'youtube';
    youtubePlayerReady = false;
    clearAmbientYoutubeFallbackTimer();
    clearYoutubePlayGuardTimer();
    audio.pause();
    audio.loop = false;
    audio.removeAttribute('src');
    setSafeFrameSource(iframe, `https://www.youtube.com/embed/${encodeURIComponent(ytId)}?enablejsapi=1&autoplay=0&playsinline=1`);
    ensureYoutubeApi();
    if (window.YT?.Player) initYouTubePlayerIfReady();
    if (state.musicPlayer.mode !== 'ambient') {
      setMusicStatus('YouTube stream loaded. Press Play to start.');
    }
    return;
  }

  state.musicPlayer.streamMode = 'direct';
  pendingYoutubeAction = null;
  clearAmbientYoutubeFallbackTimer();
  clearYoutubePlayGuardTimer();
  iframe.src = 'about:blank';
  if (!setSafeMediaSource(audio, rawUrl)) {
    state.musicPlayer.streamMode = 'unknown';
    setMusicStatus('Only HTTPS direct streams and approved embedded providers are allowed.');
    return;
  }
  audio.loop = state.musicPlayer.mode === 'ambient';
  audio.volume = state.musicPlayer.volume;
  if (state.musicPlayer.mode !== 'ambient') {
    setMusicStatus('Direct stream URL loaded in HTML5 audio player.');
  }
}

function playMusic(){
  const { audio, iframe } = getMusicEls();
  if (state.musicPlayer.sourceType === 'local') {
    if (!audio?.src) {
      setMusicStatus('Pick a local audio file first.');
      return;
    }
    audio.play().then(() => {
      state.musicPlayer.isPlaying = true;
      save();
      setMusicStatus(`Playing local file: ${state.musicPlayer.currentTrackName || 'audio file'}`);
    }).catch(() => setMusicStatus('Playback blocked until user interaction.'));
    return;
  }

  const url = (state.musicPlayer.currentStreamUrl || '').trim();
  if (!url) {
    setMusicStatus('Paste a stream or YouTube URL first.');
    return;
  }

  if (state.musicPlayer.streamMode === 'youtube') {
    pendingYoutubeAction = 'play';
    ensureYoutubeApi();

    // Urgent race/stale-instance guard:
    // Re-init when player is missing OR not ready to avoid dead "loading" state
    // after pod re-renders that replace the iframe element.
    if (window.YT?.Player && (!streamIframePlayer || !youtubePlayerReady)) {
      initYouTubePlayerIfReady();
    }

    if (!runPendingYoutubeAction()) {
      if (state.musicPlayer.mode === 'ambient') {
        const ambient = getAmbientSourceForPreset();
        setMusicStatus(`Trying ${ambient.preset.label} source ${ambient.sourceIndex + 1}/${ambient.preset.sources.length}: ${ambient.source.label} (YouTube loading)...`);
      } else {
        setMusicStatus('YouTube player is loading — play will start automatically when ready.');
      }
      clearAmbientYoutubeFallbackTimer();
      clearYoutubePlayGuardTimer();
      if (state.musicPlayer.mode === 'ambient') {
        ambientYoutubeFallbackTimer = setTimeout(() => {
          if (state.musicPlayer.mode === 'ambient' && state.musicPlayer.streamMode === 'youtube' && pendingYoutubeAction === 'play') {
            handleAmbientSourceFailure('YouTube source did not start in time.');
          }
        }, 5000);
      } else {
        youtubePlayGuardTimer = setTimeout(() => {
          if (state.musicPlayer.mode === 'stream' && state.musicPlayer.streamMode === 'youtube' && pendingYoutubeAction === 'play') {
            setMusicStatus('YouTube playback is taking too long to start. Press Play again or load another URL.');
          }
        }, 6000);
      }
    }
    return;
  }

  if (state.musicPlayer.streamMode === 'embed') {
    if (!iframe || !setSafeFrameSource(iframe, url)) {
      state.musicPlayer.isPlaying = false;
      setMusicStatus('This embed URL is not an approved provider.');
      return;
    }
    state.musicPlayer.isPlaying = true;
    save();
    setMusicStatus('Embed stream active. Use controls inside the embedded player if needed.');
    return;
  }

  if (audio) {
    if (!audio.src && !setSafeMediaSource(audio, url)) {
      setMusicStatus('This direct stream URL is not allowed.');
      return;
    }
    audio.play().then(() => {
      state.musicPlayer.isPlaying = true;
      save();
      setMusicStatus('Playing direct stream URL via HTML5 audio.');
    }).catch(() => {
      if (iframe) {
        state.musicPlayer.streamMode = 'embed';
        audio.pause();
        if (!setSafeFrameSource(iframe, url)) {
          setMusicStatus('Direct playback failed and this URL is not an approved embed provider.');
          return;
        }
        state.musicPlayer.isPlaying = true;
        save();
        setMusicStatus('Direct audio playback failed; switched to embedded stream mode. Use controls inside the embedded player.');
        return;
      }
      setMusicStatus('Direct stream playback blocked or unsupported by browser/CORS.');
    });
  }
}

function pauseMusic(){
  const { audio } = getMusicEls();
  pendingYoutubeAction = null;
  clearAmbientYoutubeFallbackTimer();
  clearYoutubePlayGuardTimer();
  if (state.musicPlayer.sourceType === 'local' || state.musicPlayer.streamMode === 'direct') {
    audio?.pause();
  } else if (state.musicPlayer.streamMode === 'youtube' && streamIframePlayer?.pauseVideo) {
    streamIframePlayer.pauseVideo();
  }
  state.musicPlayer.isPlaying = false;
  save();
  setMusicStatus('Playback paused.');
}

function stopMusic(){
  const { audio, iframe } = getMusicEls();
  pendingYoutubeAction = null;
  clearAmbientYoutubeFallbackTimer();
  clearYoutubePlayGuardTimer();
  if (state.musicPlayer.sourceType === 'local' || state.musicPlayer.streamMode === 'direct') {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  } else if (state.musicPlayer.streamMode === 'youtube' && streamIframePlayer?.stopVideo) {
    streamIframePlayer.stopVideo();
  } else if (state.musicPlayer.streamMode === 'embed' && iframe) {
    iframe.src = 'about:blank';
  }
  clearMusicSleepTimer();
  state.musicPlayer.sleepTimerMin = 0;
  state.musicPlayer.isPlaying = false;
  save();
  setMusicStatus('Playback stopped.');
}

function renderMusicPlayer(){
  const el = document.getElementById('musicPlayerWidget');
  if (!el) return;

  const streamVal = escapeHtml(state.musicPlayer.currentStreamUrl || '');
  const fav = state.musicPlayer.favoriteStreamUrl || '';
  const hasFav = !!fav;
  const isAmbientMode = state.musicPlayer.mode === 'ambient';
  const ambient = getAmbientSourceForPreset();
  const musicUi = getMusicPresentation();

  const ambientButtons = AMBIENT_PRESETS.map((preset) => {
    const active = ambient.preset.id === preset.id;
    return `<button class="btn ${active ? '' : 'ghost'} music-ambient-chip" data-music-role="ambient-preset" data-ambient-id="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</button>`;
  }).join('');

  const sleepOptions = [15, 30, 60].map((mins) => {
    const active = Number(state.musicPlayer.sleepTimerMin) === mins;
    return `<button class="btn ${active ? '' : 'ghost'}" data-music-role="sleep-timer" data-sleep-min="${mins}">${mins}m</button>`;
  }).join('');

  el.innerHTML = `
    <div class="music-player-shell music-player-v2-shell" data-pod="music-player">
      <div class="music-player-hero music-player-hero--${musicUi.tone}" data-music-role="hero">
        <div class="music-player-hero-copy">
          <span class="music-player-kicker">Listening Pod</span>
          <strong data-music-role="hero-title">${escapeHtml(musicUi.heroTitle)}</strong>
          <div class="music-player-hero-meta" data-music-role="hero-meta">${escapeHtml(musicUi.heroMeta)}</div>
        </div>
        <div class="music-player-hero-badges">
          <span class="music-player-status-pill music-player-status-pill--${musicUi.tone}" data-music-role="status-badge">${escapeHtml(musicUi.badge)}</span>
          <span class="music-player-chip">${escapeHtml(musicUi.sourceLine)}</span>
          <span class="music-player-chip">${escapeHtml(musicUi.sleepLine)}</span>
        </div>
      </div>

      <div class="music-mode-tabs music-mode-tabs--v2">
        <button class="btn ${isAmbientMode ? 'ghost' : ''}" data-music-role="mode" data-mode="stream">Stream</button>
        <button class="btn ${isAmbientMode ? '' : 'ghost'}" data-music-role="mode" data-mode="ambient">Ambient</button>
      </div>

      <div class="music-player-overview-grid">
        <div class="music-player-summary-card">
          <span class="music-player-summary-label">Source</span>
          <strong data-music-role="summary-source">${escapeHtml(musicUi.sourceLine)}</strong>
          <span class="music-player-summary-meta">${escapeHtml(musicUi.currentLabel)}</span>
        </div>
        <div class="music-player-summary-card">
          <span class="music-player-summary-label">Favorite</span>
          <strong data-music-role="summary-favorite">${escapeHtml(musicUi.favoriteLine)}</strong>
          <span class="music-player-summary-meta">${hasFav ? 'Quick recall is ready.' : 'Save a go-to stream for one-click loading.'}</span>
        </div>
        <div class="music-player-summary-card">
          <span class="music-player-summary-label">Volume</span>
          <strong data-music-role="summary-volume">${musicUi.volumePercent}%</strong>
          <span class="music-player-summary-meta" data-music-role="summary-sleep">${escapeHtml(musicUi.sleepLine)}</span>
        </div>
      </div>

      <div class="music-player-control-grid">
        <div class="music-mode-panel music-player-card ${isAmbientMode ? 'music-player-hidden-panel' : ''}" data-music-panel="stream">
          <div class="music-player-card-head">
            <span class="music-player-kicker">Stream Deck</span>
            <strong>Streams, favorites, and local files</strong>
          </div>
          <input id="musicStreamUrlInput" data-music-role="stream-input" placeholder="YouTube/live stream URL" value="${streamVal}" />
          <div class="music-player-action-row">
            <button id="musicLoadStreamBtn" data-music-role="load-stream" class="btn">Load Stream</button>
            <button id="musicSaveFavoriteBtn" data-music-role="save-favorite" class="btn ghost">Save Favorite</button>
            <button id="musicUseFavoriteBtn" data-music-role="use-favorite" class="btn ghost" ${hasFav ? '' : 'disabled'}>Use Favorite</button>
          </div>
          <label class="music-player-file-row">
            <span>Local audio file</span>
            <input id="musicLocalFileInput" data-music-role="local-file" type="file" accept="audio/*" />
          </label>
        </div>

        <div class="music-mode-panel music-player-card ${isAmbientMode ? '' : 'music-player-hidden-panel'}" data-music-panel="ambient">
          <div class="music-player-card-head">
            <span class="music-player-kicker">Ambient Deck</span>
            <strong>${escapeHtml(ambient.preset.label)}</strong>
          </div>
          <div class="music-ambient-grid">${ambientButtons}</div>
          <div class="music-player-action-row">
            <button class="btn" data-music-role="ambient-play">Play ${escapeHtml(ambient.preset.label)}</button>
            <button class="btn ghost" data-music-role="ambient-next" ${ambient.hasFallback ? '' : 'disabled'}>Try Next Source</button>
          </div>
          <div class="music-player-sleep-row">
            <span class="music-player-summary-label">Sleep timer</span>
            <div class="music-player-action-row">
              ${sleepOptions}
              <button class="btn ghost" data-music-role="sleep-timer" data-sleep-min="0">Off</button>
            </div>
          </div>
        </div>

        <div class="music-player-card music-player-transport-card">
          <div class="music-player-card-head">
            <span class="music-player-kicker">Transport</span>
            <strong>${state.musicPlayer.isPlaying ? 'Now playing controls' : 'Playback controls'}</strong>
          </div>
          <div class="music-player-controls">
            <button id="musicPlayBtn" data-music-role="play" class="btn">Play</button>
            <button id="musicPauseBtn" data-music-role="pause" class="btn ghost">Pause</button>
            <button id="musicStopBtn" data-music-role="stop" class="btn ghost">Stop</button>
          </div>
          <label class="music-player-volume-stack">Volume
            <input id="musicVolumeInput" data-music-role="volume" type="range" min="0" max="1" step="0.05" value="${state.musicPlayer.volume}">
          </label>
          <div class="music-player-mini">Use Stream mode for YouTube/live URLs and Ambient mode for set-it-and-forget-it background vibes.</div>
        </div>
      </div>

      <iframe id="musicStreamIframe" data-music-role="iframe" class="music-player-hidden" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media" referrerpolicy="no-referrer" title="Music stream player"></iframe>
      <audio id="musicLocalAudio" data-music-role="audio" class="music-player-hidden" preload="metadata"></audio>
      <div class="music-player-mini">Source: ${state.musicPlayer.sourceType === 'local' ? 'Local file' : (isAmbientMode ? `Ambient · ${escapeHtml(ambient.preset.label)}` : 'Stream URL')}${hasFav ? ' · Favorite saved' : ''}${state.musicPlayer.sleepTimerMin ? ` · Sleep ${state.musicPlayer.sleepTimerMin}m` : ''}</div>
    </div>
  `;

  const els = getMusicEls();
  if (els.audio) {
    els.audio.volume = state.musicPlayer.volume;
    els.audio.addEventListener('error', () => {
      if (state.musicPlayer.mode === 'ambient') {
        handleAmbientSourceFailure('Ambient source failed to load/play.');
      } else {
        setMusicStatus('Stream failed to load/play. Try another URL.');
      }
    });
  }

  const musicPod = el.querySelector('[data-pod="music-player"]');
  musicPod?.querySelectorAll('[data-music-role="mode"]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const mode = btn.dataset.mode === 'ambient' ? 'ambient' : 'stream';
      setMusicMode(mode);
      renderMusicPlayer();
    });
  });

  musicPod?.querySelector('[data-music-role="load-stream"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const url = (els.streamInput?.value || '').trim();
    if (!url) return;
    loadManualStream(url);
  });

  musicPod?.querySelector('[data-music-role="save-favorite"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const url = (els.streamInput?.value || state.musicPlayer.currentStreamUrl || '').trim();
    if (!url) return;
    saveFavoriteStream(url);
    renderMusicPlayer();
    setMusicStatus('Saved favorite stream URL.');
  });

  musicPod?.querySelector('[data-music-role="use-favorite"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!state.musicPlayer.favoriteStreamUrl) return;
    useFavoriteStream();
    renderMusicPlayer();
  });

  musicPod?.querySelectorAll('[data-music-role="ambient-preset"]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const presetId = String(btn.dataset.ambientId || '');
      selectAmbientPreset(presetId);
      renderMusicPlayer();
    });
  });

  musicPod?.querySelector('[data-music-role="ambient-play"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const current = getAmbientSourceForPreset();
    playAmbientPreset(current.preset.id, current.sourceIndex);
  });

  musicPod?.querySelector('[data-music-role="ambient-next"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    tryNextAmbientSource();
  });

  musicPod?.querySelectorAll('[data-music-role="sleep-timer"]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const minutes = Number(btn.dataset.sleepMin || 0);
      armMusicSleepTimer(minutes);
      renderMusicPlayer();
      setMusicStatus(minutes ? `Sleep timer set for ${minutes} minutes.` : 'Sleep timer disabled.');
    });
  });

  musicPod?.querySelector('[data-music-role="local-file"]')?.addEventListener('change', () => {
    const file = els.fileInput.files?.[0];
    loadLocalMusicFile(file, els.audio);
  });

  musicPod?.querySelector('[data-music-role="volume"]')?.addEventListener('input', (e) => {
    syncMusicVolume(e.target.value);
    save();
  });

  musicPod?.querySelector('[data-music-role="play"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.musicPlayer.mode === 'ambient') {
      const current = getAmbientSourceForPreset();
      playAmbientPreset(current.preset.id, current.sourceIndex);
      return;
    }
    playMusic();
  });
  musicPod?.querySelector('[data-music-role="pause"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    pauseMusic();
  });
  musicPod?.querySelector('[data-music-role="stop"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopMusic();
  });

  if (state.musicPlayer.sourceType === 'stream' && state.musicPlayer.currentStreamUrl) {
    loadStreamIntoPlayer(state.musicPlayer.currentStreamUrl);
    if (state.musicPlayer.streamMode === 'youtube' && window.YT?.Player) {
      initYouTubePlayerIfReady();
    }
  } else if (!document.getElementById('musicPlayerStatus')?.textContent) {
    setMusicStatus('Ready. Load a stream URL, choose Ambient preset, or pick a local audio file.');
  }
}

function clampCameraViewport(width, height, containerEl){
  const containerWidth = Math.max(CAMERA_VIEWPORT_MIN.width, Math.floor((containerEl?.clientWidth || CAMERA_VIEWPORT_MAX.width) - 2));
  const maxWidth = Math.min(CAMERA_VIEWPORT_MAX.width, containerWidth);
  const maxHeight = Math.min(CAMERA_VIEWPORT_MAX.height, Math.max(CAMERA_VIEWPORT_MIN.height, Math.floor(window.innerHeight * 0.7) || CAMERA_VIEWPORT_MAX.height));
  return {
    width: Math.min(maxWidth, Math.max(CAMERA_VIEWPORT_MIN.width, Math.round(Number(width) || CAMERA_VIEWPORT_DEFAULT.width))),
    height: Math.min(maxHeight, Math.max(CAMERA_VIEWPORT_MIN.height, Math.round(Number(height) || CAMERA_VIEWPORT_DEFAULT.height))),
  };
}

function getCameraViewportSize(containerEl){
  return clampCameraViewport(
    Number(state.cameraFeed.viewportWidth || CAMERA_VIEWPORT_DEFAULT.width),
    Number(state.cameraFeed.viewportHeight || CAMERA_VIEWPORT_DEFAULT.height),
    containerEl
  );
}

function persistCameraViewport(width, height, containerEl){
  const next = clampCameraViewport(width, height, containerEl);
  state.cameraFeed.viewportWidth = next.width;
  state.cameraFeed.viewportHeight = next.height;
  save();
  return next;
}

function bindCameraResizeHandle(els){
  if (!els?.resizeHandle || !els?.frameWrap) return;
  const containerEl = els.root;

  els.resizeHandle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = els.frameWrap.offsetWidth;
    const startHeight = els.frameWrap.offsetHeight;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const next = clampCameraViewport(startWidth + dx, startHeight + dy, containerEl);
      els.frameWrap.style.width = `${next.width}px`;
      els.frameWrap.style.height = `${next.height}px`;
    };

    const onUp = (upEvent) => {
      const dx = upEvent.clientX - startX;
      const dy = upEvent.clientY - startY;
      const next = persistCameraViewport(startWidth + dx, startHeight + dy, containerEl);
      els.frameWrap.style.width = `${next.width}px`;
      els.frameWrap.style.height = `${next.height}px`;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  });
}

function getCameraFeedEls(){
  const root = document.getElementById('cameraFeedWidget')?.querySelector('[data-pod="camera-feed"]') || null;
  return {
    root,
    urlInput: root?.querySelector('[data-camera-role="url"]') || null,
    modeSelect: root?.querySelector('[data-camera-role="mode"]') || null,
    intervalInput: root?.querySelector('[data-camera-role="interval"]') || null,
    proxyToggle: root?.querySelector('[data-camera-role="proxy"]') || null,
    startBtn: root?.querySelector('[data-camera-role="start"]') || null,
    stopBtn: root?.querySelector('[data-camera-role="stop"]') || null,
    fullscreenBtn: root?.querySelector('[data-camera-role="fullscreen"]') || null,
    resetSizeBtn: root?.querySelector('[data-camera-role="reset-size"]') || null,
    frameWrap: root?.querySelector('[data-camera-role="frame-wrap"]') || null,
    resizeHandle: root?.querySelector('[data-camera-role="resize-handle"]') || null,
    streamFrame: root?.querySelector('[data-camera-role="stream-frame"]') || null,
    snapshotImg: root?.querySelector('[data-camera-role="snapshot-img"]') || null,
    localVideo: root?.querySelector('[data-camera-role="local-video"]') || null,
    deviceSelect: root?.querySelector('[data-camera-role="device"]') || null,
  };
}

function cameraFeedModeLabel(mode = state.cameraFeed.mode){
  return cameraFeedStateFeature.modeLabel(mode);
}

function cameraFeedCompactSourceLabel(raw){
  return cameraFeedStateFeature.compactSourceLabel(raw);
}

function getCameraFeedPresentation(statusText = ''){
  const deviceId = String(state.cameraFeed.deviceId || '');
  const deviceLabel = cameraDeviceList.find((d) => String(d.deviceId || '') === deviceId)?.label || 'Default browser camera';
  return cameraFeedStateFeature.getPresentation(state.cameraFeed, {
    statusText,
    deviceLabel,
    cameraAvailable: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  });
}

function syncCameraFeedUiStatus(statusText = ''){
  const meta = getCameraFeedPresentation(statusText);
  const hero = document.querySelector('[data-camera-role="hero"]');
  if (hero) hero.className = `camera-feed-hero camera-feed-hero--${meta.tone}`;

  const badge = document.querySelector('[data-camera-role="status-badge"]');
  if (badge) {
    badge.textContent = meta.badge;
    badge.className = `camera-feed-status-pill camera-feed-status-pill--${meta.tone}`;
  }

  const heroTitle = document.querySelector('[data-camera-role="hero-title"]');
  if (heroTitle) heroTitle.textContent = meta.heroTitle;

  const heroMeta = document.querySelector('[data-camera-role="hero-meta"]');
  if (heroMeta) heroMeta.textContent = meta.heroMeta;

  const stageTitle = document.querySelector('[data-camera-role="stage-title"]');
  if (stageTitle) stageTitle.textContent = meta.stageTitle;

  const stageMeta = document.querySelector('[data-camera-role="stage-meta"]');
  if (stageMeta) stageMeta.textContent = meta.stageMeta;

  setPodStatusSignal('camera-feed', meta.signal, meta.signalDetail);
}

function setCameraFeedStatus(text){
  const el = document.getElementById('cameraFeedStatus');
  if (el) el.textContent = text;
  syncCameraFeedUiStatus(text);
}

function cameraSnapshotUrl(url){
  const target = String(url || '').trim();
  if (!target) return '';
  const viaProxy = state.cameraFeed.useProxy;
  if (viaProxy) {
    const params = new URLSearchParams({ url: target });
    return `/api/camera-snapshot?${params.toString()}&_cb=${Date.now()}-${cameraSnapshotBust++}`;
  }
  const sep = target.includes('?') ? '&' : '?';
  return `${target}${sep}_cb=${Date.now()}-${cameraSnapshotBust++}`;
}

function stopCameraSnapshotTimer(){
  if (cameraSnapshotTimer) {
    clearInterval(cameraSnapshotTimer);
    cameraSnapshotTimer = null;
  }
}

function stopLocalCameraStream(){
  if (cameraLocalStream) {
    cameraLocalStream.getTracks().forEach((track) => {
      try { track.stop(); } catch {}
    });
    cameraLocalStream = null;
  }
  const video = getCameraFeedEls().localVideo;
  if (video) {
    try { video.srcObject = null; } catch {}
    video.classList.add('is-hidden');
  }
}

async function refreshLocalCameraDevices(){
  const before = JSON.stringify(cameraDeviceList);
  if (!navigator?.mediaDevices?.enumerateDevices) {
    cameraDeviceList = [];
    return before !== JSON.stringify(cameraDeviceList);
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cameraDeviceList = devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, idx) => ({
        deviceId: String(d.deviceId || ''),
        label: String(d.label || '').trim() || `Camera ${idx + 1}`,
      }));
  } catch {
    cameraDeviceList = [];
  }
  return before !== JSON.stringify(cameraDeviceList);
}

function buildLocalVideoConstraints(){
  const savedDeviceId = String(state.cameraFeed.deviceId || '');
  if (savedDeviceId) {
    return { video: { deviceId: { exact: savedDeviceId } }, audio: false };
  }
  return { video: true, audio: false };
}

function stopCameraFeed(options = {}){
  const { keepStatus = false } = options;
  stopCameraSnapshotTimer();
  stopLocalCameraStream();
  const els = getCameraFeedEls();
  if (els.streamFrame) {
    els.streamFrame.src = 'about:blank';
    els.streamFrame.classList.add('is-hidden');
  }
  if (els.snapshotImg) {
    els.snapshotImg.removeAttribute('src');
    els.snapshotImg.classList.add('is-hidden');
  }
  if (els.localVideo) {
    els.localVideo.classList.add('is-hidden');
  }

  state.cameraFeed.active = false;
  if (!keepStatus) {
    state.cameraFeed.status = 'idle';
    state.cameraFeed.lastError = '';
    setCameraFeedStatus('Stopped.');
  }
  save();
  renderCameraFeedPod();
}

function startSnapshotMode(){
  const els = getCameraFeedEls();
  const sourceUrl = String(state.cameraFeed.sourceUrl || '').trim();
  if (!sourceUrl || !els.snapshotImg) {
    state.cameraFeed.status = 'error';
    state.cameraFeed.lastError = 'Snapshot source URL is required.';
    setCameraFeedStatus(state.cameraFeed.lastError);
    save();
    renderCameraFeedPod();
    return;
  }

  stopCameraSnapshotTimer();
  state.cameraFeed.active = true;
  state.cameraFeed.status = 'loading';
  state.cameraFeed.lastError = '';
  setCameraFeedStatus('Loading snapshot feed…');
  save();
  renderCameraFeedPod();

  const refreshMs = Math.max(1000, Number(state.cameraFeed.refreshIntervalSec || 5) * 1000);

  const tick = () => {
    const img = getCameraFeedEls().snapshotImg;
    if (!img || !state.cameraFeed.active || state.cameraFeed.mode !== 'snapshot') return;
    img.onload = () => {
      state.cameraFeed.status = 'live';
      state.cameraFeed.lastError = '';
      setCameraFeedStatus(`Live (snapshot refresh every ${state.cameraFeed.refreshIntervalSec}s${state.cameraFeed.useProxy ? ' via local proxy' : ''}).`);
      save();
    };
    img.onerror = () => {
      state.cameraFeed.status = 'error';
      state.cameraFeed.lastError = state.cameraFeed.useProxy
        ? 'Snapshot fetch failed via local proxy (check allowlist + camera URL).'
        : 'Snapshot fetch failed (try enabling local proxy or switch source/mode).';
      setCameraFeedStatus(state.cameraFeed.lastError);
      save();
    };
    if (!setSafeMediaSource(img, cameraSnapshotUrl(sourceUrl))) {
      state.cameraFeed.status = 'error';
      state.cameraFeed.lastError = 'Snapshot source URL is not allowed.';
      setCameraFeedStatus(state.cameraFeed.lastError);
    }
  };

  tick();
  cameraSnapshotTimer = setInterval(tick, refreshMs);
}

function startStreamMode(){
  const els = getCameraFeedEls();
  const sourceUrl = String(state.cameraFeed.sourceUrl || '').trim();
  if (!sourceUrl || !els.streamFrame) {
    state.cameraFeed.status = 'error';
    state.cameraFeed.lastError = 'Camera stream URL is required.';
    setCameraFeedStatus(state.cameraFeed.lastError);
    save();
    renderCameraFeedPod();
    return;
  }

  stopCameraSnapshotTimer();
  state.cameraFeed.active = true;
  state.cameraFeed.status = 'loading';
  state.cameraFeed.lastError = '';
  setCameraFeedStatus('Loading stream embed…');
  save();
  renderCameraFeedPod();

  const frame = getCameraFeedEls().streamFrame;
  if (!frame) return;
  frame.onload = () => {
    state.cameraFeed.status = 'live';
    state.cameraFeed.lastError = '';
    setCameraFeedStatus('Live embed loaded (if your camera blocks framing/CORS, switch to Snapshot mode).');
    save();
  };
  frame.onerror = () => {
    state.cameraFeed.status = 'error';
    state.cameraFeed.lastError = 'Embed failed. Camera may block framing or auth. Try Snapshot mode.';
    setCameraFeedStatus(state.cameraFeed.lastError);
    save();
  };
  if (!setSafeFrameSource(frame, sourceUrl)) {
    state.cameraFeed.status = 'error';
    state.cameraFeed.lastError = 'Camera embeds are restricted to approved HTTPS providers. Use Snapshot or Local mode for other cameras.';
    setCameraFeedStatus(state.cameraFeed.lastError);
    save();
    return;
  }
}

async function startLocalMode(){
  const els = getCameraFeedEls();
  if (!navigator?.mediaDevices?.getUserMedia || !els.localVideo) {
    state.cameraFeed.status = 'error';
    state.cameraFeed.lastError = 'Local webcam is not supported in this browser/context (HTTPS required).';
    setCameraFeedStatus(state.cameraFeed.lastError);
    save();
    renderCameraFeedPod();
    return;
  }

  stopCameraSnapshotTimer();
  stopLocalCameraStream();
  state.cameraFeed.active = true;
  state.cameraFeed.status = 'loading';
  state.cameraFeed.lastError = '';
  setCameraFeedStatus('Requesting camera permission…');
  save();
  renderCameraFeedPod();

  try {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(buildLocalVideoConstraints());
    } catch (firstErr) {
      const canFallbackToDefault = !!state.cameraFeed.deviceId && ['OverconstrainedError', 'ConstraintNotSatisfiedError', 'NotFoundError', 'DevicesNotFoundError'].includes(firstErr?.name);
      if (!canFallbackToDefault) throw firstErr;
      state.cameraFeed.deviceId = '';
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setCameraFeedStatus('Selected camera unavailable. Fell back to default webcam.');
    }

    cameraLocalStream = stream;
    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack?.getSettings) {
      const trackDeviceId = String(videoTrack.getSettings().deviceId || '');
      if (trackDeviceId) state.cameraFeed.deviceId = trackDeviceId;
    }
    await refreshLocalCameraDevices();

    const video = getCameraFeedEls().localVideo;
    if (video) {
      video.srcObject = stream;
      video.classList.remove('is-hidden');
      try { await video.play(); } catch {}
    }

    state.cameraFeed.status = 'live';
    state.cameraFeed.lastError = '';
    setCameraFeedStatus('Local webcam live.');
    save();
    renderCameraFeedPod();
  } catch (err) {
    stopLocalCameraStream();
    state.cameraFeed.active = false;
    state.cameraFeed.status = 'error';
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      state.cameraFeed.lastError = 'Camera permission denied. Allow camera access in your browser and try again.';
    } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
      state.cameraFeed.lastError = 'No webcam device found.';
    } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
      state.cameraFeed.lastError = 'Webcam is busy or unavailable (possibly used by another app).';
    } else {
      state.cameraFeed.lastError = `Unable to start local webcam${err?.message ? `: ${err.message}` : '.'}`;
    }
    setCameraFeedStatus(state.cameraFeed.lastError);
    save();
    renderCameraFeedPod();
  }
}

function startCameraFeed(){
  if (state.cameraFeed.mode === 'local') {
    startLocalMode();
    return;
  }

  const sourceUrl = String(state.cameraFeed.sourceUrl || '').trim();
  if (!sourceUrl) {
    state.cameraFeed.status = 'error';
    state.cameraFeed.lastError = 'Enter a camera URL first.';
    setCameraFeedStatus(state.cameraFeed.lastError);
    save();
    renderCameraFeedPod();
    return;
  }

  if (state.cameraFeed.mode === 'snapshot') {
    startSnapshotMode();
    return;
  }

  startStreamMode();
}

function renderCameraFeedPod(){
  const el = document.getElementById('cameraFeedWidget');
  if (!el) return;

  const mode = ['stream', 'snapshot', 'local'].includes(state.cameraFeed.mode) ? state.cameraFeed.mode : 'stream';
  const interval = Number(state.cameraFeed.refreshIntervalSec || 5);
  const showSnapshot = state.cameraFeed.active && mode === 'snapshot';
  const showStream = state.cameraFeed.active && mode === 'stream';
  const showLocal = state.cameraFeed.active && mode === 'local';
  const urlDisabled = mode === 'local';
  const localDeviceValue = String(state.cameraFeed.deviceId || '');
  const localDeviceOptions = [`<option value="">Default camera</option>`, ...cameraDeviceList.map((d) => (
    `<option value="${escapeHtml(d.deviceId)}" ${localDeviceValue === d.deviceId ? 'selected' : ''}>${escapeHtml(d.label)}</option>`
  ))].join('');
  const viewport = getCameraViewportSize(el);
  const cameraUi = getCameraFeedPresentation();

  el.innerHTML = `
    <div class="camera-feed-shell camera-feed-v2-shell" data-pod="camera-feed">
      <div class="camera-feed-hero camera-feed-hero--${cameraUi.tone}" data-camera-role="hero">
        <div class="camera-feed-hero-copy">
          <span class="camera-feed-kicker">Camera Deck</span>
          <strong data-camera-role="hero-title">${escapeHtml(cameraUi.heroTitle)}</strong>
          <div class="camera-feed-hero-meta" data-camera-role="hero-meta">${escapeHtml(cameraUi.heroMeta)}</div>
        </div>
        <div class="camera-feed-hero-badges">
          <span class="camera-feed-status-pill camera-feed-status-pill--${cameraUi.tone}" data-camera-role="status-badge">${escapeHtml(cameraUi.badge)}</span>
          ${cameraUi.chips.map((chip) => `<span class="camera-feed-chip">${escapeHtml(chip)}</span>`).join('')}
        </div>
      </div>

      <div class="camera-feed-control-grid">
        <div class="camera-feed-panel">
          <div class="camera-feed-panel-head">
            <span class="camera-feed-panel-kicker">Source</span>
            <strong>${escapeHtml(cameraUi.sourceHeadline)}</strong>
          </div>
          <input data-camera-role="url" placeholder="Camera URL (http/https)" value="${escapeHtml(state.cameraFeed.sourceUrl || '')}" ${urlDisabled ? 'disabled' : ''} />
          <div class="camera-feed-panel-note">${escapeHtml(cameraUi.sourceHint)}</div>
        </div>

        <div class="camera-feed-panel">
          <div class="camera-feed-panel-head">
            <span class="camera-feed-panel-kicker">Controls</span>
            <strong>${escapeHtml(cameraUi.controlHeadline)}</strong>
          </div>
          <div class="camera-feed-settings-grid">
            <label class="camera-feed-field">
              <span>Mode</span>
              <select data-camera-role="mode">
                <option value="stream" ${mode === 'stream' ? 'selected' : ''}>Embed Stream</option>
                <option value="snapshot" ${mode === 'snapshot' ? 'selected' : ''}>Snapshot Refresh</option>
                <option value="local" ${mode === 'local' ? 'selected' : ''}>Local Webcam (Browser)</option>
              </select>
            </label>
            <label class="camera-feed-field ${mode === 'snapshot' ? '' : 'is-disabled'}">
              <span>Refresh (sec)</span>
              <input data-camera-role="interval" type="number" min="1" max="60" step="1" value="${interval}" ${mode === 'snapshot' ? '' : 'disabled'} />
            </label>
            <label class="camera-feed-toggle ${mode === 'snapshot' ? '' : 'is-disabled'}">
              <input data-camera-role="proxy" type="checkbox" ${state.cameraFeed.useProxy ? 'checked' : ''} ${mode === 'snapshot' ? '' : 'disabled'} />
              <span>Use local proxy for snapshot requests</span>
            </label>
            <label class="camera-feed-field ${mode === 'local' ? '' : 'is-disabled'}">
              <span>Webcam Device</span>
              <select data-camera-role="device" ${mode === 'local' ? '' : 'disabled'}>
                ${localDeviceOptions}
              </select>
            </label>
          </div>
          <div class="camera-feed-action-row">
            <button data-camera-role="start" class="btn">Load / Start</button>
            <button data-camera-role="stop" class="btn ghost" ${state.cameraFeed.active ? '' : 'disabled'}>Stop</button>
            <button data-camera-role="fullscreen" class="btn ghost" ${state.cameraFeed.active ? '' : 'disabled'}>Fullscreen</button>
            <button data-camera-role="reset-size" class="btn ghost">Reset Size</button>
          </div>
        </div>
      </div>

      <div class="camera-feed-stage-card">
        <div class="camera-feed-stage-head">
          <div class="camera-feed-stage-copy">
            <span class="camera-feed-stage-kicker">Live Stage</span>
            <strong data-camera-role="stage-title">${escapeHtml(cameraUi.stageTitle)}</strong>
            <div class="camera-feed-stage-meta" data-camera-role="stage-meta">${escapeHtml(cameraUi.stageMeta)}</div>
          </div>
          <div class="camera-feed-stage-chips">
            <span class="camera-feed-stage-chip">${escapeHtml(cameraFeedModeLabel(mode))}</span>
            <span class="camera-feed-stage-chip">${escapeHtml(cameraUi.sourceHeadline)}</span>
          </div>
        </div>
        <div class="camera-feed-frame-wrap" data-camera-role="frame-wrap">
          <iframe data-camera-role="stream-frame" title="Camera feed stream" sandbox="allow-scripts allow-same-origin allow-presentation" ${showStream ? '' : 'class="is-hidden"'} referrerpolicy="no-referrer"></iframe>
          <img data-camera-role="snapshot-img" alt="Camera snapshot" ${showSnapshot ? '' : 'class="is-hidden"'} />
          <video data-camera-role="local-video" autoplay playsinline muted ${showLocal ? '' : 'class="is-hidden"'}></video>
          <button class="camera-feed-resize-handle" data-camera-role="resize-handle" aria-label="Resize camera feed" title="Drag to resize" type="button"></button>
        </div>
      </div>

      <div class="camera-feed-footnote">${escapeHtml(cameraUi.footnote)}</div>
    </div>
  `;

  const els = getCameraFeedEls();
  if (els.frameWrap) {
    els.frameWrap.style.width = `min(100%, ${viewport.width}px)`;
    els.frameWrap.style.height = `${viewport.height}px`;
  }
  bindCameraResizeHandle(els);

  if (mode === 'local' && !cameraDeviceRefreshInFlight && navigator?.mediaDevices?.enumerateDevices) {
    cameraDeviceRefreshInFlight = true;
    refreshLocalCameraDevices().then((changed) => {
      if (changed && document.contains(el) && state.cameraFeed.mode === 'local') {
        renderCameraFeedPod();
      }
    }).finally(() => {
      cameraDeviceRefreshInFlight = false;
    });
  }

  els.urlInput?.addEventListener('change', () => {
    state.cameraFeed.sourceUrl = String(els.urlInput.value || '').trim();
    save();
  });

  els.modeSelect?.addEventListener('change', () => {
    const nextMode = ['stream', 'snapshot', 'local'].includes(els.modeSelect.value) ? els.modeSelect.value : 'stream';
    state.cameraFeed.mode = nextMode;
    save();
    stopCameraFeed({ keepStatus: true });
    setCameraFeedStatus(state.cameraFeed.mode === 'snapshot'
      ? 'Snapshot mode selected. Configure refresh + start feed.'
      : state.cameraFeed.mode === 'local'
        ? 'Local webcam mode selected. Click Load / Start and allow camera permission.'
        : 'Embed stream mode selected. Click Load / Start.');
    state.cameraFeed.status = 'idle';
    state.cameraFeed.lastError = '';
    save();
    renderCameraFeedPod();
  });

  els.intervalInput?.addEventListener('change', () => {
    const next = Number(els.intervalInput.value || 5);
    state.cameraFeed.refreshIntervalSec = Number.isFinite(next) ? Math.min(60, Math.max(1, Math.round(next))) : 5;
    save();
  });

  els.proxyToggle?.addEventListener('change', () => {
    state.cameraFeed.useProxy = !!els.proxyToggle.checked;
    save();
  });

  els.deviceSelect?.addEventListener('change', () => {
    state.cameraFeed.deviceId = String(els.deviceSelect.value || '');
    save();
  });

  els.startBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.cameraFeed.sourceUrl = String(els.urlInput?.value || '').trim();
    save();
    startCameraFeed();
  });

  els.stopBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopCameraFeed();
  });

  els.fullscreenBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!els.frameWrap) return;
    try {
      if (document.fullscreenElement === els.frameWrap && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (els.frameWrap.requestFullscreen) {
        await els.frameWrap.requestFullscreen();
      } else {
        setCameraFeedStatus('Fullscreen is not available in this browser/context.');
      }
    } catch {
      setCameraFeedStatus('Unable to open the camera stage in fullscreen.');
    }
  });

  els.resetSizeBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = persistCameraViewport(CAMERA_VIEWPORT_DEFAULT.width, CAMERA_VIEWPORT_DEFAULT.height, els.root);
    if (els.frameWrap) {
      els.frameWrap.style.width = `min(100%, ${next.width}px)`;
      els.frameWrap.style.height = `${next.height}px`;
    }
    setCameraFeedStatus('Camera viewport size reset to default.');
  });

  if (showStream && els.streamFrame) {
    if (!setSafeFrameSource(els.streamFrame, state.cameraFeed.sourceUrl)) {
      state.cameraFeed.status = 'error';
      state.cameraFeed.lastError = 'Camera embed URL is not an approved HTTPS provider.';
    }
  }

  if (showSnapshot && els.snapshotImg) {
    setSafeMediaSource(els.snapshotImg, cameraSnapshotUrl(state.cameraFeed.sourceUrl));
  }

  if (showLocal && els.localVideo) {
    try {
      els.localVideo.srcObject = cameraLocalStream;
      els.localVideo.classList.remove('is-hidden');
    } catch {}
  }

  if (state.cameraFeed.status === 'error' && state.cameraFeed.lastError) {
    setCameraFeedStatus(state.cameraFeed.lastError);
  } else if (state.cameraFeed.status === 'loading') {
    setCameraFeedStatus('Loading camera feed…');
  } else if (state.cameraFeed.status === 'live') {
    setCameraFeedStatus(mode === 'snapshot'
      ? `Live (snapshot refresh every ${state.cameraFeed.refreshIntervalSec}s${state.cameraFeed.useProxy ? ' via local proxy' : ''}).`
      : mode === 'local'
        ? 'Local webcam live.'
        : 'Live embed active.');
  } else if (!state.cameraFeed.active) {
    setCameraFeedStatus(mode === 'local'
      ? 'Ready. Click Load / Start to request webcam access.'
      : 'Ready. Paste a camera URL and click Load / Start.');
  }
}

function liveSourceLabel(type){
  const labels = {
    youtube: 'YouTube Live',
    twitch: 'Twitch',
    kick: 'Kick',
    vaughn: 'Vaughn Live',
    rumble: 'Rumble',
    xlive: 'X Live / Spaces',
    facebook: 'Facebook Live',
    generic: 'Generic RTMP/HLS/M3U8 URL',
    local: 'Local source URL',
  };
  return labels[type] || 'Live Source';
}

function parseChannelLikeInput(raw, providers = []){
  const value = String(raw || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return value.replace(/^@/, '').split(/[/?#]/)[0] || '';
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (providers.some((p) => host.includes(p))) {
      const pathSeg = (u.pathname || '').split('/').filter(Boolean);
      if (pathSeg.length) return pathSeg[pathSeg.length - 1].replace(/^@/, '');
    }
  } catch {}
  return value.replace(/^@/, '').split(/[/?#]/)[0] || '';
}

function normalizeVaughnInput(raw){
  const value = String(raw || '').trim();
  if (!value) return null;

  const sanitizeChannel = (candidate) => String(candidate || '')
    .trim()
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .replace(/[^a-z0-9_-]/gi, '');

  const looksLikeVaughnUrl = /^(?:https?:\/\/)?(?:www\.)?vaughn\.live\//i.test(value);
  const urlCandidate = /^https?:\/\//i.test(value)
    ? value
    : (looksLikeVaughnUrl ? `https://${value.replace(/^\/+/, '')}` : '');

  if (!urlCandidate) {
    const channel = sanitizeChannel(value);
    if (!channel) return null;
    return {
      channel,
      embedUrl: `https://vaughn.live/embed/${encodeURIComponent(channel)}`,
      externalUrl: `https://vaughn.live/${encodeURIComponent(channel)}`,
    };
  }

  try {
    const u = new URL(urlCandidate);
    const host = u.hostname.toLowerCase();
    if (!(host === 'vaughn.live' || host.endsWith('.vaughn.live'))) return null;
    const pathSeg = (u.pathname || '').split('/').filter(Boolean).map((s) => s.replace(/^@/, ''));
    if (!pathSeg.length) return null;

    let candidate = pathSeg[pathSeg.length - 1];
    if (pathSeg[0] && ['embed', 'popout', 'chat'].includes(pathSeg[0].toLowerCase()) && pathSeg[1]) {
      candidate = pathSeg[1];
    }
    const channel = sanitizeChannel(candidate);
    if (!channel) return null;
    return {
      channel,
      embedUrl: `https://vaughn.live/embed/${encodeURIComponent(channel)}`,
      externalUrl: `https://vaughn.live/${encodeURIComponent(channel)}`,
    };
  } catch {
    return null;
  }
}

function normalizeRumbleInput(raw){
  const value = String(raw || '').trim();
  if (!value) return null;

  const sanitizeSlug = (candidate) => String(candidate || '')
    .trim()
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .replace(/[^a-z0-9_-]/gi, '');

  if (!/^https?:\/\//i.test(value)) {
    const channel = sanitizeSlug(value);
    if (!channel) return null;
    return {
      channel,
      embedUrl: `https://rumble.com/embed/v${encodeURIComponent(channel)}`,
      externalUrl: `https://rumble.com/c/${encodeURIComponent(channel)}`,
      fallbackOnly: true,
      providerNote: 'Rumble embed IDs are not derivable from channel names alone; opening channel page fallback.',
    };
  }

  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (!(host === 'rumble.com' || host.endsWith('.rumble.com'))) return null;
    const seg = (u.pathname || '').split('/').filter(Boolean);
    if (!seg.length) return null;

    const first = seg[0].toLowerCase();
    if (first === 'embed' && seg[1]) {
      return {
        embedUrl: `https://rumble.com/embed/${encodeURIComponent(seg[1])}`,
        externalUrl: value,
        fallbackOnly: false,
      };
    }

    if (first === 'v' && seg[1]) {
      const slug = sanitizeSlug(seg[1]);
      if (!slug) return null;
      return {
        embedUrl: `https://rumble.com/embed/v${encodeURIComponent(slug)}`,
        externalUrl: value,
        fallbackOnly: false,
      };
    }

    if ((first === 'c' || first === 'user') && seg[1]) {
      const channel = sanitizeSlug(seg[1]);
      if (!channel) return null;
      return {
        channel,
        embedUrl: `https://rumble.com/embed/v${encodeURIComponent(channel)}`,
        externalUrl: `https://rumble.com/${first}/${encodeURIComponent(channel)}`,
        fallbackOnly: true,
        providerNote: 'Channel URL detected. Rumble typically requires a specific video embed ID; using open-tab fallback.',
      };
    }

    return {
      embedUrl: value,
      externalUrl: value,
      fallbackOnly: true,
      providerNote: 'Rumble URL detected but no stable embed ID parsed; using open-tab fallback.',
    };
  } catch {
    return null;
  }
}

function normalizeXLiveInput(raw){
  const value = String(raw || '').trim();
  if (!value) return null;

  const asUrl = /^https?:\/\//i.test(value)
    ? value
    : (/^(?:x\.com|twitter\.com)\//i.test(value) ? `https://${value}` : '');
  if (!asUrl) return null;

  try {
    const u = new URL(asUrl);
    const host = u.hostname.toLowerCase();
    if (!(host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com'))) return null;
    const seg = (u.pathname || '').split('/').filter(Boolean);
    const spacesIdx = seg.findIndex((s) => s.toLowerCase() === 'spaces');
    if (spacesIdx >= 0 && seg[spacesIdx + 1]) {
      const spaceId = String(seg[spacesIdx + 1]).replace(/[^a-z0-9]/gi, '');
      if (!spaceId) return null;
      const canonical = `https://x.com/i/spaces/${encodeURIComponent(spaceId)}`;
      return {
        embedUrl: canonical,
        externalUrl: canonical,
        renderMode: 'iframe',
        fallbackOnly: true,
        providerNote: 'X Spaces pages usually block third-party framing; use Pop-out/Open in new tab if embed is blank.',
      };
    }
    return {
      embedUrl: asUrl,
      externalUrl: asUrl,
      renderMode: 'iframe',
      fallbackOnly: true,
      providerNote: 'X Live URL detected. X generally blocks iframe playback outside x.com; fallback buttons are primary path.',
    };
  } catch {
    return null;
  }
}

function normalizeFacebookLiveInput(raw){
  const value = String(raw || '').trim();
  if (!value) return null;

  const asUrl = /^https?:\/\//i.test(value)
    ? value
    : (/^(?:www\.)?(?:facebook\.com|fb\.watch)\//i.test(value) ? `https://${value}` : '');
  if (!asUrl) return null;

  try {
    const u = new URL(asUrl);
    const host = u.hostname.toLowerCase();
    if (!(host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch' || host.endsWith('.fb.watch'))) return null;

    const normalizedExternal = host.includes('fb.watch')
      ? asUrl
      : `${u.origin}${u.pathname}${u.search || ''}`;

    const fbEmbedBase = 'https://www.facebook.com/plugins/video.php';
    const embedParams = new URLSearchParams({
      href: normalizedExternal,
      show_text: 'false',
      autoplay: 'true',
    });

    return {
      embedUrl: `${fbEmbedBase}?${embedParams.toString()}`,
      externalUrl: normalizedExternal,
      renderMode: 'iframe',
      fallbackOnly: false,
      providerNote: 'Facebook plugin embed mode (availability depends on post privacy and Facebook embed policy).',
    };
  } catch {
    return null;
  }
}

function openLiveStreamsPopout(url){
  if (!url) return false;
  const popout = openSafeExternal(url, [
    'popup=yes',
    'noopener',
    'noreferrer',
    'width=1280',
    'height=720',
    'resizable=yes',
    'scrollbars=yes',
  ].join(','));
  if (!popout) return false;
  try { popout.opener = null; } catch {}
  return true;
}

function buildLiveStreamTarget(){
  const sourceType = state.liveStreams.sourceType;
  const inputValue = String(state.liveStreams.inputs[sourceType] || '').trim();
  if (!inputValue) {
    return { error: `Enter a ${liveSourceLabel(sourceType)} value first.` };
  }

  if (sourceType === 'youtube') {
    if (/^https?:\/\//i.test(inputValue)) {
      const ytId = parseYouTubeVideoId(inputValue);
      if (ytId) {
        return {
          embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(ytId)}?autoplay=1&playsinline=1`,
          externalUrl: inputValue,
          renderMode: 'iframe',
          providerNote: 'YouTube URL detected. Embedded video ID mode.',
        };
      }
      const channel = parseChannelLikeInput(inputValue, ['youtube.com', 'youtu.be']);
      if (channel) {
        return {
          embedUrl: `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channel)}&autoplay=1`,
          externalUrl: inputValue,
          renderMode: 'iframe',
          providerNote: 'YouTube channel/live embed mode.',
        };
      }
    }
    const channel = parseChannelLikeInput(inputValue, ['youtube.com', 'youtu.be']);
    if (!channel) return { error: 'Invalid YouTube channel/video input.' };
    return {
      embedUrl: `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channel)}&autoplay=1`,
      externalUrl: `https://www.youtube.com/@${encodeURIComponent(channel)}/live`,
      renderMode: 'iframe',
      providerNote: 'YouTube channel embed mode.',
    };
  }

  if (sourceType === 'twitch') {
    const channel = parseChannelLikeInput(inputValue, ['twitch.tv']);
    if (!channel) return { error: 'Invalid Twitch channel input.' };
    const parent = encodeURIComponent(window.location.hostname || 'localhost');
    return {
      embedUrl: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${parent}&autoplay=true`,
      externalUrl: /^https?:\/\//i.test(inputValue) ? inputValue : `https://www.twitch.tv/${encodeURIComponent(channel)}`,
      renderMode: 'iframe',
      providerNote: 'Twitch embed requires allowed parent domain. If blocked, open in new tab.',
    };
  }

  if (sourceType === 'kick') {
    const channel = parseChannelLikeInput(inputValue, ['kick.com']);
    if (!channel) return { error: 'Invalid Kick channel input.' };
    return {
      embedUrl: `https://player.kick.com/${encodeURIComponent(channel)}`,
      externalUrl: /^https?:\/\//i.test(inputValue) ? inputValue : `https://kick.com/${encodeURIComponent(channel)}`,
      renderMode: 'iframe',
      providerNote: 'Kick embed mode (depends on provider framing policy).',
    };
  }

  if (sourceType === 'vaughn') {
    const normalized = normalizeVaughnInput(inputValue);
    if (!normalized) return { error: 'Invalid Vaughn Live input. Use a channel name or vaughn.live URL.' };
    return {
      embedUrl: normalized.embedUrl,
      externalUrl: normalized.externalUrl,
      renderMode: 'iframe',
      providerNote: 'Vaughn embed mode (normalized to explicit /embed/{channel}). Some channels may block framing.',
    };
  }

  if (sourceType === 'rumble') {
    const normalized = normalizeRumbleInput(inputValue);
    if (!normalized) return { error: 'Invalid Rumble input. Use a rumble.com URL (preferred) or channel slug.' };
    if (normalized.fallbackOnly) {
      return {
        error: 'Rumble stream is best opened in Pop-out Player/Open in new tab for reliability.',
        externalUrl: normalized.externalUrl,
      };
    }
    return {
      embedUrl: normalized.embedUrl,
      externalUrl: normalized.externalUrl,
      renderMode: 'iframe',
      providerNote: normalized.providerNote || 'Rumble embed mode. If blocked/blank, use Pop-out Player or Open in new tab.',
    };
  }

  if (sourceType === 'xlive') {
    const normalized = normalizeXLiveInput(inputValue);
    if (!normalized) return { error: 'Invalid X Live/Spaces input. Use an x.com/twitter.com spaces URL.' };
    if (normalized.fallbackOnly) {
      return {
        error: 'X Spaces usually blocks in-app embeds. Use Pop-out Player or Open in new tab.',
        externalUrl: normalized.externalUrl,
      };
    }
    return {
      embedUrl: normalized.embedUrl,
      externalUrl: normalized.externalUrl,
      renderMode: normalized.renderMode || 'iframe',
      providerNote: normalized.providerNote,
    };
  }

  if (sourceType === 'facebook') {
    const normalized = normalizeFacebookLiveInput(inputValue);
    if (!normalized) return { error: 'Invalid Facebook Live input. Use a facebook.com/.../videos/... or fb.watch URL.' };
    return {
      embedUrl: normalized.embedUrl,
      externalUrl: normalized.externalUrl,
      renderMode: normalized.renderMode || 'iframe',
      providerNote: normalized.providerNote || 'Facebook Live plugin embed mode. If blocked, use Pop-out/Open in new tab.',
    };
  }

  if (sourceType === 'generic' || sourceType === 'local') {
    const lower = inputValue.toLowerCase();
    if (lower.startsWith('rtmp://')) {
      return {
        error: 'RTMP cannot be played directly in-browser. Use an HLS/M3U8 URL or open stream URL in an external player/tab.',
        externalUrl: inputValue,
      };
    }
    const mediaLike = /\.(m3u8|mp4|webm|ogg)(\?|#|$)/i.test(inputValue);
    if (/^https?:\/\//i.test(inputValue) || /^\//.test(inputValue) || /^\.\//.test(inputValue)) {
      return {
        embedUrl: inputValue,
        externalUrl: inputValue,
        renderMode: mediaLike ? 'video' : 'iframe',
        providerNote: mediaLike
          ? 'Direct media/HLS URL detected. Browser playback support depends on codec and M3U8 support.'
          : 'URL embed mode (iframe). If blocked, open in new tab.',
      };
    }
    return { error: 'Generic/Local source must be a URL (http/https) or local-relative path.' };
  }

  return { error: 'Unsupported source type.' };
}

function setLiveStreamsStatus(text){
  const el = document.getElementById('liveStreamsStatus');
  if (el) el.textContent = text;
  syncLiveStreamsUiStatus(text);
}

function getLiveStreamsEls(){
  const root = document.getElementById('liveStreamsWidget')?.querySelector('[data-pod="live-streams"]') || null;
  return {
    root,
    sourceType: root?.querySelector('[data-live-role="source-type"]') || null,
    input: root?.querySelector('[data-live-role="input"]') || null,
    startBtn: root?.querySelector('[data-live-role="start"]') || null,
    stopBtn: root?.querySelector('[data-live-role="stop"]') || null,
    fullscreenBtn: root?.querySelector('[data-live-role="fullscreen"]') || null,
    popoutBtn: root?.querySelector('[data-live-role="popout"]') || null,
    openBtn: root?.querySelector('[data-live-role="open"]') || null,
    playerWrap: root?.querySelector('[data-live-role="player-wrap"]') || null,
    frame: root?.querySelector('[data-live-role="frame"]') || null,
    video: root?.querySelector('[data-live-role="video"]') || null,
    presetName: root?.querySelector('[data-live-role="preset-name"]') || null,
    savePresetBtn: root?.querySelector('[data-live-role="save-preset"]') || null,
    presetSelect: root?.querySelector('[data-live-role="preset-select"]') || null,
    applyPresetBtn: root?.querySelector('[data-live-role="apply-preset"]') || null,
  };
}

function liveStreamsCompactValueLabel(raw){
  const value = String(raw || '').trim();
  if (!value) return 'No source loaded yet';
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^www\./i, '');
    const path = u.pathname && u.pathname !== '/' ? u.pathname : '';
    return `${host}${path}`.slice(0, 68);
  } catch {
    return value.slice(0, 68);
  }
}

function getLiveStreamsPresentation(statusText = ''){
  const sourceType = String(state.liveStreams.sourceType || 'youtube');
  const providerLabel = liveSourceLabel(sourceType);
  const sourceValue = String(state.liveStreams.inputs[sourceType] || '').trim();
  const presetCount = Array.isArray(state.liveStreams.presets) ? state.liveStreams.presets.length : 0;
  const status = String(state.liveStreams.status || (state.liveStreams.active ? 'loading' : 'idle')).toLowerCase();
  const renderMode = String(state.liveStreams.renderMode || 'iframe').toLowerCase();
  const hasExternal = !!state.liveStreams.externalUrl;

  let tone = 'idle';
  let signal = 'neutral';
  let signalDetail = providerLabel;
  let badge = 'Ready';
  let heroTitle = `Queue up ${providerLabel}`;
  let fallbackMeta = 'Choose a source, paste a channel or URL, then start the stream deck.';

  if (status === 'live') {
    tone = 'live';
    signal = 'fresh';
    signalDetail = renderMode === 'video' ? 'direct media' : 'live';
    badge = 'Live';
    heroTitle = `${providerLabel} is on deck`;
    fallbackMeta = hasExternal
      ? 'If the embed blanks out, the fallback buttons are ready.'
      : 'Live playback is active in the embedded stage.';
  } else if (status === 'loading') {
    tone = 'loading';
    signal = 'degraded';
    signalDetail = 'loading';
    badge = 'Loading';
    heroTitle = `Loading ${providerLabel}`;
    fallbackMeta = 'Some providers take a few seconds to reveal whether framing is allowed.';
  } else if (status === 'error') {
    tone = 'error';
    signal = 'error';
    signalDetail = 'fallback ready';
    badge = 'Blocked';
    heroTitle = `${providerLabel} needs a fallback path`;
    fallbackMeta = state.liveStreams.lastError || 'This source likely blocks in-app embedding.';
  }

  return {
    tone,
    signal,
    signalDetail,
    badge,
    heroTitle,
    heroMeta: String(statusText || fallbackMeta || '').trim(),
    providerLabel,
    sourceHeadline: liveStreamsCompactValueLabel(sourceValue),
    sourceHint: 'Drop in a handle, channel name, or direct stream URL. Different providers normalize differently behind the scenes.',
    presetMeta: presetCount ? `${presetCount} saved preset${presetCount === 1 ? '' : 's'} ready to reuse.` : 'No presets saved yet. Save your favorite channels for quick launch.',
    stageTitle: renderMode === 'video' ? 'Direct media player' : 'Embedded stream stage',
    stageMeta: hasExternal
      ? 'When a provider blocks framing or the player stays blank, use Pop-out or Open in new tab.'
      : 'This source is best experienced directly inside the dashboard when embedding cooperates.',
    chips: [
      providerLabel,
      state.liveStreams.active ? 'Session active' : 'Idle',
      renderMode === 'video' ? 'Direct media' : 'Embed mode',
      hasExternal ? 'Fallback ready' : 'In-dashboard only',
    ],
    footnote: 'Providers differ wildly on iframe policy. The pod keeps fallback routes close so a blocked embed does not kill the experience.',
  };
}

function syncLiveStreamsUiStatus(statusText = ''){
  const meta = getLiveStreamsPresentation(statusText);
  const hero = document.querySelector('[data-live-role="hero"]');
  if (hero) hero.className = `live-streams-hero live-streams-hero--${meta.tone}`;

  const badge = document.querySelector('[data-live-role="status-badge"]');
  if (badge) {
    badge.textContent = meta.badge;
    badge.className = `live-streams-status-pill live-streams-status-pill--${meta.tone}`;
  }

  const heroTitle = document.querySelector('[data-live-role="hero-title"]');
  if (heroTitle) heroTitle.textContent = meta.heroTitle;

  const heroMeta = document.querySelector('[data-live-role="hero-meta"]');
  if (heroMeta) heroMeta.textContent = meta.heroMeta;

  const stageTitle = document.querySelector('[data-live-role="stage-title"]');
  if (stageTitle) stageTitle.textContent = meta.stageTitle;

  const stageMeta = document.querySelector('[data-live-role="stage-meta"]');
  if (stageMeta) stageMeta.textContent = meta.stageMeta;

  setPodStatusSignal('live-streams', meta.signal, meta.signalDetail);
}

function stopLiveStream({ keepStatus = false } = {}){
  const els = getLiveStreamsEls();
  if (els.frame) els.frame.src = 'about:blank';
  if (els.video) {
    try {
      els.video.pause();
      els.video.removeAttribute('src');
      els.video.load();
    } catch {}
  }
  state.liveStreams.active = false;
  state.liveStreams.embedUrl = '';
  state.liveStreams.renderMode = 'iframe';
  state.liveStreams.status = 'idle';
  state.liveStreams.lastError = '';
  save();
  renderLiveStreamsPod();
  if (!keepStatus) setLiveStreamsStatus('Stopped. Configure a source and click Load / Start.');
}

function startLiveStream(){
  const target = buildLiveStreamTarget();
  if (target.error) {
    state.liveStreams.status = 'error';
    state.liveStreams.lastError = target.error;
    if (target.externalUrl) state.liveStreams.externalUrl = target.externalUrl;
    state.liveStreams.active = false;
    save();
    renderLiveStreamsPod();
    setLiveStreamsStatus(`${target.error}${state.liveStreams.externalUrl ? ' Use Pop-out Player or Open in new tab when applicable.' : ''}`);
    return;
  }

  state.liveStreams.status = 'loading';
  state.liveStreams.lastError = '';
  state.liveStreams.active = true;
  state.liveStreams.embedUrl = target.embedUrl;
  state.liveStreams.externalUrl = target.externalUrl || target.embedUrl;
  state.liveStreams.renderMode = target.renderMode || 'iframe';
  save();
  renderLiveStreamsPod();
  setLiveStreamsStatus(`Loading ${liveSourceLabel(state.liveStreams.sourceType)}… ${target.providerNote || ''}`);
}

function renderLiveStreamsPod(){
  const el = document.getElementById('liveStreamsWidget');
  if (!el) return;

  const sourceType = state.liveStreams.sourceType;
  const inputValue = String(state.liveStreams.inputs[sourceType] || '');
  const placeholders = {
    youtube: 'Channel, @handle, or YouTube URL',
    twitch: 'Channel name or twitch.tv/channel URL',
    kick: 'Channel name or kick.com/channel URL',
    vaughn: 'Channel name or vaughn.live/channel URL',
    rumble: 'Channel name, slug, or rumble.com URL',
    xlive: 'x.com/i/spaces/... or twitter.com/i/spaces/...',
    facebook: 'facebook.com/.../videos/... or fb.watch/... URL',
    generic: 'https://... (HLS/M3U8/MP4 or embeddable page)',
    local: 'http://127.0.0.1:... or /local/path',
  };
  const presetOptions = ['<option value="">Saved presets</option>', ...state.liveStreams.presets.map((p) => (
    `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} · ${escapeHtml(liveSourceLabel(p.sourceType))}</option>`
  ))].join('');
  const isVideo = state.liveStreams.active && state.liveStreams.renderMode === 'video';
  const isFrame = state.liveStreams.active && state.liveStreams.renderMode === 'iframe';
  const liveUi = getLiveStreamsPresentation();

  el.innerHTML = `
    <div class="live-streams-shell live-streams-v2-shell" data-pod="live-streams">
      <div class="live-streams-hero live-streams-hero--${liveUi.tone}" data-live-role="hero">
        <div class="live-streams-hero-copy">
          <span class="live-streams-kicker">Stream Deck</span>
          <strong data-live-role="hero-title">${escapeHtml(liveUi.heroTitle)}</strong>
          <div class="live-streams-hero-meta" data-live-role="hero-meta">${escapeHtml(liveUi.heroMeta)}</div>
        </div>
        <div class="live-streams-hero-badges">
          <span class="live-streams-status-pill live-streams-status-pill--${liveUi.tone}" data-live-role="status-badge">${escapeHtml(liveUi.badge)}</span>
          ${liveUi.chips.map((chip) => `<span class="live-streams-chip">${escapeHtml(chip)}</span>`).join('')}
        </div>
      </div>

      <div class="live-streams-control-grid">
        <div class="live-streams-stage-card live-streams-stage-card--primary">
        <div class="live-streams-stage-head">
          <div class="live-streams-stage-copy">
            <span class="live-streams-stage-kicker">Player Stage</span>
            <strong data-live-role="stage-title">${escapeHtml(liveUi.stageTitle)}</strong>
            <div class="live-streams-stage-meta" data-live-role="stage-meta">${escapeHtml(liveUi.stageMeta)}</div>
          </div>
          <div class="live-streams-stage-chips">
            <span class="live-streams-stage-chip">${escapeHtml(liveUi.providerLabel)}</span>
            <span class="live-streams-stage-chip">${escapeHtml(liveUi.sourceHeadline)}</span>
          </div>
        </div>
        <div class="live-streams-frame-wrap" data-live-role="player-wrap">
          <iframe data-live-role="frame" title="Live stream" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="no-referrer" allow="autoplay; fullscreen" class="${isFrame ? '' : 'is-hidden'}"></iframe>
          <video data-live-role="video" controls autoplay playsinline class="${isVideo ? '' : 'is-hidden'}"></video>
        </div>
      </div>

        <div class="live-streams-panel">
          <div class="live-streams-panel-head">
            <span class="live-streams-panel-kicker">Source</span>
            <strong>${escapeHtml(liveUi.sourceHeadline)}</strong>
          </div>
          <div class="live-streams-settings-grid">
            <label class="live-streams-field">
              <span>Provider</span>
              <select data-live-role="source-type">
                <option value="youtube" ${sourceType === 'youtube' ? 'selected' : ''}>YouTube Live</option>
                <option value="twitch" ${sourceType === 'twitch' ? 'selected' : ''}>Twitch</option>
                <option value="kick" ${sourceType === 'kick' ? 'selected' : ''}>Kick</option>
                <option value="vaughn" ${sourceType === 'vaughn' ? 'selected' : ''}>Vaughn Live</option>
                <option value="rumble" ${sourceType === 'rumble' ? 'selected' : ''}>Rumble</option>
                <option value="xlive" ${sourceType === 'xlive' ? 'selected' : ''}>X Live / Spaces</option>
                <option value="facebook" ${sourceType === 'facebook' ? 'selected' : ''}>Facebook Live</option>
                <option value="generic" ${sourceType === 'generic' ? 'selected' : ''}>Generic RTMP/HLS/M3U8 URL</option>
                <option value="local" ${sourceType === 'local' ? 'selected' : ''}>Local source URL</option>
              </select>
            </label>
            <label class="live-streams-field live-streams-field--wide">
              <span>Channel or URL</span>
              <input data-live-role="input" placeholder="${escapeHtml(placeholders[sourceType])}" value="${escapeHtml(inputValue)}" />
            </label>
          </div>
          <div class="live-streams-panel-note">${escapeHtml(liveUi.sourceHint)}</div>
          <div class="live-streams-action-row">
            <button data-live-role="start" class="btn">Load / Start</button>
            <button data-live-role="stop" class="btn ghost" ${state.liveStreams.active ? '' : 'disabled'}>Stop</button>
            <button data-live-role="fullscreen" class="btn ghost" ${state.liveStreams.active ? '' : 'disabled'}>Fullscreen</button>
            <button data-live-role="popout" class="btn ghost" ${state.liveStreams.externalUrl ? '' : 'disabled'}>Pop-out Player</button>
            <button data-live-role="open" class="btn ghost" ${state.liveStreams.externalUrl ? '' : 'disabled'}>Open in new tab</button>
          </div>
        </div>

        <div class="live-streams-panel">
          <div class="live-streams-panel-head">
            <span class="live-streams-panel-kicker">Presets</span>
            <strong>Quick launch favorites</strong>
          </div>
          <div class="live-streams-settings-grid">
            <label class="live-streams-field live-streams-field--wide">
              <span>Preset name</span>
              <input data-live-role="preset-name" placeholder="Preset name (optional)" />
            </label>
            <label class="live-streams-field live-streams-field--wide">
              <span>Saved presets</span>
              <select data-live-role="preset-select">${presetOptions}</select>
            </label>
          </div>
          <div class="live-streams-panel-note">${escapeHtml(liveUi.presetMeta)}</div>
          <div class="live-streams-action-row">
            <button data-live-role="save-preset" class="btn ghost">Save Preset</button>
            <button data-live-role="apply-preset" class="btn ghost">Apply</button>
          </div>
        </div>
      </div>

      <div class="live-streams-footnote">${escapeHtml(liveUi.footnote)}</div>
    </div>
  `;

  const els = getLiveStreamsEls();

  els.sourceType?.addEventListener('change', () => {
    state.liveStreams.sourceType = els.sourceType.value;
    state.liveStreams.status = 'idle';
    state.liveStreams.lastError = '';
    save();
    renderLiveStreamsPod();
    setLiveStreamsStatus(`${liveSourceLabel(state.liveStreams.sourceType)} selected. Enter source and click Load / Start.`);
  });

  els.input?.addEventListener('change', () => {
    state.liveStreams.inputs[state.liveStreams.sourceType] = String(els.input.value || '').trim();
    save();
  });

  els.startBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.liveStreams.inputs[state.liveStreams.sourceType] = String(els.input?.value || '').trim();
    save();
    startLiveStream();
  });

  els.stopBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopLiveStream();
  });

  els.fullscreenBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!els.playerWrap) return;
    try {
      if (document.fullscreenElement === els.playerWrap && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (els.playerWrap.requestFullscreen) {
        await els.playerWrap.requestFullscreen();
      } else {
        setLiveStreamsStatus('Fullscreen is not available in this browser/context.');
      }
    } catch {
      setLiveStreamsStatus('Unable to open the player stage in fullscreen.');
    }
  });

  els.popoutBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!state.liveStreams.externalUrl) return;
    const opened = openLiveStreamsPopout(state.liveStreams.externalUrl);
    setLiveStreamsStatus(opened
      ? `Opened ${liveSourceLabel(state.liveStreams.sourceType)} in Pop-out Player.`
      : 'Pop-out blocked by browser. Allow pop-ups or use Open in new tab.');
  });

  els.openBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!state.liveStreams.externalUrl) return;
    openSafeExternal(state.liveStreams.externalUrl);
  });

  els.savePresetBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const value = String(els.input?.value || '').trim();
    const name = String(els.presetName?.value || '').trim();
    if (!value) {
      setLiveStreamsStatus('Preset save skipped: enter a source value first.');
      return;
    }
    const finalName = name || `${liveSourceLabel(state.liveStreams.sourceType)} ${new Date().toLocaleTimeString()}`;
    state.liveStreams.presets.unshift({
      id: id(),
      name: finalName.slice(0, 40),
      sourceType: state.liveStreams.sourceType,
      value: value.slice(0, 500),
      createdAt: now(),
    });
    state.liveStreams.presets = state.liveStreams.presets.slice(0, 20);
    save();
    renderLiveStreamsPod();
    setLiveStreamsStatus(`Preset saved: ${finalName.slice(0, 40)}.`);
  });

  els.applyPresetBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const selectedId = String(els.presetSelect?.value || '');
    const preset = state.liveStreams.presets.find((p) => p.id === selectedId);
    if (!preset) {
      setLiveStreamsStatus('Pick a saved preset first.');
      return;
    }
    state.liveStreams.sourceType = preset.sourceType;
    state.liveStreams.inputs[preset.sourceType] = preset.value;
    save();
    renderLiveStreamsPod();
    setLiveStreamsStatus(`Applied preset: ${preset.name}.`);
  });

  if (isFrame && els.frame && state.liveStreams.embedUrl) {
    const timeoutId = setTimeout(() => {
      if (state.liveStreams.active && state.liveStreams.status === 'loading') {
        state.liveStreams.status = 'error';
        state.liveStreams.lastError = 'Embed did not become ready (possibly blocked by provider framing policy).';
        save();
        setLiveStreamsStatus(`${state.liveStreams.lastError} Use Pop-out Player or Open in new tab.`);
      }
    }, 7000);
    els.frame.addEventListener('load', () => {
      clearTimeout(timeoutId);
      state.liveStreams.status = 'live';
      state.liveStreams.lastError = '';
      save();
      setLiveStreamsStatus(`Live stream loaded (${liveSourceLabel(state.liveStreams.sourceType)}). If playback is blocked, use Pop-out Player or open in new tab.`);
    }, { once: true });
    if (!setSafeFrameSource(els.frame, state.liveStreams.embedUrl)) {
      setLiveStreamsStatus('This embed URL is not an approved provider. Use Open in new tab if available.');
      return;
    }
  }

  if (isVideo && els.video && state.liveStreams.embedUrl) {
    const onLoaded = () => {
      state.liveStreams.status = 'live';
      state.liveStreams.lastError = '';
      save();
      setLiveStreamsStatus(`Live media loaded (${liveSourceLabel(state.liveStreams.sourceType)}).`);
    };
    const onError = () => {
      state.liveStreams.status = 'error';
      state.liveStreams.lastError = 'Browser could not play this media URL (codec/CORS/format issue).';
      save();
      setLiveStreamsStatus(`${state.liveStreams.lastError} Try Pop-out Player or Open in new tab.`);
    };
    els.video.addEventListener('loadeddata', onLoaded, { once: true });
    els.video.addEventListener('error', onError, { once: true });
    if (!setSafeMediaSource(els.video, state.liveStreams.embedUrl)) {
      setLiveStreamsStatus('This video URL is not allowed.');
      return;
    }
  }

  if (state.liveStreams.status === 'error' && state.liveStreams.lastError) {
    setLiveStreamsStatus(`${state.liveStreams.lastError}${state.liveStreams.externalUrl ? ' Use Pop-out Player or Open in new tab if needed.' : ''}`);
  } else if (state.liveStreams.status === 'loading') {
    setLiveStreamsStatus(`Loading ${liveSourceLabel(sourceType)}…`);
  } else if (!state.liveStreams.active) {
    setLiveStreamsStatus('Ready. Select a source preset, enter channel/URL, then click Load / Start.');
  }
}

function setVoiceNoteStatus(text){
  const el = document.getElementById('voiceNoteStatus');
  if (el) el.textContent = text;
}

function getVoiceNoteControls(){
  const root = document.getElementById('voiceNoteWidget')?.querySelector('[data-pod="voice-note"]');
  return {
    root,
    startBtn: root?.querySelector('[data-voice-note-role="start"]') || null,
    stopBtn: root?.querySelector('[data-voice-note-role="stop"]') || null,
  };
}

function getSpeechRecognitionCtor(){
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setVoiceDeskStatus(text, status = 'neutral', detail = ''){
  const el = document.getElementById('voiceDeskStatus');
  if (el) el.textContent = text;
  setPodStatusSignal(MERGED_VOICE_POD_ID, status, detail);
}

function setVoiceDeskDraftValue(text){
  voiceToRowanDraft = String(text || '');
  const input = document.getElementById('voiceDeskTranscript');
  if (input && input.value !== voiceToRowanDraft) {
    input.value = voiceToRowanDraft;
  }
}

function showVoiceDeskFallbackTools(show){
  const toolsEl = document.getElementById('voiceDeskFallbackTools');
  if (!toolsEl) return;
  toolsEl.classList.toggle('is-hidden', !show);
}

function getVoiceDeskControls(){
  const root = document.getElementById('voiceDeskWidget')?.querySelector('[data-pod="voice-desk"]') || null;
  return {
    root,
    startBtn: root?.querySelector('[data-voice-desk-role="start"]') || null,
    stopBtn: root?.querySelector('[data-voice-desk-role="stop"]') || null,
    saveBtn: root?.querySelector('[data-voice-desk-role="save-note"]') || null,
    sendBtn: root?.querySelector('[data-voice-desk-role="send-rowan"]') || null,
    clearBtn: root?.querySelector('[data-voice-desk-role="clear"]') || null,
    transcript: root?.querySelector('[data-voice-desk-role="transcript"]') || null,
  };
}

function ensureVoiceDeskRecognizer(){
  if (voiceToRowanRecognizer || !voiceToRowanSupported) return voiceToRowanRecognizer;
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();
  if (!SpeechRecognitionCtor) return null;

  const recognizer = new SpeechRecognitionCtor();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = 'en-US';

  recognizer.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) {
        voiceToRowanFinalTranscript += `${text} `;
      } else {
        interim += `${text} `;
      }
    }
    const live = `${voiceToRowanFinalTranscript} ${interim}`.trim();
    setVoiceDeskDraftValue(live);
    setVoiceDeskStatus(live ? 'Listening... edit the draft before saving or sending.' : 'Listening... speak now.', 'fresh', 'listening');
  };

  recognizer.onerror = (event) => {
    const err = event?.error || 'unknown';
    voiceToRowanLastError = err;
    if (err === 'not-allowed') {
      setVoiceDeskStatus('Microphone permission denied. Allow mic access and try again.', 'error', 'permission');
      return;
    }
    if (err === 'no-speech') {
      setVoiceDeskStatus('Listening... no speech detected yet. Keep talking or stop when ready.', 'degraded', 'no speech');
      return;
    }
    setVoiceDeskStatus(`Voice input error: ${err}.`, 'error', 'input error');
  };

  recognizer.onend = () => {
    const wasListening = voiceToRowanListening;
    voiceToRowanListening = false;
    const controls = getVoiceDeskControls();
    if (controls.startBtn) controls.startBtn.disabled = !voiceToRowanSupported;
    if (controls.stopBtn) controls.stopBtn.disabled = true;

    if (!wasListening) return;

    const hasDraft = !!String(voiceToRowanDraft || '').trim();
    if (!hasDraft && voiceToRowanLastError && voiceToRowanLastError !== 'no-speech') {
      voiceToRowanManualStop = false;
      setVoiceDeskStatus(`Voice input error: ${voiceToRowanLastError}. Try Chrome/Edge on localhost and verify your mic device.`, 'error', 'mic issue');
      return;
    }

    voiceToRowanManualStop = false;
    if (hasDraft) {
      setVoiceDeskStatus('Draft ready. Save it as a note or send it to Rowan.', 'fresh', 'draft ready');
      return;
    }
    setVoiceDeskStatus('No speech captured. Try again and speak clearly.', 'degraded', 'empty');
  };

  voiceToRowanRecognizer = recognizer;
  return voiceToRowanRecognizer;
}

function renderVoiceDeskPod(){
  const el = document.getElementById('voiceDeskWidget');
  if (!el) return;

  voiceToRowanSupported = !!getSpeechRecognitionCtor();
  const hasDraft = !!String(voiceToRowanDraft || '').trim();
  el.innerHTML = `
    <div class="voice-desk-shell" data-pod="voice-desk">
      <div class="voice-desk-topbar">
        <button data-voice-desk-role="start" class="btn" ${voiceToRowanSupported && !voiceToRowanListening ? '' : 'disabled'}>Start</button>
        <button data-voice-desk-role="stop" class="btn ghost" ${voiceToRowanListening ? '' : 'disabled'}>Stop</button>
        <span class="voice-desk-pill">${voiceToRowanSupported ? 'Speech to draft' : 'Browser unsupported'}</span>
      </div>
      <div class="voice-desk-meta">${voiceToRowanSupported ? 'Capture once, then choose where the transcript should go.' : 'Voice transcription is not supported in this browser.'}</div>
      <textarea id="voiceDeskTranscript" data-voice-desk-role="transcript" class="voice-desk-transcript" rows="5" placeholder="Transcript draft... edit before saving as a note or sending to Rowan.">${escapeHtml(voiceToRowanDraft)}</textarea>
      <div class="voice-desk-actions">
        <button data-voice-desk-role="save-note" class="btn ghost" ${hasDraft ? '' : 'disabled'}>Save as Note</button>
        <button data-voice-desk-role="send-rowan" class="btn" ${hasDraft ? '' : 'disabled'}>Send to Rowan</button>
        <button data-voice-desk-role="clear" class="btn ghost" ${hasDraft ? '' : 'disabled'}>Clear</button>
      </div>
      <div id="voiceDeskFallbackTools" class="voice-desk-actions is-hidden">
        <button id="voiceDeskCopyBtn" class="btn ghost">Copy draft</button>
        <a id="voiceDeskOpenChatLink" class="btn ghost" href="#chat" title="Open host chat">Open chat</a>
      </div>
      <div class="voice-desk-meta">Manual send only. Nothing is auto-sent. Saving as a note creates an unassigned note in your board.</div>
    </div>
  `;

  if (!voiceToRowanSupported) {
    setVoiceDeskStatus('SpeechRecognition unsupported. Try Chrome/Edge on HTTPS or localhost.', 'error', 'unsupported');
    return;
  }

  if (hasDraft) {
    setVoiceDeskStatus('Draft ready. Save it as a note or send it to Rowan.', 'fresh', 'draft ready');
  } else if (!voiceToRowanListening) {
    setVoiceDeskStatus('Ready. Start listening, then save as a note or send to Rowan manually.', 'neutral', 'ready');
  }

  const controls = getVoiceDeskControls();

  controls.transcript?.addEventListener('input', (event) => {
    voiceToRowanDraft = event.target.value;
    const filled = !!String(voiceToRowanDraft || '').trim();
    if (controls.saveBtn) controls.saveBtn.disabled = !filled;
    if (controls.sendBtn) controls.sendBtn.disabled = !filled;
    if (controls.clearBtn) controls.clearBtn.disabled = !filled;
    if (filled) showVoiceDeskFallbackTools(false);
  });

  document.getElementById('voiceDeskCopyBtn')?.addEventListener('click', async () => {
    const body = String(voiceToRowanDraft || '').trim();
    if (!body) {
      setVoiceDeskStatus('Nothing to copy yet. Record or type a message first.', 'degraded', 'empty');
      return;
    }
    try {
      await navigator.clipboard.writeText(body);
      setVoiceDeskStatus('Draft copied. Paste it in Rowan chat.', 'fresh', 'copied');
    } catch {
      setVoiceDeskStatus('Copy failed. Select the draft text and copy manually.', 'error', 'copy failed');
    }
  });

  document.getElementById('voiceDeskOpenChatLink')?.addEventListener('click', () => {
    setVoiceDeskStatus('Use your host app chat panel/tab, then paste from clipboard if needed.', 'degraded', 'manual fallback');
  });

  controls.startBtn?.addEventListener('click', () => {
    const recognizer = ensureVoiceDeskRecognizer();
    if (!recognizer || voiceToRowanListening) return;
    voiceToRowanFinalTranscript = '';
    voiceToRowanLastError = '';
    voiceToRowanManualStop = false;
    setVoiceDeskDraftValue('');
    showVoiceDeskFallbackTools(false);
    voiceToRowanListening = true;
    setVoiceDeskStatus('Listening... speak now.', 'fresh', 'listening');
    if (controls.startBtn) controls.startBtn.disabled = true;
    if (controls.stopBtn) controls.stopBtn.disabled = false;
    if (controls.saveBtn) controls.saveBtn.disabled = true;
    if (controls.sendBtn) controls.sendBtn.disabled = true;
    if (controls.clearBtn) controls.clearBtn.disabled = true;
    try {
      recognizer.start();
    } catch {
      voiceToRowanListening = false;
      if (controls.startBtn) controls.startBtn.disabled = false;
      if (controls.stopBtn) controls.stopBtn.disabled = true;
      setVoiceDeskStatus('Could not start voice capture. Try again.', 'error', 'start failed');
    }
  });

  controls.stopBtn?.addEventListener('click', () => {
    if (!voiceToRowanRecognizer || !voiceToRowanListening) return;
    voiceToRowanManualStop = true;
    setVoiceDeskStatus('Stopping...', 'degraded', 'stopping');
    try {
      voiceToRowanRecognizer.stop();
    } catch {}
  });

  controls.clearBtn?.addEventListener('click', () => {
    setVoiceDeskDraftValue('');
    voiceToRowanFinalTranscript = '';
    voiceToRowanLastError = '';
    showVoiceDeskFallbackTools(false);
    if (controls.saveBtn) controls.saveBtn.disabled = true;
    if (controls.sendBtn) controls.sendBtn.disabled = true;
    if (controls.clearBtn) controls.clearBtn.disabled = true;
    setVoiceDeskStatus('Draft cleared.', 'neutral', 'cleared');
  });

  controls.root?.querySelector('[data-voice-desk-role="save-note"]')?.addEventListener('click', () => {
    const body = String(voiceToRowanDraft || '').trim();
    if (!body) {
      setVoiceDeskStatus('Draft is empty. Record or type a message first.', 'degraded', 'empty');
      return;
    }
    if (addVoiceNoteFromTranscript(body)) {
      setVoiceDeskDraftValue('');
      voiceToRowanFinalTranscript = '';
      voiceToRowanLastError = '';
      showVoiceDeskFallbackTools(false);
      if (controls.saveBtn) controls.saveBtn.disabled = true;
      if (controls.sendBtn) controls.sendBtn.disabled = true;
      if (controls.clearBtn) controls.clearBtn.disabled = true;
      setVoiceDeskStatus('Saved as a new note.', 'fresh', 'note saved');
      commitState('voice_note_saved');
      return;
    }
    setVoiceDeskStatus('Could not save the draft as a note.', 'error', 'save failed');
  });

  controls.root?.querySelector('[data-voice-desk-role="send-rowan"]')?.addEventListener('click', async () => {
    const body = String(voiceToRowanDraft || '').trim();
    if (!body) {
      setVoiceDeskStatus('Draft is empty. Record or type a message first.', 'degraded', 'empty');
      return;
    }

    if (controls.sendBtn) controls.sendBtn.disabled = true;
    if (controls.clearBtn) controls.clearBtn.disabled = true;
    if (controls.saveBtn) controls.saveBtn.disabled = true;
    setVoiceDeskStatus('Sending message to Rowan...', 'degraded', 'sending');

    try {
      const result = await sendVoiceToRowanMessage(body);
      setVoiceDeskDraftValue('');
      voiceToRowanFinalTranscript = '';
      voiceToRowanLastError = '';
      showVoiceDeskFallbackTools(false);
      setVoiceDeskStatus(`Sent to Rowan chat via ${result.transport}.`, 'fresh', 'sent');
    } catch (err) {
      if (err?.code === 'ROWAN_BRIDGE_UNAVAILABLE' || err?.code === 'ROWAN_RELAY_NOT_CONFIGURED') {
        showVoiceDeskFallbackTools(true);
        if (err?.code === 'ROWAN_RELAY_NOT_CONFIGURED') {
          setVoiceDeskStatus('Relay is not configured on this server. Draft preserved — use Copy draft, then paste into chat.', 'error', 'relay missing');
        } else {
          setVoiceDeskStatus(`Relay send failed. Draft preserved — ${String(err?.message || err)}. Use Copy draft as fallback.`, 'error', 'fallback ready');
        }
      } else {
        setVoiceDeskStatus(`Could not send: ${String(err?.message || err)}. Draft preserved.`, 'error', 'send failed');
      }
    } finally {
      const filled = !!String(voiceToRowanDraft || '').trim();
      if (controls.sendBtn) controls.sendBtn.disabled = !filled;
      if (controls.saveBtn) controls.saveBtn.disabled = !filled;
      if (controls.clearBtn) controls.clearBtn.disabled = !filled;
    }
  });
}

function addVoiceNoteFromTranscript(transcript){
  const body = String(transcript || '').trim();
  if (!body) return false;
  const ts = now();
  state.notes.unshift({
    id: id(),
    title: 'Voice Note',
    body,
    projectId: '',
    pinned: false,
    createdAt: ts,
    updatedAt: ts,
  });
  save();
  return true;
}

function ensureVoiceNoteRecognizer(){
  if (voiceNoteRecognizer || !voiceNoteSupported) return voiceNoteRecognizer;
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();
  if (!SpeechRecognitionCtor) return null;

  const recognizer = new SpeechRecognitionCtor();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = 'en-US';

  recognizer.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) {
        voiceNoteSessionTranscript += `${text} `;
      } else {
        interim += `${text} `;
      }
    }
    const live = `${voiceNoteSessionTranscript} ${interim}`.trim();
    setVoiceNoteStatus(live ? `Listening… ${live}` : 'Listening… speak now.');
  };

  recognizer.onerror = (event) => {
    const err = event?.error || 'unknown';
    voiceNoteLastError = err;
    if (err === 'not-allowed') {
      setVoiceNoteStatus('Microphone permission denied. Allow mic access and try again.');
      return;
    }
    if (err === 'no-speech') {
      setVoiceNoteStatus('Listening… no speech detected yet. Keep talking.');
      return;
    }
    setVoiceNoteStatus(`Voice input error: ${err}.`);
  };

  recognizer.onend = () => {
    const wasListening = voiceNoteListening;
    voiceNoteListening = false;
    const { startBtn, stopBtn } = getVoiceNoteControls();
    if (startBtn) startBtn.disabled = !voiceNoteSupported;
    if (stopBtn) stopBtn.disabled = true;

    if (!wasListening) return;

    const hasTranscript = !!String(voiceNoteSessionTranscript || '').trim();

    if (!hasTranscript && voiceNoteLastError && voiceNoteLastError !== 'no-speech') {
      voiceNoteManualStop = false;
      voiceNoteAutoRestartLeft = 0;
      setVoiceNoteStatus(`Voice input error: ${voiceNoteLastError}. Try Chrome/Edge on localhost and verify mic device.`);
      return;
    }

    if (!hasTranscript && !voiceNoteManualStop && voiceNoteAutoRestartLeft > 0) {
      voiceNoteAutoRestartLeft -= 1;
      setVoiceNoteStatus('No speech captured yet — still listening…');
      try {
        voiceNoteListening = true;
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        recognizer.start();
        return;
      } catch {
        voiceNoteListening = false;
      }
    }

    if (addVoiceNoteFromTranscript(voiceNoteSessionTranscript)) {
      voiceNoteSessionTranscript = '';
      voiceNoteManualStop = false;
      voiceNoteAutoRestartLeft = 0;
      setVoiceNoteStatus('Saved as new note: "Voice Note".');
      commitState('voice_note_saved');
      return;
    }
    voiceNoteManualStop = false;
    voiceNoteAutoRestartLeft = 0;
    setVoiceNoteStatus('No speech captured. Try again and speak clearly.');
  };

  voiceNoteRecognizer = recognizer;
  return voiceNoteRecognizer;
}

function renderVoiceNotePod(){
  const el = document.getElementById('voiceNoteWidget');
  if (!el) return;

  voiceNoteSupported = !!getSpeechRecognitionCtor();
  el.innerHTML = `
    <div class="row-wrap" data-pod="voice-note">
      <button id="voiceNoteStartBtn" data-voice-note-role="start" class="btn" ${voiceNoteSupported && !voiceNoteListening ? '' : 'disabled'}>Start</button>
      <button id="voiceNoteStopBtn" data-voice-note-role="stop" class="btn ghost" ${voiceNoteListening ? '' : 'disabled'}>Stop</button>
    </div>
    <div class="note-meta mt6">${voiceNoteSupported ? 'Creates a new unassigned note from your speech.' : 'Voice transcription is not supported in this browser.'}</div>
  `;

  if (!voiceNoteSupported) {
    setVoiceNoteStatus('SpeechRecognition unsupported. Try Chrome/Edge on HTTPS or localhost.');
    return;
  }

  const { root, startBtn } = getVoiceNoteControls();

  // Regression guard: Voice Note handlers are pod-scoped and never call music transport controls.
  startBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const recognizer = ensureVoiceNoteRecognizer();
    if (!recognizer || voiceNoteListening) return;
    voiceNoteSessionTranscript = '';
    voiceNoteLastError = '';
    voiceNoteManualStop = false;
    voiceNoteAutoRestartLeft = 2;
    voiceNoteListening = true;
    setVoiceNoteStatus('Listening… speak now.');
    const controls = getVoiceNoteControls();
    if (controls.startBtn) controls.startBtn.disabled = true;
    if (controls.stopBtn) controls.stopBtn.disabled = false;
    try {
      recognizer.start();
    } catch {
      voiceNoteListening = false;
      if (controls.startBtn) controls.startBtn.disabled = false;
      if (controls.stopBtn) controls.stopBtn.disabled = true;
      setVoiceNoteStatus('Could not start voice capture. Try again.');
    }
  });

  root?.querySelector('[data-voice-note-role="stop"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!voiceNoteRecognizer || !voiceNoteListening) return;
    voiceNoteManualStop = true;
    voiceNoteAutoRestartLeft = 0;
    setVoiceNoteStatus('Stopping voice capture…');
    try {
      voiceNoteRecognizer.stop();
    } catch {}
  });
}

function setVoiceToRowanStatus(text){
  const el = document.getElementById('voiceToRowanStatus');
  if (el) el.textContent = text;
}

function setVoiceToRowanDraftValue(text){
  voiceToRowanDraft = String(text || '');
  const input = document.getElementById('voiceToRowanTranscript');
  if (input && input.value !== voiceToRowanDraft) {
    input.value = voiceToRowanDraft;
  }
}

function getVoiceToRowanBridgeTargetOrigin(targetWindow){
  if (!targetWindow) return null;

  try {
    if (targetWindow.location && targetWindow.location.origin === window.location.origin) {
      return window.location.origin;
    }
  } catch {
    // Cross-origin target; fall through to referrer-derived origin.
  }

  if (document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {}
  }

  return null;
}

function sendVoiceToRowanViaParentBridge(text){
  const payload = {
    type: 'mission-control.chat.send',
    action: 'mission-control:chat:send',
    version: 1,
    source: 'project-mission-control-lite',
    text,
    ts: Date.now(),
  };

  const targets = [];
  if (window.parent && window.parent !== window) targets.push(window.parent);
  if (window.top && window.top !== window && !targets.includes(window.top)) targets.push(window.top);
  if (!targets.length) {
    return { ok: false, reason: 'no parent/top window available for bridge fallback' };
  }

  let sent = 0;
  const errors = [];
  for (const target of targets) {
    const targetOrigin = getVoiceToRowanBridgeTargetOrigin(target);
    if (!targetOrigin) {
      errors.push('could not determine safe target origin');
      continue;
    }
    try {
      target.postMessage(payload, targetOrigin);
      sent += 1;
    } catch (err) {
      errors.push(String(err?.message || err));
    }
  }

  if (sent > 0) {
    return { ok: true, transport: sent > 1 ? 'postMessage(parent/top)' : 'postMessage(parent)' };
  }

  return {
    ok: false,
    reason: errors[0] || 'bridge postMessage failed',
  };
}

function showVoiceToRowanFallbackTools(show){
  const toolsEl = document.getElementById('voiceToRowanFallbackTools');
  if (!toolsEl) return;
  toolsEl.classList.toggle('is-hidden', !show);
}

async function sendVoiceToRowanMessage(text){
  let relayResponse = null;
  let relayPayload = null;
  let relayError = null;

  try {
    relayResponse = await fetch('/api/rowan-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    try {
      relayPayload = await relayResponse.json();
    } catch {}

    if (relayResponse.ok && relayPayload?.ok) {
      return { transport: relayPayload.transport || 'rowan-relay' };
    }
  } catch (err) {
    relayError = err;
  }

  if (typeof window.sendMissionControlChatMessage === 'function') {
    await window.sendMissionControlChatMessage(text);
    return { transport: 'window.sendMissionControlChatMessage (fallback)' };
  }

  if (typeof window.sendRowanChatMessage === 'function') {
    await window.sendRowanChatMessage(text);
    return { transport: 'window.sendRowanChatMessage (fallback)' };
  }

  const bridge = sendVoiceToRowanViaParentBridge(text);
  if (bridge.ok) {
    return { transport: `${bridge.transport} (fallback)` };
  }

  const reason = relayPayload?.message
    || relayPayload?.error
    || (relayResponse ? `HTTP ${relayResponse.status}` : '')
    || String(relayError?.message || '')
    || bridge.reason
    || 'relay unavailable';
  const err = new Error(`Rowan relay unavailable (${reason}).`);
  err.code = relayPayload?.error === 'relay_not_configured' ? 'ROWAN_RELAY_NOT_CONFIGURED' : 'ROWAN_BRIDGE_UNAVAILABLE';
  throw err;
}

function ensureVoiceToRowanRecognizer(){
  if (voiceToRowanRecognizer || !voiceToRowanSupported) return voiceToRowanRecognizer;
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();
  if (!SpeechRecognitionCtor) return null;

  const recognizer = new SpeechRecognitionCtor();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = 'en-US';

  recognizer.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) {
        voiceToRowanFinalTranscript += `${text} `;
      } else {
        interim += `${text} `;
      }
    }
    const live = `${voiceToRowanFinalTranscript} ${interim}`.trim();
    setVoiceToRowanDraftValue(live);
    setVoiceToRowanStatus(live ? 'Listening… edit draft any time before send.' : 'Listening… speak now.');
  };

  recognizer.onerror = (event) => {
    const err = event?.error || 'unknown';
    voiceToRowanLastError = err;
    if (err === 'not-allowed') {
      setVoiceToRowanStatus('Microphone permission denied. Allow mic access and try again.');
      return;
    }
    if (err === 'no-speech') {
      setVoiceToRowanStatus('Listening… no speech detected yet. Keep talking or stop when ready.');
      return;
    }
    setVoiceToRowanStatus(`Voice input error: ${err}.`);
  };

  recognizer.onend = () => {
    const wasListening = voiceToRowanListening;
    voiceToRowanListening = false;
    const startBtn = document.getElementById('voiceToRowanStartBtn');
    const stopBtn = document.getElementById('voiceToRowanStopBtn');
    if (startBtn) startBtn.disabled = !voiceToRowanSupported;
    if (stopBtn) stopBtn.disabled = true;

    if (!wasListening) return;

    const hasDraft = !!String(voiceToRowanDraft || '').trim();
    if (!hasDraft && voiceToRowanLastError && voiceToRowanLastError !== 'no-speech') {
      voiceToRowanManualStop = false;
      setVoiceToRowanStatus(`Voice input error: ${voiceToRowanLastError}. Try Chrome/Edge on localhost and verify mic device.`);
      return;
    }

    voiceToRowanManualStop = false;
    if (hasDraft) {
      setVoiceToRowanStatus('Draft ready. Edit if needed, then press Send.');
      return;
    }
    setVoiceToRowanStatus('No speech captured. Try again and speak clearly.');
  };

  voiceToRowanRecognizer = recognizer;
  return voiceToRowanRecognizer;
}

function renderVoiceToRowanPod(){
  const el = document.getElementById('voiceToRowanWidget');
  if (!el) return;

  voiceToRowanSupported = !!getSpeechRecognitionCtor();
  el.innerHTML = `
    <div class="row-wrap">
      <button id="voiceToRowanStartBtn" class="btn" ${voiceToRowanSupported && !voiceToRowanListening ? '' : 'disabled'}>Start</button>
      <button id="voiceToRowanStopBtn" class="btn ghost" ${voiceToRowanListening ? '' : 'disabled'}>Stop</button>
    </div>
    <textarea id="voiceToRowanTranscript" class="mt6 voice-to-rowan-transcript" rows="4" placeholder="Transcript preview... edit before sending.">${escapeHtml(voiceToRowanDraft)}</textarea>
    <div class="row-wrap mt6">
      <button id="voiceToRowanSendBtn" class="btn">Send</button>
      <button id="voiceToRowanClearBtn" class="btn ghost">Clear</button>
    </div>
    <div id="voiceToRowanFallbackTools" class="row-wrap mt6 is-hidden">
      <button id="voiceToRowanCopyBtn" class="btn ghost">Copy draft</button>
      <a id="voiceToRowanOpenChatLink" class="btn ghost" href="#chat" title="Open host chat">Open chat</a>
    </div>
    <div class="note-meta mt6">${voiceToRowanSupported ? 'Manual send only. Nothing is auto-sent.' : 'Voice transcription is not supported in this browser.'}</div>
  `;

  if (!voiceToRowanSupported) {
    setVoiceToRowanStatus('SpeechRecognition unsupported. Try Chrome/Edge on HTTPS or localhost.');
  } else if (!voiceToRowanListening && !String(voiceToRowanDraft || '').trim()) {
    setVoiceToRowanStatus('Ready. Start listening, then send manually.');
  }

  document.getElementById('voiceToRowanTranscript')?.addEventListener('input', (event) => {
    voiceToRowanDraft = event.target.value;
    if (String(voiceToRowanDraft || '').trim()) {
      showVoiceToRowanFallbackTools(false);
    }
  });

  document.getElementById('voiceToRowanCopyBtn')?.addEventListener('click', async () => {
    const body = String(voiceToRowanDraft || '').trim();
    if (!body) {
      setVoiceToRowanStatus('Nothing to copy yet. Record or type a message first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(body);
      setVoiceToRowanStatus('Draft copied. Paste it in Rowan chat.');
    } catch {
      setVoiceToRowanStatus('Copy failed. Select the draft text and copy manually.');
    }
  });

  document.getElementById('voiceToRowanOpenChatLink')?.addEventListener('click', () => {
    setVoiceToRowanStatus('Use your host app chat panel/tab, then paste from clipboard if needed.');
  });

  document.getElementById('voiceToRowanStartBtn')?.addEventListener('click', () => {
    const recognizer = ensureVoiceToRowanRecognizer();
    if (!recognizer || voiceToRowanListening) return;
    voiceToRowanFinalTranscript = '';
    voiceToRowanLastError = '';
    voiceToRowanManualStop = false;
    setVoiceToRowanDraftValue('');
    showVoiceToRowanFallbackTools(false);
    voiceToRowanListening = true;
    setVoiceToRowanStatus('Listening… speak now.');
    document.getElementById('voiceToRowanStartBtn').disabled = true;
    document.getElementById('voiceToRowanStopBtn').disabled = false;
    try {
      recognizer.start();
    } catch {
      voiceToRowanListening = false;
      document.getElementById('voiceToRowanStartBtn').disabled = false;
      document.getElementById('voiceToRowanStopBtn').disabled = true;
      setVoiceToRowanStatus('Could not start voice capture. Try again.');
    }
  });

  document.getElementById('voiceToRowanStopBtn')?.addEventListener('click', () => {
    if (!voiceToRowanRecognizer || !voiceToRowanListening) return;
    voiceToRowanManualStop = true;
    setVoiceToRowanStatus('Stopping…');
    try {
      voiceToRowanRecognizer.stop();
    } catch {}
  });

  document.getElementById('voiceToRowanClearBtn')?.addEventListener('click', () => {
    setVoiceToRowanDraftValue('');
    voiceToRowanFinalTranscript = '';
    voiceToRowanLastError = '';
    showVoiceToRowanFallbackTools(false);
    setVoiceToRowanStatus('Draft cleared.');
  });

  document.getElementById('voiceToRowanSendBtn')?.addEventListener('click', async () => {
    const body = String(voiceToRowanDraft || '').trim();
    if (!body) {
      setVoiceToRowanStatus('Draft is empty. Record or type a message first.');
      return;
    }

    const sendBtn = document.getElementById('voiceToRowanSendBtn');
    const clearBtn = document.getElementById('voiceToRowanClearBtn');
    if (sendBtn) sendBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;
    setVoiceToRowanStatus('Sending message to Rowan…');

    try {
      const result = await sendVoiceToRowanMessage(body);
      setVoiceToRowanDraftValue('');
      voiceToRowanFinalTranscript = '';
      voiceToRowanLastError = '';
      showVoiceToRowanFallbackTools(false);
      setVoiceToRowanStatus(`Sent to Rowan chat via ${result.transport}.`);
    } catch (err) {
      if (err?.code === 'ROWAN_BRIDGE_UNAVAILABLE' || err?.code === 'ROWAN_RELAY_NOT_CONFIGURED') {
        showVoiceToRowanFallbackTools(true);
        if (err?.code === 'ROWAN_RELAY_NOT_CONFIGURED') {
          setVoiceToRowanStatus('Relay is not configured on this server. Draft preserved — use Copy draft, then paste into chat.');
        } else {
          setVoiceToRowanStatus(`Relay send failed. Draft preserved — ${String(err?.message || err)}. Use Copy draft as fallback.`);
        }
      } else {
        setVoiceToRowanStatus(`Could not send: ${String(err?.message || err)}. Draft preserved.`);
      }
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (clearBtn) clearBtn.disabled = false;
    }
  });
}

window.onYouTubeIframeAPIReady = function(){
  youtubeApiLoading = false;
  initYouTubePlayerIfReady();
};

function formatRateBytesPerSec(value){
  return systemMonitorStateFeature.formatRateBytesPerSec(value);
}

function formatSystemMonitorUptime(seconds){
  return systemMonitorStateFeature.formatUptime(seconds);
}

function classifySysMonSeverity(percent){
  return systemMonitorStateFeature.classifySeverity(percent);
}

function applySystemMonitorAllowlistPreset(preset){
  const next = systemMonitorStateFeature.getPresetAllowlist(preset);
  if (!next.length) return;
  state.systemMonitor.allowlist = next;
  save(`system_monitor_allowlist_preset_${preset}`);
  fetchSystemMonitorSnapshot();
}

function renderProcessList(items = [], mode = 'cpu'){
  if (!Array.isArray(items) || !items.length) {
    return `
      <div class="sysmon-process-empty">
        <strong>No process data.</strong>
        <span>Nothing useful was returned in this sample.</span>
      </div>
    `;
  }
  return items.slice(0, 3).map((proc) => {
    const primary = mode === 'cpu' ? `${Number(proc.cpuPercent || 0).toFixed(1)}% CPU` : `${Number(proc.memPercent || 0).toFixed(1)}% RAM`;
    const secondary = mode === 'cpu' ? `${Number(proc.memPercent || 0).toFixed(1)}% RAM` : `${Number(proc.cpuPercent || 0).toFixed(1)}% CPU`;
    return `
      <div class="sysmon-process-card">
        <div class="sysmon-process-card-head">
          <span class="sysmon-process-name">${escapeHtml(proc.name || 'unknown')}</span>
          <span class="sysmon-process-chip">#${Number(proc.pid || 0)}</span>
        </div>
        <div class="sysmon-process-usage">
          <strong>${primary}</strong>
          <small>${secondary}</small>
        </div>
      </div>
    `;
  }).join('');
}

function stopSystemMonitorPolling(){
  if (systemMonitorTimer) {
    clearInterval(systemMonitorTimer);
    systemMonitorTimer = null;
  }
}

async function fetchSystemMonitorSnapshot(){
  if (systemMonitorInFlight) return;
  const visible = state.layout?.visibility?.['system-resource-monitor'] !== false;
  const cardVisible = !!document.querySelector('[data-pod-id="system-resource-monitor"]:not(.is-hidden)');
  if (!visible || !cardVisible) return;

  systemMonitorInFlight = true;
  try {
    const allowlist = (state.systemMonitor?.allowlist || []).join(',');
    const res = await fetch(`/api/system-resources?allowlist=${encodeURIComponent(allowlist)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload?.ok) throw new Error(String(payload?.message || payload?.error || 'System monitor unavailable'));
    systemMonitorLastPayload = payload;
    systemMonitorLastUpdatedAt = payload.sampledAt || now();
    systemMonitorLastError = '';
    setPodStatusSignal('system-resource-monitor', 'fresh', 'Live');
    clearPollingBackoff('system-resource-monitor');
  } catch (error) {
    const reason = String(error?.message || error || 'Unable to fetch system monitor').slice(0, 180);
    systemMonitorLastError = reason;
    const backoffMs = registerPollingFailure('system-resource-monitor', error, reason);
    setPodStatusSignal('system-resource-monitor', 'stale', `Stale (${Math.ceil(backoffMs / 1000)}s)`);
  } finally {
    systemMonitorInFlight = false;
    renderSystemResourceMonitorPod();
  }
}

function startSystemMonitorPolling(){
  stopSystemMonitorPolling();
  systemMonitorTimer = setInterval(() => {
    const backoff = pollingBackoffState('system-resource-monitor').backoffUntil - Date.now();
    if (backoff > 0) return;
    fetchSystemMonitorSnapshot();
  }, 3000);
}

function renderSystemResourceMonitorPod(){
  const el = document.getElementById('systemResourceMonitorWidget');
  const meta = document.getElementById('systemResourceMonitorMeta');
  if (!el) return;

  const payload = systemMonitorLastPayload;
  const host = payload?.host || {};
  const processes = payload?.processes || {};
  const stale = !!systemMonitorLastError;
  const lastLabel = systemMonitorLastUpdatedAt ? new Date(systemMonitorLastUpdatedAt).toLocaleTimeString() : 'Never';

  const allowlistText = (state.systemMonitor?.allowlist || []).join(', ');
  const hotProcess = Array.isArray(processes.topCpu) && processes.topCpu.length ? processes.topCpu[0] : null;
  const cpuSeverity = classifySysMonSeverity(host.cpuPercent);
  const memorySeverity = classifySysMonSeverity(host.memoryPercent);
  const diskSeverity = classifySysMonSeverity(host.diskPercent);
  const topSeverity = [cpuSeverity, memorySeverity, diskSeverity].includes('danger')
    ? 'danger'
    : ([cpuSeverity, memorySeverity, diskSeverity].includes('warn') ? 'warn' : 'good');
  const healthLabel = topSeverity === 'danger' ? 'High load' : topSeverity === 'warn' ? 'Watch load' : 'Healthy';
  const activeAllowlist = state.systemMonitor?.allowlist || [];
  const scannedCount = Number(processes.scanned || 0);
  const allowlistMatchCount = Array.isArray(processes.allowlistMatches) ? processes.allowlistMatches.length : 0;
  const uptimeLabel = formatSystemMonitorUptime(host.uptimeSec);
  const presetState = systemMonitorStateFeature.getPresetState(activeAllowlist);

  el.innerHTML = `
    <div class="system-monitor-shell" data-pod="system-resource-monitor">
      <div class="sysmon-hero sysmon-hero--${topSeverity}">
        <div class="sysmon-hero-main">
          <div class="sysmon-hero-kicker">Live Host Snapshot</div>
          <div class="sysmon-hero-title">${healthLabel}</div>
          <div class="sysmon-hero-meta">
            <span>Uptime ${uptimeLabel}</span>
            <span>${scannedCount} processes scanned</span>
            <span>${allowlistMatchCount} allowlist matches</span>
          </div>
        </div>
        <div class="sysmon-hero-side">
          ${hotProcess ? `
            <div class="sysmon-hot-card" title="Highest current CPU process">
              <span class="sysmon-hot-card-label">Hottest process</span>
              <strong>${escapeHtml(hotProcess.name || 'unknown')}</strong>
              <span>#${Number(hotProcess.pid || 0)} · ${Number(hotProcess.cpuPercent || 0).toFixed(1)}% CPU</span>
            </div>
          ` : `
            <div class="sysmon-hot-card sysmon-hot-card--quiet">
              <span class="sysmon-hot-card-label">Hottest process</span>
              <strong>Unavailable</strong>
              <span>No process spotlight in this sample</span>
            </div>
          `}
        </div>
      </div>

      <div class="sysmon-metrics-grid">
        <div class="sysmon-metric sysmon-metric--${cpuSeverity}">
          <span>CPU</span>
          <strong>${Number.isFinite(host.cpuPercent) ? host.cpuPercent.toFixed(1) : '—'}%</strong>
          <small>${cpuSeverity === 'danger' ? 'Machine is running hot' : cpuSeverity === 'warn' ? 'Worth watching' : 'Comfortable load'}</small>
        </div>
        <div class="sysmon-metric sysmon-metric--${memorySeverity}">
          <span>RAM</span>
          <strong>${Number.isFinite(host.memoryPercent) ? host.memoryPercent.toFixed(1) : '—'}%</strong>
          <small>${memorySeverity === 'danger' ? 'Memory pressure is high' : memorySeverity === 'warn' ? 'Moderate pressure' : 'Healthy headroom'}</small>
        </div>
        <div class="sysmon-metric sysmon-metric--${diskSeverity}">
          <span>Disk</span>
          <strong>${Number.isFinite(host.diskPercent) ? host.diskPercent.toFixed(1) : '—'}%</strong>
          <small>${diskSeverity === 'danger' ? 'Storage is nearly stressed' : diskSeverity === 'warn' ? 'Storage trend worth checking' : 'Storage looks calm'}</small>
        </div>
        <div class="sysmon-metric sysmon-metric--neutral">
          <span>Net</span>
          <strong>↓ ${formatRateBytesPerSec(host.network?.downBytesPerSec)}</strong>
          <small>↑ ${formatRateBytesPerSec(host.network?.upBytesPerSec)}</small>
        </div>
      </div>

      <div class="sysmon-scope-card">
        <div class="sysmon-scope-head">
          <div>
            <div class="sysmon-scope-kicker">Monitor Scope</div>
            <strong>${activeAllowlist.length ? `${activeAllowlist.length} names in focus` : 'Default monitor scope'}</strong>
          </div>
          <div class="sysmon-scope-pills">
            ${activeAllowlist.slice(0, 5).map((name) => `<span class="sysmon-scope-pill">${escapeHtml(name)}</span>`).join('') || '<span class="sysmon-scope-pill">node</span><span class="sysmon-scope-pill">chrome</span>'}
            ${activeAllowlist.length > 5 ? `<span class="sysmon-scope-pill">+${activeAllowlist.length - 5} more</span>` : ''}
          </div>
        </div>
        <div class="sysmon-scope-meta">Matches in current sample: ${(processes.allowlistMatches || []).map((p) => `${p.name}#${p.pid}`).join(', ') || 'none in current sample'}</div>
      </div>

      <div class="sysmon-grid-two">
        <section class="sysmon-panel">
          <div class="sysmon-panel-head">
            <div class="sysmon-panel-kicker">Process Heat</div>
            <strong>Top CPU</strong>
          </div>
          <div class="sysmon-process-grid">${renderProcessList(processes.topCpu, 'cpu')}</div>
        </section>
        <section class="sysmon-panel">
          <div class="sysmon-panel-head">
            <div class="sysmon-panel-kicker">Memory Pressure</div>
            <strong>Top RAM</strong>
          </div>
          <div class="sysmon-process-grid">${renderProcessList(processes.topMemory, 'ram')}</div>
        </section>
      </div>

      <div class="sysmon-controls-row">
        <button type="button" class="btn ghost" id="sysMonToggleSettingsBtn">${state.systemMonitor?.settingsOpen ? 'Hide' : 'Edit'} Allowlist</button>
        <button type="button" class="btn ghost" id="sysMonRefreshBtn">Refresh</button>
      </div>

      ${state.systemMonitor?.settingsOpen ? `
        <div class="sysmon-settings mt8">
          <label class="note-meta" for="sysMonAllowlistInput">Allowlist (comma-separated process names)</label>
          <input id="sysMonAllowlistInput" value="${escapeHtml(allowlistText)}" placeholder="node, chrome, code" />
          <div class="row-wrap mt6">
            <button type="button" class="btn" id="sysMonSaveAllowlistBtn">Save</button>
            <span class="note-meta">Default: node, chrome, openclaw, code, python</span>
          </div>
          <div class="row-wrap mt6">
            <span class="note-meta">Presets:</span>
            <button type="button" class="btn ghost btn-xs ${presetState.dev ? 'is-active' : ''}" data-sysmon-preset="dev">Dev</button>
            <button type="button" class="btn ghost btn-xs ${presetState.media ? 'is-active' : ''}" data-sysmon-preset="media">Media</button>
            <button type="button" class="btn ghost btn-xs ${presetState.minimal ? 'is-active' : ''}" data-sysmon-preset="minimal">Minimal</button>
          </div>
          <div class="note-meta mt6">Matches: ${(processes.allowlistMatches || []).map((p) => `${p.name}#${p.pid}`).join(', ') || 'none in current sample'}</div>
        </div>
      ` : ''}
    </div>
  `;

  if (meta) {
    meta.textContent = stale
      ? `Showing last known data (${lastLabel}). Latest error: ${systemMonitorLastError}`
      : `Live sample updated at ${lastLabel}. Refreshes every 3s.`;
  }

  document.getElementById('sysMonToggleSettingsBtn')?.addEventListener('click', () => {
    state.systemMonitor.settingsOpen = !state.systemMonitor.settingsOpen;
    save('system_monitor_toggle_settings');
    renderSystemResourceMonitorPod();
  });
  document.getElementById('sysMonRefreshBtn')?.addEventListener('click', () => fetchSystemMonitorSnapshot());
  document.getElementById('sysMonSaveAllowlistBtn')?.addEventListener('click', () => {
    const raw = String(document.getElementById('sysMonAllowlistInput')?.value || '');
    const next = [...new Set(raw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
    state.systemMonitor.allowlist = next.length ? next : ['node', 'chrome', 'openclaw', 'code', 'python'];
    save('system_monitor_allowlist_saved');
    fetchSystemMonitorSnapshot();
  });
  el.querySelectorAll('[data-sysmon-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = String(btn.getAttribute('data-sysmon-preset') || '').trim().toLowerCase();
      applySystemMonitorAllowlistPreset(preset);
      renderSystemResourceMonitorPod();
    });
  });
}

function getLatestSpeedTestResult(){
  return speedTestStateFeature.getLatestResult(state.speedTest?.history);
}

function speedTestHasWarning(result){
  return speedTestStateFeature.hasWarning(result, state.speedTest?.warningThresholds);
}

async function estimateBrowserSpeedFallback(note = ''){
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const downlink = Number(conn?.downlink);
  const rtt = Number(conn?.rtt);
  const pingMs = Number.isFinite(rtt) && rtt > 0 ? Math.round(rtt) : null;
  const downloadMbps = Number.isFinite(downlink) && downlink > 0 ? Number(downlink.toFixed(1)) : null;
  const uploadMbps = Number.isFinite(downlink) && downlink > 0 ? Number(Math.max(0.5, downlink * 0.35).toFixed(1)) : null;

  return {
    id: id(),
    ts: now(),
    pingMs,
    downloadMbps,
    uploadMbps,
    source: 'browser-estimate',
    backendTool: '',
    note: note || 'Fallback estimate based on browser Network Information API.',
  };
}

function stopSpeedTestAutoRun(){
  if (speedTestAutoTimer) {
    clearInterval(speedTestAutoTimer);
    speedTestAutoTimer = null;
  }
}

function startSpeedTestAutoRun(){
  stopSpeedTestAutoRun();
  const intervalMin = Number(state.speedTest?.autoIntervalMin || 0);
  if (!intervalMin) return;
  if (state.layout?.visibility?.['speed-test'] === false) return;
  if (document.hidden) return;
  speedTestAutoTimer = setInterval(() => {
    if (document.hidden) return;
    if (state.layout?.visibility?.['speed-test'] === false) return;
    runSpeedTest({ reason: 'auto_interval' });
  }, intervalMin * 60 * 1000);
}

async function runSpeedTest({ reason = 'manual' } = {}){
  if (speedTestInFlight) return;
  speedTestInFlight = true;
  state.speedTest.running = true;
  renderSpeedTestPod();
  renderHomeDeviceControlPod();

  try {
    const res = await fetch('/api/speed-test', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    let entry;

    if (payload?.ok && payload?.mode === 'backend') {
      entry = {
        id: id(),
        ts: payload.sampledAt || now(),
        pingMs: Number.isFinite(Number(payload.metrics?.pingMs)) ? Number(payload.metrics.pingMs) : null,
        downloadMbps: Number.isFinite(Number(payload.metrics?.downloadMbps)) ? Number(payload.metrics.downloadMbps) : null,
        uploadMbps: Number.isFinite(Number(payload.metrics?.uploadMbps)) ? Number(payload.metrics.uploadMbps) : null,
        source: 'backend-speedtest',
        backendTool: String(payload.backendTool || ''),
        note: '',
      };
      clearPollingBackoff('speed-test');
    } else {
      entry = await estimateBrowserSpeedFallback(String(payload?.message || payload?.reason || 'Backend speed test unavailable.'));
      const backoffMs = registerPollingFailure('speed-test', new Error(payload?.reason || 'backend_unavailable'), 'Backend unavailable; using browser estimate.');
      setPodStatusSignal('speed-test', 'stale', `Fallback (${Math.ceil(backoffMs / 1000)}s)`);
    }

    state.speedTest.history = [entry, ...(state.speedTest.history || [])].slice(0, 10);
    state.speedTest.lastError = '';

    if (speedTestHasWarning(entry)) {
      setPodStatusSignal('speed-test', 'degraded', 'Below threshold');
    } else {
      setPodStatusSignal('speed-test', 'fresh', entry.source === 'backend-speedtest' ? 'Backend' : 'Estimate');
    }

    save(`speed_test_${reason}`);
  } catch (error) {
    const reasonText = String(error?.message || error || 'Speed test failed').slice(0, 180);
    state.speedTest.lastError = reasonText;
    const backoffMs = registerPollingFailure('speed-test', error, reasonText);
    setPodStatusSignal('speed-test', 'error', `Retry in ${Math.ceil(backoffMs / 1000)}s`);
    save('speed_test_failed');
  } finally {
    state.speedTest.running = false;
    speedTestInFlight = false;
    renderSpeedTestPod();
  }
}

function formatSpeedMetric(value, unit){
  return speedTestStateFeature.formatMetric(value, unit);
}

function renderSpeedTestPod(){
  const el = document.getElementById('speedTestWidget');
  const meta = document.getElementById('speedTestMeta');
  if (!el) return;

  const latest = getLatestSpeedTestResult();
  const warning = speedTestHasWarning(latest);
  const history = Array.isArray(state.speedTest?.history) ? state.speedTest.history.slice(0, 10) : [];
  const thresholds = state.speedTest?.warningThresholds || {};

  el.innerHTML = `
    <div class="speed-test-shell" data-pod="speed-test">
      <div class="row-between-wrap">
        <div class="speed-test-metrics">
          <div class="speed-metric"><span>Ping</span><strong>${formatSpeedMetric(latest?.pingMs, 'ms')}</strong></div>
          <div class="speed-metric"><span>Down</span><strong>${formatSpeedMetric(latest?.downloadMbps, 'Mbps')}</strong></div>
          <div class="speed-metric"><span>Up</span><strong>${formatSpeedMetric(latest?.uploadMbps, 'Mbps')}</strong></div>
        </div>
      </div>

      ${warning ? '<div class="speed-test-warning">⚠️ Connection below threshold.</div>' : ''}

      <div class="row-wrap">
        <button type="button" class="btn ghost" id="speedTestRunBtn" ${state.speedTest?.running ? 'disabled' : ''}>${state.speedTest?.running ? 'Running…' : 'Run now'}</button>
        <label class="camera-feed-inline-label">Auto
          <select id="speedTestIntervalSelect" class="w-auto">
            <option value="0" ${Number(state.speedTest?.autoIntervalMin || 0) === 0 ? 'selected' : ''}>Off</option>
            <option value="15" ${Number(state.speedTest?.autoIntervalMin || 0) === 15 ? 'selected' : ''}>15m</option>
            <option value="30" ${Number(state.speedTest?.autoIntervalMin || 0) === 30 ? 'selected' : ''}>30m</option>
            <option value="60" ${Number(state.speedTest?.autoIntervalMin || 0) === 60 ? 'selected' : ''}>1h</option>
          </select>
        </label>
      </div>

      <div class="speed-threshold-grid">
        <label class="camera-feed-inline-label">Max Ping <input id="speedWarnPing" type="number" min="1" max="2000" value="${Number(thresholds.pingMs || 100)}" class="w-110" /></label>
        <label class="camera-feed-inline-label">Min Down <input id="speedWarnDown" type="number" min="1" max="10000" value="${Number(thresholds.downloadMbps || 100)}" class="w-110" /></label>
        <label class="camera-feed-inline-label">Min Up <input id="speedWarnUp" type="number" min="1" max="5000" value="${Number(thresholds.uploadMbps || 20)}" class="w-110" /></label>
      </div>

      <div class="speed-history-list">
        ${(history.length ? history : [{ id: 'empty', ts: '', source: '', pingMs: null, downloadMbps: null, uploadMbps: null, note: 'No runs yet.' }]).map((run) => `
          <div class="speed-history-item">
            <div><strong>${run.ts ? new Date(run.ts).toLocaleTimeString() : '—'}</strong> · ${escapeHtml(run.source || 'n/a')} ${run.backendTool ? `(${escapeHtml(run.backendTool)})` : ''}</div>
            <div class="note-meta">P ${formatSpeedMetric(run.pingMs, 'ms')} · D ${formatSpeedMetric(run.downloadMbps, 'Mbps')} · U ${formatSpeedMetric(run.uploadMbps, 'Mbps')}</div>
            ${run.note ? `<div class="note-meta">${escapeHtml(run.note)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  if (meta) {
    const latestText = latest?.ts ? new Date(latest.ts).toLocaleString() : 'Never';
    const sourceText = latest?.source ? ` · ${latest.source}` : '';
    meta.textContent = state.speedTest?.lastError
      ? `Last error: ${state.speedTest.lastError}`
      : `Last run: ${latestText}${sourceText}`;
  }

  document.getElementById('speedTestRunBtn')?.addEventListener('click', () => runSpeedTest({ reason: 'manual' }));
  document.getElementById('speedTestIntervalSelect')?.addEventListener('change', (e) => {
    state.speedTest.autoIntervalMin = speedTestStateFeature.normalizeInterval(e.target.value);
    save('speed_test_interval_changed');
    startSpeedTestAutoRun();
  });

  ['speedWarnPing', 'speedWarnDown', 'speedWarnUp'].forEach((idKey) => {
    document.getElementById(idKey)?.addEventListener('change', () => {
      const ping = Number(document.getElementById('speedWarnPing')?.value || 100);
      const down = Number(document.getElementById('speedWarnDown')?.value || 100);
      const up = Number(document.getElementById('speedWarnUp')?.value || 20);
      state.speedTest.warningThresholds = speedTestStateFeature.normalizeThresholds({
        pingMs: ping,
        downloadMbps: down,
        uploadMbps: up,
      });
      save('speed_test_thresholds_updated');
      renderSpeedTestPod();
    });
  });
}

function getPodRegistry(){
  return window.MissionControlModules?.podRegistry || null;
}

function invokeLegacyRenderSafe(legacyRender){
  if (typeof legacyRender !== 'function') return;
  try {
    const out = legacyRender();
    if (out && typeof out.then === 'function') out.catch(() => {});
  } catch {}
}

function runPodLifecycleAction(action, podId, legacyRender, extraCtx = {}){
  const registry = getPodRegistry();
  const invoke = registry && typeof registry[action] === 'function' ? registry[action].bind(registry) : null;
  if (!invoke) {
    if (action === 'mount' || action === 'refresh' || action === 'render') {
      invokeLegacyRenderSafe(legacyRender);
      return { ok: true, reason: 'legacy_fallback' };
    }
    return { ok: true, reason: 'no_registry' };
  }

  const result = invoke(podId, { state, legacyRender, ...extraCtx });
  if (result?.ok) return result;

  if (action === 'mount' || action === 'refresh' || action === 'render') {
    invokeLegacyRenderSafe(legacyRender);
    return { ok: true, reason: 'legacy_fallback' };
  }

  return result;
}

function renderPodWithFallback(podId, legacyRender){
  return runPodLifecycleAction('mount', podId, legacyRender);
}

function renderWeatherPod(options = {}){
  if (options.manual) debugCounters?.bumpRefresh?.('weather', 'manual_refresh');
  renderPodWithFallback('weather', () => renderWeather(options));
}

function renderNbaPod(options = {}){
  if (options.manual) debugCounters?.bumpRefresh?.('nba-scores', 'manual_refresh');
  renderPodWithFallback('nba-scores', () => renderNbaScores(options));
}

function renderCryptoPod(options = {}){
  if (options.manual) debugCounters?.bumpRefresh?.('crypto-tracker', 'manual_refresh');
  renderPodWithFallback('crypto-tracker', () => renderCrypto(options));
}

function renderRssPod(options = {}){
  if (options.manual) debugCounters?.bumpRefresh?.('rss-feed', 'manual_refresh');
  renderPodWithFallback('rss-feed', () => renderRss(options));
}

function getUtilityPodLegacyRenderer(podId){
  if (podId === 'weather') return () => renderWeather();
  if (podId === 'gas-prices') return () => renderGasPricesView();
  if (podId === 'nba-scores') return () => renderNbaScores();
  if (podId === 'crypto-tracker') return () => renderCrypto();
  if (podId === MERGED_SOCIAL_FOLLOWERS_POD_ID) return () => renderSocialFollowersPod();
  if (podId === 'ebay-traffic') return () => renderEbayTrafficPod();
  if (podId === MERGED_VOICE_POD_ID) return () => renderVoiceDeskPod();
  if (podId === 'facebook-followers') return () => renderFacebookFollowersPod();
  if (podId === 'instagram-followers') return () => renderInstagramFollowersPod();
  if (podId === 'tiktok-followers') return () => renderTikTokFollowersPod();
  if (podId === 'youtube-subscribers') return () => renderYouTubeSubscribersPod();
  if (podId === 'rss-feed') return () => renderRss();
  if (podId === 'unread-email') return () => renderUnreadEmailPod();
  if (podId === 'everyday-calculator') return () => renderEverydayCalculatorPod();
  if (podId === 'system-resource-monitor') return () => renderSystemResourceMonitorPod();
  if (podId === 'speed-test') return () => renderSpeedTestPod();
  if (podId === 'home-device-control') return () => renderHomeDeviceControlPod();
  return null;
}

function syncUtilityPodLifecycle(){
  const managed = ['weather', 'gas-prices', 'nba-scores', 'crypto-tracker', MERGED_SOCIAL_FOLLOWERS_POD_ID, 'facebook-followers', 'instagram-followers', 'tiktok-followers', 'youtube-subscribers', 'ebay-traffic', 'speed-test', 'rss-feed', 'unread-email', 'everyday-calculator', 'system-resource-monitor', 'home-device-control'];
  managed.forEach((podId) => {
    const visible = state.layout?.visibility?.[podId] !== false;
    const legacyRender = getUtilityPodLegacyRenderer(podId);
    if (visible) {
      runPodLifecycleAction('mount', podId, legacyRender, { visible: true, trigger: 'layout_sync' });
      if (podId === 'system-resource-monitor') startSystemMonitorPolling();
      if (podId === 'speed-test') startSpeedTestAutoRun();
    } else {
      runPodLifecycleAction('destroy', podId, legacyRender, { visible: false, trigger: 'layout_sync' });
      if (podId === 'system-resource-monitor') stopSystemMonitorPolling();
      if (podId === 'speed-test') stopSpeedTestAutoRun();
    }
  });
}

function getUtilityPodCards(){
  return [...document.querySelectorAll('[data-pod-id]')];
}

function getUtilityPodTitle(podId){
  const el = document.querySelector(`[data-pod-id="${podId}"] h2`);
  return String(el?.textContent || podId).trim();
}

function ensureLayoutIncludesKnownPods(){
  const knownIds = getUtilityPodCards().map((el) => String(el.dataset.podId || '').trim()).filter(Boolean);
  state.layout = normalizeUtilityLayoutState(state.layout, knownIds);
}

function applyUtilityLayoutToDom(){
  const rows = [...document.querySelectorAll('[data-layout-row]')];
  if (!rows.length) return;

  ensureLayoutIncludesKnownPods();

  const cardMap = new Map(getUtilityPodCards().map((el) => [String(el.dataset.podId || '').trim(), el]));
  const normalizedRows = state.layout.utilityRows;

  rows.forEach((rowEl, index) => {
    const ordered = normalizedRows[index] || [];
    const frag = document.createDocumentFragment();
    ordered.forEach((podId) => {
      const card = cardMap.get(podId);
      if (!card) return;
      frag.appendChild(card);
      cardMap.delete(podId);
    });

    if (index === rows.length - 1) {
      for (const card of [...cardMap.values()]) {
        frag.appendChild(card);
        cardMap.delete(String(card.dataset.podId || '').trim());
      }
    }

    rowEl.appendChild(frag);
  });

  getUtilityPodCards().forEach((card) => {
    const podId = String(card.dataset.podId || '').trim();
    const visible = state.layout.visibility?.[podId] !== false;
    card.classList.toggle('is-hidden', !visible);
    card.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });

  syncUtilityPodLifecycle();
}

function renderPodVisibilitySettings(){
  const wrap = document.getElementById('settingsPodVisibilityList');
  if (!wrap) return;

  ensureLayoutIncludesKnownPods();
  const rows = state.layout.utilityRows;
  wrap.innerHTML = rows.map((row, rowIndex) => {
    const items = row.map((podId, podIndex) => {
      const checked = state.layout.visibility?.[podId] !== false ? 'checked' : '';
      const upDisabled = podIndex === 0 ? 'disabled' : '';
      const downDisabled = podIndex === row.length - 1 ? 'disabled' : '';
      return `
        <div class="pod-toggle-row" draggable="true" data-dnd-pod-row="${rowIndex}" data-dnd-pod-index="${podIndex}" data-dnd-pod-id="${escapeHtml(podId)}">
          <label>
            <input type="checkbox" data-pod-visibility="${escapeHtml(podId)}" ${checked} />
            ${escapeHtml(getUtilityPodTitle(podId))}
            <div class="pod-toggle-meta">${escapeHtml(podId)} · Row ${rowIndex + 1}</div>
          </label>
          <div class="pod-toggle-actions">
            <button type="button" class="btn ghost" data-pod-move="up" data-pod-row="${rowIndex}" data-pod-index="${podIndex}" ${upDisabled}>↑</button>
            <button type="button" class="btn ghost" data-pod-move="down" data-pod-row="${rowIndex}" data-pod-index="${podIndex}" ${downDisabled}>↓</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="pod-toggle-row-group" data-pod-drop-row="${rowIndex}">
        <div class="pod-toggle-row-group-title">Utility Row ${rowIndex + 1}</div>
        ${items || '<div class="note-meta">No pods in this row.</div>'}
      </div>
    `;
  }).join('');
}

function getEventClosestTarget(event, selector){
  if (!event || !selector) return null;
  const rawTarget = event.target;
  const node = rawTarget && rawTarget.nodeType === Node.TEXT_NODE ? rawTarget.parentElement : rawTarget;
  if (node && typeof node.closest === 'function') {
    return node.closest(selector);
  }
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const entry of path) {
    if (entry && typeof entry.closest === 'function') {
      const match = entry.closest(selector);
      if (match) return match;
    }
  }
  return null;
}

function movePodWithinRow(rowIndex, podIndex, direction){
  const row = state.layout.utilityRows?.[rowIndex];
  if (!Array.isArray(row)) return false;
  const targetIndex = direction === 'up' ? podIndex - 1 : podIndex + 1;
  if (targetIndex < 0 || targetIndex >= row.length) return false;
  const copy = [...row];
  const [item] = copy.splice(podIndex, 1);
  copy.splice(targetIndex, 0, item);
  state.layout.utilityRows[rowIndex] = copy;
  return true;
}

function movePodAcrossRows(fromRowIndex, fromPodIndex, toRowIndex, toPodIndex){
  const rows = state.layout.utilityRows;
  if (!Array.isArray(rows)) return false;
  const sourceRow = rows?.[fromRowIndex];
  const targetRow = rows?.[toRowIndex];
  if (!Array.isArray(sourceRow) || !Array.isArray(targetRow)) return false;
  if (!Number.isInteger(fromPodIndex) || fromPodIndex < 0 || fromPodIndex >= sourceRow.length) return false;

  const sourceCopy = [...sourceRow];
  const [podId] = sourceCopy.splice(fromPodIndex, 1);
  if (!podId) return false;

  const sameRow = fromRowIndex === toRowIndex;
  let insertIndex = Number.isInteger(toPodIndex) ? toPodIndex : targetRow.length;
  if (sameRow && insertIndex > fromPodIndex) insertIndex -= 1;

  const targetBase = sameRow ? sourceCopy : [...targetRow];
  insertIndex = Math.max(0, Math.min(insertIndex, targetBase.length));
  targetBase.splice(insertIndex, 0, podId);

  rows[fromRowIndex] = sameRow ? targetBase : sourceCopy;
  if (!sameRow) rows[toRowIndex] = targetBase;
  return true;
}

function calculateDropIndexFromPointer(dropRowEl, pointerClientY){
  if (!dropRowEl) return 0;
  const rowIndex = Number(dropRowEl.dataset.podDropRow);
  const rowItems = [...dropRowEl.querySelectorAll('.pod-toggle-row[data-dnd-pod-index]')];
  if (!rowItems.length) return 0;

  for (let i = 0; i < rowItems.length; i += 1) {
    const rect = rowItems[i].getBoundingClientRect();
    if (pointerClientY < rect.top + (rect.height / 2)) return i;
  }

  const row = state.layout.utilityRows?.[rowIndex];
  return Array.isArray(row) ? row.length : rowItems.length;
}

function clearPodDragUi(){
  const wrap = document.getElementById('settingsPodVisibilityList');
  if (!wrap) return;
  wrap.querySelectorAll('.pod-toggle-row.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
  wrap.querySelectorAll('.pod-toggle-row-group.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
}

function normalizeMacAddress(value){
  return homeDeviceStateFeature.normalizeMacAddress(value);
}

function homeDeviceActionAvailability(device){
  return homeDeviceStateFeature.getActionAvailability(device);
}

function resolveRemoteTarget(device){
  if (device?.rdpUrl) return { type: 'rdp', value: device.rdpUrl };
  if (device?.sshTarget) return { type: 'ssh', value: `ssh://${device.sshTarget.replace(/^ssh:\/\//i, '')}` };
  if (device?.uiUrl) return { type: 'ui', value: device.uiUrl };
  return null;
}

async function pingHomeDevice(deviceId){
  const device = state.homeDeviceControl.devices.find((d) => d.id === deviceId);
  if (!device?.host) return;
  state.homeDeviceControl.pingByDevice[deviceId] = { status: 'running', checkedAt: now(), message: 'Pinging…' };
  renderHomeDeviceControlPod();
  try {
    const res = await fetch(HOME_DEVICES_PING_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: device.host }) });
    const payload = await res.json().catch(() => ({}));
    state.homeDeviceControl.pingByDevice[deviceId] = { status: payload?.ok ? (payload.reachable ? 'up' : 'down') : 'error', checkedAt: now(), latencyMs: Number.isFinite(Number(payload?.latencyMs)) ? Number(payload.latencyMs) : null, message: payload?.message || (payload?.reachable ? 'Reachable' : 'Unreachable') };
  } catch (error) {
    state.homeDeviceControl.pingByDevice[deviceId] = { status: 'error', checkedAt: now(), message: `Ping unavailable: ${String(error?.message || error)}` };
  }
  save('home_device_ping_checked');
  renderHomeDeviceControlPod();
}

async function scanHomeDevicesReachability(){
  if (state.homeDeviceControl.scanRunning) return;
  const targetIds = (state.homeDeviceControl.devices || []).filter((d) => !!String(d?.host || '').trim()).map((d) => d.id);
  if (!targetIds.length) {
    state.homeDeviceControl.lastScanAt = now();
    state.homeDeviceControl.toast = 'No devices with a host/IP to scan.';
    state.homeDeviceControl.toastAt = now();
    renderHomeDeviceControlPod();
    return;
  }

  state.homeDeviceControl.scanRunning = true;
  state.homeDeviceControl.toast = `Scanning ${targetIds.length} device${targetIds.length === 1 ? '' : 's'}…`;
  state.homeDeviceControl.toastAt = now();
  renderHomeDeviceControlPod();

  try {
    for (const deviceId of targetIds) {
      // Keep this sequential to avoid hammering local network/tooling.
      // eslint-disable-next-line no-await-in-loop
      await pingHomeDevice(deviceId);
    }
  } finally {
    state.homeDeviceControl.scanRunning = false;
    state.homeDeviceControl.lastScanAt = now();
    state.homeDeviceControl.toast = `Scan complete (${targetIds.length} checked).`;
    state.homeDeviceControl.toastAt = now();
    commitState('home_device_scan_completed');
  }
}

async function wakeHomeDevice(deviceId){
  const device = state.homeDeviceControl.devices.find((d) => d.id === deviceId);
  if (!device?.macAddress) return;
  try {
    const res = await fetch(HOME_DEVICES_WAKE_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ macAddress: device.macAddress, host: device.host }) });
    const payload = await res.json().catch(() => ({}));
    device.lastWakeStatus = payload?.ok ? `Wake sent (${payload?.tool || 'unknown'})` : `Wake failed: ${payload?.message || 'Unknown error'}`;
    device.lastWakeAt = now();
  } catch (error) {
    device.lastWakeStatus = `Wake unavailable: ${String(error?.message || error)}`;
    device.lastWakeAt = now();
  }
  state.homeDeviceControl.wakeModalDeviceId = '';
  commitState('home_device_wake_triggered');
}

function renderHomeDeviceControlPod(){
  const wrap = document.getElementById('homeDeviceControlWidget');
  if (!wrap) return;
  const devices = state.homeDeviceControl?.devices || [];
  if (!devices.length) {
    wrap.innerHTML = '<div class="note-meta">No home devices configured yet. Add one in Settings → Data & Feeds.</div>';
    return;
  }

  const scanRunning = !!state.homeDeviceControl.scanRunning;
  const lastScanAt = state.homeDeviceControl.lastScanAt ? new Date(state.homeDeviceControl.lastScanAt).toLocaleString() : '';
  const scanSummary = scanRunning ? 'Scan in progress…' : (lastScanAt ? `Last scan: ${lastScanAt}` : 'No scan run yet.');

  wrap.innerHTML = `<div class="row-between-wrap gap8 mb8"><div class="note-meta">${escapeHtml(scanSummary)}</div><button class="btn ghost" data-home-device-action="scan" ${scanRunning ? 'disabled' : ''}>${scanRunning ? 'Scanning…' : 'Scan Reachability'}</button></div>${state.homeDeviceControl.toast ? `<div class="note-meta mb8">${escapeHtml(state.homeDeviceControl.toast)}</div>` : ''}<div class="home-device-grid">${devices.map((device) => {
    const status = state.homeDeviceControl.pingByDevice?.[device.id] || {};
    const av = homeDeviceActionAvailability(device);
    const wakeMeta = device.lastWakeAt ? `${new Date(device.lastWakeAt).toLocaleString()} · ${device.lastWakeStatus || 'wake attempted'}` : 'No wake attempts yet.';
    return `<article class="home-device-card">
      <div class="row-between-wrap gap10"><strong>${escapeHtml(device.name)}</strong><span class="badge">${escapeHtml(device.type || 'device')}</span></div>
      <div class="note-meta">Host: ${escapeHtml(device.host || '—')}</div>
      ${device.tags?.length ? `<div class="note-meta">Tags: ${escapeHtml(device.tags.join(', '))}</div>` : ''}
      <div class="home-device-actions mt8">
        <button class="btn ghost" data-home-device-action="remote" data-device-id="${escapeHtml(device.id)}" ${av.remote.enabled ? '' : 'disabled'} title="${escapeHtml(av.remote.reason)}">Open Remote</button>
        <button class="btn ghost" data-home-device-action="ui" data-device-id="${escapeHtml(device.id)}" ${av.ui.enabled ? '' : 'disabled'} title="${escapeHtml(av.ui.reason)}">Open UI</button>
        <button class="btn ghost" data-home-device-action="ping" data-device-id="${escapeHtml(device.id)}" ${av.ping.enabled ? '' : 'disabled'} title="${escapeHtml(av.ping.reason)}">Ping</button>
        <button class="btn ghost" data-home-device-action="copy-ssh" data-device-id="${escapeHtml(device.id)}" ${av.copySsh.enabled ? '' : 'disabled'} title="${escapeHtml(av.copySsh.reason)}">Copy SSH</button>
        <button class="btn" data-home-device-action="wake" data-device-id="${escapeHtml(device.id)}" ${av.wake.enabled ? '' : 'disabled'} title="${escapeHtml(av.wake.reason)}">Wake</button>
      </div>
      <div class="note-meta mt6">Ping: ${escapeText(status.status === 'running' ? 'Running…' : (status.message || 'Not checked'))} ${status.latencyMs != null ? `(${Math.round(status.latencyMs)}ms)` : ''}</div>
      <div class="note-meta">Wake: ${escapeHtml(wakeMeta)}</div>
    </article>`;
  }).join('')}</div>`;

  wrap.querySelectorAll('[data-home-device-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = String(btn.getAttribute('data-home-device-action') || '');
      if (action === 'scan') { await scanHomeDevicesReachability(); return; }

      const deviceId = String(btn.getAttribute('data-device-id') || '');
      const device = state.homeDeviceControl.devices.find((d) => d.id === deviceId);
      if (!device) return;

      if (action === 'remote') { const target = resolveRemoteTarget(device); if (target?.value) openSafeExternal(target.value); }
      if (action === 'ui' && device.uiUrl) openSafeExternal(device.uiUrl);
      if (action === 'ping') await pingHomeDevice(device.id);
      if (action === 'copy-ssh' && device.sshTarget) { try { await navigator.clipboard.writeText(device.sshTarget); } catch {} }
      if (action === 'wake') { state.homeDeviceControl.wakeModalDeviceId = device.id; renderHomeDeviceControlPod(); }
    });
  });

  const wakeId = state.homeDeviceControl.wakeModalDeviceId;
  if (wakeId) {
    const device = devices.find((d) => d.id === wakeId);
    if (device) {
      wrap.insertAdjacentHTML('beforeend', `<div class="home-device-modal-backdrop"><div class="home-device-modal"><strong>Send Wake-on-LAN?</strong><div class="note-meta mt6">${escapeHtml(device.name)} · ${escapeHtml(normalizeMacAddress(device.macAddress))}</div><div class="row-wrap mt8"><button class="btn" data-home-device-confirm-wake="${escapeHtml(device.id)}">Send Wake</button><button class="btn ghost" data-home-device-cancel-wake="1">Cancel</button></div></div></div>`);
      wrap.querySelector('[data-home-device-cancel-wake]')?.addEventListener('click', () => { state.homeDeviceControl.wakeModalDeviceId = ''; renderHomeDeviceControlPod(); });
      wrap.querySelector('[data-home-device-confirm-wake]')?.addEventListener('click', () => wakeHomeDevice(device.id));
    }
  }
}

function mountHomeDevicesSettingsEditor(){
  const wrap = document.getElementById('settingsHomeDevicesList');
  if (!wrap) return;
  const devices = state.homeDeviceControl?.devices || [];
  wrap.innerHTML = devices.map((device) => `<div class="change-log-item"><div class="row-between-wrap gap8"><strong>${escapeHtml(device.name)}</strong><button class="btn note-delete" type="button" data-home-device-remove="${escapeHtml(device.id)}">Remove</button></div><div class="home-device-settings-grid mt8">
    <input data-home-device-field="name" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(device.name)}" placeholder="Name" />
    <input data-home-device-field="type" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(device.type || '')}" placeholder="Type" />
    <input data-home-device-field="host" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(device.host || '')}" placeholder="Host/IP" />
    <input data-home-device-field="uiUrl" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(device.uiUrl || '')}" placeholder="UI URL" />
    <input data-home-device-field="sshTarget" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(device.sshTarget || '')}" placeholder="SSH target user@host" />
    <input data-home-device-field="rdpUrl" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(device.rdpUrl || '')}" placeholder="RDP URL" />
    <input data-home-device-field="macAddress" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(device.macAddress || '')}" placeholder="MAC address" />
    <input data-home-device-field="tags" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml((device.tags || []).join(', '))}" placeholder="Tags comma-separated" />
    <input data-home-device-field="notes" data-device-id="${escapeHtml(device.id)}" value="${escapeHtml(device.notes || '')}" placeholder="Notes" />
  </div></div>`).join('') || '<div class="note-meta">No devices yet.</div>';

  wrap.querySelectorAll('[data-home-device-field]').forEach((input) => {
    input.addEventListener('change', () => {
      const deviceId = String(input.getAttribute('data-device-id') || '');
      const field = String(input.getAttribute('data-home-device-field') || '');
      const device = state.homeDeviceControl.devices.find((d) => d.id === deviceId);
      if (!device || !field) return;
      if (field === 'tags') device.tags = String(input.value || '').split(',').map((v) => v.trim()).filter(Boolean).slice(0, 10);
      else if (field === 'macAddress') device[field] = normalizeMacAddress(input.value);
      else device[field] = String(input.value || '').trim();
      commitState('home_device_updated');
    });
  });

  wrap.querySelectorAll('[data-home-device-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idVal = String(btn.getAttribute('data-home-device-remove') || '');
      state.homeDeviceControl.devices = state.homeDeviceControl.devices.filter((d) => d.id !== idVal);
      commitState('home_device_removed');
    });
  });

}

function renderAll(){
  applyTheme();
  applyUtilityLayoutToDom();
  renderPodWithFallback('date-time', renderDateTime);
  renderPodWithFallback('calendar', renderCalendar);
  renderGasPricesPod();
  renderEverydayCalculatorPod();
  renderSystemResourceMonitorPod();
  renderSpeedTestPod();
  renderEbayTrafficPod();
  renderUnreadEmailPod();
  renderCalendarRemindersPanel();
  renderTodayReminders();
  renderSettings();
  renderProjects();
  renderStats();
  renderIdeas();
  renderNotes();
  renderBoard();
  renderMusicPlayer();
  renderCameraFeedPod();
  renderLiveStreamsPod();
  renderVoiceDeskPod();
  renderShortcutsPod();
  renderShortcutsSettings();
  syncUtilityPodLifecycle();
  populateProjectSelect();
}

function renderProjects(){
  return projectsController.render();
}

function renderStats(){
  const wrap = document.getElementById('stats');
  if (!wrap) return;

  const open = state.tasks.filter(t=>t.column!=='done').length;
  const blocked = state.tasks.filter(t=>t.column==='waiting_blocked').length;
  const approvals = state.tasks.filter(t=>t.blockerType==='approval' && t.column==='waiting_blocked').length;
  const doneWeek = state.tasks.filter(t=>t.column==='done' && daysAgo(t.updatedAt)<=7).length;

  const notesCount = state.notes.length;
  wrap.innerHTML = [
    ['Open Tasks', open],
    ['Debugging', blocked],
    ['Needs Approval', approvals],
    ['Done (7d)', doneWeek],
    ['Notes', notesCount],
  ].map(([k,v])=>`<div class="stat"><small>${k}</small><h2>${v}</h2></div>`).join('');
}

function daysAgo(date){ return (Date.now()-new Date(date).getTime())/86400000; }

function renderIdeas(){
  const list = document.getElementById('ideasList');
  if (!list) return;
  if (!state.ideas.length) {
    list.innerHTML = '<div class="note-meta">No ideas saved yet.</div>';
    return;
  }
  list.innerHTML = state.ideas
    .map((i)=>`<div class="change-log-item"><strong>${new Date(i.ts).toLocaleString()}</strong><br/>${escapeHtml(i.text)}</div>`)
    .join('');
}

function renderNotes(){
  return notesController.render();
}

function renderShortcutsPod(){
  return shortcutsController.renderPod();
}

function renderShortcutsSettings(){
  return shortcutsController.renderSettings();
}

function escapeText(value){
  return window.NostromoSafeUI.escapeText(value);
}

function escapeAttribute(value){
  return window.NostromoSafeUI.escapeAttribute(value);
}

// Legacy renderer alias. New template code must choose escapeText or
// escapeAttribute according to its HTML context rather than treating URLs as text.
function escapeHtml(value){
  return escapeAttribute(value);
}

function safeExternalUrl(value){
  return window.NostromoSafeUI.safeExternalUrl(value);
}

function safeFrameUrl(value, options){
  return window.NostromoSafeUI.safeFrameUrl(value, options);
}

function safeMediaUrl(value){
  return window.NostromoSafeUI.safeMediaUrl(value);
}

function openSafeExternal(value, features){
  return window.NostromoSafeUI.openExternal(value, features);
}

function setSafeFrameSource(frame, value, options){
  return window.NostromoSafeUI.setSafeFrameSource(frame, value, options);
}

function setSafeMediaSource(element, value){
  return window.NostromoSafeUI.setSafeMediaSource(element, value);
}

const EDITOR_CONFIG = {
  mode: 'markdown',
  supportedModes: ['markdown', 'richtext'],
  // TODO: add rich-text adapter here (TipTap/ProseMirror/etc.) while keeping markdown persistence as source-of-truth.
};

function markdownToolbarButtons(){
  return [
    ['bold', 'B', 'Bold'],
    ['italic', 'I', 'Italic'],
    ['underline', 'U', 'Underline'],
    ['bullet', '• List', 'Bullet list'],
    ['numbered', '1. List', 'Numbered list'],
    ['clear', 'Clear', 'Clear formatting'],
  ].map(([key, label, title]) => `<button type="button" class="btn ghost md-btn" data-md-format="${key}" title="${title}">${label}</button>`).join('');
}

function applyWrapFormat(value, start, end, marker){
  const selected = value.slice(start, end);
  const hasWrapper = selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2;
  if (hasWrapper) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return {
      value: `${value.slice(0, start)}${inner}${value.slice(end)}`,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }
  const next = `${marker}${selected}${marker}`;
  const caretStart = start + marker.length;
  return {
    value: `${value.slice(0, start)}${next}${value.slice(end)}`,
    selectionStart: caretStart,
    selectionEnd: selected
      ? caretStart + selected.length
      : caretStart,
  };
}

function stripMarkdownFormatting(text){
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\+\+(.*?)\+\+/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '');
}

function applyFormat(input, format){
  if (!input) return;
  const value = String(input.value || '');
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;

  let result = { value, selectionStart: start, selectionEnd: end };
  if (format === 'bold') result = applyWrapFormat(value, start, end, '**');
  if (format === 'italic') result = applyWrapFormat(value, start, end, '*');
  if (format === 'underline') result = applyWrapFormat(value, start, end, '++');
  if (format === 'bullet') {
    const selected = value.slice(start, end);
    const hasSelection = start !== end;
    const lines = (hasSelection ? selected : '').split('\n');
    const next = hasSelection
      ? lines.map((line) => (line.trim() ? `- ${line.replace(/^\s*[-*]\s+/, '')}` : '- ')).join('\n')
      : '- ';
    result = {
      value: `${value.slice(0, start)}${next}${value.slice(end)}`,
      selectionStart: hasSelection ? start : start + 2,
      selectionEnd: hasSelection ? start + next.length : start + 2,
    };
  }
  if (format === 'numbered') {
    const selected = value.slice(start, end);
    const hasSelection = start !== end;
    const lines = (hasSelection ? selected : '').split('\n');
    const next = hasSelection
      ? lines.map((line, idx) => {
        const cleaned = line.replace(/^\s*\d+\.\s+/, '').trim();
        return `${idx + 1}. ${cleaned}`.trimEnd();
      }).join('\n')
      : '1. ';
    result = {
      value: `${value.slice(0, start)}${next}${value.slice(end)}`,
      selectionStart: hasSelection ? start : start + 3,
      selectionEnd: hasSelection ? start + next.length : start + 3,
    };
  }
  if (format === 'clear') {
    const selected = value.slice(start, end);
    const target = selected || value;
    const cleaned = stripMarkdownFormatting(target);
    result = selected
      ? {
        value: `${value.slice(0, start)}${cleaned}${value.slice(end)}`,
        selectionStart: start,
        selectionEnd: start + cleaned.length,
      }
      : {
        value: cleaned,
        selectionStart: 0,
        selectionEnd: cleaned.length,
      };
  }

  input.value = result.value;
  input.focus();
  input.setSelectionRange(result.selectionStart, result.selectionEnd);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function bindMarkdownToolbar(toolbar, getInput, onApplied){
  if (!toolbar) return () => {};
  const bindings = [];
  toolbar.querySelectorAll('button[data-md-format]').forEach((btn)=>{
    const preventMouseDown = (e) => e.preventDefault();
    const applyToolbarFormat = () => {
      const input = typeof getInput === 'function' ? getInput(btn) : null;
      if (!input) return;
      applyFormat(input, btn.dataset.mdFormat);
      if (typeof onApplied === 'function') onApplied(input, btn);
    };
    btn.addEventListener('mousedown', preventMouseDown);
    btn.addEventListener('click', applyToolbarFormat);
    bindings.push([btn, 'mousedown', preventMouseDown], [btn, 'click', applyToolbarFormat]);
  });
  return () => bindings.forEach(([target, eventName, listener]) => target.removeEventListener(eventName, listener));
}

function renderInlineMarkdown(text){
  const escaped = escapeHtml(text || '');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');
}

function renderFormattedText(markdown){
  if (EDITOR_CONFIG.mode !== 'markdown') return escapeHtml(markdown || '');
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      blocks.push(`</${listType}>`);
      listType = null;
    }
  };

  lines.forEach((line) => {
    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    const ol = line.match(/^\s*\d+\.\s+(.+)$/);

    if (ul) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        blocks.push('<ul>');
      }
      blocks.push(`<li>${renderInlineMarkdown(ul[1])}</li>`);
      return;
    }

    if (ol) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        blocks.push('<ol>');
      }
      blocks.push(`<li>${renderInlineMarkdown(ol[1])}</li>`);
      return;
    }

    closeList();
    if (!line.trim()) {
      blocks.push('<div class="md-spacer"></div>');
      return;
    }
    blocks.push(`<p>${renderInlineMarkdown(line)}</p>`);
  });

  closeList();
  return blocks.join('') || '<p></p>';
}

function renderBoard(){
  return tasksController.render();
}

function populateProjectSelect(){
  return tasksController.populateProjectSelects();
}

function openEditTaskDialog(taskId){
  return tasksController.openEditDialog(taskId);
}

// dialogs
projectsController.bind();
tasksController.bind();
shortcutsController.bind();

const settingsPanel = document.getElementById('settingsPanel');
document.getElementById('openSettingsBtn')?.addEventListener('click', ()=> {
  settingsPanel?.classList.add('open');
  settingsPanel?.setAttribute('aria-hidden','false');
  setActiveSettingsSection(activeSettingsSection, { preserveScroll: true });
  refreshStateSafetyBackups(true);
});
document.getElementById('closeSettingsBtn')?.addEventListener('click', ()=> {
  settingsPanel?.classList.remove('open');
  settingsPanel?.setAttribute('aria-hidden','true');
});

document.getElementById('settingTheme')?.addEventListener('change', (e)=> {
  setThemePreference(e.target.value);
});
document.getElementById('themeChoiceGrid')?.addEventListener('click', (e) => {
  const choice = e.target.closest('[data-theme-choice]');
  if (!choice) return;
  setThemePreference(choice.getAttribute('data-theme-choice'));
});

document.getElementById('settingWeatherInterval')?.addEventListener('change', (e)=> {
  state.settings.weatherIntervalMin = Number(e.target.value || 15);
  setupWeatherTimer();
  logChange(`Weather refresh interval set to every ${state.settings.weatherIntervalMin} minutes`);
  save();
});

document.getElementById('settingDefaultTaskColumn')?.addEventListener('change', (e)=> {
  state.settings.defaultTaskColumn = normalizeTaskColumn(e.target.value);
  logChange(`Default new task column set to ${state.settings.defaultTaskColumn}`);
  save();
});

document.getElementById('settingRssInterval')?.addEventListener('change', (e)=> {
  const mins = Number(e.target.value || RSS_DEFAULT_REFRESH_MIN);
  state.rss.refreshIntervalMin = Number.isFinite(mins) ? Math.min(180, Math.max(5, Math.round(mins))) : RSS_DEFAULT_REFRESH_MIN;
  setupRssTimer();
  save('rss_interval_changed');
});

document.getElementById('settingsPodVisibilityList')?.addEventListener('change', (e) => {
  const checkbox = getEventClosestTarget(e, '[data-pod-visibility]');
  if (!checkbox) return;
  const podId = String(checkbox.dataset.podVisibility || '').trim();
  if (!podId) return;
  state.layout.visibility[podId] = !!checkbox.checked;
  save('pod_visibility_toggled');
  applyUtilityLayoutToDom();
  renderPodVisibilitySettings();
});

document.getElementById('settingsPodVisibilityList')?.addEventListener('click', (e) => {
  const btn = getEventClosestTarget(e, '[data-pod-move]');
  if (!btn) return;
  e.preventDefault();
  const rowIndex = Number(btn.dataset.podRow);
  const podIndex = Number(btn.dataset.podIndex);
  const direction = String(btn.dataset.podMove || '');
  if (!Number.isInteger(rowIndex) || !Number.isInteger(podIndex)) return;
  if (!movePodWithinRow(rowIndex, podIndex, direction)) return;
  save('pod_layout_reordered');
  applyUtilityLayoutToDom();
  renderPodVisibilitySettings();
});

document.getElementById('settingsPodVisibilityList')?.addEventListener('dragstart', (e) => {
  const rowEl = getEventClosestTarget(e, '.pod-toggle-row[data-dnd-pod-row][data-dnd-pod-index][data-dnd-pod-id]');
  if (!rowEl) return;
  const fromRow = Number(rowEl.dataset.dndPodRow);
  const fromIndex = Number(rowEl.dataset.dndPodIndex);
  const podId = String(rowEl.dataset.dndPodId || '').trim();
  if (!Number.isInteger(fromRow) || !Number.isInteger(fromIndex) || !podId) return;

  settingsPodDragState = { fromRow, fromIndex, podId };
  rowEl.classList.add('is-dragging');
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', podId); } catch {}
  }
});

document.getElementById('settingsPodVisibilityList')?.addEventListener('dragover', (e) => {
  if (!settingsPodDragState) return;
  const dropRow = getEventClosestTarget(e, '.pod-toggle-row-group[data-pod-drop-row]');
  if (!dropRow) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

  document.querySelectorAll('#settingsPodVisibilityList .pod-toggle-row-group.is-drop-target').forEach((el) => {
    if (el !== dropRow) el.classList.remove('is-drop-target');
  });
  dropRow.classList.add('is-drop-target');
});

document.getElementById('settingsPodVisibilityList')?.addEventListener('drop', (e) => {
  const dropRow = getEventClosestTarget(e, '.pod-toggle-row-group[data-pod-drop-row]');
  if (!settingsPodDragState || !dropRow) return;
  e.preventDefault();

  const toRow = Number(dropRow.dataset.podDropRow);
  if (!Number.isInteger(toRow)) {
    settingsPodDragState = null;
    clearPodDragUi();
    return;
  }

  const toIndex = calculateDropIndexFromPointer(dropRow, e.clientY);
  const moved = movePodAcrossRows(settingsPodDragState.fromRow, settingsPodDragState.fromIndex, toRow, toIndex);
  settingsPodDragState = null;
  clearPodDragUi();
  if (!moved) return;

  save('pod_layout_reordered');
  applyUtilityLayoutToDom();
  renderPodVisibilitySettings();
});

document.getElementById('settingsPodVisibilityList')?.addEventListener('dragend', () => {
  settingsPodDragState = null;
  clearPodDragUi();
});

document.getElementById('addRssFeedBtn')?.addEventListener('click', async () => {
  const urlInput = document.getElementById('rssFeedUrlInput');
  const tagInput = document.getElementById('rssFeedTagInput');
  const url = String(urlInput?.value || '').trim();
  const tag = String(tagInput?.value || '').trim();

  if (!/^https?:\/\//i.test(url)) {
    alert('Please enter a valid http(s) feed URL.');
    return;
  }
  if ((state.rss.feeds || []).some((f) => f.url === url)) {
    alert('That feed URL is already added.');
    return;
  }

  state.rss.feeds.push({ id: id(), url, tag: tag.slice(0, 40), addedAt: now() });
  if (urlInput) urlInput.value = '';
  if (tagInput) tagInput.value = '';
  save('rss_feed_added');
  mountRssSettingsFeeds();
  await renderRssPod();
});

document.getElementById('addHomeDeviceBtn')?.addEventListener('click', () => {
  state.homeDeviceControl.devices.push({
    id: id(),
    name: 'New Device',
    type: 'device',
    host: '',
    uiUrl: '',
    sshTarget: '',
    rdpUrl: '',
    macAddress: '',
    notes: '',
    tags: [],
    lastWakeStatus: '',
    lastWakeAt: '',
  });
  commitState('home_device_added');
});

document.getElementById('scanHomeDevicesBtn')?.addEventListener('click', async () => {
  await scanHomeDevicesReachability();
});

document.getElementById('settingFullscreen')?.addEventListener('change', async (e)=> {
  if (e.target.checked) {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    logChange('Fullscreen mode enabled');
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
    logChange('Fullscreen mode disabled');
  }
});

document.addEventListener('fullscreenchange', () => {
  const fs = document.getElementById('settingFullscreen');
  if (fs) fs.checked = !!document.fullscreenElement;
});

document.getElementById('exportStateBtn')?.addEventListener('click', () => {
  try {
    exportStateSnapshot();
    logChange('Exported state JSON snapshot from Settings');
  } catch (err) {
    alert(`Export failed: ${String(err?.message || err)}`);
  }
});

const importStateFileInput = document.getElementById('importStateFileInput');
document.getElementById('importStateBtn')?.addEventListener('click', () => {
  importStateFileInput?.click();
});

document.getElementById('refreshBackupsBtn')?.addEventListener('click', () => {
  refreshStateSafetyBackups(true);
});

importStateFileInput?.addEventListener('change', async (e) => {
  const file = e.target?.files?.[0];
  if (!file) return;

  try {
    await importStateSnapshotFromFile(file);
    logChange('Imported state JSON snapshot via Settings');
    alert('State imported successfully.');
  } catch (err) {
    alert(`Import failed: ${String(err?.message || err)}`);
  } finally {
    importStateFileInput.value = '';
  }
});

document.getElementById('toggleChangeLogBtn')?.addEventListener('click', () => {
  changeLogVisible = !changeLogVisible;
  renderChangeLog();
});

document.getElementById('changeLogLoadMoreBtn')?.addEventListener('click', () => {
  changeLogLimit += 10;
  renderChangeLog();
});

document.getElementById('addChangeLogBtn')?.addEventListener('click', () => {
  const input = document.getElementById('changeLogInput');
  const val = (input?.value || '').trim();
  if (!val) return;
  state.changelog.unshift({ id: id(), ts: now(), message: val });
  state.changelog = state.changelog.slice(0, 200);
  save();
  input.value = '';
  changeLogVisible = true;
  renderChangeLog();
});

document.getElementById('changeLogList')?.addEventListener('scroll', updatePatchNotesOverflowAffordance);
window.addEventListener('resize', updatePatchNotesOverflowAffordance);

notesController.bind();

document.getElementById('addIdeaBtn')?.addEventListener('click', () => {
  const input = document.getElementById('ideaInput');
  const text = (input?.value || '').trim();
  if (!text) return;
  state.ideas.unshift({ id: id(), ts: now(), text });
  state.ideas = state.ideas.slice(0, 200);
  if (input) input.value = '';
  logChange('Saved new idea to Ideas Box');
  commitState('idea_added');
});

function enableProjectDragScroll(){
  const el = document.getElementById('projectDirectory');
  if (!el || el.dataset.dragReady === '1') return;

  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  el.addEventListener('mousedown', (e) => {
    // Only drag-scroll with primary mouse button
    if (e.button !== 0) return;
    isDown = true;
    el.classList.add('dragging');
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
    el.classList.remove('dragging');
  });

  el.addEventListener('mouseleave', () => {
    isDown = false;
    el.classList.remove('dragging');
  });

  el.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX) * 1.2;
    el.scrollLeft = scrollLeft - walk;
  });

  el.dataset.dragReady = '1';
}

function enableBoardDragScroll(){
  const el = document.getElementById('board');
  if (!el || el.dataset.dragReady === '1') return;

  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // Avoid hijacking task drag interactions.
    if (e.target.closest('.task')) return;
    isDown = true;
    el.classList.add('dragging');
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
    el.classList.remove('dragging');
  });

  el.addEventListener('mouseleave', () => {
    isDown = false;
    el.classList.remove('dragging');
  });

  el.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX) * 1.2;
    el.scrollLeft = scrollLeft - walk;
  });

  el.dataset.dragReady = '1';
}

if (!state.changelog.length) {
  state.changelog.push({ id: id(), ts: now(), message: 'Initialized PA Nostromo local dashboard state' });
  state.changelog.push({ id: id(), ts: now(), message: 'Added Change Log panel in Settings with auto + manual patch notes' });
}

const podIdea = 'Future enhancement: draggable/reorderable pods with layout persistence + reset layout option.';
if (!state.ideas.some((i) => i.text === podIdea)) {
  state.ideas.unshift({ id: id(), ts: now(), text: podIdea });
}

const recentPatch = 'Batch update: Added interactive calendar reminders + Today Reminders panel + upgraded weather pod with 3-day condition icons.';
if (!state.changelog.some((c) => c.message === recentPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: recentPatch });
}

const nbaPatch = 'Added NBA Scores pod (EST today) with ESPN scoreboard integration + 5-minute auto-refresh + manual refresh.';
if (!state.changelog.some((c) => c.message === nbaPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: nbaPatch });
}

const nbaLinksPatch = 'NBA pod update: added ESPN Box Score links (open in new tab) for each game row.';
if (!state.changelog.some((c) => c.message === nbaLinksPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: nbaLinksPatch });
}

const nbaV2Patch = 'NBA Scores 2.0: favorites-first views, featured matchup, richer game cards with leaders/broadcasts, recap mode, and 1-minute live refresh.';
if (!state.changelog.some((c) => c.message === nbaV2Patch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: nbaV2Patch });
}

const nbaImportanceTagsPatch = 'NBA Scores refinement: smarter game importance tags now surface My Team, Starts Soon, OT, Close Game, Tight Finish, National TV, and Upset moments without bloating the pod.';
if (!state.changelog.some((c) => c.message === nbaImportanceTagsPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: nbaImportanceTagsPatch });
}

const cryptoPatch = 'Added Crypto Tracker pod: watchlist-focused view with cached coin directory search, add/remove controls, manual list refresh, and 5-minute auto-refresh.';
if (!state.changelog.some((c) => c.message === cryptoPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: cryptoPatch });
}

const cryptoResiliencePatch = 'Crypto pod resilience patch: last-good watchlist fallback with stale indicator, smarter rate-limit/network error messaging, failed-fetch backoff, and manual refresh cooldown countdown.';
if (!state.changelog.some((c) => c.message === cryptoResiliencePatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: cryptoResiliencePatch });
}

const cryptoMultiProviderPatch = 'Crypto pod reliability update: multi-provider market data failover chain (CoinGecko → CoinCap → CryptoCompare) with active data-source status and watchlist ID-safe normalization.';
if (!state.changelog.some((c) => c.message === cryptoMultiProviderPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: cryptoMultiProviderPatch });
}

const cryptoV2Patch = 'Crypto Tracker 2.0: upgraded from a plain watchlist into a richer portfolio snapshot with market pulse cards, cleaner asset rows, and a calmer holdings-vs-radar layout.';
if (!state.changelog.some((c) => c.message === cryptoV2Patch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: cryptoV2Patch });
}

const dateTimeV2Patch = 'Date & Time 2.0: refreshed the pod with a stronger clock hero, cleaner timer panel, and more polished integrated weather cards.';
if (!state.changelog.some((c) => c.message === dateTimeV2Patch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: dateTimeV2Patch });
}

const calendarV2Patch = 'Calendar 2.0: refreshed the month view with cleaner day cells and turned the lower half into a fuller selected-day agenda panel.';
if (!state.changelog.some((c) => c.message === calendarV2Patch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: calendarV2Patch });
}

const rssV2Patch = 'RSS Feed 2.0: upgraded the pod from a text blob into a cleaner editorial feed with story cards and a quick overview strip.';
if (!state.changelog.some((c) => c.message === rssV2Patch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: rssV2Patch });
}

const systemMonitorV2Patch = 'System Resource Monitor 2.0: refreshed the pod with a stronger host-health hero, clearer metric cards, and richer process spotlight panels.';
if (!state.changelog.some((c) => c.message === systemMonitorV2Patch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: systemMonitorV2Patch });
}

const cameraFeedV2Patch = 'Camera Feed 2.0: rebuilt the pod around a cleaner control deck, a stronger live-stage presentation, and synced status cues for embed, snapshot, and local webcam modes.';
if (!state.changelog.some((c) => c.message === cameraFeedV2Patch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: cameraFeedV2Patch });
}

const musicPatch = 'Added mini Music Player pod with YouTube/stream URL input, local audio file playback, compact controls, volume, and one-click favorite stream recall.';
if (!state.changelog.some((c) => c.message === musicPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: musicPatch });
}

const musicV2Patch = 'Music Player 2.0: refreshed the pod with a stronger listening hero, cleaner stream-vs-ambient control decks, and a calmer transport-focused layout.';
if (!state.changelog.some((c) => c.message === musicV2Patch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: musicV2Patch });
}

const utilityLayoutPatch = 'Utility layout refresh: split utility pods into two rows (Date/Calendar/Weather + NBA/Crypto/Music) with cleaner responsive spacing.';
if (!state.changelog.some((c) => c.message === utilityLayoutPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: utilityLayoutPatch });
}

const voiceNotePatch = 'Added Voice Note pod (V1): Start/Stop speech transcription creates a new unassigned "Voice Note" note.';
if (!state.changelog.some((c) => c.message === voiceNotePatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: voiceNotePatch });
}

const voiceToRowanPatch = 'Added Voice to Rowan pod (V1): Start/Stop speech capture with editable transcript draft, manual Send to Rowan chat bridge, and Clear (no auto-send).';
if (!state.changelog.some((c) => c.message === voiceToRowanPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: voiceToRowanPatch });
}

const voiceToRowanTransportPatch = 'Voice to Rowan transport patch: Send now uses fallback chain (direct window hooks → parent/top postMessage bridge) with preserved draft + one-click copy guidance when bridge is unavailable.';
if (!state.changelog.some((c) => c.message === voiceToRowanTransportPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: voiceToRowanTransportPatch });
}

const voiceToRowanRelayPatch = 'Voice to Rowan relay bridge upgrade: primary send path now targets POST /api/rowan-send with explicit server-side relay config, actionable failures, and fallback transport tools while preserving manual-send behavior.';
if (!state.changelog.some((c) => c.message === voiceToRowanRelayPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: voiceToRowanRelayPatch });
}

const voiceToRowanTurnkeyConfigPatch = 'Voice-to-Rowan turnkey setup patch: local `.env` / `.env.local` relay config is now first-class (one-time setup + npm start), while preserving local-only relay security defaults.';
if (!state.changelog.some((c) => c.message === voiceToRowanTurnkeyConfigPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: voiceToRowanTurnkeyConfigPatch });
}

const voiceDeskMergePatch = 'Voice Desk merge: combined Voice Note and Voice to Rowan into one shared transcript pod with manual Save as Note and Send to Rowan actions.';
if (!state.changelog.some((c) => c.message === voiceDeskMergePatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: voiceDeskMergePatch });
}

const taskEditPatch = 'Board update: task cards now support Edit via modal for all task fields, including project/column reassignment.';
if (!state.changelog.some((c) => c.message === taskEditPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: taskEditPatch });
}

const shortcutsPatch = 'Added Shortcuts pod + Settings shortcut manager: multi-project assignments, Global (Mission Control) scope, project checkbox filtering, and persisted visibility toggles.';
if (!state.changelog.some((c) => c.message === shortcutsPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: shortcutsPatch });
}

const shortcutsUxPatch = 'Shortcuts UX update: wider pod layout, denser shortcut cards, and drag/drop bookmark creation that defaults to currently checked shortcut project filters (or Global if none selected).';
if (!state.changelog.some((c) => c.message === shortcutsUxPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: shortcutsUxPatch });
}

const shortcutsFilterViewportPatch = 'Shortcuts filter viewport polish: project filter checklist is capped to ~2 rows with hidden scrollbar while remaining wheel/trackpad/touch scrollable to preserve space for shortcut cards.';
if (!state.changelog.some((c) => c.message === shortcutsFilterViewportPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: shortcutsFilterViewportPatch });
}

const shortcutsFilterGridPatch = 'Shortcuts filter layout tweak: project filters now render as dense side-by-side rows in an auto-fit responsive grid, keeping compact height and hidden-scroll overflow behavior.';
if (!state.changelog.some((c) => c.message === shortcutsFilterGridPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: shortcutsFilterGridPatch });
}

const markdownEditorPatch = 'Markdown editor helpers added for Notes + Edit Task next action (toolbar + safe formatted preview) with future rich-text adapter seam.';
if (!state.changelog.some((c) => c.message === markdownEditorPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: markdownEditorPatch });
}

const markdownToolbarUxPatch = 'Markdown toolbar UX fix: single-click now formats active selection reliably, avoids placeholder insertion when text is selected, and inserts clean caret-ready wrappers for empty selections (bold/italic/underline/lists).';
if (!state.changelog.some((c) => c.message === markdownToolbarUxPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: markdownToolbarUxPatch });
}

const stateSafetyPatch = 'State Safety Pack: automatic pre-write versioned backups + restore APIs + checksum metadata + Settings export/import controls with explicit overwrite confirmation.';
if (!state.changelog.some((c) => c.message === stateSafetyPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: stateSafetyPatch });
}

const musicStreamCompatibilityPatch = 'Patch: Music Player stream compatibility restored — non-direct live stream URLs now auto-fallback to embedded iframe mode while keeping YouTube and local audio behavior intact.';
if (!state.changelog.some((c) => c.message === musicStreamCompatibilityPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: musicStreamCompatibilityPatch });
}

const youtubePlaybackReliabilityPatch = 'Patch: Music Player YouTube playback reliability improved — watch/youtu.be/embed URL parsing normalized and Play now auto-queues until the YouTube API/player is fully ready.';
if (!state.changelog.some((c) => c.message === youtubePlaybackReliabilityPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: youtubePlaybackReliabilityPatch });
}

const stopControlIsolationPatch = 'Regression guard: Voice Note and Music pod Stop controls are now pod-scoped and isolated so each Stop action only targets its own subsystem.';
if (!state.changelog.some((c) => c.message === stopControlIsolationPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: stopControlIsolationPatch });
}

const sentinelStabilizationPatch = 'Sentinel stabilization pass: render side-effects decoupled from persistence via commitState(), startup shared-sync hydration lock added to prevent stale overwrite races, and QA smoke-check docs/guardrails added.';
if (!state.changelog.some((c) => c.message === sentinelStabilizationPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: sentinelStabilizationPatch });
}

const phase1aFoundationPatch = 'Phase 1A modular foundation: added pod contract/registry/layout/persistence scaffolding + adapter pods (Date/Calendar/Weather) with legacy render fallback for non-migrated pods.';
if (!state.changelog.some((c) => c.message === phase1aFoundationPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: phase1aFoundationPatch });
}

const phase1bLayoutPatch = 'Phase 1B layout + visibility: persisted utility pod row order and per-pod show/hide toggles in Settings with hydration-safe shared state sync.';
if (!state.changelog.some((c) => c.message === phase1bLayoutPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: phase1bLayoutPatch });
}

const cameraFeedPatch = 'Added Camera Feed pod (V1): single active feed with Embed Stream mode plus Snapshot Refresh fallback (configurable interval + optional local proxy relay).';
if (!state.changelog.some((c) => c.message === cameraFeedPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: cameraFeedPatch });
}

const cameraLocalWebcamPatch = 'Patch: Camera Feed now includes Local Webcam (Browser) mode with getUserMedia start/stop controls, status/error states, and optional camera device selection.';
if (!state.changelog.some((c) => c.message === cameraLocalWebcamPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: cameraLocalWebcamPatch });
}

const cameraResizePatch = 'Patch: Camera Feed pod is now drag-resizable (bottom-right handle) with persisted viewport size and one-click reset to default.';
if (!state.changelog.some((c) => c.message === cameraResizePatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: cameraResizePatch });
}

const rssPodPatch = 'Added Personalized RSS Feed pod (V1): server-side feed fetch, settings feed manager, mark-read + show-read controls, manual refresh, and persisted feed/read preferences.';
if (!state.changelog.some((c) => c.message === rssPodPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: rssPodPatch });
}

const liveStreamsPatch = 'Added Live Streams pod (V1): 6 source presets (YouTube/Twitch/Kick/Vaughn/Generic/Local), explicit embed-fallback status messaging, and persisted source inputs/presets.';
if (!state.changelog.some((c) => c.message === liveStreamsPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: liveStreamsPatch });
}

const liveStreamsVaughnPopoutPatch = 'Patch: Live Streams Vaughn handling now normalizes channel/page/embed/popout inputs to explicit embed targets and adds a Pop-out Player fallback (controlled popup) alongside Open in new tab.';
if (!state.changelog.some((c) => c.message === liveStreamsVaughnPopoutPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: liveStreamsVaughnPopoutPatch });
}

const liveStreamsV2Patch = 'Live Streams 2.0: upgraded the pod into a cleaner stream deck with clearer provider controls, preset management, a stronger player stage, and built-in fallback emphasis for blocked embeds.';
if (!state.changelog.some((c) => c.message === liveStreamsV2Patch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: liveStreamsV2Patch });
}

const liveStreamsPhase2APatch = 'Patch: Live Streams Phase 2A adds Rumble, X Live/Spaces, and Facebook Live presets with provider-specific normalization and explicit non-silent fallback messaging when embeds are blocked.';
if (!state.changelog.some((c) => c.message === liveStreamsPhase2APatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: liveStreamsPhase2APatch });
}

const dateWeatherMergePatch = 'Utility pod merge: Local Weather is now integrated into Date & Time (same slot) with forecast details and in-pod manual refresh; standalone Weather pod removed from layout controls.';
if (!state.changelog.some((c) => c.message === dateWeatherMergePatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: dateWeatherMergePatch });
}

const gasPricesPatch = 'New utility pod: Gas Price Tracker added with hybrid auto-fetch (AAA state averages via local proxy) + persistent manual override fallback.';
if (!state.changelog.some((c) => c.message === gasPricesPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: gasPricesPatch });
}

const speedTestPatch = 'New utility pod: Speed Test added with backend-preferred checks, browser estimate fallback, auto-run intervals, and persisted last-10 history + thresholds.';
if (!state.changelog.some((c) => c.message === speedTestPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: speedTestPatch });
}

const facebookFollowersPatch = 'New utility pod: Facebook Followers (Meta Graph) with 1-minute backend polling, stale-status badges, and manual refresh support.';
if (!state.changelog.some((c) => c.message === facebookFollowersPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: facebookFollowersPatch });
}

const socialFollowersMergePatch = 'Utility pod merge: Facebook, Instagram, TikTok, and YouTube audience stats now live in one Social Followers pod with per-network tiles and a shared refresh action.';
if (!state.changelog.some((c) => c.message === socialFollowersMergePatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: socialFollowersMergePatch });
}

save('startup_patch_seed', { pushShared: false });
loadApplicationVersion();
setupSettingsSectionNav();
setupSettingsPaneDragScroll();
renderAll();
startSystemMonitorPolling();
startSpeedTestAutoRun();
fetchSystemMonitorSnapshot();
setInterval(renderDateTime, 1000);
setInterval(() => renderSocialFollowersPod(), 60 * 1000);
setInterval(() => {
  if (document.hidden) return;
  if (state.layout?.visibility?.['ebay-traffic'] === false) return;
  renderEbayTrafficPod();
}, EBAY_TRAFFIC_POLL_INTERVAL_MS);
document.getElementById('weatherRefreshBtn')?.addEventListener('click', () => renderWeatherPod({ manual: true }));
document.getElementById('nbaRefreshBtn')?.addEventListener('click', () => renderNbaPod({ manual: true }));
document.getElementById('nbaScoresWidget')?.addEventListener('click', (e) => {
  const viewBtn = getEventClosestTarget(e, '[data-nba-view]');
  if (viewBtn) {
    const nextView = String(viewBtn.dataset.nbaView || '').trim();
    if (NBA_VIEW_MODES.has(nextView) && state.nba.viewMode !== nextView) {
      state.nba.viewMode = nextView;
      save('nba_view_changed');
    }
    renderNbaPod({ useCached: true });
    return;
  }

  const removeBtn = getEventClosestTarget(e, '[data-nba-favorite-remove]');
  if (removeBtn) {
    const team = String(removeBtn.dataset.nbaFavoriteRemove || '').trim().toUpperCase();
    const nextFavorites = state.nba.favoriteTeams.filter((abbr) => abbr !== team);
    if (nextFavorites.length !== state.nba.favoriteTeams.length) {
      state.nba.favoriteTeams = nextFavorites;
      save('nba_favorite_removed');
    }
    renderNbaPod({ useCached: true });
    return;
  }

  const addBtn = getEventClosestTarget(e, '[data-nba-favorite-add]');
  if (addBtn) {
    const select = document.getElementById('nbaFavoriteTeamSelect');
    const team = String(select?.value || '').trim().toUpperCase();
    if (team && !state.nba.favoriteTeams.includes(team)) {
      state.nba.favoriteTeams = normalizeNbaState({
        ...state.nba,
        favoriteTeams: [...state.nba.favoriteTeams, team],
      }).favoriteTeams;
      save('nba_favorite_added');
    }
    renderNbaPod({ useCached: true });
  }
});
document.getElementById('cryptoRefreshBtn')?.addEventListener('click', () => {
  if (Date.now() < cryptoRefreshCooldownUntil) {
    updateCryptoRefreshButton();
    return;
  }
  startCryptoRefreshCooldown();
  renderCryptoPod({ manual: true });
});
document.getElementById('rssRefreshBtn')?.addEventListener('click', () => renderRssPod({ manual: true }));
document.getElementById('unreadEmailRefreshBtn')?.addEventListener('click', () => renderUnreadEmailPod({ manual: true }));
document.getElementById('socialFollowersRefreshBtn')?.addEventListener('click', () => renderSocialFollowersPod({ manual: true }));
document.getElementById('socialFollowersWidget')?.addEventListener('click', (event) => {
  const analyticsBtn = getEventClosestTarget(event, '[data-social-analytics-open]');
  if (!analyticsBtn) return;
  openSocialAnalyticsDialog(analyticsBtn.dataset.socialAnalyticsOpen);
});
document.getElementById('socialAnalyticsDialogBody')?.addEventListener('click', (event) => {
  const rangeBtn = getEventClosestTarget(event, '[data-social-analytics-range]');
  if (!rangeBtn) return;
  const dialog = document.getElementById('socialAnalyticsDialog');
  const network = String(dialog?.dataset?.network || 'instagram').trim().toLowerCase();
  setSocialAnalyticsRange(network, String(rangeBtn.dataset.socialAnalyticsRange || '7d').trim().toLowerCase());
  renderInstagramAnalyticsDialog();
});
document.getElementById('socialAnalyticsDialogCloseBtn')?.addEventListener('click', () => document.getElementById('socialAnalyticsDialog')?.close());
document.getElementById('socialAnalyticsRefreshBtn')?.addEventListener('click', () => refreshSocialAnalyticsDialog());
document.getElementById('ebayTrafficRefreshBtn')?.addEventListener('click', () => renderEbayTrafficPod({ manual: true }));
document.getElementById('gasFetchBtn')?.addEventListener('click', async () => {
  const input = String(document.getElementById('gasLocationInput')?.value || '').trim();
  await fetchGasPricesAuto(input);
});
document.getElementById('gasManualSaveBtn')?.addEventListener('click', saveGasPricesManual);
document.getElementById('gasLocationInput')?.addEventListener('change', (e) => {
  state.gasPrices.location = String(e.target.value || '').trim().slice(0, 80);
  save('gas_prices_location_updated');
});
document.getElementById('rssShowReadToggle')?.addEventListener('change', (e) => {
  state.rss.showRead = !!e.target.checked;
  save('rss_show_read_toggled');
  renderRssPod({ skipFetch: true });
});
updateCryptoRefreshButton();

function closeDialogSmooth(dialog){
  if (!dialog || !dialog.open) return;
  if (dialog.classList.contains('closing')) return;
  dialog.classList.add('closing');
  setTimeout(() => {
    dialog.close();
    dialog.classList.remove('closing');
  }, 140);
}

remindersController.bind();

document.getElementById('startAlarmBtn')?.addEventListener('click', () => {
  const val = Number(document.getElementById('alarmMinutes')?.value || 0);
  if (!val || val < 1) return;
  startAlarm(val);
  logChange(`Started timer for ${val} minute(s)`);
});

document.getElementById('cancelAlarmBtn')?.addEventListener('click', () => {
  if (alarmEndTs) logChange('Canceled active timer');
  cancelAlarm();
});

enableProjectDragScroll();
enableBoardDragScroll();

window.addEventListener('storage', (event) => {
  if (event.key === SHARED_STATE_SYNC_EVENT_KEY && event.newValue) {
    scheduleSharedHydrate('storage_sync_event');
  }
});

window.addEventListener('beforeunload', () => {
  stopSystemMonitorPolling();
  stopSpeedTestAutoRun();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopSpeedTestAutoRun();
  } else {
    startSpeedTestAutoRun();
  }
});

try {
  if (typeof BroadcastChannel !== 'undefined') {
    sharedSyncChannel = new BroadcastChannel(SHARED_STATE_SYNC_CHANNEL);
    sharedSyncChannel.addEventListener('message', () => {
      scheduleSharedHydrate('broadcast_channel_sync');
    });
  }
} catch {}

window.__MISSION_CONTROL_QA__ = {
  resetLocalState(){
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CRYPTO_DIR_CACHE_KEY);
    localStorage.removeItem(CRYPTO_WATCH_CACHE_KEY);
    location.reload();
  },
  debugSnapshot(){
    return window.__MISSION_CONTROL_DEBUG__?.snapshot?.() || {};
  },
  undoDebug(){
    return { ...undoState, timer: !!undoState.timer };
  },
  syncDebug(){
    return {
      sharedHydrationResolved,
      sharedHydrationLastOutcome,
      sharedHydrateInFlight: !!sharedHydrateInFlight,
      sharedHydrateLastRunAt,
      sharedPushPendingUntilHydration,
    };
  },
};

// Cross-browser sync bootstrap: pull shared disk-backed state if available.
hydrateStateFromSharedApi().then((hydrated) => {
  sharedHydrationResolved = true;
  sharedHydrationLastOutcome = hydrated ? 'hydrated' : 'seeded_local';

  if (!hydrated) {
    // Seed the shared store from the first browser that opens the dashboard.
    pushStateToSharedApi('startup_seed_no_remote_state');
    flushPendingSharedPush('startup_flush_pending_after_seed');
    return;
  }

  renderAll();
  flushPendingSharedPush('startup_flush_pending_after_hydration');
}).catch(() => {
  sharedHydrationResolved = true;
  sharedHydrationLastOutcome = 'hydrate_failed_local_only';
  flushPendingSharedPush('startup_flush_pending_after_hydrate_error');
});
