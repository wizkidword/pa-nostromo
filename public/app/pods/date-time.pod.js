(function registerDateTimePod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'date-time',
    title: 'Date & Time',
    version: '2.0.0',
    description: 'Date & Time 2.0 with a stronger time hero, cleaner timer framing, and integrated weather presentation.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderDateTime;
      if (typeof renderLegacy === 'function') renderLegacy();
    },
    lifecycle: {
      init(){},
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderDateTime;
        if (typeof renderLegacy === 'function') renderLegacy();
      },
      mount(){},
      unmount(){},
      destroy(){},
    },
  });
})(window);
