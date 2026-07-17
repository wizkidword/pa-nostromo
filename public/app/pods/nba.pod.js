(function registerNbaScoresPod(global){
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
      throw new Error(`NBA Scores pod ${reason} failed.`);
    }
  }

  registry.register({
    id: 'nba-scores',
    title: 'NBA Scores',
    version: '2.1.0',
    description: 'NBA Scores pod with shared-scheduler refresh cadence for favorites-first scoreboard views.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderNbaScores;
      return invokeRender(renderLegacy, 'nba-scores', 'render_call');
    },
    lifecycle: {
      init(){},
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderNbaScores;
        return invokeRender(renderLegacy, 'nba-scores', ctx.trigger === 'scheduled' ? 'scheduler_refresh' : 'refresh_call');
      },
      destroy(){},
      mount(){},
      unmount(){},
    },
  });
})(window);
