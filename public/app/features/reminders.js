(function installMissionControlRemindersFeature(global) {
  'use strict';

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const timePattern = /^\d{2}:\d{2}$/;

  function sortReminders(reminders) {
    return [...reminders].sort((left, right) => (left.time || '').localeCompare(right.time || ''));
  }

  function reminderDateSet(reminders) {
    return new Set(reminders.map((reminder) => reminder.date));
  }

  function normalizeReminderDraft(input = {}) {
    const date = String(input.date || '').trim();
    const time = String(input.time || '').trim();
    return {
      date: datePattern.test(date) ? date : '',
      time: timePattern.test(time) ? time : '',
      text: String(input.text || '').trim(),
    };
  }

  function createReminder({ reminders, id, now, values }) {
    if (!Array.isArray(reminders)) throw new Error('Reminders feature requires a reminders array.');
    if (typeof id !== 'function' || typeof now !== 'function') {
      throw new Error('Reminders feature requires id and now functions.');
    }
    const draft = normalizeReminderDraft(values);
    if (!draft.date || !draft.text) return { created: false, error: 'date_and_text_required' };
    const reminder = { id: id(), ...draft, createdAt: now() };
    reminders.push(reminder);
    return { created: true, reminder };
  }

  function snoozeReminder(reminder, date, now) {
    const nextDate = String(date || '').trim();
    if (!reminder || !datePattern.test(nextDate) || typeof now !== 'function') return false;
    reminder.date = nextDate;
    reminder.updatedAt = now();
    return true;
  }

  function createRemindersController({
    document: documentRef,
    getState,
    getSelectedDate,
    setSelectedDate,
    dateKey,
    id,
    now,
    escapeText,
    escapeHtml,
    escapeAttribute,
    sourceReferenceLabel = () => '',
    commitState,
    deleteWithUndo,
  }) {
    let bindings = [];

    function reminders() {
      const collection = getState?.()?.reminders;
      if (!Array.isArray(collection)) throw new Error('Reminders feature requires dashboard reminders state.');
      return collection;
    }

    function selectedItems() {
      const selectedDate = getSelectedDate?.();
      return selectedDate ? sortReminders(reminders().filter((reminder) => reminder.date === selectedDate)) : [];
    }

    function renderCalendarPanel() {
      const label = documentRef?.getElementById?.('calendarSelectedDate');
      const list = documentRef?.getElementById?.('calendarDayReminders');
      if (!label || !list) return;
      const selectedDate = getSelectedDate?.();
      if (!selectedDate) {
        label.innerHTML = `
          <div class="calendar-agenda-title">Select a date</div>
          <div class="calendar-agenda-subtitle">Choose any day above to see reminders.</div>
        `;
        list.innerHTML = '<div class="calendar-empty-state">No reminders yet.</div>';
        return;
      }

      const selectedDateTime = new Date(`${selectedDate}T12:00:00`);
      const todayKey = dateKey(new Date());
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowKey = dateKey(tomorrow);
      const items = selectedItems();
      const dayLabel = selectedDateTime.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      const yearLabel = selectedDateTime.toLocaleDateString(undefined, { year: 'numeric' });
      const relativeLabel = selectedDate === todayKey
        ? 'Today'
        : selectedDate === tomorrowKey
          ? 'Tomorrow'
          : selectedDateTime < new Date(`${todayKey}T00:00:00`)
            ? 'Past date'
            : 'Upcoming';
      label.innerHTML = `
        <div class="calendar-agenda-head">
          <div>
            <div class="calendar-agenda-kicker">${relativeLabel}</div>
            <div class="calendar-agenda-title">${dayLabel}</div>
            <div class="calendar-agenda-subtitle">${yearLabel}</div>
          </div>
          <div class="calendar-agenda-meta">
            <span class="calendar-agenda-pill">${items.length} ${items.length === 1 ? 'reminder' : 'reminders'}</span>
          </div>
        </div>
      `;
      if (!items.length) {
        list.innerHTML = `
          <div class="calendar-empty-state">
            <strong>Nothing scheduled yet.</strong>
            <span>Use the quick add form above to drop a reminder onto this date.</span>
          </div>
        `;
        return;
      }

      list.innerHTML = items.map((reminder) => `
        <div class="calendar-reminder-card">
          <div class="calendar-reminder-copy">
            <div class="calendar-reminder-time">${escapeText(reminder.time || 'Anytime')}</div>
            <div class="calendar-reminder-text">${escapeHtml(reminder.text)}</div>
            ${sourceReferenceLabel(reminder.sourceRef) ? `<div class="note-meta">Source: ${escapeText(sourceReferenceLabel(reminder.sourceRef))}</div>` : ''}
          </div>
          <button class="btn note-delete calendar-reminder-delete" data-rem-del="${escapeAttribute(reminder.id)}" type="button">Delete</button>
        </div>
      `).join('');
      list.querySelectorAll?.('[data-rem-del]').forEach((button) => {
        button.addEventListener('click', () => {
          deleteWithUndo({
            collection: reminders,
            itemId: button.dataset.remDel,
            reason: 'calendar_reminder_deleted',
            commit: commitState,
            buildUndoLabel: (reminder) => `Reminder deleted (${reminder?.time || 'Anytime'}). Undo?`,
          });
        });
      });
    }

    function renderToday() {
      const container = documentRef?.getElementById?.('todayReminders');
      if (!container) return;
      const today = dateKey(new Date());
      const items = sortReminders(reminders().filter((reminder) => reminder.date === today));
      if (!items.length) {
        container.innerHTML = '<div class="note-meta">No reminders for today.</div>';
        return;
      }
      container.innerHTML = items
        .map((reminder) => `<div class="change-log-item"><strong>${escapeText(reminder.time || 'Anytime')}</strong> — ${escapeHtml(reminder.text)}${sourceReferenceLabel(reminder.sourceRef) ? ` <span class="note-meta">(${escapeText(sourceReferenceLabel(reminder.sourceRef))})</span>` : ''}</div>`)
        .join('');
    }

    function create(values) {
      return createReminder({ reminders: reminders(), id, now, values });
    }

    function bind() {
      if (bindings.length) return;
      const addButton = documentRef?.getElementById?.('addCalendarReminderBtn');
      const textInput = documentRef?.getElementById?.('calendarReminderText');
      const timeInput = documentRef?.getElementById?.('calendarReminderTime');
      const addBinding = () => {
        let selectedDate = getSelectedDate?.();
        if (!selectedDate) {
          selectedDate = dateKey(new Date());
          setSelectedDate?.(selectedDate);
        }
        const result = create({ date: selectedDate, text: textInput?.value, time: timeInput?.value });
        if (!result.created) return;
        if (textInput) textInput.value = '';
        if (timeInput) timeInput.value = '';
        commitState('calendar_reminder_added');
      };
      if (addButton?.addEventListener) {
        addButton.addEventListener('click', addBinding);
        bindings.push([addButton, 'click', addBinding]);
      }
    }

    function destroy() {
      for (const [target, eventName, listener] of bindings) {
        target.removeEventListener?.(eventName, listener);
      }
      bindings = [];
    }

    return {
      renderCalendarPanel,
      renderToday,
      create,
      bind,
      destroy,
      reminderDateSet: () => reminderDateSet(reminders()),
    };
  }

  const api = { sortReminders, reminderDateSet, normalizeReminderDraft, createReminder, snoozeReminder, createRemindersController };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.reminders = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
