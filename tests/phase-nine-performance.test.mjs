import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createActionStore } = require('../public/app/core/action-store.js');
const { createCoalescedPersistence } = require('../public/app/core/persistence.js');
const { createScheduler } = require('../public/app/core/scheduler.js');

const state = {
  notes: Array.from({ length: 400 }, (_, index) => ({ id: `note-${index}`, body: `Draft ${index}` })),
  tasks: Array.from({ length: 400 }, (_, index) => ({ id: `task-${index}`, title: `Task ${index}` })),
};
let dashboardReconstructions = 0;
let unrelatedPodUpdates = 0;
const store = createActionStore({ getState: () => state });
store.subscribeAll((record) => {
  if (record.render !== false) dashboardReconstructions += 1;
});
store.subscribe('weather', () => { unrelatedPodUpdates += 1; });

store.dispatch({
  type: 'notes/draftChanged',
  changedAreas: ['notes'],
  render: false,
  persist: false,
  reduce: (current) => { current.notes[200].body = 'Updated without rebuilding the dashboard'; },
});
assert.equal(state.notes[200].body, 'Updated without rebuilding the dashboard');
assert.equal(dashboardReconstructions, 0, 'Draft typing must not trigger a dashboard reconstruction.');

store.dispatch({ type: 'tasks/titleChanged', changedAreas: ['tasks'], persist: false });
assert.equal(dashboardReconstructions, 1, 'A targeted feature update should have one targeted render pass.');
assert.equal(unrelatedPodUpdates, 0, 'A task update must not notify an unrelated pod.');

const timers = [];
const persisted = [];
const queue = createCoalescedPersistence({
  setTimer: (callback) => { const timer = { callback, cleared: false }; timers.push(timer); return timer; },
  clearTimer: (timer) => { timer.cleared = true; },
  run: (payload) => persisted.push(payload),
});
queue.schedule({ revision: 1 });
queue.schedule({ revision: 2 });
await queue.flush();
assert.deepEqual(persisted, [{ revision: 2 }], 'Persistence must retain only the latest queued snapshot.');

let disabledRuns = 0;
let refreshRuns = 0;
let release;
const scheduler = createScheduler({
  random: () => 0,
  setTimer: (callback) => { const timer = { callback }; timers.push(timer); return timer; },
  clearTimer: () => {},
});
scheduler.register('disabled', { intervalMs: 1000, enabled: () => false, run: () => { disabledRuns += 1; } });
scheduler.start('disabled');
assert.equal(scheduler.get('disabled').nextRefreshAt, 0, 'Disabled features must not receive a timer.');
assert.equal((await scheduler.refresh('disabled')).reason, 'disabled');
assert.equal(disabledRuns, 0, 'Disabled features must not perform background work.');

const inFlight = new Promise((resolve) => { release = resolve; });
scheduler.register('deduplicated', { intervalMs: 1000, run: async () => { refreshRuns += 1; await inFlight; } });
const first = scheduler.refresh('deduplicated');
const second = scheduler.refresh('deduplicated');
assert.strictEqual(first, second, 'Repeated refresh clicks must share one request.');
release();
await first;
assert.equal(refreshRuns, 1);
scheduler.destroy();
console.log('phase-nine-performance: PASS');
