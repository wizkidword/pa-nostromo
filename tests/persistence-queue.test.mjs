import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCoalescedPersistence } = require('../public/app/core/persistence.js');
const timers = [];
const writes = [];
const queue = createCoalescedPersistence({
  delayMs: 50,
  setTimer: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
  clearTimer: (timer) => { timer.cleared = true; },
  run: (payload, reason) => writes.push({ payload, reason }),
});

queue.schedule({ revision: 1 }, 'first');
queue.schedule({ revision: 2 }, 'latest');
assert.equal(timers.length, 2);
assert.equal(timers[0].cleared, true);
assert.equal(queue.pending, true);
await queue.flush();
assert.deepEqual(writes, [{ payload: { revision: 2 }, reason: 'latest' }]);
assert.equal(queue.pending, false);

let reported = '';
const failingQueue = createCoalescedPersistence({
  run: () => { throw new Error('disk unavailable'); },
  onError: (error) => { reported = error.message; },
});
failingQueue.schedule({}, 'failure');
assert.equal(await failingQueue.flush(), false);
assert.equal(reported, 'disk unavailable');
console.log('persistence-queue: PASS');
