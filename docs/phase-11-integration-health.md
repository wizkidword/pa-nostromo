# Phase 11.1: Integration Health Center

The **Settings → Integration Health** panel gives one compact, privacy-safe
view of the dashboard's eight data integrations:

- Weather, NBA scores, cryptocurrency, RSS, unread email, social followers,
  eBay traffic, and gas prices.
- Configuration and enablement are shown separately, so a source that has not
  been configured is never mistaken for one the user deliberately disabled.
- Each integration has a clear health state: healthy, refreshing, stale,
  rate-limited, error, disabled, or not configured.
- When known, the panel shows the last successful refresh, latest attempt,
  source-update time, next scheduled refresh, and any manual-refresh cooldown.

## Recovery and safety

The panel offers a manual refresh and either an appropriate setup shortcut or a
plain-language recovery hint. Manual refreshes use the dashboard scheduler's
single-flight protection and per-integration cooldown, preventing duplicate
requests when a button is pressed repeatedly.

Expandable diagnostics intentionally contain only a sanitized error category
and recovery advice. Provider responses, tokens, addresses, and other raw
error details are not rendered.

## Verification

The Phase 11.1 implementation is covered by integration-health and scheduler
unit tests, the full fast suite, dependency audit, type check, accessibility
smoke test, dashboard browser smoke test, and a real-browser visual inspection
of the Settings panel.
