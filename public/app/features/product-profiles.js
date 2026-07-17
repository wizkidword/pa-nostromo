(function installMissionControlProductProfilesFeature(global) {
  'use strict';

  const CORE_POD_IDS = Object.freeze(['shortcuts', 'calendar']);
  const ALL_POD_IDS = Object.freeze([
    'shortcuts', 'calendar', 'date-time', 'gas-prices', 'nba-scores', 'crypto-tracker',
    'social-followers', 'ebay-traffic', 'speed-test', 'rss-feed', 'unread-email',
    'everyday-calculator', 'system-resource-monitor', 'home-device-control', 'camera-feed',
    'live-streams', 'voice-desk', 'music-player',
  ]);
  const PROFILE_DEFINITIONS = Object.freeze({
    core: Object.freeze({ id: 'core', name: 'Core', description: 'Projects, tasks, notes, reminders, calendar, and shortcuts.', podIds: CORE_POD_IDS }),
    seller: Object.freeze({ id: 'seller', name: 'Seller', description: 'Core plus eBay traffic and unread email.', podIds: Object.freeze([...CORE_POD_IDS, 'ebay-traffic', 'unread-email']) }),
    creator: Object.freeze({ id: 'creator', name: 'Creator', description: 'Core plus social audience, RSS, and Voice Desk.', podIds: Object.freeze([...CORE_POD_IDS, 'social-followers', 'rss-feed', 'voice-desk']) }),
    home: Object.freeze({ id: 'home', name: 'Home', description: 'Core plus local status, devices, camera, and media tools.', podIds: Object.freeze([...CORE_POD_IDS, 'date-time', 'gas-prices', 'speed-test', 'everyday-calculator', 'system-resource-monitor', 'home-device-control', 'camera-feed', 'live-streams', 'music-player']) }),
    custom: Object.freeze({ id: 'custom', name: 'Custom', description: 'Core plus only the optional tools you select.', podIds: CORE_POD_IDS }),
  });
  const PROFILE_IDS = Object.freeze(Object.keys(PROFILE_DEFINITIONS));
  const LEGACY_POD_IDS = Object.freeze({
    weather: 'date-time',
    'facebook-followers': 'social-followers',
    'instagram-followers': 'social-followers',
    'tiktok-followers': 'social-followers',
    'youtube-subscribers': 'social-followers',
    'voice-notes': 'voice-desk',
    'voice-to-rowan': 'voice-desk',
    'camera-snapshot': 'camera-feed',
  });
  const INTEGRATION_PODS = Object.freeze({
    weather: 'date-time',
    'nba-scores': 'nba-scores',
    crypto: 'crypto-tracker',
    rss: 'rss-feed',
    'unread-email': 'unread-email',
    'social-followers': 'social-followers',
    'ebay-traffic': 'ebay-traffic',
    'gas-prices': 'gas-prices',
  });

  function text(value) { return String(value == null ? '' : value).trim(); }

  function normalizeProfileId(value, fallback = 'core') {
    const id = text(value).toLowerCase();
    return PROFILE_DEFINITIONS[id] ? id : fallback;
  }

  function resolvePodId(value) {
    const id = text(value).toLowerCase();
    return LEGACY_POD_IDS[id] || id;
  }

  function normalizeCustomPodIds(input) {
    const values = Array.isArray(input) ? input : [];
    return [...new Set(values.map(resolvePodId).filter((id) => ALL_POD_IDS.includes(id)))];
  }

  function getEnabledPodIds(profileId, customPodIds = []) {
    const id = normalizeProfileId(profileId);
    if (id === 'custom') return [...new Set([...CORE_POD_IDS, ...normalizeCustomPodIds(customPodIds)])];
    return [...PROFILE_DEFINITIONS[id].podIds];
  }

  function isPodEnabled(profileId, podId, customPodIds = []) {
    return getEnabledPodIds(profileId, customPodIds).includes(resolvePodId(podId));
  }

  function isIntegrationEnabled(profileId, integrationId, customPodIds = []) {
    const podId = INTEGRATION_PODS[text(integrationId).toLowerCase()];
    return !podId || isPodEnabled(profileId, podId, customPodIds);
  }

  const api = { CORE_POD_IDS, ALL_POD_IDS, PROFILE_DEFINITIONS, PROFILE_IDS, INTEGRATION_PODS, normalizeProfileId, resolvePodId, normalizeCustomPodIds, getEnabledPodIds, isPodEnabled, isIntegrationEnabled };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.productProfiles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
