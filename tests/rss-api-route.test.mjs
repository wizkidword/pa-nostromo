import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createRssApiHandler } = require('../server/routes/rss.js');

function createResponse() {
  return { status: 0, payload: null };
}

function sendJson(res, status, payload) {
  res.status = status;
  res.payload = payload;
}

let body = '';
let disposed = false;
const fetched = [];
const handler = createRssApiHandler({
  sendJson,
  readBody: async () => body,
  bodyLimit: 4096,
  maxFeeds: 3,
  maxEntries: 2,
  async fetchFeedXml(url, options) {
    fetched.push({ url, options });
    if (url.endsWith('/blocked')) {
      const error = new Error('blocked');
      error.code = 'blocked_address';
      throw error;
    }
    return { xml: '<rss />', stale: false, cached: false, fetchedAt: 0 };
  },
  parseFeedXml: (_xml, url) => Array.from({ length: 7 }, (_, index) => ({ id: `${url}-${index}` })),
  createClientAbortSignal: () => ({ signal: 'test-signal', dispose: () => { disposed = true; } }),
  isPayloadTooLargeError: () => false,
  sendPayloadTooLarge: () => assert.fail('payload should not be too large'),
});

{
  body = JSON.stringify({ feeds: ['https://news.test/one', 'https://news.test/one', 'ftp://news.test/skip', 'https://news.test/blocked'] });
  const res = createResponse();
  await handler({ method: 'POST' }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(fetched.map(({ url }) => url), ['https://news.test/one', 'https://news.test/blocked']);
  assert.equal(fetched[0].options.manual, true);
  assert.equal(fetched[0].options.signal, 'test-signal');
  assert.equal(res.payload.items.length, 6, 'the endpoint caps combined results by feed and entry limits');
  assert.equal(res.payload.errors[0].error, 'blocked_address');
  assert.equal(disposed, true, 'the request lifecycle is always cleaned up');
}

{
  body = JSON.stringify({ feeds: ['mailto:team@example.test'] });
  const res = createResponse();
  await handler({ method: 'POST' }, res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, 'missing_feeds');
}

{
  const res = createResponse();
  await handler({ method: 'GET' }, res);
  assert.equal(res.status, 405);
}

console.log('rss-api-route: PASS');
