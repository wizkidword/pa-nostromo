import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createDefaultLayoutState,
  mergedSocialFollowersPodId,
  mergedVoicePodId,
  normalizeLayoutState,
} = require('../public/app/core/layout.js');

const defaults = createDefaultLayoutState();
assert.equal(defaults.visibility[mergedSocialFollowersPodId], true);
assert.equal(defaults.visibility[mergedVoicePodId], true);
assert.ok(defaults.utilityRows.flat().includes('home-device-control'));

const normalized = normalizeLayoutState({
  utilityRows: [
    ['date-time', 'calendar'],
    ['gas-prices'],
    ['facebook-followers', 'voice-note'],
  ],
  visibility: {
    'facebook-followers': false,
    'instagram-followers': false,
    'tiktok-followers': false,
    'youtube-subscribers': false,
    'voice-note': false,
    'voice-to-rowan': true,
    'extra-pod': false,
  },
}, ['extra-pod']);

const podIds = normalized.utilityRows.flat();
assert.ok(podIds.includes(mergedSocialFollowersPodId));
assert.ok(podIds.includes(mergedVoicePodId));
assert.ok(podIds.includes('extra-pod'));
assert.ok(!podIds.includes('facebook-followers'));
assert.ok(!podIds.includes('voice-note'));
assert.ok(normalized.utilityRows.some((row) => row.includes('date-time') && row.includes('gas-prices')));
assert.equal(normalized.visibility[mergedSocialFollowersPodId], false);
assert.equal(normalized.visibility[mergedVoicePodId], true);
assert.equal(normalized.visibility['extra-pod'], false);

console.log('utility-layout-state: PASS');
