import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeProviderChain, normalizeState, providerLabels } = require('../public/app/features/crypto-state.js');

const state = normalizeState(
  [' BTC ', '@eth', '#DOGE', 'sol', 'bitcoin', ''],
  {
    ' BTC ': { quantity: '2.5', averageBuyPrice: '100' },
    ETH: { quantity: -1, avgBuyPrice: 1500 },
    doge: { quantity: 'not-a-number', avgBuyPrice: -1 },
  },
);
assert.deepEqual(state.watchlist, ['bitcoin', 'ethereum', 'dogecoin', 'solana']);
assert.deepEqual(state.holdings, {
  bitcoin: { quantity: 2.5, avgBuyPrice: 100 },
  ethereum: { quantity: 0, avgBuyPrice: 1500 },
  dogecoin: { quantity: 0, avgBuyPrice: 0 },
});
assert.deepEqual(normalizeState('invalid', null).watchlist, ['bitcoin', 'ethereum']);
assert.deepEqual(normalizeProviderChain(['cryptocompare', 'bad', 'coincap']), ['coincap', 'coingecko', 'cryptocompare']);
assert.equal(providerLabels.coingecko, 'CoinGecko');

console.log('crypto-state-feature: PASS');
