(function installMissionControlActivityTimelineFeature(global) {
  'use strict';

  const MAX_EVENTS = 120;
  const EVENT_TYPES = Object.freeze({
    task_completed: Object.freeze({ label: 'Completed task', reversible: false }),
    project_updated: Object.freeze({ label: 'Updated project', reversible: false }),
    state_imported: Object.freeze({ label: 'Imported state', reversible: false }),
    backup_restored: Object.freeze({ label: 'Restored backup', reversible: false }),
    email_moved: Object.freeze({ label: 'Moved email', reversible: false }),
    integration_config_changed: Object.freeze({ label: 'Changed integration configuration', reversible: false }),
    reminder_snoozed: Object.freeze({ label: 'Snoozed reminder', reversible: false }),
    profile_changed: Object.freeze({ label: 'Changed profile', reversible: false }),
    item_deleted: Object.freeze({ label: 'Removed item', reversible: false }),
    snapshot_available: Object.freeze({ label: 'State snapshot available', reversible: true }),
  });

  function text(value, max = 120) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function timestamp(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
  }

  function normalizeEvent(input) {
    const type = text(input?.type, 48);
    const definition = EVENT_TYPES[type];
    const id = text(input?.id, 80);
    const ts = timestamp(input?.ts);
    if (!definition || !id || !ts) return null;
    const undoStatus = input?.undoStatus === 'applied' ? 'applied' : '';
    return {
      id,
      type,
      ts,
      actionId: text(input?.actionId, 160),
      undoStatus,
    };
  }

  function normalizeEvents(input, limit = MAX_EVENTS) {
    const seen = new Set();
    return (Array.isArray(input) ? input : [])
      .map(normalizeEvent)
      .filter((event) => {
        if (!event || seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .slice(0, Math.max(1, Number(limit) || MAX_EVENTS));
  }

  function normalizeState(input) {
    return { events: normalizeEvents(input?.events) };
  }

  function appendEvent(input, event) {
    return { events: normalizeEvents([event, ...(normalizeState(input).events || [])]) };
  }

  function markUndoApplied(input, actionId) {
    const target = text(actionId, 160);
    if (!target) return normalizeState(input);
    return {
      events: normalizeState(input).events.map((event) => (
        event.actionId === target ? { ...event, undoStatus: 'applied' } : event
      )),
    };
  }

  function backupEntries(backups) {
    return (Array.isArray(backups) ? backups : [])
      .map((backup, index) => {
        const ts = timestamp(backup?.createdAt);
        if (!ts) return null;
        return {
          id: `snapshot-${index}-${ts}`,
          type: 'snapshot_available',
          ts,
          actionId: '',
          undoStatus: '',
          source: 'backup',
        };
      })
      .filter(Boolean);
  }

  function buildTimeline({ state, backups, activeUndoActionId = '' } = {}) {
    const activeUndo = text(activeUndoActionId, 160);
    const events = [
      ...normalizeState(state).events.map((event) => ({ ...event, source: 'activity' })),
      ...backupEntries(backups),
    ].sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts));

    return events.map((event) => {
      const definition = EVENT_TYPES[event.type];
      const undoAvailable = event.undoStatus !== 'applied' && !!event.actionId && event.actionId === activeUndo;
      const recoveryAvailable = event.type === 'snapshot_available';
      const reversible = undoAvailable || recoveryAvailable || !!definition?.reversible;
      const status = event.undoStatus === 'applied'
        ? 'Reversed'
        : undoAvailable
          ? 'Undo available'
          : recoveryAvailable
            ? 'Recovery available'
            : 'Not reversible';
      return {
        ...event,
        label: definition?.label || 'Activity recorded',
        reversible,
        undoAvailable,
        recoveryAvailable,
        status,
      };
    });
  }

  const api = {
    MAX_EVENTS,
    EVENT_TYPES,
    normalizeEvent,
    normalizeEvents,
    normalizeState,
    appendEvent,
    markUndoApplied,
    buildTimeline,
  };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.activityTimeline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
