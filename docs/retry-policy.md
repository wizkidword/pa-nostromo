# Retry policy

The dashboard treats failed integration refreshes as bounded operations. It does
not retry indefinitely, and it keeps the last successful result visible when a
consumer has a compatible local cache.

## Crypto provider failover

`public/app/core/crypto-failover.js` is the current reusable implementation.
For a crypto watchlist refresh it applies:

- one total operation deadline of 12 seconds;
- a 4.5-second deadline for each provider attempt;
- one retry for transient failures, with jittered exponential backoff;
- cancellation propagation into the active provider request;
- a 30-second cooldown for a provider after it exhausts retryable attempts;
- immediate fallback to the next healthy provider; and
- a cached watchlist rendered as an explicit stale result when every provider
  fails.

The helper returns stable internal failure codes including
`provider_attempt_timeout`, `operation_deadline_exceeded`,
`operation_aborted`, and `provider_temporarily_unhealthy`. The dashboard uses
these only for retry decisions and diagnostics; the user-facing crypto pod
shows its normal stale or unavailable status without exposing raw provider
responses.

Tests in `tests/crypto-failover.test.mjs` cover fallback order, jitter,
attempt and total deadlines, cancellation, and the temporary-health memory.

## Meta Graph follower polling

Facebook follower polling uses the same helper for its single Meta Graph
provider before moving to its existing authenticated-session and public-page
fallbacks. The Graph API operation has an overall 20-second default deadline,
an 8-second default deadline per request, jittered backoff, and a 30-second
provider cooldown after exhausted retryable failures. A provider-provided
`Retry-After` value remains the minimum wait time. The behavior is configured
by `META_GRAPH_OPERATION_TIMEOUT_MS` and
`META_GRAPH_UNHEALTHY_COOLDOWN_MS`; the existing `META_GRAPH_TIMEOUT_MS`,
`META_GRAPH_MAX_RETRIES`, and backoff variables still apply.

The poll response and stale-cache behavior are unchanged: if Meta Graph is
unavailable, the session/public fallbacks continue, and the last verified count
remains available when no fallback can refresh it.
