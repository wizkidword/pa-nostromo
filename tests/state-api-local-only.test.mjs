import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { authorizeManifestRoute } = require('../server.js');

function createMockResponse() {
  return {
    statusCode: 0,
    body: '',
    writableEnded: false,
    writeHead(status) { this.statusCode = status; },
    end(body = '') { this.body = String(body); this.writableEnded = true; },
  };
}

const localOnlyRoute = {
  id: 'test.local-only',
  scope: 'admin',
  localAllowed: true,
  remoteAllowed: false,
  remoteEnabled: () => false,
  bodyLimit: 0,
  sideEffect: true,
};
const host = { host: '127.0.0.1', port: 4287 };
const securityContext = {
  csrfToken: 'csrf-test-token',
  apiTokenConfig: { configurationError: false, tokens: [{ token: 'admin-token', scopes: ['admin'] }] },
};

{
  const res = createMockResponse();
  const allowed = authorizeManifestRoute({
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      origin: 'http://127.0.0.1:4287',
      'x-pa-nostromo-csrf': 'csrf-test-token',
    },
  }, res, localOnlyRoute, host, securityContext);
  assert.equal(allowed, true);
  assert.equal(res.writableEnded, false);
}

{
  const res = createMockResponse();
  const allowed = authorizeManifestRoute({
    socket: { remoteAddress: '192.168.1.20' },
    headers: { authorization: 'Bearer admin-token' },
  }, res, localOnlyRoute, host, securityContext);
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /remote_route_disabled/);
}

console.log('state-api-local-only: PASS');
