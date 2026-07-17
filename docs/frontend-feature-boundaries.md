# Frontend Feature Boundaries

The browser application is being migrated incrementally from the legacy `public/app.js` renderer into feature-owned modules. Each extraction must preserve the existing screen behavior and loading order while making the feature independently testable.

## Current Feature Modules

| Feature | Module | Owns |
| --- | --- | --- |
| Theme | `public/app/features/theme.js` | Theme catalog, preference validation, resolved-theme calculation, body-class updates, theme-choice rendering, system-theme listener binding, and listener cleanup. |
| Projects | `public/app/features/projects.js` | Project form validation and creation, project lookup selectors, directory rendering, safe outbound links, dialog events, and event-listener cleanup. |
| Notes | `public/app/features/notes.js` | Note filtering, creation, editable-field validation, inline rendering, safe markdown preview updates, task conversion, and Notes control lifecycle. |
| Reminders | `public/app/features/reminders.js` | Reminder validation and creation, date selectors, calendar-agenda and today rendering, safe display, delete-with-undo wiring, and add-control lifecycle. |

`public/app.js` remains the composition layer for the migration. It supplies the current application state, logging, persistence callback, and settings rerender callback to a feature controller rather than duplicating the feature's behavior.

## Extraction Rules

- Keep a feature's state shape, input validation, rendering, and browser-event lifecycle together.
- Inject legacy dependencies at the feature boundary while the monolithic renderer still owns application-wide state.
- Add a direct feature test before relying only on browser smoke coverage.
- Load feature scripts before `public/app.js`; fail clearly if a required feature did not load.
- Keep the migration additive and preserve existing controls and saved data formats.

## Next Candidates

The task, email, and integrations areas remain in `public/app.js`. Extract them one feature at a time, beginning with a self-contained view and its event handlers, then move related state helpers and selectors only after behavior is verified.
