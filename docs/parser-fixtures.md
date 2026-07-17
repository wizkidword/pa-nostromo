# Parser fixtures

Parser fixtures are compact, sanitized samples that keep upstream-format drift
visible in CI. They must never include credentials, account identifiers,
production URLs, imported user data, or full copies of third-party pages.

## Current coverage

| Integration | Parser version | Valid fixture | Required-structure fixture |
| --- | --- | --- | --- |
| RSS and Atom feeds | `rss-atom-v1` | `tests/fixtures/parsers/rss-valid.xml`, `atom-valid.xml` | `rss-missing-channel.xml`, `rss-item-missing-link.xml` |
| AAA gas prices | `aaa-gas-v1` | `tests/fixtures/parsers/aaa-current-avg-valid.html` | `aaa-current-avg-missing-column.html` |
| Public social follower profiles | `social-followers-v2` | `social-{facebook,instagram,tiktok,youtube}-valid.html` | `social-follower-signal-missing.html` |
| eBay analytics traffic and marketing report | `ebay-analytics-v3` | `ebay-traffic-valid.json`, `ebay-marketing-report-valid.tsv` | `ebay-traffic-missing-required-metric.json`, `ebay-marketing-report-missing-metric.tsv` |
| ESPN NBA scoreboard | `espn-nba-scoreboard-v1` | `nba-scoreboard-valid.json` | `nba-scoreboard-missing-team.json` |

Run `npm test` to execute the fixture checks. The checks assert the fields the
dashboard needs and require a stable parser error code when a source loses
required structure.

When an upstream format changes, add or revise the smallest sanitized fixture
that demonstrates the change, update the affected parser and expected fields,
and bump the parser version in `lib/integration-envelope.js` when the parser's
output contract changes. Do not overwrite a failure fixture merely to make a
test pass; retain it when it documents a real drift mode.
