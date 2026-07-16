import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHostPolicy, validateHostHeader } = require('../lib/route-security.js');
const { ROUTE_MANIFEST, authorizeManifestRoute } = require('../server.js');

function mockResponse() {
  return {
    statusCode: 0,
    body: '',
    writableEnded: false,
    writeHead(status) { this.statusCode = status; },
    end(body = '') { this.body = String(body); this.writableEnded = true; },
  };
}

function request(remoteAddress, headers = {}) {
  return { socket: { remoteAddress }, headers };
}

const hostPolicy = createHostPolicy('localhost:4287,127.0.0.1:4287');
assert.equal(validateHostHeader('127.0.0.1:4287', hostPolicy).ok, true);
assert.equal(validateHostHeader('evil.example:4287', hostPolicy).ok, false);
assert.equal(validateHostHeader('', hostPolicy).ok, false);

const stateWrite = ROUTE_MANIFEST.find((route) => route.id === 'state.write');
assert.ok(stateWrite);
const host = { host: '127.0.0.1', port: 4287 };
const securityContext = {
  csrfToken: 'csrf-test-token',
  apiTokenConfig: {
    configurationError: false,
    tokens: [
      { token: 'state-write-token', scopes: ['state:write'] },
      { token: 'state-read-token', scopes: ['state:read'] },
    ],
  },
};

{
  const res = mockResponse();
  const allowed = authorizeManifestRoute(request('127.0.0.1', { host: '127.0.0.1:4287' }), res, stateWrite, host, securityContext);
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /csrf_required/);
}

{
  const res = mockResponse();
  const allowed = authorizeManifestRoute(request('127.0.0.1', {
    host: '127.0.0.1:4287',
    origin: 'http://127.0.0.1:4287',
    referer: 'http://127.0.0.1:4287/',
    'sec-fetch-site': 'same-origin',
    'x-pa-nostromo-csrf': 'csrf-test-token',
  }), res, stateWrite, host, securityContext);
  assert.equal(allowed, true);
  assert.equal(res.writableEnded, false);
}

{
  const res = mockResponse();
  const allowed = authorizeManifestRoute(request('127.0.0.1', {
    host: '127.0.0.1:4287',
    origin: 'https://attacker.example',
    'sec-fetch-site': 'cross-site',
    'x-pa-nostromo-csrf': 'csrf-test-token',
  }), res, stateWrite, host, securityContext);
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /cross_site_request/);
}

const remoteEnabledStateWrite = { ...stateWrite, remoteEnabled: () => true };
const remoteDisabledStateWrite = { ...stateWrite, remoteEnabled: () => false };
{
  const res = mockResponse();
  const allowed = authorizeManifestRoute(request('192.168.1.20', { authorization: 'Bearer state-write-token' }), res, remoteDisabledStateWrite, host, securityContext);
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /remote_route_disabled/);
}

for (const route of ROUTE_MANIFEST.filter((entry) => entry.remoteAllowed && entry.scope !== 'public')) {
  const res = mockResponse();
  const enabledRoute = { ...route, remoteEnabled: () => true };
  const allowed = authorizeManifestRoute(request('192.168.1.20'), res, enabledRoute, host, securityContext);
  assert.equal(allowed, false, `${route.id} must reject missing remote credentials`);
  assert.equal(res.statusCode, 401, `${route.id} must return auth_required for missing credentials`);
}

{
  const res = mockResponse();
  const allowed = authorizeManifestRoute(request('192.168.1.20', { authorization: 'Bearer state-read-token' }), res, remoteEnabledStateWrite, host, securityContext);
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /insufficient_scope/);
  assert.doesNotMatch(res.body, /state-read-token/);
}

{
  const res = mockResponse();
  const allowed = authorizeManifestRoute(request('192.168.1.20', { authorization: 'Bearer state-write-token' }), res, remoteEnabledStateWrite, host, securityContext);
  assert.equal(allowed, true);
  assert.equal(res.writableEnded, false);
}

console.log('route-authorization: PASS');
