import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.REQUEST_BODY_LIMIT_ACTION_BYTES = '64';

const require = createRequire(import.meta.url);
const { server } = require('../server.js');

async function listenRandom() {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not expose a random port');
  return address.port;
}

async function closeServer() {
  await new Promise((resolve) => server.close(resolve));
}

const port = await listenRandom();

try {
  const body = JSON.stringify({ text: 'x'.repeat(3000) });
  const res = await fetch(`http://127.0.0.1:${port}/api/rowan-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  assert.equal(res.status, 413);
  const payload = await res.json();
  assert.equal(payload.error, 'payload_too_large');
} finally {
  await closeServer();
}

console.log('request-body-limit: PASS');
