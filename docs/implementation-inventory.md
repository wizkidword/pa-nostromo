# PA Nostromo implementation inventory

Baseline recorded for Phase 0 on 2026-07-16. This is a working map of the application surface before Phase 2 centralizes authorization and Phase 3 centralizes outbound networking.

## Runtime layout

- Server entry point: `server.js` (native Node `http` server).
- Browser document root: `public/` (`index.html`, `app.js`, `styles.css`, `app/`, and `assets/` only).
- Private runtime storage: platform app-data root by default; `DATA_DIR` and `LOG_DIR` remain explicit operator overrides. `lib/runtime-storage.js` copies the legacy repository `data/` and `logs/` defaults only after verification, preserves the originals, and never merges into an existing destination.
- State: `STATE_PATH` (`state.json`) and `BACKUPS_DIR` in `server.js`; integrity metadata currently carries `savedAt`, revision, schema version, source, reason, and checksum.
- Server-side configuration: `.env.local`, then `.env`, without overriding shell variables.

## HTTP routes

All routes are dispatched from the `http.createServer` block in `server.js`. Current local/remote rules remain route-specific until Phase 2; the table records current behavior rather than treating it as the target security model.

| Route | Methods | Body limit | Current gate and side effects | External systems |
| --- | --- | --- | --- | --- |
| Static `/*` | GET, HEAD | none | Public files under `public/` only; 405 otherwise; ETag/Last-Modified support | none |
| `/api/state` | GET, POST | state: 2 MiB | Loopback or configured remote token; reads/writes state and backup | private filesystem |
| `/api/state/backups` | GET | none | same state gate; lists backup metadata | private filesystem |
| `/api/state/restore` | POST | action: 64 KiB | same state gate; snapshots current state then restores selected backup | private filesystem |
| `/api/rowan-send` | POST | action: 64 KiB | local by default; sends relay text | configured Rowan relay |
| `/api/camera-snapshot` | GET | none | local by default; fetches one allowlisted/private camera URL | camera HTTP endpoint |
| `/api/rss/fetch` | POST | RSS: 256 KiB | local by default; fetches up to configured feeds | arbitrary feed URLs (Phase 3 target) |
| `/api/gas-prices` | GET | none | local by default | configured gas providers/RapidAPI |
| `/api/crypto/*` | GET | none | local by default | CoinGecko-compatible upstreams/curl fallback |
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
| `/api/diary-index` | GET | none | currently reads sibling-repository diary reports; Phase 7 removes or contains it | filesystem outside the repository |
| `/api/diary-index/refresh` | POST | action: 64 KiB | rebuilds the diary index | filesystem outside the repository |
| `/{facebook,facebook-group,instagram,tiktok,youtube}-followers` | GET | none | local by default; returns persisted social state | provider APIs/public pages/session scripts |
| corresponding `/refresh` routes | POST | action: 64 KiB | local by default; refreshes social metric | provider APIs/public pages/session scripts |
| corresponding `/health` routes | GET | none | local by default; returns poller status | none |
| `/api/facebook-content`, `/api/instagram-content` | GET | none | local by default; returns cached content | Meta Graph or session scraper |
| corresponding `/refresh` and `/health` routes | POST / GET | action: 64 KiB for POST | local by default; refreshes/reports cache | Meta Graph or session scraper |

## Outbound I/O and subprocesses

| Area | Entry points | Boundary and current limits |
| --- | --- | --- |
| eBay | `fetchEbay*`, `getEbayTrafficPayload` | Fetch with abort timers; OAuth client credentials and refresh tokens are private configuration; cache in `DATA_DIR`. |
| Email | `fetchUnreadEmail*`, `lib/email-imap.js` | Gmail Atom fetch or IMAP snapshot/body/read/move operations; credentials are environment-only. |
| Social | `fetchMetaGraphJson`, public-page fetches, `fetch*Via*Session` | Meta Graph, public HTML, and Playwright child scripts; persisted history and poll logs. |
| RSS | `fetchFeedXml`, `fetchTextViaCurl` | Request feed URLs supplied by the browser; configured byte/feed/time limits. Phase 3 replaces this with `safeFetch`. |
| Camera | `handleApiCameraSnapshot` | Camera URL query parameter; currently private range or configured hostname allowlist. Phase 3 adds DNS/redirect-safe fetch. |
| Crypto and gas | `handleApiCryptoProxy`, `handleApiGasPrices`, curl fallback | fixed target catalog/configured providers. |
| Relay | `relayRowanMessage` | configured relay URL with optional bearer/header. |
| System and devices | `readDiskUsagePercent`, `readTopProcesses`, `runExecFile`, speed-test helpers | PowerShell, `df`, `ps`, `ping`, `wakeonlan`, `etherwake`, and speed-test commands with timeouts/buffers. |

## Filesystem reads and writes

- `STATE_PATH`: state reads, integrity checks, atomic-style temporary writes for social histories, and state backups. State writes are not yet revision-conditional; that is Phase 4.
- `BACKUPS_DIR`: `listBackupFiles`, `writeBackupSnapshot`, and retention pruning.
- Social history/cache files: Facebook, Facebook group, Instagram, TikTok, YouTube, and eBay cache under `DATA_DIR`; social poller logs under `LOG_DIR`.
- Browser session storage: Meta/Facebook/Instagram storage defaults to `DATA_DIR/.auth`.
- `.env` and `.env.local`: read only during server startup.
- Diary index: `DIARY_INDEX_ROOTS` currently reaches a developer-specific sibling report directory; it is explicitly deferred to Phase 7 and must not be expanded.
- Static requests: `resolveStaticFile` resolves only a regular file under the real `PUBLIC_ROOT`; it rejects dotfiles, traversal encodings, directories, and symlink escapes.

## Timers and recurring work

- Server social pollers: Facebook, Facebook group, Instagram, TikTok, and YouTube each have startup bootstrap plus `setInterval` in their `init*Service` functions.
- Request deadlines: eBay, email, Meta/Instagram, relay, RSS, camera, crypto, and gas use timeout/abort logic.
- Frontend: `public/app.js` owns several UI and integration intervals/timeouts; individual pod files under `public/app/pods/` also own lifecycle behavior. Phase 9 replaces this scattered scheduling with one visibility-aware scheduler.

## Browser rendering and navigation sinks

- `public/app.js` is the primary renderer and contains `innerHTML`, dynamic media `src`, dynamic links, `window.open`, `URL.createObjectURL`, and iframe/media handling.
- `public/index.html` statically loads the core/pod scripts and static social icons.
- Dynamic browser fetches include state, eBay, RSS, social metrics, system, devices, relay, weather, crypto, and gas.
- Phase 5 audits each HTML/URL sink, removes stored-XSS paths, and adds CSP. Until then, all content flowing to a rendering sink must be treated as untrusted.

## Persisted dashboard state

`public/app.js` loads browser state and can synchronize it with `/api/state`. The primary persisted areas include projects, tasks, notes, ideas, reminders, shortcuts, calendar/layout/settings, changelog, media/stream preferences, pod configuration, and migration/integrity metadata. The server writes `__integrity`; client-side compatibility state is normalized in the frontend persistence helpers. Phase 4 introduces an explicit schema, migrations, revision compare-and-swap, and durable atomic state writes.

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
