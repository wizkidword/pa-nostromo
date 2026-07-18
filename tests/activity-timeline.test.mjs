import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const timeline = require('../public/app/features/activity-timeline.js');

const normalized = timeline.normalizeState({
  events: [
    { id: 'task-1', type: 'task_completed', ts: '2026-07-17T12:00:00.000Z', title: 'Private task title', message: 'Never retain this.' },
    { id: 'bad', type: 'unknown', ts: '2026-07-17T12:00:00.000Z' },
  ],
});
assert.deepEqual(normalized.events, [{
  id: 'task-1', type: 'task_completed', ts: '2026-07-17T12:00:00.000Z', actionId: '', undoStatus: '',
}], 'activity records retain no user payload');

const appended = timeline.appendEvent(normalized, {
  id: 'delete-1', type: 'item_deleted', ts: '2026-07-17T13:00:00.000Z', actionId: 'delete:task-1:1', title: 'also private',
});
const view = timeline.buildTimeline({
  state: appended,
  backups: [{ backupFile: 'state-backup-secret-name.json', createdAt: '2026-07-17T12:30:00.000Z', snapshotMeta: { reason: 'private reason' } }],
  activeUndoActionId: 'delete:task-1:1',
});
assert.deepEqual(view.map((entry) => entry.label), ['Removed item', 'State snapshot available', 'Completed task']);
assert.equal(view[0].undoAvailable, true);
assert.equal(view[0].status, 'Undo available');
assert.equal(view[1].recoveryAvailable, true);
assert.equal('backupFile' in view[1], false, 'backup filenames are not exposed to the activity view');
assert.equal(JSON.stringify(view).includes('Private task title'), false);
assert.equal(JSON.stringify(view).includes('state-backup-secret-name'), false);

const reversed = timeline.markUndoApplied(appended, 'delete:task-1:1');
const reversedView = timeline.buildTimeline({ state: reversed, activeUndoActionId: 'delete:task-1:1' });
assert.equal(reversedView[0].status, 'Reversed');
assert.equal(reversedView[0].undoAvailable, false);

console.log('activity-timeline: PASS');
