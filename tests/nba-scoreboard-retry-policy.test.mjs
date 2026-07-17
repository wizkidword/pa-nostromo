import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchNbaScoreboard } = require('../public/app/core/nba-scoreboard.js');
const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'parsers', 'nba-scoreboard-valid.json');
const validPayload = JSON.parse(await readFile(fixturePath, 'utf8'));

function response({ status = 200, body = {}, retryAfter = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return String(name).toLowerCase() === 'retry-after' ? retryAfter : null; } },
    async json() { return body; },
  };
}

async function testRetriesTransientFailuresAndHonorsRetryAfter() {
  const delays = [];
  let calls = 0;
  const result = await fetchNbaScoreboard('https://example.test/scoreboard', {
    healthStore: new Map(),
    random: () => 0,
    async delay(ms) { delays.push(ms); },
    async fetchResponse() {
      calls += 1;
      return calls === 1
        ? response({ status: 503, retryAfter: '2' })
        : response({ body: validPayload });
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  assert.equal(result.parsed.ok, true);
  assert.equal(result.payload.events[0].id, '401000001');
}

async function testParserDriftIsNotRetried() {
  let calls = 0;
  await assert.rejects(
    () => fetchNbaScoreboard('https://example.test/scoreboard', {
      healthStore: new Map(),
      async fetchResponse() {
        calls += 1;
        return response({ body: { events: [{}] } });
      },
    }),
    (error) => error?.code === 'nba_scoreboard_parser_required_fields_missing',
  );
  assert.equal(calls, 1);
}

async function testCooldownSkipsRepeatedTemporaryFailures() {
  const healthStore = new Map();
  let calls = 0;
  const options = {
    healthStore,
    now: () => 1000,
    random: () => 0,
    async delay() {},
    async fetchResponse() {
      calls += 1;
      return response({ status: 503 });
    },
  };

  await assert.rejects(() => fetchNbaScoreboard('https://example.test/scoreboard', options));
  await assert.rejects(
    () => fetchNbaScoreboard('https://example.test/scoreboard', options),
    (error) => error?.code === 'provider_temporarily_unhealthy',
  );
  assert.equal(calls, 2, 'the first fetch retries once, then cooldown skips the next fetch');
}

await testRetriesTransientFailuresAndHonorsRetryAfter();
await testParserDriftIsNotRetried();
await testCooldownSkipsRepeatedTemporaryFailures();
console.log('nba-scoreboard-retry-policy: PASS');
