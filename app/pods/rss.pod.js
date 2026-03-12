(function registerRssFeedPod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'rss-feed',
    title: 'RSS Feed',
    version: '1.0.0',
    description: 'Phase 1C adapter pod using existing renderRss() implementation.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderRss;
      if (typeof renderLegacy === 'function') renderLegacy();
    },
  });
})(window);
