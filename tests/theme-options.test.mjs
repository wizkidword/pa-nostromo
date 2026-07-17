import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [appSource, themeSource, htmlSource, cssSource] = await Promise.all([
  readFile('public/app.js', 'utf8'),
  readFile('public/app/features/theme.js', 'utf8'),
  readFile('public/index.html', 'utf8'),
  readFile('public/styles.css', 'utf8'),
]);

const expectedThemes = ['dark', 'light', 'system', 'ember', 'forest', 'terminal', 'aurora'];
const concreteThemes = expectedThemes.filter((theme) => theme !== 'system');

assert.match(themeSource, /const options = Object\.freeze\(\[/, 'theme feature should define a theme catalog');
assert.match(themeSource, /function normalizeThemePreference/, 'theme preferences should be normalized');
assert.match(appSource, /MissionControlModules\?\.theme/, 'app.js should load the theme feature');
assert.match(htmlSource, /app\/features\/theme\.js/, 'index.html should load the theme feature before app.js');

for (const theme of expectedThemes) {
  assert.match(themeSource, new RegExp(`id:\\s*'${theme}'`), `theme catalog is missing ${theme}`);
  assert.match(htmlSource, new RegExp(`<option value="${theme}"`), `settings select is missing ${theme}`);
}

for (const theme of concreteThemes.filter((theme) => theme !== 'dark')) {
  assert.match(cssSource, new RegExp(`body\\.theme-${theme}\\s*\\{`), `styles.css is missing body.theme-${theme}`);
}

assert.match(htmlSource, /id="themeChoiceGrid"/, 'settings should render a visual theme choice grid');
assert.match(themeSource, /data-theme-choice/, 'theme feature should render theme swatch controls');

console.log('theme-options: PASS');
