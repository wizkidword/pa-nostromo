# QA Smoke Checklist — Phase 1C (2026-03-12)

## Preflight
- [ ] `npm run check` passes.
- [ ] Dashboard loads with no console errors.

## Registry Migration Coverage
- [ ] Confirm pod modules are loaded in page source/network:
  - [ ] `app/pods/weather.pod.js`
  - [ ] `app/pods/nba.pod.js`
  - [ ] `app/pods/crypto.pod.js`
  - [ ] `app/pods/rss.pod.js`
- [ ] Confirm registry contains stable IDs used by layout/visibility:
  - [ ] `weather`
  - [ ] `nba-scores`
  - [ ] `crypto-tracker`
  - [ ] `rss-feed`

## Behavior Preservation
- [ ] Weather card renders current conditions + forecast.
- [ ] NBA card renders game list (or no-games message) with timestamp.
- [ ] Crypto card renders watchlist/portfolio with provider/timestamp text.
- [ ] RSS card renders feed items (or empty-state guidance) with timestamp/error text.

## Refresh + Timestamp Controls
- [ ] Weather Refresh button updates weather content/timestamp.
- [ ] NBA Refresh button updates scores/timestamp.
- [ ] Crypto Refresh button respects cooldown and updates timestamp/provider label.
- [ ] RSS Refresh button updates feed list/timestamp.
- [ ] Auto-refresh timers still update each migrated pod over time.

## Layout/Visibility Integration
- [ ] In Settings, toggle visibility off/on for each migrated pod and verify immediate card hide/show.
- [ ] Reorder row-local pod position for migrated pods and verify order updates.
- [ ] Reload and confirm visibility/order persisted.

## Fallback Safety
- [ ] Simulate missing registry entry (temporary devtools removal or skipped pod script) and verify legacy renderer still paints pod content.
- [ ] Confirm app does not crash when one migrated pod module is missing.

## Shared State / Cross-Browser
- [ ] Tab A: change layout/visibility for migrated pods.
- [ ] Tab B: reload and verify same layout/visibility restored from `/api/state`.
- [ ] With shared API unavailable, local fallback still keeps prior pod state/preferences.

## Regression Spot Checks
- [ ] Notes/Board/Projects still render correctly.
- [ ] Non-migrated utility pods still render as before.
- [ ] No state/data loss observed after refresh + reload cycles.
