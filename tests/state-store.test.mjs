import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createTempRuntime } from './helpers/temp-runtime.mjs';

const require = createRequire(import.meta.url);
const { StateSchemaError } = require('../lib/state-schema.js');
const { StateStore, StateStoreError } = require('../lib/state-store.js');

function stateWithTask(title, id = 'task-1') {
  return {
    tasks: [{ id, title, column: 'in_progress', createdAt: '2026-07-16T12:00:00.000Z', updatedAt: '2026-07-16T12:00:00.000Z' }],
    projects: [],
    notes: [],
  };
}

async function expectReject(promise, ErrorType, code) {
  await assert.rejects(promise, (error) => error instanceof ErrorType && error.code === code);
}

const runtime = await createTempRuntime('nostromo-state-store-');
const statePath = path.join(runtime.dataDir, 'state.json');
const backupsDir = path.join(runtime.dataDir, 'backups');

try {
  const store = new StateStore({ statePath, backupsDir, backupRetention: 2, backupMinIntervalMs: 0 });

  const first = await store.write(stateWithTask('First'), { expectedRevision: 0, source: 'test' });
  assert.equal(first.integrity.revision, 1);
  assert.equal(JSON.parse(await fsp.readFile(statePath, 'utf8')).schemaVersion, 2);

  const beforeInvalid = await fsp.readFile(statePath, 'utf8');
  await expectReject(store.write({ tasks: 'not-an-array' }, { expectedRevision: 1 }), StateSchemaError, 'invalid_collection');
  assert.equal(await fsp.readFile(statePath, 'utf8'), beforeInvalid, 'invalid input must not touch the state file');

  await expectReject(store.write(stateWithTask('Stale'), { expectedRevision: 0 }), StateStoreError, 'revision_conflict');
  const second = await store.write(stateWithTask('Second'), { expectedRevision: 1, source: 'test' });
  assert.equal(second.integrity.revision, 2);

  const [orderedA, orderedB] = await Promise.allSettled([
    store.write(stateWithTask('Third'), { expectedRevision: 2, source: 'test' }),
    store.write(stateWithTask('Fourth'), { expectedRevision: 2, source: 'test' }),
  ]);
  assert.equal([orderedA, orderedB].filter((result) => result.status === 'fulfilled').length, 1, 'serialized writes must permit one matching revision');
  const conflict = [orderedA, orderedB].find((result) => result.status === 'rejected');
  assert.ok(conflict?.reason instanceof StateStoreError);
  assert.equal(conflict.reason.code, 'revision_conflict');
  const loaded = await store.load();
  assert.equal(loaded.state.__integrity.revision, 3);

  const backups = await store.listBackups();
  assert.ok(backups.length <= 2, 'retention only prunes verified snapshots after its limit');
  assert.ok(backups.every((backup) => backup.isValid), 'test backups are verified before retention cleanup');

  await fsp.writeFile(path.join(runtime.dataDir, '.state-interrupted.tmp'), 'partial', 'utf8');
  await fsp.writeFile(path.join(backupsDir, '.state-backup-interrupted.tmp'), 'partial', 'utf8');
  await store.load();
  await assert.rejects(fsp.access(path.join(runtime.dataDir, '.state-interrupted.tmp')));
  await assert.rejects(fsp.access(path.join(backupsDir, '.state-backup-interrupted.tmp')));

  const atomicPath = path.join(runtime.dataDir, 'atomic-state.json');
  const atomicBackups = path.join(runtime.dataDir, 'atomic-backups');
  const stableStore = new StateStore({ statePath: atomicPath, backupsDir: atomicBackups, backupMinIntervalMs: 0 });
  await stableStore.write(stateWithTask('Durable'), { expectedRevision: 0 });
  const durableBeforeFailure = await fsp.readFile(atomicPath, 'utf8');
  const interruptedStore = new StateStore({
    statePath: atomicPath,
    backupsDir: atomicBackups,
    backupMinIntervalMs: 0,
    beforeRename: async ({ targetPath }) => {
      if (targetPath === atomicPath) throw new Error('simulated interruption before rename');
    },
  });
  await assert.rejects(interruptedStore.write(stateWithTask('Should not replace'), { expectedRevision: 1 }));
  assert.equal(await fsp.readFile(atomicPath, 'utf8'), durableBeforeFailure, 'failed atomic write must leave the old file intact');

  const legacyPath = path.join(runtime.dataDir, 'legacy-state.json');
  const legacyBackups = path.join(runtime.dataDir, 'legacy-backups');
  await fsp.writeFile(legacyPath, JSON.stringify(stateWithTask('Legacy')), 'utf8');
  const legacyStore = new StateStore({ statePath: legacyPath, backupsDir: legacyBackups });
  const migrated = await legacyStore.load();
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.schemaVersion, 2);
  assert.equal(migrated.state.__integrity.revision, 1);
  assert.ok((await legacyStore.listBackups()).some((backup) => backup.snapshotMeta.reason === 'pre_migration'));

  const futurePath = path.join(runtime.dataDir, 'future-state.json');
  const futureBackups = path.join(runtime.dataDir, 'future-backups');
  const futureState = { ...stateWithTask('Future'), schemaVersion: 99 };
  await fsp.writeFile(futurePath, JSON.stringify(futureState), 'utf8');
  const futureStore = new StateStore({ statePath: futurePath, backupsDir: futureBackups });
  await expectReject(futureStore.load(), StateSchemaError, 'unsupported_future_schema');
  assert.equal(JSON.parse(await fsp.readFile(futurePath, 'utf8')).schemaVersion, 99, 'future state must fail safely without being changed');

  const corruptPath = path.join(runtime.dataDir, 'corrupt-state.json');
  const corruptBackups = path.join(runtime.dataDir, 'corrupt-backups');
  await fsp.writeFile(corruptPath, '{not valid json', 'utf8');
  const corruptStore = new StateStore({ statePath: corruptPath, backupsDir: corruptBackups });
  const corrupted = await corruptStore.load();
  assert.equal(corrupted.integrity, 'corrupt_quarantined');
  assert.equal(corrupted.state, null);
  const quarantined = await fsp.readdir(runtime.dataDir);
  assert.ok(quarantined.some((file) => file.startsWith('state.corrupt-invalid-json-')));
} finally {
  await runtime.cleanup();
}

console.log('state-store: PASS');
