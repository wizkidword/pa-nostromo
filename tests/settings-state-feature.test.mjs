import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { defaults, normalizeState } = require('../public/app/features/settings-state.js');

assert.deepEqual(defaults, {
  theme: 'dark',
  weatherIntervalMin: 15,
  defaultTaskColumn: 'inbox',
});

const projectIds = ['project-a'];
const state = normalizeState({
  theme: 'unknown',
  weatherIntervalMin: 60,
  defaultTaskColumn: 'ideas',
  shortcutsFilterProjectIds: projectIds,
  customSetting: 'kept',
}, {
  normalizeThemePreference: (value) => value === 'dark' ? value : 'dark',
  normalizeTaskColumn: (value) => value === 'ideas' ? 'inbox' : value,
});

assert.equal(state.theme, 'dark');
assert.equal(state.weatherIntervalMin, 60);
assert.equal(state.defaultTaskColumn, 'inbox');
assert.equal(state.shortcutsFilterProjectIds, projectIds);
assert.equal(state.customSetting, 'kept');
assert.deepEqual(normalizeState({ shortcutsFilterProjectIds: 'invalid' }).shortcutsFilterProjectIds, []);

console.log('settings-state-feature: PASS');
