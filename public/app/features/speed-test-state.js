(function installSpeedTestStateFeature(global) {
  'use strict';

  const allowedIntervals = new Set([0, 15, 30, 60]);

  function normalizeInterval(value) {
    const interval = Number(value);
    return allowedIntervals.has(interval) ? interval : 0;
  }

  function normalizeThresholds(input) {
    const ping = Number(input?.pingMs);
    const download = Number(input?.downloadMbps);
    const upload = Number(input?.uploadMbps);
    return {
      pingMs: Number.isFinite(ping) ? Math.min(2000, Math.max(1, ping)) : 100,
      downloadMbps: Number.isFinite(download) ? Math.min(10000, Math.max(1, download)) : 100,
      uploadMbps: Number.isFinite(upload) ? Math.min(5000, Math.max(1, upload)) : 20,
    };
  }

  function normalizeState(input, { createId = () => '', getNow = () => '' } = {}) {
    const history = (Array.isArray(input?.history) ? input.history : [])
      .map((entry) => ({
        id: String(entry?.id || createId()),
        ts: String(entry?.ts || getNow()),
        pingMs: Number.isFinite(Number(entry?.pingMs)) ? Math.max(0, Number(entry.pingMs)) : null,
        downloadMbps: Number.isFinite(Number(entry?.downloadMbps)) ? Math.max(0, Number(entry.downloadMbps)) : null,
        uploadMbps: Number.isFinite(Number(entry?.uploadMbps)) ? Math.max(0, Number(entry.uploadMbps)) : null,
        source: ['backend-speedtest', 'browser-estimate'].includes(entry?.source) ? entry.source : 'browser-estimate',
        backendTool: String(entry?.backendTool || '').slice(0, 40),
        note: String(entry?.note || '').slice(0, 220),
      }))
      .sort((left, right) => String(right.ts || '').localeCompare(String(left.ts || '')))
      .slice(0, 10);
    return {
      autoIntervalMin: normalizeInterval(input?.autoIntervalMin),
      warningThresholds: normalizeThresholds(input?.warningThresholds),
      history,
      lastError: String(input?.lastError || '').slice(0, 220),
      running: !!input?.running,
    };
  }

  function getLatestResult(history) {
    return Array.isArray(history) && history.length ? history[0] : null;
  }

  function hasWarning(result, thresholds) {
    if (!result) return false;
    const limits = normalizeThresholds(thresholds);
    const pingWarn = Number.isFinite(result.pingMs) && result.pingMs > limits.pingMs;
    const downWarn = Number.isFinite(result.downloadMbps) && result.downloadMbps < limits.downloadMbps;
    const upWarn = Number.isFinite(result.uploadMbps) && result.uploadMbps < limits.uploadMbps;
    return pingWarn || downWarn || upWarn;
  }

  function formatMetric(value, unit) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric.toFixed(1) + ' ' + String(unit || '') : '—';
  }

  const api = { allowedIntervals, normalizeInterval, normalizeThresholds, normalizeState, getLatestResult, hasWarning, formatMetric };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.speedTestState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
