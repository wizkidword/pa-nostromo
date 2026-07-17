(function installSettingsStateFeature(global) {
  'use strict';

  const defaults = {
    theme: 'dark',
    weatherIntervalMin: 15,
    defaultTaskColumn: 'inbox',
    productProfile: 'core',
    customProfilePodIds: [],
  };

  function normalizeState(input, { normalizeThemePreference = (value) => value, normalizeTaskColumn = (value) => value } = {}) {
    const settings = { ...defaults, ...(input || {}) };
    settings.theme = normalizeThemePreference(settings.theme);
    settings.defaultTaskColumn = normalizeTaskColumn(settings.defaultTaskColumn);
    settings.shortcutsFilterProjectIds = Array.isArray(settings.shortcutsFilterProjectIds)
      ? settings.shortcutsFilterProjectIds
      : [];
    settings.customProfilePodIds = Array.isArray(settings.customProfilePodIds)
      ? settings.customProfilePodIds
      : [];
    return settings;
  }

  const api = { defaults, normalizeState };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.settingsState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
