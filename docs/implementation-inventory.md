# PA Nostromo implementation inventory

Baseline recorded for Phase 0 on 2026-07-16 and updated through Phase 5. This is the current map of the application surface after centralized route authorization, outbound-network controls, durable shared-state handling, and browser-rendering hardening.

## Runtime layout

- Server entry point: `server.js` (native Node `http` server).
- Browser document root: `public/` (`index.html`, `app.js`, `styles.css`, `app/`, and `assets/` only).
- Private runtime storage: platform app-data root by default; `DATA_DIR` and `LOG_DIR` remain explicit operator overrides. `lib/runtime-storage.js` copies the legacy repository `data/` and `logs/` defaults only after verification, preserves the originals, and never merges into an existing destination.
- State: `STATE_PATH` (`state.json`) and `BACKUPS_DIR` in `server.js`; integrity metadata currently carries `savedAt`, revision, schema version, source, reason, and checksum.
- Server-side configuration: `.env.local`, then `.env`, without overriding shell variables.

## HTTP routes

All routes are dispatched through `ROUTE_MANIFEST` before reaching their handler. Host validation, scoped remote authorization, same-origin CSRF for browser mutations, and shared security headers are applied centrally.

| Route | Methods | Body limit | Current gate and side effects | External systems |
| --- | --- | --- | --- | --- |
| Static `/*` | GET, HEAD | none | Public files under `public/` only; 405 otherwise; ETag/Last-Modified support | none |
| `/api/state` | GET, POST | state: 2 MiB | Loopback or configured remote token; reads/writes state and backup | private filesystem |
| `/api/state/backups` | GET | none | same state gate; lists backup metadata | private filesystem |
| `/api/state/restore` | POST | action: 64 KiB | same state gate; snapshots current state then restores selected backup | private filesystem |
| `/api/rowan-send` | POST | action: 64 KiB | local by default; sends relay text | configured Rowan relay |
| `/api/camera-snapshot` | GET | none | local by default; explicit public hostname allowlist, no redirects, image-only bounded response | camera HTTP endpoint |
| `/api/rss/fetch` | POST | RSS: 256 KiB | local by default; bounded feeds/entries/bytes, cached and stale-aware | arbitrary public feed URLs via `safeFetch` |
| `/api/gas-prices` | GET | none | local by default | configured gas providers/RapidAPI |
| `/api/crypto/*` | GET | none | local by default; fixed upstream hostname per route | CoinGecko-compatible upstreams via `safeFetch` |
| `/api/system-resources` | GET | none | local by default; reads host/process information | OS APIs and PowerShell/`df`/`ps` |
| `/api/speed-test` | GET | none | local by default; explicitly launches diagnostic work | speed-test command/network |
| `/api/home-devices/ping` | POST | action: 64 KiB | local by default; private/local hostname required | `ping` subprocess |
| `/api/home-devices/wake` | POST | action: 64 KiB | local by default; validates MAC and optional local host | `wakeonlan`/`etherwake` subprocess |
| `/api/email-unread` | GET | none | local by default; reads mailbox snapshot | Gmail Atom or IMAP |
| `/api/email-unread/message` | POST | action: 64 KiB | local by default; returns bounded message body | IMAP |
| `/api/email-unread/read`, `/read-batch` | POST | action: 64 KiB | local by default; marks one or many messages read | IMAP |
| `/api/email-unread/delete`, `/delete-batch` | POST | action: 64 KiB | local by default; moves messages to trash | IMAP |
| `/api/email-unread/spam`, `/spam-batch` | POST | action: 64 KiB | local by default; moves messages to spam | IMAP |
| `/api/ebay-traffic` | GET | none | local by default; reads cached or fresh commerce payload | eBay OAuth/Analytics/Trading/Marketing APIs |
| `/api/ebay-traffic/refresh` | POST | action: 64 KiB | local by default; refreshes cache | eBay APIs |
| `/{facebook,facebook-group,instagram,tiktok,youtube}-followers` | GET | none | local by default; returns persisted social state | provider APIs/public pages/session scripts |
| corresponding `/refresh` routes | POST | action: 64 KiB | local by default; refreshes social metric | provider APIs/public pages/session scripts |
| corresponding `/health` routes | GET | none | local by default; returns poller status | none |
| `/api/facebook-content`, `/api/instagram-content` | GET | none | local by default; returns cached content | Meta Graph or session scraper |
| corresponding `/refresh` and `/health` routes | POST / GET | action: 64 KiB for POST | local by default; refreshes/reports cache | Meta Graph or session scraper |

## Outbound I/O and subprocesses

| Area | Entry points | Boundary and current limits |
| --- | --- | --- |
| eBay | `fetchEbay*`, `getEbayTrafficPayload` | eBay hostname allowlist, `safeFetch`, coordinator, private OAuth configuration, and cache in `DATA_DIR`. Read-only Sell Analytics traffic reports also use bounded retries; OAuth, Marketing, and Trading operations do not. |
| Email | `fetchUnreadEmail*`, `lib/email-imap.js` | Gmail Atom uses `safeFetch` and the coordinator; IMAP has bounded TLS responses/bodies, capability-aware UID moves, mailbox allow-list mapping, and environment-only credentials. |
| Social | `fetchMetaGraphJson`, public-page fetches, `fetch*Via*Session` | HTTP calls use `safeFetch` and the coordinator; Playwright child scripts retain script-specific timeouts and session-storage containment. |
| RSS | `fetchFeedXml` | User-provided feed URLs use DNS-pinned `safeFetch`, configured byte/feed/entry/time limits, coordinator deduplication, and stale cache fallback. |
| Camera | `handleApiCameraSnapshot` | Explicit public hostname allowlist, DNS-pinned `safeFetch`, zero redirects, image content-type and byte limits. |
| Crypto and gas | `handleApiCryptoProxy`, `handleApiGasPrices` | Fixed target catalog/configured providers via `safeFetch`; no arbitrary URL reaches `curl`. |
| Relay | `relayRowanMessage` | Explicitly configured trusted relay URL with optional bearer/header; the only direct HTTP exception because a loopback relay is supported. |
| System and devices | `readDiskUsagePercent`, `readTopProcesses`, `runExecFile`, speed-test helpers | PowerShell, `df`, `ps`, `ping`, `wakeonlan`, `etherwake`, and speed-test commands with timeouts/buffers. |

## Filesystem reads and writes

- `STATE_PATH`: state reads, integrity checks, atomic-style temporary writes for social histories, and state backups. State writes are not yet revision-conditional; that is Phase 4.
- `BACKUPS_DIR`: `listBackupFiles`, `writeBackupSnapshot`, and retention pruning.
- Social history/cache files: Facebook, Facebook group, Instagram, TikTok, YouTube, and eBay cache under `DATA_DIR`; redacted, size-rotated server diagnostics and social-poller JSONL logs under `LOG_DIR`.
- Integration responses: manifest-backed RSS, gas, crypto, eBay, social, and unread-email snapshot routes retain legacy fields and add the common `integration` envelope documented in `docs/integration-envelopes.md`.
- Parser drift fixtures: sanitized RSS/Atom and AAA gas samples in `tests/fixtures/parsers/` assert required fields, explicit malformed-structure failures, and the parser versions emitted in integration envelopes. See `docs/parser-fixtures.md`.
- Browser session storage: Meta/Facebook/Instagram storage defaults to `DATA_DIR/.auth`.
- `.env` and `.env.local`: read only during server startup.
- Diary filesystem indexing was removed in Phase 7. A default installation does not read sibling repositories.
- Static requests: `resolveStaticFile` resolves only a regular file under the real `PUBLIC_ROOT`; it rejects dotfiles, traversal encodings, directories, and symlink escapes.

## Timers and recurring work

- Server social pollers: Facebook, Facebook group, Instagram, TikTok, and YouTube each have startup bootstrap plus `setInterval` in their `init*Service` functions.
- Request deadlines: eBay, email, Meta/Instagram, relay, RSS, camera, crypto, and gas use timeout/abort logic.
- Frontend: `public/app.js` owns several UI and integration intervals/timeouts; individual pod files under `public/app/pods/` also own lifecycle behavior. Phase 9 replaces this scattered scheduling with one visibility-aware scheduler.

## Browser rendering and navigation sinks

- `public/app.js` is the primary renderer and contains classified `innerHTML` template sinks, dynamic media `src`, dynamic links, `URL.createObjectURL`, and iframe/media handling. Dynamic text/attributes use `public/app/core/safe-ui.js`; links, frames, media, and pop-outs use its centralized URL policy.
- `public/index.html` statically loads the core/pod scripts and static social icons.
- Dynamic browser fetches include state, eBay, RSS, social metrics, system, devices, relay, weather, crypto, and gas.
- CSP is strict (`default-src 'self'`, no `unsafe-inline`/`unsafe-eval`) with narrowly declared weather/sports, YouTube API, image/media, and frame-provider exceptions. See `docs/rendering-sink-audit.md` for the sink classification and the exact policy.

## Persisted dashboard state

`public/app.js` loads browser state and can synchronize it with `/api/state`. The primary persisted areas include projects, tasks, notes, ideas, reminders, shortcuts, calendar/layout/settings, changelog, media/stream preferences, pod configuration, and migration/integrity metadata. The server validates and migrates known state, writes `__integrity`, performs revision compare-and-swap, makes durable atomic writes, and preserves bounded backups; client-side compatibility state remains normalized in the frontend persistence helpers.

## Integrations and credential classes

| Integration | Credential/configuration class | Cache/refresh behavior |
| --- | --- | --- |
| Rowan relay | relay URL and optional bearer/header | direct mutation on user action |
| Gmail/Google Workspace | account username plus app password | manual/read/move operations and unread snapshot |
| eBay | client ID, client secret, refresh token | cached traffic report and on-demand refresh |
| Meta/Facebook/Instagram | Graph token, browser storage, profile/page identifiers | polling plus manual refresh; session scraping is optional |
| TikTok/YouTube | public profile/channel URL | polling plus manual refresh |
| RSS, crypto, gas, weather, sports | public/configured upstream endpoints and optional RapidAPI key | request/manual refresh caches where implemented |
| Camera and home devices | private URL/host/MAC configuration | explicit user action or display refresh |

No credential, cookie, email body, session export, or private runtime file belongs in `public/`, tests, fixtures, logs, or source control.

## Phase 0 test/CI contract

- `npm test`: syntax checks for all maintained JavaScript, guardrails, then every fast `*.test.mjs` file except browser smoke.
- `npm run test:e2e`: isolated Playwright smoke that starts a server with temporary data/log directories, loads the dashboard, records uncaught page errors, and exercises state create/update/remove.
- GitHub Actions runs clean installation, `npm test`, installs Chromium, and runs the browser smoke on pushes and pull requests.
