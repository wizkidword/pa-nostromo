import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createThemeController, normalizeThemePreference } = require('../public/app/features/theme.js');

function createClassList() {
  const classes = new Set();
  return {
    add: (...items) => items.forEach((item) => classes.add(item)),
    remove: (...items) => items.forEach((item) => classes.delete(item)),
    contains: (item) => classes.has(item),
  };
}

function createMatchMedia(matches = false) {
  let listener;
  const media = {
    matches,
    addEventListener: (_event, nextListener) => {
      listener = nextListener;
    },
    removeEventListener: (_event, nextListener) => {
      if (listener === nextListener) listener = undefined;
    },
    emit: (nextMatches) => {
      media.matches = nextMatches;
      listener?.({ matches: nextMatches });
    },
    hasListener: () => Boolean(listener),
  };
  return media;
}

assert.equal(normalizeThemePreference('aurora'), 'aurora');
assert.equal(normalizeThemePreference('not-a-theme'), 'dark');

const matchMedia = createMatchMedia(false);
const documentRef = {
  body: {
    classList: createClassList(),
    dataset: {},
  },
  getElementById: (id) => (id === 'themeChoiceGrid' ? choiceGrid : null),
};
const choiceGrid = { innerHTML: '' };
const state = { settings: { theme: 'system' } };
const changedThemes = [];
let unchangedCalls = 0;
const controller = createThemeController({
  document: documentRef,
  window: { matchMedia: () => matchMedia },
  getState: () => state,
  escapeHtml: (value) => String(value),
  onPreferenceChanged: ({ theme }) => changedThemes.push(theme.id),
  onPreferenceUnchanged: () => {
    unchangedCalls += 1;
  },
});

assert.deepEqual(controller.applyTheme(), { preference: 'system', resolvedTheme: 'dark' });
assert.equal(documentRef.body.classList.contains('theme-light'), false);
assert.equal(documentRef.body.dataset.themePreference, 'system');

controller.renderChoices();
assert.match(choiceGrid.innerHTML, /data-theme-choice="system"/);
assert.match(choiceGrid.innerHTML, /is-active/);

assert.deepEqual(controller.setThemePreference('ember'), { changed: true, themeId: 'ember' });
assert.equal(state.settings.theme, 'ember');
assert.deepEqual(changedThemes, ['ember']);
assert.equal(documentRef.body.classList.contains('theme-ember'), true);
assert.equal(documentRef.body.classList.contains('theme-light'), false);

assert.deepEqual(controller.setThemePreference('ember'), { changed: false, themeId: 'ember' });
assert.equal(unchangedCalls, 1);

state.settings.theme = 'system';
controller.bindSystemThemeListener();
matchMedia.emit(true);
assert.equal(documentRef.body.dataset.themeResolved, 'light');
assert.equal(documentRef.body.classList.contains('theme-light'), true);
assert.equal(matchMedia.hasListener(), true);
controller.destroy();
assert.equal(matchMedia.hasListener(), false);

console.log('theme-feature: PASS');
