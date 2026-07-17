import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createIntegrationEnvelope,
  withIntegrationEnvelope,
} = require('../lib/integration-envelope.js');
const { server } = require('../server.js');

const rssRoute = { id: 'rss.fetch', scope: 'integrations:refresh' };
const stateRoute = { id: 'state.read', scope: 'state:read' };

const freshPayload = { ok: true, fetchedAt: '2026-07-16T12:00:00.000Z', items: [{ id: 'feed-1' }] };
const fresh = withIntegrationEnvelope(freshPayload, { route: rssRoute, httpStatus: 200 });
assert.equal(fresh.items[0].id, 'feed-1', 'legacy payload fields remain available');
assert.deepEqual(fresh.integration, {
  status: 'ok',
  data: freshPayload,
  fetchedAt: '2026-07-16T12:00:00.000Z',
  sourceUpdatedAt: null,
  parserVersion: 'rss-atom-v1',
  warning: null,
  errorCode: null,
});
assert.equal('integration' in fresh.integration.data, false, 'the envelope data must not contain a recursive envelope');

const stale = createIntegrationEnvelope({
  route: rssRoute,
  payload: { ok: true, stale: true, fetchedAt: '2026-07-16T11:00:00.000Z' },
});
assert.equal(stale.status, 'stale');
assert.equal(stale.warning, 'Serving the last successful integration result.');

const notConfigured = createIntegrationEnvelope({
  route: { id: 'ebay.read', scope: 'integrations:read' },
  payload: { ok: true, setupRequired: true },
});
assert.equal(notConfigured.status, 'not_configured');
assert.equal(notConfigured.data, null);

const parserFailure = createIntegrationEnvelope({
  route: rssRoute,
  payload: { ok: true, items: [], feeds: [], errors: [{ error: 'rss_parser_failed' }] },
});
assert.equal(parserFailure.status, 'error');
assert.equal(parserFailure.data, null, 'parser failures must not masquerade as empty data');
assert.equal(parserFailure.errorCode, 'rss_parser_failed');

const untouchedState = { ok: true, tasks: [] };
assert.equal(withIntegrationEnvelope(untouchedState, { route: stateRoute }), untouchedState, 'non-integration routes keep their existing contract');

async function listenRandom() {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not expose a random port');
  return address.port;
}

async function closeServer() {
  await new Promise((resolve) => server.close(resolve));
}

const requestId = 'integration-envelope-20260716';
const port = await listenRandom();
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/gas-prices`, {
    headers: { 'X-Request-ID': requestId },
  });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'missing_location');
  assert.equal(payload.requestId, requestId);
  assert.deepEqual(payload.integration, {
    status: 'error',
    data: null,
    fetchedAt: null,
    sourceUpdatedAt: null,
    parserVersion: 'aaa-gas-v1',
    warning: null,
    errorCode: 'missing_location',
  });
} finally {
  await closeServer();
}

console.log('integration-envelope: PASS');
