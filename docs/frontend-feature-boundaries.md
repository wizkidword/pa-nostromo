# Frontend Feature Boundaries

The browser application is being migrated incrementally from the legacy `public/app.js` renderer into feature-owned modules. Each extraction must preserve the existing screen behavior and loading order while making the feature independently testable.

## Current Feature Modules

| Feature | Module | Owns |
| --- | --- | --- |
| Theme | `public/app/features/theme.js` | Theme catalog, preference validation, resolved-theme calculation, body-class updates, theme-choice rendering, system-theme listener binding, and listener cleanup. |
| Projects | `public/app/features/projects.js` | Project form validation and creation, project lookup selectors, directory rendering, safe outbound links, dialog events, and event-listener cleanup. |
| Notes | `public/app/features/notes.js` | Note filtering, creation, editable-field validation, inline rendering, safe markdown preview updates, task conversion, and Notes control lifecycle. |
| Reminders | `public/app/features/reminders.js` | Reminder validation and creation, date selectors, calendar-agenda and today rendering, safe display, delete-with-undo wiring, and add-control lifecycle. |
| Tasks | `public/app/features/tasks.js` | Kanban columns, task validation and actions, project selectors, board rendering, drag/drop movement, task-dialog lifecycle, and deterministic listener cleanup. |
| Shortcuts | `public/app/features/shortcuts.js` | Safe URL validation, drag-and-drop capture, project assignment, shortcut dialog lifecycle, settings manager, and reversible actions. |
| Unread Email state | `public/app/features/unread-email-state.js` | Account resolution, safe message identifiers, state pruning after refresh, and per-account blocked-sender validation and filtering. |
| eBay Traffic state | `public/app/features/ebay-traffic-state.js` | Store and view selection, display formatting, report-age classification, safe listing URL construction, and top-listing selection. |
| Social Followers analytics | `public/app/features/social-followers-analytics.js` | Follower-history normalization and calculations, range filtering, content-item normalization, and status summaries. |
| NBA Scores state | `public/app/features/nba-score-state.js` | Saved view and favorite-team validation, team catalog, score-event normalization and tags, game ordering, view filtering, and featured-game selection. |
| Gas Prices state | `public/app/features/gas-prices-state.js` | Saved price-state normalization, safe price formatting, and auto/manual grade-value normalization. |
| Everyday Calculator state | `public/app/features/everyday-calculator-state.js` | Saved calculator settings, arithmetic action reducer, display formatting, and tip/tax summary calculations. |
| System Monitor state | `public/app/features/system-monitor-state.js` | Allowlist normalization and presets, load-severity classification, and system rate/uptime formatting. |
| Speed Test state | `public/app/features/speed-test-state.js` | Saved history and threshold normalization, warning decisions, latest-run selection, and metric formatting. |
| Home Device Controls state | `public/app/features/home-device-state.js` | Saved device normalization, tag and MAC formatting, and available-action decisions. |
| Camera Feed state | `public/app/features/camera-feed-state.js` | Saved feed normalization, source and mode labels, and display-state decisions. |
| Live Streams state | `public/app/features/live-streams-state.js` | Saved provider inputs and presets, source summaries, and display-state decisions. |
| Music Player state | `public/app/features/music-player-state.js` | Saved playback settings, ambient selection validation, and display-state decisions. |
| RSS state | `public/app/features/rss-state.js` | Saved feed and item normalization, read-state cleanup, and refresh settings. |
| Utility Layout state | `public/app/core/layout.js` | Default pod layout, legacy pod migrations, visibility normalization, and custom-pod placement. |
| Settings state | `public/app/features/settings-state.js` | Saved dashboard preferences, theme/task validation, and shortcut-filter state. |
| Crypto Tracker state | `public/app/features/crypto-state.js` | Saved watchlist and holdings normalization plus provider-failover ordering. |
| Date & Time | `public/app/pods/date-time.pod.js` | Time display rendering, timezone presentation, and alarm-status refresh. |
| Calendar | `public/app/pods/calendar.pod.js` | Month-grid rendering, selected-date handling, and reminder-date indicators. |
| Weather | `public/app/pods/weather.pod.js` | Current-condition and forecast display plus cached-result status presentation. |
| Action store | `public/app/core/action-store.js` | Feature-area actions, revision tracking, targeted subscribers, and visible persistence status. |
| Persistence platform | `public/app/core/persistence.js` | Independently coalesced local and shared persistence queues with surfaced write failures. |
| Scheduler platform | `public/app/core/scheduler.js` | Visibility- and offline-aware, single-flight integration refreshes with backoff, jitter, cancellation, enable/disable control, next-refresh state, and cleanup. |

`public/app.js` remains the composition layer for the migration. It supplies the current application state, logging, persistence callback, and settings rerender callback to a feature controller rather than duplicating the feature's behavior.

Core project, task, note, reminder, settings, and layout changes now enter the composition layer through named feature actions. The action store updates only the declared feature areas: note drafting intentionally persists with `render: false`, so typing leaves the active editor, board, and unrelated pods intact. Full `renderAll()` calls are reserved for startup and whole-state replacement such as shared-state hydration/import.

## Extraction Rules

- Keep a feature's state shape, input validation, rendering, and browser-event lifecycle together.
- Inject legacy dependencies at the feature boundary while the monolithic renderer still owns application-wide state.
- Add a direct feature test before relying only on browser smoke coverage.
- Load feature scripts before `public/app.js`; fail clearly if a required feature did not load.
- Keep the migration additive and preserve existing controls and saved data formats.

## Remaining incremental candidates

Date & Time, Calendar, and Weather now own their rendering. Unread Email, eBay Traffic, Social Followers, NBA Scores, Gas Prices, Everyday Calculator, System Monitor, Speed Test, Home Device Controls, Camera Feed, Live Streams, Music Player, RSS, Utility Layout, Settings, and Crypto Tracker are decomposed incrementally: their state rules live in focused browser modules, while compatibility rendering and network actions remain in `public/app.js`. Future extractions should move a complete feature view and its events into the feature module, retaining the action-store and scheduler contracts rather than adding new global timers or broad rendering paths.
