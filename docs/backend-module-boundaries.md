# Backend module boundaries

`server.js` remains the application composition root: it loads configuration, creates shared services, applies the route-security manifest, and starts the HTTP server.

State persistence is the first extracted vertical route area:

- `server/routes/state.js` parses and validates requests for `/api/state`, `/api/state/backups`, and `/api/state/restore`.
- The route module delegates reads, writes, backup listing, restoration, revisions, integrity checks, and on-disk persistence to `StateStore`.
- Server-owned transport helpers are injected into the route handler so it preserves the established response and payload-limit behavior without taking ownership of server startup or security policy.

Home-device actions follow the same boundary:

- `server/routes/devices.js` owns the `/api/home-devices/ping` and `/api/home-devices/wake` request validation and response shaping.
- Command execution, host checks, and diagnostic logging stay injected from `server.js` so the route layer does not own process I/O.

RSS refresh follows the same boundary:

- `server/routes/rss.js` validates feeds, coordinates the request lifecycle, and shapes RSS responses.
- Feed caching, safe outbound fetches, parsing, retry behavior, and abort-signal creation remain injected from `server.js`.

System resources use a route and service split:

- `server/routes/system.js` translates the query-string allowlist into a system-resource request and sends the response.
- `server/services/system-resources.js` samples host metrics and assembles the system-resource payload, using injected platform adapters from `server.js`.

Future route extractions should follow the same boundary: keep request parsing and response shaping in a route module, delegate business/persistence work to a focused service, and preserve externally visible behavior while moving one vertical area at a time.
