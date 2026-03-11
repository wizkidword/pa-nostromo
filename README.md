# PA Nostromo (Local Swiss-Army Dashboard)

PA Nostromo is a local-first productivity dashboard you run on your own machine.

It combines project tracking + utility pods in one lightweight web app:

![PA Nostromo dashboard preview](docs/screenshots/dashboard-preview.svg)

- Project directory + kanban board
- Notes and ideas capture
- Reminders + timer/alarm
- Weather + NBA scores + Crypto watchlist
- Music player (stream/YouTube/local file)
- Voice notes (Chrome SpeechRecognition)
- Cross-browser shared state (Brave + Chrome) via local disk-backed API

## Why local-first?

- Your data stays on your machine
- Fast startup, no cloud dependency required
- Easy to tweak and extend

## Quick Start

### Requirements
- Node.js 18+

### Run

```bash
cd project-mission-control-lite
node server.js
```

Open: `http://localhost:4187`

## Data Persistence

- Browser cache fallback: `localStorage`
- Shared local state: `data/state.json`
- API endpoint: `GET/POST /api/state`

This allows state sharing across browsers on the same machine.

## Project Structure

- `index.html` - UI shell
- `styles.css` - styles
- `app.js` - app logic
- `server.js` - local static server + `/api/state` + `/api/rowan-send`
- `data/state.json` - shared persisted state
- `assets/social/*` - local social media logo SVGs

## Voice-to-Rowan relay setup

Voice-to-Rowan **Send** now uses an explicit server relay endpoint first:

- `POST /api/rowan-send`
- body: `{ "text": "..." }`
- local-only by default (hardening against open relay behavior)

### Required env vars

- `ROWAN_RELAY_URL` (**required**) — HTTPS endpoint that receives relayed JSON payloads

### Optional env vars

- `ROWAN_SEND_MAX_TEXT_LENGTH` (default: `2000`) — max accepted message size
- `ROWAN_RELAY_TIMEOUT_MS` (default: `8000`) — relay request timeout
- `ROWAN_RELAY_AUTH_BEARER` — bearer token value for upstream relay auth
- `ROWAN_RELAY_AUTH_HEADER` (default: `Authorization`) — header name used for relay auth
- `ROWAN_RELAY_OPENCLAW_CHANNEL` — explicit OpenClaw channel hint in forwarded payload
- `ROWAN_RELAY_OPENCLAW_TARGET` — explicit OpenClaw target/session hint in forwarded payload
- `ROWAN_ALLOW_REMOTE` (default: unset/`0`) — set to `1` only if you intentionally want non-local clients to call `/api/rowan-send`

### Run example

```bash
PORT=4187 \
ROWAN_RELAY_URL="https://your-relay.example.com/ingest" \
ROWAN_RELAY_AUTH_BEARER="replace-me" \
ROWAN_RELAY_OPENCLAW_CHANNEL="webchat" \
ROWAN_RELAY_OPENCLAW_TARGET="agent:main:main" \
node server.js
```

### Behavior when relay is not configured

If `ROWAN_RELAY_URL` is missing, `/api/rowan-send` returns a clear error (`relay_not_configured`).
In the UI, the draft is preserved and the user gets fallback actions (copy draft / open chat), so no speech text is lost.

## Current Status

Early alpha. Built for real daily use and rapid iteration.

## Patch Notes

- 2026-03-11: Voice-to-Rowan relay bridge upgrade: added `POST /api/rowan-send` with validated input, explicit relay env config, local-only default hardening, and UI primary transport shift to server relay with preserved-draft fallback path.
- 2026-03-10: Crypto Tracker portfolio mode (manual holdings per watched coin: quantity + average buy) with per-coin position/cost/P&L and a compact total portfolio summary.

## Roadmap (short)

- Smart merge/version conflict handling for multi-tab saves
- Import/export backup controls
- Pod/plugin architecture docs
- Better onboarding + default templates

## License

MIT
