import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createProject,
  createProjectsController,
  normalizeProjectDraft,
  projectDisplayNameById,
} = require('../public/app/features/projects.js');

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener: (eventName, listener) => listeners.set(eventName, listener),
    removeEventListener: (eventName, listener) => {
      if (listeners.get(eventName) === listener) listeners.delete(eventName);
    },
    emit(eventName, event = {}) {
      listeners.get(eventName)?.({ currentTarget: this, ...event });
    },
    listenerCount: () => listeners.size,
  };
}

assert.deepEqual(normalizeProjectDraft({ name: '  Project  ', summary: '  Summary ', status: 'PAUSED' }), {
  name: 'Project',
  summary: 'Summary',
  status: 'paused',
  appLink: '',
  repoLink: '',
});

const projects = [];
assert.deepEqual(createProject({
  projects,
  id: () => 'unused',
  now: () => '2026-07-17T00:00:00.000Z',
  values: { name: '', summary: 'Missing name' },
}), { created: false, error: 'name_and_summary_required' });
assert.equal(projects.length, 0);

const directory = { innerHTML: '' };
const addButton = createEventTarget();
const cancelButton = createEventTarget();
const form = { ...createEventTarget(), resetCount: 0, reset() { this.resetCount += 1; } };
const dialog = { shown: 0, closed: 0, showModal() { this.shown += 1; }, close() { this.closed += 1; } };
const state = {
  projects: [{
    id: 'unsafe-project',
    name: '<unsafe>',
    summary: 'Existing summary',
    status: 'active',
    appLink: 'javascript:alert(1)',
    repoLink: 'https://example.test/repo',
    lastUpdated: '2026-07-17T00:00:00.000Z',
  }],
};
const nodes = {
  projectDirectory: directory,
  addProjectBtn: addButton,
  projectCancelBtn: cancelButton,
  projectForm: form,
  projectDialog: dialog,
};
const created = [];
const controller = createProjectsController({
  document: { getElementById: (id) => nodes[id] || null },
  getState: () => state,
  id: () => 'new-project',
  now: () => '2026-07-17T01:00:00.000Z',
  escapeText: (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  escapeAttribute: (value) => String(value).replaceAll('"', '&quot;'),
  safeExternalUrl: (value) => String(value).startsWith('https://') ? value : '',
  getFormValues: () => ({
    name: '  Mission Support  ',
    summary: '  Keep the ship moving.  ',
    status: 'unexpected',
    appLink: ' https://example.test/app ',
    repoLink: '',
  }),
  onProjectCreated: ({ project }) => created.push(project.id),
});

controller.render();
assert.match(directory.innerHTML, /&lt;unsafe&gt;/);
assert.doesNotMatch(directory.innerHTML, /javascript:/);
assert.match(directory.innerHTML, /https:\/\/example\.test\/repo/);

controller.bind();
addButton.emit('click');
cancelButton.emit('click');
let prevented = false;
form.emit('submit', { preventDefault: () => { prevented = true; } });
assert.equal(prevented, true);
assert.equal(dialog.shown, 1);
assert.equal(dialog.closed, 2);
assert.equal(form.resetCount, 1);
assert.deepEqual(created, ['new-project']);
assert.deepEqual(state.projects.at(-1), {
  id: 'new-project',
  name: 'Mission Support',
  summary: 'Keep the ship moving.',
  status: 'active',
  appLink: 'https://example.test/app',
  repoLink: '',
  lastUpdated: '2026-07-17T01:00:00.000Z',
});
assert.equal(projectDisplayNameById(state.projects, '__global__', '__global__'), 'Global (Mission Control)');
controller.destroy();
assert.equal(addButton.listenerCount(), 0);
assert.equal(cancelButton.listenerCount(), 0);
assert.equal(form.listenerCount(), 0);

console.log('projects-feature: PASS');
