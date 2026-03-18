import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchWithFailover } = require('../app/core/crypto-failover.js');

async function testFallbackAfterPrimaryFailure(){
  const calls = [];
  const result = await fetchWithFailover({
    providers: ['coincap', 'coingecko'],
    retries: 0,
    async tryProvider(provider){
      calls.push(provider);
      if (provider === 'coincap') {
        const err = new Error('HTTP 502');
        err.status = 502;
        throw err;
      }
      return [{ id: 'bitcoin', symbol: 'btc' }];
    },
    shouldAcceptResult(value){
      return Array.isArray(value) && value.length > 0;
    },
  });

  assert.equal(result.provider, 'coingecko');
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(calls, ['coincap', 'coingecko']);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].provider, 'coincap');
}

async function run(){
  await testFallbackAfterPrimaryFailure();
  console.log('crypto-failover tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
