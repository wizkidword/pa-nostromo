import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ROUTE_MANIFEST } = require('../server.js');
const { resolveRoute } = require('../lib/route-manifest.js');

const expectedRoutes = [
  ['security.bootstrap', 'GET', '/api/security/bootstrap'],
  ['app.info', 'GET', '/api/app-info'],
  ['state.read', 'GET', '/api/state'],
  ['state.write', 'POST', '/api/state'],
  ['state.backups', 'GET', '/api/state/backups'],
  ['state.restore', 'POST', '/api/state/restore'],
  ['relay.send', 'POST', '/api/rowan-send'],
  ['camera.snapshot', 'GET', '/api/camera-snapshot'],
  ['rss.fetch', 'POST', '/api/rss/fetch'],
  ['gas.read', 'GET', '/api/gas-prices'],
  ['crypto.read', 'GET', '/api/crypto/coins/list'],
  ['system.resources', 'GET', '/api/system-resources'],
  ['system.speed-test', 'GET', '/api/speed-test'],
  ['devices.ping', 'POST', '/api/home-devices/ping'],
  ['devices.wake', 'POST', '/api/home-devices/wake'],
  ['email.unread', 'GET', '/api/email-unread'],
  ['email.message', 'POST', '/api/email-unread/message'],
  ['email.read', 'POST', '/api/email-unread/read'],
  ['email.read-batch', 'POST', '/api/email-unread/read-batch'],
  ['email.delete', 'POST', '/api/email-unread/delete'],
  ['email.delete-batch', 'POST', '/api/email-unread/delete-batch'],
  ['email.spam', 'POST', '/api/email-unread/spam'],
  ['email.spam-batch', 'POST', '/api/email-unread/spam-batch'],
  ['ebay.read', 'GET', '/api/ebay-traffic'],
  ['ebay.refresh', 'POST', '/api/ebay-traffic/refresh'],
];

for (const integration of ['facebook-followers', 'facebook-group-members', 'facebook-content', 'instagram-content', 'instagram-followers', 'tiktok-followers', 'youtube-subscribers']) {
  expectedRoutes.push(
    [`${integration}.read`, 'GET', `/api/${integration}`],
    [`${integration}.refresh`, 'POST', `/api/${integration}/refresh`],
    [`${integration}.health`, 'GET', `/api/${integration}/health`],
  );
}

assert.equal(ROUTE_MANIFEST.length, expectedRoutes.length, 'Every API route must have one manifest entry.');
assert.equal(new Set(ROUTE_MANIFEST.map((route) => route.id)).size, ROUTE_MANIFEST.length, 'Manifest route IDs must be unique.');

for (const [id, method, pathname] of expectedRoutes) {
  const resolved = resolveRoute(ROUTE_MANIFEST, pathname, method);
  assert.equal(resolved.route?.id, id, `${method} ${pathname} must resolve through the manifest.`);
}

for (const [method, pathname] of [['GET', '/api/diary-index'], ['POST', '/api/diary-index/refresh']]) {
  assert.equal(resolveRoute(ROUTE_MANIFEST, pathname, method).route, null, `${method} ${pathname} must be unavailable by default.`);
}

for (const route of ROUTE_MANIFEST) {
  assert.match(route.method, /^(GET|POST)$/);
  assert.equal(typeof route.matches, 'function');
  assert.equal(typeof route.scope, 'string');
  assert.equal(typeof route.localAllowed, 'boolean');
  assert.equal(typeof route.remoteAllowed, 'boolean');
  assert.equal(typeof route.remoteEnabled, 'function');
  assert.equal(typeof route.bodyLimit, 'number');
  assert.equal(typeof route.ratePolicy, 'string');
  assert.equal(typeof route.sideEffect, 'boolean');
}

console.log('route-manifest: PASS');
