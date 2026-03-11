const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

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

// Local config support (safe precedence): shell env > .env.local > .env
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
  // Do not trust x-forwarded-for here; clients can spoof it unless a trusted proxy is enforced.
  return isLoopbackAddress(req.socket?.remoteAddress);
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
      await fsp.writeFile(STATE_PATH, JSON.stringify(parsed, null, 2), 'utf8');
      return sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() });
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
  return handleStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Mission Control running on http://localhost:${PORT}`);
  console.log(`Shared state file: ${STATE_PATH}`);
  console.log(`Voice-to-Rowan relay: ${ROWAN_RELAY_URL ? 'configured' : 'not configured'} (${ROWAN_ALLOW_REMOTE ? 'remote enabled' : 'local only'})`);
});
