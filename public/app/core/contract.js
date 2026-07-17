(function initMissionControlPodContract(global){
  const root = global.MissionControlModules = global.MissionControlModules || {};

  function normalizeHook(fn){
    return typeof fn === 'function' ? fn : null;
  }

  function normalizePodDefinition(definition){
    if (!definition || typeof definition !== 'object') {
      throw new Error('Pod definition must be an object.');
    }

    const id = String(definition.id || '').trim();
    if (!id) {
      throw new Error('Pod definition requires a stable id.');
    }

    if (typeof definition.render !== 'function') {
      throw new Error(`Pod "${id}" must provide a render(ctx) function.`);
    }

    const lifecycleInput = definition.lifecycle && typeof definition.lifecycle === 'object'
      ? definition.lifecycle
      : {};

    const lifecycle = {
      init: normalizeHook(definition.init || lifecycleInput.init),
      destroy: normalizeHook(definition.destroy || lifecycleInput.destroy),
      refresh: normalizeHook(definition.refresh || lifecycleInput.refresh || definition.render),
      mount: normalizeHook(definition.mount || lifecycleInput.mount),
      unmount: normalizeHook(definition.unmount || lifecycleInput.unmount),
    };

    return {
      id,
      version: String(definition.version || '1.0.0'),
      title: String(definition.title || id),
      description: String(definition.description || ''),
      render: definition.render,
      canRender: typeof definition.canRender === 'function' ? definition.canRender : null,
      lifecycle,
    };
  }

  root.podContract = {
    normalizePodDefinition,
  };
})(typeof window !== 'undefined' ? window : globalThis);
