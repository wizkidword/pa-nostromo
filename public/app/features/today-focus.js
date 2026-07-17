(function installMissionControlTodayFocusFeature(global) {
  'use strict';

  const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const sourceTypes = new Set(['task', 'reminder', 'email', 'integration']);
  const attentionStatuses = new Set(['error', 'stale', 'rate_limited']);
  const PRIMARY_LIMIT = 7;

  function dateKey(input = new Date()) {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function addDays(input, days = 1) {
    const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
    if (Number.isNaN(date.getTime())) return '';
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + Number(days || 0));
    return dateKey(date);
  }

  function normalizedDateKey(value) {
    const text = String(value || '').trim();
    return DATE_KEY_PATTERN.test(text) ? text : '';
  }

  function sourceKey(type, id) {
    const normalizedType = String(type || '').trim();
    const normalizedId = String(id || '').trim();
    return sourceTypes.has(normalizedType) && normalizedId ? `${normalizedType}:${normalizedId}` : '';
  }

  function normalizedPin(input = {}) {
    const type = String(input.sourceType || '').trim();
    const id = String(input.sourceId || '').trim();
    const key = sourceKey(type, id);
    if (!key) return null;
    return {
      sourceType: type,
      sourceId: id,
      sourceKey: key,
      title: String(input.title || '').trim().slice(0, 300),
      detail: String(input.detail || '').trim().slice(0, 500),
      projectId: String(input.projectId || '').trim(),
      accountId: String(input.accountId || '').trim(),
      mailbox: String(input.mailbox || '').trim(),
      uid: String(input.uid || '').trim(),
      issuedAt: String(input.issuedAt || '').trim(),
      createdAt: String(input.createdAt || '').trim(),
    };
  }

  function normalizeDateMap(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const normalized = {};
    for (const [keyRaw, value] of Object.entries(source)) {
      const key = String(keyRaw || '').trim();
      const valueDate = normalizedDateKey(value);
      if (key && valueDate) normalized[key] = valueDate;
    }
    return normalized;
  }

  function normalizeFocusState(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const pinsByKey = new Map();
    for (const pin of Array.isArray(source.pinned) ? source.pinned : []) {
      const normalized = normalizedPin(pin);
      if (normalized) pinsByKey.set(normalized.sourceKey, normalized);
    }
    return {
      pinned: [...pinsByKey.values()].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
      snoozedUntil: normalizeDateMap(source.snoozedUntil),
      dismissedOn: normalizeDateMap(source.dismissedOn),
    };
  }

  function withPinned(focusState, input) {
    const focus = normalizeFocusState(focusState);
    const pin = normalizedPin(input);
    if (!pin) return focus;
    const pins = new Map(focus.pinned.map((item) => [item.sourceKey, item]));
    pins.set(pin.sourceKey, pin);
    return {
      ...focus,
      pinned: [...pins.values()].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
    };
  }

  function withoutPinned(focusState, key) {
    const focus = normalizeFocusState(focusState);
    const source = String(key || '').trim();
    if (!source) return focus;
    return { ...focus, pinned: focus.pinned.filter((pin) => pin.sourceKey !== source) };
  }

  function withSnooze(focusState, key, until) {
    const focus = normalizeFocusState(focusState);
    const source = String(key || '').trim();
    const date = normalizedDateKey(until);
    if (!source || !date) return focus;
    return { ...focus, snoozedUntil: { ...focus.snoozedUntil, [source]: date } };
  }

  function withDismissal(focusState, key, onDate) {
    const focus = normalizeFocusState(focusState);
    const source = String(key || '').trim();
    const date = normalizedDateKey(onDate);
    if (!source || !date) return focus;
    return { ...focus, dismissedOn: { ...focus.dismissedOn, [source]: date } };
  }

  function rankFor(kind, pinned) {
    if (pinned) return 0;
    const ranks = {
      integration_failure: 10,
      blocked_task: 20,
      overdue_task: 30,
      due_task: 40,
      calendar_reminder: 50,
      flagged_email: 60,
    };
    return ranks[kind] ?? 90;
  }

  function itemLabel(kind) {
    const labels = {
      integration_failure: 'Needs attention',
      blocked_task: 'Blocked task',
      overdue_task: 'Overdue task',
      due_task: 'Due today',
      calendar_reminder: 'Calendar reminder',
      flagged_email: 'Flagged email',
    };
    return labels[kind] || 'Focus item';
  }

  function compareText(left, right) {
    const first = String(left || '');
    const second = String(right || '');
    if (first < second) return -1;
    if (first > second) return 1;
    return 0;
  }

  function buildTodayFocusItems({ state = {}, now = new Date(), integrations = [], limit = PRIMARY_LIMIT } = {}) {
    const today = dateKey(now);
    const focus = normalizeFocusState(state.todayFocus);
    const pinsByKey = new Map(focus.pinned.map((pin) => [pin.sourceKey, pin]));
    const candidates = new Map();

    function addCandidate(candidate) {
      if (!candidate?.sourceKey) return;
      const pin = pinsByKey.get(candidate.sourceKey);
      const existing = candidates.get(candidate.sourceKey);
      const next = {
        ...candidate,
        pinned: !!pin,
        pin: pin || null,
        rank: rankFor(candidate.kind, !!pin),
      };
      if (!existing || next.rank < existing.rank) candidates.set(next.sourceKey, next);
    }

    for (const task of Array.isArray(state.tasks) ? state.tasks : []) {
      if (!task || task.column === 'done') continue;
      const dueDate = normalizedDateKey(task.dueDate);
      const key = sourceKey('task', task.id);
      if (!key) continue;
      let kind = '';
      if (String(task.blockerType || '') === 'error') kind = 'blocked_task';
      else if (dueDate && dueDate < today) kind = 'overdue_task';
      else if (dueDate === today) kind = 'due_task';
      else if (pinsByKey.has(key)) kind = 'due_task';
      if (!kind) continue;
      addCandidate({
        sourceType: 'task',
        sourceId: String(task.id),
        sourceKey: key,
        kind,
        label: itemLabel(kind),
        title: String(task.title || 'Untitled task'),
        detail: String(task.nextAction || '').trim(),
        projectId: String(task.projectId || '').trim(),
        dueDate,
        sortDate: dueDate || String(task.updatedAt || ''),
      });
    }

    for (const reminder of Array.isArray(state.reminders) ? state.reminders : []) {
      if (!reminder) continue;
      const reminderDate = normalizedDateKey(reminder.date);
      const key = sourceKey('reminder', reminder.id);
      if (!key || (reminderDate !== today && !pinsByKey.has(key))) continue;
      addCandidate({
        sourceType: 'reminder',
        sourceId: String(reminder.id),
        sourceKey: key,
        kind: 'calendar_reminder',
        label: itemLabel('calendar_reminder'),
        title: String(reminder.text || 'Untitled reminder'),
        detail: reminder.time ? `Today at ${String(reminder.time)}` : 'Today',
        projectId: String(reminder.projectId || '').trim(),
        dueDate: reminderDate,
        sortDate: `${reminderDate || today}T${String(reminder.time || '23:59')}`,
      });
    }

    for (const entry of Array.isArray(integrations) ? integrations : []) {
      const status = String(entry?.status || '').trim();
      const key = sourceKey('integration', entry?.id);
      if (!key || (!attentionStatuses.has(status) && !pinsByKey.has(key))) continue;
      addCandidate({
        sourceType: 'integration',
        sourceId: String(entry.id),
        sourceKey: key,
        kind: 'integration_failure',
        label: itemLabel('integration_failure'),
        title: `${String(entry.name || entry.label || entry.id || 'Integration')} requires attention`,
        detail: status === 'rate_limited'
          ? 'Rate limited — review the integration status and retry time.'
          : status === 'stale'
            ? 'The dashboard is showing older data — review the integration status.'
            : 'The integration needs recovery before its data can refresh.',
        sortDate: String(entry.lastAttemptAt || entry.sourceUpdatedAt || ''),
      });
    }

    for (const pin of focus.pinned) {
      if (pin.sourceType !== 'email') continue;
      addCandidate({
        sourceType: 'email',
        sourceId: pin.sourceId,
        sourceKey: pin.sourceKey,
        kind: 'flagged_email',
        label: itemLabel('flagged_email'),
        title: pin.title || 'Flagged email',
        detail: pin.detail || 'Open the email source to review it.',
        projectId: pin.projectId,
        sortDate: pin.issuedAt || pin.createdAt || '',
        sourceLocator: {
          accountId: pin.accountId,
          mailbox: pin.mailbox,
          uid: pin.uid,
        },
      });
    }

    const allItems = [...candidates.values()]
      .filter((item) => focus.dismissedOn[item.sourceKey] !== today)
      .filter((item) => {
        const snoozedUntil = focus.snoozedUntil[item.sourceKey];
        return !snoozedUntil || snoozedUntil <= today;
      })
      .sort((left, right) => (
        left.rank - right.rank
        || compareText(left.sortDate, right.sortDate)
        || compareText(left.title.toLowerCase(), right.title.toLowerCase())
        || compareText(left.sourceKey, right.sourceKey)
      ));
    const boundedLimit = Math.max(1, Math.min(12, Number(limit) || PRIMARY_LIMIT));
    return {
      today,
      focus,
      allItems,
      primaryItems: allItems.slice(0, boundedLimit),
      overflowCount: Math.max(0, allItems.length - boundedLimit),
    };
  }

  const api = {
    PRIMARY_LIMIT,
    dateKey,
    addDays,
    sourceKey,
    normalizeFocusState,
    withPinned,
    withoutPinned,
    withSnooze,
    withDismissal,
    buildTodayFocusItems,
  };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.todayFocus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
