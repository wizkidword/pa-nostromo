(function registerCalendarPod(global) {
  'use strict';

  function dateKey(date) {
    const value = new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  function renderCalendar(ctx = {}) {
    const documentRef = ctx.document || global.document;
    const element = documentRef?.getElementById?.('calendarWidget');
    if (!element) return;
    const now = typeof ctx.getNow === 'function' ? ctx.getNow() : new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const start = first.getDay();
    const days = last.getDate();
    const todayKey = dateKey(now);
    let selectedDate = typeof ctx.getSelectedDate === 'function' ? ctx.getSelectedDate() : null;
    if (!selectedDate) {
      selectedDate = todayKey;
      ctx.setSelectedDate?.(selectedDate);
    }

    const reminderDates = ctx.reminderDateSet?.() || new Set();
    const reminderDayCount = reminderDates.size;
    const heads = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => `<div class="cal-cell cal-head">${day}</div>`).join('');
    let cells = '';
    for (let index = 0; index < start; index += 1) cells += '<div class="cal-cell cal-cell-empty">&nbsp;</div>';
    for (let day = 1; day <= days; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = key === todayKey;
      const isSelected = key === selectedDate;
      const hasReminder = reminderDates.has(key);
      cells += `<div class="cal-cell ${isToday ? 'cal-today' : ''} ${isSelected ? 'selected' : ''} ${hasReminder ? 'has-reminder' : ''}" data-date="${key}">${day}</div>`;
    }
    element.innerHTML = `
      <div class="calendar-v2-shell">
        <div class="calendar-v2-head">
          <div>
            <div class="calendar-month-label">${now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            <div class="calendar-month-subtitle">Pick a day to manage reminders.</div>
          </div>
          <div class="calendar-month-stats">
            <span class="calendar-stat-pill">${reminderDayCount} reminder ${reminderDayCount === 1 ? 'day' : 'days'}</span>
          </div>
        </div>
        <div class="calendar-grid">${heads}${cells}</div>
      </div>
    `;

    element.querySelectorAll?.('[data-date]').forEach((cell) => {
      cell.addEventListener?.('click', () => {
        const nextDate = String(cell.dataset?.date || '');
        if (!nextDate) return;
        ctx.setSelectedDate?.(nextDate);
        renderCalendar(ctx);
        ctx.renderCalendarRemindersPanel?.();
      });
    });
  }

  const api = { dateKey, renderCalendar };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.calendarPod = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;
  registry.register({
    id: 'calendar',
    title: 'Calendar',
    version: '2.1.0',
    description: 'Calendar pod with feature-owned month rendering and reminder date selection.',
    render: renderCalendar,
    lifecycle: {
      init() {},
      refresh: renderCalendar,
      mount() {},
      unmount() {},
      destroy() {},
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
