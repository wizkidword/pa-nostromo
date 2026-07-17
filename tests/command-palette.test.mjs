import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  RESULT_LIMIT,
  buildSearchResults,
  createDefaultCommands,
  sourceKey,
} = require('../public/app/features/command-palette.js');

assert.equal(RESULT_LIMIT, 30);
assert.equal(sourceKey('project', 'project-1'), 'project:project-1');
assert.equal(sourceKey('unknown', 'project-1'), '');

const state = {
  projects: [{ id: 'project-1', name: 'Target project', summary: 'Launch planning', status: 'active' }],
  tasks: [{ id: 'task-1', title: 'Target task', nextAction: 'Prepare the launch target', projectId: 'project-1', column: 'in_progress', owner: 'Rowan', dueDate: '2026-07-18' }],
  notes: [{ id: 'note-1', title: 'Release notes', body: 'Target note body', projectId: 'project-1' }],
  reminders: [{ id: 'reminder-1', text: 'Target reminder', date: '2026-07-19', time: '09:30', projectId: 'project-1' }],
  shortcuts: [
    { id: 'shortcut-1', title: 'Target shortcut', category: 'Launch', url: 'https://example.test/target', enabled: true },
    { id: 'shortcut-disabled', title: 'Disabled target shortcut', category: 'Hidden', url: 'https://example.test/hidden', enabled: false },
  ],
  rss: {
    items: [{ id: 'rss-1', title: 'Target RSS title', feedTitle: 'Launch feed', tag: 'Target', publishedAt: '2026-07-17T10:00:00.000Z', link: 'https://example.test/rss' }],
  },
};
const emailPayload = {
  accounts: [{
    id: 'account-1',
    label: 'Work email',
    account: 'work@example.test',
    entries: [{ uid: '42', mailbox: 'INBOX', title: 'Target email metadata', counterpartyName: 'Launch Team', counterpartyEmail: 'launch@example.test', issuedAt: '2026-07-17T11:00:00.000Z', summary: 'Sensitive hidden body text' }],
  }],
};
const integrations = [{ id: 'integration-1', name: 'Target integration', status: 'healthy', configured: 'configured', settingsSection: 'general' }];

const commands = createDefaultCommands();
assert.equal(commands.length, 6);
assert.equal(commands.find((command) => command.id === 'switch-profile')?.disabled, true);

const initial = buildSearchResults({ state, emailPayload, integrations });
assert.deepEqual(initial.rows.map((row) => row.sourceId), commands.map((command) => command.id));

const targetResults = buildSearchResults({ query: 'target', state, emailPayload, integrations });
assert.deepEqual(new Set(targetResults.rows.map((row) => row.type)), new Set(['project', 'task', 'note', 'reminder', 'shortcut', 'rss', 'email', 'integration']));
assert.equal(targetResults.rows.find((row) => row.type === 'email')?.sourceId, 'account-1::INBOX::42');
assert.equal(targetResults.rows.some((row) => row.sourceId === 'shortcut-disabled'), false, 'disabled shortcuts must not be searchable');

const emailOnly = buildSearchResults({ query: 'launch@example.test', state, emailPayload, integrations });
assert.equal(emailOnly.rows.length, 1);
assert.equal(emailOnly.rows[0].type, 'email');

const hiddenEmailBody = buildSearchResults({ query: 'sensitive hidden body', state, emailPayload, integrations });
assert.equal(hiddenEmailBody.rows.some((row) => row.type === 'email'), false, 'email search must not index message previews or bodies');

const profileResult = buildSearchResults({ query: 'switch profile', state, emailPayload, integrations });
assert.equal(profileResult.rows.length, 1);
assert.equal(profileResult.rows[0].disabled, true);

const coreCommands = createDefaultCommands({ profilesAvailable: true, emailAvailable: false, integrationHealthAvailable: false });
assert.deepEqual(coreCommands.map((command) => command.id), ['create-task', 'capture-note', 'open-project', 'switch-profile']);
assert.equal(coreCommands.find((command) => command.id === 'switch-profile')?.disabled, false);

const coreSearch = buildSearchResults({
  query: 'target',
  state,
  emailPayload,
  integrations,
  profilesAvailable: true,
  emailAvailable: false,
  integrationHealthAvailable: false,
  enabledTypes: new Set(['project', 'task', 'note', 'reminder', 'shortcut']),
});
assert.equal(coreSearch.rows.some((row) => ['rss', 'email', 'integration'].includes(row.type)), false, 'disabled profile sources must not appear in local search');

const cappedResults = buildSearchResults({
  query: 'bulk',
  state: { ...state, projects: Array.from({ length: 40 }, (_, index) => ({ id: `bulk-${index}`, name: `Bulk project ${index}`, status: 'active' })) },
  emailPayload,
  integrations,
});
assert.equal(cappedResults.rows.length, RESULT_LIMIT);

console.log('command-palette: PASS');
