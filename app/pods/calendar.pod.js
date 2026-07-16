(function registerCalendarPod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'calendar',
    title: 'Calendar',
    version: '2.0.0',
    description: 'Calendar 2.0 with a more polished month view and a fuller selected-day agenda panel.',
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
