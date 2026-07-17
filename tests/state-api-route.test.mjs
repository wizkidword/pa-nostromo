import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createStateApiHandler } = require('../server/routes/state.js');
const { StateSchemaError } = require('../lib/state-schema.js');
const { StateStoreError } = require('../lib/state-store.js');

function createResponse() {
  return { status: 0, payload: null };
}

function sendJson(res, status, payload) {
  res.status = status;
  res.payload = payload;
}

const calls = [];
const handler = createStateApiHandler({
  stateStore: {
    async load() {
      return { state: { tasks: [{ id: 'task-1', title: 'Saved task' }] } };
    },
    async write(state, options) {
      calls.push({ state, options });
      return {
        integrity: { savedAt: '2026-07-16T00:00:00.000Z', checksum: 'checksum', revision: 4, stateSchemaVersion: 2 },
        previousStateIntegrity: { revision: 3 },
        backupFile: 'backup.json',
      };
    },
  },
  sendJson,
  readBody: async () => JSON.stringify({
    tasks: [{ id: 'task-2', title: 'New task' }],
    __writeControl: { source: 'manual_import', expectedRevision: 1 },
  }),
  actionBodyLimit: 64 * 1024,
  stateBodyLimit: 2 * 1024 * 1024,
  StateStoreError,
  StateSchemaError,
  isPayloadTooLargeError: () => false,
  sendPayloadTooLarge: () => assert.fail('payload should not be too large'),
  deepClone: (value) => JSON.parse(JSON.stringify(value)),
});

{
  const res = createResponse();
  await handler({ method: 'GET', url: '/api/state', headers: {} }, res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.tasks[0].title, 'Saved task');
}

{
  const res = createResponse();
  await handler({ method: 'POST', url: '/api/state', headers: { 'if-match': 'W/"3"' } }, res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.revision, 4);
  assert.deepEqual(calls[0].state, { tasks: [{ id: 'task-2', title: 'New task' }] });
  assert.equal(calls[0].options.expectedRevision, 3);
  assert.equal(calls[0].options.source, 'manual_import');
}

{
  const res = createResponse();
  await handler({ method: 'POST', url: '/api/state', headers: { 'if-match': 'untrusted' } }, res);
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, 'invalid_revision');
}

console.log('state-api-route: PASS');
