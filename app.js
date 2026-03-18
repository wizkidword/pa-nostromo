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
const debugCounters = window.MissionControlModules?.debug || null;

const COLUMNS = [
  ['inbox', 'Inbox'],
  ['ideas', 'Ideas'],
  ['in_progress', 'In Progress'],
  ['waiting_blocked', 'Waiting / Blocked'],
  ['ready_to_publish', 'Ready to Publish'],
  ['done', 'Done'],
];

const DEFAULT_SETTINGS = {
  theme: 'dark', // dark | light | system
  weatherIntervalMin: 15,
  defaultTaskColumn: 'inbox',
};

const DEFAULT_UTILITY_LAYOUT_ROWS = [
  ['shortcuts'],
  ['date-time', 'calendar', 'weather'],
  ['nba-scores', 'crypto-tracker', 'rss-feed'],
  ['camera-feed', 'live-streams'],
  ['voice-note', 'voice-to-rowan', 'music-player'],
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
  const incomingRows = Array.isArray(layoutInput?.utilityRows) ? layoutInput.utilityRows : fallbackRows;
  const seen = new Set();
  const rows = incomingRows
    .map((row) => Array.isArray(row) ? row.map((v) => String(v || '').trim()).filter(Boolean) : [])
    .map((row) => row.filter((podId) => {
      if (seen.has(podId)) return false;
      seen.add(podId);
      return true;
    }))
    .filter((row) => row.length > 0);

  const allKnown = [...new Set([...fallbackIds, ...knownPodIds.map((v) => String(v || '').trim()).filter(Boolean)])];
  const missing = allKnown.filter((podId) => !seen.has(podId));
  if (!rows.length) rows.push([...fallbackRows[0]]);
  if (missing.length) rows.push(missing);

  const visibilityInput = (layoutInput && typeof layoutInput.visibility === 'object' && layoutInput.visibility)
    ? layoutInput.visibility
    : {};
  const visibility = {};
  const rowIds = rows.flat();
  for (const podId of rowIds) {
    visibility[podId] = visibilityInput[podId] !== false;
  }

  return { utilityRows: rows, visibility };
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
  cryptoWatchlist: ['bitcoin', 'ethereum'],
  cryptoHoldings: {},
  musicPlayer: {
    sourceType: 'stream', // stream | local
    currentStreamUrl: '',
    streamMode: 'unknown', // youtube | direct | embed | unknown
    favoriteStreamUrl: '',
    currentTrackName: '',
    volume: 0.7,
    isPlaying: false,
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

let state = load();
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
  'nba-scores': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'rss-feed': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
  'crypto-tracker': { count: 0, backoffUntil: 0, lastLogAt: 0, lastReason: '' },
};
let changeLogVisible = false;
let changeLogLimit = 10;
let pendingChanges = [];
let alarmTimer = null;
let alarmEndTs = null;
let alarmAudioCtx = null;
let alarmRepeatTimer = null;
let selectedCalendarDate = null;
let streamIframePlayer = null;
let youtubeApiLoading = false;
let youtubePlayerReady = false;
let pendingYoutubeAction = null;
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

function id(){ return Math.random().toString(36).slice(2,10); }
function now(){ return new Date().toISOString(); }
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
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  state.settings.shortcutsFilterProjectIds = Array.isArray(state.settings.shortcutsFilterProjectIds)
    ? state.settings.shortcutsFilterProjectIds
    : [];
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
    currentStreamUrl: '',
    streamMode: 'unknown',
    favoriteStreamUrl: '',
    currentTrackName: '',
    volume: 0.7,
    isPlaying: false,
    ...(state.musicPlayer || {}),
  };
  state.musicPlayer.volume = Math.min(1, Math.max(0, Number(state.musicPlayer.volume ?? 0.7)));

  state.cameraFeed = {
    sourceUrl: '',
    mode: 'stream',
    refreshIntervalSec: 5,
    active: false,
    status: 'idle',
    lastError: '',
    useProxy: true,
    deviceId: '',
    viewportWidth: 640,
    viewportHeight: 360,
    ...(state.cameraFeed || {}),
  };
  state.cameraFeed.mode = ['stream', 'snapshot', 'local'].includes(state.cameraFeed.mode) ? state.cameraFeed.mode : 'stream';
  state.cameraFeed.sourceUrl = String(state.cameraFeed.sourceUrl || '').trim();
  const refresh = Number(state.cameraFeed.refreshIntervalSec ?? 5);
  state.cameraFeed.refreshIntervalSec = Number.isFinite(refresh) ? Math.min(60, Math.max(1, Math.round(refresh))) : 5;
  state.cameraFeed.status = ['idle', 'loading', 'live', 'error'].includes(state.cameraFeed.status) ? state.cameraFeed.status : 'idle';
  state.cameraFeed.active = !!state.cameraFeed.active;
  state.cameraFeed.lastError = String(state.cameraFeed.lastError || '').slice(0, 300);
  state.cameraFeed.useProxy = state.cameraFeed.useProxy !== false;
  state.cameraFeed.deviceId = String(state.cameraFeed.deviceId || '');
  state.cameraFeed.viewportWidth = Number.isFinite(Number(state.cameraFeed.viewportWidth))
    ? Math.min(1200, Math.max(280, Math.round(Number(state.cameraFeed.viewportWidth))))
    : 640;
  state.cameraFeed.viewportHeight = Number.isFinite(Number(state.cameraFeed.viewportHeight))
    ? Math.min(900, Math.max(180, Math.round(Number(state.cameraFeed.viewportHeight))))
    : 360;

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

  state.changelog = Array.isArray(state.changelog) ? state.changelog : [];

  const portfolioPatchNote = 'Patch: Crypto Tracker now supports portfolio holdings (qty + avg buy) with unrealized P/L summary.';
  if (!state.changelog.some((entry) => entry?.message === portfolioPatchNote)) {
    state.changelog.unshift({ id: id(), ts: now(), message: portfolioPatchNote });
    state.changelog = state.changelog.slice(0, 200);
  }

  // Ensure reminder task exists for pod drag/drop idea.
  const mission = (state.projects || []).find((p) => p.name === 'Mission Control Dashboard');
  const taskTitle = 'Evaluate draggable/reorderable pods (drag-drop layout + reset layout)';
  const existingPodTask = (state.tasks || []).find((t) => t.title === taskTitle);
  if (mission && !existingPodTask) {
    state.tasks.push({
      id: id(),
      title: taskTitle,
      projectId: mission.id,
      column: 'ideas',
      blockerType: null,
      owner: 'Rowan',
      nextAction: 'Design Phase 2 approach for draggable pod reordering with local persistence.',
      dueDate: '',
      createdAt: now(),
      updatedAt: now(),
    });
  } else if (existingPodTask) {
    existingPodTask.column = 'ideas';
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

async function writeStateToSharedApi(payload){
  const res = await fetch(SHARED_STATE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let details = '';
    try {
      const errBody = await res.json();
      details = errBody?.message || errBody?.error || '';
    } catch {
      // ignore
    }
    throw new Error(details || `State sync failed (HTTP ${res.status})`);
  }

  return res.json().catch(() => null);
}

async function pushStateToSharedApi(reason = 'unspecified'){
  if (!sharedHydrationResolved) {
    sharedPushPendingUntilHydration = true;
    return false;
  }

  try {
    await writeStateToSharedApi(state);
    broadcastCrossTabSync('state_changed', { reason });
    return true;
  } catch {
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backupFile }),
          });
          const payload = await resp.json();
          if (!resp.ok || !payload?.ok) throw new Error(payload?.message || payload?.error || `HTTP ${resp.status}`);
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

  await writeStateToSharedApi({
    ...incoming,
    __writeControl: {
      overrideDowngrade: true,
      source: 'manual_import',
      explicitLiveOverride: true,
    },
  });

  applyIncomingState(incoming, { render: true });
  broadcastCrossTabSync('state_imported', { reason: 'manual_import' });
}

function projectName(projectId){ return state.projects.find(p=>p.id===projectId)?.name || 'Unknown'; }
function missionControlProjectId(){
  return state.projects.find((p) => p.name === 'Mission Control Dashboard')?.id || '';
}
function projectDisplayName(projectId){
  if (projectId === SHORTCUT_GLOBAL_PROJECT_ID) return 'Global (Mission Control)';
  return projectName(projectId);
}

function applyTheme(){
  const pref = state.settings.theme;
  let theme = pref;
  if (pref === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.body.classList.toggle('theme-light', theme === 'light');
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

function renderChangeLog(){
  const section = document.getElementById('changeLogSection');
  const toggleBtn = document.getElementById('toggleChangeLogBtn');
  const el = document.getElementById('changeLogList');
  const moreBtn = document.getElementById('changeLogLoadMoreBtn');
  if (!section || !toggleBtn || !el) return;

  section.style.display = changeLogVisible ? 'block' : 'none';
  toggleBtn.textContent = changeLogVisible ? 'Hide Patch Notes' : 'Show Patch Notes';

  if (!changeLogVisible) return;

  if (!state.changelog.length) {
    el.innerHTML = '<div class="note-meta">No patch notes yet.</div>';
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  const shown = state.changelog.slice(0, changeLogLimit);
  el.innerHTML = shown
    .map((c)=>`<div class="change-log-item"><strong>${new Date(c.ts).toLocaleString()}</strong><br/>${escapeHtml(c.message)}</div>`)
    .join('');

  if (moreBtn) {
    moreBtn.style.display = state.changelog.length > changeLogLimit ? 'inline-block' : 'none';
  }
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (state.settings.theme === 'system') applyTheme();
});

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
  if (!alarmEndTs) {
    el.textContent = 'No active timer';
    return;
  }
  const remaining = alarmEndTs - Date.now();
  if (remaining <= 0) {
    el.textContent = '⏰ Timer done! (repeating every 10s until canceled)';
    alarmEndTs = null;
    if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
    playAlarmTone();
    if (alarmRepeatTimer) clearInterval(alarmRepeatTimer);
    alarmRepeatTimer = setInterval(playAlarmTone, 10 * 1000);
    return;
  }
  el.textContent = `Timer running: ${formatRemaining(remaining)} remaining`;
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
  el.innerHTML = `
    <div style="font-size:28px;font-weight:700;color:var(--text)">${nowDt.toLocaleTimeString()}</div>
    <div style="margin-top:4px">${nowDt.toLocaleDateString(undefined,{weekday:'long', year:'numeric', month:'long', day:'numeric'})}</div>
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

  const reminderDates = new Set(state.reminders.map((r)=>r.date));
  const heads = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-cell cal-head">${d}</div>`).join('');
  let cells = '';
  for (let i=0;i<start;i++) cells += '<div class="cal-cell" style="opacity:.25">&nbsp;</div>';
  for (let d=1; d<=days; d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = key===todayKey;
    const isSel = key===selectedCalendarDate;
    const has = reminderDates.has(key);
    cells += `<div class="cal-cell ${isToday?'cal-today':''} ${isSel?'selected':''} ${has?'has-reminder':''}" data-date="${key}">${d}</div>`;
  }
  el.innerHTML = `<div class="note-meta">${nowDt.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</div><div class="calendar-grid">${heads}${cells}</div>`;

  el.querySelectorAll('[data-date]').forEach((cell)=>{
    cell.addEventListener('click', ()=>{
      selectedCalendarDate = cell.dataset.date;
      renderCalendar();
      renderCalendarRemindersPanel();
    });
  });
}

function renderCalendarRemindersPanel(){
  const label = document.getElementById('calendarSelectedDate');
  const list = document.getElementById('calendarDayReminders');
  if (!label || !list) return;
  if (!selectedCalendarDate) {
    label.textContent = 'Select a date';
    list.innerHTML = '<div class="note-meta">No reminders.</div>';
    return;
  }

  label.textContent = `Selected: ${selectedCalendarDate}`;
  const items = state.reminders.filter((r)=>r.date===selectedCalendarDate).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  if (!items.length) {
    list.innerHTML = '<div class="note-meta">No reminders for this date.</div>';
    return;
  }

  list.innerHTML = items.map((r)=>`<div class="change-log-item"><strong>${r.time || 'Anytime'}</strong> — ${escapeHtml(r.text)} <button class="btn note-delete" data-rem-del="${r.id}" style="padding:4px 8px;margin-left:8px">Delete</button></div>`).join('');
  list.querySelectorAll('[data-rem-del]').forEach((b)=>{
    b.addEventListener('click', ()=>{
      deleteWithUndo({
        collection: () => state.reminders,
        itemId: b.dataset.remDel,
        reason: 'calendar_reminder_deleted',
        buildUndoLabel: (r) => `Reminder deleted (${r?.time || 'Anytime'}). Undo?`,
      });
    });
  });
}

function renderTodayReminders(){
  const el = document.getElementById('todayReminders');
  if (!el) return;
  const today = dateKey(new Date());
  const items = state.reminders.filter((r)=>r.date===today).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  if (!items.length) {
    el.innerHTML = '<div class="note-meta">No reminders for today.</div>';
    return;
  }
  el.innerHTML = items.map((r)=>`<div class="change-log-item"><strong>${r.time || 'Anytime'}</strong> — ${escapeHtml(r.text)}</div>`).join('');
}

function renderSettings(){
  const theme = document.getElementById('settingTheme');
  const weather = document.getElementById('settingWeatherInterval');
  const col = document.getElementById('settingDefaultTaskColumn');
  const fs = document.getElementById('settingFullscreen');
  const rssInterval = document.getElementById('settingRssInterval');
  renderChangeLog();
  if (theme) theme.value = state.settings.theme;
  if (weather) weather.value = String(state.settings.weatherIntervalMin);
  if (col) col.value = state.settings.defaultTaskColumn;
  if (fs) fs.checked = !!document.fullscreenElement;
  if (rssInterval) rssInterval.value = String(state.rss?.refreshIntervalMin || RSS_DEFAULT_REFRESH_MIN);

  const taskColumnSelect = document.querySelector('#taskForm select[name="column"]');
  if (taskColumnSelect && !taskColumnSelect.value) {
    taskColumnSelect.value = state.settings.defaultTaskColumn;
  }

  renderPodVisibilitySettings();
  mountRssSettingsFeeds();
  if (settingsPanel?.classList.contains('open')) refreshStateSafetyBackups();
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
    // 1) Resolve ZIP to precise lat/lon (US ZIP endpoint)
    const zipRes = await fetch(`https://api.zippopotam.us/us/${LOCAL_ZIP}`);
    if (!zipRes.ok) {
      const err = new Error(`ZIP lookup failed (${zipRes.status})`);
      err.status = zipRes.status;
      throw err;
    }
    const zipJson = await zipRes.json();
    const place = zipJson?.places?.[0];
    const lat = Number(place?.latitude);
    const lon = Number(place?.longitude);

    // 2) Pull current + daily weather from Open-Meteo
    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=${encodeURIComponent(LOCAL_TZ)}`;
    const wxRes = await fetch(wxUrl);
    if (!wxRes.ok) {
      const err = new Error(`Weather upstream failed (${wxRes.status})`);
      err.status = wxRes.status;
      throw err;
    }
    const wx = await wxRes.json();

    const current = wx?.current || {};
    const daily = wx?.daily || {};
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
    const desc = codeMap[current.weather_code] || 'Current conditions';

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
        <div class="forecast-item">
          <div class="forecast-day">${day}</div>
          <div class="forecast-icon">${iconForCode(code)}</div>
          <div class="forecast-cond">${c}</div>
          <div class="forecast-temp">H ${h}° / L ${l}°</div>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div style="font-size:22px;font-weight:700;color:var(--text)">${Math.round(current.temperature_2m ?? 0)}°F</div>
      <div>${desc} · ${place['place name']}, ${place['state abbreviation']}</div>
      <div class="note-meta">Feels like ${Math.round(current.apparent_temperature ?? 0)}°F · Humidity ${current.relative_humidity_2m ?? '--'}%</div>
      <div class="note-meta">Today: H ${hi != null ? Math.round(hi) : '--'}°F / L ${lo != null ? Math.round(lo) : '--'}°F</div>
      <div style="margin-top:8px"><strong>3-Day Forecast</strong></div>
      <div class="forecast-row">${forecast}</div>
    `;
    clearPollingBackoff('weather');
    if (ts) ts.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    const backoffMs = registerPollingFailure('weather', error, 'Weather service temporarily unavailable');
    el.textContent = 'Weather unavailable right now.';
    if (ts) ts.textContent = `Update delayed: retry in ${Math.ceil(backoffMs / 1000)}s`;
  }
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
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error(`NBA upstream failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const events = Array.isArray(data?.events) ? data.events : [];

    if (!events.length) {
      el.innerHTML = '<div class="note-meta">No NBA games scheduled for today.</div>';
      clearPollingBackoff('nba-scores');
      if (ts) ts.textContent = `Updated: ${new Date().toLocaleTimeString()} (EST today)`;
      return;
    }

    const cards = events.map((event) => {
      const comp = event?.competitions?.[0];
      const teams = comp?.competitors || [];
      const away = teams.find((t) => t?.homeAway === 'away');
      const home = teams.find((t) => t?.homeAway === 'home');
      const statusType = comp?.status?.type;
      const statusText = comp?.status?.type?.shortDetail || comp?.status?.type?.description || 'Scheduled';

      const awayName = away?.team?.abbreviation || away?.team?.shortDisplayName || 'Away';
      const homeName = home?.team?.abbreviation || home?.team?.shortDisplayName || 'Home';
      const awayScore = away?.score ?? '-';
      const homeScore = home?.score ?? '-';

      const isLive = statusType?.state === 'in';
      const isFinal = statusType?.completed === true;
      const badge = isLive ? 'LIVE' : (isFinal ? 'FINAL' : 'UPCOMING');

      const espnLink =
        event?.links?.find((l) => /box score|gamecast|recap/i.test(l?.text || ''))?.href ||
        event?.links?.[0]?.href ||
        comp?.links?.find((l) => /box score|gamecast|recap/i.test(l?.text || ''))?.href ||
        comp?.links?.[0]?.href ||
        '';

      return `
        <div class="change-log-item" style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <strong>${escapeHtml(awayName)} ${escapeHtml(String(awayScore))} - ${escapeHtml(homeName)} ${escapeHtml(String(homeScore))}</strong>
            <span class="badge">${badge}</span>
          </div>
          <div class="note-meta" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>${escapeHtml(statusText)}</span>
            ${espnLink ? `<a class="btn ghost" href="${encodeURI(espnLink)}" target="_blank" rel="noopener">Box Score</a>` : ''}
          </div>
        </div>
      `;
    }).join('');

    el.innerHTML = `<div class="scroll-box nba-scroll">${cards}</div>`;
    clearPollingBackoff('nba-scores');
    if (ts) ts.textContent = `Updated: ${new Date().toLocaleTimeString()} (auto: every 15 min)`;
  } catch (error) {
    const backoffMs = registerPollingFailure('nba-scores', error, 'NBA feed temporarily unavailable');
    el.textContent = 'NBA scores unavailable right now.';
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

function setPodStatusSignal(podId, status = 'fresh', detail = ''){
  const el = document.getElementById(`${podId}StatusSignal`);
  if (!el) return;
  const normalized = ['fresh', 'stale', 'error'].includes(String(status).toLowerCase())
    ? String(status).toLowerCase()
    : 'fresh';
  const labelMap = {
    fresh: 'Fresh',
    stale: 'Stale',
    error: 'Error',
  };
  el.className = `badge pod-signal pod-signal-${normalized}`;
  el.textContent = detail ? `${labelMap[normalized]} · ${detail}` : labelMap[normalized];
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

async function fetchJsonWithTimeout(url, timeoutMs = 12000){
  const controller = new AbortController();
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

async function fetchWatchFromCoinGecko(watchIds){
  if (!watchIds.length) return [];
  const watchUrl = `${CRYPTO_PROXY_API}/coingecko/coins/markets?vs_currency=usd&ids=${encodeURIComponent(watchIds.join(','))}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
  const watchRes = await fetchJsonWithTimeout(watchUrl);
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

async function fetchWatchFromCoinCap(watchIds){
  if (!watchIds.length) return [];
  const idToSymbol = mapCoinIdToSymbolMap();
  const symbols = [...new Set(watchIds.map((id) => idToSymbol.get(id)).filter(Boolean))];
  if (!symbols.length) return [];

  const assetsRes = await fetchJsonWithTimeout(`${CRYPTO_PROXY_API}/coincap/assets?limit=2000`);
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

async function fetchWatchFromCryptoCompare(watchIds){
  if (!watchIds.length) return [];
  const idToSymbol = mapCoinIdToSymbolMap();
  const symbols = [...new Set(watchIds.map((id) => idToSymbol.get(id)).filter(Boolean))];
  if (!symbols.length) return [];

  const fsyms = symbols.join(',');
  const priceUrl = `${CRYPTO_PROXY_API}/cryptocompare/data/pricemultifull?fsyms=${encodeURIComponent(fsyms)}&tsyms=USD`;
  const res = await fetchJsonWithTimeout(priceUrl);
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

async function fetchCryptoWatchWithFailover(watchIds){
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
    isRetryableError(error){
      return failoverApi.defaultIsRetryableError(error);
    },
    async tryProvider(provider){
      if (provider === 'coingecko') return fetchWatchFromCoinGecko(watchIds);
      if (provider === 'coincap') return fetchWatchFromCoinCap(watchIds);
      if (provider === 'cryptocompare') return fetchWatchFromCryptoCompare(watchIds);
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

function renderCryptoWidget(el, watch){
  let totalValue = 0;
  let totalCostBasis = 0;

  const row = (c) => {
    const change = Number(c.price_change_percentage_24h || 0);
    const color = change >= 0 ? '#22c55e' : '#ef4444';
    const coinId = String(c.id || '').toLowerCase();
    const holding = state.cryptoHoldings?.[coinId] || { quantity: 0, avgBuyPrice: 0 };
    const quantity = Number(holding.quantity || 0);
    const avgBuyPrice = Number(holding.avgBuyPrice || 0);
    const currentPrice = Number(c.current_price || 0);

    const positionValue = quantity * currentPrice;
    const costBasis = quantity * avgBuyPrice;
    const pnl = positionValue - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

    totalValue += positionValue;
    totalCostBasis += costBasis;

    const pnlColor = pnl >= 0 ? '#22c55e' : '#ef4444';

    return `
      <div class="change-log-item" style="margin-bottom:8px;">
        <div class="row-between-wrap">
          <strong>${escapeHtml((c.symbol || '').toUpperCase())} · ${formatUsdPrice(c.current_price)}</strong>
          <span style="color:${color};font-weight:700;">${change.toFixed(2)}%</span>
        </div>
        <div class="note-meta row-between-wrap" style="margin-top:4px;">
          <span>${escapeHtml(c.name || c.id || '')} · MCap: $${Number(c.market_cap || 0).toLocaleString()}</span>
          <button class="btn ghost" data-crypto-remove="${escapeHtml(c.id)}">Remove</button>
        </div>
        <div class="row-wrap" style="margin-top:6px;gap:6px;">
          <label class="note-meta">Qty <input data-crypto-qty="${escapeHtml(c.id)}" type="number" min="0" step="any" value="${Number.isFinite(quantity) ? quantity : 0}" style="width:110px;" /></label>
          <label class="note-meta">Avg $ <input data-crypto-avg="${escapeHtml(c.id)}" type="number" min="0" step="any" value="${Number.isFinite(avgBuyPrice) ? avgBuyPrice : 0}" style="width:120px;" /></label>
        </div>
        <div class="note-meta" style="margin-top:6px;line-height:1.4;">
          Position: ${formatUsdPrice(positionValue)} · Cost: ${formatUsdPrice(costBasis)}
          <span style="color:${pnlColor};font-weight:700;"> · P/L: ${formatSignedUsd(pnl)} (${pnl > 0 ? '+' : ''}${pnlPct.toFixed(2)}%)</span>
        </div>
      </div>
    `;
  };

  const rowsHtml = watch.length ? watch.map((c) => row(c)).join('') : '<div class="note-meta">No watchlist coins yet.</div>';

  const totalPnl = totalValue - totalCostBasis;
  const totalPnlPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;
  const totalPnlColor = totalPnl >= 0 ? '#22c55e' : '#ef4444';

  el.innerHTML = `
    <div class="row-wrap" style="margin-bottom:8px;">
      <input id="cryptoAddInput" placeholder="Search coin (e.g. btc, ethereum, solana)" />
      <button id="cryptoAddBtn" class="btn">Add</button>
      <button id="cryptoDirRefreshBtn" class="btn ghost">Refresh List</button>
    </div>
    <div id="cryptoAddHint" class="note-meta"></div>
    <div class="change-log-item mt8" style="margin-bottom:8px;">
      <div><strong>💼 Portfolio</strong></div>
      <div class="note-meta" style="line-height:1.4;margin-top:4px;">
        Value: ${formatUsdPrice(totalValue)} · Cost: ${formatUsdPrice(totalCostBasis)}
        <span style="color:${totalPnlColor};font-weight:700;"> · Unrealized: ${formatSignedUsd(totalPnl)} (${totalPnl > 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%)</span>
      </div>
    </div>
    <div class="mt8"><strong>👀 Watchlist</strong></div>
    <div>${rowsHtml}</div>
  `;

  const addInput = document.getElementById('cryptoAddInput');
  const hint = document.getElementById('cryptoAddHint');

  const renderHintMatches = () => {
    if (!hint) return;
    const val = (addInput?.value || '').trim().toLowerCase();
    if (!val) {
      hint.textContent = 'Tip: add by ticker, name, or id.';
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
    if (btn) btn.textContent = 'Refresh List';
    if (hint) hint.textContent = `Coin list refreshed (${coinDirectory.length.toLocaleString()} coins).`;
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
      if (ts) ts.textContent = `Updated: ${new Date(cached.updatedAt).toLocaleTimeString()} · stale cache (${Math.ceil(backoffLeftMs / 1000)}s backoff) · Data: ${providerLabel} · ${formatLastSuccessMeta(cryptoLastSuccessAt, cryptoLastSuccessProvider)}`;
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
    if (ts) ts.textContent = `Updated: ${new Date(updatedAt).toLocaleTimeString()} (watchlist + portfolio · auto: every 15 min) · Data: ${providerLabel}${fallbackNote}${retryNote}${failureNote} · ${formatLastSuccessMeta(cryptoLastSuccessAt, cryptoLastSuccessProvider)}`;
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
      if (ts) ts.textContent = `Updated: ${new Date(cached.updatedAt).toLocaleTimeString()} · stale cache (${reasonDetail}; retry in ${Math.ceil(backoffMs / 1000)}s) · Data: ${providerLabel} · ${formatLastSuccessMeta(cryptoLastSuccessAt || cached.updatedAt, cryptoLastSuccessProvider || cached.provider)}`;
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
    <div class="change-log-item row-between-wrap" style="gap:8px;align-items:flex-start;">
      <div style="min-width:0;">
        <div style="font-weight:600;word-break:break-all;">${escapeHtml(feed.url)}</div>
        <div class="note-meta">${escapeHtml(feed.tag || 'General')}</div>
      </div>
      <button class="btn note-delete" data-rss-feed-remove="${feed.id}" type="button">Remove</button>
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

  if (!allItems.length) {
    el.innerHTML = '<div class="note-meta">No feed items yet. Add a feed in Settings, then refresh.</div>';
  } else if (!visible.length) {
    el.innerHTML = '<div class="note-meta">All caught up. Enable “Show read” to review older items.</div>';
  } else {
    el.innerHTML = `<div class="rss-list">${visible.slice(0, 40).map((item) => {
      const isRead = readIds.has(item.id);
      const published = item.publishedAt ? new Date(item.publishedAt).toLocaleString() : 'Unknown time';
      return `
        <div class="change-log-item ${isRead ? 'is-read' : ''}" style="margin-bottom:8px;">
          <div class="row-between-wrap" style="gap:8px;align-items:flex-start;">
            <a href="${encodeURI(item.link)}" target="_blank" rel="noopener" style="font-weight:700;line-height:1.35;">${escapeHtml(item.title || 'Untitled')}</a>
            ${isRead ? '' : `<button class="btn ghost" data-rss-read="${item.id}" type="button">Mark read</button>`}
          </div>
          <div class="note-meta" style="margin-top:4px;">${escapeHtml(item.feedTitle || item.tag || 'Feed')} · ${escapeHtml(published)}</div>
          ${item.summary ? `<div class="note-meta" style="margin-top:4px;line-height:1.45;">${escapeHtml(item.summary)}</div>` : ''}
        </div>
      `;
    }).join('')}</div>`;

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
    pendingYoutubeAction = null;
    state.musicPlayer.isPlaying = true;
    save();
    setMusicStatus('Playing YouTube stream (audio via embed player).');
    return true;
  }

  pendingYoutubeAction = null;
  return false;
}

function initYouTubePlayerIfReady(){
  const iframe = document.getElementById('musicStreamIframe');
  if (!iframe || !window.YT?.Player) return false;

  youtubePlayerReady = false;
  try {
    if (streamIframePlayer?.destroy) streamIframePlayer.destroy();
  } catch {}

  streamIframePlayer = new window.YT.Player('musicStreamIframe', {
    events: {
      onReady: () => {
        youtubePlayerReady = true;
        syncMusicVolume(state.musicPlayer.volume);
        runPendingYoutubeAction();
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

function setMusicStatus(text){
  const el = document.getElementById('musicPlayerStatus');
  if (el) el.textContent = text;
}

function syncMusicVolume(value){
  const vol = Math.min(1, Math.max(0, Number(value || 0)));
  state.musicPlayer.volume = vol;
  const { audio } = getMusicEls();
  if (audio) audio.volume = vol;
  if (streamIframePlayer?.setVolume) streamIframePlayer.setVolume(Math.round(vol * 100));
}

function loadStreamIntoPlayer(url){
  const { iframe, audio } = getMusicEls();
  if (!iframe || !audio) return;

  const rawUrl = String(url || '').trim();
  const ytId = extractYoutubeId(rawUrl);
  if (ytId) {
    state.musicPlayer.streamMode = 'youtube';
    youtubePlayerReady = false;
    audio.pause();
    audio.removeAttribute('src');
    iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(ytId)}?enablejsapi=1&autoplay=0&playsinline=1`;
    ensureYoutubeApi();
    if (window.YT?.Player) initYouTubePlayerIfReady();
    setMusicStatus('YouTube stream loaded. Press Play to start.');
    return;
  }

  state.musicPlayer.streamMode = 'direct';
  pendingYoutubeAction = null;
  iframe.src = '';
  audio.src = rawUrl;
  audio.volume = state.musicPlayer.volume;
  setMusicStatus('Direct stream URL loaded in HTML5 audio player.');
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
      setMusicStatus('YouTube player is loading — play will start automatically when ready.');
    }
    return;
  }

  if (state.musicPlayer.streamMode === 'embed') {
    if (iframe && iframe.src !== url) iframe.src = url;
    state.musicPlayer.isPlaying = true;
    save();
    setMusicStatus('Embed stream active. Use controls inside the embedded player if needed.');
    return;
  }

  if (audio) {
    if (!audio.src) audio.src = url;
    audio.play().then(() => {
      state.musicPlayer.isPlaying = true;
      save();
      setMusicStatus('Playing direct stream URL via HTML5 audio.');
    }).catch(() => {
      if (iframe) {
        state.musicPlayer.streamMode = 'embed';
        audio.pause();
        iframe.src = url;
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
  if (state.musicPlayer.sourceType === 'local' || state.musicPlayer.streamMode === 'direct') {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  } else if (state.musicPlayer.streamMode === 'youtube' && streamIframePlayer?.stopVideo) {
    streamIframePlayer.stopVideo();
  } else if (state.musicPlayer.streamMode === 'embed' && iframe) {
    iframe.src = '';
  }
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

  el.innerHTML = `
    <div class="music-player-shell" data-pod="music-player">
      <input id="musicStreamUrlInput" data-music-role="stream-input" placeholder="YouTube/live stream URL" value="${streamVal}" />
      <div class="row-wrap">
        <button id="musicLoadStreamBtn" data-music-role="load-stream" class="btn">Load Stream</button>
        <button id="musicSaveFavoriteBtn" data-music-role="save-favorite" class="btn ghost">Save Favorite</button>
        <button id="musicUseFavoriteBtn" data-music-role="use-favorite" class="btn ghost" ${hasFav ? '' : 'disabled'}>Use Favorite</button>
      </div>
      <div class="row-wrap">
        <input id="musicLocalFileInput" data-music-role="local-file" type="file" accept="audio/*" />
      </div>
      <div class="music-player-controls">
        <button id="musicPlayBtn" data-music-role="play" class="btn">Play</button>
        <button id="musicPauseBtn" data-music-role="pause" class="btn ghost">Pause</button>
        <button id="musicStopBtn" data-music-role="stop" class="btn ghost">Stop</button>
      </div>
      <label class="music-player-mini">Volume
        <input id="musicVolumeInput" data-music-role="volume" type="range" min="0" max="1" step="0.05" value="${state.musicPlayer.volume}">
      </label>
      <iframe id="musicStreamIframe" data-music-role="iframe" class="music-player-hidden" allow="autoplay; encrypted-media" title="Music stream player"></iframe>
      <audio id="musicLocalAudio" data-music-role="audio" class="music-player-hidden" preload="metadata"></audio>
      <div class="music-player-mini">Source: ${state.musicPlayer.sourceType === 'local' ? 'Local file' : 'Stream URL'}${hasFav ? ' · Favorite saved' : ''}</div>
    </div>
  `;

  const els = getMusicEls();
  if (els.audio) els.audio.volume = state.musicPlayer.volume;

  const musicPod = el.querySelector('[data-pod="music-player"]');
  // Regression guard: bind controls only within the Music pod root so sibling pods cannot trigger music actions.
  musicPod?.querySelector('[data-music-role="load-stream"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const url = (els.streamInput?.value || '').trim();
    if (!url) return;
    state.musicPlayer.sourceType = 'stream';
    state.musicPlayer.currentStreamUrl = url;
    state.musicPlayer.currentTrackName = 'Stream URL';
    save();
    loadStreamIntoPlayer(url);
  });

  musicPod?.querySelector('[data-music-role="save-favorite"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const url = (els.streamInput?.value || state.musicPlayer.currentStreamUrl || '').trim();
    if (!url) return;
    state.musicPlayer.favoriteStreamUrl = url;
    save();
    renderMusicPlayer();
    setMusicStatus('Saved favorite stream URL.');
  });

  musicPod?.querySelector('[data-music-role="use-favorite"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!state.musicPlayer.favoriteStreamUrl) return;
    state.musicPlayer.sourceType = 'stream';
    state.musicPlayer.currentStreamUrl = state.musicPlayer.favoriteStreamUrl;
    save();
    renderMusicPlayer();
    loadStreamIntoPlayer(state.musicPlayer.currentStreamUrl);
  });

  musicPod?.querySelector('[data-music-role="local-file"]')?.addEventListener('change', () => {
    const file = els.fileInput.files?.[0];
    if (!file || !els.audio) return;
    state.musicPlayer.sourceType = 'local';
    state.musicPlayer.streamMode = 'unknown';
    pendingYoutubeAction = null;
    state.musicPlayer.currentTrackName = file.name;
    els.audio.src = URL.createObjectURL(file);
    els.audio.volume = state.musicPlayer.volume;
    save();
    setMusicStatus(`Local file loaded: ${file.name}`);
  });

  musicPod?.querySelector('[data-music-role="volume"]')?.addEventListener('input', (e) => {
    syncMusicVolume(e.target.value);
    save();
  });

  musicPod?.querySelector('[data-music-role="play"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
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
    setMusicStatus('Ready. Load a stream URL or choose a local audio file.');
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
    resetSizeBtn: root?.querySelector('[data-camera-role="reset-size"]') || null,
    frameWrap: root?.querySelector('[data-camera-role="frame-wrap"]') || null,
    resizeHandle: root?.querySelector('[data-camera-role="resize-handle"]') || null,
    streamFrame: root?.querySelector('[data-camera-role="stream-frame"]') || null,
    snapshotImg: root?.querySelector('[data-camera-role="snapshot-img"]') || null,
    localVideo: root?.querySelector('[data-camera-role="local-video"]') || null,
    deviceSelect: root?.querySelector('[data-camera-role="device"]') || null,
  };
}

function setCameraFeedStatus(text){
  const el = document.getElementById('cameraFeedStatus');
  if (el) el.textContent = text;
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
    video.style.display = 'none';
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
    els.streamFrame.style.display = 'none';
  }
  if (els.snapshotImg) {
    els.snapshotImg.removeAttribute('src');
    els.snapshotImg.style.display = 'none';
  }
  if (els.localVideo) {
    els.localVideo.style.display = 'none';
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
    img.src = cameraSnapshotUrl(sourceUrl);
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
  frame.src = sourceUrl;
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
      video.style.display = '';
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
  const hasMediaDevices = !!navigator?.mediaDevices?.getUserMedia;
  const localSupportHint = hasMediaDevices ? '' : ' (unsupported in this browser/context)';
  const localDeviceValue = String(state.cameraFeed.deviceId || '');
  const localDeviceOptions = [`<option value="">Default camera</option>`, ...cameraDeviceList.map((d) => (
    `<option value="${escapeHtml(d.deviceId)}" ${localDeviceValue === d.deviceId ? 'selected' : ''}>${escapeHtml(d.label)}</option>`
  ))].join('');
  const viewport = getCameraViewportSize(el);

  el.innerHTML = `
    <div class="camera-feed-shell" data-pod="camera-feed">
      <input data-camera-role="url" placeholder="Camera URL (http/https)" value="${escapeHtml(state.cameraFeed.sourceUrl || '')}" ${urlDisabled ? 'disabled' : ''} />
      <div class="row-wrap">
        <label class="camera-feed-inline-label">Mode
          <select data-camera-role="mode" class="w-auto">
            <option value="stream" ${mode === 'stream' ? 'selected' : ''}>Embed Stream</option>
            <option value="snapshot" ${mode === 'snapshot' ? 'selected' : ''}>Snapshot Refresh</option>
            <option value="local" ${mode === 'local' ? 'selected' : ''}>Local Webcam (Browser)</option>
          </select>
        </label>
        <label class="camera-feed-inline-label">Refresh (sec)
          <input data-camera-role="interval" type="number" min="1" max="60" step="1" class="w-110" value="${interval}" ${mode === 'snapshot' ? '' : 'disabled'} />
        </label>
        <label class="camera-feed-inline-check ${mode === 'snapshot' ? '' : 'is-disabled'}">
          <input data-camera-role="proxy" type="checkbox" ${state.cameraFeed.useProxy ? 'checked' : ''} ${mode === 'snapshot' ? '' : 'disabled'} />
          Use local proxy
        </label>
      </div>
      <div class="row-wrap">
        <label class="camera-feed-inline-label ${mode === 'local' ? '' : 'is-disabled'}">Webcam Device
          <select data-camera-role="device" class="w-auto" ${mode === 'local' ? '' : 'disabled'}>
            ${localDeviceOptions}
          </select>
        </label>
      </div>
      <div class="row-wrap">
        <button data-camera-role="start" class="btn">Load / Start</button>
        <button data-camera-role="stop" class="btn ghost" ${state.cameraFeed.active ? '' : 'disabled'}>Stop</button>
        <button data-camera-role="reset-size" class="btn ghost">Reset Size</button>
      </div>
      <div class="camera-feed-frame-wrap mt6" data-camera-role="frame-wrap" style="width:min(100%, ${viewport.width}px); height:${viewport.height}px;">
        <iframe data-camera-role="stream-frame" title="Camera feed stream" ${showStream ? '' : 'style="display:none;"'} referrerpolicy="no-referrer"></iframe>
        <img data-camera-role="snapshot-img" alt="Camera snapshot" ${showSnapshot ? '' : 'style="display:none;"'} />
        <video data-camera-role="local-video" autoplay playsinline muted ${showLocal ? '' : 'style="display:none;"'}></video>
        <button class="camera-feed-resize-handle" data-camera-role="resize-handle" aria-label="Resize camera feed" title="Drag to resize" type="button"></button>
      </div>
      <div class="note-meta mt6">V1 supports one active feed at a time. If embed fails, use Snapshot mode. Local Webcam uses browser permission${localSupportHint}.</div>
    </div>
  `;

  const els = getCameraFeedEls();
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
    els.streamFrame.src = state.cameraFeed.sourceUrl;
  }

  if (showSnapshot && els.snapshotImg) {
    els.snapshotImg.src = cameraSnapshotUrl(state.cameraFeed.sourceUrl);
  }

  if (showLocal && els.localVideo) {
    try {
      els.localVideo.srcObject = cameraLocalStream;
      els.localVideo.style.display = '';
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
  const popout = window.open(url, '_blank', [
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
}

function getLiveStreamsEls(){
  const root = document.getElementById('liveStreamsWidget')?.querySelector('[data-pod="live-streams"]') || null;
  return {
    root,
    sourceType: root?.querySelector('[data-live-role="source-type"]') || null,
    input: root?.querySelector('[data-live-role="input"]') || null,
    startBtn: root?.querySelector('[data-live-role="start"]') || null,
    stopBtn: root?.querySelector('[data-live-role="stop"]') || null,
    popoutBtn: root?.querySelector('[data-live-role="popout"]') || null,
    openBtn: root?.querySelector('[data-live-role="open"]') || null,
    frame: root?.querySelector('[data-live-role="frame"]') || null,
    video: root?.querySelector('[data-live-role="video"]') || null,
    presetName: root?.querySelector('[data-live-role="preset-name"]') || null,
    savePresetBtn: root?.querySelector('[data-live-role="save-preset"]') || null,
    presetSelect: root?.querySelector('[data-live-role="preset-select"]') || null,
    applyPresetBtn: root?.querySelector('[data-live-role="apply-preset"]') || null,
  };
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

  el.innerHTML = `
    <div class="live-streams-shell" data-pod="live-streams">
      <label class="camera-feed-inline-label">Source
        <select data-live-role="source-type" class="w-auto">
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
      <input data-live-role="input" placeholder="${escapeHtml(placeholders[sourceType])}" value="${escapeHtml(inputValue)}" />
      <div class="row-wrap">
        <button data-live-role="start" class="btn">Load / Start</button>
        <button data-live-role="stop" class="btn ghost" ${state.liveStreams.active ? '' : 'disabled'}>Stop</button>
        <button data-live-role="popout" class="btn ghost" ${state.liveStreams.externalUrl ? '' : 'disabled'}>Pop-out Player</button>
        <button data-live-role="open" class="btn ghost" ${state.liveStreams.externalUrl ? '' : 'disabled'}>Open in new tab</button>
      </div>
      <div class="row-wrap">
        <input data-live-role="preset-name" placeholder="Preset name (optional)" class="w-180" />
        <button data-live-role="save-preset" class="btn ghost">Save Preset</button>
        <select data-live-role="preset-select" class="w-auto">${presetOptions}</select>
        <button data-live-role="apply-preset" class="btn ghost">Apply</button>
      </div>
      <div class="live-streams-frame-wrap mt6">
        <iframe data-live-role="frame" title="Live stream" referrerpolicy="no-referrer" allow="autoplay; fullscreen" ${isFrame ? '' : 'style="display:none;"'}></iframe>
        <video data-live-role="video" controls autoplay playsinline ${isVideo ? '' : 'style="display:none;"'}></video>
      </div>
      <div class="note-meta mt6">Some providers block iframe embeds with X-Frame-Options/CSP. If playback fails or stays blank, use <strong>Pop-out Player</strong> or <strong>Open in new tab</strong>.</div>
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
    window.open(state.liveStreams.externalUrl, '_blank', 'noopener,noreferrer');
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
    els.frame.src = state.liveStreams.embedUrl;
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
    els.video.src = state.liveStreams.embedUrl;
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
  toolsEl.style.display = show ? 'flex' : 'none';
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
    <div id="voiceToRowanFallbackTools" class="row-wrap mt6" style="display:none;">
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
  if (podId === 'nba-scores') return () => renderNbaScores();
  if (podId === 'crypto-tracker') return () => renderCrypto();
  if (podId === 'rss-feed') return () => renderRss();
  return null;
}

function syncUtilityPodLifecycle(){
  const managed = ['weather', 'nba-scores', 'crypto-tracker', 'rss-feed'];
  managed.forEach((podId) => {
    const visible = state.layout?.visibility?.[podId] !== false;
    const legacyRender = getUtilityPodLegacyRenderer(podId);
    if (visible) {
      runPodLifecycleAction('mount', podId, legacyRender, { visible: true, trigger: 'layout_sync' });
    } else {
      runPodLifecycleAction('destroy', podId, legacyRender, { visible: false, trigger: 'layout_sync' });
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
  wrap.innerHTML = rows.map((row, rowIndex) => row.map((podId, podIndex) => {
    const checked = state.layout.visibility?.[podId] !== false ? 'checked' : '';
    const upDisabled = podIndex === 0 ? 'disabled' : '';
    const downDisabled = podIndex === row.length - 1 ? 'disabled' : '';
    return `
      <div class="pod-toggle-row">
        <label>
          <input type="checkbox" data-pod-visibility="${escapeHtml(podId)}" ${checked} />
          ${escapeHtml(getUtilityPodTitle(podId))}
          <div class="pod-toggle-meta">${escapeHtml(podId)} · Row ${rowIndex + 1}</div>
        </label>
        <div class="pod-toggle-actions">
          <button class="btn ghost" data-pod-move="up" data-pod-row="${rowIndex}" data-pod-index="${podIndex}" ${upDisabled}>↑</button>
          <button class="btn ghost" data-pod-move="down" data-pod-row="${rowIndex}" data-pod-index="${podIndex}" ${downDisabled}>↓</button>
        </div>
      </div>
    `;
  }).join('')).join('');
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

function renderAll(){
  applyTheme();
  applyUtilityLayoutToDom();
  renderPodWithFallback('date-time', renderDateTime);
  renderPodWithFallback('calendar', renderCalendar);
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
  renderVoiceNotePod();
  renderVoiceToRowanPod();
  renderShortcutsPod();
  renderShortcutsSettings();
  syncUtilityPodLifecycle();
  populateProjectSelect();
}

function renderProjects(){
  const wrap = document.getElementById('projectDirectory');
  if (!wrap) return;
  wrap.innerHTML = state.projects.map(p=>`
    <div class="project-item">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <strong>${escapeHtml(p.name)}</strong>
        <span class="badge">${escapeHtml(p.status)}</span>
      </div>
      <p style="margin:.4rem 0 .6rem;opacity:.85">${escapeHtml(p.summary)}</p>
      <small>Updated: ${new Date(p.lastUpdated).toLocaleString()}</small>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        ${p.appLink ? `<a class="btn ghost" href="${encodeURI(p.appLink)}" target="_blank" rel="noopener">App</a>` : ''}
        ${p.repoLink ? `<a class="btn ghost" href="${encodeURI(p.repoLink)}" target="_blank" rel="noopener">Repo</a>` : ''}
      </div>
    </div>
  `).join('');
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
    ['Waiting/Blocked', blocked],
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
  const wrapToday = document.getElementById('notesBoardToday');
  const wrapBacklog = document.getElementById('notesBoardBacklog');
  const search = (document.getElementById('notesSearch')?.value || '').toLowerCase();
  const filter = document.getElementById('notesFilter')?.value || 'all';
  if (!wrapToday || !wrapBacklog) return;

  const isToday = (iso) => {
    const d = new Date(iso || Date.now());
    const n = new Date();
    return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
  };

  const filtered = state.notes.filter((n)=>{
    const hay = `${n.title||''} ${n.body||''}`.toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (filter === 'pinned' && !n.pinned) return false;
    if (filter === 'today' && !isToday(n.updatedAt)) return false;
    if (filter === 'backlog' && isToday(n.updatedAt)) return false;
    return true;
  });

  const renderCard = (n)=>{
    const opts = state.projects.map((p)=>`<option value="${p.id}" ${p.id===n.projectId?'selected':''}>${p.name}</option>`).join('');
    return `<div class="note-card ${n.pinned?'pinned':''}" data-note-id="${n.id}">
      <div class="note-top">
        <strong>${n.title || 'Quick Note'}</strong>
        <span class="note-meta">${new Date(n.updatedAt).toLocaleString()}</span>
      </div>
      <input data-field="title" value="${escapeHtml(n.title || '')}" placeholder="Note title" />
      <div class="md-toolbar" data-editor-toolbar>
        ${markdownToolbarButtons()}
      </div>
      <textarea data-field="body" rows="4" placeholder="Type your note...">${escapeHtml(n.body || '')}</textarea>
      <div class="md-preview" data-rendered="body">${renderFormattedText(n.body || '')}</div>
      <div class="note-actions">
        <select data-field="projectId">${opts}</select>
        <div style="display:flex;gap:8px;">
          <button class="btn note-pin" data-action="pin">${n.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="btn" data-action="to-task">To Task</button>
          <button class="btn note-delete" data-action="delete">Delete</button>
        </div>
      </div>
    </div>`;
  };

  wrapToday.innerHTML = filtered.filter((n)=>isToday(n.updatedAt)).map(renderCard).join('') || '<small class="note-meta">No notes for today.</small>';
  wrapBacklog.innerHTML = filtered.filter((n)=>!isToday(n.updatedAt)).map(renderCard).join('') || '<small class="note-meta">No backlog notes.</small>';

  document.querySelectorAll('#notesBoardToday [data-field], #notesBoardBacklog [data-field]').forEach((el)=>{
    el.addEventListener('input', (e)=>{
      const card = e.target.closest('.note-card');
      const note = state.notes.find(x=>x.id===card.dataset.noteId);
      if (!note) return;
      note[e.target.dataset.field] = e.target.value;
      note.updatedAt = now();
      if (e.target.dataset.field === 'body') {
        const preview = card.querySelector('[data-rendered="body"]');
        if (preview) preview.innerHTML = renderFormattedText(e.target.value);
      }
      save();
    });
    el.addEventListener('change', (e)=>{
      const card = e.target.closest('.note-card');
      const note = state.notes.find(x=>x.id===card.dataset.noteId);
      if (!note) return;
      note[e.target.dataset.field] = e.target.value;
      note.updatedAt = now();
      save();
      renderNotes();
    });
  });

  document.querySelectorAll('#notesBoardToday [data-editor-toolbar], #notesBoardBacklog [data-editor-toolbar]').forEach((toolbar)=>{
    bindMarkdownToolbar(toolbar, (btn) => {
      const card = btn.closest('.note-card');
      return card?.querySelector('textarea[data-field="body"]') || null;
    }, (input, btn) => {
      const card = btn.closest('.note-card');
      const note = state.notes.find((x)=>x.id===card?.dataset.noteId);
      if (!note) return;
      note.body = input.value;
      note.updatedAt = now();
      const preview = card.querySelector('[data-rendered="body"]');
      if (preview) preview.innerHTML = renderFormattedText(input.value);
      save();
    });
  });

  document.querySelectorAll('#notesBoardToday [data-action="delete"], #notesBoardBacklog [data-action="delete"]').forEach((btn)=>{
    btn.addEventListener('click', (e)=>{
      const card = e.target.closest('.note-card');
      deleteWithUndo({
        collection: () => state.notes,
        itemId: card?.dataset?.noteId,
        reason: 'note_deleted',
        buildUndoLabel: (n) => `Note deleted (${(n?.title || 'Quick Note').slice(0, 30)}). Undo?`,
      });
    });
  });

  document.querySelectorAll('#notesBoardToday [data-action="pin"], #notesBoardBacklog [data-action="pin"]').forEach((btn)=>{
    btn.addEventListener('click', (e)=>{
      const card = e.target.closest('.note-card');
      const note = state.notes.find(n=>n.id===card.dataset.noteId);
      if (!note) return;
      note.pinned = !note.pinned;
      note.updatedAt = now();
      commitState('note_pin_toggled');
    });
  });

  document.querySelectorAll('#notesBoardToday [data-action="to-task"], #notesBoardBacklog [data-action="to-task"]').forEach((btn)=>{
    btn.addEventListener('click', (e)=>{
      const card = e.target.closest('.note-card');
      const note = state.notes.find(n=>n.id===card.dataset.noteId);
      if (!note) return;
      state.tasks.push({
        id: id(),
        title: note.title || 'Task from note',
        projectId: note.projectId || state.projects[0]?.id,
        column: state.settings.defaultTaskColumn || 'inbox',
        blockerType: null,
        owner: 'Rowan',
        nextAction: (note.body || 'Review note and define first action').slice(0, 140),
        dueDate: '',
        createdAt: now(),
        updatedAt: now(),
      });
      commitState('note_converted_to_task');
    });
  });
}

function shortcutAssignmentOptions(){
  return [
    { id: SHORTCUT_GLOBAL_PROJECT_ID, name: 'Global (Mission Control)' },
    ...state.projects.map((p) => ({ id: p.id, name: p.name })),
  ];
}

function renderShortcutProjectChecklist(targetId, selectedIds = []){
  const wrap = document.getElementById(targetId);
  if (!wrap) return;
  const selected = new Set(selectedIds.length ? selectedIds : [SHORTCUT_GLOBAL_PROJECT_ID]);
  wrap.innerHTML = shortcutAssignmentOptions().map((p) => `
    <label class="shortcut-check-row">
      <input type="checkbox" value="${p.id}" ${selected.has(p.id) ? 'checked' : ''} />
      <span class="shortcut-check-label">${escapeHtml(p.name)}</span>
    </label>
  `).join('');
}

function activeShortcutFilterSet(){
  const ids = Array.isArray(state.settings.shortcutsFilterProjectIds) ? state.settings.shortcutsFilterProjectIds : [];
  return new Set(ids.filter(Boolean));
}

function checkedShortcutFilterIdsFromDom(){
  return [...document.querySelectorAll('#shortcutsWidget [data-shortcut-filter]:checked')]
    .map((el) => String(el.dataset.shortcutFilter || '').trim())
    .filter(Boolean);
}

function shortcutDefaultsFromActiveFilters(){
  const checked = checkedShortcutFilterIdsFromDom();
  if (checked.length) return [...new Set(checked)];
  const stateFilters = [...activeShortcutFilterSet()];
  return stateFilters.length ? stateFilters : [SHORTCUT_GLOBAL_PROJECT_ID];
}

function extractUrlFromDrop(dataTransfer){
  if (!dataTransfer) return '';
  const uriList = String(dataTransfer.getData('text/uri-list') || '').trim();
  if (uriList) {
    const firstUrl = uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));
    if (firstUrl) return firstUrl;
  }

  const plain = String(dataTransfer.getData('text/plain') || '').trim();
  if (/^https?:\/\//i.test(plain)) return plain;

  const html = String(dataTransfer.getData('text/html') || '');
  const hrefMatch = html.match(/href\s*=\s*["']([^"']+)["']/i);
  return hrefMatch?.[1] || '';
}

function suggestShortcutTitle(url, fallbackText = ''){
  const cleanFallback = String(fallbackText || '').trim();
  if (cleanFallback && !/^https?:\/\//i.test(cleanFallback)) return cleanFallback.slice(0, 90);
  try {
    const u = new URL(String(url || '').trim());
    const host = u.hostname.replace(/^www\./, '');
    const firstSegment = u.pathname.split('/').filter(Boolean)[0] || '';
    return firstSegment ? `${host} / ${decodeURIComponent(firstSegment).slice(0, 48)}` : host;
  } catch {
    return 'New Shortcut';
  }
}

function renderShortcutsPod(){
  const wrap = document.getElementById('shortcutsWidget');
  if (!wrap) return;

  const activeFilters = activeShortcutFilterSet();
  const enabledShortcuts = (state.shortcuts || []).filter((sc) => sc.enabled !== false);
  const visible = !activeFilters.size
    ? enabledShortcuts
    : enabledShortcuts.filter((sc) => (sc.projectIds || []).some((pid) => activeFilters.has(pid)));

  const filterRows = shortcutAssignmentOptions().map((p) => `
    <label class="shortcut-check-row">
      <input type="checkbox" data-shortcut-filter="${p.id}" ${activeFilters.has(p.id) ? 'checked' : ''} />
      <span class="shortcut-check-label">${escapeHtml(p.name)}</span>
    </label>
  `).join('');

  const cards = visible.length
    ? visible.map((sc) => `
      <a class="shortcut-link" href="${escapeHtml(sc.url)}" target="_blank" rel="noopener">
        <strong>${escapeHtml(sc.title)}</strong>
        <span>${escapeHtml(sc.category || 'Shortcut')}</span>
      </a>
    `).join('')
    : '<div class="note-meta">No shortcuts match current project filters.</div>';

  wrap.innerHTML = `
    <div class="shortcut-filter-toolbar">
      <button class="btn ghost" id="shortcutFilterAllBtn" type="button">Show all</button>
      <span class="note-meta">Filter by project:</span>
    </div>
    <div class="shortcut-project-checklist shortcut-filter-checklist">${filterRows}</div>
    <div id="shortcutDropzone" class="shortcut-dropzone" title="Drop bookmark/link here to create a shortcut">
      Drop a bookmark or link here to create a shortcut
    </div>
    <div class="shortcut-links">${cards}</div>
  `;

  document.querySelectorAll('[data-shortcut-filter]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const next = activeShortcutFilterSet();
      const pid = e.target.dataset.shortcutFilter;
      if (e.target.checked) next.add(pid);
      else next.delete(pid);
      state.settings.shortcutsFilterProjectIds = [...next];
      save();
      renderShortcutsPod();
    });
  });

  document.getElementById('shortcutFilterAllBtn')?.addEventListener('click', () => {
    state.settings.shortcutsFilterProjectIds = [];
    save();
    renderShortcutsPod();
  });

  const dropzone = document.getElementById('shortcutDropzone');
  if (dropzone) {
    const setOver = (isOver) => dropzone.classList.toggle('is-over', !!isOver);
    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(true);
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(true);
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    dropzone.addEventListener('dragleave', () => setOver(false));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(false);

      const url = extractUrlFromDrop(e.dataTransfer);
      if (!url || !/^https?:\/\//i.test(url)) return;

      const droppedText = String(e.dataTransfer?.getData('text/plain') || '').trim();
      const projectIds = shortcutDefaultsFromActiveFilters();
      const title = suggestShortcutTitle(url, droppedText);
      state.shortcuts.push({
        id: id(),
        title,
        url,
        category: 'Bookmark',
        projectIds,
        enabled: true,
        createdAt: now(),
        updatedAt: now(),
      });

      logChange(`Created shortcut from drop: ${title}`);
      commitState('shortcut_created_from_drop');
    });
  }
}

function renderShortcutsSettings(){
  const wrap = document.getElementById('settingsShortcutsList');
  if (!wrap) return;
  const rows = (state.shortcuts || [])
    .slice()
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    .map((sc) => `
      <div class="change-log-item">
        <div class="row-between-wrap gap10">
          <strong>${escapeHtml(sc.title)}</strong>
          <span class="badge">${sc.enabled === false ? 'Disabled' : 'Enabled'}</span>
        </div>
        <div class="note-meta mt6">${escapeHtml(sc.category || 'No category')} · ${(sc.projectIds || []).map(projectDisplayName).map(escapeHtml).join(', ')}</div>
        <div class="shortcut-admin-actions mt8">
          <button class="btn ghost" data-shortcut-edit="${sc.id}" type="button">Edit</button>
          <button class="btn ghost" data-shortcut-toggle="${sc.id}" type="button">${sc.enabled === false ? 'Enable' : 'Disable'}</button>
          <button class="btn note-delete" data-shortcut-delete="${sc.id}" type="button">Delete</button>
        </div>
      </div>
    `).join('');

  wrap.innerHTML = rows || '<div class="note-meta">No shortcuts yet. Add one to get started.</div>';

  document.querySelectorAll('[data-shortcut-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openShortcutDialog(btn.dataset.shortcutEdit));
  });
  document.querySelectorAll('[data-shortcut-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sc = state.shortcuts.find((x) => x.id === btn.dataset.shortcutToggle);
      if (!sc) return;
      sc.enabled = sc.enabled === false;
      sc.updatedAt = now();
      logChange(`${sc.enabled ? 'Enabled' : 'Disabled'} shortcut: ${sc.title}`);
      commitState('shortcut_toggled');
    });
  });
  document.querySelectorAll('[data-shortcut-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sc = state.shortcuts.find((x) => x.id === btn.dataset.shortcutDelete);
      if (!sc) return;
      if (!confirm(`Delete shortcut "${sc.title}"?`)) return;
      deleteWithUndo({
        collection: () => state.shortcuts,
        itemId: sc.id,
        reason: 'shortcut_deleted',
        buildUndoLabel: () => `Shortcut deleted (${sc.title}). Undo?`,
      });
      logChange(`Deleted shortcut: ${sc.title}`);
    });
  });
}

function escapeHtml(str){
  return String(str || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
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
  if (!toolbar) return;
  toolbar.querySelectorAll('button[data-md-format]').forEach((btn)=>{
    btn.addEventListener('mousedown', (e)=> e.preventDefault());
    btn.addEventListener('click', ()=>{
      const input = typeof getInput === 'function' ? getInput(btn) : null;
      if (!input) return;
      applyFormat(input, btn.dataset.mdFormat);
      if (typeof onApplied === 'function') onApplied(input, btn);
    });
  });
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

  const board = document.getElementById('board');
  board.innerHTML = COLUMNS.map(([key,label])=>{
    const colTasks = state.tasks.filter(t=>t.column===key);
    const cards = colTasks.map(taskHtml).join('');
    return `<div class="col"><div class="col-head"><h3>${label}</h3><span class="col-count">${colTasks.length}</span></div><div class="drop" data-col="${key}">${cards}</div></div>`;
  }).join('');

  document.querySelectorAll('.task').forEach(el=>{
    el.addEventListener('dragstart', e=> {
      e.dataTransfer.setData('text/plain', el.dataset.id);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', ()=> el.classList.remove('dragging'));
  });

  document.querySelectorAll('.task-edit-btn').forEach((btn) => {
    ['mousedown', 'pointerdown', 'dragstart'].forEach((evt) => {
      btn.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditTaskDialog(btn.dataset.id);
    });
  });

  document.querySelectorAll('.drop').forEach(drop=>{
    drop.addEventListener('dragenter', ()=> drop.classList.add('is-over'));
    drop.addEventListener('dragover', e=> e.preventDefault());
    drop.addEventListener('dragleave', ()=> drop.classList.remove('is-over'));
    drop.addEventListener('drop', e=>{
      e.preventDefault();
      drop.classList.remove('is-over');
      const id = e.dataTransfer.getData('text/plain');
      const task = state.tasks.find(t=>t.id===id);
      if(!task) return;
      task.column = drop.dataset.col;
      task.updatedAt = now();
      commitState('task_column_changed_drag');
    });
  });
}

function taskHtml(t){
  const chips = [];
  chips.push(`<span class="chip">${projectName(t.projectId)}</span>`);
  if(t.column==='waiting_blocked') chips.push('<span class="chip high">High</span>');
  if(t.blockerType) chips.push(`<span class="chip ${t.blockerType}">${title(t.blockerType)}</span>`);
  return `<div class="task" draggable="true" data-id="${t.id}">
    <div class="task-top-row">
      <strong>${escapeHtml(t.title)}</strong>
      <button type="button" class="btn ghost task-edit-btn" data-id="${t.id}" draggable="false">Edit</button>
    </div>
    <div class="task-next-action md-preview">${renderFormattedText(t.nextAction || '')}</div>
    <small>Owner: ${escapeHtml(t.owner || 'Rowan')}</small>
    ${t.dueDate ? `<small>Due: ${escapeHtml(t.dueDate)}</small>` : ''}
    <div style="margin-top:6px">${chips.join('')}</div>
  </div>`;
}

function title(v){ return v.charAt(0).toUpperCase()+v.slice(1); }

function populateProjectSelect(){
  const options = state.projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  const sel = document.getElementById('taskProject');
  if (sel) sel.innerHTML = options;
  const editSel = document.getElementById('editTaskProject');
  if (editSel) editSel.innerHTML = options;
}

function openEditTaskDialog(taskId){
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || !editTaskDialog || !editTaskForm) return;

  editTaskForm.elements.id.value = task.id;
  editTaskForm.elements.title.value = task.title || '';
  editTaskForm.elements.projectId.value = task.projectId || state.projects[0]?.id || '';
  editTaskForm.elements.column.value = task.column || 'inbox';
  editTaskForm.elements.blockerType.value = task.blockerType || '';
  editTaskForm.elements.owner.value = task.owner || 'Rowan';
  editTaskForm.elements.nextAction.value = task.nextAction || '';
  editTaskForm.elements.dueDate.value = task.dueDate || '';

  const preview = document.getElementById('editTaskNextActionPreview');
  if (preview) preview.innerHTML = renderFormattedText(task.nextAction || '');

  editTaskDialog.showModal();
}

function openShortcutDialog(shortcutId = ''){
  if (!shortcutDialog || !shortcutForm) return;
  const sc = shortcutId ? state.shortcuts.find((x) => x.id === shortcutId) : null;
  shortcutForm.elements.id.value = sc?.id || '';
  shortcutForm.elements.title.value = sc?.title || '';
  shortcutForm.elements.url.value = sc?.url || '';
  shortcutForm.elements.category.value = sc?.category || '';
  shortcutForm.elements.enabled.checked = sc ? sc.enabled !== false : true;

  const defaults = sc?.projectIds?.length
    ? sc.projectIds
    : [missionControlProjectId() || SHORTCUT_GLOBAL_PROJECT_ID, SHORTCUT_GLOBAL_PROJECT_ID];
  renderShortcutProjectChecklist('shortcutProjectChecklist', defaults);

  const titleEl = document.getElementById('shortcutDialogTitle');
  if (titleEl) titleEl.textContent = sc ? 'Edit Shortcut' : 'New Shortcut';
  shortcutDialog.showModal();
}

// dialogs
const projectDialog = document.getElementById('projectDialog');
const taskDialog = document.getElementById('taskDialog');
const editTaskDialog = document.getElementById('editTaskDialog');
const editTaskForm = document.getElementById('editTaskForm');
const shortcutDialog = document.getElementById('shortcutDialog');
const shortcutForm = document.getElementById('shortcutForm');
document.getElementById('addProjectBtn').onclick = ()=> projectDialog.showModal();
document.getElementById('addTaskBtn').onclick = ()=> taskDialog.showModal();
document.getElementById('projectCancelBtn')?.addEventListener('click', ()=> projectDialog.close());
document.getElementById('editTaskCancelBtn')?.addEventListener('click', ()=> editTaskDialog?.close());
document.getElementById('editTaskDeleteBtn')?.addEventListener('click', () => {
  const taskId = String(editTaskForm?.elements?.id?.value || '').trim();
  if (!taskId) return;
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  if (!window.confirm(`Delete task "${task.title}"?`)) return;
  const deleted = deleteWithUndo({
    collection: () => state.tasks,
    itemId: taskId,
    reason: 'task_deleted',
    buildUndoLabel: () => `Task deleted (${task.title.slice(0, 30)}). Undo?`,
  });
  if (deleted) editTaskDialog?.close();
});
document.getElementById('addShortcutBtn')?.addEventListener('click', ()=> openShortcutDialog());

const editTaskNextActionInput = document.getElementById('editTaskNextAction');
const editTaskNextActionPreview = document.getElementById('editTaskNextActionPreview');
const editTaskToolbar = document.getElementById('editTaskToolbar');
if (editTaskToolbar) {
  editTaskToolbar.innerHTML = markdownToolbarButtons();
  bindMarkdownToolbar(editTaskToolbar, () => editTaskNextActionInput);
}
editTaskNextActionInput?.addEventListener('input', ()=> {
  if (editTaskNextActionPreview) editTaskNextActionPreview.innerHTML = renderFormattedText(editTaskNextActionInput.value || '');
});
document.getElementById('shortcutCancelBtn')?.addEventListener('click', ()=> shortcutDialog?.close());

const settingsPanel = document.getElementById('settingsPanel');
document.getElementById('openSettingsBtn')?.addEventListener('click', ()=> {
  settingsPanel?.classList.add('open');
  settingsPanel?.setAttribute('aria-hidden','false');
  refreshStateSafetyBackups(true);
});
document.getElementById('closeSettingsBtn')?.addEventListener('click', ()=> {
  settingsPanel?.classList.remove('open');
  settingsPanel?.setAttribute('aria-hidden','true');
});

document.getElementById('settingTheme')?.addEventListener('change', (e)=> {
  state.settings.theme = e.target.value;
  logChange(`Theme changed to ${e.target.value}`);
  commitState('theme_changed');
});

document.getElementById('settingWeatherInterval')?.addEventListener('change', (e)=> {
  state.settings.weatherIntervalMin = Number(e.target.value || 15);
  setupWeatherTimer();
  logChange(`Weather refresh interval set to every ${state.settings.weatherIntervalMin} minutes`);
  save();
});

document.getElementById('settingDefaultTaskColumn')?.addEventListener('change', (e)=> {
  state.settings.defaultTaskColumn = e.target.value;
  logChange(`Default new task column set to ${e.target.value}`);
  save();
});

document.getElementById('settingRssInterval')?.addEventListener('change', (e)=> {
  const mins = Number(e.target.value || RSS_DEFAULT_REFRESH_MIN);
  state.rss.refreshIntervalMin = Number.isFinite(mins) ? Math.min(180, Math.max(5, Math.round(mins))) : RSS_DEFAULT_REFRESH_MIN;
  setupRssTimer();
  save('rss_interval_changed');
});

document.getElementById('settingsPodVisibilityList')?.addEventListener('change', (e) => {
  const checkbox = e.target?.closest?.('[data-pod-visibility]');
  if (!checkbox) return;
  const podId = String(checkbox.dataset.podVisibility || '').trim();
  if (!podId) return;
  state.layout.visibility[podId] = !!checkbox.checked;
  save('pod_visibility_toggled');
  applyUtilityLayoutToDom();
  renderPodVisibilitySettings();
});

document.getElementById('settingsPodVisibilityList')?.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('[data-pod-move]');
  if (!btn) return;
  const rowIndex = Number(btn.dataset.podRow);
  const podIndex = Number(btn.dataset.podIndex);
  const direction = String(btn.dataset.podMove || '');
  if (!Number.isInteger(rowIndex) || !Number.isInteger(podIndex)) return;
  if (!movePodWithinRow(rowIndex, podIndex, direction)) return;
  save('pod_layout_reordered');
  applyUtilityLayoutToDom();
  renderPodVisibilitySettings();
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

document.getElementById('addNoteBtn').onclick = ()=> {
  state.notes.unshift({
    id: id(),
    title: '',
    body: '',
    projectId: state.projects[0]?.id || '',
    pinned: false,
    createdAt: now(),
    updatedAt: now(),
  });
  commitState('note_added');
};

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

document.getElementById('notesSearch')?.addEventListener('input', () => renderNotes());
document.getElementById('notesFilter')?.addEventListener('change', () => renderNotes());
document.getElementById('notesClearFiltersBtn')?.addEventListener('click', () => {
  const s = document.getElementById('notesSearch');
  const f = document.getElementById('notesFilter');
  if (s) s.value = '';
  if (f) f.value = 'all';
  renderNotes();
});

shortcutForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const selectedProjectIds = [...document.querySelectorAll('#shortcutProjectChecklist input[type="checkbox"]:checked')]
    .map((el) => el.value)
    .filter(Boolean);
  const projectIds = selectedProjectIds.length ? [...new Set(selectedProjectIds)] : [SHORTCUT_GLOBAL_PROJECT_ID];

  const existing = state.shortcuts.find((x) => x.id === f.get('id'));
  if (existing) {
    existing.title = String(f.get('title') || '').trim();
    existing.url = String(f.get('url') || '').trim();
    existing.category = String(f.get('category') || '').trim();
    existing.projectIds = projectIds;
    existing.enabled = f.get('enabled') === 'on';
    existing.updatedAt = now();
    logChange(`Edited shortcut: ${existing.title}`);
  } else {
    const title = String(f.get('title') || '').trim();
    state.shortcuts.push({
      id: id(),
      title,
      url: String(f.get('url') || '').trim(),
      category: String(f.get('category') || '').trim(),
      projectIds,
      enabled: f.get('enabled') === 'on',
      createdAt: now(),
      updatedAt: now(),
    });
    logChange(`Created shortcut: ${title}`);
  }

  shortcutDialog?.close();
  commitState('shortcut_form_submitted');
});

document.getElementById('projectForm').addEventListener('submit', e=>{
  e.preventDefault();
  const f = new FormData(e.target);
  state.projects.push({
    id: id(),
    name: f.get('name'),
    summary: f.get('summary'),
    status: f.get('status'),
    appLink: f.get('appLink') || '',
    repoLink: f.get('repoLink') || '',
    lastUpdated: now(),
  });
  projectDialog.close();
  e.target.reset();
  commitState('project_created');
});

document.getElementById('taskForm').addEventListener('submit', e=>{
  e.preventDefault();
  const f = new FormData(e.target);
  state.tasks.push({
    id: id(),
    title: f.get('title'),
    projectId: f.get('projectId'),
    column: f.get('column'),
    blockerType: f.get('blockerType') || null,
    owner: f.get('owner') || 'Rowan',
    nextAction: f.get('nextAction'),
    dueDate: f.get('dueDate') || '',
    createdAt: now(),
    updatedAt: now(),
  });
  taskDialog.close();
  e.target.reset();
  const colSel = document.querySelector('#taskForm select[name="column"]');
  if (colSel) colSel.value = state.settings.defaultTaskColumn;
  commitState('task_created');
});

editTaskForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const task = state.tasks.find((t) => t.id === f.get('id'));
  if (!task) {
    editTaskDialog?.close();
    return;
  }

  task.title = f.get('title');
  task.projectId = f.get('projectId');
  task.column = f.get('column');
  task.blockerType = f.get('blockerType') || null;
  task.owner = f.get('owner') || 'Rowan';
  task.nextAction = f.get('nextAction');
  task.dueDate = f.get('dueDate') || '';
  task.updatedAt = now();

  editTaskDialog?.close();
  logChange(`Edited task: ${task.title}`);
  commitState('task_edited');
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

const musicPatch = 'Added mini Music Player pod with YouTube/stream URL input, local audio file playback, compact controls, volume, and one-click favorite stream recall.';
if (!state.changelog.some((c) => c.message === musicPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: musicPatch });
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

const liveStreamsPhase2APatch = 'Patch: Live Streams Phase 2A adds Rumble, X Live/Spaces, and Facebook Live presets with provider-specific normalization and explicit non-silent fallback messaging when embeds are blocked.';
if (!state.changelog.some((c) => c.message === liveStreamsPhase2APatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: liveStreamsPhase2APatch });
}

save('startup_patch_seed', { pushShared: false });
renderAll();
setInterval(renderDateTime, 1000);
document.getElementById('weatherRefreshBtn')?.addEventListener('click', () => renderWeatherPod({ manual: true }));
document.getElementById('nbaRefreshBtn')?.addEventListener('click', () => renderNbaPod({ manual: true }));
document.getElementById('cryptoRefreshBtn')?.addEventListener('click', () => {
  if (Date.now() < cryptoRefreshCooldownUntil) {
    updateCryptoRefreshButton();
    return;
  }
  startCryptoRefreshCooldown();
  renderCryptoPod({ manual: true });
});
document.getElementById('rssRefreshBtn')?.addEventListener('click', () => renderRssPod({ manual: true }));
document.getElementById('rssShowReadToggle')?.addEventListener('change', (e) => {
  state.rss.showRead = !!e.target.checked;
  save('rss_show_read_toggled');
  renderRssPod({ skipFetch: true });
});
updateCryptoRefreshButton();

document.getElementById('addCalendarReminderBtn')?.addEventListener('click', () => {
  if (!selectedCalendarDate) selectedCalendarDate = dateKey(new Date());
  const textEl = document.getElementById('calendarReminderText');
  const timeEl = document.getElementById('calendarReminderTime');
  const text = (textEl?.value || '').trim();
  const time = (timeEl?.value || '').trim();
  if (!text) return;
  state.reminders.push({ id: id(), date: selectedCalendarDate, time, text, createdAt: now() });
  if (textEl) textEl.value = '';
  if (timeEl) timeEl.value = '';
  commitState('calendar_reminder_added');
});

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

const colSelInit = document.querySelector('#taskForm select[name="column"]');
if (colSelInit) colSelInit.value = state.settings.defaultTaskColumn;

enableProjectDragScroll();
enableBoardDragScroll();

window.addEventListener('storage', (event) => {
  if (event.key === SHARED_STATE_SYNC_EVENT_KEY && event.newValue) {
    scheduleSharedHydrate('storage_sync_event');
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