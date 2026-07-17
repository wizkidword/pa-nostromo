(function installHomeDeviceStateFeature(global) {
  'use strict';

  function normalizeMacAddress(value) {
    const clean = String(value || '').trim().replace(/-/g, ':').toUpperCase();
    if (!clean) return '';
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(clean) ? clean : clean;
  }

  function normalizeTags(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(source.map((tag) => String(tag || '').trim()).filter(Boolean))].slice(0, 10);
  }

  function normalizeState(input) {
    const devicesRaw = Array.isArray(input?.devices) ? input.devices : [];
    const devices = devicesRaw
      .map((device, index) => {
        const name = String(device?.name || '').trim().slice(0, 80);
        if (!name) return null;
        const id = String(device?.id || `device-${index + 1}`).trim() || `device-${index + 1}`;
        return {
          id,
          name,
          type: String(device?.type || 'device').trim().slice(0, 40) || 'device',
          host: String(device?.host || '').trim().slice(0, 255),
          uiUrl: String(device?.uiUrl || '').trim().slice(0, 400),
          sshTarget: String(device?.sshTarget || '').trim().slice(0, 160),
          rdpUrl: String(device?.rdpUrl || '').trim().slice(0, 400),
          macAddress: String(device?.macAddress || '').trim().slice(0, 32),
          notes: String(device?.notes || '').trim().slice(0, 240),
          tags: normalizeTags(device?.tags),
          lastWakeStatus: String(device?.lastWakeStatus || ''),
          lastWakeAt: String(device?.lastWakeAt || ''),
        };
      })
      .filter(Boolean)
      .slice(0, 60);

    return {
      devices,
      settingsOpen: !!input?.settingsOpen,
      pingByDevice: (input?.pingByDevice && typeof input.pingByDevice === 'object') ? input.pingByDevice : {},
      wakeModalDeviceId: String(input?.wakeModalDeviceId || ''),
      scanRunning: !!input?.scanRunning,
      lastScanAt: String(input?.lastScanAt || ''),
      toast: String(input?.toast || '').slice(0, 200),
      toastAt: String(input?.toastAt || ''),
    };
  }

  function getActionAvailability(device) {
    const hasRemote = !!(device?.rdpUrl || device?.sshTarget || device?.uiUrl);
    return {
      remote: { enabled: hasRemote, reason: hasRemote ? '' : 'Add rdpUrl, sshTarget, or uiUrl.' },
      ui: { enabled: !!device?.uiUrl, reason: device?.uiUrl ? '' : 'Missing uiUrl.' },
      ping: { enabled: !!device?.host, reason: device?.host ? '' : 'Missing host.' },
      copySsh: { enabled: !!device?.sshTarget, reason: device?.sshTarget ? '' : 'Missing sshTarget.' },
      wake: { enabled: !!device?.macAddress, reason: device?.macAddress ? '' : 'Missing macAddress.' },
    };
  }

  const api = { normalizeMacAddress, normalizeTags, normalizeState, getActionAvailability };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.homeDeviceState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
