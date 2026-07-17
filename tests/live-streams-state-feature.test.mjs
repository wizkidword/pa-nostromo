import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  compactValueLabel,
  getPresentation,
  normalizeState,
} = require('../public/app/features/live-streams-state.js');

let generatedId = 0;
const normalized = normalizeState({
  sourceType: 'twitch',
  inputs: { twitch: ' https://www.twitch.tv/example ', unused: 'ignore me' },
  active: 1,
  status: 'live',
  externalUrl: ' https://twitch.tv/example ',
  renderMode: 'video',
  presets: [
    { name: ' Example ', sourceType: 'twitch', value: ' example ', createdAt: '2026-07-17T12:00:00.000Z' },
    { name: '', value: 'discarded' },
  ],
  customSetting: 'kept',
}, {
  createId: () => `generated-${++generatedId}`,
  getNow: () => '2026-07-17T00:00:00.000Z',
});

assert.equal(normalized.sourceType, 'twitch');
assert.equal(normalized.inputs.twitch, 'https://www.twitch.tv/example');
assert.equal(normalized.inputs.unused, undefined);
assert.equal(normalized.customSetting, 'kept');
assert.deepEqual(normalized.presets, [{
  id: 'generated-1',
  name: 'Example',
  sourceType: 'twitch',
  value: 'example',
  createdAt: '2026-07-17T12:00:00.000Z',
}]);
assert.equal(normalizeState({ sourceType: 'unknown', status: 'broken', renderMode: 'flash' }).sourceType, 'youtube');
assert.equal(normalizeState({ sourceType: 'unknown', status: 'broken', renderMode: 'flash' }).status, 'idle');
assert.equal(normalizeState({ sourceType: 'unknown', status: 'broken', renderMode: 'flash' }).renderMode, 'iframe');
assert.equal(compactValueLabel('https://www.example.com/live/channel?x=1'), 'example.com/live/channel');

const presentation = getPresentation(normalized, { providerLabel: 'Twitch' });
assert.equal(presentation.tone, 'live');
assert.equal(presentation.signalDetail, 'direct media');
assert.equal(presentation.heroTitle, 'Twitch is on deck');
assert.equal(presentation.sourceHeadline, 'twitch.tv/example');
assert.equal(presentation.presetMeta, '1 saved preset ready to reuse.');
assert.deepEqual(presentation.chips, ['Twitch', 'Session active', 'Direct media', 'Fallback ready']);

const failed = getPresentation({ sourceType: 'rumble', status: 'error', lastError: 'Provider blocked this embed.' }, { providerLabel: 'Rumble' });
assert.equal(failed.badge, 'Blocked');
assert.equal(failed.heroMeta, 'Provider blocked this embed.');

console.log('live-streams-state-feature: PASS');
