import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseEbayMarketingReport } = require('../server.js');
const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'parsers');
const readFixture = (name) => readFile(path.join(fixtureRoot, name), 'utf8');

const valid = parseEbayMarketingReport(await readFixture('ebay-marketing-report-valid.tsv'));
assert.deepEqual(valid.headers, ['day', 'impressions', 'clicks', 'sales', 'ctr', 'channels']);
assert.deepEqual(valid.rows, [
  { label: '2026-07-15', dayKey: '2026-07-15', impressions: 500, clicks: 25, sales: 4, ctr: 5, channels: 'PROMOTED_LISTINGS' },
  { label: '2026-07-16', dayKey: '2026-07-16', impressions: 650, clicks: 30, sales: 6, ctr: 4.62, channels: 'PROMOTED_LISTINGS' },
]);

const missingRequiredMetric = await readFixture('ebay-marketing-report-missing-metric.tsv');
assert.throws(
  () => parseEbayMarketingReport(missingRequiredMetric),
  (error) => error?.code === 'ebay_marketing_report_parser_required_fields_missing',
);

console.log('ebay-marketing-report-parser: PASS');
