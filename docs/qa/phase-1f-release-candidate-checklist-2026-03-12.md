# Phase 1F Release Candidate Checklist (v1.0.0)

Date: 2026-03-12
Owner: Sentinel QA

## 0) Pre-flight
- [ ] `git status` is clean except expected release-hardening files.
- [ ] Dependencies installed (`npm install` complete).
- [ ] App server reachable at expected base URL.

## 1) Static + guardrails
- [ ] Run `npm run check`.
- [ ] Confirm: syntax checks pass, guardrails pass (warnings acceptable if non-regressive).

## 2) Deterministic release smoke
- [ ] Run `npm run qa:smoke:1f`.
- [ ] Confirm all three sub-suites pass:
  - [ ] `qa:smoke:1d1` (core API route readiness)
  - [ ] `qa:smoke:1e1` (state safety + cross-tab determinism)

## 3) Manual critical-path spot checks

### Board / tasks
- [ ] Create task in Inbox.
- [ ] Edit task fields (title/project/column/blocker/owner/next action).
- [ ] Delete task and verify undo bar appears.
- [ ] Let undo expire (~12s) and confirm task stays deleted.

### Notes / pods
- [ ] Create note, edit title/body, verify formatting preview updates.
- [ ] Convert note to task.
- [ ] Delete note then undo, verify note restored.

### State safety
- [ ] Open Settings → State Safety backups list loads.
- [ ] Restore any recent backup with confirmation.
- [ ] Confirm post-restore project/task/note views are rehydrated (no empty stale sections).

### Cross-tab sync
- [ ] Open two tabs on same dashboard.
- [ ] Perform note delete in Tab A; confirm removal in Tab B.
- [ ] Undo in Tab A; confirm restore in Tab B.

## 4) Runtime noise sanity
- [ ] Browser console: no repeating non-actionable error flood during idle.
- [ ] No repeated hydrate/render thrash visible after single action.

## 5) Release sign-off criteria
- [ ] All checklist items pass.
- [ ] No data-destructive regression found in board/notes/restore/undo flows.
- [ ] Mark release candidate as **PASS** for `v1.0.0` if all above are green.

## Fallback / escalation
If any blocking failure occurs:
1. Capture failing command + log snippet.
2. Capture minimal reproduction steps.
3. Block RC and open fix ticket before tagging `v1.0.0`.
