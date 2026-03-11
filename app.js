const STORAGE_KEY = 'mission-control-lite-v1';
const LOCAL_ZIP = '44224';
const LOCAL_TZ = 'America/New_York';
const NBA_REFRESH_MS = 5 * 60 * 1000;
const CRYPTO_REFRESH_MS = 15 * 60 * 1000;
const CRYPTO_DIR_CACHE_KEY = 'mission-control-crypto-directory-v1';
const CRYPTO_DIR_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CRYPTO_WATCH_CACHE_KEY = 'mission-control-crypto-watch-cache-v1';
const CRYPTO_MANUAL_COOLDOWN_MS = 45 * 1000;
const CRYPTO_FAILURE_BACKOFF_BASE_MS = 20 * 1000;
const CRYPTO_FAILURE_BACKOFF_MAX_MS = 3 * 60 * 1000;
const SHARED_STATE_API = '/api/state';
const SHORTCUT_GLOBAL_PROJECT_ID = '__global__';

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
    streamMode: 'unknown', // youtube | direct | unknown
    favoriteStreamUrl: '',
    currentTrackName: '',
    volume: 0.7,
    isPlaying: false,
  },
  changelog: [],
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
let weatherTimer = null;
let nbaTimer = null;
let cryptoTimer = null;
let coinDirectory = [];
let topSymbolMap = new Map();
let cryptoRefreshCooldownUntil = 0;
let cryptoRefreshCooldownTimer = null;
let cryptoFailureCount = 0;
let cryptoBackoffUntil = 0;
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
let voiceNoteRecognizer = null;
let voiceNoteListening = false;
let voiceNoteSupported = false;
let voiceNoteSessionTranscript = '';
let voiceNoteManualStop = false;
let voiceNoteAutoRestartLeft = 0;
let voiceNoteLastError = '';
let sharedSaveTimer = null;

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

async function hydrateStateFromSharedApi(){
  try {
    const res = await fetch(`${SHARED_STATE_API}?_=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 404) return false;
    if (!res.ok) return false;
    const remote = await res.json();
    if (!remote || typeof remote !== 'object') return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    state = load();
    return true;
  } catch {
    return false;
  }
}

async function pushStateToSharedApi(){
  try {
    await fetch(SHARED_STATE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
  } catch {
    // Local fallback only
  }
}

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (sharedSaveTimer) clearTimeout(sharedSaveTimer);
  sharedSaveTimer = setTimeout(() => { pushStateToSharedApi(); }, 300);
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
  if (weatherTimer) clearInterval(weatherTimer);
  const mins = Number(state.settings.weatherIntervalMin || 15);
  weatherTimer = setInterval(renderWeather, mins * 60 * 1000);
}

function setupNbaTimer(){
  if (nbaTimer) clearInterval(nbaTimer);
  // Auto-refresh every 15 minutes (+ manual refresh button)
  nbaTimer = setInterval(renderNbaScores, NBA_REFRESH_MS);
}

function setupCryptoTimer(){
  if (cryptoTimer) clearInterval(cryptoTimer);
  cryptoTimer = setInterval(renderCrypto, CRYPTO_REFRESH_MS);
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
      state.reminders = state.reminders.filter((x)=>x.id!==b.dataset.remDel);
      renderAll();
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
  renderChangeLog();
  if (theme) theme.value = state.settings.theme;
  if (weather) weather.value = String(state.settings.weatherIntervalMin);
  if (col) col.value = state.settings.defaultTaskColumn;
  if (fs) fs.checked = !!document.fullscreenElement;

  const taskColumnSelect = document.querySelector('#taskForm select[name="column"]');
  if (taskColumnSelect && !taskColumnSelect.value) {
    taskColumnSelect.value = state.settings.defaultTaskColumn;
  }
}

async function renderWeather(){
  const el = document.getElementById('weatherWidget');
  if (!el) return;
  try {
    // 1) Resolve ZIP to precise lat/lon (US ZIP endpoint)
    const zipRes = await fetch(`https://api.zippopotam.us/us/${LOCAL_ZIP}`);
    const zipJson = await zipRes.json();
    const place = zipJson?.places?.[0];
    const lat = Number(place?.latitude);
    const lon = Number(place?.longitude);

    // 2) Pull current + daily weather from Open-Meteo
    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=${encodeURIComponent(LOCAL_TZ)}`;
    const wxRes = await fetch(wxUrl);
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
    const ts = document.getElementById('weatherUpdatedAt');
    if (ts) ts.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  } catch {
    el.textContent = 'Weather unavailable right now.';
    const ts = document.getElementById('weatherUpdatedAt');
    if (ts) ts.textContent = 'Update failed';
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

async function renderNbaScores(){
  const el = document.getElementById('nbaScoresWidget');
  if (!el) return;

  try {
    const dateKey = estDateYmdCompact();
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const events = Array.isArray(data?.events) ? data.events : [];

    if (!events.length) {
      el.innerHTML = '<div class="note-meta">No NBA games scheduled for today.</div>';
      const ts = document.getElementById('nbaUpdatedAt');
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
    const ts = document.getElementById('nbaUpdatedAt');
    if (ts) ts.textContent = `Updated: ${new Date().toLocaleTimeString()} (auto: every 15 min)`;
  } catch {
    el.textContent = 'NBA scores unavailable right now.';
    const ts = document.getElementById('nbaUpdatedAt');
    if (ts) ts.textContent = 'Update failed';
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

  const res = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=false');
  const coins = await res.json();
  coinDirectory = Array.isArray(coins) ? coins : [];

  try {
    localStorage.setItem(CRYPTO_DIR_CACHE_KEY, JSON.stringify({ updatedAt: nowTs, coins: coinDirectory }));
  } catch {}

  return coinDirectory;
}

function resolveCoinId(query){
  const qRaw = String(query || '').trim().toLowerCase();
  if (!qRaw) return null;

  // Normalize common ticker prefixes users type (e.g., $DOGE, @doge, #btc)
  const q = qRaw.replace(/^[^a-z0-9]+/, '');

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

function formatCryptoError(error){
  const status = Number(error?.status || 0);
  if (status === 429) return 'Rate limited (429)';
  if (status === 401 || status === 403) return 'API access denied';
  if (status >= 500) return `CoinGecko server error (${status})`;
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
    renderCrypto();
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
      renderCrypto();
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
      renderCrypto();
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
      renderCrypto();
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

  if (!manual && backoffLeftMs > 0) {
    const cached = getCryptoWatchCache();
    if (cached?.watch?.length) {
      renderCryptoWidget(el, cached.watch);
      if (ts) ts.textContent = `Updated: ${new Date(cached.updatedAt).toLocaleTimeString()} · stale cache (${Math.ceil(backoffLeftMs / 1000)}s backoff)`;
      return;
    }
  }

  try {
    if (!coinDirectory.length) await getCoinDirectory(false);

    const topMapCoins = await fetchJsonWithTimeout('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false');
    topSymbolMap = new Map();
    if (Array.isArray(topMapCoins)) {
      for (const c of topMapCoins) {
        const sym = String(c.symbol || '').toLowerCase();
        const id = String(c.id || '').toLowerCase();
        if (sym && id && !topSymbolMap.has(sym)) topSymbolMap.set(sym, id);
      }
    }

    const watchIds = (state.cryptoWatchlist || []).filter(Boolean).slice(0, 40);
    let watch = [];
    if (watchIds.length) {
      const watchUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(watchIds.join(','))}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
      const watchRes = await fetchJsonWithTimeout(watchUrl);
      watch = Array.isArray(watchRes) ? watchRes : [];
    }

    renderCryptoWidget(el, watch);
    const updatedAt = Date.now();
    setCryptoWatchCache({ updatedAt, watch });
    cryptoFailureCount = 0;
    cryptoBackoffUntil = 0;

    if (ts) ts.textContent = `Updated: ${new Date(updatedAt).toLocaleTimeString()} (watchlist + portfolio · auto: every 15 min)`;
  } catch (error) {
    cryptoFailureCount += 1;
    const backoffMs = Math.min(CRYPTO_FAILURE_BACKOFF_BASE_MS * (2 ** (cryptoFailureCount - 1)), CRYPTO_FAILURE_BACKOFF_MAX_MS);
    cryptoBackoffUntil = Date.now() + backoffMs;
    const reason = formatCryptoError(error);

    const cached = getCryptoWatchCache();
    if (cached?.watch?.length) {
      renderCryptoWidget(el, cached.watch);
      if (ts) ts.textContent = `Updated: ${new Date(cached.updatedAt).toLocaleTimeString()} · stale cache (${reason}; retry in ${Math.ceil(backoffMs / 1000)}s)`;
      return;
    }

    el.textContent = 'Crypto data unavailable right now.';
    if (ts) ts.textContent = `Update failed: ${reason} (retry in ${Math.ceil(backoffMs / 1000)}s)`;
  }
}

function extractYoutubeId(url){
  try {
    const u = new URL(String(url || '').trim());
    const host = u.hostname.replace('www.', '');
    if (host === 'youtu.be') return u.pathname.slice(1) || null;
    if (host.includes('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      const embedIdx = parts.indexOf('embed');
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      const liveIdx = parts.indexOf('live');
      if (liveIdx >= 0 && parts[liveIdx + 1]) return parts[liveIdx + 1];
    }
  } catch {}
  return null;
}

function ensureYoutubeApi(){
  if (window.YT?.Player || youtubeApiLoading) return;
  youtubeApiLoading = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

function initYouTubePlayerIfReady(){
  const iframe = document.getElementById('musicStreamIframe');
  if (!iframe || !window.YT?.Player) return false;

  try {
    if (streamIframePlayer?.destroy) streamIframePlayer.destroy();
  } catch {}

  streamIframePlayer = new window.YT.Player('musicStreamIframe', {
    events: {
      onReady: () => syncMusicVolume(state.musicPlayer.volume),
    },
  });
  return true;
}

function getMusicEls(){
  return {
    streamInput: document.getElementById('musicStreamUrlInput'),
    fileInput: document.getElementById('musicLocalFileInput'),
    volume: document.getElementById('musicVolumeInput'),
    status: document.getElementById('musicPlayerStatus'),
    audio: document.getElementById('musicLocalAudio'),
    iframe: document.getElementById('musicStreamIframe'),
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

  const ytId = extractYoutubeId(url);
  if (ytId) {
    state.musicPlayer.streamMode = 'youtube';
    audio.pause();
    audio.removeAttribute('src');
    iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(ytId)}?enablejsapi=1&autoplay=0&playsinline=1`;
    ensureYoutubeApi();
    if (window.YT?.Player) initYouTubePlayerIfReady();
    setMusicStatus('YouTube stream loaded. Press Play to start (browser may require interaction).');
    return;
  }

  state.musicPlayer.streamMode = 'direct';
  iframe.src = '';
  audio.src = url;
  audio.volume = state.musicPlayer.volume;
  setMusicStatus('Direct stream URL loaded in HTML5 audio player.');
}

function playMusic(){
  const { audio } = getMusicEls();
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
    if (streamIframePlayer?.playVideo) {
      streamIframePlayer.playVideo();
      state.musicPlayer.isPlaying = true;
      save();
      setMusicStatus('Playing YouTube stream (audio via embed player).');
    } else {
      setMusicStatus('YouTube player still loading. Try Play again in a second.');
    }
    return;
  }

  if (audio) {
    if (!audio.src) audio.src = url;
    audio.play().then(() => {
      state.musicPlayer.isPlaying = true;
      save();
      setMusicStatus('Playing direct stream URL via HTML5 audio.');
    }).catch(() => setMusicStatus('Direct stream playback blocked or unsupported by browser/CORS.'));
  }
}

function pauseMusic(){
  const { audio } = getMusicEls();
  if (state.musicPlayer.sourceType === 'local' || state.musicPlayer.streamMode === 'direct') {
    audio?.pause();
  } else if (streamIframePlayer?.pauseVideo) {
    streamIframePlayer.pauseVideo();
  }
  state.musicPlayer.isPlaying = false;
  save();
  setMusicStatus('Playback paused.');
}

function stopMusic(){
  const { audio } = getMusicEls();
  if (state.musicPlayer.sourceType === 'local' || state.musicPlayer.streamMode === 'direct') {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  } else if (streamIframePlayer?.stopVideo) {
    streamIframePlayer.stopVideo();
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
    <div class="music-player-shell">
      <input id="musicStreamUrlInput" placeholder="YouTube/live stream URL" value="${streamVal}" />
      <div class="row-wrap">
        <button id="musicLoadStreamBtn" class="btn">Load Stream</button>
        <button id="musicSaveFavoriteBtn" class="btn ghost">Save Favorite</button>
        <button id="musicUseFavoriteBtn" class="btn ghost" ${hasFav ? '' : 'disabled'}>Use Favorite</button>
      </div>
      <div class="row-wrap">
        <input id="musicLocalFileInput" type="file" accept="audio/*" />
      </div>
      <div class="music-player-controls">
        <button id="musicPlayBtn" class="btn">Play</button>
        <button id="musicPauseBtn" class="btn ghost">Pause</button>
        <button id="musicStopBtn" class="btn ghost">Stop</button>
      </div>
      <label class="music-player-mini">Volume
        <input id="musicVolumeInput" type="range" min="0" max="1" step="0.05" value="${state.musicPlayer.volume}">
      </label>
      <iframe id="musicStreamIframe" class="music-player-hidden" allow="autoplay; encrypted-media" title="Music stream player"></iframe>
      <audio id="musicLocalAudio" class="music-player-hidden" preload="metadata"></audio>
      <div class="music-player-mini">Source: ${state.musicPlayer.sourceType === 'local' ? 'Local file' : 'Stream URL'}${hasFav ? ' · Favorite saved' : ''}</div>
    </div>
  `;

  const els = getMusicEls();
  if (els.audio) els.audio.volume = state.musicPlayer.volume;

  document.getElementById('musicLoadStreamBtn')?.addEventListener('click', () => {
    const url = (els.streamInput?.value || '').trim();
    if (!url) return;
    state.musicPlayer.sourceType = 'stream';
    state.musicPlayer.currentStreamUrl = url;
    state.musicPlayer.currentTrackName = 'Stream URL';
    save();
    loadStreamIntoPlayer(url);
  });

  document.getElementById('musicSaveFavoriteBtn')?.addEventListener('click', () => {
    const url = (els.streamInput?.value || state.musicPlayer.currentStreamUrl || '').trim();
    if (!url) return;
    state.musicPlayer.favoriteStreamUrl = url;
    save();
    renderMusicPlayer();
    setMusicStatus('Saved favorite stream URL.');
  });

  document.getElementById('musicUseFavoriteBtn')?.addEventListener('click', () => {
    if (!state.musicPlayer.favoriteStreamUrl) return;
    state.musicPlayer.sourceType = 'stream';
    state.musicPlayer.currentStreamUrl = state.musicPlayer.favoriteStreamUrl;
    save();
    renderMusicPlayer();
    loadStreamIntoPlayer(state.musicPlayer.currentStreamUrl);
  });

  els.fileInput?.addEventListener('change', () => {
    const file = els.fileInput.files?.[0];
    if (!file || !els.audio) return;
    state.musicPlayer.sourceType = 'local';
    state.musicPlayer.streamMode = 'unknown';
    state.musicPlayer.currentTrackName = file.name;
    els.audio.src = URL.createObjectURL(file);
    els.audio.volume = state.musicPlayer.volume;
    save();
    setMusicStatus(`Local file loaded: ${file.name}`);
  });

  els.volume?.addEventListener('input', (e) => {
    syncMusicVolume(e.target.value);
    save();
  });

  document.getElementById('musicPlayBtn')?.addEventListener('click', playMusic);
  document.getElementById('musicPauseBtn')?.addEventListener('click', pauseMusic);
  document.getElementById('musicStopBtn')?.addEventListener('click', stopMusic);

  if (state.musicPlayer.sourceType === 'stream' && state.musicPlayer.currentStreamUrl) {
    loadStreamIntoPlayer(state.musicPlayer.currentStreamUrl);
    if (state.musicPlayer.streamMode === 'youtube' && window.YT?.Player) {
      initYouTubePlayerIfReady();
    }
  } else if (!document.getElementById('musicPlayerStatus')?.textContent) {
    setMusicStatus('Ready. Load a stream URL or choose a local audio file.');
  }
}

function setVoiceNoteStatus(text){
  const el = document.getElementById('voiceNoteStatus');
  if (el) el.textContent = text;
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
    const startBtn = document.getElementById('voiceNoteStartBtn');
    const stopBtn = document.getElementById('voiceNoteStopBtn');
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
      renderAll();
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
    <div class="row-wrap">
      <button id="voiceNoteStartBtn" class="btn" ${voiceNoteSupported && !voiceNoteListening ? '' : 'disabled'}>Start</button>
      <button id="voiceNoteStopBtn" class="btn ghost" ${voiceNoteListening ? '' : 'disabled'}>Stop</button>
    </div>
    <div class="note-meta mt6">${voiceNoteSupported ? 'Creates a new unassigned note from your speech.' : 'Voice transcription is not supported in this browser.'}</div>
  `;

  if (!voiceNoteSupported) {
    setVoiceNoteStatus('SpeechRecognition unsupported. Try Chrome/Edge on HTTPS or localhost.');
    return;
  }

  document.getElementById('voiceNoteStartBtn')?.addEventListener('click', () => {
    const recognizer = ensureVoiceNoteRecognizer();
    if (!recognizer || voiceNoteListening) return;
    voiceNoteSessionTranscript = '';
    voiceNoteLastError = '';
    voiceNoteManualStop = false;
    voiceNoteAutoRestartLeft = 2;
    voiceNoteListening = true;
    setVoiceNoteStatus('Listening… speak now.');
    document.getElementById('voiceNoteStartBtn').disabled = true;
    document.getElementById('voiceNoteStopBtn').disabled = false;
    try {
      recognizer.start();
    } catch {
      voiceNoteListening = false;
      document.getElementById('voiceNoteStartBtn').disabled = false;
      document.getElementById('voiceNoteStopBtn').disabled = true;
      setVoiceNoteStatus('Could not start voice capture. Try again.');
    }
  });

  document.getElementById('voiceNoteStopBtn')?.addEventListener('click', () => {
    if (!voiceNoteRecognizer || !voiceNoteListening) return;
    voiceNoteManualStop = true;
    voiceNoteAutoRestartLeft = 0;
    setVoiceNoteStatus('Stopping…');
    try {
      voiceNoteRecognizer.stop();
    } catch {}
  });
}

window.onYouTubeIframeAPIReady = function(){
  initYouTubePlayerIfReady();
};

function renderAll(){ applyTheme(); renderDateTime(); renderCalendar(); renderCalendarRemindersPanel(); renderTodayReminders(); renderSettings(); renderProjects(); renderStats(); renderIdeas(); renderNotes(); renderBoard(); renderMusicPlayer(); renderVoiceNotePod(); renderShortcutsPod(); renderShortcutsSettings(); populateProjectSelect(); save(); }

function renderProjects(){
  const wrap = document.getElementById('projectDirectory');
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
  const open = state.tasks.filter(t=>t.column!=='done').length;
  const blocked = state.tasks.filter(t=>t.column==='waiting_blocked').length;
  const approvals = state.tasks.filter(t=>t.blockerType==='approval' && t.column==='waiting_blocked').length;
  const doneWeek = state.tasks.filter(t=>t.column==='done' && daysAgo(t.updatedAt)<=7).length;

  const notesCount = state.notes.length;
  document.getElementById('stats').innerHTML = [
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
      state.notes = state.notes.filter(n=>n.id!==card.dataset.noteId);
      renderAll();
    });
  });

  document.querySelectorAll('#notesBoardToday [data-action="pin"], #notesBoardBacklog [data-action="pin"]').forEach((btn)=>{
    btn.addEventListener('click', (e)=>{
      const card = e.target.closest('.note-card');
      const note = state.notes.find(n=>n.id===card.dataset.noteId);
      if (!note) return;
      note.pinned = !note.pinned;
      note.updatedAt = now();
      renderAll();
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
      renderAll();
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
      <span>${escapeHtml(p.name)}</span>
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
      <span>${escapeHtml(p.name)}</span>
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
    <div class="shortcut-project-checklist">${filterRows}</div>
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
      renderAll();
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
      renderAll();
    });
  });
  document.querySelectorAll('[data-shortcut-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sc = state.shortcuts.find((x) => x.id === btn.dataset.shortcutDelete);
      if (!sc) return;
      if (!confirm(`Delete shortcut "${sc.title}"?`)) return;
      state.shortcuts = state.shortcuts.filter((x) => x.id !== sc.id);
      logChange(`Deleted shortcut: ${sc.title}`);
      renderAll();
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
      renderAll();
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
});
document.getElementById('closeSettingsBtn')?.addEventListener('click', ()=> {
  settingsPanel?.classList.remove('open');
  settingsPanel?.setAttribute('aria-hidden','true');
});

document.getElementById('settingTheme')?.addEventListener('change', (e)=> {
  state.settings.theme = e.target.value;
  logChange(`Theme changed to ${e.target.value}`);
  renderAll();
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
  renderAll();
};

document.getElementById('addIdeaBtn')?.addEventListener('click', () => {
  const input = document.getElementById('ideaInput');
  const text = (input?.value || '').trim();
  if (!text) return;
  state.ideas.unshift({ id: id(), ts: now(), text });
  state.ideas = state.ideas.slice(0, 200);
  if (input) input.value = '';
  logChange('Saved new idea to Ideas Box');
  renderAll();
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
  renderAll();
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
  renderAll();
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
  renderAll();
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
  renderAll();
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

const markdownEditorPatch = 'Markdown editor helpers added for Notes + Edit Task next action (toolbar + safe formatted preview) with future rich-text adapter seam.';
if (!state.changelog.some((c) => c.message === markdownEditorPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: markdownEditorPatch });
}

const markdownToolbarUxPatch = 'Markdown toolbar UX fix: single-click now formats active selection reliably, avoids placeholder insertion when text is selected, and inserts clean caret-ready wrappers for empty selections (bold/italic/underline/lists).';
if (!state.changelog.some((c) => c.message === markdownToolbarUxPatch)) {
  state.changelog.unshift({ id: id(), ts: now(), message: markdownToolbarUxPatch });
}

renderAll();
renderWeather();
renderNbaScores();
renderCrypto();
setInterval(renderDateTime, 1000);
setupWeatherTimer();
setupNbaTimer();
setupCryptoTimer();
document.getElementById('weatherRefreshBtn')?.addEventListener('click', () => renderWeather());
document.getElementById('nbaRefreshBtn')?.addEventListener('click', () => renderNbaScores());
document.getElementById('cryptoRefreshBtn')?.addEventListener('click', () => {
  if (Date.now() < cryptoRefreshCooldownUntil) {
    updateCryptoRefreshButton();
    return;
  }
  startCryptoRefreshCooldown();
  renderCrypto({ manual: true });
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
  renderAll();
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

// Cross-browser sync bootstrap: pull shared disk-backed state if available.
hydrateStateFromSharedApi().then((hydrated) => {
  if (!hydrated) {
    // Seed the shared store from the first browser that opens the dashboard.
    pushStateToSharedApi();
    return;
  }

  renderAll();
  renderWeather();
  renderNbaScores();
  renderCrypto();
  setupWeatherTimer();
  setupNbaTimer();
  setupCryptoTimer();
});