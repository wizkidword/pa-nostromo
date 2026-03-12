(function registerDateTimePod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'date-time',
    title: 'Date & Time',
    version: '1.0.0',
    description: 'Phase 1A adapter pod using existing renderDateTime() implementation.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderDateTime;
      if (typeof renderLegacy === 'function') renderLegacy();
    },
  });
})(window);
