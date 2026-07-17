# Phase 11.2: Today / Focus

**Today / Focus** is the dashboard's bounded daily queue. It uses only data
already held by PA Nostromo and displays at most seven primary items.

## Ranking rules

Items are ranked deterministically in this order:

1. Manually pinned items
2. Integration exceptions that need attention
3. Tasks blocked by an error
4. Overdue tasks
5. Tasks due today
6. Calendar reminders due today
7. Explicitly flagged email

Ties are resolved by source date, title, and source key, so the order remains
predictable and testable.

## Source-aware actions

Every item retains a link to its original source. The queue does not create a
second copy of a task or reminder:

- **Done** completes the source task, deletes the completed reminder with the
  existing undo path, or marks a flagged email as read.
- **Snooze** moves a task or reminder to tomorrow; integration and email items
  are hidden until tomorrow without changing provider data.
- **Open source** opens the task editor, selected calendar day, unread-email
  pod, or Integration Health panel.
- **Move** changes the original task/reminder project assignment or the local
  project association for a flagged email.

Manual task pins, snoozes, dismissals, and explicitly flagged email references
are stored locally in `todayFocus`. The dashboard has no separate calendar-event
provider, so its existing calendar reminders are the calendar source for this
view.
