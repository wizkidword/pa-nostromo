(function registerCalendarPod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'calendar',
    title: 'Calendar',
    version: '1.1.0',
    description: 'Phase 1D adapter pod using existing renderCalendar() implementation with no-op lifecycle compatibility.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderCalendar;
      if (typeof renderLegacy === 'function') renderLegacy();
    },
    lifecycle: {
      init(){},
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderCalendar;
        if (typeof renderLegacy === 'function') renderLegacy();
      },
      mount(){},
      unmount(){},
      destroy(){},
    },
  });
})(window);
