(function installSettingsStateFeature(global) {
  'use strict';

  const defaults = {
    theme: 'dark',
    weatherIntervalMin: 15,
    defaultTaskColumn: 'inbox',
  };

  function normalizeState(input, { normalizeThemePreference = (value) => value, normalizeTaskColumn = (value) => value } = {}) {
    const settings = { ...defaults, ...(input || {}) };
    settings.theme = normalizeThemePreference(settings.theme);
    settings.defaultTaskColumn = normalizeTaskColumn(settings.defaultTaskColumn);
    settings.shortcutsFilterProjectIds = Array.isArray(settings.shortcutsFilterProjectIds)
      ? settings.shortcutsFilterProjectIds
      : [];
    return settings;
  }

  const api = { defaults, normalizeState };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.settingsState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
