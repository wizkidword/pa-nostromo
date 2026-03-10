const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PORT = Number(process.env.PORT || 4187);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

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
  return handleStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Mission Control running on http://localhost:${PORT}`);
  console.log(`Shared state file: ${STATE_PATH}`);
});
