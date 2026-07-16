# Outbound Network Inventory

## Protected HTTP clients

`lib/safe-fetch.js` is the mandatory boundary for ordinary server-side HTTP(S) calls. It validates the normalized URL, forbids URL credentials, resolves and validates every DNS answer, pins the validated address into the actual connection, revalidates redirect targets, bounds redirects/response bytes/deadlines, and returns redacted error codes.

It is used by RSS, camera snapshots, crypto and gas lookups, public social fallbacks, Meta/Instagram API calls, eBay API/report requests, and Gmail Atom feeds. Camera fetches additionally require `CAMERA_PROXY_ALLOWLIST`, disallow redirects, and return only image content types.

`lib/work-coordinator.js` bounds concurrent work, enforces per-integration/per-host limits, deduplicates identical in-flight work, applies manual-refresh cooldowns, propagates cancellation, and terminates managed child processes. It is used by RSS, camera, crypto, eBay, email Atom, social HTTP, gas, and speed-test work. RSS also maintains a bounded last-known-good cache and returns an explicit stale result when refresh fails.

## Deliberate exceptions and follow-up work

| Call surface | Why it does not use `safeFetch` | Current containment |
| --- | --- | --- |
| `ROWAN_RELAY_URL` | It is an explicitly configured trusted relay and commonly points at a loopback service, which `safeFetch` must reject. | Local-only by default, scoped remote API authorization, timeout, optional relay auth header. A future trusted-relay adapter should add an explicit endpoint identity policy. |
| Gmail IMAP in `lib/email-imap.js` | Raw IMAP-over-TLS is not HTTP. | Explicit host/port configuration and bounded operation timeouts. |
| Playwright session scrapers | Browser automation is not an HTTP client and may need logged-in storage. | Script-specific timeouts and controlled session-storage paths. Moving every browser job into the coordinator is follow-up work. |
| Ping/Wake-on-LAN/system diagnostics | These are intentional local-network or OS subprocess operations, not web fetches. | Local-only route policy by default, input validation, command timeouts; speed-test jobs are coordinated and cancellation-aware. |

No arbitrary URL is passed to `curl`; the former compatibility helpers now route through `safeFetch` despite retaining their exported names temporarily.
