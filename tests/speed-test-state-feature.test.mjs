import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  formatMetric,
  getLatestResult,
  hasWarning,
  normalizeState,
  normalizeThresholds,
} = require('../public/app/features/speed-test-state.js');

const state = normalizeState({
  autoIntervalMin: 30,
  warningThresholds: { pingMs: 80, downloadMbps: 200, uploadMbps: -2 },
  history: [
    { id: 'old', ts: '2026-07-16T12:00:00.000Z', pingMs: -1, downloadMbps: 80, uploadMbps: 10, source: 'invalid' },
    { id: 'new', ts: '2026-07-17T12:00:00.000Z', pingMs: 20, downloadMbps: 250, uploadMbps: 30, source: 'backend-speedtest' },
  ],
});
assert.equal(state.autoIntervalMin, 30);
assert.deepEqual(state.warningThresholds, { pingMs: 80, downloadMbps: 200, uploadMbps: 1 });
assert.deepEqual(state.history.map((entry) => entry.id), ['new', 'old']);
assert.equal(state.history[1].pingMs, 0);
assert.equal(getLatestResult(state.history).id, 'new');
assert.equal(hasWarning({ pingMs: 81, downloadMbps: 300, uploadMbps: 30 }, state.warningThresholds), true);
assert.equal(hasWarning({ pingMs: 20, downloadMbps: 300, uploadMbps: 30 }, state.warningThresholds), false);
assert.equal(formatMetric(12.34, 'Mbps'), '12.3 Mbps');
assert.equal(formatMetric(-1, 'ms'), '—');
assert.deepEqual(normalizeThresholds({}), { pingMs: 100, downloadMbps: 100, uploadMbps: 20 });

console.log('speed-test-state-feature: PASS');
