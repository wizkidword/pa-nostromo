# Patch Notes — 2026-03-12 — Phase 1A Modular Foundation

## Summary
Added Phase 1A modular scaffolding in an additive way with no intentional behavior changes.

## Changes

### New scaffolding
- Added pod core modules:
  - `app/core/contract.js`
  - `app/core/registry.js`
  - `app/core/layout.js`
  - `app/core/persistence.js`
- Added initial adapter pods:
  - `app/pods/date-time.pod.js`
  - `app/pods/calendar.pod.js`
  - `app/pods/weather.pod.js`

### Runtime wiring
- Updated `index.html` to load core/pod scripts before `app.js`.
- Updated `app.js`:
  - Added `getPodRegistry()` and `renderPodWithFallback(podId, legacyRender)`.
  - `renderAll()` now uses fallback-render seam for `date-time` and `calendar` pods.
  - Added changelog seed message:
    - "Phase 1A modular foundation: added pod contract/registry/layout/persistence scaffolding + adapter pods (Date/Calendar/Weather) with legacy render fallback for non-migrated pods."

## Behavior Compatibility Notes
- Existing pod/state data shape is unchanged.
- `/api/state` + local fallback behavior remains unchanged.
- Non-migrated pods still use legacy render code paths.
- Date/Calendar are registry-aware but still rendered by legacy functions through adapters.
- Weather adapter is registered for safe phased adoption; weather runtime behavior remains legacy unless future wiring opts in.

## Rollback Notes
If anything regresses:
1. Revert `index.html` script tags to only `app.js`.
2. Revert `app.js` to direct render calls in `renderAll()`.
3. Remove `app/core/*` and `app/pods/*` files.
4. Run `npm run check`.
5. Execute smoke checklist in `docs/qa/phase-1a-smoke-checklist-2026-03-12.md`.
