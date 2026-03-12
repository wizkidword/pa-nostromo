# QA Smoke Checklist — Phase 1B (2026-03-12)

## Preflight
- [ ] `npm run check` passes.
- [ ] App launches without console errors.

## Visibility Toggles
- [ ] Open Settings → Utility Pods section is present.
- [ ] Uncheck a pod (e.g., Weather) and confirm card hides immediately.
- [ ] Re-check same pod and confirm card reappears.
- [ ] Reload page and confirm visibility choice persists.

## Layout Order Persistence
- [ ] In Settings, move a pod down within its row.
- [ ] Confirm visual order updates immediately.
- [ ] Reload page and confirm moved order persists.
- [ ] Move pod back up; verify order updates and persists after reload.

## Shared State Hydration / Cross-Tab
- [ ] Tab A: change visibility and order.
- [ ] Tab B: reload; confirm same visibility + order restored from shared state.
- [ ] With shared API unavailable (simulate by stopping server API route), local fallback still retains last saved layout/visibility after reload.

## Fallback Safety
- [ ] Confirm all existing utility pods still render content (Date/Calendar/Weather/NBA/Crypto/RSS/Camera/Live/Voice/Music/Shortcuts).
- [ ] Confirm no pod content/state was deleted.
- [ ] Confirm unknown/missing layout IDs do not crash rendering.

## Regression Spot Checks
- [ ] Settings panel opens/closes normally.
- [ ] Weather/NBA/Crypto/RSS refresh buttons still work.
- [ ] Notes/Board/Projects still render and are unaffected.
