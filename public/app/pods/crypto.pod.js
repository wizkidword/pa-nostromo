(function registerCryptoTrackerPod(global){
  const root = global.MissionControlModules || {};
  const registry = root.podRegistry;
  const debug = root.debug;
  if (!registry || typeof registry.register !== 'function') return;

  async function invokeRender(renderLegacy, podId, reason){
    if (typeof renderLegacy !== 'function') return;
    try {
      const out = renderLegacy();
      if (out && typeof out.then === 'function') await out;
      debug?.bumpRefresh?.(podId, reason);
      return out;
    } catch {
      debug?.bumpRefresh?.(podId, 'refresh_failed');
      throw new Error(`Crypto Tracker pod ${reason} failed.`);
    }
  }

  registry.register({
    id: 'crypto-tracker',
    title: 'Crypto Tracker',
    version: '2.1.0',
    description: 'Crypto Tracker with shared-scheduler refresh cadence and richer portfolio snapshot UI.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function'
        ? ctx.legacyRender
        : (options) => global.renderCrypto?.(options);
      return invokeRender(renderLegacy, 'crypto-tracker', 'render_call');
    },
    lifecycle: {
      init(){},
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function'
          ? ctx.legacyRender
          : (options) => global.renderCrypto?.(options);
        return invokeRender(renderLegacy, 'crypto-tracker', ctx.trigger === 'scheduled' ? 'scheduler_refresh' : 'refresh_call');
      },
      destroy(){},
      mount(){},
      unmount(){},
    },
  });
})(window);
