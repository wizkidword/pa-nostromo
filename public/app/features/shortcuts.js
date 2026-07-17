(function installMissionControlShortcutsFeature(global) {
  'use strict';

  function uniqueProjectIds(projectIds, globalProjectId) {
    const ids = Array.isArray(projectIds) ? projectIds : [];
    const normalized = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    return normalized.length ? normalized : [globalProjectId];
  }

  function extractUrlFromDrop(dataTransfer) {
    if (!dataTransfer) return '';
    const uriList = String(dataTransfer.getData('text/uri-list') || '').trim();
    if (uriList) {
      const firstUrl = uriList
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'));
      if (firstUrl) return firstUrl;
    }
    const plain = String(dataTransfer.getData('text/plain') || '').trim();
    if (/^https?:\/\//i.test(plain)) return plain;
    const html = String(dataTransfer.getData('text/html') || '');
    return html.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || '';
  }

  function suggestShortcutTitle(url, fallbackText = '') {
    const fallback = String(fallbackText || '').trim();
    if (fallback && !/^https?:\/\//i.test(fallback)) return fallback.slice(0, 90);
    try {
      const parsed = new URL(String(url || '').trim());
      const host = parsed.hostname.replace(/^www\./, '');
      const firstSegment = parsed.pathname.split('/').filter(Boolean)[0] || '';
      return firstSegment ? `${host} / ${decodeURIComponent(firstSegment).slice(0, 48)}` : host;
    } catch {
      return 'New Shortcut';
    }
  }

  function normalizeShortcutDraft(values = {}, { safeExternalUrl, globalProjectId } = {}) {
    const url = typeof safeExternalUrl === 'function' ? safeExternalUrl(String(values.url || '')) : '';
    return {
      title: String(values.title || '').trim(),
      url,
      category: String(values.category || '').trim(),
      projectIds: uniqueProjectIds(values.projectIds, globalProjectId),
      enabled: values.enabled === true || values.enabled === 'on',
    };
  }

  function createShortcut({ shortcuts, id, now, values, safeExternalUrl, globalProjectId }) {
    if (!Array.isArray(shortcuts)) throw new Error('Shortcuts feature requires a shortcuts array.');
    if (typeof id !== 'function' || typeof now !== 'function') {
      throw new Error('Shortcuts feature requires id and now functions.');
    }
    const draft = normalizeShortcutDraft(values, { safeExternalUrl, globalProjectId });
    if (!draft.title || !draft.url) return { created: false, error: 'title_and_safe_url_required' };
    const timestamp = now();
    const shortcut = { id: id(), ...draft, createdAt: timestamp, updatedAt: timestamp };
    shortcuts.push(shortcut);
    return { created: true, shortcut };
  }

  function updateShortcut(shortcut, { values, now, safeExternalUrl, globalProjectId }) {
    if (!shortcut || typeof now !== 'function') return { updated: false, error: 'shortcut_not_found' };
    const draft = normalizeShortcutDraft(values, { safeExternalUrl, globalProjectId });
    if (!draft.title || !draft.url) return { updated: false, error: 'title_and_safe_url_required' };
    Object.assign(shortcut, draft, { updatedAt: now() });
    return { updated: true, shortcut };
  }

  function createShortcutsController({
    document: documentRef,
    getState,
    id,
    now,
    globalProjectId,
    safeExternalUrl,
    escapeText,
    escapeAttribute,
    escapeHtml,
    projectDisplayName,
    commitState,
    deleteWithUndo,
    logChange = () => {},
    confirm = () => true,
    alert = () => {},
    getFormValues = (form) => Object.fromEntries(new FormData(form)),
  }) {
    let staticBindings = [];
    let podBindings = [];
    let settingsBindings = [];

    function clearBindings(bindings) {
      for (const [target, eventName, listener] of bindings) {
        target.removeEventListener?.(eventName, listener);
      }
      bindings.length = 0;
    }

    function listen(target, eventName, listener, bindings) {
      if (!target?.addEventListener) return;
      target.addEventListener(eventName, listener);
      bindings.push([target, eventName, listener]);
    }

    function state() {
      const current = getState?.();
      if (!Array.isArray(current?.shortcuts) || !Array.isArray(current?.projects)) {
        throw new Error('Shortcuts feature requires shortcuts and projects dashboard state.');
      }
      return current;
    }

    function assignmentOptions() {
      return [
        { id: globalProjectId, name: 'Global (Mission Control)' },
        ...state().projects.map((project) => ({ id: project.id, name: project.name })),
      ];
    }

    function renderProjectChecklist(targetId, selectedIds = []) {
      const wrap = documentRef?.getElementById?.(targetId);
      if (!wrap) return;
      const selected = new Set(uniqueProjectIds(selectedIds, globalProjectId));
      wrap.innerHTML = assignmentOptions().map((project) => `
        <label class="shortcut-check-row">
          <input type="checkbox" value="${escapeAttribute(project.id)}" ${selected.has(project.id) ? 'checked' : ''} />
          <span class="shortcut-check-label">${escapeText(project.name)}</span>
        </label>
      `).join('');
    }

    function renderPod() {
      const wrap = documentRef?.getElementById?.('shortcutsWidget');
      if (!wrap) return;
      clearBindings(podBindings);
      const visible = state().shortcuts.filter((shortcut) => shortcut.enabled !== false);
      const cards = visible.length
        ? visible.map((shortcut) => {
          const href = safeExternalUrl(shortcut.url);
          if (!href) return `<div class="shortcut-link is-disabled"><strong>${escapeText(shortcut.title)}</strong><span>Blocked unsafe URL</span></div>`;
          return `<a class="shortcut-link" data-shortcut-id="${escapeAttribute(shortcut.id)}" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">
            <strong>${escapeText(shortcut.title)}</strong>
            <span>${escapeText(shortcut.category || 'Shortcut')}</span>
          </a>`;
        }).join('')
        : '<div class="note-meta">No shortcuts yet. Drop a link below or add one in Settings.</div>';
      wrap.innerHTML = `
        <div id="shortcutDropzone" class="shortcut-dropzone" title="Drop bookmark/link here to create a shortcut">
          Drop a bookmark or link here to create a shortcut
        </div>
        <div class="shortcut-links">${cards}</div>
      `;
      const dropzone = wrap.querySelector?.('#shortcutDropzone');
      if (!dropzone) return;
      const setOver = (isOver) => dropzone.classList.toggle('is-over', !!isOver);
      listen(dropzone, 'dragenter', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(true);
      }, podBindings);
      listen(dropzone, 'dragover', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(true);
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      }, podBindings);
      listen(dropzone, 'dragleave', () => setOver(false), podBindings);
      listen(dropzone, 'drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const url = extractUrlFromDrop(event.dataTransfer);
        const title = suggestShortcutTitle(url, event.dataTransfer?.getData('text/plain'));
        const result = createShortcut({
          shortcuts: state().shortcuts,
          id,
          now,
          values: { title, url, category: 'Bookmark', projectIds: [globalProjectId], enabled: true },
          safeExternalUrl,
          globalProjectId,
        });
        if (!result.created) return;
        logChange(`Created shortcut from drop: ${title}`);
        commitState('shortcut_created_from_drop');
      }, podBindings);
    }

    function renderSettings() {
      const wrap = documentRef?.getElementById?.('settingsShortcutsList');
      if (!wrap) return;
      clearBindings(settingsBindings);
      const rows = state().shortcuts
        .slice()
        .sort((left, right) => (left.title || '').localeCompare(right.title || ''))
        .map((shortcut) => `
          <div class="change-log-item">
            <div class="row-between-wrap gap10">
              <strong>${escapeHtml(shortcut.title)}</strong>
              <span class="badge">${shortcut.enabled === false ? 'Disabled' : 'Enabled'}</span>
            </div>
            <div class="note-meta mt6">${escapeHtml(shortcut.category || 'No category')} · ${(shortcut.projectIds || []).map(projectDisplayName).map(escapeHtml).join(', ')}</div>
            <div class="shortcut-admin-actions mt8">
              <button class="btn ghost" data-shortcut-edit="${escapeAttribute(shortcut.id)}" type="button">Edit</button>
              <button class="btn ghost" data-shortcut-toggle="${escapeAttribute(shortcut.id)}" type="button">${shortcut.enabled === false ? 'Enable' : 'Disable'}</button>
              <button class="btn note-delete" data-shortcut-delete="${escapeAttribute(shortcut.id)}" type="button">Delete</button>
            </div>
          </div>
        `).join('');
      wrap.innerHTML = rows || '<div class="note-meta">No shortcuts yet. Add one to get started.</div>';
      wrap.querySelectorAll?.('[data-shortcut-edit]').forEach((button) => {
        listen(button, 'click', () => openDialog(button.dataset.shortcutEdit), settingsBindings);
      });
      wrap.querySelectorAll?.('[data-shortcut-toggle]').forEach((button) => {
        listen(button, 'click', () => {
          const shortcut = state().shortcuts.find((item) => item.id === button.dataset.shortcutToggle);
          if (!shortcut) return;
          shortcut.enabled = shortcut.enabled === false;
          shortcut.updatedAt = now();
          logChange(`${shortcut.enabled ? 'Enabled' : 'Disabled'} shortcut: ${shortcut.title}`);
          commitState('shortcut_toggled');
        }, settingsBindings);
      });
      wrap.querySelectorAll?.('[data-shortcut-delete]').forEach((button) => {
        listen(button, 'click', () => {
          const shortcut = state().shortcuts.find((item) => item.id === button.dataset.shortcutDelete);
          if (!shortcut || !confirm(`Delete shortcut "${shortcut.title}"?`)) return;
          deleteWithUndo({
            collection: () => state().shortcuts,
            itemId: shortcut.id,
            reason: 'shortcut_deleted',
            buildUndoLabel: () => `Shortcut deleted (${shortcut.title}). Undo?`,
          });
          logChange(`Deleted shortcut: ${shortcut.title}`);
        }, settingsBindings);
      });
    }

    function openDialog(shortcutId = '') {
      const dialog = documentRef?.getElementById?.('shortcutDialog');
      const form = documentRef?.getElementById?.('shortcutForm');
      if (!dialog || !form) return;
      const shortcut = shortcutId ? state().shortcuts.find((item) => item.id === shortcutId) : null;
      form.elements.id.value = shortcut?.id || '';
      form.elements.title.value = shortcut?.title || '';
      form.elements.url.value = shortcut?.url || '';
      form.elements.category.value = shortcut?.category || '';
      form.elements.enabled.checked = shortcut ? shortcut.enabled !== false : true;
      const missionProjectId = state().projects.find((project) => project.name === 'Mission Control Dashboard')?.id || '';
      const defaults = shortcut?.projectIds?.length
        ? shortcut.projectIds
        : [missionProjectId, globalProjectId].filter(Boolean);
      renderProjectChecklist('shortcutProjectChecklist', defaults);
      const title = documentRef.getElementById('shortcutDialogTitle');
      if (title) title.textContent = shortcut ? 'Edit Shortcut' : 'New Shortcut';
      dialog.showModal?.();
    }

    function selectedProjectIds() {
      const selected = [...(documentRef?.querySelectorAll?.('#shortcutProjectChecklist input[type="checkbox"]:checked') || [])]
        .map((element) => element.value)
        .filter(Boolean);
      return uniqueProjectIds(selected, globalProjectId);
    }

    function bind() {
      if (staticBindings.length) return;
      const dialog = documentRef?.getElementById?.('shortcutDialog');
      const form = documentRef?.getElementById?.('shortcutForm');
      const addButton = documentRef?.getElementById?.('addShortcutBtn');
      const cancelButton = documentRef?.getElementById?.('shortcutCancelBtn');
      listen(addButton, 'click', () => openDialog(), staticBindings);
      listen(cancelButton, 'click', () => dialog?.close?.(), staticBindings);
      listen(form, 'submit', (event) => {
        event.preventDefault();
        const values = { ...getFormValues(event.currentTarget), projectIds: selectedProjectIds() };
        const existing = state().shortcuts.find((item) => item.id === values.id);
        const result = existing
          ? updateShortcut(existing, { values, now, safeExternalUrl, globalProjectId })
          : createShortcut({ shortcuts: state().shortcuts, id, now, values, safeExternalUrl, globalProjectId });
        if (!result.created && !result.updated) {
          alert('Shortcut URLs must be valid http(s) links without embedded credentials.');
          return;
        }
        logChange(`${existing ? 'Edited' : 'Created'} shortcut: ${result.shortcut.title}`);
        dialog?.close?.();
        commitState('shortcut_form_submitted');
      }, staticBindings);
    }

    function destroy() {
      clearBindings(staticBindings);
      clearBindings(podBindings);
      clearBindings(settingsBindings);
    }

    return { renderPod, renderSettings, renderProjectChecklist, openDialog, bind, destroy };
  }

  const api = { uniqueProjectIds, extractUrlFromDrop, suggestShortcutTitle, normalizeShortcutDraft, createShortcut, updateShortcut, createShortcutsController };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.shortcuts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
