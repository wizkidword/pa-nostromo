# QA Smoke Checklist — Phase 1A Modular Foundation (2026-03-12)

## Automated
- [ ] `npm run check` passes (`node --check` + guardrails lint)

## Manual UI Baseline
- [ ] Dashboard loads with no blank sections or JS fatal errors.
- [ ] Date/time widget updates every second.
- [ ] Calendar widget renders current month.
- [ ] Add calendar reminder works.
- [ ] Delete calendar reminder works.
- [ ] Weather widget shows current temp/conditions.
- [ ] Weather "Refresh" button works.

## Non-Migrated Pod Regression Sweep
- [ ] NBA pod renders.
- [ ] Crypto pod renders.
- [ ] Music pod renders.
- [ ] Camera Feed pod renders.
- [ ] Live Streams pod renders.
- [ ] Voice Note pod renders.
- [ ] Voice to Rowan pod renders.
- [ ] Shortcuts pod renders.
- [ ] Board/Tasks drag-drop still works.

## Shared State / Persistence
- [ ] Local state still persists after reload.
- [ ] Shared state hydrates from `/api/state` when available.
- [ ] Cross-tab/browser change sync still occurs after state-changing action.

## Sentinel QA Focus (for reviewer)
- [ ] Confirm fallback path: when registry/pod missing, legacy render function is still executed.
- [ ] Confirm no removal/pruning of existing dashboard content.
- [ ] Confirm no contract changes in state schema and no `/api/state` behavior change.
