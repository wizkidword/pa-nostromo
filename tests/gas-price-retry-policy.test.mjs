import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchAaaStateGasPrices } = require('../server.js');

const validAaaHtml = `
  <table><tr><td>Current Avg.</td><td>$3.129</td><td>$3.654</td><td>$4.012</td><td>$3.876</td></tr></table>
`;

async function testRetriesTemporaryFailuresAndHonorsRetryAfter(){
  const delays = [];
  let calls = 0;
  const result = await fetchAaaStateGasPrices({ code: 'OH' }, {
    healthStore: new Map(),
    random: () => 0,
    async delay(ms){ delays.push(ms); },
    async fetchText(url){
      calls += 1;
      assert.equal(url, 'https://gasprices.aaa.com/?state=OH');
      if (calls === 1) {
        const error = new Error('temporary upstream failure');
        error.status = 503;
        error.retryAfter = '2';
        throw error;
      }
      return validAaaHtml;
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  assert.deepEqual(result.prices, { regular: '3.129', mid: '3.654', premium: '4.012', diesel: '3.876' });
}

async function testParserDriftDoesNotRetry(){
  let calls = 0;
  await assert.rejects(
    () => fetchAaaStateGasPrices({ code: 'OH' }, {
      healthStore: new Map(),
      async fetchText(){ calls += 1; return '<table><tr><td>No current average</td></tr></table>'; },
    }),
    (error) => error?.code === 'aaa_gas_parser_required_fields_missing',
  );
  assert.equal(calls, 1, 'parser drift must not create a retry loop');
}

async function testCooldownSkipsRepeatedTemporaryFailures(){
  const healthStore = new Map();
  let calls = 0;
  const options = {
    healthStore,
    now: () => 1000,
    random: () => 0,
    async delay(){},
    async fetchText(){
      calls += 1;
      const error = new Error('temporary upstream failure');
      error.status = 503;
      throw error;
    },
  };

  await assert.rejects(() => fetchAaaStateGasPrices({ code: 'OH' }, options));
  await assert.rejects(
    () => fetchAaaStateGasPrices({ code: 'OH' }, options),
    (error) => error?.code === 'provider_temporarily_unhealthy',
  );
  assert.equal(calls, 2, 'the first lookup retries once, then the cooldown skips the next lookup');
}

async function run(){
  await testRetriesTemporaryFailuresAndHonorsRetryAfter();
  await testParserDriftDoesNotRetry();
  await testCooldownSkipsRepeatedTemporaryFailures();
  console.log('gas-price-retry-policy: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
