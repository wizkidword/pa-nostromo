(function registerDateTimePod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'date-time',
    title: 'Date & Time',
    version: '1.1.0',
    description: 'Phase 1D adapter pod using existing renderDateTime() implementation with no-op lifecycle compatibility.',
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
