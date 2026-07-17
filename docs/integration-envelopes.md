# Integration response envelopes

Manifest-backed integration responses now retain their established top-level
payload and add a compatibility envelope at `integration`:

```json
{
  "integration": {
    "status": "ok",
    "data": {},
    "fetchedAt": "2026-07-16T12:00:00.000Z",
    "sourceUpdatedAt": null,
    "parserVersion": "rss-atom-v1",
    "warning": null,
    "errorCode": null
  }
}
```

Keeping the legacy fields during this transition avoids breaking existing browser
pods while giving new code one uniform contract. `integration.data` contains the
legacy snapshot for `ok` and `stale` responses. It is `null` for `error`,
`not_configured`, and `disabled` states.

## Status meanings

| Status | Meaning |
| --- | --- |
| `ok` | A current result is available. |
| `stale` | The endpoint served the last successful result after a refresh problem. |
| `error` | No usable result is available; inspect the stable `errorCode`. |
| `not_configured` | The integration needs credentials or other operator setup. |
| `disabled` | The integration was explicitly disabled. |

Parser failures use `status: "error"`, `data: null`, and a stable parser error
code. They must never be represented as a successful empty result.

`parserVersion` identifies the current parser or provider family, such as
`rss-atom-v1`, `aaa-gas-v1`, `crypto-json-v1`, `gmail-unread-v1`,
`ebay-analytics-v1`, `social-content-v1`, and `social-followers-v1`. It is a
contract marker for fixture and drift tests, not an upstream provider version.

The envelope applies to RSS, gas, crypto, eBay, social integration routes, and
unread-email snapshots. State, device, relay, and other non-integration routes
retain their existing response shapes.
