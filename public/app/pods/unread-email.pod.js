(function registerUnreadEmailPod(global){
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
      throw new Error(`Unread Email pod ${reason} failed.`);
    }
  }

  registry.register({
    id: 'unread-email',
    title: 'Unread Email',
    version: '1.1.0',
    description: 'Unread email tracker with a local-only Gmail Atom feed bridge and shared-scheduler refresh cadence.',
    render(ctx = {}){
      const renderLegacy = typeof ctx.legacyRender === 'function'
        ? ctx.legacyRender
        : (options) => global.renderUnreadEmailPod?.(options);
      return invokeRender(renderLegacy, 'unread-email', 'render_call');
    },
    lifecycle: {
      init(){},
      refresh(ctx = {}){
        const renderLegacy = typeof ctx.legacyRender === 'function'
          ? ctx.legacyRender
          : (options) => global.renderUnreadEmailPod?.(options);
        return invokeRender(renderLegacy, 'unread-email', ctx.trigger === 'scheduled' ? 'scheduler_refresh' : 'refresh_call');
      },
      destroy(){},
      mount(){},
      unmount(){},
    },
  });
})(window);
