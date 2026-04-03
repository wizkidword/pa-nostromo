# Facebook Follower Count Pod (Mission Control) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new Mission Control pod that shows live Facebook Page follower count, auto-updated every 1 minute from Meta Graph API, with resilient backend polling, persisted history, stale-state UX, and operator-safe rollback.

**Architecture:** Implement a backend-owned polling pipeline in `server.js` that fetches `followers_count` from Meta Graph API every 60 seconds, stores normalized snapshots to disk (`data/facebook-followers.json`), and exposes read-only API endpoints for the frontend pod. Frontend (`app.js` + `index.html` + `styles.css`) adds a `facebook-followers` utility pod with stale/error status chips and manual refresh action wired to backend API. Add observability (JSONL logs), retries/backoff, cron watchdog scheduling details, and QA validation checklist.

**Tech Stack:** Node.js HTTP server, vanilla JS dashboard (`app.js`), static HTML/CSS pod UI, file-backed local storage under `data/`, local cron/system scheduler.

---

## Scope & Constraints

- Polling cadence must be **1 minute**.
- This plan is **spec/planning only** (no implementation in this task).
- Backend is source of truth for follower data; frontend never calls Meta Graph directly.
- Follow local-first defaults; remote access remains opt-in by existing server policy style.

---

## Meta Graph API Contract (Exact)

### Required env vars (new)

Add these to `.env.example` and runtime docs exactly as named:

- `META_GRAPH_API_VERSION=v22.0`
- `META_GRAPH_PAGE_ID=`
- `META_GRAPH_PAGE_ACCESS_TOKEN=`

### Optional env vars (new, with defaults)

- `META_GRAPH_POLL_INTERVAL_MS=60000`
- `META_GRAPH_TIMEOUT_MS=8000`
- `META_GRAPH_MAX_RETRIES=3`
- `META_GRAPH_BACKOFF_BASE_MS=1000`
- `META_GRAPH_BACKOFF_MAX_MS=15000`
- `META_GRAPH_STALE_AFTER_MS=180000` (3 min)
- `META_GRAPH_CRITICAL_STALE_AFTER_MS=900000` (15 min)
- `META_GRAPH_ALLOW_REMOTE=0`

### Upstream endpoint shape

- URL: `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${META_GRAPH_PAGE_ID}?fields=followers_count,fan_count,name&access_token=${META_GRAPH_PAGE_ACCESS_TOKEN}`
- Method: `GET`
- Expected success payload includes:
  - `followers_count` (primary value to display)
  - `fan_count` (fallback if followers_count unavailable)
  - `name` (page label)

### Permissions prerequisites (document in plan notes)

- Access token must have page access with capability to read engagement metrics for target page (commonly `pages_read_engagement`).
- Token management strategy: operator-provided long-lived page token; no token minting in app.

---

## Backend Polling Architecture (1-minute cadence)

### Runtime flow

1. On server boot, initialize Facebook follower service.
2. Load persisted cache from `data/facebook-followers.json` (if present).
3. Kick an immediate poll (`startup_bootstrap`).
4. Schedule recurring poll every `META_GRAPH_POLL_INTERVAL_MS` (default 60000 ms).
5. For each poll:
   - Fetch Meta Graph API with timeout.
   - Apply retry/backoff (see strategy below).
   - Normalize payload.
   - Persist latest snapshot + history ring buffer.
   - Update in-memory cache for fast API responses.
   - Emit structured log event.

### Retry/backoff strategy

- Retry max attempts: `META_GRAPH_MAX_RETRIES` (default 3, including first attempt).
- Backoff: exponential with cap
  - `delay = min(META_GRAPH_BACKOFF_BASE_MS * 2^(attempt-1), META_GRAPH_BACKOFF_MAX_MS)`
- Retry only transient classes:
  - HTTP 408/425/429/500/502/503/504
  - network timeout / fetch abort
- Respect `Retry-After` header on `429` if present (override computed delay when larger).

### Cron scheduling details (defense-in-depth)

Primary scheduler is in-process interval. Add optional watchdog cron to force refresh in case interval loop is stalled:

- Cron expression: `* * * * *`
- Command (example):
  - `curl -fsS -X POST http://127.0.0.1:4187/api/facebook-followers/refresh?source=cron >/dev/null 2>&1`
- Purpose: minute-level external nudge + operational recovery.
- Document as optional in README ops section.

---

## Storage Schema (Backend)

Create dedicated storage file: `data/facebook-followers.json`

```json
{
  "schemaVersion": 1,
  "page": {
    "id": "<META_GRAPH_PAGE_ID>",
    "name": "Example Page"
  },
  "latest": {
    "followersCount": 12345,
    "fanCount": 12001,
    "fetchedAt": "2026-03-24T21:00:00.000Z",
    "source": "meta_graph",
    "requestId": "fbf_01...",
    "latencyMs": 412,
    "stale": false
  },
  "status": {
    "ok": true,
    "lastSuccessAt": "2026-03-24T21:00:00.000Z",
    "lastAttemptAt": "2026-03-24T21:00:00.000Z",
    "consecutiveFailures": 0,
    "lastError": ""
  },
  "history": [
    {
      "followersCount": 12345,
      "fetchedAt": "2026-03-24T21:00:00.000Z"
    }
  ],
  "updatedAt": "2026-03-24T21:00:00.100Z"
}
```

### Retention rule

- Keep last `1440` points (24h at 1-min cadence) by default.
- Trim FIFO on write.

### Why separate file vs `data/state.json`

- Avoid high-frequency writes to shared dashboard state path.
- Reduce cross-pod contention and backup noise from per-minute updates.
- Keep API-specific telemetry isolated and easier to inspect/rollback.

---

## API Endpoints (Backend)

### 1) `GET /api/facebook-followers`

Returns latest cache and freshness status.

Response shape:

```json
{
  "ok": true,
  "page": { "id": "...", "name": "..." },
  "latest": { "followersCount": 12345, "fanCount": 12001, "fetchedAt": "..." },
  "status": {
    "stale": false,
    "staleLevel": "fresh",
    "ageMs": 18234,
    "lastSuccessAt": "...",
    "lastAttemptAt": "...",
    "consecutiveFailures": 0,
    "lastError": ""
  },
  "history": []
}
```

### 2) `POST /api/facebook-followers/refresh`

For manual or cron-triggered refresh.

- Optional query/body field: `source` (`manual`, `cron`, `qa`)
- Returns refreshed payload or structured failure.

### 3) (Optional diagnostics) `GET /api/facebook-followers/health`

- Lightweight status only (no history) for uptime checks.

---

## Stale-data Handling Rules

Compute age from `Date.now() - lastSuccessAt`:

- `fresh`: `ageMs < META_GRAPH_STALE_AFTER_MS`
- `stale`: `META_GRAPH_STALE_AFTER_MS <= ageMs < META_GRAPH_CRITICAL_STALE_AFTER_MS`
- `critical`: `ageMs >= META_GRAPH_CRITICAL_STALE_AFTER_MS`

UI behavior:

- **fresh**: normal count + “Updated Xm ago”.
- **stale**: show yellow stale badge + keep last known count.
- **critical**: show red stale badge + error meta + manual refresh CTA.
- If no successful fetch yet: display skeleton/placeholder and explicit setup error text.

---

## Logging & Observability

### Log file

- `logs/facebook-followers-poller.log` (JSON lines)

### Event schema

Each poll attempt logs one object:

```json
{
  "ts": "2026-03-24T21:00:00.100Z",
  "event": "facebook_followers_poll",
  "ok": true,
  "source": "interval",
  "requestId": "fbf_01...",
  "attempt": 1,
  "retries": 0,
  "httpStatus": 200,
  "latencyMs": 412,
  "followersCount": 12345,
  "ageMs": 0,
  "error": ""
}
```

### Logging rules

- Redact token values (never log raw URL with `access_token`).
- Include reason codes for failures (`meta_auth_failed`, `meta_rate_limited`, `meta_upstream_unavailable`, etc.).
- Keep logs append-only; rotate manually or with external logrotate.

---

## UI Pod Wiring Plan

### Pod ID and placement

- New pod id: `facebook-followers`
- Add default placement in utility rows near other live stats (row with NBA/Crypto/RSS), with visibility default `true`.

### Frontend state additions (`app.js`)

Add top-level state slice:

```js
facebookFollowers: {
  followersCount: null,
  fanCount: null,
  pageName: '',
  pageId: '',
  fetchedAt: '',
  staleLevel: 'fresh',
  ageMs: null,
  lastError: '',
  loading: false,
}
```

### Frontend functions (planned)

- `fetchFacebookFollowers({ manual = false } = {})`
  - calls `GET /api/facebook-followers`
  - handles stale/error badges
- `renderFacebookFollowersPod()`
  - renders count, page name, freshness badge, last updated label
- optional manual button in pod: calls `POST /api/facebook-followers/refresh`

### HTML/CSS wiring

- Add pod container mount target in `index.html` with id e.g. `facebookFollowersPod`.
- Add styles in `styles.css` for:
  - numeric count emphasis
  - freshness chips (`fresh`, `stale`, `critical`)
  - compact error meta row

---

## File-by-File Touch List

### Create

1. `docs/plans/2026-03-24-facebook-follower-pod-mission-control.md` (this plan)
2. `tests/facebook-followers-api.test.mjs` (endpoint + stale/response contract tests)
3. `scripts/qa-facebook-followers-smoke.mjs` (manual smoke helper)

### Modify

1. `.env.example`
   - add all `META_GRAPH_*` keys and comments.
2. `README.md`
   - add Facebook follower pod setup, env vars, cron watchdog snippet.
3. `server.js`
   - add env parsing, poller service, file persistence, routes, stale logic, logging.
4. `app.js`
   - add state slice, fetch/render hooks, utility layout defaults, backoff integration.
5. `index.html`
   - add pod markup/controls.
6. `styles.css`
   - add pod/freshness styling.
7. `docs/patch-notes/2026-03-24-facebook-follower-pod.md`
   - patch note for feature and ops settings.

---

## Step Sequence (Execution-ready)

### Task 1: Config + contract prep

1. Add `META_GRAPH_*` vars to `.env.example` with defaults and comments.
2. Document required token/page setup in `README.md`.
3. Commit: `docs(config): add Meta Graph follower pod env contract`

### Task 2: Backend data model and persistence

1. Add service constants and schema helpers in `server.js`.
2. Implement read/write helpers for `data/facebook-followers.json`.
3. Add history retention trimming.
4. Commit: `feat(server): add facebook follower cache schema + persistence`

### Task 3: Backend polling + retries + logging

1. Implement `pollFacebookFollowers()` with timeout and retry/backoff.
2. Implement stale computation helper.
3. Wire startup immediate poll + recurring 60s interval.
4. Append JSONL poll events to `logs/facebook-followers-poller.log`.
5. Commit: `feat(server): add facebook follower poller with retries and stale handling`

### Task 4: Backend API routes

1. Add `GET /api/facebook-followers`.
2. Add `POST /api/facebook-followers/refresh`.
3. Add optional health route if used.
4. Register routes in server router switch.
5. Commit: `feat(server): expose facebook follower API endpoints`

### Task 5: Frontend pod wiring

1. Add `facebook-followers` to default utility layout + visibility normalization.
2. Add state slice + fetch/render methods in `app.js`.
3. Add pod markup in `index.html` and styles in `styles.css`.
4. Add manual refresh action wiring.
5. Commit: `feat(ui): add facebook followers pod with stale/error UX`

### Task 6: QA automation + manual smoke

1. Add `tests/facebook-followers-api.test.mjs` for:
   - success response shape
   - stale state classification
   - refresh endpoint behavior
2. Add `scripts/qa-facebook-followers-smoke.mjs` with runnable checks.
3. Add npm script(s) if desired (`qa:facebook-followers`).
4. Commit: `test: add facebook followers API and smoke coverage`

### Task 7: Final docs + release safety

1. Add patch note doc.
2. Verify README setup flow end-to-end.
3. Validate rollback instructions (below) are tested in dry-run.
4. Commit: `docs: finalize facebook followers pod rollout + rollback guidance`

---

## QA Checklist

### Functional

- [ ] Pod appears in dashboard default utility layout.
- [ ] Count loads on first render from backend endpoint.
- [ ] Poll updates every 60 seconds (observe `fetchedAt` progression).
- [ ] Manual refresh button triggers immediate backend poll.
- [ ] Fallback to `fan_count` works when `followers_count` absent.

### Resilience

- [ ] Simulated 429 triggers retry/backoff and logs reason.
- [ ] Simulated timeout marks failure but keeps last known good value.
- [ ] Stale badge changes to yellow after stale threshold.
- [ ] Critical stale badge changes to red after critical threshold.

### Security / correctness

- [ ] Token never appears in logs/API responses.
- [ ] Endpoint obeys local-only default unless explicitly enabled.
- [ ] Invalid/missing env vars produce actionable error state.

### Regression

- [ ] Existing pods (weather/rss/crypto/nba) still auto-refresh.
- [ ] State save/restore endpoints still operate normally.
- [ ] `npm run check` passes.

---

## Rollback Plan

If rollout causes instability:

1. Disable pod render path in UI:
   - Remove/hide `facebook-followers` from default layout and mount flow.
2. Disable poller at runtime:
   - Set `META_GRAPH_PAGE_ACCESS_TOKEN=` empty (service enters disabled/no-op mode).
3. Revert backend routes:
   - rollback commit(s) touching `server.js` for follower endpoints.
4. Preserve existing data safely:
   - Keep `data/facebook-followers.json` for postmortem; do not auto-delete.
5. Verify rollback health:
   - `npm run check`
   - boot server and confirm dashboard loads without follower pod errors.

Rollback success criteria:

- Server starts cleanly.
- No poll loop errors in logs.
- Dashboard utility area renders without broken pod slots.

---

## Open Questions (resolve before implementation)

1. Should the pod show **followers_count** only, or also `fan_count` delta?
2. Is 24h history sufficient, or should retention be configurable in env?
3. Should cron watchdog be documented only, or shipped with optional script/template for systemd/cron install?
4. Do we want optional multi-page support later (`META_GRAPH_PAGE_ID` list)?

---

Plan complete and saved to `docs/plans/2026-03-24-facebook-follower-pod-mission-control.md`. Two execution options:

1. **Subagent-Driven (this session)** - dispatch fresh subagent per task, review between tasks, fast iteration.
2. **Parallel Session (separate)** - open new session with executing-plans, batch execution with checkpoints.

Which approach?