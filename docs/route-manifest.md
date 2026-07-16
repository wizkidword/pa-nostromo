# API Route Manifest

`lib/route-manifest.js` is the single access-control inventory for every `/api/*` route. Each entry declares its HTTP method, required scope, local/remote policy, remote feature flag, body-size category, rate-policy label, and whether it changes state.

The server resolves a request through this manifest before it reaches an endpoint handler. Unknown routes receive `404`; known routes with a wrong method receive `405` with an `Allow` header.

## Access model

- Loopback requests are permitted when the entry allows local access. State-changing loopback requests must present the per-process CSRF token from `GET /api/security/bootstrap`.
- Remote requests must be explicitly enabled for the route and its matching feature flag. Non-public remote routes additionally require `Authorization: Bearer <token>` with the entry's scope.
- `NOSTROMO_API_TOKENS_JSON` configures scoped remote tokens. The legacy `NOSTROMO_API_TOKEN` remains supported only for `state:read` and `state:write`.
- `NOSTROMO_ALLOWED_HOSTS` limits accepted `Host` headers. With no explicit setting, only `localhost`, `127.0.0.1`, and `[::1]` are accepted.

## Scope families

| Scope | Covers |
| --- | --- |
| `state:read`, `state:write` | Dashboard state and backups |
| `relay:write` | Rowan relay messages |
| `media:read` | Camera snapshot |
| `integrations:read`, `integrations:refresh` | RSS, social, crypto, gas, and eBay integrations |
| `system:read` | Resource and speed diagnostics |
| `devices:read`, `devices:write` | Home device ping and wake actions |
| `email:read`, `email:write` | Email inbox data and mailbox actions |
| `admin` | Local diary indexing |

`ratePolicy` and `bodyLimit` are intentionally declared now so a later rate-limiting layer can use a complete, reviewable inventory instead of recreating route knowledge in middleware.

## Complete route inventory

All listed routes allow loopback access. `POST` routes marked **yes** are browser mutations and require the CSRF header. A remote flag must be on *and* a scoped bearer token must match before a non-public remote request is accepted.

| Route(s) | Scope | Remote flag | CSRF |
| --- | --- | --- | --- |
| `GET /api/security/bootstrap` | `public` | Always available | no |
| `GET /api/state`, `GET /api/state/backups` | `state:read` | `STATE_API_ALLOW_REMOTE` | no |
| `POST /api/state`, `POST /api/state/restore` | `state:write` | `STATE_API_ALLOW_REMOTE` | yes |
| `POST /api/rowan-send` | `relay:write` | `ROWAN_ALLOW_REMOTE` | yes |
| `GET /api/camera-snapshot` | `media:read` | `CAMERA_PROXY_ALLOW_REMOTE` | no |
| `POST /api/rss/fetch` | `integrations:refresh` | `RSS_FETCH_ALLOW_REMOTE` | yes |
| `GET /api/gas-prices`, `GET /api/crypto/*` | `integrations:read` | `GAS_PROXY_ALLOW_REMOTE`, `CRYPTO_PROXY_ALLOW_REMOTE` | no |
| `GET /api/system-resources`, `GET /api/speed-test` | `system:read` | `SYS_MONITOR_ALLOW_REMOTE`, `SPEED_TEST_ALLOW_REMOTE` | no |
| `POST /api/home-devices/ping` | `devices:read` | `HOME_DEVICE_ALLOW_REMOTE` | yes |
| `POST /api/home-devices/wake` | `devices:write` | `HOME_DEVICE_ALLOW_REMOTE` | yes |
| `GET /api/email-unread`, `POST /api/email-unread/message` | `email:read` | `EMAIL_UNREAD_ALLOW_REMOTE` | no |
| `POST /api/email-unread/read`, `/read-batch`, `/delete`, `/delete-batch`, `/spam`, `/spam-batch` | `email:write` | `EMAIL_UNREAD_ALLOW_REMOTE` | yes |
| `GET /api/ebay-traffic` | `integrations:read` | `EBAY_TRAFFIC_ALLOW_REMOTE` | no |
| `POST /api/ebay-traffic/refresh` | `integrations:refresh` | `EBAY_TRAFFIC_ALLOW_REMOTE` | yes |
| `GET /api/diary-index`, `POST /api/diary-index/refresh` | `admin` | Never remote | refresh only |
| `GET /api/{facebook-followers,facebook-group-members,facebook-content,instagram-content,instagram-followers,tiktok-followers,youtube-subscribers}` and each `/health` | `integrations:read` | `META_GRAPH_ALLOW_REMOTE` | no |
| `POST /api/{facebook-followers,facebook-group-members,facebook-content,instagram-content,instagram-followers,tiktok-followers,youtube-subscribers}/refresh` | `integrations:refresh` | `META_GRAPH_ALLOW_REMOTE` | yes |

The diary routes are intentionally local-only because they read and index local filesystem content. All other API routes are remote-capable only when their individual availability flag and scoped-token requirement are both satisfied.
