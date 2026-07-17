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
credentials, email/message bodies, raw upstream bodies, nested error causes, local
Windows paths, and command-like text. Error stacks are not serialized.

The current package standardizes request tracing and redaction. Log retention,
rotation, job envelopes, parser fixtures, retries, CI workflow changes, and version
surface alignment remain separate Phase 8 packages so that each can be verified
without changing the app's operational behavior all at once.
