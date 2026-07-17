(function installCameraFeedStateFeature(global) {
  'use strict';

  const modes = new Set(['stream', 'snapshot', 'local']);
  const statuses = new Set(['idle', 'loading', 'live', 'error']);

  function normalizeState(input) {
    const raw = input || {};
    const refresh = Number(raw?.refreshIntervalSec ?? 5);
    const viewportWidth = Number(raw?.viewportWidth);
    const viewportHeight = Number(raw?.viewportHeight);
    return Object.assign({
      sourceUrl: '',
      mode: 'stream',
      refreshIntervalSec: 5,
      active: false,
      status: 'idle',
      lastError: '',
      useProxy: true,
      deviceId: '',
      viewportWidth: 640,
      viewportHeight: 360,
    }, raw, {
      sourceUrl: String(raw?.sourceUrl || '').trim(),
      mode: modes.has(raw?.mode) ? raw.mode : 'stream',
      refreshIntervalSec: Number.isFinite(refresh) ? Math.min(60, Math.max(1, Math.round(refresh))) : 5,
      active: !!raw?.active,
      status: statuses.has(raw?.status) ? raw.status : 'idle',
      lastError: String(raw?.lastError || '').slice(0, 300),
      useProxy: raw?.useProxy !== false,
      deviceId: String(raw?.deviceId || ''),
      viewportWidth: Number.isFinite(viewportWidth) ? Math.min(1200, Math.max(280, Math.round(viewportWidth))) : 640,
      viewportHeight: Number.isFinite(viewportHeight) ? Math.min(900, Math.max(180, Math.round(viewportHeight))) : 360,
    });
  }

  function modeLabel(mode) {
    const labels = {
      stream: 'Embed stream',
      snapshot: 'Snapshot refresh',
      local: 'Local webcam',
    };
    return labels[String(mode || '').toLowerCase()] || 'Camera feed';
  }

  function compactSourceLabel(raw) {
    const value = String(raw || '').trim();
    if (!value) return 'No source configured yet';
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./i, '');
      const path = url.pathname && url.pathname !== '/' ? url.pathname : '';
      return `${host}${path}`.slice(0, 64);
    } catch {
      return value.slice(0, 64);
    }
  }

  function getPresentation(input, { statusText = '', deviceLabel = 'Default browser camera', cameraAvailable = true } = {}) {
    const cameraFeed = normalizeState(input);
    const { mode, status, refreshIntervalSec: interval, active: isActive, useProxy, sourceUrl } = cameraFeed;
    const label = String(deviceLabel || 'Default browser camera');
    const currentModeLabel = modeLabel(mode);

    let tone = 'idle';
    let signal = 'neutral';
    let signalDetail = mode === 'local' ? 'browser' : mode === 'snapshot' ? `${interval}s` : 'embed';
    let badge = 'Ready';
    let heroTitle = mode === 'local' ? 'Ready to start your webcam' : sourceUrl ? 'Ready to load this camera feed' : 'Add a camera source to begin';
    let fallbackMeta = mode === 'local'
      ? 'Choose a device if needed, then request browser camera access.'
      : mode === 'snapshot'
        ? 'Use snapshot mode when a camera blocks embedding or needs a safer fallback.'
        : 'Embed mode is best for camera pages or stream URLs that allow framing.';

    if (status === 'live') {
      tone = 'live';
      signal = 'fresh';
      signalDetail = mode === 'local' ? 'webcam live' : mode === 'snapshot' ? `${interval}s cycle` : 'feed live';
      badge = 'Live';
      heroTitle = mode === 'local' ? 'Local webcam is live' : mode === 'snapshot' ? 'Snapshot monitor is running' : 'Embedded camera feed is live';
      fallbackMeta = mode === 'local'
        ? `Watching ${label}.`
        : mode === 'snapshot'
          ? `Refreshing every ${interval}s${useProxy ? ' via the local proxy' : ''}.`
          : 'Embed loaded successfully.';
    } else if (status === 'loading') {
      tone = 'loading';
      signal = 'degraded';
      signalDetail = 'warming up';
      badge = 'Loading';
      heroTitle = mode === 'local' ? 'Requesting webcam access' : mode === 'snapshot' ? 'Refreshing snapshot feed' : 'Loading embedded feed';
      fallbackMeta = mode === 'local'
        ? 'Waiting for browser permission and camera readiness.'
        : mode === 'snapshot'
          ? `Preparing snapshot refresh${useProxy ? ' through the local proxy' : ''}.`
          : 'Waiting for the camera page to load.';
    } else if (status === 'error') {
      tone = 'error';
      signal = 'error';
      signalDetail = 'attention';
      badge = 'Issue';
      heroTitle = 'Camera feed needs attention';
      fallbackMeta = cameraFeed.lastError || 'Something blocked the current camera source.';
    } else if (isActive) {
      tone = 'loading';
      signal = 'degraded';
      signalDetail = 'active';
      badge = 'Active';
      heroTitle = mode === 'local' ? 'Webcam session is active' : 'Camera feed is active';
    }

    const chips = [currentModeLabel, isActive ? 'Session active' : 'Idle'];
    if (mode === 'snapshot') chips.push(`${interval}s refresh`);
    if (mode === 'snapshot' && useProxy) chips.push('Proxy on');
    if (mode === 'local') chips.push(label);

    return {
      tone,
      signal,
      signalDetail,
      badge,
      heroTitle,
      heroMeta: String(statusText || fallbackMeta || '').trim(),
      sourceHeadline: mode === 'local' ? label : compactSourceLabel(sourceUrl),
      sourceHint: mode === 'local'
        ? 'Uses browser camera permissions, so no URL is required in local mode.'
        : mode === 'snapshot'
          ? 'Snapshot mode is a reliable fallback when embeds fail or a camera blocks framing.'
          : 'Use a camera page or embeddable stream URL when direct framing is supported.',
      controlHeadline: mode === 'local' ? 'Browser capture controls' : 'Source and refresh controls',
      stageTitle: mode === 'local' ? 'Local webcam preview' : mode === 'snapshot' ? 'Snapshot monitor' : 'Embedded feed stage',
      stageMeta: mode === 'snapshot'
        ? `Resize the frame as needed. Current snapshot cadence: ${interval}s${useProxy ? ' with proxy assist' : ''}.`
        : mode === 'local'
          ? 'Resize the preview to fit your room, desk, or scene.'
          : 'Resize the stage and keep Snapshot mode handy if the source blocks embedding.',
      chips,
      footnote: `One active feed at a time. Snapshot mode helps when embeds fail. Local webcam uses browser permission${cameraAvailable ? '' : ' and may be unavailable in this browser/context'}.`,
    };
  }

  const api = { modes, statuses, normalizeState, modeLabel, compactSourceLabel, getPresentation };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.cameraFeedState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
