# Phase 1D.1 Stabilization Plan (2026-03-12)

## Scope
Stabilize Phase 1D for Sentinel QA by addressing:
1. Crypto/network console noise and unhandled rejections
2. Pod lifecycle cadence verification visibility
3. Deterministic QA reset/smoke helpers
4. Persistence/cross-tab/RSS determinism hardening

## Implementation Summary

### 1) Console hygiene and crypto fetch containment
- Added server-side crypto proxy routes under `/api/crypto/*` for CoinGecko, CoinCap, and CryptoCompare paths used by the dashboard.
- Migrated client crypto fetches from direct third-party URLs to local proxy routes.
- Added defensive async render invocation wrappers in pod adapters and pod fallback lifecycle calls to prevent unhandled promise rejections (common source of noisy console errors during expected upstream failures).

### 2) Lifecycle/timer verification hooks
- Added `app/core/debug.js` exposing `window.__MISSION_CONTROL_DEBUG__`.
- Added lightweight counters for lifecycle and refresh paths:
  - registry lifecycle init/mount/unmount/destroy
  - registry refresh/render calls
  - pod timer auto-refresh ticks
  - manual refresh counts (weather/NBA/crypto/RSS)
  - current configured intervalMs per managed pod

### 3) Deterministic QA helper support
- Added shared reset fixture: `data/qa-reset-state.json`.
- Added script: `npm run qa:reset-state` (explicit destructive guard via `--yes` hardcoded in script command).
- Added local-reset helper in browser: `window.__MISSION_CONTROL_QA__.resetLocalState()`.
- Added smoke script: `npm run qa:smoke:1d1`.

### 4) Persistence/cross-tab/RSS hardening
- Added storage event listener for local cross-tab state refresh consistency.
- Added deterministic RSS item sorting tie-breaker for equal timestamps.
- Added deterministic RSS feed ordering normalization by `addedAt` + `id`.
- Hardened RSS server parsing to avoid invalid-date exceptions when feed timestamps are malformed.

## Non-goals
- No default pruning/deletion of user content in normal operations.
- No UI bloat from debug counters (console/API style debug only).
