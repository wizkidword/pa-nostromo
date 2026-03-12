# QA Smoke Checklist — Phase 1D Lifecycle Hardening (2026-03-12)

## Environment
- Branch: phase-1d lifecycle hardening
- Build check: `npm run check`
- Browser: Chrome (latest)

## Core lifecycle checks
1. Load dashboard fresh.
2. Confirm no runtime errors in console.
3. Confirm utility pods render: Weather, NBA Scores, Crypto Tracker, RSS Feed.
4. Confirm Date/Calendar still render normally.

## Timer/listener hardening checks
5. Keep app open for >2 auto-refresh windows (or temporarily lower intervals for QA).
6. Verify weather/NBA/crypto/RSS each refreshes normally and only once per interval.
7. Toggle each managed pod off then on 5 times from Settings.
8. After toggles, verify no accelerated/multiplied refresh behavior.
9. Reorder pods up/down repeatedly (10+ operations across rows).
10. Verify no duplicate refresh bursts or duplicated event responses.

## Manual refresh controls
11. Click Weather refresh button; verify immediate update and no duplicate updates.
12. Click NBA refresh button; verify immediate update and no duplicate updates.
13. Click Crypto refresh button; verify cooldown behavior still works.
14. Click RSS refresh button; verify list updates and no duplicate entries from one click.

## Visibility + persistence
15. Hide two utility pods and reload page; hidden state persists.
16. Re-show pods and verify they render/refresh correctly.
17. Reorder pods, reload page, verify row order persists.

## RSS interaction regression
18. Add a feed in Settings; verify feed appears and refresh works.
19. Mark several RSS items read; toggle Show Read; verify expected filtering.
20. Remove feed; verify items cleanup remains correct.

## Pass Criteria
- No console errors caused by lifecycle hooks.
- No duplicate timers/listeners observable through repeated toggle/reorder cycles.
- Manual refresh and auto-refresh both function for managed pods.
- Visibility/order persistence unchanged from previous phase.

## Sentinel report format
- Result: PASS / FAIL
- Repro steps for any failure
- Screenshot/video if visual issue
- Console stack trace snippet if error
