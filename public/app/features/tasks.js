(function installMissionControlTasksFeature(global) {
  'use strict';

  const columns = Object.freeze([
    ['inbox', 'Inbox'],
    ['in_progress', 'In Progress'],
    ['waiting_blocked', 'Debugging'],
    ['ready_to_publish', 'Ready to Publish'],
    ['done', 'Done'],
  ]);
  const columnKeys = new Set(columns.map(([key]) => key));
  const blockerTypes = new Set(['approval', 'dependency', 'error']);

  function normalizeTaskColumn(column) {
    const key = String(column || '').trim();
    return columnKeys.has(key) ? key : 'inbox';
  }

  function normalizeTaskDraft(input = {}, defaultColumn = 'inbox') {
    const blockerType = String(input.blockerType || '').trim();
    return {
      title: String(input.title || '').trim(),
      projectId: String(input.projectId || '').trim(),
      column: normalizeTaskColumn(input.column || defaultColumn),
      blockerType: blockerTypes.has(blockerType) ? blockerType : null,
      owner: String(input.owner || '').trim() || 'Rowan',
      nextAction: String(input.nextAction || '').trim(),
      dueDate: String(input.dueDate || '').trim(),
    };
  }

  function createTask({ tasks, id, now, values, defaultColumn = 'inbox' }) {
    if (!Array.isArray(tasks)) throw new Error('Tasks feature requires a tasks array.');
    if (typeof id !== 'function' || typeof now !== 'function') {
      throw new Error('Tasks feature requires id and now functions.');
    }
    const draft = normalizeTaskDraft(values, defaultColumn);
    if (!draft.title || !draft.nextAction) return { created: false, error: 'title_and_next_action_required' };
    const timestamp = now();
    const task = { id: id(), ...draft, createdAt: timestamp, updatedAt: timestamp };
    tasks.push(task);
    return { created: true, task };
  }

  function updateTask(task, { values, now, defaultColumn = 'inbox' }) {
    if (!task || typeof now !== 'function') return { updated: false, error: 'task_not_found' };
    const draft = normalizeTaskDraft(values, defaultColumn);
    if (!draft.title || !draft.nextAction) return { updated: false, error: 'title_and_next_action_required' };
    Object.assign(task, draft, { updatedAt: now() });
    return { updated: true, task };
  }

  function moveTask(task, column, now) {
    if (!task || typeof now !== 'function') return false;
    task.column = normalizeTaskColumn(column);
    task.updatedAt = now();
    return true;
  }

  function titleCase(value) {
    const text = String(value || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  function createTasksController({
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
    projectName,
    commitState,
    deleteWithUndo,
    logChange = () => {},
    confirm = () => true,
    getFormValues = (form) => Object.fromEntries(new FormData(form)),
  }) {
    let staticBindings = [];
    let boardBindings = [];
    let toolbarCleanup = null;

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
      if (!Array.isArray(current?.tasks) || !Array.isArray(current?.projects)) {
        throw new Error('Tasks feature requires tasks and projects dashboard state.');
      }
      return current;
    }

    function taskCard(task) {
      const chips = [`<span class="chip">${escapeText(projectName(task.projectId))}</span>`];
      if (task.column === 'waiting_blocked') chips.push('<span class="chip high">High</span>');
      if (task.blockerType) {
        chips.push(`<span class="chip ${escapeAttribute(task.blockerType)}">${escapeText(titleCase(task.blockerType))}</span>`);
      }
      return `<div class="task" draggable="true" data-id="${escapeAttribute(task.id)}">
        <div class="task-top-row">
          <strong>${escapeHtml(task.title)}</strong>
          <button type="button" class="btn ghost task-edit-btn" data-id="${escapeAttribute(task.id)}" draggable="false">Edit</button>
        </div>
        <div class="task-next-action md-preview">${renderFormattedText(task.nextAction || '')}</div>
        <small>Owner: ${escapeHtml(task.owner || 'Rowan')}</small>
        ${task.dueDate ? `<small>Due: ${escapeHtml(task.dueDate)}</small>` : ''}
        <div class="task-chips">${chips.join('')}</div>
      </div>`;
    }

    function bindRenderedBoard(board) {
      clearBindings(boardBindings);
      board.querySelectorAll?.('.task').forEach((element) => {
        listen(element, 'dragstart', (event) => {
          event.dataTransfer?.setData('text/plain', element.dataset.id);
          element.classList.add('dragging');
        }, boardBindings);
        listen(element, 'dragend', () => element.classList.remove('dragging'), boardBindings);
      });

      board.querySelectorAll?.('.task-edit-btn').forEach((button) => {
        ['mousedown', 'pointerdown', 'dragstart'].forEach((eventName) => {
          listen(button, eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
          }, boardBindings);
        });
        listen(button, 'click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openEditDialog(button.dataset.id);
        }, boardBindings);
      });

      board.querySelectorAll?.('.drop').forEach((dropTarget) => {
        listen(dropTarget, 'dragenter', () => dropTarget.classList.add('is-over'), boardBindings);
        listen(dropTarget, 'dragover', (event) => event.preventDefault(), boardBindings);
        listen(dropTarget, 'dragleave', () => dropTarget.classList.remove('is-over'), boardBindings);
        listen(dropTarget, 'drop', (event) => {
          event.preventDefault();
          dropTarget.classList.remove('is-over');
          const taskId = event.dataTransfer?.getData('text/plain');
          const task = state().tasks.find((item) => item.id === taskId);
          if (!moveTask(task, dropTarget.dataset.col, now)) return;
          commitState('task_column_changed_drag');
        }, boardBindings);
      });
    }

    function render() {
      const board = documentRef?.getElementById?.('board');
      if (!board) return;
      const tasks = state().tasks;
      board.innerHTML = columns.map(([key, label]) => {
        const columnTasks = tasks.filter((task) => task.column === key);
        return `<div class="col"><div class="col-head"><h3>${label}</h3><span class="col-count">${columnTasks.length}</span></div><div class="drop" data-col="${key}">${columnTasks.map(taskCard).join('')}</div></div>`;
      }).join('');
      bindRenderedBoard(board);
    }

    function populateProjectSelects() {
      const options = state().projects
        .map((project) => `<option value="${escapeAttribute(project.id)}">${escapeText(project.name)}</option>`)
        .join('');
      const newTaskSelect = documentRef?.getElementById?.('taskProject');
      const editTaskSelect = documentRef?.getElementById?.('editTaskProject');
      if (newTaskSelect) newTaskSelect.innerHTML = options;
      if (editTaskSelect) editTaskSelect.innerHTML = options;
    }

    function applyDefaultColumn({ force = false } = {}) {
      const select = documentRef?.querySelector?.('#taskForm select[name="column"]');
      if (select && (force || !select.value)) select.value = normalizeTaskColumn(state().settings?.defaultTaskColumn);
    }

    function openEditDialog(taskId) {
      const task = state().tasks.find((item) => item.id === taskId);
      const dialog = documentRef?.getElementById?.('editTaskDialog');
      const form = documentRef?.getElementById?.('editTaskForm');
      if (!task || !dialog || !form) return;
      populateProjectSelects();
      form.elements.id.value = task.id;
      form.elements.title.value = task.title || '';
      form.elements.projectId.value = task.projectId || state().projects[0]?.id || '';
      form.elements.column.value = normalizeTaskColumn(task.column);
      form.elements.blockerType.value = task.blockerType || '';
      form.elements.owner.value = task.owner || 'Rowan';
      form.elements.nextAction.value = task.nextAction || '';
      form.elements.dueDate.value = task.dueDate || '';
      const preview = documentRef.getElementById('editTaskNextActionPreview');
      if (preview) preview.innerHTML = renderFormattedText(task.nextAction || '');
      dialog.showModal?.();
    }

    function bind() {
      if (staticBindings.length) return;
      const newTaskDialog = documentRef?.getElementById?.('taskDialog');
      const editTaskDialog = documentRef?.getElementById?.('editTaskDialog');
      const taskForm = documentRef?.getElementById?.('taskForm');
      const editTaskForm = documentRef?.getElementById?.('editTaskForm');
      const addButton = documentRef?.getElementById?.('addTaskBtn');
      const editCancelButton = documentRef?.getElementById?.('editTaskCancelBtn');
      const editDeleteButton = documentRef?.getElementById?.('editTaskDeleteBtn');
      const nextActionInput = documentRef?.getElementById?.('editTaskNextAction');
      const nextActionPreview = documentRef?.getElementById?.('editTaskNextActionPreview');
      const toolbar = documentRef?.getElementById?.('editTaskToolbar');

      listen(addButton, 'click', () => newTaskDialog?.showModal?.(), staticBindings);
      listen(editCancelButton, 'click', () => editTaskDialog?.close?.(), staticBindings);
      listen(editDeleteButton, 'click', () => {
        const taskId = String(editTaskForm?.elements?.id?.value || '').trim();
        const task = state().tasks.find((item) => item.id === taskId);
        if (!task || !confirm(`Delete task "${task.title}"?`)) return;
        const deleted = deleteWithUndo({
          collection: () => state().tasks,
          itemId: taskId,
          reason: 'task_deleted',
          commit: commitState,
          buildUndoLabel: () => `Task deleted (${task.title.slice(0, 30)}). Undo?`,
        });
        if (deleted) editTaskDialog?.close?.();
      }, staticBindings);
      listen(nextActionInput, 'input', () => {
        if (nextActionPreview) nextActionPreview.innerHTML = renderFormattedText(nextActionInput.value || '');
      }, staticBindings);
      listen(taskForm, 'submit', (event) => {
        event.preventDefault();
        const current = state();
        const result = createTask({
          tasks: current.tasks,
          id,
          now,
          values: getFormValues(event.currentTarget),
          defaultColumn: current.settings?.defaultTaskColumn,
        });
        if (!result.created) return;
        newTaskDialog?.close?.();
        event.currentTarget?.reset?.();
        applyDefaultColumn({ force: true });
        commitState('task_created');
      }, staticBindings);
      listen(editTaskForm, 'submit', (event) => {
        event.preventDefault();
        const values = getFormValues(event.currentTarget);
        const task = state().tasks.find((item) => item.id === values.id);
        if (!task) {
          editTaskDialog?.close?.();
          return;
        }
        const result = updateTask(task, {
          values,
          now,
          defaultColumn: state().settings?.defaultTaskColumn,
        });
        if (!result.updated) return;
        editTaskDialog?.close?.();
        logChange(`Edited task: ${task.title}`);
        commitState('task_edited');
      }, staticBindings);
      if (toolbar) {
        toolbar.innerHTML = markdownToolbarButtons();
        toolbarCleanup = bindMarkdownToolbar(toolbar, () => nextActionInput);
      }
      applyDefaultColumn({ force: true });
    }

    function destroy() {
      clearBindings(staticBindings);
      clearBindings(boardBindings);
      toolbarCleanup?.();
      toolbarCleanup = null;
    }

    return { render, populateProjectSelects, applyDefaultColumn, openEditDialog, bind, destroy };
  }

  const api = { columns, normalizeTaskColumn, normalizeTaskDraft, createTask, updateTask, moveTask, createTasksController };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.tasks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
