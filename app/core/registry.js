(function initMissionControlPodRegistry(global){
  const root = global.MissionControlModules = global.MissionControlModules || {};
  const normalizePodDefinition = root.podContract?.normalizePodDefinition;

  const pods = new Map();

  function register(definition){
    const pod = typeof normalizePodDefinition === 'function'
      ? normalizePodDefinition(definition)
      : definition;
    pods.set(pod.id, pod);
    return pod;
  }

  function get(podId){
    return pods.get(String(podId || '').trim()) || null;
  }

  function list(){
    return [...pods.values()];
  }

  function render(podId, ctx = {}){
    const pod = get(podId);
    if (!pod) return { ok: false, reason: 'not_registered', podId };

    if (typeof pod.canRender === 'function' && !pod.canRender(ctx)) {
      return { ok: false, reason: 'can_render_false', podId };
    }

    pod.render(ctx);
    return { ok: true, podId };
  }

  root.podRegistry = {
    register,
    get,
    list,
    render,
  };
})(window);
