import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createGasPricesApiHandler } = require('../server/routes/gas.js');

function createResponse() {
  return { status: 0, payload: null };
}

function sendJson(res, status, payload) {
  res.status = status;
  res.payload = payload;
}

let disposed = false;
const handler = createGasPricesApiHandler({
  sendJson,
  createClientAbortSignal: () => ({ signal: 'request-signal', dispose: () => { disposed = true; } }),
  resolveUsStateFromLocation: async (location, options) => {
    assert.equal(location, 'Columbus, OH');
    assert.equal(options.signal, 'request-signal');
    return { code: 'OH', label: 'Columbus, OH' };
  },
  fetchAaaStateGasPrices: async (resolved, options) => {
    assert.equal(resolved.code, 'OH');
    assert.equal(options.signal, 'request-signal');
    return { sourceUrl: 'https://gasprices.example.test/?state=OH', prices: { regular: '3.129' } };
  },
  now: () => new Date('2026-07-16T12:00:00.000Z'),
});

{
  const res = createResponse();
  await handler({ method: 'GET', url: '/api/gas-prices?location=Columbus%2C%20OH' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.stateCode, 'OH');
  assert.equal(res.payload.fetchedAt, '2026-07-16T12:00:00.000Z');
  assert.equal(disposed, true);
}

{
  const res = createResponse();
  await handler({ method: 'GET', url: '/api/gas-prices' }, res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, 'missing_location');
}

{
  const res = createResponse();
  await handler({ method: 'POST', url: '/api/gas-prices?location=Columbus%2C%20OH' }, res);
  assert.equal(res.status, 405);
}

console.log('gas-api-route: PASS');
