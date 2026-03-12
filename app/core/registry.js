(function initMissionControlPodRegistry(global){
  const root = global.MissionControlModules = global.MissionControlModules || {};
  const normalizePodDefinition = root.podContract?.normalizePodDefinition;
  const debug = root.debug;

  const pods = new Map();
  const runtimes = new Map();

  function ensureRuntime(podId){
    const key = String(podId || '').trim();
    if (!runtimes.has(key)) {
      runtimes.set(key, {
        initialized: false,
        mounted: false,
      });
    }
    return runtimes.get(key);
  }

  function callHook(hook, ctx, fallback = null){
    if (typeof hook === 'function') return hook(ctx);
    if (typeof fallback === 'function') return fallback(ctx);
    return undefined;
  }

  function runSafely(podId, phase, fn){
    try {
      return { ok: true, value: fn() };
    } catch (error) {
      return {
        ok: false,
        error,
        reason: 'hook_error',
        phase,
        podId,
      };
    }
  }

  function register(definition){
    const pod = typeof normalizePodDefinition === 'function'
      ? normalizePodDefinition(definition)
      : definition;
    pods.set(pod.id, pod);
    ensureRuntime(pod.id);
    return pod;
  }

  function get(podId){
    return pods.get(String(podId || '').trim()) || null;
  }

  function list(){
    return [...pods.values()];
  }

  function init(podId, ctx = {}){
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };

    const runtime = ensureRuntime(pod.id);
    if (runtime.initialized) return { ok: true, podId: pod.id, phase: 'init', skipped: true };

    const out = runSafely(pod.id, 'init', () => callHook(pod.lifecycle?.init, ctx));
    if (!out.ok) return out;

    runtime.initialized = true;
    debug?.bumpLifecycle?.(pod.id, 'init');
    return { ok: true, podId: pod.id, phase: 'init' };
  }

  function mount(podId, ctx = {}){
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };

    if (typeof pod.canRender === 'function' && !pod.canRender(ctx)) {
      return { ok: false, reason: 'can_render_false', podId: pod.id };
    }

    const runtime = ensureRuntime(pod.id);

    if (!runtime.initialized) {
      const initResult = init(pod.id, ctx);
      if (!initResult?.ok) return initResult;
    }

    const renderResult = runSafely(pod.id, 'refresh', () => callHook(pod.lifecycle?.refresh, ctx, pod.render));
    if (!renderResult.ok) return renderResult;

    if (!runtime.mounted) {
      const mountResult = runSafely(pod.id, 'mount', () => callHook(pod.lifecycle?.mount, ctx));
      if (!mountResult.ok) return mountResult;
      runtime.mounted = true;
      debug?.bumpLifecycle?.(pod.id, 'mount');
    }

    debug?.bumpRefresh?.(pod.id, 'registry_render');
    return { ok: true, podId: pod.id, phase: 'mount' };
  }

  function refresh(podId, ctx = {}){
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };

    const runtime = ensureRuntime(pod.id);
    if (!runtime.initialized) {
      const initResult = init(pod.id, ctx);
      if (!initResult?.ok) return initResult;
    }

    const out = runSafely(pod.id, 'refresh', () => callHook(pod.lifecycle?.refresh, ctx, pod.render));
    if (!out.ok) return out;

    debug?.bumpRefresh?.(pod.id, 'registry_refresh');
    return { ok: true, podId: pod.id, phase: 'refresh' };
  }

  function unmount(podId, ctx = {}){
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };

    const runtime = ensureRuntime(pod.id);
    if (!runtime.mounted) return { ok: true, podId: pod.id, phase: 'unmount', skipped: true };

    const out = runSafely(pod.id, 'unmount', () => callHook(pod.lifecycle?.unmount, ctx));
    if (!out.ok) return out;

    runtime.mounted = false;
    debug?.bumpLifecycle?.(pod.id, 'unmount');
    return { ok: true, podId: pod.id, phase: 'unmount' };
  }

  function destroy(podId, ctx = {}){
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };

    const runtime = ensureRuntime(pod.id);
    if (runtime.mounted) {
      const unmountResult = unmount(pod.id, ctx);
      if (!unmountResult?.ok) return unmountResult;
    }

    if (!runtime.initialized) return { ok: true, podId: pod.id, phase: 'destroy', skipped: true };

    const out = runSafely(pod.id, 'destroy', () => callHook(pod.lifecycle?.destroy, ctx));
    if (!out.ok) return out;

    runtime.initialized = false;
    debug?.bumpLifecycle?.(pod.id, 'destroy');
    return { ok: true, podId: pod.id, phase: 'destroy' };
  }

  function render(podId, ctx = {}){
    return mount(podId, ctx);
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
    render,
  };
})(window);
