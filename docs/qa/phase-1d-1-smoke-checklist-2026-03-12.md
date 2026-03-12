# Sentinel QA Smoke Checklist — Phase 1D.1 (2026-03-12)

## 0) Preflight
- Start app server: `npm start`
- Run static checks: `npm run check`
- Apply deterministic shared baseline: `npm run qa:reset-state`
- In **each** browser tab used for test: run in console:
  - `window.__MISSION_CONTROL_QA__.resetLocalState()`

## 1) Console hygiene (crypto/network)
1. Open DevTools console.
2. Trigger crypto refresh button 3x (respect cooldown).
3. Temporarily block outbound network (or simulate provider failure) and refresh again.
4. Expected:
   - Widget shows graceful failure message/backoff
   - No uncaught promise rejection stack spam
   - No repeated browser-level CORS errors from direct third-party crypto requests

## 2) Lifecycle + cadence verification
1. Ensure weather/NBA/crypto/RSS pods visible.
2. Run: `window.__MISSION_CONTROL_DEBUG__.snapshot()`
3. Trigger manual refresh on each pod once.
4. Re-run snapshot.
5. Expected:
   - `refresh.<pod>.manual_refresh` increments for each clicked pod
   - `refresh.<pod>.intervalMs` reflects configured interval
   - lifecycle counts exist for init/mount after startup

## 3) Persistence + cross-tab determinism
1. Open two tabs (A and B) on dashboard.
2. In A, change pod visibility/order in Settings.
3. In B, verify state updates after sync/storage event.
4. Reload both tabs.
5. Expected:
   - same visibility/order in both tabs
   - no duplicate/missing pods introduced by layout normalize

## 4) RSS deterministic workflow
1. Add one RSS feed in Settings.
2. Click RSS refresh.
3. Mark first item as read.
4. Toggle `Show read` off/on.
5. Remove feed.
6. Expected:
   - deterministic item ordering for equal timestamps
   - read toggle behavior consistent
   - removing feed also removes orphaned items/read markers cleanly

## 5) Scripted smoke
- Run: `npm run qa:smoke:1d1`
- Expected: all checks PASS

## 6) QA exit criteria
- `npm run check` passes
- no blocker-level console spam during expected provider failures
- counters available and incrementing as expected
- reset/smoke helpers usable for repeated deterministic runs
