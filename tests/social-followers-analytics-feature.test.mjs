import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildDailyRollups,
  computeWindowStats,
  filterHistoryByRange,
  formatAge,
  formatContentType,
  formatMetricValue,
  formatRatePerHour,
  normalizeContentItems,
  normalizeHistory,
  summarizeStatus,
  trimCaption,
} = require('../public/app/features/social-followers-analytics.js');

const history = normalizeHistory([
  { followersCount: 120, fetchedAt: '2026-07-15T12:00:00.000Z' },
  { followersCount: 'not-a-number', fetchedAt: '2026-07-16T12:00:00.000Z' },
  { followersCount: 100, fetchedAt: '2026-07-14T12:00:00.000Z' },
  { followersCount: 140, fetchedAt: '2026-07-17T12:00:00.000Z' },
]);
assert.deepEqual(history.map((entry) => entry.value), [100, 120, 140]);
assert.equal(formatMetricValue(12), '+12');
assert.equal(formatAge(90 * 60000), '1h 30m ago');
assert.equal(formatRatePerHour(-2.25), '-2.3/h');

const stats = computeWindowStats(history);
assert.equal(stats.net, 40);
assert.equal(stats.sampleCount, 3);
assert.equal(stats.bestGain, 20);
assert.equal(stats.worstDrop, 20);
assert.equal(stats.avgPerHour, 40 / 72);
assert.equal(filterHistoryByRange(history, '24h').length, 2);
assert.equal(buildDailyRollups(history).length, 3);

assert.deepEqual(normalizeContentItems([
  { code: 'post-a', caption: ' A  caption ', likeCount: '3', commentCount: 2, repostCount: 1, productType: 'clips' },
  { caption: 'missing code' },
]), [{
  code: 'post-a',
  permalink: '',
  caption: 'A caption',
  takenAt: '',
  productType: 'clips',
  likeCount: 3,
  commentCount: 2,
  shareCount: 1,
  saveCount: null,
  reachCount: null,
  repostCount: 1,
  viewCount: null,
  interactionCount: 6,
}]);
assert.equal(formatContentType({ productType: 'carousel_container' }), 'Carousel');
assert.equal(trimCaption('a'.repeat(40), 12), 'a'.repeat(24) + '...');

assert.deepEqual(summarizeStatus([{ staleLevel: 'fresh' }, { staleLevel: 'stale' }]), { mode: 'stale', detail: '1 live · 1 stale' });
assert.deepEqual(summarizeStatus([{ staleLevel: 'critical' }]), { mode: 'error', detail: 'all blocked' });

console.log('social-followers-analytics-feature: PASS');
