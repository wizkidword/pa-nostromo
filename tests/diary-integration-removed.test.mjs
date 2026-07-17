import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ROUTE_MANIFEST } = require('../server.js');

assert.equal(ROUTE_MANIFEST.some((route) => route.id.startsWith('diary.')), false, 'Diary routes must not be present in the default route manifest.');

for (const file of ['server.js', 'public/app.js', 'public/index.html']) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.equal(source.includes('/api/diary-index'), false, `${file} must not expose the removed diary API.`);
  assert.equal(source.toLowerCase().includes('taverncollectibles-v2'), false, `${file} must not reference a sibling repository.`);
}

console.log('diary-integration-removed: PASS');
