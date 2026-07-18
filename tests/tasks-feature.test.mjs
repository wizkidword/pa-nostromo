import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  columns,
  createTask,
  createTasksController,
  completeTask,
  moveTask,
  normalizeTaskColumn,
  normalizeTaskDraft,
  snoozeTask,
  updateTask,
} = require('../public/app/features/tasks.js');

function createEventTarget() {
  const listeners = new Map();
  return {
    value: '',
    addEventListener: (eventName, listener) => listeners.set(eventName, listener),
    removeEventListener: (eventName, listener) => {
      if (listeners.get(eventName) === listener) listeners.delete(eventName);
    },
    emit(eventName, event = {}) {
      listeners.get(eventName)?.({ currentTarget: this, target: this, preventDefault: () => {}, ...event });
    },
    listenerCount: () => listeners.size,
  };
}

assert.equal(columns.length, 5);
assert.equal(normalizeTaskColumn('ready_to_publish'), 'ready_to_publish');
assert.equal(normalizeTaskColumn('not-a-column'), 'inbox');
assert.deepEqual(normalizeTaskDraft({
  title: '  Review queue ',
  projectId: ' project-1 ',
  column: 'in_progress',
  blockerType: 'approval',
  owner: '  ',
  nextAction: '  Open the queue ',
  dueDate: '2026-07-17',
}), {
  title: 'Review queue',
  projectId: 'project-1',
  column: 'in_progress',
  blockerType: 'approval',
  owner: 'Rowan',
  nextAction: 'Open the queue',
  dueDate: '2026-07-17',
});

const tasks = [];
assert.deepEqual(createTask({
  tasks,
  id: () => 'unused',
  now: () => '2026-07-17T10:00:00.000Z',
  values: { title: 'Missing next action' },
}), { created: false, error: 'title_and_next_action_required' });
const created = createTask({
  tasks,
  id: () => 'task-1',
  now: () => '2026-07-17T10:00:00.000Z',
  values: { title: ' Ship release ', projectId: 'project-1', column: 'inbox', nextAction: ' Run checks ' },
});
assert.equal(created.created, true);
assert.equal(tasks[0].title, 'Ship release');
assert.equal(moveTask(tasks[0], 'done', () => '2026-07-17T10:05:00.000Z'), true);
assert.equal(tasks[0].column, 'done');
assert.equal(snoozeTask(tasks[0], '2026-07-18', () => '2026-07-17T10:06:00.000Z'), true);
assert.equal(tasks[0].dueDate, '2026-07-18');
assert.equal(completeTask(tasks[0], () => '2026-07-17T10:07:00.000Z'), true);
assert.equal(tasks[0].column, 'done');
assert.equal(updateTask(tasks[0], {
  values: { title: 'Ship release now', projectId: 'project-1', column: 'ready_to_publish', nextAction: 'Push release' },
  now: () => '2026-07-17T10:10:00.000Z',
}).updated, true);
assert.equal(tasks[0].column, 'ready_to_publish');

const addButton = createEventTarget();
const editCancelButton = createEventTarget();
const taskForm = { ...createEventTarget(), resetCount: 0, reset() { this.resetCount += 1; } };
const editTaskForm = {
  ...createEventTarget(),
  elements: {
    id: { value: '' }, title: { value: '' }, projectId: { value: '' }, column: { value: '' },
    blockerType: { value: '' }, owner: { value: '' }, nextAction: { value: '' }, dueDate: { value: '' },
  },
};
const taskDialog = { shown: 0, closed: 0, showModal() { this.shown += 1; }, close() { this.closed += 1; } };
const editTaskDialog = { shown: 0, closed: 0, showModal() { this.shown += 1; }, close() { this.closed += 1; } };
const taskProject = { innerHTML: '' };
const editTaskProject = { innerHTML: '' };
const taskColumnSelect = { value: '' };
const board = { innerHTML: '', querySelectorAll: () => [] };
const toolbar = { innerHTML: '' };
const nextActionInput = createEventTarget();
const nextActionPreview = { innerHTML: '' };
const state = {
  tasks: [{
    id: 'existing-task', title: 'Existing', projectId: 'project-1', column: 'inbox', blockerType: null,
    owner: 'Rowan', nextAction: 'Review', dueDate: '', createdAt: '2026-07-17T09:00:00.000Z', updatedAt: '2026-07-17T09:00:00.000Z',
  }],
  projects: [{ id: 'project-1', name: 'Project One' }],
  settings: { defaultTaskColumn: 'in_progress' },
};
const nodes = {
  board,
  taskDialog,
  editTaskDialog,
  taskForm,
  editTaskForm,
  addTaskBtn: addButton,
  editTaskCancelBtn: editCancelButton,
  editTaskDeleteBtn: createEventTarget(),
  editTaskNextAction: nextActionInput,
  editTaskNextActionPreview: nextActionPreview,
  editTaskToolbar: toolbar,
  taskProject,
  editTaskProject,
};
const commits = [];
const logs = [];
let toolbarCleanups = 0;
const controller = createTasksController({
  document: {
    getElementById: (id) => nodes[id] || null,
    querySelector: (selector) => selector === '#taskForm select[name="column"]' ? taskColumnSelect : null,
  },
  getState: () => state,
  id: () => 'created-task',
  now: () => '2026-07-17T11:00:00.000Z',
  escapeText: (value) => String(value),
  escapeAttribute: (value) => String(value),
  escapeHtml: (value) => String(value),
  renderFormattedText: (value) => String(value),
  markdownToolbarButtons: () => '<button>toolbar</button>',
  bindMarkdownToolbar: () => () => { toolbarCleanups += 1; },
  projectName: () => 'Project One',
  commitState: (reason) => commits.push(reason),
  deleteWithUndo: () => false,
  logChange: (message) => logs.push(message),
  getFormValues: (form) => form === taskForm
    ? { title: 'New task', projectId: 'project-1', column: 'in_progress', nextAction: 'Do it' }
    : { id: 'existing-task', title: 'Edited task', projectId: 'project-1', column: 'done', nextAction: 'Finish it' },
});

controller.render();
controller.populateProjectSelects();
controller.bind();
assert.match(board.innerHTML, /Existing/);
assert.match(taskProject.innerHTML, /Project One/);
assert.equal(taskColumnSelect.value, 'in_progress');
addButton.emit('click');
assert.equal(taskDialog.shown, 1);
taskForm.emit('submit');
assert.equal(state.tasks.at(-1).id, 'created-task');
assert.equal(taskForm.resetCount, 1);
controller.openEditDialog('existing-task');
assert.equal(editTaskDialog.shown, 1);
assert.equal(editTaskForm.elements.title.value, 'Existing');
editTaskForm.emit('submit');
assert.equal(state.tasks[0].title, 'Edited task');
assert.deepEqual(commits, ['task_created', 'task_completed']);
assert.deepEqual(logs, ['Edited task: Edited task']);
controller.destroy();
assert.equal(addButton.listenerCount(), 0);
assert.equal(editCancelButton.listenerCount(), 0);
assert.equal(toolbarCleanups, 1);

console.log('tasks-feature: PASS');
