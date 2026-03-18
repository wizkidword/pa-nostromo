# 2026-03-18 — Ideas Board cleanup

- Renamed **Mini Notes Board** UI label to **Ideas**.
- Removed the **Ideas** column from Kanban rendering and task column selectors.
- Added migration on load: any legacy tasks in Kanban `ideas` are converted into Notes board items with:
  - task title → note title
  - migration marker + original task id
  - preserved `nextAction` and `owner` metadata in note body
- Normalized invalid/legacy task columns to `inbox` so cards never get stranded outside visible Kanban lanes.
