const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
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
      files.push({
        backupFile: ent.name,
        size: st.size,
        createdAt: st.birthtime?.toISOString?.() || st.mtime.toISOString(),
        mtimeMs: st.mtimeMs,
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
  const payload = {
    ...deepClone(stateObj),
    __backupMeta: {
      reason,
      createdAt: new Date().toISOString(),
    },
  };
  await fsp.writeFile(backupPath, JSON.stringify(payload, null, 2), 'utf8');
  await pruneBackups(BACKUP_RETENTION);
  return backupFile;
}

async function writeStateWithIntegrity(incomingState) {
  const savedAt = new Date().toISOString();
  const next = deepClone(incomingState || {});
  next.__integrity = {
    savedAt,
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

      const integrity = await writeStateWithIntegrity(backupState);
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
      const overrideAllowedSources = new Set(['manual_restore', 'manual_import']);
      const allowOverride = overrideDowngrade && overrideAllowedSources.has(source);

      const cleanIncoming = deepClone(parsed);
      delete cleanIncoming.__writeControl;

      const { state: current, integrity } = await readStateFileSafe();
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

      const writeIntegrity = await writeStateWithIntegrity(cleanIncoming);
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
      redirect: 'follow',
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
  return handleStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Mission Control running on http://localhost:${PORT}`);
  console.log(`Shared state file: ${STATE_PATH}`);
  console.log(`State backup dir: ${BACKUPS_DIR} (retain latest ${BACKUP_RETENTION})`);
  console.log(`Voice-to-Rowan relay: ${ROWAN_RELAY_URL ? 'configured' : 'not configured'} (${ROWAN_ALLOW_REMOTE ? 'remote enabled' : 'local only'})`);
  console.log(`Camera snapshot proxy: enabled (${CAMERA_PROXY_ALLOW_REMOTE ? 'remote enabled' : 'local only'}; allowlist entries: ${CAMERA_PROXY_ALLOWLIST.length})`);
});
