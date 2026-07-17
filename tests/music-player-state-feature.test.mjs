import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getPresentation, normalizeState } = require('../public/app/features/music-player-state.js');

const normalized = normalizeState({
  mode: 'ambient',
  volume: 2,
  ambientPresetId: 'storm',
  ambientSourceIndex: -3.2,
  sleepTimerMin: 17,
  customSetting: 'kept',
}, { ambientPresetIds: ['rain', 'storm'] });
assert.equal(normalized.mode, 'ambient');
assert.equal(normalized.volume, 1);
assert.equal(normalized.ambientPresetId, 'storm');
assert.equal(normalized.ambientSourceIndex, 0);
assert.equal(normalized.sleepTimerMin, 0);
assert.equal(normalized.customSetting, 'kept');
assert.equal(normalizeState({ mode: 'wrong', ambientPresetId: 'missing', volume: -1, sleepTimerMin: 30 }, { ambientPresetIds: ['rain'] }).mode, 'stream');
assert.equal(normalizeState({ mode: 'wrong', ambientPresetId: 'missing', volume: -1, sleepTimerMin: 30 }, { ambientPresetIds: ['rain'] }).ambientPresetId, 'rain');
assert.equal(normalizeState({ mode: 'wrong', ambientPresetId: 'missing', volume: -1, sleepTimerMin: 30 }, { ambientPresetIds: ['rain'] }).volume, 0);
assert.equal(normalizeState({ mode: 'wrong', ambientPresetId: 'missing', volume: -1, sleepTimerMin: 30 }, { ambientPresetIds: ['rain'] }).sleepTimerMin, 30);

const ambient = {
  preset: { label: 'Storm', sources: [{}, {}, {}] },
  sourceIndex: 1,
  source: { label: 'Rain and thunder', url: 'https://example.com/storm.mp3' },
};
const presentation = getPresentation({
  mode: 'ambient',
  isPlaying: true,
  volume: 0.55,
  favoriteStreamUrl: 'https://example.com/favorite',
  sleepTimerMin: 30,
}, { ambient });
assert.equal(presentation.tone, 'playing');
assert.equal(presentation.signalDetail, 'ambient live');
assert.equal(presentation.heroTitle, 'Storm');
assert.equal(presentation.heroMeta, 'Ambient playback is live with Rain and thunder.');
assert.equal(presentation.sourceLine, 'Ambient · Storm');
assert.equal(presentation.favoriteLine, 'Favorite saved');
assert.equal(presentation.sleepLine, 'Sleep 30m');
assert.equal(presentation.volumePercent, 55);

const failed = getPresentation({ currentStreamUrl: 'https://example.com/live' }, { statusText: 'Playback blocked by provider.' });
assert.equal(failed.badge, 'Issue');
assert.equal(failed.heroMeta, 'Playback blocked by provider.');

console.log('music-player-state-feature: PASS');
