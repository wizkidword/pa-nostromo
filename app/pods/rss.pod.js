(function registerRssFeedPod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  let refreshTimer = null;

  function clearRefreshTimer(){
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleRefresh(ctx = {}){
    clearRefreshTimer();
    const minsRaw = Number(ctx.state?.rss?.refreshIntervalMin || 60);
    const mins = Number.isFinite(minsRaw) ? Math.max(5, minsRaw) : 60;
    refreshTimer = setInterval(() => {
      const refreshCtx = {
        ...ctx,
        trigger: 'auto_refresh',
      };
      const renderLegacy = typeof refreshCtx.legacyRender === 'function'
        ? refreshCtx.legacyRender
        : (options) => global.renderRss?.(options);
      if (typeof renderLegacy === 'function') renderLegacy();
    }, mins * 60 * 1000);
  }

  registry.register({
    id: 'rss-feed',
    title: 'RSS Feed',
    version: '1.1.0',
    description: 'Phase 1D adapter pod with lifecycle-safe auto-refresh timer management.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function'
        ? ctx.legacyRender
        : (options) => global.renderRss?.(options);
      if (typeof renderLegacy === 'function') renderLegacy();
    },
    lifecycle: {
      init(ctx = {}){
        scheduleRefresh(ctx);
      },
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function'
          ? ctx.legacyRender
          : (options) => global.renderRss?.(options);
        if (typeof renderLegacy === 'function') renderLegacy();
      },
      destroy(){
        clearRefreshTimer();
      },
      mount(){},
      unmount(){},
    },
  });
})(window);
