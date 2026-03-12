(function registerCryptoTrackerPod(global){
  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;

  registry.register({
    id: 'crypto-tracker',
    title: 'Crypto Tracker',
    version: '1.0.0',
    description: 'Phase 1C adapter pod using existing renderCrypto() implementation.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderCrypto;
      if (typeof renderLegacy === 'function') renderLegacy();
    },
  });
})(window);
