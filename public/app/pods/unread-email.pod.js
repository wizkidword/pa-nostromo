(function registerUnreadEmailPod(global){
  const root = global.MissionControlModules || {};
  const registry = root.podRegistry;
  const debug = root.debug;
  if (!registry || typeof registry.register !== 'function') return;

  let refreshTimer = null;
  const EMAIL_REFRESH_MS = 3 * 60 * 1000;

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
      debug?.setRefresh?.('unread-email', 'intervalMs', 0);
    }
  }

  function scheduleRefresh(ctx = {}){
    clearRefreshTimer();
    debug?.setRefresh?.('unread-email', 'intervalMs', EMAIL_REFRESH_MS);
    refreshTimer = setInterval(() => {
      const refreshCtx = {
        ...ctx,
        trigger: 'auto_refresh',
      };
      const renderLegacy = typeof refreshCtx.legacyRender === 'function'
        ? refreshCtx.legacyRender
        : (options) => global.renderUnreadEmailPod?.(options);
      invokeRender(renderLegacy, 'unread-email', 'auto_refresh_tick');
    }, EMAIL_REFRESH_MS);
  }

  registry.register({
    id: 'unread-email',
    title: 'Unread Email',
    version: '1.0.0',
    description: 'Unread email tracker with a local-only Gmail Atom feed bridge, status-safe refresh cadence, and setup guidance when credentials are missing.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function'
        ? ctx.legacyRender
        : (options) => global.renderUnreadEmailPod?.(options);
      invokeRender(renderLegacy, 'unread-email', 'render_call');
    },
    lifecycle: {
      init(ctx = {}){
        scheduleRefresh(ctx);
      },
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function'
          ? ctx.legacyRender
          : (options) => global.renderUnreadEmailPod?.(options);
        invokeRender(renderLegacy, 'unread-email', ctx.trigger === 'auto_refresh' ? 'auto_refresh_dispatch' : 'refresh_call');
      },
      destroy(){
        clearRefreshTimer();
      },
      mount(){},
      unmount(){},
    },
  });
})(window);
