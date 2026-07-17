import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchWithFailover, jitteredBackoffMs } = require('../public/app/core/crypto-failover.js');

async function testFallbackAfterPrimaryFailure(){
  const calls = [];
  const result = await fetchWithFailover({
    providers: ['coincap', 'coingecko'],
    healthStore: new Map(),
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
  const delays = [];
  const result = await fetchWithFailover({
    providers: ['coincap', 'coingecko'],
    healthStore: new Map(),
    retries: 1,
    backoffBaseMs: 10,
    backoffMaxMs: 10,
    random: () => 0.5,
    async delay(ms){ delays.push(ms); },
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
  assert.deepEqual(delays, [25], 'retry waits use jitter instead of a fixed synchronized delay');
}

async function testFinalErrorIncludesProviderTrail(){
  await assert.rejects(async () => {
    await fetchWithFailover({
      providers: ['coincap', 'coingecko'],
      healthStore: new Map(),
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

async function testProviderCooldownSkipsRecentlyUnhealthyProvider(){
  const calls = [];
  const healthStore = new Map();
  const options = {
    providers: ['coincap', 'coingecko'],
    retries: 0,
    unhealthyCooldownMs: 60000,
    healthStore,
    now: () => 1000,
    async tryProvider(provider){
      calls.push(provider);
      if (provider === 'coincap') {
        const err = new Error('temporary upstream');
        err.status = 503;
        throw err;
      }
      return [{ id: 'bitcoin' }];
    },
  };

  await fetchWithFailover(options);
  const second = await fetchWithFailover(options);

  assert.equal(second.provider, 'coingecko');
  assert.deepEqual(calls, ['coincap', 'coingecko', 'coingecko']);
  assert.equal(second.errors[0].code, 'provider_temporarily_unhealthy');
  assert.equal(second.errors[0].skipped, true);
}

async function testAttemptDeadlineAndCancellation(){
  await assert.rejects(
    () => fetchWithFailover({
      providers: ['coincap'],
      healthStore: new Map(),
      retries: 0,
      attemptTimeoutMs: 10,
      operationTimeoutMs: 100,
      async tryProvider(_provider, _attempt, context){
        assert.equal(context.signal.aborted, false);
        return new Promise(() => {});
      },
    }),
    (error) => error?.code === 'provider_attempt_timeout',
  );

  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    () => fetchWithFailover({
      providers: ['coincap'],
      healthStore: new Map(),
      signal: controller.signal,
      async tryProvider(){ calls += 1; return []; },
    }),
    (error) => error?.code === 'operation_aborted',
  );
  assert.equal(calls, 0, 'an already-cancelled operation must not start a provider request');
}

async function testTotalOperationDeadline(){
  await assert.rejects(
    () => fetchWithFailover({
      providers: ['coincap'],
      healthStore: new Map(),
      retries: 1,
      attemptTimeoutMs: 100,
      operationTimeoutMs: 10,
      async tryProvider(){ return new Promise(() => {}); },
    }),
    (error) => error?.code === 'operation_deadline_exceeded',
  );
}

async function testRetryDelayCanHonorProviderRetryAfter(){
  const delays = [];
  let calls = 0;
  const result = await fetchWithFailover({
    providers: ['coincap'],
    healthStore: new Map(),
    retries: 1,
    backoffBaseMs: 50,
    backoffMaxMs: 50,
    random: () => 0,
    async delay(ms){ delays.push(ms); },
    retryDelayMs({ error }){ return error.retryAfterMs; },
    async tryProvider(){
      calls += 1;
      if (calls === 1) {
        const error = new Error('rate limited');
        error.status = 429;
        error.retryAfterMs = 240;
        throw error;
      }
      return [{ id: 'bitcoin' }];
    },
  });

  assert.equal(result.provider, 'coincap');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [240], 'provider Retry-After must remain a floor above jittered backoff');
}

function testJitterBounds(){
  assert.equal(jitteredBackoffMs(1, 100, 1000, () => 0), 1);
  assert.equal(jitteredBackoffMs(2, 100, 1000, () => 0.5), 100);
  assert.equal(jitteredBackoffMs(5, 100, 1000, () => 1), 1000);
}

async function run(){
  await testFallbackAfterPrimaryFailure();
  await testRetriesBeforeFallback();
  await testFinalErrorIncludesProviderTrail();
  await testProviderCooldownSkipsRecentlyUnhealthyProvider();
  await testAttemptDeadlineAndCancellation();
  await testTotalOperationDeadline();
  await testRetryDelayCanHonorProviderRetryAfter();
  testJitterBounds();
  console.log('crypto-failover tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
