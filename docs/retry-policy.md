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

## Meta Graph refreshes

Facebook follower polling and the shared Meta Graph JSON client use the same
helper before moving to their existing fallback paths. That client serves
Instagram profile/content and Facebook content refreshes, so the provider
cooldown is shared across these Meta Graph operations. The Graph API operation
has an overall 20-second default deadline, an 8-second default deadline per
request, jittered backoff, and a 30-second provider cooldown after exhausted
retryable failures. A provider-provided `Retry-After` value remains the
minimum wait time. Meta's transient Graph error codes (including rate-limit
codes) also use this path. The behavior is configured by
`META_GRAPH_OPERATION_TIMEOUT_MS` and `META_GRAPH_UNHEALTHY_COOLDOWN_MS`; the
existing `META_GRAPH_TIMEOUT_MS`, `META_GRAPH_MAX_RETRIES`, and backoff
variables still apply.

The poll response and stale-cache behavior are unchanged: if Meta Graph is
unavailable, the session/public fallbacks continue, and the last verified count
remains available when no fallback can refresh it.

## Public social follower refreshes

TikTok follower and YouTube subscriber refreshes use the same deadline,
jitter, cancellation, and cooldown settings as the social polling layer. A
temporary fetch failure can retry, and an upstream `Retry-After` value is
honored. A missing follower/subscriber signal is treated as parser drift rather
than a transient network failure, so it does not create a synchronized retry
loop; the existing last-known-good value is instead returned as stale data.

## RSS refreshes

RSS refreshes retry only transient network and upstream failures. Each refresh
has a total deadline, a per-attempt deadline, jittered backoff, cancellation,
and a short per-feed cooldown after exhausted transient failures. A
provider-supplied `Retry-After` value is the minimum wait. RSS parser failures
remain explicit and are not retried; when a feed has a last-known-good cache,
the existing stale response is returned instead. Configure this with the
`RSS_FETCH_*` retry variables in `.env.example`.
