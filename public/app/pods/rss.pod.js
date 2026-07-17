(function registerRssFeedPod(global){
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
      throw new Error(`RSS Feed pod ${reason} failed.`);
    }
  }

  registry.register({
    id: 'rss-feed',
    title: 'RSS Feed',
    version: '2.1.0',
    description: 'RSS Feed with feature-owned state, editorial cards, and shared-scheduler refresh cadence.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function'
        ? ctx.legacyRender
        : (options) => global.renderRss?.(options);
      return invokeRender(renderLegacy, 'rss-feed', 'render_call');
    },
    lifecycle: {
      init(){},
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function'
          ? ctx.legacyRender
          : (options) => global.renderRss?.(options);
        return invokeRender(renderLegacy, 'rss-feed', ctx.trigger === 'scheduled' ? 'scheduler_refresh' : 'refresh_call');
      },
      destroy(){},
      mount(){},
      unmount(){},
    },
  });
})(window);
