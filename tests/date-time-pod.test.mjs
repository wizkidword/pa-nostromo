import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderDateTime } = require('../public/app/pods/date-time.pod.js');

const element = { innerHTML: '' };
let alarmUpdates = 0;
renderDateTime({
  document: { getElementById: (id) => id === 'dateTimeWidget' ? element : null },
  getNow: () => new Date('2026-07-17T14:03:05.000Z'),
  localTimeZone: 'UTC',
  updateAlarmStatus: () => { alarmUpdates += 1; },
});

assert.match(element.innerHTML, /date-time-hero/);
assert.match(element.innerHTML, /UTC/);
assert.match(element.innerHTML, /date-time-seconds/);
assert.equal(alarmUpdates, 1);

console.log('date-time-pod: PASS');
