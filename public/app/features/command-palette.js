(function installMissionControlCommandPaletteFeature(global) {
  'use strict';

  const RESULT_LIMIT = 30;
  const RESULT_TYPE_ORDER = Object.freeze(['command', 'project', 'task', 'note', 'reminder', 'shortcut', 'rss', 'email', 'integration']);
  const RESULT_TYPE_LABELS = Object.freeze({
    command: 'Command',
    project: 'Project',
    task: 'Task',
    note: 'Note',
    reminder: 'Reminder',
    shortcut: 'Shortcut',
    rss: 'RSS',
    email: 'Email',
    integration: 'Integration',
  });

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeQuery(value) {
    return text(value).toLocaleLowerCase().replace(/\s+/g, ' ');
  }

  function queryTokens(query) {
    return normalizeQuery(query).split(' ').filter(Boolean);
  }

  function sourceKey(type, id) {
    const sourceType = text(type).toLocaleLowerCase();
    const sourceId = text(id);
    return RESULT_TYPE_LABELS[sourceType] && sourceId ? `${sourceType}:${sourceId}` : '';
  }

  function rankMatch(query, title, searchText = '') {
    const normalized = normalizeQuery(query);
    if (!normalized) return 0;
    const normalizedTitle = normalizeQuery(title);
    const normalizedSearchText = normalizeQuery(`${title} ${searchText}`);
    const tokens = queryTokens(normalized);
    if (!tokens.length || !tokens.every((token) => normalizedSearchText.includes(token))) return -1;
    if (normalizedTitle === normalized) return 1000;
    if (normalizedTitle.startsWith(normalized)) return 850;
    if (normalizedTitle.includes(normalized)) return 700;
    const titleTokenMatches = tokens.filter((token) => normalizedTitle.includes(token)).length;
    return 400 + (titleTokenMatches * 30) + (tokens.length * 5);
  }

  function createDefaultCommands({ profilesAvailable = false } = {}) {
    return [
      { id: 'create-task', title: 'Create task…', detail: 'Open the existing task form.', action: 'create-task', searchText: 'new task add task' },
      { id: 'capture-note', title: 'Capture note…', detail: 'Create a local quick note.', action: 'capture-note', searchText: 'new note quick note' },
      { id: 'open-project', title: 'Open project…', detail: 'Browse the Project Directory.', action: 'browse-projects', searchText: 'project directory' },
      { id: 'refresh-email', title: 'Refresh email', detail: 'Refresh the existing local inbox snapshot.', action: 'refresh-email', searchText: 'unread inbox mail' },
      { id: 'show-integration-health', title: 'Show integration health', detail: 'Open the Integration Health settings view.', action: 'show-integration-health', searchText: 'settings diagnostics status' },
      {
        id: 'switch-profile',
        title: 'Switch profile',
        detail: profilesAvailable ? 'Choose the dashboard profile.' : 'Available when Product Profiles ships in Phase 11.4.',
        action: 'switch-profile',
        searchText: 'core seller creator home custom',
        disabled: !profilesAvailable,
      },
    ];
  }

  function createRow({ type, sourceId, title, detail = '', searchText = '', action = '', score = 0, disabled = false, ...rest }) {
    const normalizedType = text(type).toLocaleLowerCase();
    const normalizedSourceId = text(sourceId);
    if (!RESULT_TYPE_LABELS[normalizedType] || !normalizedSourceId || !text(title)) return null;
    return {
      id: sourceKey(normalizedType, normalizedSourceId),
      type: normalizedType,
      sourceId: normalizedSourceId,
      title: text(title),
      detail: text(detail),
      searchText: text(searchText),
      action: text(action),
      score: Number(score) || 0,
      disabled: !!disabled,
      ...rest,
    };
  }

  function matchRow(row, query) {
    const score = rankMatch(query, row.title, `${row.detail} ${row.searchText}`);
    return score < 0 ? null : { ...row, score };
  }

  function projectNameMap(projects) {
    return new Map((Array.isArray(projects) ? projects : []).map((project) => [text(project?.id), text(project?.name) || 'Unknown project']));
  }

  function contentRows({ state = {}, emailPayload = null, integrations = [] } = {}) {
    const projects = Array.isArray(state?.projects) ? state.projects : [];
    const projectNames = projectNameMap(projects);
    const rows = [];

    projects.forEach((project) => {
      rows.push(createRow({
        type: 'project',
        sourceId: project?.id,
        title: project?.name,
        detail: `${text(project?.status) || 'active'}${project?.summary ? ` · ${text(project.summary)}` : ''}`,
        searchText: `${project?.summary || ''} ${project?.status || ''}`,
        action: 'open-project',
      }));
    });

    (Array.isArray(state?.tasks) ? state.tasks : []).forEach((task) => {
      if (text(task?.column) === 'done') return;
      const projectName = projectNames.get(text(task?.projectId)) || 'Unknown project';
      rows.push(createRow({
        type: 'task',
        sourceId: task?.id,
        title: task?.title,
        detail: `${projectName}${task?.dueDate ? ` · Due ${text(task.dueDate)}` : ''}`,
        searchText: `${task?.nextAction || ''} ${task?.owner || ''} ${task?.column || ''} ${projectName}`,
        action: 'open-task',
      }));
    });

    (Array.isArray(state?.notes) ? state.notes : []).forEach((note) => {
      const projectName = projectNames.get(text(note?.projectId)) || 'Quick note';
      rows.push(createRow({
        type: 'note',
        sourceId: note?.id,
        title: note?.title || 'Untitled note',
        detail: projectName,
        searchText: `${note?.body || ''} ${projectName}`,
        action: 'open-note',
      }));
    });

    (Array.isArray(state?.reminders) ? state.reminders : []).forEach((reminder) => {
      const projectName = projectNames.get(text(reminder?.projectId)) || 'Calendar';
      rows.push(createRow({
        type: 'reminder',
        sourceId: reminder?.id,
        title: reminder?.text,
        detail: [text(reminder?.date), text(reminder?.time), projectName].filter(Boolean).join(' · '),
        searchText: `${reminder?.date || ''} ${reminder?.time || ''} ${projectName}`,
        action: 'open-reminder',
        reminderDate: text(reminder?.date),
      }));
    });

    (Array.isArray(state?.shortcuts) ? state.shortcuts : []).forEach((shortcut) => {
      if (shortcut?.enabled === false) return;
      rows.push(createRow({
        type: 'shortcut',
        sourceId: shortcut?.id,
        title: shortcut?.title,
        detail: text(shortcut?.category) || 'Shortcut',
        searchText: `${shortcut?.category || ''} ${shortcut?.url || ''}`,
        action: 'open-shortcut',
      }));
    });

    (Array.isArray(state?.rss?.items) ? state.rss.items : []).forEach((item) => {
      rows.push(createRow({
        type: 'rss',
        sourceId: item?.id,
        title: item?.title || 'Untitled RSS item',
        detail: [text(item?.feedTitle), text(item?.tag), text(item?.publishedAt)].filter(Boolean).join(' · '),
        searchText: `${item?.feedTitle || ''} ${item?.tag || ''} ${item?.publishedAt || ''}`,
        action: 'open-rss',
        url: text(item?.link),
      }));
    });

    const seenEmailKeys = new Set();
    (Array.isArray(emailPayload?.accounts) ? emailPayload.accounts : []).forEach((account) => {
      const accountId = text(account?.id);
      if (!accountId) return;
      const accountLabel = text(account?.label) || text(account?.account) || 'Email';
      [
        ['INBOX', account?.entries],
        ['RECENT', account?.recentEntries],
        ['SENT', account?.sentEntries],
      ].forEach(([fallbackMailbox, entries]) => {
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
          const mailbox = text(entry?.mailbox) || fallbackMailbox;
          const uid = text(entry?.uid);
          const emailSourceId = `${accountId}::${mailbox}::${uid}`;
          if (!uid || seenEmailKeys.has(emailSourceId)) return;
          seenEmailKeys.add(emailSourceId);
          const sender = text(entry?.counterpartyName) || text(entry?.counterpartyEmail) || text(account?.account) || accountLabel;
          const issuedAt = text(entry?.issuedAt);
          rows.push(createRow({
            type: 'email',
            sourceId: emailSourceId,
            title: entry?.title || 'Untitled email',
            detail: [accountLabel, sender, issuedAt].filter(Boolean).join(' · '),
            // Search metadata only: no email preview/body is indexed here.
            searchText: `${accountLabel} ${account?.account || ''} ${sender} ${entry?.counterpartyEmail || ''} ${issuedAt} ${mailbox}`,
            action: 'open-email',
            accountId,
          }));
        });
      });
    });

    (Array.isArray(integrations) ? integrations : []).forEach((integration) => {
      const status = text(integration?.status) || 'unknown';
      const configured = text(integration?.configured).replace(/_/g, ' ') || 'configuration unknown';
      rows.push(createRow({
        type: 'integration',
        sourceId: integration?.id,
        title: integration?.name,
        detail: `${status} · ${configured}`,
        searchText: `${status} ${configured} ${integration?.settingsSection || ''} Integration Health`,
        action: 'open-integration-health',
      }));
    });

    return rows.filter(Boolean);
  }

  function compareRows(left, right) {
    const scoreDifference = Number(right.score || 0) - Number(left.score || 0);
    if (scoreDifference) return scoreDifference;
    if (left.type === 'command' && right.type === 'command') {
      const commandOrderDifference = Number(left.commandOrder || 0) - Number(right.commandOrder || 0);
      if (commandOrderDifference) return commandOrderDifference;
    }
    const typeDifference = RESULT_TYPE_ORDER.indexOf(left.type) - RESULT_TYPE_ORDER.indexOf(right.type);
    if (typeDifference) return typeDifference;
    return left.title.localeCompare(right.title) || left.sourceId.localeCompare(right.sourceId);
  }

  function buildSearchResults({ query = '', state = {}, emailPayload = null, integrations = [], commands = null, profilesAvailable = false, limit = RESULT_LIMIT } = {}) {
    const normalizedQuery = normalizeQuery(query);
    const commandRows = (Array.isArray(commands) ? commands : createDefaultCommands({ profilesAvailable }))
      .map((command, commandOrder) => createRow({
        type: 'command',
        sourceId: command?.id,
        title: command?.title,
        detail: command?.detail,
        searchText: command?.searchText,
        action: command?.action,
        disabled: command?.disabled,
        commandOrder,
      }))
      .filter(Boolean)
      .map((row) => matchRow(row, normalizedQuery))
      .filter(Boolean);
    const sourceRows = normalizedQuery
      ? contentRows({ state, emailPayload, integrations }).map((row) => matchRow(row, normalizedQuery)).filter(Boolean)
      : [];
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || RESULT_LIMIT));
    const rows = [...commandRows, ...sourceRows].sort(compareRows).slice(0, safeLimit);
    return {
      query: normalizedQuery,
      rows,
      commandCount: commandRows.length,
      contentCount: sourceRows.length,
    };
  }

  const api = {
    RESULT_LIMIT,
    RESULT_TYPE_LABELS,
    sourceKey,
    normalizeQuery,
    rankMatch,
    createDefaultCommands,
    contentRows,
    buildSearchResults,
  };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.commandPalette = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
