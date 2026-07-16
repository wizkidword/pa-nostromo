import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [appSource, htmlSource, cssSource] = await Promise.all([
  readFile('app.js', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('styles.css', 'utf8'),
]);

const expectedThemes = ['dark', 'light', 'system', 'ember', 'forest', 'terminal', 'aurora'];
const concreteThemes = expectedThemes.filter((theme) => theme !== 'system');

assert.match(appSource, /const THEME_OPTIONS = \[/, 'app.js should define a theme catalog');
assert.match(appSource, /function normalizeThemePreference/, 'theme preferences should be normalized');

for (const theme of expectedThemes) {
  assert.match(appSource, new RegExp(`id:\\s*'${theme}'`), `app theme catalog is missing ${theme}`);
  assert.match(htmlSource, new RegExp(`<option value="${theme}"`), `settings select is missing ${theme}`);
}

for (const theme of concreteThemes.filter((theme) => theme !== 'dark')) {
  assert.match(cssSource, new RegExp(`body\\.theme-${theme}\\s*\\{`), `styles.css is missing body.theme-${theme}`);
}

assert.match(htmlSource, /id="themeChoiceGrid"/, 'settings should render a visual theme choice grid');
assert.match(appSource, /data-theme-choice/, 'app.js should wire theme swatch controls');

console.log('theme-options: PASS');
