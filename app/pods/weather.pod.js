(function registerWeatherPod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'weather',
    title: 'Weather',
    version: '1.0.0',
    description: 'Phase 1A adapter pod using existing renderWeather() implementation.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderWeather;
      if (typeof renderLegacy === 'function') renderLegacy();
    },
  });
})(window);
