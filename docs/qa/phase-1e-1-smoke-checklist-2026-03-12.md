# Phase 1E.1 Smoke Checklist (Sentinel) — 2026-03-12

## Environment
- Run isolated instance on `BASE_URL=http://localhost:4191`.
- Ensure server is up before smoke.

## Required commands
1. `npm run check`
2. `node scripts/qa-phase1e-1-fix-pass.mjs`

Both must pass.

## Manual spot checks (if needed)

### A) Cross-tab delete/undo determinism
- Open two tabs.
- Delete a note in tab A.
- Confirm it disappears in tab B.
- Click Undo in tab A.
- Confirm note reappears in tab B.

### B) Undo expiry determinism (12s)
- Delete a task.
- Do not click Undo.
- Wait >12s.
- Confirm undo bar hides.
- Confirm task remains deleted in both tabs.

### C) Restore determinism
- Create a temporary marker note.
- Trigger restore from State Safety backup.
- Confirm marker note is rolled back after restore.
- Confirm project cards render in both tabs and project counts match exactly.

### D) Post-restore regression guard
- After restore, verify:
  - projects are not rendered as 0
  - tasks board still interactive
  - notes panel still interactive
  - utility pods render normally

## Expected pass criteria
- No stale cross-tab resurrection after undo expiry.
- Restore always rehydrates from `/api/state` and converges both tabs.
- No project-count mismatch or empty-project transient after restore.
- All checks pass with non-destructive defaults preserved.
