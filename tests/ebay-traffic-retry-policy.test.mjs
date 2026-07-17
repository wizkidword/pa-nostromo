import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchEbayTrafficReport } = require('../server.js');

function response({ status = 200, body = {}, retryAfter = null } = {}){
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name){ return String(name).toLowerCase() === 'retry-after' ? retryAfter : null; } },
    async text(){ return JSON.stringify(body); },
  };
}

function requestOptions(overrides = {}){
  return {
    accessToken: 'fixture-token',
    dimension: 'DAY',
    metrics: ['LISTING_VIEWS_TOTAL'],
    filter: 'date_range:[2026-01-01..2026-01-02]',
    ...overrides,
  };
}

async function testRetriesTransientTrafficReportsAndHonorsRetryAfter(){
  const delays = [];
  let calls = 0;
  const payload = await fetchEbayTrafficReport(requestOptions(), {
    healthStore: new Map(),
    random: () => 0,
    async delay(ms){ delays.push(ms); },
    async fetchResponse(url){
      calls += 1;
      assert.equal(url.pathname, '/sell/analytics/v1/traffic_report');
      if (calls === 1) {
        return response({
          status: 503,
          body: { errors: [{ message: 'temporary upstream failure' }] },
          retryAfter: '2',
        });
      }
      return response({ body: { records: [] } });
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  assert.deepEqual(payload, { records: [] });
}

async function testRateLimitsAreNotRetriedHere(){
  let calls = 0;
  await assert.rejects(
    () => fetchEbayTrafficReport(requestOptions(), {
      healthStore: new Map(),
      async fetchResponse(){
        calls += 1;
        return response({ status: 429, body: { errors: [{ message: 'rate limited' }] }, retryAfter: '60' });
      },
    }),
    (error) => error?.status === 429,
  );
  assert.equal(calls, 1, 'the existing eBay cache and rate-limit backoff own HTTP 429 handling');
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
      return response({ status: 503, body: { errors: [{ message: 'temporary upstream failure' }] } });
    },
  };

  await assert.rejects(() => fetchEbayTrafficReport(requestOptions(), options));
  await assert.rejects(
    () => fetchEbayTrafficReport(requestOptions(), options),
    (error) => error?.code === 'provider_temporarily_unhealthy',
  );
  assert.equal(calls, 2, 'the first read retries once, then the cooldown skips the next read');
}

async function run(){
  await testRetriesTransientTrafficReportsAndHonorsRetryAfter();
  await testRateLimitsAreNotRetriedHere();
  await testCooldownSkipsRepeatedTemporaryFailures();
  console.log('ebay-traffic-retry-policy: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
