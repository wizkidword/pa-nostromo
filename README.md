# 🚀 PA Nostromo

<p align="center">
  <b>Local-first mission control for your day-to-day work.</b><br/>
  One lightweight dashboard for projects, notes, streams, reminders, voice capture, and personal utilities.
</p>

<p align="center">
  <img alt="Node 18+" src="https://img.shields.io/badge/Node-18%2B-339933?logo=node.js&logoColor=white">
  <img alt="Local-first" src="https://img.shields.io/badge/Architecture-Local--First-4F46E5">
  <img alt="License MIT" src="https://img.shields.io/badge/License-MIT-111827">
</p>

![PA Nostromo dashboard preview](docs/screenshots/dashboard-preview.svg)

---

## Key Features

- **Project hub**: directory + kanban board + notes/ideas in one place
- **Personal utility pods**: reminders, timer/alarm, weather, NBA scores, crypto watchlist, RSS feed
- **Media + live inputs**: music player, camera feed pod, live stream launcher
- **Voice-to-relay workflow**: send dictated text through a local backend relay endpoint
- **Cross-browser local state sharing**: Brave/Chrome can sync through disk-backed API storage
- **State safety guardrails**: automatic backups, restore endpoints, and downgrade-protection on risky writes

## Quick Start

### Requirements

- Node.js **18+**

### 1) Install

```bash
cd project-mission-control-lite
npm install
```

### 2) Configure local env

```bash
cp .env.example .env
```

Edit `.env` with any values you need (especially relay settings if using voice relay).

### 3) Run

```bash
npm start
```

Open: `http://localhost:4187`

## Configuration (Public-Safe)

`server.js` loads config in this order:

1. shell environment variables
2. `.env.local`
3. `.env`

### Core relay settings

- `ROWAN_RELAY_URL` — required for `POST /api/rowan-send`
- `ROWAN_RELAY_AUTH_BEARER` — optional bearer token for upstream relay
- `ROWAN_RELAY_AUTH_HEADER` — auth header name (default `Authorization`)
- `ROWAN_RELAY_TIMEOUT_MS` — relay timeout (default `8000`)
- `ROWAN_SEND_MAX_TEXT_LENGTH` — max accepted message length (default `2000`)
- `ROWAN_ALLOW_REMOTE` — keep `0` for local-only deployments

### Camera snapshot proxy safety

- `CAMERA_PROXY_ALLOW_REMOTE` (default `0`)
- `CAMERA_PROXY_ALLOWLIST` (comma-separated public hosts)
- `CAMERA_PROXY_TIMEOUT_MS`
- `CAMERA_PROXY_MAX_BYTES`

### RSS fetch safety

- `RSS_FETCH_ALLOW_REMOTE` (default `0`)
- `RSS_FETCH_TIMEOUT_MS`
- `RSS_FETCH_MAX_BYTES`
- `RSS_FETCH_MAX_FEEDS`

> Keep this app local unless you intentionally add network controls and authentication.

## Core Workflows

### 1) Dashboard state sync

- UI stores state in-memory + local fallback
- Shared persistence is exposed through:
  - `GET /api/state`
  - `POST /api/state`
- Disk-backed state lives at `data/state.json`

### 2) Backup + recovery flow

- Every accepted state write snapshots the previous state into `data/backups/`
- List backups: `GET /api/state/backups`
- Restore backup: `POST /api/state/restore`

### 3) RSS feed workflow

- Configure feeds in **Settings → RSS Feeds**
- Fetch pipeline via `POST /api/rss/fetch`
- Read-state and sources are persisted in shared dashboard state

### 4) Camera + stream workflows

- **Camera Feed pod** supports embed, snapshot refresh, and local webcam mode
- **Live Streams pod** supports provider presets (YouTube, Twitch, Kick, Vaughn, Rumble, X, Facebook, generic/local URL)

## Data & Storage Notes

- Main shared state file: `data/state.json`
- Automatic state backups: `data/backups/`
- Browser fallback cache: `localStorage`
- This repository is designed for **local-first usage** and personal trusted environments

## Development Scripts

Verified from `package.json`:

- `npm start` — run local server
- `npm run lint` — guardrails/static checks (`scripts/guardrails-check.js`)
- `npm run check` — syntax checks + lint
- `npm run qa:reset-state` — reset local state for QA flow
- `npm run qa:smoke:1d1`
- `npm run qa:smoke:1e1`
- `npm run qa:smoke:1e1:repeat`
- `npm run qa:smoke:1f`
- `npm run test:crypto`
- `npm run test:crypto-proxy`

## Roadmap / Status

**Status:** early alpha, actively iterated.

Near-term focus:

- Better onboarding/default templates
- Stronger multi-tab state conflict handling
- Continued pod reliability and quality-of-life improvements

Patch details are tracked in `docs/patch-notes/`.

## Contributors

- Jacob Rockwell
- Rowan

## License

MIT
