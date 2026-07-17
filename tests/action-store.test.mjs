import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createActionStore } = require('../public/app/core/action-store.js');

const state = { notes: [], tasks: [] };
const persisted = [];
const projectRecords = [];
const taskRecords = [];
const statuses = [];
const store = createActionStore({
  getState: () => state,
  now: () => '2026-07-17T14:00:00.000Z',
  persist: (record) => persisted.push(record),
});
store.subscribe('projects', (record) => projectRecords.push(record.type));
store.subscribe('tasks', (record) => taskRecords.push(record.type));
store.subscribeSaveStatus((status) => statuses.push(status.state));

const record = store.dispatch({
  type: 'projects/created',
  changedAreas: ['projects', 'tasks'],
  reduce: (current) => current.notes.push({ id: 'note-1' }),
});
assert.equal(record.applied, true);
assert.equal(store.getRevision(), 1);
assert.deepEqual(projectRecords, ['projects/created']);
assert.deepEqual(taskRecords, ['projects/created']);
assert.equal(persisted.length, 1);
await new Promise((resolve) => queueMicrotask(resolve));
assert.deepEqual(statuses, ['saved', 'saving', 'saved']);
assert.equal(store.getSaveStatus().state, 'saved');
store.markPersistence('offline', { changedAreas: ['notes'] });
assert.equal(store.getSaveStatus().state, 'offline');
assert.equal(store.dispatch({ type: 'notes/noop', reduce: () => false }).applied, false);
console.log('action-store: PASS');
