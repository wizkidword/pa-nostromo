(function initMissionControlPodRegistry(global) {
  'use strict';

  const root = global.MissionControlModules = global.MissionControlModules || {};
  const normalizePodDefinition = root.podContract?.normalizePodDefinition;
  const debug = root.debug;
  const pods = new Map();
  const runtimes = new Map();

  function ensureRuntime(podId) {
    const key = String(podId || '').trim();
    if (!runtimes.has(key)) {
      runtimes.set(key, {
        initialized: false,
        mounted: false,
        initPromise: null,
        mountPromise: null,
        refreshPromise: null,
        destroyPromise: null,
        lastError: null,
      });
    }
    return runtimes.get(key);
  }

  async function callHook(hook, ctx, fallback = null) {
    if (typeof hook === 'function') return hook(ctx);
    if (typeof fallback === 'function') return fallback(ctx);
    return undefined;
  }

  async function runSafely(podId, phase, fn, runtime) {
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (error) {
      runtime.lastError = error;
      return { ok: false, error, reason: 'hook_error', phase, podId };
    }
  }

  function register(definition) {
    const pod = typeof normalizePodDefinition === 'function' ? normalizePodDefinition(definition) : definition;
    if (pods.has(pod.id)) throw new Error(`Pod "${pod.id}" is already registered.`);
    pods.set(pod.id, pod);
    ensureRuntime(pod.id);
    return pod;
  }

  function get(podId) {
    return pods.get(String(podId || '').trim()) || null;
  }

  function list() {
    return [...pods.values()];
  }

  async function init(podId, ctx = {}) {
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };
    const runtime = ensureRuntime(pod.id);
    if (runtime.initialized) return { ok: true, podId: pod.id, phase: 'init', skipped: true };
    if (runtime.initPromise) return runtime.initPromise;
    runtime.initPromise = (async () => {
      const out = await runSafely(pod.id, 'init', () => callHook(pod.lifecycle?.init, ctx), runtime);
      if (!out.ok) return out;
      runtime.initialized = true;
      debug?.bumpLifecycle?.(pod.id, 'init');
      return { ok: true, podId: pod.id, phase: 'init' };
    })().finally(() => { runtime.initPromise = null; });
    return runtime.initPromise;
  }

  async function refresh(podId, ctx = {}) {
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };
    const runtime = ensureRuntime(pod.id);
    const initResult = await init(pod.id, ctx);
    if (!initResult?.ok) return initResult;
    if (runtime.refreshPromise) return runtime.refreshPromise;
    runtime.refreshPromise = (async () => {
      const out = await runSafely(pod.id, 'refresh', () => callHook(pod.lifecycle?.refresh, ctx, pod.render), runtime);
      if (!out.ok) return out;
      debug?.bumpRefresh?.(pod.id, 'registry_refresh');
      return { ok: true, podId: pod.id, phase: 'refresh' };
    })().finally(() => { runtime.refreshPromise = null; });
    return runtime.refreshPromise;
  }

  async function mount(podId, ctx = {}) {
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };
    if (typeof pod.canRender === 'function' && !pod.canRender(ctx)) return { ok: false, reason: 'can_render_false', podId: pod.id };
    const runtime = ensureRuntime(pod.id);
    if (runtime.mountPromise) return runtime.mountPromise;
    runtime.mountPromise = (async () => {
      const refreshResult = await refresh(pod.id, ctx);
      if (!refreshResult?.ok) return refreshResult;
      if (runtime.mounted) return { ok: true, podId: pod.id, phase: 'mount', skipped: true };
      const out = await runSafely(pod.id, 'mount', () => callHook(pod.lifecycle?.mount, ctx), runtime);
      if (!out.ok) return out;
      runtime.mounted = true;
      debug?.bumpLifecycle?.(pod.id, 'mount');
      return { ok: true, podId: pod.id, phase: 'mount' };
    })().finally(() => { runtime.mountPromise = null; });
    return runtime.mountPromise;
  }

  async function unmount(podId, ctx = {}) {
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };
    const runtime = ensureRuntime(pod.id);
    if (runtime.mountPromise) await runtime.mountPromise;
    if (!runtime.mounted) return { ok: true, podId: pod.id, phase: 'unmount', skipped: true };
    const out = await runSafely(pod.id, 'unmount', () => callHook(pod.lifecycle?.unmount, ctx), runtime);
    if (!out.ok) return out;
    runtime.mounted = false;
    debug?.bumpLifecycle?.(pod.id, 'unmount');
    return { ok: true, podId: pod.id, phase: 'unmount' };
  }

  async function destroy(podId, ctx = {}) {
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };
    const runtime = ensureRuntime(pod.id);
    if (runtime.destroyPromise) return runtime.destroyPromise;
    runtime.destroyPromise = (async () => {
      const unmountResult = await unmount(pod.id, ctx);
      if (!unmountResult?.ok) return unmountResult;
      if (!runtime.initialized) return { ok: true, podId: pod.id, phase: 'destroy', skipped: true };
      const out = await runSafely(pod.id, 'destroy', () => callHook(pod.lifecycle?.destroy, ctx), runtime);
      if (!out.ok) return out;
      runtime.initialized = false;
      runtime.lastError = null;
      debug?.bumpLifecycle?.(pod.id, 'destroy');
      return { ok: true, podId: pod.id, phase: 'destroy' };
    })().finally(() => { runtime.destroyPromise = null; });
    return runtime.destroyPromise;
  }

  root.podRegistry = {
    register,
    get,
    list,
    init,
    mount,
    refresh,
    unmount,
    destroy,
    render: mount,
    getRuntime: (podId) => {
      const runtime = runtimes.get(String(podId || '').trim());
      return runtime ? { initialized: runtime.initialized, mounted: runtime.mounted, lastError: runtime.lastError } : null;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
