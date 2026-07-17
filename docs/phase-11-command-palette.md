# Phase 11.3: Universal Search and Command Palette

PA Nostromo now has a keyboard-first local search surface. Press **Ctrl/⌘ K**
or choose **⌘ Search** in the top bar to open it.

## What it searches

The palette creates its results from the dashboard data already in the browser:

- projects, active tasks, notes, and calendar reminders;
- enabled shortcuts and RSS item titles/metadata;
- the current unread-email snapshot's metadata (account, sender, subject, date,
  and mailbox), never a preview or message body; and
- Integration Health names and statuses.

No search provider, remote index, or free-form scripting language is involved.
Every result keeps the existing source identifier and opens that source's
existing UI, safely opens the source's already-approved shortcut/RSS URL, or
opens the Integration Health panel.

## Commands

The empty palette starts with these bounded commands:

- Create task…
- Capture note…
- Open project…
- Refresh email
- Show integration health

`Switch profile` is listed but disabled with an explanation until Product
Profiles is implemented in Phase 11.4. It does not imply an unimplemented
profile-switching path.

Use the arrow keys to choose a result, Enter to run it, and Escape to close the
palette. The result list is capped at 30 rows and is recomputed from current
local state each time the query changes.
