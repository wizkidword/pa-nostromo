# Phase 1E Plan — Data Safety Layer (Option C)

Date: 2026-03-12

## Objective
Prevent accidental task/data loss and provide fast, user-controlled recovery from the Settings UI.

## Scope Implemented

1. **Versioned state checkpoints + snapshots**
   - Keep automatic pre-write and pre-restore snapshots in `data/backups/`.
   - Add snapshot metadata:
     - `snapshotSchemaVersion`
     - `stateSchemaVersion`
     - `revision`
     - `reason`
     - `checksum`
     - critical counts (`tasks`, `notes`, `projects`, `reminders`, `layoutRows`)
   - Keep bounded snapshot storage using existing rotation policy (`BACKUP_RETENTION=200`).

2. **One-click restore UX (Settings → State Safety)**
   - Added backup list in UI with timestamp + reason + revision + checksum short hash.
   - Added Restore button per snapshot with explicit confirmation prompt.
   - Restore path creates a pre-restore safety snapshot server-side before applying backup.

3. **Undo safety for destructive actions**
   - Added short-window undo surface (12s) in State Safety panel.
   - Undo wired for practical destructive actions:
     - task delete
     - note delete
     - calendar reminder delete
     - RSS feed remove (with feed items/read state restoration)
     - shortcut delete

4. **Guardrails for QA/script overwrites**
   - Server now blocks `source=qa_script` unless `explicitLiveOverride=true` is set.
   - QA reset script now sends `source=qa_script` and only sets `explicitLiveOverride` when `--allow-live` is explicitly provided.
   - Existing downgrade-block logic remains in place.

5. **Integrity checks**
   - Continued SHA-256 checksum on state payload (`__integrity.checksum`).
   - Added revision + state schema metadata to integrity payload.
   - Surface checksum/revision in backup list to aid operator verification.

## Non-goals / constraints respected
- No default auto-pruning/deletion of user content data structures.
- Existing app flows preserved; changes are additive and fallback-safe.
- Shared-state multi-browser behavior preserved via existing `/api/state` flow.

## Validation
- `npm run check`
