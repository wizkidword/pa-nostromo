import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';

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
  const server = http.createServer((req, res) => {
    assert.equal(req.url, '/ping');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ gecko_says: '(V3 deterministic curl smoke)' }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    const data = await fetchJsonViaCurl(`http://127.0.0.1:${address.port}/ping`, 8000);
    assert.equal(typeof data, 'object');
    assert.equal(typeof data.gecko_says, 'string');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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
