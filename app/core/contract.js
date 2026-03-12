(function initMissionControlPodContract(global){
  const root = global.MissionControlModules = global.MissionControlModules || {};

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

    return {
      id,
      version: String(definition.version || '1.0.0'),
      title: String(definition.title || id),
      description: String(definition.description || ''),
      render: definition.render,
      canRender: typeof definition.canRender === 'function' ? definition.canRender : null,
    };
  }

  root.podContract = {
    normalizePodDefinition,
  };
})(window);
