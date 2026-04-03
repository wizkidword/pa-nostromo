# PA Nostromo Takeover Notes

Date: 2026-04-03
Source reviewed: `\\wsl.localhost\Ubuntu-24.04\home\wizkidword\.openclaw\workspace\project-mission-control-lite`
Destination: `C:\Users\jrock\Documents\CODERSCORNER\CODEX\pa-nostromo`

## What Was Migrated

- Core application runtime: `app.js`, `server.js`, `index.html`, `styles.css`
- Modular pod scaffolding under `app/core/` and `app/pods/`
- Product docs, plans, patch notes, QA notes, and screenshots
- Scripts and tests
- Static assets and repository metadata
- `data/qa-reset-state.json` for deterministic QA reset flows

## What Was Intentionally Not Migrated

- Source `.git` history
- `node_modules/`
- `.env` and `.env.local`
- `logs/` and `test-results/`
- Live runtime state and backups under `data/`
- Browser/auth session material under `data/.auth/`

## Current Architecture Snapshot

- Frontend is still centered in a large `app.js` runtime with broad global state ownership.
- Backend is a single `server.js` HTTP service with multiple local-first API endpoints and disk-backed persistence.
- A pod registry/contract layer exists and Phase 1 migrated a subset of pods into adapter modules.
- Tests currently cover crypto failover, crypto proxy curl fallback, and Facebook follower parsing/API behavior.
- Guardrails and CI exist, but most long-term scale risk remains in `app.js` and `server.js`.

## Highest-Value Next Steps

1. Decouple `renderAll()` from persistence and shared-state push side effects.
2. Add a hydration lock/conflict policy so startup sync cannot overwrite newer shared state.
3. Continue extracting pod logic and network adapters out of `app.js`.
4. Expand reproducible test coverage around cross-tab sync, camera lifecycle, and voice pods.
5. Keep local/runtime data untracked and treat `.env` plus `data/.auth/` as machine-only.
