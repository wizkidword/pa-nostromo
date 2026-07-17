import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApiRouter } = require('../server/router.js');
const calls = [];
const handlers = Object.fromEntries([
  'appInfo', 'state', 'rowanSend', 'cameraSnapshot', 'rssFetch', 'gasPrices', 'cryptoProxy',
  'systemResources', 'speedTest', 'homeDevicePing', 'homeDeviceWake', 'unreadEmail', 'ebayTraffic',
  'facebookFollowers', 'facebookGroupMembers', 'facebookContent', 'instagramContent',
  'instagramFollowers', 'tikTokFollowers', 'youtubeSubscribers',
].map((name) => [name, () => calls.push(name)]));
let notFound;
const dispatch = createApiRouter({
  handlers,
  sendJson: (_res, status, payload) => { notFound = { status, payload }; },
});

await dispatch({}, {}, '/api/email-unread/read');
await dispatch({}, {}, '/api/ebay-traffic/refresh');
await dispatch({}, {}, '/api/crypto/quotes');
await dispatch({}, {}, '/api/not-a-route');

assert.deepEqual(calls, ['unreadEmail', 'ebayTraffic', 'cryptoProxy']);
assert.deepEqual(notFound, { status: 404, payload: { ok: false, error: 'not_found' } });
assert.throws(() => createApiRouter({ handlers: {}, sendJson() {} }), /appInfo/);
console.log('api-router: PASS');
