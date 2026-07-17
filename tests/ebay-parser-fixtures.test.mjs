import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseEbayTrafficReport } = require('../server.js');
const { parserVersionForRoute } = require('../lib/integration-envelope.js');
const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'parsers');
const readFixture = async (name) => JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8'));
const requiredDayMetrics = [
  'TOTAL_IMPRESSION_TOTAL',
  'LISTING_VIEWS_TOTAL',
  'LISTING_IMPRESSION_TOTAL',
  'LISTING_IMPRESSION_STORE',
  'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE',
  'LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE',
  'LISTING_VIEWS_SOURCE_STORE',
  'LISTING_VIEWS_SOURCE_DIRECT',
  'LISTING_VIEWS_SOURCE_OTHER_EBAY',
  'LISTING_VIEWS_SOURCE_OFF_EBAY',
  'TRANSACTION',
  'CLICK_THROUGH_RATE',
  'SALES_CONVERSION_RATE',
];

const valid = parseEbayTrafficReport(await readFixture('ebay-traffic-valid.json'), { requiredMetricKeys: requiredDayMetrics });
assert.deepEqual(valid.metricKeys, requiredDayMetrics);
assert.deepEqual(valid.records, [{
  dimensionValue: '2026-07-16',
  metrics: {
    TOTAL_IMPRESSION_TOTAL: 1000,
    LISTING_VIEWS_TOTAL: 50,
    LISTING_IMPRESSION_TOTAL: 400,
    LISTING_IMPRESSION_STORE: 300,
    LISTING_IMPRESSION_SEARCH_RESULTS_PAGE: 600,
    LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE: 25,
    LISTING_VIEWS_SOURCE_STORE: 15,
    LISTING_VIEWS_SOURCE_DIRECT: 5,
    LISTING_VIEWS_SOURCE_OTHER_EBAY: 3,
    LISTING_VIEWS_SOURCE_OFF_EBAY: 2,
    TRANSACTION: 4,
    CLICK_THROUGH_RATE: 5,
    SALES_CONVERSION_RATE: 8,
  },
}]);

const missingRequiredMetric = await readFixture('ebay-traffic-missing-required-metric.json');
assert.throws(
  () => parseEbayTrafficReport(missingRequiredMetric, { requiredMetricKeys: requiredDayMetrics }),
  (error) => error?.code === 'ebay_traffic_parser_required_fields_missing',
);

assert.equal(parserVersionForRoute({ id: 'ebay.read' }), 'ebay-analytics-v2');

console.log('ebay-parser-fixtures: PASS');
