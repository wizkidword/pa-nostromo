import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchFeedXml } = require('../server.js');

function successResponse(xml){
  return {
    ok: true,
    status: 200,
    headers: { get(){ return null; } },
    async text(){ return xml; },
  };
}

async function testRetriesTemporaryFailuresAndHonorsRetryAfter(){
  const delays = [];
  let calls = 0;
  const result = await fetchFeedXml('https://rss-retry.test/temporary', {
    random: () => 0,
    async delay(ms){ delays.push(ms); },
    async fetchResponse(){
      calls += 1;
      if (calls === 1) {
        const error = new Error('temporary upstream failure');
        error.status = 503;
        error.retryAfter = '2';
        throw error;
      }
      return successResponse('<rss><channel><title>Test</title></channel></rss>');
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  assert.equal(result.stale, false);
  assert.match(result.xml, /<rss>/);
}

async function testCooldownSkipsRepeatedTemporaryFailures(){
  const healthStore = new Map();
  let calls = 0;
  const options = {
    healthStore,
    now: () => 1000,
    random: () => 0,
    async delay(){},
    async fetchResponse(){
      calls += 1;
      const error = new Error('temporary upstream failure');
      error.status = 503;
      throw error;
    },
  };

  await assert.rejects(() => fetchFeedXml('https://rss-retry.test/cooldown', options));
  await assert.rejects(
    () => fetchFeedXml('https://rss-retry.test/cooldown', options),
    (error) => error?.code === 'provider_temporarily_unhealthy',
  );
  assert.equal(calls, 2, 'the first refresh may use two attempts, while the cooldown skips the next refresh');
}

async function testNonRetryableFailuresStopImmediately(){
  let calls = 0;
  await assert.rejects(
    () => fetchFeedXml('https://rss-retry.test/forbidden', {
      async fetchResponse(){
        calls += 1;
        const error = new Error('forbidden');
        error.status = 403;
        throw error;
      },
    }),
  );
  assert.equal(calls, 1, 'blocked or forbidden feeds must not be retried');
}

async function run(){
  await testRetriesTemporaryFailuresAndHonorsRetryAfter();
  await testCooldownSkipsRepeatedTemporaryFailures();
  await testNonRetryableFailuresStopImmediately();
  console.log('rss-retry-policy: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
