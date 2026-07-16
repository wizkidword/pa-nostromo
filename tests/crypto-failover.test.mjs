import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchWithFailover } = require('../public/app/core/crypto-failover.js');

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

async function testRetriesBeforeFallback(){
  const calls = [];
  const result = await fetchWithFailover({
    providers: ['coincap', 'coingecko'],
    retries: 1,
    backoffBaseMs: 10,
    backoffMaxMs: 10,
    async tryProvider(provider, attempt){
      calls.push(`${provider}:${attempt}`);
      if (provider === 'coincap') {
        const err = new Error('temporary upstream');
        err.status = 502;
        throw err;
      }
      return [{ id: 'ethereum' }];
    },
    shouldAcceptResult(value){
      return Array.isArray(value) && value.length > 0;
    },
  });

  assert.equal(result.provider, 'coingecko');
  assert.equal(result.errors.length, 2);
  assert.deepEqual(calls, ['coincap:1', 'coincap:2', 'coingecko:1']);
}

async function testFinalErrorIncludesProviderTrail(){
  await assert.rejects(async () => {
    await fetchWithFailover({
      providers: ['coincap', 'coingecko'],
      retries: 0,
      async tryProvider(provider){
        const err = new Error(`${provider} down`);
        err.status = 503;
        throw err;
      },
    });
  }, (err) => {
    assert.equal(Array.isArray(err?.errors), true);
    assert.equal(err.errors.length, 2);
    assert.equal(err.errors[0].provider, 'coincap');
    assert.equal(err.errors[1].provider, 'coingecko');
    return true;
  });
}

async function run(){
  await testFallbackAfterPrimaryFailure();
  await testRetriesBeforeFallback();
  await testFinalErrorIncludesProviderTrail();
  console.log('crypto-failover tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
