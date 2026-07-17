(function installLiveStreamsStateFeature(global) {
  'use strict';

  const sourceTypes = ['youtube', 'twitch', 'kick', 'vaughn', 'rumble', 'xlive', 'facebook', 'generic', 'local'];
  const sourceTypeSet = new Set(sourceTypes);
  const statuses = new Set(['idle', 'loading', 'live', 'error']);
  const renderModes = new Set(['iframe', 'video']);

  function normalizeSourceType(value) {
    return sourceTypeSet.has(value) ? value : 'youtube';
  }

  function normalizeState(input, { createId = () => '', getNow = () => '' } = {}) {
    const raw = input || {};
    const inputValues = (raw.inputs && typeof raw.inputs === 'object') ? raw.inputs : {};
    const presets = Array.isArray(raw.presets)
      ? raw.presets.slice(0, 20).map((preset) => ({
        id: String(preset?.id || createId()),
        name: String(preset?.name || '').trim().slice(0, 40),
        sourceType: normalizeSourceType(preset?.sourceType),
        value: String(preset?.value || '').trim().slice(0, 500),
        createdAt: String(preset?.createdAt || getNow()),
      })).filter((preset) => preset.name && preset.value)
      : [];

    return Object.assign({
      sourceType: 'youtube',
      inputs: Object.fromEntries(sourceTypes.map((type) => [type, ''])),
      active: false,
      status: 'idle',
      lastError: '',
      embedUrl: '',
      externalUrl: '',
      renderMode: 'iframe',
      presets: [],
    }, raw, {
      sourceType: normalizeSourceType(raw.sourceType),
      inputs: Object.fromEntries(sourceTypes.map((type) => [type, String(inputValues[type] || '').trim()])),
      active: !!raw.active,
      status: statuses.has(raw.status) ? raw.status : 'idle',
      lastError: String(raw.lastError || '').slice(0, 300),
      embedUrl: String(raw.embedUrl || '').trim(),
      externalUrl: String(raw.externalUrl || '').trim(),
      renderMode: renderModes.has(raw.renderMode) ? raw.renderMode : 'iframe',
      presets,
    });
  }

  function compactValueLabel(raw) {
    const value = String(raw || '').trim();
    if (!value) return 'No source loaded yet';
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./i, '');
      const path = url.pathname && url.pathname !== '/' ? url.pathname : '';
      return `${host}${path}`.slice(0, 68);
    } catch {
      return value.slice(0, 68);
    }
  }

  function getPresentation(input, { statusText = '', providerLabel = 'Live Source' } = {}) {
    const liveStreams = normalizeState(input);
    const sourceType = liveStreams.sourceType;
    const label = String(providerLabel || 'Live Source');
    const sourceValue = String(liveStreams.inputs[sourceType] || '').trim();
    const presetCount = liveStreams.presets.length;
    const status = String(liveStreams.status || (liveStreams.active ? 'loading' : 'idle')).toLowerCase();
    const renderMode = String(liveStreams.renderMode || 'iframe').toLowerCase();
    const hasExternal = !!liveStreams.externalUrl;

    let tone = 'idle';
    let signal = 'neutral';
    let signalDetail = label;
    let badge = 'Ready';
    let heroTitle = `Queue up ${label}`;
    let fallbackMeta = 'Choose a source, paste a channel or URL, then start the stream deck.';

    if (status === 'live') {
      tone = 'live';
      signal = 'fresh';
      signalDetail = renderMode === 'video' ? 'direct media' : 'live';
      badge = 'Live';
      heroTitle = `${label} is on deck`;
      fallbackMeta = hasExternal
        ? 'If the embed blanks out, the fallback buttons are ready.'
        : 'Live playback is active in the embedded stage.';
    } else if (status === 'loading') {
      tone = 'loading';
      signal = 'degraded';
      signalDetail = 'loading';
      badge = 'Loading';
      heroTitle = `Loading ${label}`;
      fallbackMeta = 'Some providers take a few seconds to reveal whether framing is allowed.';
    } else if (status === 'error') {
      tone = 'error';
      signal = 'error';
      signalDetail = 'fallback ready';
      badge = 'Blocked';
      heroTitle = `${label} needs a fallback path`;
      fallbackMeta = liveStreams.lastError || 'This source likely blocks in-app embedding.';
    }

    return {
      tone,
      signal,
      signalDetail,
      badge,
      heroTitle,
      heroMeta: String(statusText || fallbackMeta || '').trim(),
      providerLabel: label,
      sourceHeadline: compactValueLabel(sourceValue),
      sourceHint: 'Drop in a handle, channel name, or direct stream URL. Different providers normalize differently behind the scenes.',
      presetMeta: presetCount ? `${presetCount} saved preset${presetCount === 1 ? '' : 's'} ready to reuse.` : 'No presets saved yet. Save your favorite channels for quick launch.',
      stageTitle: renderMode === 'video' ? 'Direct media player' : 'Embedded stream stage',
      stageMeta: hasExternal
        ? 'When a provider blocks framing or the player stays blank, use Pop-out or Open in new tab.'
        : 'This source is best experienced directly inside the dashboard when embedding cooperates.',
      chips: [
        label,
        liveStreams.active ? 'Session active' : 'Idle',
        renderMode === 'video' ? 'Direct media' : 'Embed mode',
        hasExternal ? 'Fallback ready' : 'In-dashboard only',
      ],
      footnote: 'Providers differ wildly on iframe policy. The pod keeps fallback routes close so a blocked embed does not kill the experience.',
    };
  }

  const api = { sourceTypes, normalizeSourceType, normalizeState, compactValueLabel, getPresentation };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.liveStreamsState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
