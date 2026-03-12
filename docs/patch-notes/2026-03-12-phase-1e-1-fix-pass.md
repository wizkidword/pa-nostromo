# Phase 1E.1 Fix Pass — 2026-03-12

## Scope
Targeted stabilization pass on top of `d7e5c0d` to clear final QA blockers around destructive actions, undo expiry, and restore rehydration determinism.

## Fixes shipped

### 1) Cross-tab sync reliability (delete/undo/restore)
- Added deterministic cross-tab sync event rail:
  - `BroadcastChannel` (`mission-control-shared-sync-channel-v1`)
  - storage-event fallback key (`mission-control-shared-sync-event-v1`)
- Sync hydration now re-pulls canonical state from `/api/state` on sync signals (`scheduleSharedHydrate`) instead of trusting potentially stale per-tab local storage payloads.
- Sync events are emitted **after successful shared-state write** to avoid stale-before-write races.
- Restore and import paths now emit explicit cross-tab sync events.

### 2) Undo expiry determinism (12s)
- Replaced token-only undo handling with explicit undo lifecycle state:
  - `actionId`
  - `status` (`offered` / `undone` / `expired` / etc.)
  - `expiresAt`
  - timer handle
- Undo click now validates:
  - action id match
  - status still `offered`
  - current time <= expiry
- Expiry transition now only closes affordance and marks expired (does not restore).
- Deletion flow now generates stable action IDs and emits deterministic sync events for delete/undo/expiry edges.

### 3) Restore determinism and full rehydrate
- Restore flow now:
  - clears active undo affordance/state
  - forces hydration from `/api/state` via `scheduleSharedHydrate('manual_restore_applied')`
  - emits explicit `state_restored` sync event for other tabs
- Import flow now applies incoming state through shared apply path + sync event, keeping behavior aligned with restore.

### 4) Post-restore project count mismatch / 0 rendering regression
- Removed direct state adoption from raw `STORAGE_KEY` cross-tab events.
- Tabs now rehydrate from canonical shared API for sync events, preventing stale local payload races that could transiently render mismatched/empty project sets after restore.

## QA automation updates
- Added deterministic smoke script:
  - `scripts/qa-phase1e-1-fix-pass.mjs`
- Script validates:
  - cross-tab delete + undo propagation
  - undo expiry remains final (no implicit restore)
  - restore API success + post-restore project count parity across tabs
  - post-restore dependent-view rehydrate via marker rollback

## Validation run
- `npm run check` ✅
- `node scripts/qa-phase1e-1-fix-pass.mjs` ✅
