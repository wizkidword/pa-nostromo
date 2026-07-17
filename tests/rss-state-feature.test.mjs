import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeState } = require('../public/app/features/rss-state.js');

let generatedId = 0;
const state = normalizeState({
  feeds: [
    { id: 'later', url: ' https://example.com/later.xml ', tag: ' Later ', addedAt: '2026-07-18T00:00:00.000Z' },
    { url: 'https://example.com/early.xml', tag: 'Early' },
    { id: 'invalid', url: 'ftp://example.com/not-allowed' },
  ],
  items: [
    { id: 'one', feedId: 'later', title: ' First ', link: 'https://example.com/one', summary: ' Summary ' },
    { id: 'bad', link: 'file:///tmp/blocked' },
  ],
  readItemIds: ['one', ' one ', '', 'two'],
  showRead: 1,
  refreshIntervalMin: 999,
  lastError: 'x'.repeat(350),
  customSetting: 'kept',
}, {
  createId: () => `generated-${++generatedId}`,
  getNow: () => '2026-07-17T00:00:00.000Z',
  defaultRefreshMin: 30,
});

assert.deepEqual(state.feeds.map((feed) => feed.id), ['generated-1', 'later']);
assert.deepEqual(state.feeds[0], {
  id: 'generated-1',
  url: 'https://example.com/early.xml',
  tag: 'Early',
  addedAt: '2026-07-17T00:00:00.000Z',
});
assert.deepEqual(state.items, [{
  id: 'one',
  feedId: 'later',
  title: 'First',
  link: 'https://example.com/one',
  summary: 'Summary',
  publishedAt: '',
  feedTitle: '',
  tag: '',
}]);
assert.deepEqual(state.readItemIds, ['one', 'two']);
assert.equal(state.showRead, true);
assert.equal(state.refreshIntervalMin, 180);
assert.equal(state.lastError.length, 300);
assert.equal(state.customSetting, 'kept');
assert.equal(normalizeState({ refreshIntervalMin: 0 }, { defaultRefreshMin: 30 }).refreshIntervalMin, 30);
assert.equal(normalizeState({ refreshIntervalMin: 'bad' }, { defaultRefreshMin: 30 }).refreshIntervalMin, 30);

console.log('rss-state-feature: PASS');
