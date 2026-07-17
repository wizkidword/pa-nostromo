import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createNote,
  createNotesController,
  createTaskFromNote,
  filterNotes,
  isToday,
  updateNote,
} = require('../public/app/features/notes.js');

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

const currentDate = new Date('2026-07-17T12:00:00.000Z');
const notes = [
  { id: 'today-pinned', title: 'Ship it', body: 'Review release', pinned: true, updatedAt: '2026-07-17T08:00:00.000Z' },
  { id: 'backlog', title: 'Later', body: 'Research', pinned: false, updatedAt: '2026-07-16T08:00:00.000Z' },
];

assert.equal(isToday(notes[0].updatedAt, currentDate), true);
assert.equal(isToday(notes[1].updatedAt, currentDate), false);
assert.deepEqual(filterNotes(notes, { filter: 'pinned', currentDate }).map((note) => note.id), ['today-pinned']);
assert.deepEqual(filterNotes(notes, { search: 'research', currentDate }).map((note) => note.id), ['backlog']);

const createdNote = createNote({
  notes,
  id: () => 'created-note',
  now: () => '2026-07-17T13:00:00.000Z',
  defaultProjectId: 'project-1',
});
assert.deepEqual(createdNote, {
  id: 'created-note',
  title: '',
  body: '',
  projectId: 'project-1',
  pinned: false,
  createdAt: '2026-07-17T13:00:00.000Z',
  updatedAt: '2026-07-17T13:00:00.000Z',
});
assert.equal(updateNote(createdNote, 'body', 'A safe body', () => '2026-07-17T13:05:00.000Z'), true);
assert.equal(updateNote(createdNote, 'unknown', 'ignored', () => '2026-07-17T13:05:00.000Z'), false);
assert.equal(createdNote.body, 'A safe body');
assert.equal(createdNote.updatedAt, '2026-07-17T13:05:00.000Z');

const tasks = [];
assert.deepEqual(createTaskFromNote({
  note: createdNote,
  tasks,
  projects: [{ id: 'project-1' }],
  settings: { defaultTaskColumn: 'in_progress' },
  id: () => 'task-from-note',
  now: () => '2026-07-17T13:10:00.000Z',
}), {
  id: 'task-from-note',
  title: 'Task from note',
  projectId: 'project-1',
  column: 'in_progress',
  blockerType: null,
  owner: 'Rowan',
  nextAction: 'A safe body',
  dueDate: '',
  createdAt: '2026-07-17T13:10:00.000Z',
  updatedAt: '2026-07-17T13:10:00.000Z',
});

const addButton = createEventTarget();
const searchInput = createEventTarget();
const filterSelect = createEventTarget();
const clearButton = createEventTarget();
const todayBoard = { innerHTML: '', querySelectorAll: () => [] };
const backlogBoard = { innerHTML: '', querySelectorAll: () => [] };
const state = {
  notes: [],
  tasks: [],
  projects: [{ id: 'project-2', name: 'Project Two' }],
  settings: { defaultTaskColumn: 'inbox' },
};
const nodes = {
  addNoteBtn: addButton,
  notesSearch: searchInput,
  notesFilter: filterSelect,
  notesClearFiltersBtn: clearButton,
  notesBoardToday: todayBoard,
  notesBoardBacklog: backlogBoard,
};
const commits = [];
const controller = createNotesController({
  document: { getElementById: (id) => nodes[id] || null },
  getState: () => state,
  id: () => 'controller-note',
  now: () => '2026-07-17T14:00:00.000Z',
  escapeText: (value) => String(value),
  escapeAttribute: (value) => String(value),
  escapeHtml: (value) => String(value),
  renderFormattedText: (value) => String(value),
  markdownToolbarButtons: () => '',
  bindMarkdownToolbar: () => {},
  save: () => {},
  commitState: (reason) => commits.push(reason),
  deleteWithUndo: () => false,
});

controller.bind();
addButton.emit('click');
assert.equal(state.notes.length, 1);
assert.equal(state.notes[0].projectId, 'project-2');
assert.deepEqual(commits, ['note_added']);
searchInput.value = 'not used';
filterSelect.value = 'pinned';
clearButton.emit('click');
assert.equal(searchInput.value, '');
assert.equal(filterSelect.value, 'all');
controller.destroy();
assert.equal(addButton.listenerCount(), 0);
assert.equal(searchInput.listenerCount(), 0);
assert.equal(filterSelect.listenerCount(), 0);
assert.equal(clearButton.listenerCount(), 0);

console.log('notes-feature: PASS');
