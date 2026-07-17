import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchPublicSocialFollowerEstimate } = require('../server.js');

async function testRetriesTemporaryFailuresAndHonorsRetryAfter(){
  const delays = [];
  let calls = 0;
  const result = await fetchPublicSocialFollowerEstimate({
    provider: 'test-public-social',
    url: 'https://example.test/profile',
    retries: 1,
    timeoutMs: 100,
    operationTimeoutMs: 500,
    random: () => 0,
    async delay(ms){ delays.push(ms); },
    async fetchText(){
      calls += 1;
      if (calls === 1) {
        const error = new Error('temporary upstream failure');
        error.status = 503;
        error.retryAfter = '2';
        throw error;
      }
      return '<html>followers</html>';
    },
    extract(){ return { count: 42, signal: 'fixture' }; },
  });

  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  assert.equal(result.parsed.count, 42);
}

async function testParserDriftDoesNotRetry(){
  let calls = 0;
  await assert.rejects(
    () => fetchPublicSocialFollowerEstimate({
      provider: 'test-parser-drift',
      url: 'https://example.test/profile',
      retries: 2,
      timeoutMs: 100,
      operationTimeoutMs: 500,
      async fetchText(){ calls += 1; return '<html>changed markup</html>'; },
      extract(){ return { count: null, signal: '' }; },
    }),
    (error) => error?.code === 'public_social_parser_drift',
  );
  assert.equal(calls, 1, 'parser drift must not trigger repeated fetches');
}

async function testCooldownSkipsRepeatedTemporaryFailures(){
  const healthStore = new Map();
  let calls = 0;
  const options = {
    provider: 'test-provider-cooldown',
    url: 'https://example.test/profile',
    retries: 0,
    timeoutMs: 100,
    operationTimeoutMs: 500,
    unhealthyCooldownMs: 60_000,
    healthStore,
    now: () => 1000,
    async fetchText(){
      calls += 1;
      const error = new Error('temporary upstream failure');
      error.status = 503;
      throw error;
    },
    extract(){ return { count: 42, signal: 'fixture' }; },
  };

  await assert.rejects(() => fetchPublicSocialFollowerEstimate(options));
  await assert.rejects(
    () => fetchPublicSocialFollowerEstimate(options),
    (error) => error?.code === 'provider_temporarily_unhealthy',
  );
  assert.equal(calls, 1, 'a provider in cooldown must not receive another request');
}

async function run(){
  await testRetriesTemporaryFailuresAndHonorsRetryAfter();
  await testParserDriftDoesNotRetry();
  await testCooldownSkipsRepeatedTemporaryFailures();
  console.log('public-social-follower-retry: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
