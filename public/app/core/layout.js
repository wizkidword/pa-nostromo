(function installMissionControlLayout(global) {
  'use strict';

  const mergedSocialFollowersPodId = 'social-followers';
  const legacySocialFollowersPodIds = ['facebook-followers', 'instagram-followers', 'tiktok-followers', 'youtube-subscribers'];
  const mergedVoicePodId = 'voice-desk';
  const legacyVoicePodIds = ['voice-note', 'voice-to-rowan'];
  const defaultUtilityRows = [
    ['shortcuts'],
    ['date-time', 'calendar', 'gas-prices'],
    ['nba-scores', 'crypto-tracker', mergedSocialFollowersPodId, 'ebay-traffic', 'speed-test', 'rss-feed', 'unread-email', 'everyday-calculator', 'system-resource-monitor', 'home-device-control'],
    ['camera-feed', 'live-streams'],
    [mergedVoicePodId, 'music-player'],
  ];

  function createDefaultLayoutState() {
    return {
      utilityRows: defaultUtilityRows.map((row) => [...row]),
      visibility: Object.fromEntries(defaultUtilityRows.flat().map((podId) => [podId, true])),
    };
  }

  function normalizeLayoutState(layoutInput, knownPodIds = []) {
    const defaults = createDefaultLayoutState();
    const fallbackRows = defaults.utilityRows;
    const fallbackIds = fallbackRows.flat();
    const allKnown = [...new Set([
      ...fallbackIds,
      ...legacySocialFollowersPodIds,
      ...legacyVoicePodIds,
      ...knownPodIds.map((value) => String(value || '').trim()).filter(Boolean),
    ])];
    const allowed = new Set(allKnown);
    const incomingRows = Array.isArray(layoutInput?.utilityRows) ? layoutInput.utilityRows : fallbackRows;
    const seen = new Set();
    const rows = incomingRows
      .map((row) => Array.isArray(row) ? row.map((value) => String(value || '').trim()).filter(Boolean) : [])
      .map((row) => row.filter((podId) => {
        if (!allowed.has(podId) || seen.has(podId)) return false;
        seen.add(podId);
        return true;
      }))
      .filter((row) => row.length > 0);

    const missing = allKnown.filter((podId) => !seen.has(podId));
    if (!rows.length) rows.push([...fallbackRows[0]]);
    if (missing.length) {
      const pending = new Set(missing);
      for (const baseRow of fallbackRows) {
        const targets = baseRow.filter((podId) => pending.has(podId));
        if (!targets.length) continue;
        const rowIndex = rows.findIndex((row) => row.some((id) => baseRow.includes(id)));
        if (rowIndex >= 0) rows[rowIndex].push(...targets);
        else rows.push([...targets]);
        for (const podId of targets) pending.delete(podId);
      }
      if (pending.size) rows.push([...pending]);
    }

    const gasPodId = 'gas-prices';
    const gasRowIndex = rows.findIndex((row) => row.includes(gasPodId));
    const dateRowIndex = rows.findIndex((row) => row.includes('date-time') || row.includes('calendar'));
    if (gasRowIndex >= 0 && dateRowIndex >= 0 && gasRowIndex !== dateRowIndex && !rows[dateRowIndex].includes(gasPodId)) {
      rows[gasRowIndex] = rows[gasRowIndex].filter((podId) => podId !== gasPodId);
      rows[dateRowIndex].push(gasPodId);
    }

    const mergeLegacyPods = (mergedId, legacyIds) => {
      const mergedIndex = rows.findIndex((row) => row.includes(mergedId));
      let insertRow = mergedIndex;
      let insertIndex = mergedIndex >= 0 ? rows[mergedIndex].indexOf(mergedId) : -1;
      if (insertRow < 0) {
        rows.some((row, rowIndex) => row.some((podId, podIndex) => {
          if (!legacyIds.includes(podId)) return false;
          insertRow = rowIndex;
          insertIndex = podIndex;
          return true;
        }));
      }

      rows.forEach((row, rowIndex) => {
        rows[rowIndex] = row.filter((podId) => podId !== mergedId && !legacyIds.includes(podId));
      });

      if (insertRow < 0) {
        insertRow = fallbackRows.findIndex((row) => row.includes(mergedId));
        insertIndex = 0;
      }
      if (insertRow < 0) insertRow = Math.max(0, rows.length - 1);
      while (rows.length <= insertRow) rows.push([]);
      const targetRow = rows[insertRow];
      const targetIndex = Number.isInteger(insertIndex) ? Math.max(0, Math.min(insertIndex, targetRow.length)) : targetRow.length;
      targetRow.splice(targetIndex, 0, mergedId);
    };

    mergeLegacyPods(mergedSocialFollowersPodId, legacySocialFollowersPodIds);
    mergeLegacyPods(mergedVoicePodId, legacyVoicePodIds);

    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (!rows[index].length) rows.splice(index, 1);
    }

    const visibilityInput = (layoutInput && typeof layoutInput.visibility === 'object' && layoutInput.visibility)
      ? layoutInput.visibility
      : {};
    const visibility = {};
    for (const podId of rows.flat()) {
      if (podId === mergedSocialFollowersPodId) {
        const legacyVisible = legacySocialFollowersPodIds.some((legacyId) => visibilityInput[legacyId] !== false);
        visibility[podId] = visibilityInput[podId] !== false && legacyVisible;
      } else if (podId === mergedVoicePodId) {
        const legacyVisible = legacyVoicePodIds.some((legacyId) => visibilityInput[legacyId] !== false);
        visibility[podId] = visibilityInput[podId] !== false && legacyVisible;
      } else {
        visibility[podId] = visibilityInput[podId] !== false;
      }
    }

    return { utilityRows: rows, visibility };
  }

  const api = {
    phase: '1B',
    mergedSocialFollowersPodId,
    legacySocialFollowersPodIds,
    mergedVoicePodId,
    legacyVoicePodIds,
    defaultUtilityRows,
    createDefaultLayoutState,
    normalizeLayoutState,
  };
  api.defaults = createDefaultLayoutState();
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.layout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
