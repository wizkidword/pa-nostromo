# Phase 1A Modular Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce a modular pod foundation (contract/registry/layout/persistence + pods folder) with a safe migration path and zero behavioral regressions.

**Architecture:** Keep `app.js` as the source of truth while adding additive, browser-loaded scaffolding under `app/core` and `app/pods`. Wire a compatibility seam in `renderAll()` so migrated pods render through registry adapters, and non-migrated pods continue using legacy render functions unchanged.

**Tech Stack:** Vanilla JS, existing localStorage + `/api/state` shared persistence flow, static script includes in `index.html`.

---

## Exact File Map

### Create
- `app/core/contract.js`
- `app/core/registry.js`
- `app/core/layout.js`
- `app/core/persistence.js`
- `app/pods/date-time.pod.js`
- `app/pods/calendar.pod.js`
- `app/pods/weather.pod.js`
- `docs/patch-notes/2026-03-12-phase-1a-modular-foundation.md`
- `docs/qa/phase-1a-smoke-checklist-2026-03-12.md`

### Modify
- `index.html` (script load order for core + pod adapters)
- `app.js` (registry fallback seam in `renderAll`, changelog seed entry)

## Commit Slicing

### Commit 1 — Planning + scaffolding files
- Add core module files and initial pod adapter files.
- No runtime behavior change yet.

### Commit 2 — Runtime wiring + docs
- Add script includes in `index.html`.
- Add `renderPodWithFallback()` seam in `app.js` and seed changelog note.
- Add patch notes and QA smoke checklist docs.
- Run `npm run check` and document result.

## Safety / No-Regression Guardrails

1. Do not remove or reorder existing dashboard sections/pods in HTML.
2. Do not modify `load()`, `save()`, `hydrateStateFromSharedApi()`, or `/api/state` API contract.
3. Keep all existing event bindings and timers; only add additive abstraction seam.
4. Migrate only Date/Calendar/Weather via adapters that call existing legacy render functions.
5. If registry is missing or pod not registered, fallback must call legacy renderer directly.

## Validation Plan

- Run `npm run check`.
- Manual smoke checks:
  - Date/time updates every second.
  - Calendar renders and reminder add/delete still works.
  - Weather renders and manual refresh button works.
  - Non-migrated pods (NBA, Crypto, Music, Camera, Streams, Voice, Shortcuts, Board) still render.
  - Shared state hydration still works (load second browser tab and confirm synced state).

## Rollback Plan

1. Revert script tags in `index.html` back to only `app.js`.
2. Revert `app.js` `renderPodWithFallback` seam to direct calls.
3. Remove `app/core` + `app/pods` files.
4. Confirm baseline with `npm run check` and dashboard smoke test.
