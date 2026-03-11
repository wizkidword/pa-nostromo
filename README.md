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

## Quick Start (Local Turnkey)

### Requirements
- Node.js 18+

### 1) Install deps

```bash
cd project-mission-control-lite
npm install
```

### 2) Create local config once

```bash
cp .env.example .env
```

Update `.env` with your relay endpoint (and token only if your relay requires auth).

### 3) Start

```bash
npm start
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

Voice-to-Rowan **Send** uses server endpoint `POST /api/rowan-send` (body: `{ "text": "..." }`).

`server.js` now loads local config files automatically in this order:
1. shell environment variables
2. `.env.local`
3. `.env`

That means one-time local setup is enough; no repeated inline env exports are needed.

### Config keys

- `ROWAN_RELAY_URL` (**required**) — relay endpoint that receives relayed JSON payloads
- `ROWAN_SEND_MAX_TEXT_LENGTH` (default: `2000`) — max accepted message size
- `ROWAN_RELAY_TIMEOUT_MS` (default: `8000`) — relay request timeout
- `ROWAN_RELAY_AUTH_BEARER` — bearer token value for upstream relay auth
- `ROWAN_RELAY_AUTH_HEADER` (default: `Authorization`) — header name used for relay auth
- `ROWAN_RELAY_OPENCLAW_CHANNEL` (default local: `webchat`) — forwarded OpenClaw channel hint
- `ROWAN_RELAY_OPENCLAW_TARGET` (default local: `agent:main:main`) — forwarded OpenClaw target hint
- `ROWAN_ALLOW_REMOTE` (default: `0`) — keep `0` for local-only access; set `1` only on intentionally exposed trusted deployments

### Behavior when relay is not configured

If `ROWAN_RELAY_URL` is missing, `/api/rowan-send` returns a clear error (`relay_not_configured`).
In the UI, the draft is preserved and the user gets fallback actions (copy draft / open chat), so no speech text is lost.

## Production deployment notes

- Do **not** commit `.env` / `.env.local` (already gitignored).
- Provide relay settings through your process manager / host secret store.
- Keep `ROWAN_ALLOW_REMOTE=0` unless you have explicit network controls and an authenticated relay path.
- Use a real auth token (`ROWAN_RELAY_AUTH_BEARER`) whenever the relay endpoint is reachable beyond localhost.

## Current Status

Early alpha. Built for real daily use and rapid iteration.

## Patch Notes

- 2026-03-11: Turnkey local relay config update: `server.js` now auto-loads `.env` / `.env.local` (without overriding shell env), added `.env.example`, documented one-command startup via `npm start`, and kept `/api/rowan-send` local-only hardening defaults intact.
- 2026-03-11: Voice-to-Rowan relay bridge upgrade: added `POST /api/rowan-send` with validated input, explicit relay env config, local-only default hardening, and UI primary transport shift to server relay with preserved-draft fallback path.
- 2026-03-10: Crypto Tracker portfolio mode (manual holdings per watched coin: quantity + average buy) with per-coin position/cost/P&L and a compact total portfolio summary.

## Roadmap (short)

- Smart merge/version conflict handling for multi-tab saves
- Import/export backup controls
- Pod/plugin architecture docs
- Better onboarding + default templates

## License

MIT
