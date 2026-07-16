import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveRuntimeStorage, migrateLegacyDirectory, ensurePrivateRuntimeStorage } = require('../lib/runtime-storage.js');
const { createTempRuntime } = await import('./helpers/temp-runtime.mjs');

const runtime = await createTempRuntime('nostromo-storage-migration-');
try {
  const legacyData = path.join(runtime.root, 'data');
  const legacyLogs = path.join(runtime.root, 'logs');
  await fsp.mkdir(path.join(legacyData, '.auth'), { recursive: true });
  await fsp.mkdir(legacyLogs, { recursive: true });
  await fsp.writeFile(path.join(legacyData, 'state.json'), '{"tasks":[{"id":"keep"}]}', 'utf8');
  await fsp.writeFile(path.join(legacyData, '.auth', 'session.json'), '{"private":true}', 'utf8');
  await fsp.writeFile(path.join(legacyLogs, 'service.log'), 'private log', 'utf8');

  const storage = resolveRuntimeStorage({
    root: runtime.root,
    platform: 'win32',
    homeDir: path.join(runtime.root, 'home'),
    env: { LOCALAPPDATA: path.join(runtime.root, 'appdata'), DATA_DIR: './data', LOG_DIR: './logs' },
  });
  assert.equal(storage.migrateData, true);
  assert.equal(storage.migrateLogs, true);
  assert.notEqual(storage.dataDir, legacyData);

  const first = await ensurePrivateRuntimeStorage(storage);
  assert.deepEqual(first.map((entry) => entry.status), ['migrated', 'migrated']);
  assert.equal(await fsp.readFile(path.join(storage.dataDir, 'state.json'), 'utf8'), '{"tasks":[{"id":"keep"}]}');
  assert.equal(await fsp.readFile(path.join(storage.dataDir, '.auth', 'session.json'), 'utf8'), '{"private":true}');
  assert.equal(await fsp.readFile(path.join(storage.logDir, 'service.log'), 'utf8'), 'private log');
  assert.equal(await fsp.readFile(path.join(legacyData, 'state.json'), 'utf8'), '{"tasks":[{"id":"keep"}]}');

  const second = await ensurePrivateRuntimeStorage(storage);
  assert.deepEqual(second.map((entry) => entry.status), ['already_migrated', 'already_migrated']);

  const custom = resolveRuntimeStorage({
    root: runtime.root,
    platform: 'win32',
    homeDir: path.join(runtime.root, 'home'),
    env: { LOCALAPPDATA: path.join(runtime.root, 'appdata'), DATA_DIR: './custom-data', LOG_DIR: './custom-logs' },
  });
  assert.equal(custom.migrateData, false);
  assert.equal(custom.migrateLogs, false);
  assert.equal(custom.dataDir, path.join(runtime.root, 'custom-data'));

  const mergeLegacy = path.join(runtime.root, 'merge-legacy');
  const mergeTarget = path.join(runtime.root, 'merge-target');
  await fsp.mkdir(mergeLegacy, { recursive: true });
  await fsp.mkdir(mergeTarget, { recursive: true });
  await fsp.writeFile(path.join(mergeLegacy, 'state.json'), '{"migrated":true}', 'utf8');
  await fsp.writeFile(path.join(mergeTarget, 'existing.txt'), 'preserve me', 'utf8');
  const mergeResult = await migrateLegacyDirectory({ legacyDir: mergeLegacy, targetDir: mergeTarget, label: 'merge' });
  assert.equal(mergeResult.status, 'migrated');
  assert.equal(await fsp.readFile(path.join(mergeTarget, 'state.json'), 'utf8'), '{"migrated":true}');
  assert.equal(await fsp.readFile(path.join(mergeTarget, 'existing.txt'), 'utf8'), 'preserve me');

  const conflictLegacy = path.join(runtime.root, 'conflict-legacy');
  const conflictTarget = path.join(runtime.root, 'conflict-target');
  await fsp.mkdir(conflictLegacy, { recursive: true });
  await fsp.mkdir(conflictTarget, { recursive: true });
  await fsp.writeFile(path.join(conflictLegacy, 'state.json'), '{"legacy":true}', 'utf8');
  await fsp.writeFile(path.join(conflictTarget, 'state.json'), '{"private":true,"newer":true}', 'utf8');
  await assert.rejects(
    () => migrateLegacyDirectory({ legacyDir: conflictLegacy, targetDir: conflictTarget, label: 'conflict' }),
    /conflicting destination file/
  );
  assert.equal(await fsp.readFile(path.join(conflictTarget, 'state.json'), 'utf8'), '{"private":true,"newer":true}');

  console.log('runtime-storage-migration: PASS');
} finally {
  await runtime.cleanup();
}
