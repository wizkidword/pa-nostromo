import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createScheduler } = require('../public/app/core/scheduler.js');

const timers = [];
let online = true;
let starts = 0;
let release;
const gate = new Promise((resolve) => { release = resolve; });
const scheduler = createScheduler({
  now: () => 1_000,
  random: () => 0,
  isOnline: () => online,
  setTimer: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
  clearTimer: () => {},
});
scheduler.register('email', { intervalMs: 60_000, run: async () => { starts += 1; await gate; return 'done'; } });
const first = scheduler.refresh('email');
const duplicate = scheduler.refresh('email');
assert.strictEqual(first, duplicate, 'Repeated refreshes must share one in-flight request.');
release();
assert.equal((await first).ok, true);
assert.equal(starts, 1);
assert.equal(timers.at(-1).delay, 60_000);
online = false;
assert.equal((await scheduler.refresh('email')).reason, 'offline');
scheduler.stop('email');
assert.equal(scheduler.get('email').enabled, false);
assert.equal((await scheduler.refresh('email')).reason, 'disabled');
scheduler.destroy();
console.log('scheduler: PASS');
