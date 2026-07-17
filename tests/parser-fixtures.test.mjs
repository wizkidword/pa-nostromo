import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseFeedXml, parseAaaCurrentAvgRow } = require('../server.js');
const { parserVersionForRoute } = require('../lib/integration-envelope.js');

const fixtureRoot = path.join(import.meta.dirname, 'fixtures', 'parsers');
const fixture = (name) => readFile(path.join(fixtureRoot, name), 'utf8');

const rssItems = parseFeedXml(await fixture('rss-valid.xml'), 'https://example.test/rss.xml');
assert.equal(rssItems.length, 2);
assert.deepEqual(rssItems.map((item) => ({ title: item.title, link: item.link, feedTitle: item.feedTitle })), [
  { title: 'First sample post', link: 'https://example.test/articles/first', feedTitle: 'Example Technology Feed' },
  { title: 'Second sample post', link: 'https://example.test/articles/second', feedTitle: 'Example Technology Feed' },
]);
assert.equal(rssItems[0].publishedAt, '2026-07-16T12:00:00.000Z');
assert.equal(rssItems[0].summary, 'Short sample summary.');

const atomItems = parseFeedXml(await fixture('atom-valid.xml'), 'https://example.test/atom.xml');
assert.equal(atomItems.length, 1);
assert.deepEqual(atomItems[0], {
  id: atomItems[0].id,
  title: 'Atom sample post',
  link: 'https://example.test/atom/first',
  summary: 'Atom summary text.',
  publishedAt: '2026-07-16T14:30:00.000Z',
  feedTitle: 'Example Atom Feed',
  feedUrl: 'https://example.test/atom.xml',
  guid: 'atom-first',
});
assert.match(atomItems[0].id, /^[a-f0-9]{20}$/);

await assert.rejects(
  async () => parseFeedXml(await fixture('rss-missing-channel.xml'), 'https://example.test/broken.xml'),
  (error) => error?.code === 'rss_parser_unrecognized_feed'
);
await assert.rejects(
  async () => parseFeedXml(await fixture('rss-item-missing-link.xml'), 'https://example.test/broken.xml'),
  (error) => error?.code === 'rss_parser_required_fields_missing'
);

assert.deepEqual(parseAaaCurrentAvgRow(await fixture('aaa-current-avg-valid.html')), {
  regular: '3.129',
  mid: '3.654',
  premium: '4.012',
  diesel: '3.876',
});
assert.equal(parseAaaCurrentAvgRow(await fixture('aaa-current-avg-missing-column.html')), null);

assert.equal(parserVersionForRoute({ id: 'rss.fetch', scope: 'integrations:refresh' }), 'rss-atom-v1');
assert.equal(parserVersionForRoute({ id: 'gas.read', scope: 'integrations:read' }), 'aaa-gas-v1');

console.log('parser-fixtures: PASS');
