'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { CURRENT_STATE_SCHEMA_VERSION, StateSchemaError, cloneJson, removeInternalMetadata, validateAndMigrateState } = require('./state-schema.js');

const SNAPSHOT_SCHEMA_VERSION = 1;

class StateStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StateStoreError';
    this.code = code;
    this.details = details;
  }
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function checksumForState(state) {
  return crypto.createHash('sha256').update(stableStringify(removeInternalMetadata(state))).digest('hex');
}

function legacyChecksumForState(state) {
  return crypto.createHash('sha256').update(JSON.stringify(removeInternalMetadata(state))).digest('hex');
}

function getRevision(state) {
  const revision = Number(state?.__integrity?.revision || 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function makeTimestampFileName(prefix = 'state') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString('hex')}.json`;
}

function isNotFound(error) {
  return error?.code === 'ENOENT';
}

class StateStore {
  constructor({ statePath, backupsDir, backupRetention = 200, backupMinIntervalMs = 30_000, now = () => new Date(), beforeRename } = {}) {
    if (!statePath || !backupsDir) throw new Error('StateStore requires statePath and backupsDir.');
    this.statePath = statePath;
    this.backupsDir = backupsDir;
    this.backupRetention = backupRetention;
    this.backupMinIntervalMs = backupMinIntervalMs;
    this.now = now;
    this.beforeRename = beforeRename;
    this.queue = Promise.resolve();
    this.lastBackupAt = 0;
  }

  _enqueue(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async _ensureDirectories() {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.mkdir(this.backupsDir, { recursive: true });
  }

  async _cleanupTempFiles() {
    for (const dir of new Set([path.dirname(this.statePath), this.backupsDir])) {
      let entries = [];
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (error) { if (isNotFound(error)) continue; throw error; }
      await Promise.all(entries
        .filter((entry) => entry.isFile() && entry.name.startsWith('.state-') && entry.name.endsWith('.tmp'))
        .map((entry) => fs.unlink(path.join(dir, entry.name)).catch(() => {})));
    }
  }

  async _atomicWriteJson(targetPath, value) {
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = path.join(dir, `.${path.basename(targetPath)}-${process.pid}-${crypto.randomBytes(5).toString('hex')}.tmp`);
    let handle;
    try {
      handle = await fs.open(tempPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      if (this.beforeRename) await this.beforeRename({ targetPath, tempPath, value });
      await fs.rename(tempPath, targetPath);
      // Directory fsync is not available on all Windows filesystems. The file
      // itself is already flushed; the best-effort directory sync is useful on Unix.
      let dirHandle;
      try {
        dirHandle = await fs.open(dir, 'r');
        await dirHandle.sync();
      } catch {
        // Directory fsync is optional on the current platform.
      } finally {
        await dirHandle?.close().catch(() => {});
      }
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  _attachIntegrity(state, { previousRevision = 0, source = 'unknown', reason = 'state_write' } = {}) {
    const next = cloneJson(removeInternalMetadata(state));
    next.schemaVersion = CURRENT_STATE_SCHEMA_VERSION;
    next.__integrity = {
      savedAt: this.now().toISOString(),
      revision: previousRevision + 1,
      stateSchemaVersion: CURRENT_STATE_SCHEMA_VERSION,
      source: String(source || 'unknown').slice(0, 128),
      reason: String(reason || 'state_write').slice(0, 128),
    };
    next.__integrity.checksum = checksumForState(next);
    return next;
  }

  async _quarantineStateFile(reason) {
    const quarantinePath = path.join(path.dirname(this.statePath), makeTimestampFileName(`state.corrupt-${reason}`));
    try {
      await fs.rename(this.statePath, quarantinePath);
      return path.basename(quarantinePath);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw new StateStoreError('quarantine_failed', 'State file could not be quarantined safely.', { reason, cause: error.message });
    }
  }

  _verifyIntegrity(parsed) {
    const stored = String(parsed?.__integrity?.checksum || '').trim();
    if (!stored) return 'missing_checksum';
    return stored === checksumForState(parsed) || stored === legacyChecksumForState(parsed) ? 'ok' : 'checksum_mismatch';
  }

  async _readUnsafe({ migrate = true } = {}) {
    await this._ensureDirectories();
    await this._cleanupTempFiles();
    let raw;
    try {
      raw = await fs.readFile(this.statePath, 'utf8');
    } catch (error) {
      if (isNotFound(error)) return { state: null, integrity: 'not_found', migrated: false };
      throw new StateStoreError('state_read_failed', 'State file could not be read.', { cause: error.message });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const quarantineFile = await this._quarantineStateFile('invalid-json');
      return { state: null, integrity: 'corrupt_quarantined', quarantineFile, migrated: false };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const quarantineFile = await this._quarantineStateFile('invalid-root');
      return { state: null, integrity: 'corrupt_quarantined', quarantineFile, migrated: false };
    }

    const integrity = this._verifyIntegrity(parsed);
    if (integrity === 'checksum_mismatch') {
      const quarantineFile = await this._quarantineStateFile('checksum-mismatch');
      return { state: null, integrity: 'corrupt_quarantined', quarantineFile, migrated: false };
    }

    let validated;
    try {
      validated = validateAndMigrateState(parsed);
    } catch (error) {
      if (error instanceof StateSchemaError && error.code === 'unsupported_future_schema') throw error;
      const quarantineFile = await this._quarantineStateFile('schema-invalid');
      return { state: null, integrity: 'corrupt_quarantined', quarantineFile, migrated: false };
    }

    if (migrate && validated.migrated) {
      // Keep the exact original as a verified snapshot before changing it.
      await this._writeBackupUnsafe(parsed, 'pre_migration', { force: true });
      const migratedState = this._attachIntegrity(validated.state, {
        previousRevision: getRevision(parsed),
        source: 'state_migration',
        reason: `schema_v${validated.fromVersion}_to_v${CURRENT_STATE_SCHEMA_VERSION}`,
      });
      await this._atomicWriteJson(this.statePath, migratedState);
      return { state: migratedState, integrity: 'ok', migrated: true, fromVersion: validated.fromVersion };
    }

    // A legacy checksum remains readable, but the next write updates it to the
    // deterministic v2 form.
    return { state: parsed, integrity, migrated: false };
  }

  async load() {
    return this._enqueue(() => this._readUnsafe({ migrate: true }));
  }

  async _writeBackupUnsafe(state, reason = 'write', { force = false } = {}) {
    if (!state || typeof state !== 'object') return null;
    const nowMs = this.now().getTime();
    if (!force && this.lastBackupAt && nowMs - this.lastBackupAt < this.backupMinIntervalMs) return null;
    const backupFile = makeTimestampFileName('state');
    const payload = cloneJson(state);
    payload.__backupMeta = { reason: String(reason || 'write').slice(0, 128), createdAt: this.now().toISOString() };
    payload.__snapshotMeta = {
      snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
      criticalCounts: {
        tasks: Array.isArray(payload.tasks) ? payload.tasks.length : 0,
        notes: Array.isArray(payload.notes) ? payload.notes.length : 0,
        projects: Array.isArray(payload.projects) ? payload.projects.length : 0,
        reminders: Array.isArray(payload.reminders) ? payload.reminders.length : 0,
        layoutRows: Array.isArray(payload?.layout?.utilityRows) ? payload.layout.utilityRows.length : 0,
      },
    };
    await this._atomicWriteJson(path.join(this.backupsDir, backupFile), payload);
    this.lastBackupAt = nowMs;
    await this._pruneBackupsUnsafe();
    return backupFile;
  }

  async _readBackupMetadata(entry) {
    const abs = path.join(this.backupsDir, entry.name);
    const stat = await fs.stat(abs);
    let parsed = null;
    let isValid = false;
    let invalidReason = '';
    try {
      parsed = JSON.parse(await fs.readFile(abs, 'utf8'));
      const integrity = this._verifyIntegrity(parsed);
      if (integrity === 'checksum_mismatch') throw new Error('checksum_mismatch');
      validateAndMigrateState(parsed);
      isValid = true;
    } catch (error) {
      invalidReason = error?.code || error?.message || 'invalid_backup';
    }
    const checksum = String(parsed?.__integrity?.checksum || '').trim() || null;
    return {
      backupFile: entry.name,
      size: stat.size,
      createdAt: stat.birthtime?.toISOString?.() || stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
      isValid,
      invalidReason: isValid ? undefined : invalidReason,
      snapshotMeta: {
        snapshotSchemaVersion: Number(parsed?.__snapshotMeta?.snapshotSchemaVersion || SNAPSHOT_SCHEMA_VERSION),
        stateSchemaVersion: Number(parsed?.__integrity?.stateSchemaVersion || parsed?.schemaVersion || CURRENT_STATE_SCHEMA_VERSION),
        revision: getRevision(parsed),
        reason: String(parsed?.__backupMeta?.reason || '').trim() || 'unspecified',
        checksum,
        hasChecksum: Boolean(checksum),
        criticalCounts: parsed?.__snapshotMeta?.criticalCounts || null,
      },
    };
  }

  async _listBackupsUnsafe() {
    await this._ensureDirectories();
    const entries = await fs.readdir(this.backupsDir, { withFileTypes: true });
    const backups = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith('state-') || !entry.name.endsWith('.json')) continue;
      try { backups.push(await this._readBackupMetadata(entry)); } catch { /* file raced with cleanup */ }
    }
    backups.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return backups;
  }

  async listBackups() {
    return this._enqueue(() => this._listBackupsUnsafe());
  }

  async _pruneBackupsUnsafe() {
    const backups = await this._listBackupsUnsafe();
    const stale = backups.filter((backup) => backup.isValid).slice(this.backupRetention);
    await Promise.all(stale.map((backup) => fs.unlink(path.join(this.backupsDir, backup.backupFile)).catch(() => {})));
  }

  async _writeValidatedUnsafe(validated, options = {}) {
    const current = await this._readUnsafe({ migrate: true });
    const currentState = current.state;
    const currentRevision = getRevision(currentState);
    const expectedRevision = options.expectedRevision;

    if (currentState) {
      if (expectedRevision == null) {
        throw new StateStoreError('revision_required', 'A current state revision is required before replacing existing shared state.', { currentRevision });
      }
      if (expectedRevision !== currentRevision) {
        throw new StateStoreError('revision_conflict', 'Shared state changed before this save completed.', { currentRevision });
      }
    } else if (expectedRevision != null && expectedRevision !== 0) {
      throw new StateStoreError('revision_conflict', 'Shared state does not match the expected revision.', { currentRevision: 0 });
    }

    if (typeof options.validateCurrent === 'function') await options.validateCurrent(currentState, validated.state);

    let backupFile = null;
    if (currentState) {
      backupFile = await this._writeBackupUnsafe(currentState, options.backupReason || 'pre_write', { force: options.forceBackup === true });
    }

    const next = this._attachIntegrity(validated.state, {
      previousRevision: currentRevision,
      source: options.source || 'api_state_post',
      reason: options.reason || 'api_state_post',
    });
    await this._atomicWriteJson(this.statePath, next);
    return { state: next, integrity: next.__integrity, previousStateIntegrity: current.integrity, backupFile };
  }

  async write(incoming, options = {}) {
    let validated;
    try {
      validated = validateAndMigrateState(incoming);
    } catch (error) {
      if (error instanceof StateSchemaError) throw error;
      throw new StateStoreError('invalid_state', 'State failed validation.', { cause: error.message });
    }
    return this._enqueue(() => this._writeValidatedUnsafe(validated, options));
  }

  async restore(backupFile, options = {}) {
    const safeName = path.basename(String(backupFile || '').trim());
    if (!safeName || safeName !== backupFile || !safeName.startsWith('state-') || !safeName.endsWith('.json')) {
      throw new StateStoreError('invalid_backup_file', 'Backup file name is invalid.');
    }
    return this._enqueue(async () => {
      let parsed;
      try { parsed = JSON.parse(await fs.readFile(path.join(this.backupsDir, safeName), 'utf8')); } catch (error) {
        throw new StateStoreError('backup_read_failed', 'Backup could not be read.', { cause: error.message });
      }
      if (this._verifyIntegrity(parsed) === 'checksum_mismatch') {
        throw new StateStoreError('backup_invalid', 'Backup checksum did not verify.');
      }
      let validated;
      try { validated = validateAndMigrateState(parsed); } catch (error) {
        if (error instanceof StateSchemaError) throw error;
        throw new StateStoreError('backup_invalid', 'Backup failed schema validation.');
      }
      return this._writeValidatedUnsafe(validated, {
        ...options,
        source: 'manual_restore',
        reason: 'manual_restore_from_backup',
        backupReason: 'pre_restore',
        forceBackup: true,
      });
    });
  }
}

module.exports = {
  SNAPSHOT_SCHEMA_VERSION,
  StateStore,
  StateStoreError,
  checksumForState,
  getRevision,
  stableStringify,
};
