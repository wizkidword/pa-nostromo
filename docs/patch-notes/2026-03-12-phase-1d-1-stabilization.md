# Patch Notes — Phase 1D.1 Stabilization (2026-03-12)

## What changed
- Added **crypto server proxy endpoints** (`/api/crypto/*`) and migrated client crypto fetches to local proxy routes to reduce browser CORS/network error noise.
- Added **async-safe render wrappers** in pod adapters + fallback lifecycle path to prevent unhandled promise rejection console spam during expected network failures.
- Added **debug cadence counters** via `window.__MISSION_CONTROL_DEBUG__`:
  - per-pod lifecycle event counts
  - per-pod manual/auto refresh counts
  - configured intervalMs for managed pods
- Added **QA reset helpers**:
  - `npm run qa:reset-state` to apply deterministic shared state fixture
  - `window.__MISSION_CONTROL_QA__.resetLocalState()` for tab-local cache reset
- Added **deterministic smoke script**: `npm run qa:smoke:1d1`
- Added **RSS determinism/reliability hardening**:
  - stable tie-break sorting for equal timestamps
  - normalized feed order
  - safe invalid-date handling in server RSS parsing
- Added **storage event synchronization** for better cross-tab consistency on local state updates.

## Operator notes
- Debug counters are hidden by default and available through:
  - `window.__MISSION_CONTROL_DEBUG__.snapshot()`
  - `window.__MISSION_CONTROL_QA__.debugSnapshot()`

## Rollback plan
1. Revert commit for this patch:
   - `git revert <phase-1d-1-commit-hash>`
2. If hot rollback needed before revert:
   - Remove `app/core/debug.js` and script include from `index.html`
   - Revert `/api/crypto/*` additions in `server.js`
   - Restore original direct crypto provider URLs in `app.js`
   - Remove QA scripts/fixture additions from `scripts/` and `data/`
3. Validate with:
   - `npm run check`
   - manual weather/NBA/crypto/RSS refresh sanity
