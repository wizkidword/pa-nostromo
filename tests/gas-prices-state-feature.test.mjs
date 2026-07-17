import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  formatPrice,
  normalizePriceValues,
  normalizeState,
} = require('../public/app/features/gas-prices-state.js');

assert.equal(formatPrice('$3.499'), '$3.499');
assert.equal(formatPrice('3.4'), '$3.400');
assert.equal(formatPrice('zero'), '');

assert.deepEqual(normalizePriceValues({ regular: '3.20', diesel: '$4.5' }), {
  regular: '$3.200',
  mid: '',
  premium: '',
  diesel: '$4.500',
});

assert.deepEqual(normalizeState({
  location: ' 44101 ',
  source: 'invalid',
  manualValues: { regular: '$3.250' },
  manualUpdatedAt: '2026-07-17T12:00:00.000Z',
}), {
  location: '44101',
  resolvedLocation: '',
  source: 'manual',
  sourceUrl: '',
  fetchedAt: '',
  updatedAt: '2026-07-17T12:00:00.000Z',
  manualUpdatedAt: '2026-07-17T12:00:00.000Z',
  lastError: '',
  values: { regular: '$3.250', mid: '', premium: '', diesel: '' },
  manualValues: { regular: '$3.250', mid: '', premium: '', diesel: '' },
});

console.log('gas-prices-state-feature: PASS');
