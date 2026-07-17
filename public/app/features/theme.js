(function installMissionControlThemeFeature(global) {
  'use strict';

  const options = Object.freeze([
    { id: 'dark', label: 'Nostromo Dark', description: 'Low-light command deck', swatches: ['#0b1020', '#111831', '#2563eb'] },
    { id: 'light', label: 'Day Shift', description: 'Bright operations view', swatches: ['#f3f6fb', '#ffffff', '#2563eb'] },
    { id: 'system', label: 'System', description: 'Follow Windows/browser', swatches: ['#f8fafc', '#111831', '#2563eb'] },
    { id: 'ember', label: 'Ember', description: 'Warm alert-room contrast', swatches: ['#15100d', '#241713', '#f97316'] },
    { id: 'forest', label: 'Forest', description: 'Quiet green console', swatches: ['#08130f', '#10231b', '#22c55e'] },
    { id: 'terminal', label: 'Terminal', description: 'High-contrast phosphor', swatches: ['#030712', '#07120d', '#84cc16'] },
    { id: 'aurora', label: 'Aurora', description: 'Teal, rose, and night', swatches: ['#10131f', '#172033', '#14b8a6'] },
  ]);
  const optionIds = new Set(options.map((theme) => theme.id));
  const concreteThemeClassNames = options
    .map((theme) => theme.id)
    .filter((themeId) => themeId !== 'dark' && themeId !== 'system')
    .map((themeId) => `theme-${themeId}`);

  function normalizeThemePreference(value) {
    const themeId = String(value || '').trim().toLowerCase();
    return optionIds.has(themeId) ? themeId : 'dark';
  }

  function themeOptionById(themeId) {
    const normalized = normalizeThemePreference(themeId);
    return options.find((theme) => theme.id === normalized) || options[0];
  }

  function resolveThemePreference(themeId, windowRef = global) {
    const normalized = normalizeThemePreference(themeId);
    if (normalized !== 'system') return normalized;
    const prefersLight = typeof windowRef?.matchMedia === 'function'
      ? windowRef.matchMedia('(prefers-color-scheme: light)').matches
      : false;
    return prefersLight ? 'light' : 'dark';
  }

  function createThemeController({
    document: documentRef,
    window: windowRef = global,
    getState,
    escapeHtml,
    onPreferenceChanged = () => {},
    onPreferenceUnchanged = () => {},
  }) {
    let systemThemeQuery = null;
    let systemThemeListener = null;

    function getSettings() {
      const settings = getState?.()?.settings;
      if (!settings) throw new Error('Theme feature requires dashboard settings state.');
      return settings;
    }

    function applyTheme() {
      const settings = getSettings();
      const preference = normalizeThemePreference(settings.theme);
      if (settings.theme !== preference) settings.theme = preference;
      const resolvedTheme = resolveThemePreference(preference, windowRef);
      documentRef?.body?.classList?.remove(...concreteThemeClassNames);
      if (resolvedTheme !== 'dark') documentRef?.body?.classList?.add(`theme-${resolvedTheme}`);
      if (documentRef?.body?.dataset) {
        documentRef.body.dataset.themePreference = preference;
        documentRef.body.dataset.themeResolved = resolvedTheme;
      }
      return { preference, resolvedTheme };
    }

    function renderChoices() {
      const wrap = documentRef?.getElementById?.('themeChoiceGrid');
      if (!wrap) return;
      const activeTheme = normalizeThemePreference(getSettings().theme);
      wrap.innerHTML = options.map((theme) => {
        const active = theme.id === activeTheme;
        const swatches = theme.swatches
          .map((_, index) => `<span class="theme-choice-swatch theme-choice-swatch--${theme.id}-${index}"></span>`)
          .join('');
        return `<button type="button" class="theme-choice${active ? ' is-active' : ''}" data-theme-choice="${escapeHtml(theme.id)}" aria-pressed="${active ? 'true' : 'false'}">
          <span class="theme-choice-swatches" aria-hidden="true">${swatches}</span>
          <span class="theme-choice-copy">
            <strong>${escapeHtml(theme.label)}</strong>
            <span>${escapeHtml(theme.description)}</span>
          </span>
        </button>`;
      }).join('');
    }

    function setThemePreference(themeId) {
      const settings = getSettings();
      const nextTheme = normalizeThemePreference(themeId);
      if (settings.theme === nextTheme) {
        applyTheme();
        onPreferenceUnchanged();
        return { changed: false, themeId: nextTheme };
      }
      settings.theme = nextTheme;
      applyTheme();
      onPreferenceChanged({ themeId: nextTheme, theme: themeOptionById(nextTheme) });
      return { changed: true, themeId: nextTheme };
    }

    function bindSystemThemeListener() {
      if (systemThemeListener || typeof windowRef?.matchMedia !== 'function') return;
      systemThemeQuery = windowRef.matchMedia('(prefers-color-scheme: light)');
      systemThemeListener = () => {
        if (normalizeThemePreference(getSettings().theme) !== 'system') return;
        applyTheme();
        renderChoices();
      };
      if (systemThemeQuery?.addEventListener) systemThemeQuery.addEventListener('change', systemThemeListener);
      else if (systemThemeQuery?.addListener) systemThemeQuery.addListener(systemThemeListener);
    }

    function destroy() {
      if (!systemThemeQuery || !systemThemeListener) return;
      if (systemThemeQuery.removeEventListener) systemThemeQuery.removeEventListener('change', systemThemeListener);
      else if (systemThemeQuery.removeListener) systemThemeQuery.removeListener(systemThemeListener);
      systemThemeQuery = null;
      systemThemeListener = null;
    }

    return { applyTheme, renderChoices, setThemePreference, bindSystemThemeListener, destroy };
  }

  const api = { options, normalizeThemePreference, themeOptionById, resolveThemePreference, createThemeController };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.theme = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
