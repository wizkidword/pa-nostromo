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

`public/app.js` remains the composition layer for the migration. It supplies the current application state, logging, persistence callback, and settings rerender callback to a feature controller rather than duplicating the feature's behavior.

## Extraction Rules

- Keep a feature's state shape, input validation, rendering, and browser-event lifecycle together.
- Inject legacy dependencies at the feature boundary while the monolithic renderer still owns application-wide state.
- Add a direct feature test before relying only on browser smoke coverage.
- Load feature scripts before `public/app.js`; fail clearly if a required feature did not load.
- Keep the migration additive and preserve existing controls and saved data formats.

## Next Candidates

Unread Email, eBay Traffic, Social Followers, NBA Scores, Gas Prices, Everyday Calculator, System Monitor, Speed Test, Home Device Controls, Camera Feed, Live Streams, and Music Player are now being decomposed incrementally: their state rules live in feature modules, while rendering and network actions remain in `public/app.js` for later packages. Other integrations remain in `public/app.js`; extract each feature one view at a time, then move related state helpers and selectors only after behavior is verified.
