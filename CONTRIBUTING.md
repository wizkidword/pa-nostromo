# Contributing to PA Nostromo

Thanks for helping improve PA Nostromo. The project is a local-first personal
operations cockpit, so changes should preserve the privacy, safety, and calm
interaction model that make it useful.

## Local setup

```bash
git clone https://github.com/wizkidword/pa-nostromo.git
cd pa-nostromo
npm ci
npm test
```

Use `npm start` to open the dashboard at `http://127.0.0.1:4287`. Optional
provider configuration belongs in a local `.env` copied from `.env.example`;
never commit credentials, runtime data, or browser-session files.

## Before opening a pull request

Run the checks that match the surface you changed:

```bash
npm test
npm run typecheck
npm run test:a11y
npm run test:e2e
```

Please explain the user-facing change, preserve backward compatibility where
possible, and include focused tests for behavior changes. Keep source content
and runtime artifacts separate: generated `data/`, `logs/`, coverage, browser
output, and `.env` files do not belong in commits.

## Project boundaries

- Keep the default installation local-first and loopback-bound.
- Do not add a remote data provider, automation engine, cloud sync, or broad
  side effect without a clearly bounded design and explicit authorization.
- Make integration failure states observable and redact sensitive details.
- Avoid copying email bodies, provider credentials, session data, or private
  URLs into dashboard state, diagnostics, tests, or documentation.
- Prefer small feature modules and targeted renders over a framework rewrite.

For the current product direction, start with the
[implementation inventory](docs/implementation-inventory.md) and the Phase 11
documentation linked from the README.

## Community

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
For security-sensitive reports, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.
