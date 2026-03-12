# QA Smoke Checklist — Phase 1E Data Safety (2026-03-12)

## Preflight
- [ ] `npm run check` passes.
- [ ] App starts and loads existing shared state.
- [ ] Open Settings → State Safety.

## Snapshot metadata + listing
- [ ] Click **Refresh Backups**.
- [ ] Confirm backup list renders.
- [ ] Confirm each entry shows: timestamp, reason, revision, checksum short hash.

## Restore UX
- [ ] Pick a recent backup and click **Restore**.
- [ ] Confirm warning prompt appears before restore.
- [ ] Accept restore and confirm success alert appears.
- [ ] Verify state hydrates and visible board data updates.
- [ ] Re-open backup list and verify a pre-restore snapshot exists.

## Undo safety (12s window)
- [ ] Delete one note; confirm undo bar appears; click Undo; note returns.
- [ ] Delete one reminder; click Undo; reminder returns.
- [ ] Delete one shortcut; click Undo; shortcut returns.
- [ ] Remove one RSS feed; click Undo; feed returns (and associated feed items/read state return).
- [ ] Open task edit dialog, delete a task, click Undo; task returns.
- [ ] Repeat one delete flow and do **not** click Undo; verify undo prompt auto-hides after ~12s and deletion persists.

## Guardrails (QA/script overwrite protection)
- [ ] Run `node scripts/qa-reset-state.mjs --yes` against default localhost target.
- [ ] Verify command is blocked unless `--allow-live` is explicitly provided.
- [ ] Verify server rejects `source=qa_script` write when `explicitLiveOverride` is false.
- [ ] Verify qa reset succeeds only with explicit opt-in path.

## Integrity metadata
- [ ] Trigger at least one save action.
- [ ] Inspect `/api/state/backups` response and confirm snapshot metadata includes schema/revision/checksum fields.
- [ ] Restore from backup and verify state integrity metadata (`revision`, `stateSchemaVersion`, `checksum`) updates.

## Cross-tab sanity
- [ ] Open two tabs.
- [ ] Perform delete+undo in Tab A; verify final state in Tab B after refresh/hydration.
- [ ] Perform restore in Tab A; verify Tab B can observe restored state after reload.
