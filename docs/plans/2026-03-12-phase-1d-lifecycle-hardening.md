# Phase 1D Plan — Utility Pod Lifecycle Hardening (Option A)

Date: 2026-03-12
Owner: Mission Control Lite

## Objectives
- Standardize utility pod lifecycle semantics around `init`, `mount`, `refresh`, `unmount`, and `destroy`.
- Prevent duplicate timers/listeners during repeated renders, visibility toggles, and row reorders.
- Keep existing UI/state behavior unchanged (fallback-safe, no intentional feature changes).

## Scope
### Core
- Extend pod contract normalization to include lifecycle hooks.
- Extend pod registry with lifecycle runtime state and actions:
  - `init(podId, ctx)`
  - `mount(podId, ctx)`
  - `refresh(podId, ctx)`
  - `unmount(podId, ctx)`
  - `destroy(podId, ctx)`
- Keep `render()` compatibility by routing to lifecycle mount behavior.

### Migrated Utility Pods (minimum)
- `weather`
- `nba-scores`
- `crypto-tracker`
- `rss-feed`

For these pods, move auto-refresh timer ownership into lifecycle `init/destroy` so timers are singular and teardown-safe.

### Compatibility
- Keep non-target pods safe through default/no-op lifecycle compatibility (date-time/calendar adapters updated).
- Preserve legacy render fallback path if lifecycle registry is unavailable.

## Implementation Notes
- `mount` is idempotent and calls `refresh` each invocation.
- `destroy` always clears mounted/initialized runtime state and hook-side resources.
- Visibility syncing drives lifecycle:
  - visible => `mount`
  - hidden => `destroy`
- Reorder-only operations should not remount duplicate listeners/timers.

## Validation
- Run `npm run check`.
- Execute smoke checklist in `docs/qa/phase-1d-smoke-checklist-2026-03-12.md`.

## Non-Goals
- No feature/UI redesign.
- No persistence schema changes.
- No drag-and-drop implementation in this phase.
