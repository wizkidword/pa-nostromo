import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { server, PUBLIC_ROOT, safePathFromUrl } = require('../server.js');

function request(port, requestPath, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

assert.equal(safePathFromUrl('/'), path.join(PUBLIC_ROOT, 'index.html'));
assert.equal(safePathFromUrl('/assets/social/github.svg'), path.join(PUBLIC_ROOT, 'assets', 'social', 'github.svg'));
assert.equal(safePathFromUrl('/.env'), null);
assert.equal(safePathFromUrl('/%252e%252e/server.js'), null);
assert.equal(safePathFromUrl('/..%5cserver.js'), null);

const linkPath = path.join(PUBLIC_ROOT, '__static-test-symlink__');
await fsp.rm(linkPath, { recursive: true, force: true });
await fsp.symlink(process.cwd(), linkPath, process.platform === 'win32' ? 'junction' : 'dir');

const port = await listen();
try {
  const home = await request(port, '/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /^text\/html/);
  assert.equal(home.headers['cache-control'], 'no-store');
  assert.equal(home.headers['x-content-type-options'], 'nosniff');
  assert.equal(home.headers['referrer-policy'], 'no-referrer');
  assert.equal(home.headers['cross-origin-resource-policy'], 'same-origin');
  assert.equal(home.headers['x-frame-options'], 'DENY');
  assert.match(home.body, /PA Nostromo|Mission Control/i);
  assert.ok(home.headers.etag);

  const notModified = await request(port, '/', 'GET', { 'If-None-Match': home.headers.etag });
  assert.equal(notModified.status, 304);
  assert.equal(notModified.body, '');

  const head = await request(port, '/app.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.match(head.headers['content-type'], /^application\/javascript/);
  assert.equal(head.body, '');

  const method = await request(port, '/', 'POST');
  assert.equal(method.status, 405);
  assert.equal(method.headers.allow, 'GET, HEAD');

  const unexpectedHost = await request(port, '/', 'GET', { Host: 'attacker.example' });
  assert.equal(unexpectedHost.status, 400);
  assert.match(unexpectedHost.body, /host_not_allowed/);

  for (const protectedPath of [
    '/.env',
    '/.env.local',
    '/server.js',
    '/package.json',
    '/package-lock.json',
    '/tests/static-path-safety.test.mjs',
    '/data/state.json',
    '/logs/server.log',
    '/.auth/session.json',
    '/../server.js',
    '/%2e%2e/server.js',
    '/%252e%252e/server.js',
    '/..%5cserver.js',
    '/%EF%BC%8E%EF%BC%8E/server.js',
    '/__static-test-symlink__/server.js',
  ]) {
    const response = await request(port, protectedPath);
    assert.equal(response.status, 404, `${protectedPath} must be unreachable`);
  }

  const unknown = await request(port, '/assets/social/unknown.custom');
  assert.equal(unknown.status, 404);
} finally {
  await close();
  await fsp.rm(linkPath, { recursive: true, force: true });
}

console.log('static-path-safety: PASS');
