# Calendar Diary Index + Popup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a red dot on calendar dates that have non-empty project diary entries, and open a popup with newest-first tagged diary entries (preview + expandable full text) when a date is clicked.

**Architecture:** Add a backend diary index API that reads markdown diary files and returns normalized entries + a date map for fast calendar rendering. Frontend calendar renderer consumes that index, marks dates with diary dots, and opens a dedicated dialog with collapsed cards that expand to full content. Include a manual “Refresh Diary Index” action and graceful fallback when index fetch fails.

**Tech Stack:** Node.js HTTP server (`server.js`), vanilla JS frontend (`app.js`), semantic HTML dialogs (`index.html`), existing dashboard CSS (`styles.css`).

---

### Task 1: Add backend diary index endpoint

**Files:**
- Modify: `server.js`

**Step 1: Write failing API test (manual smoke command)**
- Run: `curl -sS http://localhost:4187/api/diary-index | jq '.ok'`
- Expected before code: route missing / 404.

**Step 2: Add scanner helpers**
- Add constants for source folders (initial default includes `taverncollectibles-v2/artifacts/reports`).
- Add helper to recursively read `.md` files, parse date (`YYYY-MM-DD`) from filename/content, parse project tag, build preview/full content, and ignore empty/template-only entries.

**Step 3: Add endpoint**
- Add `GET /api/diary-index` for cached/instant retrieval.
- Add `POST /api/diary-index/refresh` to rebuild index on demand.
- Response shape: `{ ok, generatedAt, datesWithEntries, entriesByDate, sourceStats }`.

**Step 4: Verify pass**
- Run: `curl -sS http://localhost:4187/api/diary-index | jq '.ok, .datesWithEntries | length'`
- Expected: `true` and non-negative integer.

**Step 5: Commit**
- `git add server.js`
- `git commit -m "feat(calendar): add diary index API and refresh endpoint"`

### Task 2: Wire calendar UI indicators + diary modal behavior

**Files:**
- Modify: `app.js`

**Step 1: Add failing behavior checks**
- Manual expectation before change: calendar only marks reminders, no diary modal.

**Step 2: Add client diary state + fetch functions**
- Add in-memory `diaryIndexState` with `datesWithEntries`, `entriesByDate`, `generatedAt`.
- Implement `refreshDiaryIndex({ manual })` with status messages and error handling.

**Step 3: Extend `renderCalendar()`**
- Merge existing reminder mark logic with diary mark logic.
- Add red-dot class to any date with diary entries (non-empty content only).
- Keep reminder behavior intact.

**Step 4: Add click behavior to open diary dialog**
- On date click, still set selected date + reminders panel.
- If date has diary entries, open modal showing newest-first cards with project tags, preview text, and expand/collapse full entry body.

**Step 5: Add manual refresh handler**
- Hook `Refresh Diary Index` button to `POST /api/diary-index/refresh`, then rerender calendar + dialog data.

**Step 6: Verify pass**
- Manual check: date with diary entry shows dot, clicking opens popup list, card expands full text.

**Step 7: Commit**
- `git add app.js`
- `git commit -m "feat(calendar): show diary markers and date-click diary modal"`

### Task 3: Add modal + controls markup and styles

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

**Step 1: Add markup**
- Add diary refresh button in calendar card.
- Add `<dialog>` for diary popup with title/date, list container, close button.

**Step 2: Add styles**
- Add red-dot indicator style for diary dates (distinct from reminder indicator if both exist).
- Add compact feed card styles: meta row (date/time + project tag), preview body, expand control, expanded full text block.

**Step 3: Verify pass**
- Manual check for visual quality in dark/light themes and responsive widths.

**Step 4: Commit**
- `git add index.html styles.css`
- `git commit -m "ui(calendar): add diary popup dialog and diary marker styles"`

### Task 4: Regression + QA checks

**Files:**
- Modify: `docs/patch-notes/*` (if project uses patch-note log files)

**Step 1: Regression smoke**
- Ensure reminders still add/delete and render correctly.
- Ensure selected date behavior unchanged.
- Ensure calendar pod still mounts through pod registry.

**Step 2: Document change note**
- Add concise patch note about diary markers + popup.

**Step 3: Final verification command set**
- `npm test` (if configured)
- `node server.js` + manual browser smoke at `http://localhost:4187`

**Step 4: Commit**
- `git add -A`
- `git commit -m "chore: finalize calendar diary integration QA + notes"`
