# Operational observability

## Public request failures

Every HTTP response carries an `X-Request-ID` header. A caller may supply its own
ID with `X-Request-ID` when it starts with a letter or digit, contains only letters,
digits, dots, underscores, or hyphens, and is 8-128 characters long. Invalid or
absent IDs are replaced with a server-generated `req_...` value.

All JSON error responses use this stable, safe shape:

```json
{
  "ok": false,
  "error": "integration_failed",
  "message": "The service could not complete the request.",
  "requestId": "req_example"
}
```

The `error` code identifies the kind of failure. The `message` is selected from
the HTTP status, rather than from an exception or upstream response. This prevents
browser clients from receiving stack traces, local paths, command output, provider
response bodies, account identifiers, or credentials. A small number of safe
numeric fields remain where clients require them, such as `currentRevision` for a
state-write conflict.

When reporting a problem, include the request ID and the approximate request time.

## Server diagnostics

Server error diagnostics are structured JSON records with an event name and a
request ID when one is available. Diagnostic serialization redacts authorization
headers, cookies, tokens, secrets, app passwords, OAuth values and URLs with
credentials, email/message bodies, raw upstream bodies, imported state, account
identifiers, nested error causes, local paths, and command-like text. Error stacks
are not serialized.

## Log retention

The server writes redacted diagnostics to `LOG_DIR/server-diagnostics.jsonl`. The
Facebook, Facebook-group, Instagram, TikTok, and YouTube poller JSONL files use the
same writer. Each log rotates before its active file exceeds the configured size;
the oldest archive is removed once the configured file count is reached. Existing
oversized files are rotated on their next write.

Defaults are 1 MiB per active file (`LOG_ROTATION_MAX_BYTES=1048576`) and five
files per log (`LOG_RETENTION_FILES=5`), including the active file. The server
enforces minimums of 64 KiB and two files. Logging is best-effort: a write or
rotation failure produces a safe console event and does not stop the application.

Operational logs contain compact event metadata, request IDs, safe error codes,
timing, and count/status fields. They do not retain email/message bodies, imported
state, upstream response bodies, credentials, sessions, or account identifiers.

Integration envelopes, parser fixtures, retries, CI workflow changes, and version
surface alignment remain separate Phase 8 packages.
