import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseJsonSafely, fetchJsonViaCurl } = require('../server.js');

async function testParseJsonSafely() {
  const good = parseJsonSafely('{"ok":true}', 'fetch');
  assert.equal(good.ok, true);
  assert.deepEqual(good.value, { ok: true });

  const bad = parseJsonSafely('{"ok":', 'fetch');
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'fetch_json_parse_failed');
  assert.equal(typeof bad.message, 'string');
}

async function testLegacyHelperUsesSafeFetch() {
  await assert.rejects(
    fetchJsonViaCurl('http://127.0.0.1:4287/ping', 8000),
    (error) => error?.code === 'blocked_address',
  );
}

async function run() {
  await testParseJsonSafely();
  await testLegacyHelperUsesSafeFetch();
  console.log('crypto-proxy-safe-fetch tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
