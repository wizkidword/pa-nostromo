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
Other integrations retain their existing request-level timeouts, coordinated
work limits, and stale-cache behavior until they adopt this shared policy.
