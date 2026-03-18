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

async function testFetchJsonViaCurl() {
  const data = await fetchJsonViaCurl('https://api.coingecko.com/api/v3/ping', 8000);
  assert.equal(typeof data, 'object');
  assert.equal(typeof data.gecko_says, 'string');
}

async function run() {
  await testParseJsonSafely();
  await testFetchJsonViaCurl();
  console.log('crypto-proxy-curl-fallback tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
