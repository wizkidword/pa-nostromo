# Durable Shared State

PA Nostromo stores shared dashboard state at `DATA_DIR/state.json`. The browser may keep a local fallback copy, but the server-side file is the authoritative copy used by every browser connected to the same local app.

## Schema and migration

The current state schema is version `2`, stored as the root-level `schemaVersion` field. The boundary validates the root JSON object, durable collections, IDs, bounded strings/arrays, supported task/project/camera enums, timestamps, and known URL fields before a state update can reach disk. Unknown top-level UI settings are retained deliberately so a newer dashboard view does not lose settings when it talks to an older server.

Legacy state files without `schemaVersion` are treated as version 1. On the first read, the server:

1. writes the original file to `DATA_DIR/backups/` with reason `pre_migration`;
2. writes the v2 form atomically; and
3. adds a new integrity revision.

No manual action is normally required. A file declaring a schema newer than v2 is left untouched and the API reports that it is unsupported. Upgrade the app before trying to use that state file.

## Safe writes and recovery

All state changes go through one serialized write queue. A new JSON file is flushed to a temporary file in the same directory and renamed into place only after the flush succeeds. Startup removes abandoned `.state-*.tmp` files from interrupted writes.

Previous state is snapshotted before accepted writes, with routine snapshots coalesced for 30 seconds (`STATE_BACKUP_MIN_INTERVAL_MS` can adjust this). Backup retention defaults to 200 verified snapshots. Invalid backups are retained rather than deleted by retention cleanup.

If `state.json` cannot be parsed, fails integrity verification, or fails schema validation, it is renamed to `state.corrupt-<reason>-<timestamp>-<nonce>.json`. The server returns a clear state-unavailable response and a browser can seed a new shared state; inspect or restore the quarantined file first if it contains needed data.

## Revision conflicts

An empty shared store allows its initial save without a revision (or with `If-Match: "0"`). Once state exists, every replacement must include its current revision:

```http
POST /api/state
If-Match: "14"
Content-Type: application/json
x-pa-nostromo-csrf: <same-origin bootstrap token>
```

The current dashboard sends this automatically. A stale writer receives `409` and no full state payload:

```json
{
  "ok": false,
  "error": "state_revision_conflict",
  "message": "Shared state changed before this save completed.",
  "currentRevision": 15
}
```

An existing state written without `If-Match` is rejected with `428 state_revision_required`. This makes an accidental blind overwrite impossible.

When a browser hits a conflict, it preserves the local draft and shows three explicit choices:

- **Reload shared** — discard the local draft and load the newest shared state.
- **Export my edits** — download the preserved draft as JSON.
- **Keep my edits** — after a confirmation, fetch the newest revision and deliberately overwrite it.

## Backup restore and import

Restoring a backup is also revision-aware and creates a forced `pre_restore` snapshot first. If another browser writes first, reload shared state and choose the restore again. Import uses the same validation and revision guard; it cannot bypass a stale revision or write malformed state to disk.
