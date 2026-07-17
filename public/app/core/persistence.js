(function initMissionControlPersistence(global){
  'use strict';

  const root = global.MissionControlModules = global.MissionControlModules || {};

  function createCoalescedPersistence(options = {}){
    if (typeof options.run !== 'function') throw new Error('Coalesced persistence requires run().');
    const delayMs = Math.max(0, Number(options.delayMs ?? 250));
    const setTimer = typeof options.setTimer === 'function' ? options.setTimer : setTimeout;
    const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : clearTimeout;
    const onError = typeof options.onError === 'function' ? options.onError : null;
    let timer = null;
    let pending = null;
    let active = null;

    function flush(){
      if (timer) clearTimer(timer);
      timer = null;
      if (active) return active;
      const next = pending;
      pending = null;
      if (!next) return active || Promise.resolve(false);
      try {
        active = Promise.resolve(options.run(next.payload, next.reason));
      } catch (error) {
        active = Promise.reject(error);
      }
      active = active.then(
        (value) => value,
        (error) => {
          onError?.(error, next);
          return false;
        },
      ).finally(() => {
        active = null;
        if (pending && !timer) void flush();
      });
      return active;
    }

    function schedule(payload, reason = 'unspecified'){
      pending = { payload, reason: String(reason || 'unspecified') };
      if (timer) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        void flush();
      }, delayMs);
      return { queued: true, reason: pending.reason };
    }

    function cancel(){
      if (timer) clearTimer(timer);
      timer = null;
      pending = null;
    }

    return {
      schedule,
      flush,
      cancel,
      get pending(){ return !!pending; },
      get active(){ return !!active; },
    };
  }

  function createPersistenceAdapter(options = {}){
    const readLocal = typeof options.readLocal === 'function' ? options.readLocal : null;
    const writeLocal = typeof options.writeLocal === 'function' ? options.writeLocal : null;
    const pushShared = typeof options.pushShared === 'function' ? options.pushShared : null;

    return {
      readLocal,
      writeLocal,
      pushShared,
      persist(nextState, reason = 'unspecified'){
        if (writeLocal) writeLocal(nextState, reason);
        if (pushShared) pushShared(nextState, reason);
      },
    };
  }

  root.persistence = { createCoalescedPersistence, createPersistenceAdapter };
  if (typeof module !== 'undefined' && module.exports) module.exports = { createCoalescedPersistence, createPersistenceAdapter };
})(typeof window !== 'undefined' ? window : globalThis);
