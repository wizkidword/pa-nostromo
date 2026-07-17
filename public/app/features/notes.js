(function installMissionControlNotesFeature(global) {
  'use strict';

  const editableFields = new Set(['title', 'body', 'projectId']);

  function isToday(iso, currentDate = new Date()) {
    const date = new Date(iso || Date.now());
    return date.getFullYear() === currentDate.getFullYear()
      && date.getMonth() === currentDate.getMonth()
      && date.getDate() === currentDate.getDate();
  }

  function filterNotes(notes, { search = '', filter = 'all', currentDate = new Date() } = {}) {
    const normalizedSearch = String(search || '').toLowerCase();
    return notes.filter((note) => {
      const haystack = `${note.title || ''} ${note.body || ''}`.toLowerCase();
      if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
      if (filter === 'pinned' && !note.pinned) return false;
      if (filter === 'today' && !isToday(note.updatedAt, currentDate)) return false;
      if (filter === 'backlog' && isToday(note.updatedAt, currentDate)) return false;
      return true;
    });
  }

  function createNote({ notes, id, now, defaultProjectId = '' }) {
    if (!Array.isArray(notes)) throw new Error('Notes feature requires a notes array.');
    if (typeof id !== 'function' || typeof now !== 'function') {
      throw new Error('Notes feature requires id and now functions.');
    }
    const timestamp = now();
    const note = {
      id: id(),
      title: '',
      body: '',
      projectId: defaultProjectId,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    notes.unshift(note);
    return note;
  }

  function updateNote(note, field, value, now) {
    if (!note || !editableFields.has(field) || typeof now !== 'function') return false;
    note[field] = String(value || '');
    note.updatedAt = now();
    return true;
  }

  function createTaskFromNote({ note, tasks, projects, settings, id, now }) {
    if (!note || !Array.isArray(tasks) || !Array.isArray(projects)) return null;
    if (typeof id !== 'function' || typeof now !== 'function') {
      throw new Error('Notes feature requires id and now functions.');
    }
    const timestamp = now();
    const task = {
      id: id(),
      title: note.title || 'Task from note',
      projectId: note.projectId || projects[0]?.id,
      column: settings?.defaultTaskColumn || 'inbox',
      blockerType: null,
      owner: 'Rowan',
      nextAction: (note.body || 'Review note and define first action').slice(0, 140),
      dueDate: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    tasks.push(task);
    return task;
  }

  function createNotesController({
    document: documentRef,
    getState,
    id,
    now,
    escapeText,
    escapeAttribute,
    escapeHtml,
    renderFormattedText,
    markdownToolbarButtons,
    bindMarkdownToolbar,
    save,
    commitState,
    deleteWithUndo,
  }) {
    let bindings = [];

    function state() {
      const current = getState?.();
      if (!Array.isArray(current?.notes) || !Array.isArray(current?.tasks) || !Array.isArray(current?.projects)) {
        throw new Error('Notes feature requires notes, tasks, and projects dashboard state.');
      }
      return current;
    }

    function renderCard(note, projects) {
      const options = projects
        .map((project) => `<option value="${escapeAttribute(project.id)}" ${project.id === note.projectId ? 'selected' : ''}>${escapeText(project.name)}</option>`)
        .join('');
      return `<div class="note-card ${note.pinned ? 'pinned' : ''}" data-note-id="${escapeAttribute(note.id)}">
        <div class="note-top">
          <strong>${escapeText(note.title || 'Quick Note')}</strong>
          <span class="note-meta">${new Date(note.updatedAt).toLocaleString()}</span>
        </div>
        <input data-field="title" value="${escapeHtml(note.title || '')}" placeholder="Note title" />
        <div class="md-toolbar" data-editor-toolbar>
          ${markdownToolbarButtons()}
        </div>
        <textarea data-field="body" rows="4" placeholder="Type your note...">${escapeHtml(note.body || '')}</textarea>
        <div class="md-preview" data-rendered="body">${renderFormattedText(note.body || '')}</div>
        <div class="note-actions">
          <select data-field="projectId">${options}</select>
          <div class="note-action-buttons">
            <button class="btn note-pin" data-action="pin">${note.pinned ? 'Unpin' : 'Pin'}</button>
            <button class="btn" data-action="to-task">To Task</button>
            <button class="btn note-delete" data-action="delete">Delete</button>
          </div>
        </div>
      </div>`;
    }

    function noteFromEvent(event) {
      const card = event.target?.closest?.('.note-card');
      return state().notes.find((note) => note.id === card?.dataset?.noteId) || null;
    }

    function bindRenderedCards(boards) {
      for (const board of boards) {
        board.querySelectorAll?.('[data-field]').forEach((element) => {
          element.addEventListener('input', (event) => {
            const note = noteFromEvent(event);
            const field = event.target?.dataset?.field;
            if (!updateNote(note, field, event.target?.value, now)) return;
            if (field === 'body') {
              const preview = event.target.closest('.note-card')?.querySelector?.('[data-rendered="body"]');
              if (preview) preview.innerHTML = renderFormattedText(event.target.value);
            }
            save();
          });
          element.addEventListener('change', (event) => {
            const note = noteFromEvent(event);
            if (!updateNote(note, event.target?.dataset?.field, event.target?.value, now)) return;
            save();
            render();
          });
        });

        board.querySelectorAll?.('[data-editor-toolbar]').forEach((toolbar) => {
          bindMarkdownToolbar(toolbar, (button) => button.closest('.note-card')?.querySelector('textarea[data-field="body"]') || null, (input, button) => {
            const note = state().notes.find((item) => item.id === button.closest('.note-card')?.dataset?.noteId);
            if (!updateNote(note, 'body', input.value, now)) return;
            const preview = button.closest('.note-card')?.querySelector?.('[data-rendered="body"]');
            if (preview) preview.innerHTML = renderFormattedText(input.value);
            save();
          });
        });

        board.querySelectorAll?.('[data-action="delete"]').forEach((button) => {
          button.addEventListener('click', (event) => {
            const card = event.target?.closest?.('.note-card');
            deleteWithUndo({
              collection: () => state().notes,
              itemId: card?.dataset?.noteId,
              reason: 'note_deleted',
              commit: commitState,
              buildUndoLabel: (note) => `Note deleted (${(note?.title || 'Quick Note').slice(0, 30)}). Undo?`,
            });
          });
        });

        board.querySelectorAll?.('[data-action="pin"]').forEach((button) => {
          button.addEventListener('click', (event) => {
            const note = noteFromEvent(event);
            if (!note) return;
            note.pinned = !note.pinned;
            note.updatedAt = now();
            commitState('note_pin_toggled');
          });
        });

        board.querySelectorAll?.('[data-action="to-task"]').forEach((button) => {
          button.addEventListener('click', (event) => {
            const current = state();
            const note = noteFromEvent(event);
            const task = createTaskFromNote({
              note,
              tasks: current.tasks,
              projects: current.projects,
              settings: current.settings,
              id,
              now,
            });
            if (task) commitState('note_converted_to_task');
          });
        });
      }
    }

    function render() {
      const todayBoard = documentRef?.getElementById?.('notesBoardToday');
      const backlogBoard = documentRef?.getElementById?.('notesBoardBacklog');
      if (!todayBoard || !backlogBoard) return;
      const search = documentRef.getElementById('notesSearch')?.value || '';
      const filter = documentRef.getElementById('notesFilter')?.value || 'all';
      const current = state();
      const filtered = filterNotes(current.notes, { search, filter });
      todayBoard.innerHTML = filtered.filter((note) => isToday(note.updatedAt)).map((note) => renderCard(note, current.projects)).join('') || '<small class="note-meta">No notes for today.</small>';
      backlogBoard.innerHTML = filtered.filter((note) => !isToday(note.updatedAt)).map((note) => renderCard(note, current.projects)).join('') || '<small class="note-meta">No backlog notes.</small>';
      bindRenderedCards([todayBoard, backlogBoard]);
    }

    function create() {
      const current = state();
      return createNote({
        notes: current.notes,
        id,
        now,
        defaultProjectId: current.projects[0]?.id || '',
      });
    }

    function bind() {
      if (bindings.length) return;
      const addButton = documentRef?.getElementById?.('addNoteBtn');
      const searchInput = documentRef?.getElementById?.('notesSearch');
      const filterSelect = documentRef?.getElementById?.('notesFilter');
      const clearButton = documentRef?.getElementById?.('notesClearFiltersBtn');
      const addBinding = () => {
        create();
        commitState('note_added');
      };
      const renderBinding = () => render();
      const clearBinding = () => {
        if (searchInput) searchInput.value = '';
        if (filterSelect) filterSelect.value = 'all';
        render();
      };

      for (const [target, eventName, listener] of [
        [addButton, 'click', addBinding],
        [searchInput, 'input', renderBinding],
        [filterSelect, 'change', renderBinding],
        [clearButton, 'click', clearBinding],
      ]) {
        if (!target?.addEventListener) continue;
        target.addEventListener(eventName, listener);
        bindings.push([target, eventName, listener]);
      }
    }

    function destroy() {
      for (const [target, eventName, listener] of bindings) {
        target.removeEventListener?.(eventName, listener);
      }
      bindings = [];
    }

    return { render, create, bind, destroy };
  }

  const api = { isToday, filterNotes, createNote, updateNote, createTaskFromNote, createNotesController };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.notes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
