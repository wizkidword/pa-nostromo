(function installSystemMonitorStateFeature(global) {
  'use strict';

  const severityThresholds = Object.freeze({ goodMax: 59.9, warnMax: 84.9 });
  const allowlistPresets = Object.freeze({
    dev: Object.freeze(['node', 'code', 'chrome', 'openclaw', 'python', 'git', 'docker']),
    media: Object.freeze(['chrome', 'firefox', 'vlc', 'obs', 'ffmpeg', 'spotify', 'discord']),
    minimal: Object.freeze(['node', 'openclaw', 'code']),
  });
  const defaultAllowlist = Object.freeze(['node', 'chrome', 'openclaw', 'code', 'python']);

  function normalizeAllowlist(values, fallback = defaultAllowlist) {
    const source = Array.isArray(values) ? values : fallback;
    return [...new Set(source.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))].slice(0, 30);
  }

  function normalizeState(input) {
    return {
      allowlist: normalizeAllowlist(input?.allowlist),
      settingsOpen: !!input?.settingsOpen,
    };
  }

  function formatRateBytesPerSec(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return '—';
    if (numeric < 1024) return String(Math.round(numeric)) + ' B/s';
    if (numeric < 1024 * 1024) return (numeric / 1024).toFixed(1) + ' KB/s';
    return (numeric / (1024 * 1024)).toFixed(2) + ' MB/s';
  }

  function formatUptime(seconds) {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total < 0) return '—';
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return String(days) + 'd ' + String(hours) + 'h';
    if (hours > 0) return String(hours) + 'h ' + String(minutes) + 'm';
    return String(minutes) + 'm';
  }

  function classifySeverity(percent) {
    const numeric = Number(percent);
    if (!Number.isFinite(numeric)) return 'neutral';
    if (numeric <= severityThresholds.goodMax) return 'good';
    if (numeric <= severityThresholds.warnMax) return 'warn';
    return 'danger';
  }

  function getPresetAllowlist(preset) {
    return normalizeAllowlist(allowlistPresets[String(preset || '').trim().toLowerCase()] || [], []);
  }

  function getPresetState(allowlist) {
    const active = new Set(normalizeAllowlist(allowlist, []));
    return Object.fromEntries(Object.entries(allowlistPresets).map(([key, values]) => [
      key,
      values.every((name) => active.has(name)),
    ]));
  }

  const api = {
    severityThresholds, allowlistPresets, defaultAllowlist, normalizeAllowlist, normalizeState,
    formatRateBytesPerSec, formatUptime, classifySeverity, getPresetAllowlist, getPresetState,
  };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.systemMonitorState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
