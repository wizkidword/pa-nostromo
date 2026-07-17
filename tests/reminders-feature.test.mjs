import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createReminder,
  createRemindersController,
  normalizeReminderDraft,
  reminderDateSet,
  snoozeReminder,
  sortReminders,
} = require('../public/app/features/reminders.js');

function createEventTarget() {
  const listeners = new Map();
  return {
    value: '',
    addEventListener: (eventName, listener) => listeners.set(eventName, listener),
    removeEventListener: (eventName, listener) => {
      if (listeners.get(eventName) === listener) listeners.delete(eventName);
    },
    emit(eventName) {
      listeners.get(eventName)?.({ currentTarget: this, target: this });
    },
    listenerCount: () => listeners.size,
  };
}

assert.deepEqual(normalizeReminderDraft({
  date: ' 2026-07-17 ',
  time: ' 09:30 ',
  text: '  Check systems ',
}), { date: '2026-07-17', time: '09:30', text: 'Check systems' });
assert.deepEqual(normalizeReminderDraft({ date: 'July 17', time: '9:30', text: 'Check systems' }), {
  date: '',
  time: '',
  text: 'Check systems',
});

const reminders = [];
assert.deepEqual(createReminder({
  reminders,
  id: () => 'unused',
  now: () => '2026-07-17T08:00:00.000Z',
  values: { date: 'invalid', text: 'Missing date' },
}), { created: false, error: 'date_and_text_required' });
assert.equal(reminders.length, 0);
assert.deepEqual(createReminder({
  reminders,
  id: () => 'first-reminder',
  now: () => '2026-07-17T08:00:00.000Z',
  values: { date: '2026-07-17', time: '11:00', text: 'Later reminder' },
}), {
  created: true,
  reminder: {
    id: 'first-reminder',
    date: '2026-07-17',
    time: '11:00',
    text: 'Later reminder',
    createdAt: '2026-07-17T08:00:00.000Z',
  },
});
assert.equal(snoozeReminder(reminders[0], '2026-07-18', () => '2026-07-17T08:30:00.000Z'), true);
assert.equal(reminders[0].date, '2026-07-18');
assert.equal(reminders[0].updatedAt, '2026-07-17T08:30:00.000Z');
reminders[0].date = '2026-07-17';
reminders.push({ id: 'second-reminder', date: '2026-07-17', time: '08:00', text: 'Earlier reminder' });
assert.deepEqual(sortReminders(reminders).map((reminder) => reminder.id), ['second-reminder', 'first-reminder']);
assert.deepEqual([...reminderDateSet(reminders)], ['2026-07-17']);

const addButton = createEventTarget();
const textInput = createEventTarget();
const timeInput = createEventTarget();
const agendaLabel = { innerHTML: '' };
const agendaList = { innerHTML: '', querySelectorAll: () => [] };
const todayList = { innerHTML: '' };
const state = { reminders: [] };
let selectedDate = null;
const nodes = {
  addCalendarReminderBtn: addButton,
  calendarReminderText: textInput,
  calendarReminderTime: timeInput,
  calendarSelectedDate: agendaLabel,
  calendarDayReminders: agendaList,
  todayReminders: todayList,
};
const commits = [];
const controller = createRemindersController({
  document: { getElementById: (id) => nodes[id] || null },
  getState: () => state,
  getSelectedDate: () => selectedDate,
  setSelectedDate: (date) => { selectedDate = date; },
  dateKey: () => '2026-07-17',
  id: () => 'controller-reminder',
  now: () => '2026-07-17T09:00:00.000Z',
  escapeText: (value) => String(value),
  escapeHtml: (value) => String(value),
  escapeAttribute: (value) => String(value),
  commitState: (reason) => commits.push(reason),
  deleteWithUndo: () => false,
});

controller.renderCalendarPanel();
assert.match(agendaList.innerHTML, /No reminders yet/);
textInput.value = '  Keep moving  ';
timeInput.value = '09:15';
controller.bind();
addButton.emit('click');
assert.equal(selectedDate, '2026-07-17');
assert.deepEqual(state.reminders, [{
  id: 'controller-reminder',
  date: '2026-07-17',
  time: '09:15',
  text: 'Keep moving',
  createdAt: '2026-07-17T09:00:00.000Z',
}]);
assert.equal(textInput.value, '');
assert.equal(timeInput.value, '');
assert.deepEqual(commits, ['calendar_reminder_added']);
controller.renderCalendarPanel();
controller.renderToday();
assert.match(agendaList.innerHTML, /Keep moving/);
assert.match(todayList.innerHTML, /Keep moving/);
controller.destroy();
assert.equal(addButton.listenerCount(), 0);

console.log('reminders-feature: PASS');
