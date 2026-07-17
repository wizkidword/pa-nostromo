(function initMissionControlActionStore(global) {
  'use strict';

  function normalizeAreas(value) {
    const source = Array.isArray(value) ? value : [value];
    return [...new Set(source.map((area) => String(area || '').trim()).filter(Boolean))];
  }

  function createActionStore(options = {}) {
    if (typeof options.getState !== 'function') throw new Error('Action store requires getState().');
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    const persist = typeof options.persist === 'function' ? options.persist : null;
    const listeners = new Map();
    const allListeners = new Set();
    const statusListeners = new Set();
    let revision = Number.isSafeInteger(options.initialRevision) ? options.initialRevision : 0;
    let saveStatus = {
      state: 'saved',
      revision,
      changedAreas: [],
      updatedAt: now(),
      lastSavedAt: '',
      error: '',
    };

    function emitStatus() {
      const snapshot = { ...saveStatus, changedAreas: [...saveStatus.changedAreas] };
      statusListeners.forEach((listener) => listener(snapshot));
    }

    function updateSaveStatus(next = {}) {
      saveStatus = {
        ...saveStatus,
        ...next,
        revision,
        changedAreas: normalizeAreas(next.changedAreas ?? saveStatus.changedAreas),
        updatedAt: now(),
      };
      emitStatus();
      return { ...saveStatus, changedAreas: [...saveStatus.changedAreas] };
    }

    function notify(record) {
      for (const area of record.changedAreas) {
        listeners.get(area)?.forEach((listener) => listener(record));
      }
      allListeners.forEach((listener) => listener(record));
    }

    function subscribe(area, listener) {
      if (typeof listener !== 'function') throw new Error('Action store subscriber must be a function.');
      const key = String(area || '').trim();
      if (!key) throw new Error('Action store subscription requires an area.');
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(listener);
      return () => listeners.get(key)?.delete(listener);
    }

    function subscribeAll(listener) {
      if (typeof listener !== 'function') throw new Error('Action store subscriber must be a function.');
      allListeners.add(listener);
      return () => allListeners.delete(listener);
    }

    function subscribeSaveStatus(listener) {
      if (typeof listener !== 'function') throw new Error('Action store status subscriber must be a function.');
      statusListeners.add(listener);
      listener({ ...saveStatus, changedAreas: [...saveStatus.changedAreas] });
      return () => statusListeners.delete(listener);
    }

    function dispatch(action = {}) {
      const type = String(action.type || '').trim();
      if (!type) throw new Error('Action store dispatch requires an action type.');
      const changedAreas = normalizeAreas(action.changedAreas || action.area || type.split('/')[0]);
      if (!changedAreas.length) throw new Error(`Action "${type}" must declare a changed area.`);
      const currentState = options.getState();
      const result = typeof action.reduce === 'function' ? action.reduce(currentState, action) : undefined;
      if (result === false) return { applied: false, type, changedAreas, revision };

      revision += 1;
      const record = {
        applied: true,
        type,
        reason: String(action.reason || type),
        changedAreas,
        revision,
        state: currentState,
        result,
      };
      notify(record);

      if (action.persist !== false && persist) {
        updateSaveStatus({ state: 'saving', changedAreas, error: '' });
        let persistResult;
        try {
          persistResult = persist(record);
        } catch (error) {
          updateSaveStatus({ state: 'failed', changedAreas, error: String(error?.message || error) });
          return record;
        }
        Promise.resolve(persistResult).then((outcome) => {
          if (outcome === false) return updateSaveStatus({ state: 'offline', changedAreas, error: '' });
          return updateSaveStatus({ state: 'saved', changedAreas, lastSavedAt: now(), error: '' });
        }).catch((error) => {
          updateSaveStatus({ state: 'failed', changedAreas, error: String(error?.message || error) });
        });
      }

      return record;
    }

    function markPersistence(state, details = {}) {
      const nextState = String(state || '').trim();
      if (!['saving', 'saved', 'offline', 'conflict', 'failed'].includes(nextState)) {
        throw new Error(`Unknown persistence state: ${nextState}`);
      }
      return updateSaveStatus({ state: nextState, ...details });
    }

    return {
      dispatch,
      subscribe,
      subscribeAll,
      subscribeSaveStatus,
      markPersistence,
      getRevision: () => revision,
      getSaveStatus: () => ({ ...saveStatus, changedAreas: [...saveStatus.changedAreas] }),
    };
  }

  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.actionStore = { createActionStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = { createActionStore };
})(typeof window !== 'undefined' ? window : globalThis);
