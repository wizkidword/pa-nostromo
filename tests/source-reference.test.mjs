import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeSourceReference, sourceLabel, actionTitle } = require('../public/app/features/source-reference.js');

assert.deepEqual(normalizeSourceReference({
  type: 'rss',
  externalId: 'feed-1',
  title: '  Useful\narticle  ',
  url: 'https://example.test/story',
}), {
  type: 'rss',
  externalId: 'feed-1',
  title: 'Useful article',
  url: 'https://example.test/story',
});

assert.deepEqual(normalizeSourceReference({
  type: 'email',
  externalId: 'account:inbox:42',
  title: 'Quarterly review',
  url: 'https://mail.example.test/private-message',
}), {
  type: 'email',
  externalId: 'account:inbox:42',
  title: 'Quarterly review',
  url: '',
}, 'email references must not retain mailbox URLs');

assert.equal(normalizeSourceReference({ type: 'rss', externalId: '', title: 'Missing ID' }), null);
assert.equal(normalizeSourceReference({ type: 'unknown', externalId: 'x', title: 'Unknown' }), null);
assert.equal(normalizeSourceReference({ type: 'ebay', externalId: 'x', title: 'Unsafe', url: 'javascript:alert(1)' }).url, '');
assert.equal(sourceLabel({ type: 'social', externalId: 'instagram', title: 'Instagram audience needs review' }), 'Social signal: Instagram audience needs review');
assert.equal(actionTitle({ type: 'rss', externalId: 'x', title: 'Story' }, 'note'), 'Note: Story');

console.log('source-reference: PASS');
