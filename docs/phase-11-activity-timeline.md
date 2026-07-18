# Phase 11.6: Activity and recovery timeline

PA Nostromo now has a lightweight **Activity & Recovery** settings view. It is
not an event-sourcing system and does not become a new data provider. The view
combines bounded local action records with the existing shared-state backup
list.

## What it records

The timeline records only a generated action category and timestamp for:

- completed tasks and project changes;
- imported state and restored backups;
- email moves, integration configuration changes, reminder snoozes, and
  profile changes; and
- safe, short-lived deletion undo actions.

It deliberately does not retain task or project titles, email subjects,
message content, sender data, URLs, backup filenames, or change-log text.
Existing state backups are shown as generic recovery snapshots and take the
user to **System & Safety** for the existing confirmed restore flow.

## Recovery and undo

Entries visibly say either **Not reversible**, **Recovery available**,
**Undo available**, or **Reversed**. An Undo button appears only while the
existing twelve-second undo callback is live in the current browser. Restoring
a backup and importing state continue to require their existing confirmation
steps; the timeline does not add a second restore path.

## Verification

The activity-timeline unit test proves payload redaction, backup-file
redaction, recovery-state labeling, and safe undo state. The dashboard smoke
test deletes and restores a private-title task through the live timeline and
asserts that the title never appears there. Full syntax, guardrail, fast,
type, accessibility, and browser-smoke checks are run before release.
