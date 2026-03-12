# Phase 1C Plan — Utility/Data Pod Modular Migration (Option A)

Date: 2026-03-12  
Scope: Complete low-risk modular registry migration for Weather, NBA, Crypto, RSS.

## Goals
1. Fully route Weather through pod registry seam (already adapter-ready, finalize usage path).
2. Add registry adapter pods for:
   - `nba-scores`
   - `crypto-tracker`
   - `rss-feed`
3. Keep stable pod IDs used by layout/visibility and settings.
4. Preserve current UI/behavior (renderers, refresh cadence, timestamps, controls, state shape).
5. Keep fallback-safe path: if pod module/registry registration is unavailable, legacy renderer still executes.
6. Keep shared-state behavior unchanged (`/api/state` hydration + local storage fallback).

## Implementation Notes
- Added new pod adapter modules under `app/pods/`:
  - `nba.pod.js`
  - `crypto.pod.js`
  - `rss.pod.js`
- Updated Weather adapter metadata for Phase 1C and kept existing adapter behavior.
- Updated `index.html` script load order to include new pod modules before `app.js`.
- Updated `app.js` modular seam usage:
  - Added pod wrapper render helpers: `renderWeatherPod`, `renderNbaPod`, `renderCryptoPod`, `renderRssPod`.
  - Updated timers and startup/manual refresh hooks for Weather/NBA/Crypto/RSS to call wrappers.
  - Updated render path calls that touch RSS to use modular seam wrappers while keeping existing fetch/render internals.

## Risk Controls
- No data model removals.
- No utility pod ID changes.
- No feature behavior rewrites; adapters call existing legacy renderers.
- Legacy fallback retained via `renderPodWithFallback` for all migrated pods.

## Recovery
- Rollback steps documented in patch notes file.
