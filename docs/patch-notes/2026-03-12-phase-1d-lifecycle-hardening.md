# Patch Notes — 2026-03-12 Phase 1D Lifecycle Hardening

## Summary
Phase 1D hardens utility pod lifecycle handling and timer/listener ownership without changing intended end-user behavior.

## What Changed
- **Core contract (`app/core/contract.js`)**
  - Added normalized lifecycle hook contract support:
    - `init`, `mount`, `refresh`, `unmount`, `destroy`
  - Retained legacy `render` compatibility.

- **Core registry (`app/core/registry.js`)**
  - Added per-pod runtime state tracking (`initialized`, `mounted`).
  - Added lifecycle actions:
    - `init`, `mount`, `refresh`, `unmount`, `destroy`
  - `render` now routes through lifecycle mount path.
  - Added safety wrappers so hook failures do not crash silently.

- **Migrated utility pods**
  - `weather`, `nba-scores`, `crypto-tracker`, `rss-feed` now own auto-refresh timers in lifecycle (`init`/`destroy`) to prevent duplicate intervals.
  - Lifecycle refresh delegates to existing legacy render functions (fallback-safe).

- **Compatibility adapters**
  - `date-time` and `calendar` adapters updated with explicit no-op lifecycle compatibility.

- **App integration (`app.js`)**
  - Added lifecycle action wrapper (`runPodLifecycleAction`) and utility lifecycle sync (`syncUtilityPodLifecycle`).
  - Utility visibility state now safely mounts/destroys relevant pods.
  - Existing interval setup entry points now reinitialize pod lifecycle safely.
  - Startup/hydration flow simplified to avoid duplicate direct pod refresh/timer setup paths.

## Behavior Expectations
- Refresh controls continue to function.
- Auto-refresh still functions for weather/NBA/crypto/RSS.
- Repeated render/toggle/reorder cycles do not multiply timers/listeners for lifecycle-managed pods.
- Utility layout visibility and persistence stay intact.

## Rollback Plan
If regression is detected:
1. Revert commit for this patch:
   - `git revert <phase-1d-commit-sha>`
2. Validate recovery:
   - `npm run check`
   - Run `docs/qa/phase-1c-smoke-checklist-2026-03-12.md`
3. Confirm fallback behavior:
   - Utility pods render via legacy fallback path
   - Auto-refresh behavior returns to pre-Phase-1D baseline

## Risk Notes
- Lifecycle-managed timers now depend on registry mount/destroy flow; any skipped sync path may delay refresh until next render/mount cycle.
- Legacy render fallback remains active to reduce blast radius.
