(function initMissionControlScheduler(global) {
  'use strict';

  function createScheduler(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const setTimer = typeof options.setTimer === 'function' ? options.setTimer : setTimeout;
    const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : clearTimeout;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const isDocumentVisible = typeof options.isDocumentVisible === 'function' ? options.isDocumentVisible : () => !global.document?.hidden;
    const isOnline = typeof options.isOnline === 'function' ? options.isOnline : () => global.navigator?.onLine !== false;
    const jobs = new Map();

    function normalizeId(id) {
      const value = String(id || '').trim();
      if (!value) throw new Error('Scheduler job requires an id.');
      return value;
    }

    function snapshot(runtime) {
      return {
        id: runtime.id,
        enabled: runtime.enabled,
        inFlight: !!runtime.inFlight,
        failures: runtime.failures,
        nextRefreshAt: runtime.nextRefreshAt,
        lastSuccessAt: runtime.lastSuccessAt,
        lastError: runtime.lastError,
      };
    }

    function clearScheduled(runtime) {
      if (runtime.timer) clearTimer(runtime.timer);
      runtime.timer = null;
      runtime.nextRefreshAt = 0;
    }

    function isRunnable(runtime, { manual = false } = {}) {
      if (!runtime.enabled || runtime.definition.enabled?.() === false) return 'disabled';
      if (!isOnline()) return 'offline';
      if (!manual && (!isDocumentVisible() || runtime.definition.visible?.() === false)) return 'hidden';
      return '';
    }

    function intervalFor(runtime) {
      const configuredInterval = typeof runtime.definition.intervalMs === 'function'
        ? runtime.definition.intervalMs()
        : runtime.definition.intervalMs;
      const base = Math.max(0, Number(configuredInterval || 0));
      if (!base) return 0;
      const multiplier = runtime.failures ? Math.min(16, 2 ** runtime.failures) : 1;
      const backoff = Math.min(Number(runtime.definition.maxBackoffMs || 15 * 60 * 1000), base * multiplier);
      const jitterRatio = Math.max(0, Math.min(0.25, Number(runtime.definition.jitterRatio ?? 0.08)));
      const jitter = Math.round(backoff * jitterRatio * random());
      return backoff + jitter;
    }

    function schedule(runtime, delayMs = intervalFor(runtime)) {
      clearScheduled(runtime);
      if (!runtime.enabled || runtime.definition.enabled?.() === false || !delayMs) return;
      runtime.nextRefreshAt = now() + delayMs;
      runtime.timer = setTimer(() => {
        runtime.timer = null;
        runtime.nextRefreshAt = 0;
        void refresh(runtime.id).catch(() => {});
      }, delayMs);
    }

    function refresh(id, options = {}) {
      const runtime = jobs.get(normalizeId(id));
      if (!runtime) return Promise.resolve({ ok: false, reason: 'not_registered', id: String(id || '') });
      const blockedReason = isRunnable(runtime, options);
      if (blockedReason) {
        if (blockedReason === 'disabled') clearScheduled(runtime);
        return Promise.resolve({ ok: false, reason: blockedReason, ...snapshot(runtime) });
      }
      if (runtime.inFlight) return runtime.inFlight;

      clearScheduled(runtime);
      const controller = new AbortController();
      runtime.controller = controller;
      runtime.inFlight = Promise.resolve()
        .then(() => runtime.definition.run({ signal: controller.signal, manual: !!options.manual, reason: options.reason || 'scheduled' }))
        .then((value) => {
          runtime.failures = 0;
          runtime.lastError = '';
          runtime.lastSuccessAt = now();
          return { ok: true, value, ...snapshot(runtime) };
        })
        .catch((error) => {
          runtime.failures += 1;
          runtime.lastError = String(error?.message || error || 'refresh_failed');
          throw error;
        })
        .finally(() => {
          runtime.inFlight = null;
          runtime.controller = null;
          if (runtime.enabled) schedule(runtime);
        });
      return runtime.inFlight;
    }

    function register(id, definition = {}) {
      const key = normalizeId(id);
      if (jobs.has(key)) throw new Error(`Scheduler job "${key}" is already registered.`);
      if (typeof definition.run !== 'function') throw new Error(`Scheduler job "${key}" requires run().`);
      const runtime = {
        id: key,
        definition,
        enabled: definition.enabled?.() !== false,
        timer: null,
        controller: null,
        inFlight: null,
        failures: 0,
        nextRefreshAt: 0,
        lastSuccessAt: 0,
        lastError: '',
      };
      jobs.set(key, runtime);
      return snapshot(runtime);
    }

    function start(id, { immediate = false } = {}) {
      const runtime = jobs.get(normalizeId(id));
      if (!runtime) return { ok: false, reason: 'not_registered' };
      runtime.enabled = true;
      if (immediate) return refresh(runtime.id, { reason: 'start' });
      schedule(runtime);
      return { ok: true, ...snapshot(runtime) };
    }

    function stop(id, { abort = true } = {}) {
      const runtime = jobs.get(normalizeId(id));
      if (!runtime) return { ok: false, reason: 'not_registered' };
      runtime.enabled = false;
      clearScheduled(runtime);
      if (abort) runtime.controller?.abort();
      return { ok: true, ...snapshot(runtime) };
    }

    function setEnabled(id, enabled) {
      return enabled ? start(id) : stop(id);
    }

    function destroy() {
      for (const id of jobs.keys()) stop(id);
      jobs.clear();
    }

    return {
      register,
      start,
      stop,
      setEnabled,
      refresh,
      get: (id) => jobs.has(String(id || '').trim()) ? snapshot(jobs.get(String(id || '').trim())) : null,
      list: () => [...jobs.values()].map(snapshot),
      destroy,
    };
  }

  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.scheduler = { createScheduler };
  if (typeof module !== 'undefined' && module.exports) module.exports = { createScheduler };
})(typeof window !== 'undefined' ? window : globalThis);
