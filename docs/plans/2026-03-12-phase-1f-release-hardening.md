# Phase 1F Plan — Release Hardening (Option A)

Date: 2026-03-12
Target: Phase 1 release candidate (`v1.0.0-rc` readiness)

## Objective
Stability-first hardening pass across core flows (board/tasks, notes/pods, state safety restore/undo, cross-tab sync) with minimal-risk changes and deterministic QA coverage.

## Scope Executed

### 1) Reliability sweep
- Hardened cross-tab hydrate scheduling to avoid burst-trigger rerender storms:
  - Added small hydrate throttle window (`SHARED_HYDRATE_MIN_INTERVAL_MS`) with queue coalescing.
  - Prevents back-to-back storage + BroadcastChannel bursts from repeatedly rehydrating.
- Added defensive null-guards for critical render surfaces (`renderProjects`, `renderStats`) to avoid non-actionable runtime errors if DOM anchors are unavailable.
- Added startup sync outcome tracking (`sharedHydrationLastOutcome`) for deterministic diagnostics.

### 2) Error-handling polish
- Added explicit startup hydrate failure fallback outcome (`hydrate_failed_local_only`) so app remains local-safe/deterministic even when shared API hydrate fails.
- Added QA-visible sync diagnostics (`window.__MISSION_CONTROL_QA__.syncDebug`) to verify state-sync readiness without destructive probing.

### 3) Performance sanity
- Reduced obvious hot path risk by coalescing rapid shared-hydrate requests rather than running full hydrate/render on each sync event burst.

### 4) Cleanup/tidy
- Kept useful safety/debug tooling, but constrained it to compact structured diagnostics (syncDebug) instead of ad-hoc probing.
- No risky rewrites or feature additions.

### 5) Release-readiness validation updates
- Added `npm run qa:smoke:1f` release smoke entrypoint.
- Hardened deterministic QA scripts:
  - `qa-phase1e-1-fix-pass.mjs` now waits for startup shared-sync resolution before assertions.
  - Task delete/undo expiry assertion now targets the explicit seeded QA task card.
  - `qa-smoke-phase-1d-1.mjs` now uses a deterministic base URL chain and treats upstream crypto 429 rate limit as route-reachable for smoke purposes.

## Validation Commands
- `npm run check`
- `npm run qa:smoke:1f`

## Risk Notes
- Shared hydrate throttle uses a conservative 250ms window; behavior is intentionally minimal-change and should not affect user-visible state correctness.
- Crypto smoke check intentionally validates route wiring, not third-party uptime/rate-limit behavior.
