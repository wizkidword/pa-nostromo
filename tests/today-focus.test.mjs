import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PRIMARY_LIMIT,
  addDays,
  buildTodayFocusItems,
  normalizeFocusState,
  sourceKey,
  withDismissal,
  withPinned,
  withSnooze,
} = require('../public/app/features/today-focus.js');

const now = new Date(2026, 6, 17, 9, 0, 0);
const pinnedTaskKey = sourceKey('task', 'pinned-task');
const flaggedEmailKey = sourceKey('email', 'account-1::INBOX::42');
assert.equal(PRIMARY_LIMIT, 7);
assert.equal(addDays(now, 1), '2026-07-18');
assert.equal(sourceKey('unknown', '1'), '');

let focus = normalizeFocusState({
  pinned: [{ sourceType: 'email', sourceId: 'account-1::INBOX::42', title: 'Review contract', accountId: 'account-1', mailbox: 'INBOX', uid: '42', issuedAt: '2026-07-17T10:00:00.000Z' }],
  snoozedUntil: { bad: 'invalid', future: '2026-07-18' },
  dismissedOn: { yesterday: '2026-07-16' },
});
assert.equal(focus.pinned.length, 1);
assert.deepEqual(focus.snoozedUntil, { future: '2026-07-18' });
focus = withPinned(focus, { sourceType: 'task', sourceId: 'pinned-task', title: 'Pinned task', createdAt: '2026-07-17T08:00:00.000Z' });
assert.equal(focus.pinned.length, 2);

const state = {
  todayFocus: focus,
  tasks: [
    { id: 'overdue', title: 'Overdue task', column: 'in_progress', dueDate: '2026-07-16', updatedAt: '2026-07-16T08:00:00.000Z' },
    { id: 'due', title: 'Due today task', column: 'inbox', dueDate: '2026-07-17', updatedAt: '2026-07-17T08:00:00.000Z' },
    { id: 'blocked', title: 'Broken action', column: 'waiting_blocked', blockerType: 'error', updatedAt: '2026-07-17T07:00:00.000Z' },
    { id: 'pinned-task', title: 'Pinned task', column: 'inbox', nextAction: 'Start the work', updatedAt: '2026-07-17T08:00:00.000Z' },
    { id: 'done', title: 'Completed task', column: 'done', dueDate: '2026-07-16' },
  ],
  reminders: [
    { id: 'reminder-1', text: 'Call supplier', date: '2026-07-17', time: '09:30' },
    { id: 'reminder-later', text: 'Tomorrow item', date: '2026-07-18', time: '09:00' },
  ],
};
const integrations = [
  { id: 'weather', name: 'Weather', status: 'healthy' },
  { id: 'rss', name: 'RSS Feeds', status: 'error', lastAttemptAt: '2026-07-17T08:30:00.000Z' },
];

const result = buildTodayFocusItems({ state, now, integrations });
assert.equal(result.today, '2026-07-17');
assert.deepEqual(result.primaryItems.map((item) => item.sourceKey), [
  pinnedTaskKey,
  flaggedEmailKey,
  sourceKey('integration', 'rss'),
  sourceKey('task', 'blocked'),
  sourceKey('task', 'overdue'),
  sourceKey('task', 'due'),
  sourceKey('reminder', 'reminder-1'),
]);
assert.equal(result.primaryItems[0].pinned, true);
assert.equal(result.primaryItems.at(-1).label, 'Calendar reminder');
assert.equal(result.allItems.find((item) => item.sourceId === 'rss')?.title, 'RSS Feeds requires attention');
assert.equal(result.allItems.some((item) => item.sourceId === 'done'), false);
assert.equal(result.allItems.some((item) => item.sourceId === 'reminder-later'), false);

const dismissed = withDismissal(focus, sourceKey('task', 'overdue'), '2026-07-17');
const snoozed = withSnooze(dismissed, sourceKey('task', 'due'), '2026-07-18');
const filtered = buildTodayFocusItems({ state: { ...state, todayFocus: snoozed }, now, integrations });
assert.equal(filtered.allItems.some((item) => item.sourceId === 'overdue'), false);
assert.equal(filtered.allItems.some((item) => item.sourceId === 'due'), false);

console.log('today-focus: PASS');
