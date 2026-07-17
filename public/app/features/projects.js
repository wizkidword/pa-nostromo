(function installMissionControlProjectsFeature(global) {
  'use strict';

  const validStatuses = new Set(['active', 'planning', 'paused']);

  function normalizeProjectDraft(input = {}) {
    const status = String(input.status || '').trim().toLowerCase();
    return {
      name: String(input.name || '').trim(),
      summary: String(input.summary || '').trim(),
      status: validStatuses.has(status) ? status : 'active',
      appLink: String(input.appLink || '').trim(),
      repoLink: String(input.repoLink || '').trim(),
    };
  }

  function createProject({ projects, id, now, values }) {
    if (!Array.isArray(projects)) throw new Error('Projects feature requires a projects array.');
    if (typeof id !== 'function' || typeof now !== 'function') {
      throw new Error('Projects feature requires id and now functions.');
    }

    const draft = normalizeProjectDraft(values);
    if (!draft.name || !draft.summary) {
      return { created: false, error: 'name_and_summary_required' };
    }

    const project = { id: id(), ...draft, lastUpdated: now() };
    projects.push(project);
    return { created: true, project };
  }

  function projectNameById(projects, projectId) {
    return projects.find((project) => project.id === projectId)?.name || 'Unknown';
  }

  function projectDisplayNameById(projects, projectId, globalProjectId) {
    if (projectId === globalProjectId) return 'Global (Mission Control)';
    return projectNameById(projects, projectId);
  }

  function createProjectsController({
    document: documentRef,
    getState,
    id,
    now,
    escapeText,
    escapeAttribute,
    safeExternalUrl,
    onProjectCreated = () => {},
    getFormValues = (form) => Object.fromEntries(new FormData(form)),
  }) {
    let bindings = [];

    function projects() {
      const collection = getState?.()?.projects;
      if (!Array.isArray(collection)) throw new Error('Projects feature requires dashboard projects state.');
      return collection;
    }

    function render() {
      const wrap = documentRef?.getElementById?.('projectDirectory');
      if (!wrap) return;
      wrap.innerHTML = projects().map((project) => {
        const appHref = safeExternalUrl(project.appLink);
        const repoHref = safeExternalUrl(project.repoLink);
        return `
          <div class="project-item" data-project-id="${escapeAttribute(project.id)}" tabindex="-1">
            <div class="project-item-head">
              <strong>${escapeText(project.name)}</strong>
              <span class="badge">${escapeText(project.status)}</span>
            </div>
            <p class="project-item-summary">${escapeText(project.summary)}</p>
            <small>Updated: ${new Date(project.lastUpdated).toLocaleString()}</small>
            <div class="project-item-actions">
              ${appHref ? `<a class="btn ghost" href="${escapeAttribute(appHref)}" target="_blank" rel="noopener noreferrer">App</a>` : ''}
              ${repoHref ? `<a class="btn ghost" href="${escapeAttribute(repoHref)}" target="_blank" rel="noopener noreferrer">Repo</a>` : ''}
            </div>
          </div>`;
      }).join('');
    }

    function create(values) {
      return createProject({ projects: projects(), id, now, values });
    }

    function bind() {
      if (bindings.length) return;
      const dialog = documentRef?.getElementById?.('projectDialog');
      const addButton = documentRef?.getElementById?.('addProjectBtn');
      const cancelButton = documentRef?.getElementById?.('projectCancelBtn');
      const form = documentRef?.getElementById?.('projectForm');

      const addBinding = () => dialog?.showModal?.();
      const cancelBinding = () => dialog?.close?.();
      const submitBinding = (event) => {
        event.preventDefault();
        const result = create(getFormValues(event.currentTarget));
        if (!result.created) return;
        dialog?.close?.();
        event.currentTarget?.reset?.();
        onProjectCreated({ project: result.project });
      };

      if (addButton?.addEventListener) {
        addButton.addEventListener('click', addBinding);
        bindings.push([addButton, 'click', addBinding]);
      }
      if (cancelButton?.addEventListener) {
        cancelButton.addEventListener('click', cancelBinding);
        bindings.push([cancelButton, 'click', cancelBinding]);
      }
      if (form?.addEventListener) {
        form.addEventListener('submit', submitBinding);
        bindings.push([form, 'submit', submitBinding]);
      }
    }

    function destroy() {
      for (const [target, eventName, listener] of bindings) {
        target.removeEventListener?.(eventName, listener);
      }
      bindings = [];
    }

    return {
      render,
      create,
      bind,
      destroy,
      projectName: (projectId) => projectNameById(projects(), projectId),
      projectDisplayName: (projectId, globalProjectId) => projectDisplayNameById(projects(), projectId, globalProjectId),
    };
  }

  const api = {
    normalizeProjectDraft,
    createProject,
    projectNameById,
    projectDisplayNameById,
    createProjectsController,
  };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.projects = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
