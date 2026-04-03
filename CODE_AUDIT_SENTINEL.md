# CODE_AUDIT_SENTINEL

## Executive summary
`app.js` (3,971 LOC) is feature-rich but has crossed the threshold where **regression risk is now dominated by architecture shape**, not individual bugs. The biggest risk drivers are:

1. **Single global mutable state + render side effects** (`state`, timers, recognizers, media objects all file-global).
2. **`renderAll()` performs persistence (`save()`)** and is called from many handlers, creating implicit write/sync side effects.
3. **Repeated event binding inside re-render functions** across pods (Notes, Board, Crypto, Camera, Voice), with inconsistent scoping patterns.
4. **No transactional model for shared-state sync** (local save + delayed shared push can race hydration/startup).
5. **High coupling across domains** (UI, persistence, network, device APIs, and migration/changelog seeding all in one file).

The codebase is still recoverable with low-risk incremental refactors. Priority should be to establish guardrails first (tests + lint rules + invariants), then split module boundaries without changing behavior.

---

## Risk matrix

### Critical

| Area | Why high-risk | Evidence |
|---|---|---|
| Render pipeline mutates persistence/sync | `renderAll()` writes state every call; many UI actions trigger `renderAll()` even for visual updates, creating hidden save/sync coupling and high regression blast radius. | `renderAll()` includes `save()` (line ~2738); called in many handlers (e.g., ~2881, 2913, 3365, 3576, 3965). |
| Shared-state race/overwrite risk on startup | Initial render schedules shared push before async hydration completes; stale local state can overwrite newer shared state under latency. | `renderAll()` called before `hydrateStateFromSharedApi()` resolve; `save()` schedules `pushStateToSharedApi()` 300ms debounce (~380-384, ~3955+). |
| Single-file global mutable runtime | Timers, recognition instances, stream/player refs, and all domain state are global, increasing cross-feature side effects and hard-to-reason regressions. | top-level `let ...` block (~106-136). |

### High

| Area | Why high-risk | Evidence |
|---|---|---|
| Repeated event wiring in render functions | Many listeners are attached during render functions; consistency depends on full DOM replacement behavior and careful scoping, easy to break during edits. | `renderNotes`, `renderBoard`, `renderCryptoWidget`, `renderCameraFeedPod`, `renderVoice*` all wire listeners post-`innerHTML`. |
| Inconsistent selector scoping strategy | Some pods use pod-root scoped queries (good regression guard), others use global `document.getElementById`, risking cross-pod collisions. | Music/Voice Note include pod-scoping comments (~1705, ~2366); VoiceToRowan uses mostly global ids (~2603+). |
| Domain logic + UI rendering tightly mixed | Fetching/normalization and HTML generation are interleaved, making testing difficult and increasing accidental behavior changes. | Weather/NBA/Crypto functions combine fetch + transform + DOM updates (~719+, ~808+, ~1368+). |
| Migration/changelog seeding embedded in runtime boot | Boot side effects continuously mutate state/changelog, making deterministic startup and tests harder. | Large patch-note insertion block (~3771-3890). |

### Medium

| Area | Why medium-risk | Evidence |
|---|---|---|
| Duplicate voice-recognition lifecycle logic | Voice Note and Voice-to-Rowan duplicate recognizer setup/error/end handling with slight differences, likely future drift. | `ensureVoiceNoteRecognizer` vs `ensureVoiceToRowanRecognizer` (~2259+, ~2535+). |
| Duplicate drag-scroll behavior | Project and board drag-scroll implementations nearly identical; bugfixes may diverge. | `enableProjectDragScroll` and `enableBoardDragScroll` (~3687+, ~3726+). |
| Ad hoc save frequency | Many handlers call `save()` immediately; combined with debounce push can produce noisy write load and timing-dependent behavior. | numerous `save()` calls throughout file (e.g., grep hits around 40+ locations). |

---

## Top 10 actionable refactor opportunities (ordered)

> Impact/Effort: H/M/L

1. **Decouple render from persistence (stop saving in `renderAll`)**  
   - **Impact:** High | **Effort:** Medium  
   - Introduce explicit `commitState({reason})` for writes. `renderAll()` should be pure UI.

2. **Add startup sync guard to prevent stale overwrite**  
   - **Impact:** High | **Effort:** Medium  
   - Block `pushStateToSharedApi()` until hydration decision resolves; add monotonic revision/updatedAt conflict check.

3. **Create a central event delegation layer per major container**  
   - **Impact:** High | **Effort:** Medium  
   - Replace repeated per-element wiring in render passes with delegated handlers for Notes/Board/Shortcuts/Crypto.

4. **Standardize pod scoping contract**  
   - **Impact:** High | **Effort:** Low  
   - All pod handlers must query from pod root (`[data-pod="..."]`) and avoid global id lookups inside pod renderers.

5. **Extract shared state store module with reducer-like mutations**  
   - **Impact:** High | **Effort:** Medium  
   - Move mutation rules into typed operations (`addTask`, `updateNote`, `setCameraMode`) to eliminate scattered direct mutations.

6. **Split network adapters from UI modules**  
   - **Impact:** High | **Effort:** Medium  
   - Move Weather/NBA/Crypto API calls + mapping to `services/*`; UI consumes normalized DTOs.

7. **Unify voice recognition engine**  
   - **Impact:** Medium | **Effort:** Medium  
   - One reusable recognizer wrapper with hooks for transcript sink, auto-restart policy, and status messaging.

8. **Consolidate timer lifecycle management**  
   - **Impact:** Medium | **Effort:** Low  
   - Timer registry (`registerInterval`, `clearAllOnModeSwitch`) for weather/nba/crypto/alarm/camera/cooldown.

9. **Move migrations/seed patches into versioned migration list**  
   - **Impact:** Medium | **Effort:** Medium  
   - Replace runtime ad hoc patch-note insertion with ordered migration steps keyed by schema/app version.

10. **Introduce lightweight runtime invariants + diagnostics**  
   - **Impact:** Medium | **Effort:** Low  
   - Validate state shape after load/mutate; log rejected mutations and impossible states in dev mode.

---

## Duplicate logic + inconsistent patterns detected

- **Voice pods duplicated lifecycle logic:** start/stop, error strings, onend behavior, button toggles are near-parallel and likely to drift.
- **Drag-scroll duplicated with slight divergence:** two functions with mostly same body.
- **UI re-render + listener wiring repeated across multiple pods:** same lifecycle pattern copied with different selectors.
- **Mixed scoping discipline:** some features hardened with pod-scoped selector guards, others still rely on global ids.
- **Mixed mutation style:** some actions `save()+renderX`, others `renderAll()` (which implicitly saves), others `save()` only.

---

## Immediate guardrails (prevent future incidents)

1. **Regression tests (must-add first):**
   - `renderAll` does not persist by itself (after refactor).
   - startup hydration cannot overwrite newer shared state.
   - pod stop buttons are isolated (music vs voice note).
   - camera mode transitions clean up old resources (stream/snapshot/local).

2. **Contract tests per pod:**
   - render is idempotent (calling render twice does not double-trigger side effects).
   - event handlers execute once per action.

3. **Static checks:**
   - ESLint rule set: no implicit globals, no duplicate listener wiring in loops without delegation, max function length warnings.
   - ban direct `state.*=` in UI modules except through mutation helpers.

4. **Runtime safety checks (dev-only):**
   - assert required state keys after load/migration.
   - warn if `renderAll` called >N times/sec.
   - warn if shared push occurs before hydration lock release.

5. **Observability:**
   - add structured log channel for `state_commit`, `state_sync`, `render_cycle`, `pod_action`.

---

## Delivery plan

### Do now (today)
- Remove/feature-flag `save()` call from `renderAll()` and route writes through explicit `commitState`.
- Add hydration lock to shared sync push path.
- Add two smoke tests: startup sync race + stop-button isolation.
- Add lint rule + CI check to block new 300+ line functions and direct state writes in renderer sections.

### Next sprint
- Extract modules for: `state-store`, `shared-sync`, `services/crypto`, `services/weather`, `services/nba`.
- Convert Notes + Board + Shortcuts to delegated event handling.
- Consolidate voice recognizer logic into shared engine.

### Later
- Full pod module isolation and typed state operations.
- Migration framework with explicit app/state versions.
- Telemetry dashboard for render/write/sync anomalies.

---

## Suggested module split map (minimal behavior-change strategy)

Goal: keep current behavior while reducing coupling.

1. **`core/state-store.js`**
   - `loadState`, `saveStateLocal`, `commitState`, schema guards, migration runner.
2. **`core/shared-sync.js`**
   - `hydrateFromShared`, `pushToShared`, hydration lock, debounce/retry/conflict policy.
3. **`core/timers.js`**
   - timer registry and lifecycle helpers.
4. **`services/weather.js`**
   - ZIP→lat/lon + weather fetch + normalized output.
5. **`services/nba.js`**
   - scoreboard fetch + normalization.
6. **`services/crypto.js`**
   - coin directory cache, provider failover, top-symbol map, watchlist fetch.
7. **`pods/music.js`**
   - music state adapter + UI render + scoped events.
8. **`pods/camera.js`**
   - mode control, stream lifecycle, device discovery.
9. **`pods/voice-note.js` + `pods/voice-rowan.js` + `pods/voice-core.js`**
   - shared recognizer core + two thin pod adapters.
10. **`pods/notes.js`, `pods/board.js`, `pods/shortcuts.js`**
    - delegated event maps + pure render functions.
11. **`ui/render-root.js`**
    - `renderAll` orchestration only (no persistence side effects).

### Minimal-risk sequencing
1. Extract pure utility functions first (no behavior change).  
2. Introduce `commitState` wrapper while preserving current save semantics.  
3. Remove render-side save.  
4. Move pods one-by-one behind identical DOM contracts and snapshot-test each pod output.

---

## Final assessment
Production use is feasible, but current architecture shape creates high regression susceptibility as features are added. Prioritizing **render/persist decoupling + startup sync safety + event model standardization** will yield the largest stability gain with the least behavioral disruption.
