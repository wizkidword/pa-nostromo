# Everyday Calculator – Tip/Tax Keyboard Regression Matrix

## Scope
Regression checks for keyboard interaction between calculator shortcuts and Tip/Tax number inputs.

## Preconditions
- Open app and locate **Everyday Calculator** pod.
- Tip/Tax panel visible.
- Calculator display starts at `0` (or any valid number).

## Manual Test Cases

1. **Button path still works**
   - Click `9`, `7`, `8`.
   - Expected: display updates normally to `978`.

2. **Tip input continuous backspace**
   - Click Tip % input.
   - Press Backspace repeatedly 3–5 times.
   - Expected: each Backspace is handled by the input continuously; no reclick required.
   - Expected: calculator display value does not change because of Backspace.

3. **Tip input continuous typing**
   - With Tip % focused, type `12345`.
   - Expected: all keystrokes register continuously without refocusing.
   - Expected: calculator display does not receive digits.

4. **Tax input continuous edits**
   - Repeat tests #2 and #3 in Tax % input.
   - Expected: identical stable behavior.

5. **Calculator shortcuts outside inputs**
   - Click calculator container (not Tip/Tax input).
   - Press `1`, `+`, `2`, `Enter`.
   - Expected: keyboard shortcuts still drive calculator and show result `3`.

6. **No accidental clear/backspace while editing Tip/Tax**
   - Focus Tip % or Tax %.
   - Press `Escape`, `Delete`, `Backspace`, `c`.
   - Expected: no calculator-level shortcut action is triggered while input is focused.

## Notes
- The core regression condition is: once Tip/Tax input is focused, calculator shortcut handlers must not run and must not call `preventDefault()` for those key events.
- Input updates are now driven by `input` event for immediate sync, with guarded mutation/rerender behavior to preserve continuous editing.
