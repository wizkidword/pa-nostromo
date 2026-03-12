# Phase 1B Plan — Layout Persistence + Pod Visibility (Option B)

Date: 2026-03-12  
Scope: Utility pod layout persistence and user-facing hide/show toggles only.

## Goals
1. Persist utility pod placement/order in state.
2. Persist per-pod visibility (hide/show) in state.
3. Hydrate order + visibility from shared state (`/api/state`) with local fallback untouched.
4. Keep non-migrated/unknown pods safe (auto-include as visible; no deletion/pruning).

## Implementation Notes
- Added `state.layout` with:
  - `utilityRows: string[][]`
  - `visibility: Record<string, boolean>`
- Added normalization/migration helpers:
  - Builds defaults if layout missing.
  - Deduplicates IDs.
  - Merges unknown/unmigrated pods into layout safely.
  - Defaults unknown visibility to `true`.
- Added DOM metadata in utility section (`data-pod-id`, `data-layout-row`) to allow non-destructive reorder + visibility operations.
- Added Settings UI section:
  - Checkbox per pod for hide/show.
  - Up/Down reorder controls inside each row.
- Render flow now applies layout before pod renders to ensure deterministic placement on first paint.

## Risk Controls
- No auto-pruning/deletions.
- No content mutation for pods; only card placement/visibility CSS toggles.
- Existing renderers and shared-sync pipeline remain intact.

## Recovery
- Rollback documented in patch notes file.
