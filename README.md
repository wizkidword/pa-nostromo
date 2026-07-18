# PA Nostromo

<p align="center">
  <strong>A local-first personal operations cockpit for projects, tasks, notes, signals, and daily focus.</strong><br />
  Keep the work that matters visible, turn meaningful signals into an action, and retain control of your data.
</p>

<p align="center">
  <a href="https://github.com/wizkidword/pa-nostromo/actions/workflows/guardrails.yml"><img alt="CI" src="https://github.com/wizkidword/pa-nostromo/actions/workflows/guardrails.yml/badge.svg?branch=main" /></a>
  <img alt="Node.js 20 or newer" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&amp;logoColor=white" />
  <img alt="Local-first" src="https://img.shields.io/badge/Architecture-Local--First-4F46E5" />
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-111827" /></a>
</p>

![PA Nostromo dashboard preview](docs/screenshots/dashboard-preview.svg)

## Why PA Nostromo

Most personal dashboards become another feed to monitor. PA Nostromo is built
to be the smaller, calmer control surface in front of your existing work: what
needs attention today, what changed, and the next safe action to take.

| Use it for | What you get |
| --- | --- |
| **Plan and execute** | Projects, a Kanban task board, notes, reminders, calendar context, and a ranked Today / Focus queue. |
| **Turn signals into action** | One- or two-click paths from supported email, RSS, eBay, and social signals into project-attached tasks, notes, or reminders. |
| **Run only what you need** | Core, Seller, Creator, Home, and Custom profiles hide disabled tools and stop their background work. |
| **Keep control of your data** | Local-first defaults, private runtime storage, versioned backups, explicit restore confirmation, and safe short-lived undo. |

## Highlights

- **Today / Focus** ranks overdue work, calendar reminders, selected email,
  and failing integrations into one deliberately limited daily queue.
- **Integration Health** makes configuration, freshness, cooldowns, and
  recovery actions visible without opening every utility pod.
- **Activity & Recovery** records privacy-safe action categories and recovery
  snapshots without storing task titles, email contents, URLs, or backup names.
- **Product profiles** reduce visual clutter without deleting data or leaving
  disabled integrations running in the background.
- **Personal utility pods** include RSS, weather, calendar, reminders, media,
  local devices, sports, crypto, and more when enabled in the active profile.
- **Cross-browser state safety** uses validated, atomic shared-state writes,
  revision checks, backups, restore endpoints, and visible conflict handling.

## Quick start

**Prerequisite:** Node.js 20 or newer. The CI workflow runs Node.js 22.

```bash
git clone https://github.com/wizkidword/pa-nostromo.git
cd pa-nostromo
npm ci
```

Create local configuration only when you need an optional integration:

```bash
cp .env.example .env
npm start
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.
Then open [http://127.0.0.1:4287](http://127.0.0.1:4287).

The dashboard works in its focused **Core** profile without configuring a
third-party integration. See [`.env.example`](.env.example) for every optional
setting and its safe default.

## How it stays local and safe

PA Nostromo binds to loopback by default and keeps runtime state, logs,
backups, caches, and browser-session storage out of source control. Remote
access is an explicit opt-in protected by allowed hosts, route-specific flags,
and scoped bearer tokens.

Do not commit `.env`, `.env.local`, runtime `data/`, browser storage, or
provider credentials. If you intentionally deploy outside your machine, read
the [route manifest](docs/route-manifest.md) and
[state persistence guide](docs/state-persistence.md) first.

## Verification

```bash
npm test                 # syntax, guardrails, and fast test suite
npm run typecheck        # checked JavaScript boundary
npm run test:a11y        # accessibility smoke test
npm run test:e2e         # dashboard browser smoke test
```

The GitHub Actions workflow also runs coverage, dependency audit, browser
smoke, CodeQL, and secret scanning on the repository.

## Documentation map

- [Product profiles](docs/phase-11-product-profiles.md) — focus the interface
  around Core, Seller, Creator, Home, or a custom set of tools.
- [Today / Focus](docs/phase-11-today-focus.md) — the deterministic daily
  queue and its ranking rules.
- [Signal-to-action shortcuts](docs/phase-11-signal-actions.md) — supported
  sources and the source-reference privacy boundary.
- [Activity & Recovery](docs/phase-11-activity-timeline.md) — what the
  timeline records, redacts, and can safely undo.
- [Integration Health](docs/phase-11-integration-health.md) — status contract
  and recovery behavior.
- [Versioning and releases](docs/versioning.md) — release and state-migration
  policy.
- [Implementation inventory](docs/implementation-inventory.md) — current
  technical surface and work tracking.

## Contributing and security

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for
the local workflow, test expectations, and project boundaries. Read
[SECURITY.md](SECURITY.md) before reporting a vulnerability; please do not put
security-sensitive details in a public issue.

PA Nostromo is available under the [MIT License](LICENSE). Community standards
are described in the [Code of Conduct](CODE_OF_CONDUCT.md).
