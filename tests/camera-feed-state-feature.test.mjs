import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  compactSourceLabel,
  getPresentation,
  modeLabel,
  normalizeState,
} = require('../public/app/features/camera-feed-state.js');

const normalized = normalizeState({
  sourceUrl: ' https://www.example.com/camera/one ',
  mode: 'snapshot',
  refreshIntervalSec: 99.8,
  active: 1,
  status: 'live',
  lastError: 'x'.repeat(350),
  useProxy: false,
  deviceId: 42,
  viewportWidth: 95,
  viewportHeight: 999,
  customSetting: 'kept',
});
assert.deepEqual(normalized, {
  sourceUrl: 'https://www.example.com/camera/one',
  mode: 'snapshot',
  refreshIntervalSec: 60,
  active: true,
  status: 'live',
  lastError: 'x'.repeat(300),
  useProxy: false,
  deviceId: '42',
  viewportWidth: 280,
  viewportHeight: 900,
  customSetting: 'kept',
});
assert.equal(normalizeState({ mode: 'unknown', status: 'invalid', refreshIntervalSec: 0 }).mode, 'stream');
assert.equal(normalizeState({ mode: 'unknown', status: 'invalid', refreshIntervalSec: 0 }).status, 'idle');
assert.equal(normalizeState({ mode: 'unknown', status: 'invalid', refreshIntervalSec: 0 }).refreshIntervalSec, 1);
assert.equal(modeLabel('local'), 'Local webcam');
assert.equal(compactSourceLabel('https://www.example.com/a/b?c=1'), 'example.com/a/b');

const presentation = getPresentation(normalized, { deviceLabel: 'Office Cam', cameraAvailable: false });
assert.equal(presentation.tone, 'live');
assert.equal(presentation.signalDetail, '60s cycle');
assert.equal(presentation.heroTitle, 'Snapshot monitor is running');
assert.equal(presentation.heroMeta, 'Refreshing every 60s.');
assert.deepEqual(presentation.chips, ['Snapshot refresh', 'Session active', '60s refresh']);
assert.equal(presentation.stageMeta, 'Resize the frame as needed. Current snapshot cadence: 60s.');
assert.match(presentation.footnote, /may be unavailable/);

const failed = getPresentation({ mode: 'stream', status: 'error', lastError: 'Blocked by source.' });
assert.equal(failed.badge, 'Issue');
assert.equal(failed.heroMeta, 'Blocked by source.');

console.log('camera-feed-state-feature: PASS');
