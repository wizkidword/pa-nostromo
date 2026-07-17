# Versioning and releases

## Sources of truth

- `package.json` owns the PA Nostromo application/package version.
- `lib/release-info.js` reads that version and exposes it through
  `GET /api/app-info`; the dashboard header displays the same value.
- `lib/state-schema.js` owns `CURRENT_STATE_SCHEMA_VERSION`, the version of the
  durable shared-state format. It is deliberately independent of the app
  version and is also returned by `/api/app-info`.

Do not hard-code the application version in browser files, release notes, or
server handlers. Do not bump the state schema for a release that leaves the
persisted state format unchanged.

## Development snapshots and stable releases

`main` contains tested development snapshots. A stable release is created only
from a tested `main` commit after the package version is intentionally bumped.
Its Git tag and GitHub Release must be exactly `v` plus the `package.json`
version—for example, package `1.2.3` becomes tag and release `v1.2.3`.

For a release candidate, use a SemVer prerelease package version such as
`1.2.3-rc.1`, then tag it `v1.2.3-rc.1`. Do not create a stable tag for an
untested commit or reuse a tag for a different commit.

## State migrations

The server validates and migrates state at the disk/API boundary. State without
`schemaVersion` is treated as version 1. Each supported migration preserves a
verified pre-migration backup, then writes the new state atomically. A state
newer than the supported schema is rejected rather than downgraded.

When changing durable state:

1. Add the migration in `lib/state-schema.js` and increment
   `CURRENT_STATE_SCHEMA_VERSION` only when the persisted format changes.
2. Add focused migration and failure tests.
3. Update [durable shared state](state-persistence.md) and this document.
4. Verify backup, restore, and cross-browser save behavior before release.

The historic `RELEASE-v1.0.0.md` file describes an earlier Phase 1 milestone;
it is not the current application-version authority.
