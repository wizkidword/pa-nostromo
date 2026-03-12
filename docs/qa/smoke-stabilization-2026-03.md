# Sentinel Stabilization Smoke Checks (2026-03)

Lightweight manual checks for the stabilization pass in `app.js`.

## 1) Startup sync race protection

Goal: confirm no shared push happens before hydration decision settles.

1. Start app/server normally.
2. Open browser devtools console.
3. Hard refresh once.
4. In console, verify no errors and run:
   - `window.__mcDebug = { sharedHydrationResolved: typeof sharedHydrationResolved !== 'undefined' ? sharedHydrationResolved : null };`
5. Expected:
   - Initial render works.
   - Shared sync seeding/push only occurs after hydration resolution path.
   - No stale local overwrite observed when opening two tabs with different pre-existing states.

## 2) Stop-button isolation regression

Goal: ensure Music Stop does not stop Voice Note recorder and Voice Note Stop does not stop Music transport.

1. Start playing music in Music pod.
2. Start Voice Note capture in Voice Note pod.
3. Click **Music Stop**.
   - Expected: music transport stops; Voice Note capture remains active.
4. Restart music if needed.
5. Click **Voice Note Stop**.
   - Expected: Voice Note capture stops; music playback state remains unchanged.

## Notes

- This project currently uses smoke checks (no full UI automation harness yet).
- Run static checks before merge:
  - `node --check app.js`
  - `node --check server.js`
  - `node scripts/guardrails-check.js`
