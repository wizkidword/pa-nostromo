(function registerCalendarPod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'calendar',
    title: 'Calendar',
    version: '1.0.0',
    description: 'Phase 1A adapter pod using existing renderCalendar() implementation.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderCalendar;
      if (typeof renderLegacy === 'function') renderLegacy();
    },
  });
})(window);
