(function registerCryptoTrackerPod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  let refreshTimer = null;
  const CRYPTO_REFRESH_MS = 15 * 60 * 1000;

  function clearRefreshTimer(){
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleRefresh(ctx = {}){
    clearRefreshTimer();
    refreshTimer = setInterval(() => {
      const refreshCtx = {
        ...ctx,
        trigger: 'auto_refresh',
      };
      const renderLegacy = typeof refreshCtx.legacyRender === 'function'
        ? refreshCtx.legacyRender
        : (options) => global.renderCrypto?.(options);
      if (typeof renderLegacy === 'function') renderLegacy();
    }, CRYPTO_REFRESH_MS);
  }

  registry.register({
    id: 'crypto-tracker',
    title: 'Crypto Tracker',
    version: '1.1.0',
    description: 'Phase 1D adapter pod with lifecycle-safe auto-refresh timer management.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function'
        ? ctx.legacyRender
        : (options) => global.renderCrypto?.(options);
      if (typeof renderLegacy === 'function') renderLegacy();
    },
    lifecycle: {
      init(ctx = {}){
        scheduleRefresh(ctx);
      },
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function'
          ? ctx.legacyRender
          : (options) => global.renderCrypto?.(options);
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
