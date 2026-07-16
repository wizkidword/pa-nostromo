(function registerNbaScoresPod(global){
  const root = global.MissionControlModules || {};
  const registry = root.podRegistry;
  const debug = root.debug;
  if (!registry || typeof registry.register !== 'function') return;

  let refreshTimer = null;
  const NBA_REFRESH_MS = 60 * 1000;

  function invokeRender(renderLegacy, podId, reason){
    if (typeof renderLegacy !== 'function') return;
    try {
      const out = renderLegacy();
      if (out && typeof out.then === 'function') out.catch(() => {});
      debug?.bumpRefresh?.(podId, reason);
    } catch {}
  }

  function clearRefreshTimer(){
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
      debug?.setRefresh?.('nba-scores', 'intervalMs', 0);
    }
  }

  function scheduleRefresh(ctx = {}){
    clearRefreshTimer();
    debug?.setRefresh?.('nba-scores', 'intervalMs', NBA_REFRESH_MS);
    refreshTimer = setInterval(() => {
      const refreshCtx = {
        ...ctx,
        trigger: 'auto_refresh',
      };
      const renderLegacy = typeof refreshCtx.legacyRender === 'function' ? refreshCtx.legacyRender : global.renderNbaScores;
      invokeRender(renderLegacy, 'nba-scores', 'auto_refresh_tick');
    }, NBA_REFRESH_MS);
  }

  registry.register({
    id: 'nba-scores',
    title: 'NBA Scores',
    version: '2.0.0',
    description: 'NBA Scores 2.0 adapter with lifecycle-safe 1-minute auto-refresh for favorites-first scoreboard views.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderNbaScores;
      invokeRender(renderLegacy, 'nba-scores', 'render_call');
    },
    lifecycle: {
      init(ctx = {}){
        scheduleRefresh(ctx);
      },
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderNbaScores;
        invokeRender(renderLegacy, 'nba-scores', ctx.trigger === 'auto_refresh' ? 'auto_refresh_dispatch' : 'refresh_call');
      },
      destroy(){
        clearRefreshTimer();
      },
      mount(){},
      unmount(){},
    },
  });
})(window);
