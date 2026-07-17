(function installMusicPlayerStateFeature(global) {
  'use strict';

  const sleepTimerOptions = new Set([0, 15, 30, 60]);

  function normalizeState(input, { ambientPresetIds = [] } = {}) {
    const raw = input || {};
    const presetIds = new Set((Array.isArray(ambientPresetIds) ? ambientPresetIds : []).map((value) => String(value || '')));
    const volume = Number(raw.volume ?? 0.7);
    const ambientSourceIndex = Number(raw.ambientSourceIndex || 0);
    const sleepTimerMin = Number(raw.sleepTimerMin);
    return Object.assign({
      sourceType: 'stream',
      mode: 'stream',
      currentStreamUrl: '',
      streamMode: 'unknown',
      favoriteStreamUrl: '',
      currentTrackName: '',
      volume: 0.7,
      isPlaying: false,
      ambientPresetId: 'rain',
      ambientSourceIndex: 0,
      sleepTimerMin: 0,
    }, raw, {
      mode: raw.mode === 'ambient' ? 'ambient' : 'stream',
      volume: Math.min(1, Math.max(0, volume)),
      ambientPresetId: presetIds.has(raw.ambientPresetId) ? raw.ambientPresetId : 'rain',
      ambientSourceIndex: Math.max(0, Math.floor(ambientSourceIndex)),
      sleepTimerMin: sleepTimerOptions.has(sleepTimerMin) ? sleepTimerMin : 0,
    });
  }

  function getPresentation(input, { statusText = '', ambient = null } = {}) {
    const musicPlayer = input || {};
    const isAmbientMode = musicPlayer.mode === 'ambient';
    const presetLabel = String(ambient?.preset?.label || 'Ambient');
    const sources = Array.isArray(ambient?.preset?.sources) ? ambient.preset.sources : [];
    const sourceIndex = Math.max(0, Math.floor(Number(ambient?.sourceIndex || 0)));
    const sourceLabel = String(ambient?.source?.label || 'ambient source');
    const sourceUrl = String(ambient?.source?.url || '').trim();
    const currentLabel = isAmbientMode
      ? presetLabel
      : (musicPlayer.currentTrackName || (musicPlayer.sourceType === 'local' ? 'Local audio file' : 'Stream source'));
    const hasSource = isAmbientMode
      ? !!sourceUrl
      : !!String(musicPlayer.currentStreamUrl || '').trim() || musicPlayer.sourceType === 'local';
    const rawStatus = String(statusText || '').toLowerCase();

    let tone = 'idle';
    let signal = 'neutral';
    let signalDetail = isAmbientMode ? 'ambient' : 'ready';
    let badge = 'Ready';
    let heroTitle = isAmbientMode ? `Ambient mode: ${presetLabel}` : (hasSource ? currentLabel : 'Load a stream to start');
    let fallbackMeta = isAmbientMode
      ? `Set a mood, then press Play. Current source ${sourceIndex + 1} of ${sources.length}.`
      : hasSource
        ? 'Playback source is loaded. Use the transport controls when you are ready.'
        : 'Paste a stream URL, use a favorite, or drop in a local file.';

    if (musicPlayer.isPlaying) {
      tone = 'playing';
      signal = 'fresh';
      signalDetail = isAmbientMode ? 'ambient live' : (musicPlayer.sourceType === 'local' ? 'local playback' : 'playing');
      badge = 'Playing';
      heroTitle = currentLabel;
      fallbackMeta = isAmbientMode
        ? `Ambient playback is live with ${sourceLabel}.`
        : musicPlayer.sourceType === 'local'
          ? `Local audio is playing: ${currentLabel}.`
          : `Playback is active from ${musicPlayer.streamMode === 'youtube' ? 'YouTube' : musicPlayer.streamMode === 'embed' ? 'embedded player' : 'stream source'}.`;
    } else if (hasSource) {
      tone = 'loaded';
      signal = 'degraded';
      signalDetail = 'loaded';
      badge = 'Loaded';
    }

    if (/failed|error|blocked|could not|unavailable/.test(rawStatus)) {
      tone = 'error';
      signal = 'error';
      signalDetail = 'attention';
      badge = 'Issue';
      fallbackMeta = statusText || fallbackMeta;
    }

    return {
      tone,
      signal,
      signalDetail,
      badge,
      heroTitle,
      heroMeta: String(statusText || fallbackMeta || '').trim(),
      sourceLine: musicPlayer.sourceType === 'local'
        ? 'Local file'
        : isAmbientMode
          ? `Ambient · ${presetLabel}`
          : (musicPlayer.streamMode === 'youtube' ? 'YouTube stream' : musicPlayer.streamMode === 'embed' ? 'Embedded stream' : 'Stream URL'),
      favoriteLine: musicPlayer.favoriteStreamUrl ? 'Favorite saved' : 'No favorite saved',
      sleepLine: musicPlayer.sleepTimerMin ? `Sleep ${musicPlayer.sleepTimerMin}m` : 'Sleep off',
      volumePercent: Math.round((Number(musicPlayer.volume || 0) || 0) * 100),
      hasSource,
      currentLabel,
    };
  }

  const api = { sleepTimerOptions, normalizeState, getPresentation };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.musicPlayerState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
