# Patch Notes — 2026-03-12 Phase 1F Release Hardening

## Summary
Phase 1F delivers a release-candidate hardening pass focused on reliability and deterministic behavior (no major feature expansion).

## What changed

### Reliability + sync stability
- Cross-tab shared-state hydrate now coalesces burst events (storage + BroadcastChannel) using a short throttle window.
- Added startup sync outcome tracking (`sharedHydrationLastOutcome`) to improve observability and triage.
- Added defensive render guards for key UI blocks (`projects`, `stats`) to prevent avoidable runtime exceptions.

### Error handling + deterministic fallback
- Startup shared hydrate now records explicit fallback outcome when hydrate fails and remains local-safe.
- QA debug surface now includes `syncDebug()` for non-destructive verification of sync readiness.

### Smoke hardening
- Added `qa:smoke:1f` to run release smoke in one deterministic command:
  1. `npm run check`
  2. `npm run qa:smoke:1d1`
  3. `npm run qa:smoke:1e1`
- Updated Phase 1E.1 smoke script to:
  - wait for shared hydration readiness before assertions,
  - target seeded task specifically for undo-expiry verification.
- Updated Phase 1D.1 smoke script to:
  - use stable base URL fallback chain,
  - accept upstream crypto `429` as route-level pass (proxy reachable).

## Operator impact
- Better stability under cross-tab sync bursts.
- Cleaner, less noisy runtime failure modes.
- More deterministic CI/local smoke for release gate.

## Backward compatibility
- No schema break introduced.
- Existing user flows and saved state remain compatible.
