(function registerWeatherPod(global){
  const root = global.MissionControlModules || {};
  const registry = root.podRegistry;
  const debug = root.debug;
  if (!registry || typeof registry.register !== 'function') return;

  let refreshTimer = null;

  function invokeRender(renderLegacy, podId, reason){
    if (typeof renderLegacy !== 'function') return;
    try {
      const out = renderLegacy();
      if (out && typeof out.then === 'function') {
        out.catch(() => {});
      }
      debug?.bumpRefresh?.(podId, reason);
    } catch {
      // Prevent noisy uncaught errors from pod timers.
    }
  }

  function clearRefreshTimer(){
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
      debug?.setRefresh?.('weather', 'intervalMs', 0);
    }
  }

  function scheduleRefresh(ctx = {}){
    clearRefreshTimer();
    const minsRaw = Number(ctx.state?.settings?.weatherIntervalMin || 15);
    const mins = Number.isFinite(minsRaw) ? Math.max(1, minsRaw) : 15;
    const intervalMs = mins * 60 * 1000;
    debug?.setRefresh?.('weather', 'intervalMs', intervalMs);
    refreshTimer = setInterval(() => {
      const refreshCtx = {
        ...ctx,
        trigger: 'auto_refresh',
      };
      const renderLegacy = typeof refreshCtx.legacyRender === 'function' ? refreshCtx.legacyRender : global.renderWeather;
      invokeRender(renderLegacy, 'weather', 'auto_refresh_tick');
    }, intervalMs);
  }

  registry.register({
    id: 'weather',
    title: 'Weather',
    version: '1.1.1',
    description: 'Phase 1D.1 adapter pod with lifecycle-safe auto-refresh timer management + debug counters.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderWeather;
      invokeRender(renderLegacy, 'weather', 'render_call');
    },
    lifecycle: {
      init(ctx = {}){
        scheduleRefresh(ctx);
      },
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderWeather;
        invokeRender(renderLegacy, 'weather', ctx.trigger === 'auto_refresh' ? 'auto_refresh_dispatch' : 'refresh_call');
      },
      destroy(){
        clearRefreshTimer();
      },
      mount(){},
      unmount(){},
    },
  });
})(window);
