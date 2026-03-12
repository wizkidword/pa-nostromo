# PA Nostromo (Local Swiss-Army Dashboard)

PA Nostromo is a local-first productivity dashboard you run on your own machine.

It combines project tracking + utility pods in one lightweight web app:

![PA Nostromo dashboard preview](docs/screenshots/dashboard-preview.svg)

- Project directory + kanban board
- Notes and ideas capture
- Reminders + timer/alarm
- Weather + NBA scores + Crypto watchlist
- Music player (stream/YouTube/local file)
- Camera Feed pod (embed stream + snapshot refresh + local browser webcam mode)
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

## Sentinel Stabilization Pass (2026-03-11)

This pass focused on low-risk reliability hardening without changing user-facing workflows:

- `renderAll()` is now UI-only (no hidden persistence side effect).
- New explicit `commitState(reason)` helper handles write-path persistence.
- Shared-state push now has a startup hydration lock to avoid stale local overwrite races.
- Added static guardrails: `npm run lint` (`scripts/guardrails-check.js`) + CI workflow.
- Added reproducible smoke-check checklist under `docs/qa/smoke-stabilization-2026-03.md`.

## State Safety & Recovery

Mission Control now includes a built-in state safety pack to prevent accidental overwrite/data-loss events.

- **Automatic snapshots on every accepted write**: before `/api/state` stores a new state, the previous state is saved to `data/backups/state-<ISO>-<nonce>.json`.
- **Retention policy**: keeps the most recent 200 snapshots and prunes older files automatically.
- **Integrity metadata**: every saved state includes `__integrity.savedAt` + `__integrity.checksum` (SHA-256 of state payload) for corruption/malformed write detection.
- **Downgrade protection**: high-risk "state got much smaller" writes are blocked by default (`409 state_downgrade_blocked`).
- **Explicit override only for manual recovery/import**: override is honored only when `__writeControl.overrideDowngrade=true` with `source` set to `manual_restore` or `manual_import`.

### Recovery endpoints

- `GET /api/state/backups` → lists snapshots (newest first)
- `POST /api/state/restore` with `{ "backupFile": "state-...json" }` → restores a snapshot
  - Restore also creates a **pre-restore snapshot** of current state first.

### UI safety actions (Settings)

- **Export State JSON**: downloads current in-memory state with timestamped filename.
- **Import State JSON**: prompts for confirmation + warning, then performs guarded import.

### Best practices

1. Use Settings → **Export State JSON** before major manual edits.
2. If state looks wrong, list backups and restore the most recent known-good snapshot.
3. Keep writes local/trusted; do not expose this service publicly without auth/network controls.

## Project Structure

- `index.html` - UI shell
- `styles.css` - styles
- `app.js` - app logic
- `server.js` - local static server + `/api/state` + `/api/rowan-send` + `/api/camera-snapshot`
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

## Camera Feed pod (V1)

Camera Feed is a single-feed utility pod for network camera URLs and browser-local webcams.

### Supported modes

1. **Embed Stream mode** (default)
   - Loads URL directly into an iframe.
   - Works for embeddable web streams/pages (including some MJPEG/HLS players).
   - If source blocks iframe embedding (`X-Frame-Options`/CSP/auth), status will fail and you should use Snapshot mode.

2. **Snapshot Refresh mode**
   - Fetches image snapshots repeatedly at a configurable interval (1-60 seconds).
   - Useful for cameras exposing a still-image endpoint or when direct embedding is blocked.
   - Optional **Use local proxy** routes snapshots via `/api/camera-snapshot` for CORS/network compatibility.

3. **Local Webcam (Browser) mode**
   - Uses `navigator.mediaDevices.getUserMedia({ video: true, audio: false })` in-browser.
   - Renders a live `<video>` feed directly inside the pod.
   - Start/Stop cleanly opens/closes media tracks.
   - Optional webcam device picker (when supported) lets you select a camera and persists selection.

### Local webcam permissions / support notes

- Browser must support `mediaDevices.getUserMedia` (modern Chrome/Brave/Edge/Firefox).
- Camera access usually requires secure context (`https://`) or localhost.
- If permission is denied, pod status reports the denial and no stream is started.
- If camera hardware is missing/busy, status reports a clear error.

### Proxy safety model (`/api/camera-snapshot`)

- Local-only by default (`CAMERA_PROXY_ALLOW_REMOTE=0`)
- Not an open proxy:
  - only `http/https`
  - allows private/local hosts by default (e.g. `192.168.x.x`, `10.x.x.x`, `localhost`, `*.local`)
  - public hosts require explicit allowlist entries (`CAMERA_PROXY_ALLOWLIST`)
- Request timeout + max payload size limits are enforced (`CAMERA_PROXY_TIMEOUT_MS`, `CAMERA_PROXY_MAX_BYTES`)
- Upstream redirects are blocked to prevent allowlist bypass/open-proxy chaining

### Camera config env keys

- `CAMERA_PROXY_ALLOWLIST` (comma-separated public hosts)
- `CAMERA_PROXY_ALLOW_REMOTE` (`0` default)
- `CAMERA_PROXY_TIMEOUT_MS` (default `7000`)
- `CAMERA_PROXY_MAX_BYTES` (default `5242880`)

### Limitations (V1)

- One active camera feed at a time.
- No built-in authentication manager for camera credentials.
- Browser autoplay/embed restrictions still apply to some camera vendors.

## Production deployment notes

- Do **not** commit `.env` / `.env.local` (already gitignored).
- Provide relay settings through your process manager / host secret store.
- Keep `ROWAN_ALLOW_REMOTE=0` unless you have explicit network controls and an authenticated relay path.
- Use a real auth token (`ROWAN_RELAY_AUTH_BEARER`) whenever the relay endpoint is reachable beyond localhost.

## Current Status

Early alpha. Built for real daily use and rapid iteration.

## Patch Notes

- 2026-03-11: Sentinel stabilization pass: decoupled render pipeline from persistence via explicit `commitState(reason)`, added startup shared-sync hydration lock to prevent stale overwrite races, introduced guardrail static checks/CI, and documented smoke checks for startup sync race + stop-button isolation.
- 2026-03-11: Camera Feed pod local-webcam patch: added **Local Webcam (Browser)** mode using `getUserMedia`, in-pod `<video>` live rendering, clean media-track start/stop lifecycle, status/error handling for permission/support/hardware issues, and optional persisted webcam device selection.
- 2026-03-11: Camera Feed pod (V1): added single-feed camera utility with Embed Stream mode + Snapshot Refresh fallback (configurable interval), persisted camera settings/state, and optional local-only `/api/camera-snapshot` relay with host allowlist + payload/timeout guardrails.
- 2026-03-11: State Safety Pack hardening: automatic versioned pre-write backups (`data/backups` with retention prune), integrity metadata (`savedAt` + checksum), guarded overwrite override paths for manual import/restore, new backup list + restore APIs, and Settings UI export/import controls with confirmation.
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
