# 2026-03-24 — Facebook Follower Pod (Mission Control)

## Added

- New utility pod: `facebook-followers` in Mission Control utility row.
- Backend poller in `server.js` that fetches Meta Graph page follower metrics every 60 seconds.
- Persisted follower cache/history file at `data/facebook-followers.json`.
- Poll event JSONL logging at `logs/facebook-followers-poller.log`.
- New API endpoints:
  - `GET /api/facebook-followers`
  - `POST /api/facebook-followers/refresh`
  - `GET /api/facebook-followers/health`

## Reliability & stale handling

- Retry/backoff for transient upstream failures.
- `followers_count` primary with `fan_count` fallback.
- Stale levels surfaced to UI (`fresh`, `stale`, `critical`) with preserved last-known-good value.
- Local-only API default with opt-in remote via env.

## Configuration

See `.env.example` and README for `META_GRAPH_*` keys and setup.

## QA

- Added `tests/facebook-followers-api.test.mjs`
- Added smoke helper `scripts/qa-facebook-followers-smoke.mjs`
- Added npm scripts:
  - `npm run test:facebook-followers`
  - `npm run qa:facebook-followers`
