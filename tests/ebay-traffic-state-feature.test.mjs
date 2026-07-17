import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildListingUrl,
  classifyMarketingReportAge,
  formatDeltaText,
  formatNumber,
  formatPercent,
  normalizeInsightView,
  normalizeListingsView,
  normalizePromoLiftWindow,
  resolveActiveStore,
  selectTopListings,
  widthClass,
} = require('../public/app/features/ebay-traffic-state.js');

assert.equal(normalizeInsightView('trend'), 'trend');
assert.equal(normalizeInsightView('unknown'), 'sources');
assert.equal(normalizeListingsView('watchers'), 'watchers');
assert.equal(normalizeListingsView('other'), 'traffic');
assert.equal(normalizePromoLiftWindow('avg7'), 'avg7');
assert.equal(normalizePromoLiftWindow('other'), 'day');

const stores = [
  { id: 'setup', status: 'setup' },
  { id: 'configured', configured: true },
  { id: 'healthy', status: 'ok', configured: true },
];
assert.deepEqual(resolveActiveStore(stores, 'setup'), { store: stores[0], storeId: 'setup', changed: false });
assert.deepEqual(resolveActiveStore(stores, 'missing'), { store: stores[2], storeId: 'healthy', changed: true });
assert.deepEqual(resolveActiveStore([], 'missing'), { store: null, storeId: '', changed: false });

assert.equal(formatNumber('not-a-number'), 'n/a');
assert.equal(formatPercent(12), '12%');
assert.equal(formatPercent(2.5), '2.5%');
assert.equal(buildListingUrl('item / 1', 'EBAY_GB'), 'https://www.ebay.co.uk/itm/item%20%2F%201');
assert.equal(buildListingUrl(''), '');
assert.equal(formatDeltaText({ deltaPercent: 2 }), '+2% vs previous day');
assert.equal(formatDeltaText({}), 'No prior day vs previous day');
assert.equal(widthClass(83), 'ebay-traffic-bar-fill ebay-traffic-bar-fill--w-83');

const now = Date.parse('2026-07-17T12:00:00.000Z');
assert.deepEqual(classifyMarketingReportAge('2026-07-17T10:00:00.000Z', now), { tone: 'fresh', label: 'Fresh report' });
assert.deepEqual(classifyMarketingReportAge('2026-07-17T03:00:00.000Z', now), { tone: 'warm', label: 'Aging report' });
assert.deepEqual(classifyMarketingReportAge('2026-07-16T12:00:00.000Z', now), { tone: 'stale', label: 'Older report' });

const topListings = selectTopListings({ topListings: [
  { listingId: 'a', watchCount: 2, views: 20 },
  { listingId: 'b', watchCount: 5, views: 10 },
  { listingId: 'c', views: 40 },
] }, 'watchers');
assert.equal(topListings.activeView, 'watchers');
assert.equal(topListings.hasWatchCounts, true);
assert.deepEqual(topListings.listings.map((item) => item.listingId), ['b', 'a']);

console.log('ebay-traffic-state-feature: PASS');
