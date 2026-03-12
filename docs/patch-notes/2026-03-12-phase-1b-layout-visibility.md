# Patch Notes — 2026-03-12 — Phase 1B Layout + Visibility

## Summary
Implemented Phase 1B (Option B) with low-risk changes:
- Added persisted utility pod row order (`state.layout.utilityRows`).
- Added persisted per-pod hide/show state (`state.layout.visibility`).
- Added Settings panel controls for visibility toggles and row-local reordering.
- Added hydration-safe layout normalization so shared-state restore works across browsers and unknown pods remain visible.

## Files Touched
- `app.js`
- `index.html`
- `styles.css`
- `app/core/layout.js`
- `docs/plans/2026-03-12-phase-1b-layout-visibility.md`
- `docs/qa/phase-1b-smoke-checklist-2026-03-12.md`
- `docs/patch-notes/2026-03-12-phase-1b-layout-visibility.md`

## Rollback Steps
1. Revert commit for this patch:
   - `git revert <phase-1b-commit-hash>`
   - or hard reset to previous commit in controlled environment.
2. If state carries `layout` already, app remains backward-safe. Optional cleanup (not required): remove `layout` key from exported/imported state snapshots.
3. Verify startup behavior:
   - Utility cards appear in default order.
   - Settings opens normally.
   - Shared state sync still succeeds after changes.

## Post-Rollback Validation
- Run: `npm run check`
- Reload dashboard in 2 browser tabs; verify no sync regressions.
