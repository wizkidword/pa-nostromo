# Phase 11.4: Product Profiles

PA Nostromo can now reduce the dashboard to the tools relevant to the current
job without deleting any saved project or pod data. Choose a profile from
**Settings → Profiles** or use **Ctrl/⌘ K → Switch profile**.

## Included profiles

| Profile | Utility tools enabled in addition to the core workspace |
| --- | --- |
| Core | Calendar and Shortcuts |
| Seller | Core, eBay Traffic, and Unread Email |
| Creator | Core, Social Followers, RSS Feed, and Voice Desk |
| Home | Core, Date & Time/Weather, Gas Prices, Speed Test, Calculator, System Monitor, Home Devices, Camera Feed, Live Streams, and Music Player |
| Custom | Core plus the optional utility tools explicitly selected in Settings |

Projects, tasks, notes, reminders, calendar, and shortcuts remain the stable
core workspace. The NBA and crypto utility pods remain available through
Custom; a future Signals grouping can organize those broader status tools
without changing profile behavior again.

## What disabling means

An inactive profile tool is hidden from the dashboard and related Settings
controls, removed from local palette/search results, and its scheduled refresh
work is stopped. The browser adds the active profile to same-origin API
requests. Before an integration route runs, the server returns a structured
`product_profile_disabled` result for a disabled tool, so the provider refresh
does not start.

The profile headers are a local product-preference control, not an
authorization boundary. Existing non-profile-aware local callers remain
compatible; the dashboard itself always sends the profile context.

## Saved dashboard migration

New dashboards start in focused Core. Existing saved dashboards are migrated to
Custom with their known utility pods selected, preserving the dashboard people
already configured. Switching profiles never deletes the saved state or the
individual layout visibility choices; it simply layers a profile policy on top
of them.

## Verification

The focused test coverage checks preset and Custom policy mapping, command
palette source removal, manifest tagging, and the server's disabled-route
result. The full `npm test`, syntax/guardrail check, and accessibility smoke
test are run before this phase is committed.
