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
  return handleStatic(req, res);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Mission Control running on http://localhost:${PORT}`);
    console.log(`Shared state file: ${STATE_PATH}`);
    console.log(`State backup dir: ${BACKUPS_DIR} (retain latest ${BACKUP_RETENTION})`);
    console.log(`Voice-to-Rowan relay: ${ROWAN_RELAY_URL ? 'configured' : 'not configured'} (${ROWAN_ALLOW_REMOTE ? 'remote enabled' : 'local only'})`);
    console.log(`Camera snapshot proxy: enabled (${CAMERA_PROXY_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; allowlist entries: ${CAMERA_PROXY_ALLOWLIST.length})`);
    console.log(`RSS fetch API: enabled (${RSS_FETCH_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; max feeds/request: ${RSS_FETCH_MAX_FEEDS})`);
    console.log(`Gas price proxy API: enabled (${GAS_PROXY_ALLOW_REMOTE ? 'remote enabled' : 'local only'})`);
    console.log(`Speed test API: enabled (${SPEED_TEST_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; timeout ${SPEED_TEST_TIMEOUT_MS}ms)`);
  });
}

module.exports = {
  parseJsonSafely,
  fetchJsonViaCurl,
};
