(function registerNbaScoresPod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'nba-scores',
    title: 'NBA Scores',
    version: '1.0.0',
    description: 'Phase 1C adapter pod using existing renderNbaScores() implementation.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderNbaScores;
      if (typeof renderLegacy === 'function') renderLegacy();
    },
  });
})(window);
