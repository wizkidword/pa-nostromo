import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCameraSnapshotApiHandler } = require('../server/routes/camera.js');
const { createCameraSnapshotService } = require('../server/services/camera-snapshot.js');

let serviceOptions = null;
let safeFetchOptions = null;
const fetchCameraSnapshot = createCameraSnapshotService({
  workCoordinator: {
    async run(options, work) {
      serviceOptions = options;
      return work({ signal: 'coordinated-signal' });
    },
  },
  safeFetch: async (_url, options) => {
    safeFetchOptions = options;
    return { ok: true };
  },
  timeoutMs: 7000,
  maxBytes: 5_000_000,
  allowedHosts: ['camera.example.test'],
});

await fetchCameraSnapshot(new URL('https://camera.example.test/image.jpg'), 'request-signal');
assert.deepEqual(serviceOptions, {
  key: 'camera:https://camera.example.test/image.jpg', integration: 'camera', host: 'camera.example.test', signal: 'request-signal', timeoutMs: 7000,
});
assert.equal(safeFetchOptions.signal, 'coordinated-signal');
assert.equal(safeFetchOptions.maxRedirects, 0);
assert.deepEqual(safeFetchOptions.allowedHosts, ['camera.example.test']);

function createResponse() {
  return {
    status: 0,
    payload: null,
    headers: null,
    body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = body; },
  };
}

let disposed = false;
const handler = createCameraSnapshotApiHandler({
  sendJson: (res, status, payload) => { res.status = status; res.payload = payload; },
  isCameraProxyTargetAllowed: (url) => url.includes('camera.example.test')
    ? { ok: true, url: new URL(url) }
    : { ok: false, code: 'host_not_allowed', message: 'Camera host is not in CAMERA_PROXY_ALLOWLIST.' },
  createClientAbortSignal: () => ({ signal: 'request-signal', dispose: () => { disposed = true; } }),
  fetchCameraSnapshot: async (url, signal) => {
    assert.equal(url.hostname, 'camera.example.test');
    assert.equal(signal, 'request-signal');
    return {
      ok: true,
      headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : name === 'content-length' ? '3' : '' },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    };
  },
  maxBytes: 10,
});

{
  const res = createResponse();
  await handler({ method: 'GET', url: '/api/camera-snapshot?url=https%3A%2F%2Fcamera.example.test%2Fimage.jpg' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'image/jpeg');
  assert.deepEqual([...res.body], [1, 2, 3]);
  assert.equal(disposed, true);
}

{
  const res = createResponse();
  await handler({ method: 'GET', url: '/api/camera-snapshot?url=https%3A%2F%2Fblocked.example.test%2Fimage.jpg' }, res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, 'host_not_allowed');
}

console.log('camera-route-and-service: PASS');
