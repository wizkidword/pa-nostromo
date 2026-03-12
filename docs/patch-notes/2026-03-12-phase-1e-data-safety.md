# Patch Notes — 2026-03-12 — Phase 1E Data Safety

## Summary
Phase 1E adds a board/data safety layer that improves accidental-loss resistance and self-service recovery.

## What changed

### State safety + snapshots
- Kept automatic pre-write/pre-restore backup snapshots.
- Added richer snapshot metadata for operator trust and debugging:
  - state/snapshot schema versions
  - revision number
  - reason/source labels
  - checksum and critical object counts

### Settings → State Safety UX
- Added backup browser list in Settings.
- Added one-click restore on each backup entry.
- Added explicit confirmation prior to restore.
- Added manual refresh button for backup list.

### Undo safety for destructive actions
- Added short-lived undo affordance (12s) for:
  - deleting tasks
  - deleting notes
  - deleting reminders
  - removing RSS feeds
  - deleting shortcuts

### Guardrails
- Strengthened server write-control policy for QA/script writes:
  - `qa_script` writes require `explicitLiveOverride=true`.
- Updated QA reset helper to use `source=qa_script` and only opt into live overwrite with `--allow-live`.

## Migration / compatibility
- Backward compatible with older snapshots (missing metadata is tolerated and shown as unknown/default values).
- Existing shared-state API endpoints stay compatible.

## Rollback
If rollback is required:
1. Revert commit for Phase 1E.
2. Restart server.
3. Verify `/api/state` read/write still works with previous behavior.
4. Optional: keep existing backup files; they are plain JSON and safe to retain.

## Ops notes
- Snapshot retention remains bounded by `BACKUP_RETENTION` (default 200 files).
- Restore creates an automatic pre-restore snapshot before applying selected backup.
