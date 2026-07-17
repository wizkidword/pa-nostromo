import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createShortcut,
  createShortcutsController,
  extractUrlFromDrop,
  normalizeShortcutDraft,
  suggestShortcutTitle,
  uniqueProjectIds,
  updateShortcut,
} = require('../public/app/features/shortcuts.js');

function createEventTarget() {
  const listeners = new Map();
  return {
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

const safeExternalUrl = (value) => /^https:\/\//.test(String(value).trim()) ? String(value).trim() : '';
assert.deepEqual(uniqueProjectIds([' project-1 ', 'project-1', ''], '__global__'), ['project-1']);
assert.deepEqual(uniqueProjectIds([], '__global__'), ['__global__']);
assert.equal(extractUrlFromDrop({ getData: (type) => type === 'text/uri-list' ? '# comment\nhttps://example.test/a' : '' }), 'https://example.test/a');
assert.equal(suggestShortcutTitle('https://www.example.test/articles', ''), 'example.test / articles');
assert.deepEqual(normalizeShortcutDraft({
  title: '  Docs ',
  url: ' https://example.test/docs ',
  category: ' Work ',
  projectIds: ['project-1'],
  enabled: undefined,
}, { safeExternalUrl, globalProjectId: '__global__' }), {
  title: 'Docs',
  url: 'https://example.test/docs',
  category: 'Work',
  projectIds: ['project-1'],
  enabled: false,
});

const shortcuts = [];
assert.deepEqual(createShortcut({
  shortcuts,
  id: () => 'unused',
  now: () => '2026-07-17T12:00:00.000Z',
  values: { title: 'Unsafe', url: 'javascript:alert(1)' },
  safeExternalUrl,
  globalProjectId: '__global__',
}), { created: false, error: 'title_and_safe_url_required' });
const created = createShortcut({
  shortcuts,
  id: () => 'shortcut-1',
  now: () => '2026-07-17T12:00:00.000Z',
  values: { title: 'Docs', url: 'https://example.test/docs', category: 'Reference', enabled: true },
  safeExternalUrl,
  globalProjectId: '__global__',
});
assert.equal(created.created, true);
assert.equal(shortcuts[0].enabled, true);
assert.equal(updateShortcut(shortcuts[0], {
  values: { title: 'Docs Updated', url: 'https://example.test/docs', enabled: false },
  now: () => '2026-07-17T12:10:00.000Z',
  safeExternalUrl,
  globalProjectId: '__global__',
}).updated, true);
assert.equal(shortcuts[0].enabled, false);

const addButton = createEventTarget();
const cancelButton = createEventTarget();
const form = {
  ...createEventTarget(),
  elements: {
    id: { value: '' }, title: { value: '' }, url: { value: '' }, category: { value: '' }, enabled: { checked: false },
  },
};
const dialog = { shown: 0, closed: 0, showModal() { this.shown += 1; }, close() { this.closed += 1; } };
const dialogTitle = { textContent: '' };
const checklist = { innerHTML: '' };
const pod = { innerHTML: '', querySelector: () => null };
const settingsList = { innerHTML: '', querySelectorAll: () => [] };
const state = { shortcuts: [], projects: [{ id: 'project-1', name: 'Mission Control Dashboard' }] };
const nodes = {
  addShortcutBtn: addButton,
  shortcutCancelBtn: cancelButton,
  shortcutForm: form,
  shortcutDialog: dialog,
  shortcutDialogTitle: dialogTitle,
  shortcutProjectChecklist: checklist,
  shortcutsWidget: pod,
  settingsShortcutsList: settingsList,
};
const commits = [];
const logs = [];
const controller = createShortcutsController({
  document: {
    getElementById: (id) => nodes[id] || null,
    querySelectorAll: () => [{ value: 'project-1' }],
  },
  getState: () => state,
  id: () => 'controller-shortcut',
  now: () => '2026-07-17T13:00:00.000Z',
  globalProjectId: '__global__',
  safeExternalUrl,
  escapeText: (value) => String(value),
  escapeAttribute: (value) => String(value),
  escapeHtml: (value) => String(value),
  projectDisplayName: (id) => id === '__global__' ? 'Global (Mission Control)' : 'Mission Control Dashboard',
  commitState: (reason) => commits.push(reason),
  deleteWithUndo: () => false,
  logChange: (message) => logs.push(message),
  getFormValues: () => ({ title: 'Dashboard', url: 'https://example.test/dashboard', category: 'Tools', enabled: 'on' }),
});

controller.bind();
addButton.emit('click');
assert.equal(dialog.shown, 1);
assert.equal(dialogTitle.textContent, 'New Shortcut');
assert.match(checklist.innerHTML, /Mission Control Dashboard/);
form.emit('submit');
assert.deepEqual(state.shortcuts, [{
  id: 'controller-shortcut',
  title: 'Dashboard',
  url: 'https://example.test/dashboard',
  category: 'Tools',
  projectIds: ['project-1'],
  enabled: true,
  createdAt: '2026-07-17T13:00:00.000Z',
  updatedAt: '2026-07-17T13:00:00.000Z',
}]);
assert.deepEqual(commits, ['shortcut_form_submitted']);
assert.deepEqual(logs, ['Created shortcut: Dashboard']);
controller.renderPod();
controller.renderSettings();
assert.match(pod.innerHTML, /Dashboard/);
assert.match(settingsList.innerHTML, /Dashboard/);
controller.destroy();
assert.equal(addButton.listenerCount(), 0);
assert.equal(cancelButton.listenerCount(), 0);
assert.equal(form.listenerCount(), 0);

console.log('shortcuts-feature: PASS');
