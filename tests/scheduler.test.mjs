import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createScheduler } = require('../public/app/core/scheduler.js');

const timers = [];
let online = true;
let currentTime = 1_000;
let starts = 0;
let release;
const gate = new Promise((resolve) => { release = resolve; });
const scheduler = createScheduler({
  now: () => currentTime,
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

online = true;
let manualStarts = 0;
scheduler.register('manual-refresh', { intervalMs: 60_000, manualCooldownMs: 500, run: async () => { manualStarts += 1; } });
assert.equal((await scheduler.refresh('manual-refresh', { manual: true })).ok, true);
assert.equal(scheduler.get('manual-refresh').lastAttemptAt, currentTime);
assert.equal(scheduler.get('manual-refresh').lastManualRefreshAt, currentTime);
const cooledDown = await scheduler.refresh('manual-refresh', { manual: true });
assert.equal(cooledDown.reason, 'cooldown');
assert.equal(manualStarts, 1, 'manual cooldown must prevent duplicate provider work');
currentTime += 500;
assert.equal((await scheduler.refresh('manual-refresh', { manual: true })).ok, true);
assert.equal(manualStarts, 2);
scheduler.destroy();
console.log('scheduler: PASS');
