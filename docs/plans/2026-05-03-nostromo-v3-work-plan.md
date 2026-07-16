# Nostromo Version 3 Work Plan

Date: 2026-05-03
Review target: current `pa-nostromo` workspace

## Goal
Take PA Nostromo from a feature-rich local dashboard into a safer, cleaner, more modular Version 3 platform without breaking the workflows already in use.

## Review Snapshot
- `app.js`: 13,838 lines, still the main frontend runtime.
- `server.js`: 7,305 lines, native Node HTTP server with many local APIs.
- `styles.css`: 5,627 lines, mostly one large global stylesheet.
- Modular scaffolding exists under `app/core/` and `app/pods/`, but most pods still call legacy globals in `app.js`.
- Verification passed: `npm run check`, crypto tests, email tests, Facebook follower tests, extra email/body and follower delta tests, and `npm audit`.
- Live browser smoke passed at `http://localhost:4187/`, but console showed upstream/rate-limit noise from crypto/external embeds.

## Highest Priority Findings

### 1) Bind and Authenticate Local Data APIs
Risk: `server.listen(PORT)` binds on all interfaces by default, while `/api/state` allows GET/POST without the same local-only guard used by other endpoints. A LAN client could read or overwrite dashboard state if the port is reachable.

Target files:
- `server.js`
- `.env.example`
- `README.md`
- `tests/state-api-local-only.test.mjs`

Implementation steps:
- [ ] Add `HOST` env support with default `127.0.0.1`.
- [ ] Change server startup to `server.listen(PORT, HOST, ...)`.
- [ ] Add `STATE_API_ALLOW_REMOTE=0` and reject non-loopback `/api/state`, `/api/state/backups`, and `/api/state/restore` requests unless explicitly enabled.
- [ ] Add optional `NOSTROMO_API_TOKEN`; when remote is enabled, require `Authorization: Bearer <token>` for state-changing routes.
- [ ] Add tests for local GET, remote-denied behavior via mocked request socket, and token-required POST.
- [ ] Document the safe remote-access posture in README.

Suggested code shape:

```js
const HOST = String(process.env.HOST || '127.0.0.1').trim() || '127.0.0.1';
const STATE_API_ALLOW_REMOTE = parseBool(process.env.STATE_API_ALLOW_REMOTE);
const NOSTROMO_API_TOKEN = String(process.env.NOSTROMO_API_TOKEN || '').trim();

function requireLocalOrToken(req, res, { allowRemote = false, mutating = false } = {}) {
  if (isLocalRequest(req)) return true;
  if (!allowRemote) {
    sendJson(res, 403, { ok: false, error: 'local_only' });
    return false;
  }
  if (mutating && NOSTROMO_API_TOKEN) {
    const expected = `Bearer ${NOSTROMO_API_TOKEN}`;
    if (req.headers.authorization !== expected) {
      sendJson(res, 401, { ok: false, error: 'auth_required' });
      return false;
    }
  }
  return true;
}
```

### 2) Fix Static Path Traversal Guard
Risk: `safePathFromUrl()` checks `candidate.startsWith(ROOT)`. On Windows, a sibling path like `pa-nostromo-secret` still starts with the `pa-nostromo` string prefix, so traversal can escape the root if such a sibling exists.

Target files:
- `server.js`
- `tests/static-path-safety.test.mjs`

Implementation steps:
- [ ] Replace prefix check with `path.relative(ROOT, candidate)`.
- [ ] Reject absolute relatives, `..` relatives, and empty/invalid decoded paths.
- [ ] Add tests for `/index.html`, `/../pa-nostromo-secret/x`, encoded slash/backslash variants, and normal assets.

Suggested code shape:

```js
function isInsideRoot(candidate) {
  const rel = path.relative(ROOT, candidate);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}
```

### 3) Cap Request Body Size
Risk: `readBody()` buffers the whole request before parsing. Any POST route can consume memory with a large body, including `/api/state`, `/api/rowan-send`, email actions, and device actions.

Target files:
- `server.js`
- `tests/request-body-limit.test.mjs`

Implementation steps:
- [ ] Add `readBody(req, { maxBytes })`.
- [ ] Use small limits for action routes and a larger explicit limit for `/api/state`.
- [ ] Return `413 payload_too_large` once the limit is crossed.
- [ ] Add tests for accepted normal payload and rejected oversized payload.

Suggested defaults:
- State JSON: 2 MB
- Email/device/relay actions: 64 KB
- Rowan text route still keeps `ROWAN_SEND_MAX_TEXT_LENGTH`

### 4) Stop Duplicate Fetches During Render/Lifecycle
Risk: `renderAll()` directly calls async pod renderers such as eBay and unread email, then `syncUtilityPodLifecycle()` mounts visible pods and can invoke the same renderers again. The `*InFlight` flags disable buttons but do not prevent concurrent fetches.

Target files:
- `app.js`
- `app/pods/*.pod.js`
- `tests/pod-render-dedupe.test.mjs`

Implementation steps:
- [ ] Make lifecycle registry the only owner of refresh-capable pod rendering.
- [ ] Convert direct render calls in `renderAll()` to shell-only rendering or registry calls, not both.
- [ ] Add in-flight guards to async pod renderers:

```js
if (unreadEmailInFlight && !options.manual) return;
```

- [ ] Add a QA/browser test that one `renderAll()` results in one unread email request and one eBay request.
- [ ] Add debug counters for `fetch_started`, `fetch_skipped_in_flight`, and `render_from_cache`.

### 5) Make Tests Hermetic
Risk: `tests/facebook-followers-api.test.mjs` writes to `data/facebook-followers.json` in the live workspace. During this review it overwrote the runtime follower history; it was restored from `data/state.json` plus `logs/facebook-followers-poller.log`.

Target files:
- `server.js`
- `tests/facebook-followers-api.test.mjs`
- `tests/helpers/temp-runtime.mjs`

Implementation steps:
- [ ] Add `DATA_DIR` env override, defaulting to the current `data/`.
- [ ] Make every server-backed test run with a temp data directory under `os.tmpdir()`.
- [ ] Pass test-specific log paths or temp `LOG_DIR`.
- [ ] Add cleanup in `finally`.
- [ ] Add a guardrail test that fails if server tests write under the repo `data/` directory.

Suggested test pattern:

```js
const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'nostromo-test-'));
const child = spawn('node', ['server.js'], {
  env: { ...process.env, PORT: String(port), DATA_DIR: tempRoot },
});
```

### 6) Add Windows-Native System Integrations
Risk: the app is used on Windows, but system/device helpers use Linux commands: `/proc/net/dev`, `df`, `ps`, and `ping -c -W`. On Windows, those pods silently degrade or fail.

Target files:
- `server.js`
- `tests/system-windows-adapters.test.mjs`

Implementation steps:
- [ ] Add platform adapter functions keyed by `process.platform`.
- [ ] Use PowerShell/CIM or Node APIs for Windows disk/process/network data.
- [ ] Use `ping -n 1 -w 1000 <host>` on Windows and `ping -c 1 -W 1 <host>` on Linux/macOS.
- [ ] Show explicit "adapter unavailable" states instead of silent nulls.

### 7) Move Boot-Time Patch Seeding Into Versioned Migrations
Risk: app startup still contains a long patch-note seeding block and writes local state on boot. This has improved from earlier render-side persistence, but it is still runtime boot mutation rather than a clear migration system.

Target files:
- `app.js`
- `app/core/migrations.js`
- `tests/migrations.test.mjs`

Implementation steps:
- [ ] Create a versioned migration list with ids, descriptions, and idempotent `apply(state)` functions.
- [ ] Store applied migration ids under `state.__migrations.applied`.
- [ ] Move changelog seed strings into migration records.
- [ ] Run migrations inside `load()` and save only if at least one migration applied.
- [ ] Add tests for idempotency and no-write startup when no migration applies.

### 8) Turn the Frontend Into a V3 Platform
Risk: the app has pod scaffolding, but most real behavior still lives in `app.js`, global variables, and global DOM selectors.

Target files:
- `app/core/state-store.js`
- `app/core/pod-runtime.js`
- `app/services/*.js`
- `app/pods/*.pod.js`
- `app.js`

Implementation steps:
- [ ] Extract a `state-store` with `loadState`, `commitState`, migrations, backup/import helpers, and shared-sync hooks.
- [ ] Extract `services/` modules for eBay, unread email, crypto, social metrics, RSS, weather/NBA.
- [ ] Make each pod own a single file with `render`, `mount`, `refresh`, `destroy`, and scoped event delegation.
- [ ] Ban direct `state.* =` writes outside state-store/mutations.
- [ ] Replace per-render event rebinding with delegated listeners per pod root.
- [ ] Keep old DOM ids stable until tests prove parity.

Migration order:
- [ ] State store and migrations.
- [ ] API client wrapper with timeout/backoff.
- [ ] Unread Email pod.
- [ ] eBay Traffic pod.
- [ ] Social Followers pod.
- [ ] System/Home Device pods.
- [ ] Notes/Board/Shortcuts.
- [ ] Music/Camera/Live Streams/Voice Desk.

### 9) Improve Observability and Operations
Target files:
- `server.js`
- `app.js`
- `docs/ops/`

Implementation steps:
- [ ] Add structured server logs with rotation for social pollers and app events.
- [ ] Add `/api/health` summary for state, pollers, data dir, and upstream backoff.
- [ ] Add a Settings "Diagnostics" panel fed by health API.
- [ ] Rotate or compact JSONL poll logs; current follower logs can grow into tens of MB.
- [ ] Add one-click export bundle: state, selected logs, env redaction summary, and versions.

### 10) V3 UI/UX Polish
Target files:
- `styles.css`
- `index.html`
- extracted pod files

Implementation steps:
- [ ] Introduce design tokens for status colors and pod density.
- [ ] Replace hard-coded colors in feature sections with semantic variables.
- [ ] Add mobile and compact desktop review passes for each pod.
- [ ] Replace emoji button labels with icon assets or lucide-style icons where practical.
- [ ] Keep the first screen operational; no landing page.
- [ ] Add visual smoke screenshots for desktop and mobile.

## V3 Delivery Phases

### Phase 3A: Safety Floor
- Bind to localhost by default.
- Guard state and diary APIs.
- Fix static traversal.
- Cap request bodies.
- Make tests hermetic.

Validation:
- `npm run check`
- `node tests/static-path-safety.test.mjs`
- `node tests/request-body-limit.test.mjs`
- `node tests/state-api-local-only.test.mjs`
- Existing package tests

### Phase 3B: Runtime Discipline
- Remove duplicate lifecycle/render fetches.
- Add in-flight guards and fetch counters.
- Add health endpoint.
- Add log rotation for pollers.

Validation:
- Browser smoke with request counting.
- Console error budget report.
- Existing tests plus new pod dedupe test.

### Phase 3C: Windows-First Reliability
- Windows adapters for system monitor and home devices.
- Clear unavailable states for missing tools.
- Windows QA checklist.

Validation:
- Local Windows run on port 4187.
- Home device ping with private IP.
- System monitor returns CPU/memory/disk/process data where available.

### Phase 3D: Modular Platform
- State-store and migrations.
- Service modules.
- Move high-churn pods out of `app.js`.
- Tighten guardrails so large regressions cannot creep back in.

Validation:
- `npm run check`
- pod snapshot/contract tests
- live dashboard smoke
- no direct state writes outside approved mutation layer

### Phase 3E: Experience Upgrade
- Diagnostics panel.
- Visual polish pass.
- Mobile/compact viewport pass.
- Operator docs and recovery runbook.

Validation:
- Desktop and mobile screenshots.
- No page errors on boot besides known third-party embed refusals.
- README matches actual Windows startup path.

## Success Criteria
- Dashboard starts with `npm start` and serves on `127.0.0.1:4187`.
- No unauthenticated remote state/diary access by default.
- Static server cannot read outside repo root.
- Tests never mutate live `data/`.
- A single render cycle does not duplicate expensive upstream fetches.
- Windows system/device pods either work natively or show explicit unavailable states.
- `app.js` drops below 8,000 lines in the first V3 pass and continues shrinking as pods move.
- V3 has a health/diagnostics surface so failures are visible instead of buried in console noise.
