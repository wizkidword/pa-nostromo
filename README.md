# PA Nostromo (Local Swiss-Army Dashboard)

PA Nostromo is a local-first productivity dashboard you run on your own machine.

It combines project tracking + utility pods in one lightweight web app:

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
- `server.js` - local static server + `/api/state`
- `data/state.json` - shared persisted state
- `assets/social/*` - local social media logo SVGs

## Current Status

Early alpha. Built for real daily use and rapid iteration.

## Roadmap (short)

- Smart merge/version conflict handling for multi-tab saves
- Import/export backup controls
- Pod/plugin architecture docs
- Better onboarding + default templates

## License

MIT
