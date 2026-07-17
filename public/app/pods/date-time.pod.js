(function registerDateTimePod(global) {
  'use strict';

  function renderDateTime(ctx = {}) {
    const documentRef = ctx.document || global.document;
    const element = documentRef?.getElementById?.('dateTimeWidget');
    if (!element) return;
    const now = typeof ctx.getNow === 'function' ? ctx.getNow() : new Date();
    const hour = now.getHours();
    const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Night shift';
    const moodClass = hour < 5 ? 'is-midnight' : hour < 12 ? 'is-morning' : hour < 17 ? 'is-afternoon' : hour < 21 ? 'is-evening' : 'is-night';
    const timeParts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).formatToParts(now);
    const timePart = (type) => timeParts.find((part) => part.type === type)?.value || '';
    const hourMinute = `${timePart('hour')}:${timePart('minute')}`;
    const seconds = timePart('second');
    const meridiem = timePart('dayPeriod');
    const weekdayLabel = now.toLocaleDateString(undefined, { weekday: 'long' });
    const fullDateLabel = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    const timeZone = String(ctx.localTimeZone || '').trim();
    const timeZoneLabel = new Intl.DateTimeFormat('en-US', {
      ...(timeZone ? { timeZone } : {}),
      timeZoneName: 'short',
    }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value || 'Local';

    element.innerHTML = `
      <div class="date-time-hero ${moodClass}">
        <div class="date-time-kicker-row">
          <span class="date-time-kicker">${greeting}</span>
          <span class="date-time-chip">${timeZoneLabel}</span>
        </div>
        <div class="date-time-clock">
          <span class="date-time-hour-minute">${hourMinute}</span>
          <span class="date-time-seconds">:${seconds}</span>
          <span class="date-time-ampm">${meridiem}</span>
        </div>
        <div class="date-time-date-row">
          <span class="date-time-weekday">${weekdayLabel}</span>
          <span class="date-time-date">${fullDateLabel}</span>
        </div>
      </div>
    `;
    if (typeof ctx.updateAlarmStatus === 'function') ctx.updateAlarmStatus();
  }

  const api = { renderDateTime };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.dateTimePod = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  const registry = global.MissionControlModules?.podRegistry;
  if (!registry || typeof registry.register !== 'function') return;
  registry.register({
    id: 'date-time',
    title: 'Date & Time',
    version: '2.1.0',
    description: 'Date & Time pod with feature-owned time rendering and integrated alarm status updates.',
    render: renderDateTime,
    lifecycle: {
      init() {},
      refresh: renderDateTime,
      mount() {},
      unmount() {},
      destroy() {},
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
