'use strict';

function createStateApiHandler({
  stateStore,
  sendJson,
  readBody,
  actionBodyLimit,
  stateBodyLimit,
  StateStoreError,
  StateSchemaError,
  isPayloadTooLargeError,
  sendPayloadTooLarge,
  deepClone,
}) {
  function stateRichnessScore(state) {
    const arrLen = (value) => Array.isArray(value) ? value.length : 0;
    return (
      arrLen(state?.tasks) * 5
      + arrLen(state?.notes) * 3
      + arrLen(state?.ideas) * 2
      + arrLen(state?.reminders)
      + arrLen(state?.shortcuts) * 2
      + arrLen(state?.changelog)
    );
  }

  function parseExpectedStateRevision(req, body) {
    const header = String(req.headers['if-match'] || '').trim();
    const fallback = body?.__writeControl?.expectedRevision;
    const supplied = header || (fallback == null ? '' : String(fallback).trim());
    if (!supplied) return undefined;
    const match = supplied.match(/^(?:W\/)?"?(\d+)"?$/i);
    if (!match) throw new StateStoreError('invalid_revision', 'If-Match must be a non-negative integer revision.');
    const revision = Number(match[1]);
    if (!Number.isSafeInteger(revision)) throw new StateStoreError('invalid_revision', 'If-Match revision is not safe.');
    return revision;
  }

  function sendStateStoreError(res, err, { restore = false } = {}) {
    if (err instanceof StateStoreError) {
      if (err.code === 'revision_conflict') {
        return sendJson(res, 409, { ok: false, error: 'state_revision_conflict', message: err.message, currentRevision: err.details?.currentRevision });
      }
      if (err.code === 'state_downgrade_blocked') {
        return sendJson(res, 409, { ok: false, error: err.code, message: err.message, ...err.details });
      }
      if (err.code === 'revision_required') {
        return sendJson(res, 428, { ok: false, error: 'state_revision_required', message: err.message, currentRevision: err.details?.currentRevision });
      }
      if (err.code === 'invalid_revision' || err.code === 'invalid_backup_file') {
        return sendJson(res, 400, { ok: false, error: err.code, message: err.message });
      }
      return sendJson(res, restore ? 400 : 500, { ok: false, error: restore ? 'restore_failed' : err.code, message: err.message });
    }
    if (err instanceof StateSchemaError) {
      const status = err.code === 'unsupported_future_schema' ? 409 : 422;
      return sendJson(res, status, { ok: false, error: err.code, message: err.message });
    }
    return sendJson(res, restore ? 400 : 500, { ok: false, error: restore ? 'restore_failed' : 'state_unavailable', message: String(err?.message || err) });
  }

  return async function handleApiState(req, res) {
    const pathname = new URL(req.url || '/api/state', 'http://localhost').pathname;

    if (pathname === '/api/state/backups') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
      try {
        const backups = await stateStore.listBackups();
        return sendJson(res, 200, { ok: true, backups: backups.map(({ mtimeMs, ...rest }) => rest) });
      } catch (err) {
        return sendStateStoreError(res, err);
      }
    }

    if (pathname === '/api/state/restore') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
      try {
        const body = await readBody(req, { maxBytes: actionBodyLimit });
        const parsed = JSON.parse(body || '{}');
        const result = await stateStore.restore(parsed?.backupFile, {
          expectedRevision: parseExpectedStateRevision(req, parsed),
        });
        return sendJson(res, 200, {
          ok: true,
          restoredFrom: String(parsed?.backupFile || ''),
          preRestoreSnapshot: result.backupFile,
          savedAt: result.integrity.savedAt,
          checksum: result.integrity.checksum,
          revision: result.integrity.revision,
          schemaVersion: result.integrity.stateSchemaVersion,
        });
      } catch (err) {
        if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
        return sendStateStoreError(res, err, { restore: true });
      }
    }

    if (pathname !== '/api/state') return sendJson(res, 404, { error: 'not_found' });

    if (req.method === 'GET') {
      try {
        const result = await stateStore.load();
        if (!result.state) {
          if (result.integrity === 'not_found') return sendJson(res, 404, { error: 'state_not_found' });
          return sendJson(res, 409, { ok: false, error: 'state_corrupt_quarantined', message: 'Invalid saved state was quarantined; a new state can be created.' });
        }
        return sendJson(res, 200, result.state);
      } catch (err) {
        return sendStateStoreError(res, err);
      }
    }

    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

    try {
      const body = await readBody(req, { maxBytes: stateBodyLimit });
      const parsed = JSON.parse(body || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return sendJson(res, 400, { error: 'invalid_json', message: 'State payload must be an object.' });
      }

      const overrideDowngrade = parsed?.__writeControl?.overrideDowngrade === true;
      const source = String(parsed?.__writeControl?.source || '').trim();
      const explicitLiveOverride = parsed?.__writeControl?.explicitLiveOverride === true;
      const allowOverride = overrideDowngrade && (
        source === 'manual_restore'
        || source === 'manual_import'
        || source === 'conflict_overwrite'
        || (source === 'qa_script' && explicitLiveOverride)
      );
      if (source === 'qa_script' && !explicitLiveOverride) {
        return sendJson(res, 409, {
          ok: false,
          error: 'qa_override_requires_explicit_opt_in',
          message: 'QA/script overwrite is blocked unless __writeControl.explicitLiveOverride=true.',
        });
      }

      const cleanIncoming = deepClone(parsed);
      delete cleanIncoming.__writeControl;
      const result = await stateStore.write(cleanIncoming, {
        expectedRevision: parseExpectedStateRevision(req, parsed),
        source: source || 'api_state_post',
        reason: 'api_state_post',
        validateCurrent: (current, incoming) => {
          if (!current) return;
          const incomingScore = stateRichnessScore(incoming);
          const currentScore = stateRichnessScore(current);
          if (currentScore >= 20 && incomingScore <= Math.floor(currentScore * 0.35) && !allowOverride) {
            throw new StateStoreError('state_downgrade_blocked', 'Incoming state looks much smaller than current shared state; write blocked to prevent accidental data loss.', { currentScore, incomingScore });
          }
        },
      });
      return sendJson(res, 200, {
        ok: true,
        savedAt: result.integrity.savedAt,
        checksum: result.integrity.checksum,
        revision: result.integrity.revision,
        schemaVersion: result.integrity.stateSchemaVersion,
        previousStateIntegrity: result.previousStateIntegrity,
        backupFile: result.backupFile,
      });
    } catch (err) {
      if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
      return sendStateStoreError(res, err);
    }
  };
}

module.exports = { createStateApiHandler };
