import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  safeErrorCode,
  buildIntegrationHealthEntry,
  buildIntegrationHealthEntries,
} = require('../public/app/features/integration-health.js');

const now = Date.parse('2026-07-17T15:00:00.000Z');

const stale = buildIntegrationHealthEntry({ id: 'rss', name: 'RSS Feeds' }, {
  now,
  configuration: { configured: true, sourceUpdatedAt: '2026-07-17T13:00:00.000Z' },
  scheduler: {
    enabled: true,
    lastAttemptAt: now - 60_000,
    lastSuccessAt: now - 90_000,
    nextRefreshAt: now + 60_000,
    manualCooldownMs: 30_000,
    lastManualRefreshAt: now - 10_000,
  },
  signal: { status: 'stale', detail: 'retry in 30s' },
});
assert.equal(stale.status, 'stale');
assert.equal(stale.configured, 'configured');
assert.equal(stale.cooldownActive, true);
assert.equal(stale.sourceUpdatedAt, Date.parse('2026-07-17T13:00:00.000Z'));

const disabled = buildIntegrationHealthEntry({ id: 'email', name: 'Unread Email' }, {
  now,
  configuration: { configured: false },
  scheduler: { enabled: false },
});
assert.equal(disabled.status, 'disabled', 'disabled must remain distinct from not configured');
assert.equal(disabled.configured, 'not_configured');

const authenticationFailure = buildIntegrationHealthEntry({ id: 'email', name: 'Unread Email' }, {
  now,
  configuration: { configured: true },
  scheduler: { enabled: true, lastError: 'Bearer secret-token was rejected' },
  signal: { status: 'error', detail: 'Bearer secret-token was rejected' },
});
assert.equal(authenticationFailure.status, 'error');
assert.equal(authenticationFailure.authenticationExpired, true);
assert.equal(authenticationFailure.errorCode, 'authentication_failed');
assert.equal(JSON.stringify(authenticationFailure).includes('secret-token'), false, 'health entries must never expose raw diagnostics');

assert.equal(safeErrorCode('HTTP 429 throttled'), 'rate_limited');
assert.equal(safeErrorCode('invalid document shape'), 'integration_failed');

const entries = buildIntegrationHealthEntries([
  { id: 'crypto', schedulerId: 'crypto-job', signalId: 'crypto-signal' },
], {
  now,
  getScheduler: (id) => id === 'crypto-job' ? { enabled: true, inFlight: true } : null,
  getSignal: (id) => id === 'crypto-signal' ? { status: 'fresh' } : null,
  getConfiguration: () => ({ configured: true }),
});
assert.equal(entries.length, 1);
assert.equal(entries[0].status, 'refreshing');

console.log('integration-health: PASS');
