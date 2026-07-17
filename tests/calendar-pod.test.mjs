import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderCalendar } = require('../public/app/pods/calendar.pod.js');

let selectedDate = null;
let agendaRenders = 0;
const listeners = new Map();
const dayCell = {
  dataset: { date: '2026-07-20' },
  addEventListener: (eventName, listener) => listeners.set(eventName, listener),
};
const element = {
  innerHTML: '',
  querySelectorAll: () => [dayCell],
};

renderCalendar({
  document: { getElementById: (id) => (id === 'calendarWidget' ? element : null) },
  getNow: () => new Date(2026, 6, 17, 12),
  getSelectedDate: () => selectedDate,
  setSelectedDate: (date) => { selectedDate = date; },
  reminderDateSet: () => new Set(['2026-07-20']),
  renderCalendarRemindersPanel: () => { agendaRenders += 1; },
});

assert.equal(selectedDate, '2026-07-17');
assert.match(element.innerHTML, /July 2026/);
assert.match(element.innerHTML, /1 reminder day/);
assert.match(element.innerHTML, /data-date="2026-07-20"/);
listeners.get('click')();
assert.equal(selectedDate, '2026-07-20');
assert.equal(agendaRenders, 1);
console.log('calendar-pod: PASS');
