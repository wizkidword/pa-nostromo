(function registerCryptoTrackerPod(global){
  const root = global.MissionControlModules || {};
  const registry = root.podRegistry;
  const debug = root.debug;
  if (!registry || typeof registry.register !== 'function') return;

  let refreshTimer = null;
  const CRYPTO_REFRESH_MS = 15 * 60 * 1000;

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
      debug?.setRefresh?.('crypto-tracker', 'intervalMs', 0);
    }
  }

  function scheduleRefresh(ctx = {}){
    clearRefreshTimer();
    debug?.setRefresh?.('crypto-tracker', 'intervalMs', CRYPTO_REFRESH_MS);
    refreshTimer = setInterval(() => {
      const refreshCtx = {
        ...ctx,
        trigger: 'auto_refresh',
      };
      const renderLegacy = typeof refreshCtx.legacyRender === 'function'
        ? refreshCtx.legacyRender
        : (options) => global.renderCrypto?.(options);
      invokeRender(renderLegacy, 'crypto-tracker', 'auto_refresh_tick');
    }, CRYPTO_REFRESH_MS);
  }

  registry.register({
    id: 'crypto-tracker',
    title: 'Crypto Tracker',
    version: '1.1.1',
    description: 'Phase 1D.1 adapter pod with lifecycle-safe auto-refresh timer management + debug counters.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function'
        ? ctx.legacyRender
        : (options) => global.renderCrypto?.(options);
      invokeRender(renderLegacy, 'crypto-tracker', 'render_call');
    },
    lifecycle: {
      init(ctx = {}){
        scheduleRefresh(ctx);
      },
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function'
          ? ctx.legacyRender
          : (options) => global.renderCrypto?.(options);
        invokeRender(renderLegacy, 'crypto-tracker', ctx.trigger === 'auto_refresh' ? 'auto_refresh_dispatch' : 'refresh_call');
      },
      destroy(){
        clearRefreshTimer();
      },
      mount(){},
      unmount(){},
    },
  });
})(window);
