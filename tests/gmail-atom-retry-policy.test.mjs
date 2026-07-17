import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchUnreadEmailFeedForAccountViaAtom } = require('../server.js');
const fixture = await readFile(path.join(process.cwd(), 'tests', 'fixtures', 'parsers', 'gmail-unread-atom-valid.xml'), 'utf8');

const account = {
  id: 'retry-test-account',
  label: 'Retry test',
  username: 'retry-test@example.test',
  appPassword: 'fixture-value-not-a-secret',
  feedUrl: 'https://mail.example.test/feed/atom',
};

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
  const result = await fetchUnreadEmailFeedForAccountViaAtom(account, {
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
      return successResponse(fixture);
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  assert.equal(result.status, 'fresh');
  assert.equal(result.unreadCount, 7);
}

async function testParserFailuresDoNotRetry(){
  let calls = 0;
  await assert.rejects(
    () => fetchUnreadEmailFeedForAccountViaAtom(account, {
      async fetchResponse(){ calls += 1; return successResponse('<feed></feed>'); },
    }),
    (error) => error?.code === 'gmail_unread_atom_parser_required_fields_missing',
  );
  assert.equal(calls, 1, 'parser failures must not repeatedly fetch the inbox');
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

  await assert.rejects(() => fetchUnreadEmailFeedForAccountViaAtom(account, options));
  await assert.rejects(
    () => fetchUnreadEmailFeedForAccountViaAtom(account, options),
    (error) => error?.code === 'provider_temporarily_unhealthy',
  );
  assert.equal(calls, 2, 'the first refresh may use two attempts, while the cooldown skips the next refresh');
}

async function run(){
  await testRetriesTemporaryFailuresAndHonorsRetryAfter();
  await testParserFailuresDoNotRetry();
  await testCooldownSkipsRepeatedTemporaryFailures();
  console.log('gmail-atom-retry-policy: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
