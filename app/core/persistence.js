(function initMissionControlPersistence(global){
  const root = global.MissionControlModules = global.MissionControlModules || {};

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

  root.persistence = {
    createPersistenceAdapter,
  };
})(window);
