import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SafeFetchError, isBlockedAddress, normalizeTarget, requestPinned, resolveAndValidate, safeFetch } = require('../lib/safe-fetch.js');

for (const address of [
  '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254',
  '100.64.0.1', '168.63.129.16', '192.0.2.1', '192.31.196.1', '192.52.193.1', '192.175.48.1', '198.51.100.1', '203.0.113.1', '100.100.100.200',
  '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1',
]) {
  assert.equal(isBlockedAddress(address), true, `${address} must be blocked.`);
}
for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
  assert.equal(isBlockedAddress(address), false, `${address} should be a publicly routable address.`);
}

assert.throws(() => normalizeTarget('ftp://example.test'), (error) => error.code === 'invalid_protocol');
assert.throws(() => normalizeTarget('https://user:pass@example.test'), (error) => error.code === 'credentials_not_allowed');
assert.throws(() => normalizeTarget('https://other.test', { allowedHosts: ['allowed.test'] }), (error) => error.code === 'host_not_allowed');
for (const encodedLoopback of ['http://2130706433', 'http://0177.0.0.1', 'http://0x7f000001', 'http://127.1']) {
  const target = normalizeTarget(encodedLoopback);
  assert.equal(target.hostname, '127.0.0.1', `${encodedLoopback} must normalize to loopback before validation.`);
  await assert.rejects(resolveAndValidate(target), (error) => error.code === 'blocked_address');
}
await assert.rejects(resolveAndValidate(normalizeTarget('http://[::ffff:7f00:1]')), (error) => error.code === 'blocked_address');

await assert.rejects(
  resolveAndValidate(new URL('https://mixed.test'), {
    resolveHostname: async () => [{ address: '8.8.8.8', family: 4 }, { address: '192.168.1.1', family: 4 }],
  }),
  (error) => error.code === 'blocked_address',
);

const publicResolver = async (hostname) => hostname === 'public.test'
  ? [{ address: '8.8.8.8', family: 4 }]
  : [{ address: '127.0.0.1', family: 4 }];
const textResponse = (status, location = '') => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (name) => String(name).toLowerCase() === 'location' ? location || null : null },
  async text() { return 'ok'; },
  async arrayBuffer() { return new ArrayBuffer(0); },
});

let pinnedAddress = '';
const success = await safeFetch('https://public.test/feed', {
  resolveHostname: publicResolver,
  performRequest: async (_url, addresses) => {
    pinnedAddress = addresses[0].address;
    return textResponse(200);
  },
});
assert.equal(success.status, 200);
assert.equal(pinnedAddress, '8.8.8.8', 'The validated DNS address must be passed to the pinned transport.');

let redirectCalls = 0;
await assert.rejects(
  safeFetch('https://public.test/start', {
    resolveHostname: publicResolver,
    performRequest: async () => {
      redirectCalls += 1;
      return textResponse(302, 'https://private.test/metadata');
    },
  }),
  (error) => error.code === 'blocked_address',
);
assert.equal(redirectCalls, 1, 'A redirect target must be validated before a second request is opened.');

await assert.rejects(
  safeFetch('https://public.test/loop', {
    resolveHostname: publicResolver,
    maxRedirects: 1,
    performRequest: async () => textResponse(302, 'https://public.test/loop'),
  }),
  (error) => error.code === 'too_many_redirects',
);

const server = http.createServer((req, res) => {
  if (req.url === '/large') return res.end(Buffer.alloc(2048));
  if (req.url === '/stall') return undefined;
  return res.end('ok');
});
await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
try {
  await assert.rejects(
    requestPinned(new URL(`http://public.test:${port}/large`), [{ address: '127.0.0.1', family: 4 }], {
      method: 'GET', headers: {}, maxBytes: 512, timeoutMs: 500,
    }),
    (error) => error.code === 'response_too_large',
  );
  await assert.rejects(
    requestPinned(new URL(`http://public.test:${port}/stall`), [{ address: '127.0.0.1', family: 4 }], {
      method: 'GET', headers: {}, maxBytes: 512, timeoutMs: 300,
    }),
    (error) => error.code === 'request_timeout',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}

assert.ok(SafeFetchError);
console.log('safe-fetch: PASS');
