# Phase 10 accessibility and interaction hardening

PA Nostromo keeps its dense dashboard layout while making core work usable without a pointer.

## Interaction guarantees

- A skip link moves directly to the dashboard landmark.
- The Settings panel is a labelled modal dialog: it receives focus on open, traps Tab navigation, closes with Escape, and returns focus to the control that opened it.
- Task movement has a keyboard alternative through the Edit Task dialog's native **Column** selector. Utility-pod order has labelled Move up/Move down buttons in Settings in addition to drag and drop.
- Targeted rendering captures and restores focus for projects, tasks, notes, settings, and layout updates. Note drafting continues to save without rebuilding the editor.
- Icon-only controls have accessible names, markdown-format controls have text labels for assistive technology, dialogs have labelled headings, and media iframes have descriptive titles.

## Status and motion

- Save state, integration status, and manual refresh results use polite live regions. Error, stale, and degraded integration states are announced once when they change.
- Keyboard focus has a high-visibility outline and halo.
- Scrollable panels retain compact, visible scrollbars instead of hiding their discoverability affordance.
- `prefers-reduced-motion: reduce` disables transitions and animations and turns off smooth scrolling.

## Verification

Run the real-browser baseline with:

```powershell
npm run test:a11y
```

The Playwright test starts an isolated server and browser profile. It checks landmark/dialog semantics, labels and accessible button names, iframe titles, visible focus and scrollbar styles, keyboard task create/edit/move flow, note-focus preservation, keyboard pod reordering, live announcements, and reduced motion.

`npm test` remains the fast deterministic suite; the browser suite is intentionally separate, like the existing dashboard smoke test.
