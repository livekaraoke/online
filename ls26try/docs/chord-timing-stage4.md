# LiveSuite Stage 4 — manual Chord Timing workspace

Completed Stage 4 only, inside the existing LyricsCreator. No Tap Timing, transport/metronome connection, LyricView highlighting or scrolling changes. Nothing pushed or deployed. All test data was local/in-memory.

**Live Save Timing is deliberately disabled in the normal application because deployed Firestore authorization could not be verified.** The complete persistence/conflict flow is implemented and tested with an injected mock. The page clearly says that online timing saving needs setup and changes remain on this page.

## 1. Starting Git status

The tree was clean on `ls26try-chord-foundation`, with HEAD exactly `a644b18ce938960e7bc4f2fc687a67aaf3ed3ae4` (approved Stage 3). Stage 2 `5f784b42affb3b1e029a0d22f5fdcb4f44cb508e` and restore tag `ls26try-pre-chord-timing`, pointing to `f5a09ce8007d418b3e148f8d826d4cbad4c731ff`, remain intact.

## 2. Stage 4 commit

The final response records the dedicated Stage 4 commit. It descends directly from the approved Stage 3 state on the same branch. A verified Git bundle contains the current branch/history and original restore tag.

## 3. Files changed

Paths are relative to `ls26try/`.

| File | Purpose |
| --- | --- |
| `host/js/chord-timing-workspace.js` | New scoped manual editing workspace, local history/state, review workflow and explicit persistence actions. |
| `host/css/chord-timing-workspace.css` | New scoped touch controls, song pane, dock, theme tokens and tablet breakpoints. |
| `host/lyricscreator.html` | Workspace tabs/container and module/styles loading; updated cache versions. |
| `host/js/lyricscreator.js` | Read-only song snapshot adapter, mount after normal load, and exclude timing input from normal lyric dirty/history handling. |
| `shared/timing-store.js` | Add returned `sourceChanged` metadata so the UI identifies reconciled changes needing Save; no schema or operation-count change. |
| `tests/chord-timing-workspace.test.cjs` | 22 focused isolated UI/controller tests. |
| `verification/chord-foundation-pages.cjs` | Load the workspace module and export the existing fixture for actual-controller checks. |
| `docs/chord-timing-stage4.md` | This report. |

No application dependencies changed. `livesuite3/`, LyricView files, metronomes, musical transport and the Stage 3 timing schema remain unchanged. The ordinary Creator Save function was not rewritten.

## 4. Entering and leaving

Two tabs appear in the existing Creator: **LYRICS & CHORDS** and **CHORD TIMING**. Timing becomes available after normal song loading succeeds. It reads a detached snapshot of the same editor sections using shared chord recognition; it does not mutate the lyric HTML or parent song.

First entry explicitly loads the optional timing document. Subsequent switches reuse the local draft and reconcile source changes in memory, without another timing read. Leaving with unsaved timing asks whether to keep that draft on the page and switch to lyrics. Cancel stays in timing; confirmation keeps the draft for the next visit. This is one application, not another Creator page or song copy.

## 5. Tablet layout

The song has its own scrollable reading pane. Selected-chord information and the bottom timing dock remain outside that pane, so navigating a long song does not scroll the primary controls away. The dock remains in normal layout flow and does not overlay the selected chord.

Primary controls and inputs have a minimum 48 px touch target. Chords use compact 52 px-high text/duration targets with understated borders; the selected one has a strong theme-accent outline. Existing LiveSuite background, border, text, accent and success tokens are used.

The workspace fits the available viewport below the actual header, rechecking on resize/orientation/visual-viewport changes. It includes rules for 601–900 px tablet widths, wider landscape layouts, short landscape screens and widths below 600 px. Wider landscape review appears beside the song; portrait review sits above it. Smaller screens wrap navigation/presets/actions into additional rows.

Static width budgets were inspected at 601, 768, 820, 1024 and 1180 px. The control grid's minimum width fits those budgets. CSS parsed successfully. This is source-level inspection, **not rendered visual verification**; real tablet and on-screen-keyboard behavior remain to be checked.

## 6. Chord selection

The read-only timing view retains section headings, logical lyric lines and chord order. Each occurrence is independently tappable, including repeated Gs and slash chords. Selection is tracked by its timing event ID. Buttons use temporary indices only to look up the corresponding current event; indices are not saved identities.

The dock shows chord, section, “Chord N of M,” neighboring chords and current duration. Previous/Next stop at song boundaries and scroll only the song pane, by the amount needed to expose an off-screen selected chord with padding. An already visible chord does not trigger a scroll.

## 7. Duration controls

- `−0.5` and `+0.5` edit only the selected occurrence.
- Presets: 0.5, 1, 1.5, 2, 3, 4, 6 and 8 beats.
- `CLEAR` removes the assigned duration locally.
- `CUSTOM…` opens a secondary numeric input; positive multiples of 0.5 are required.
- Meter and quarter-note beat semantics are displayed explicitly.

No controls measure elapsed performance time, animate musical progress or connect to the metronome.

## 8. Untimed chords

An unassigned chord displays `—` in the song and `— beats` in the dock. No four-beat default is imposed. `+0.5` assigns 0.5. Decrementing 0.5 clears the assignment back to untimed; zero/negative values are never stored. Decrementing an already untimed chord does nothing.

An absent timing document creates only a local editable draft. A new song without a saved document ID gets a clear instruction to save the ordinary song first; timing remains local and no timing read/write occurs.

## 9. Undo

Timing has a separate local history, capped at 60 changes. It covers steps, presets, custom values, clearing, explicit assignment/discard and meter acceptance. Undo restores IDs, durations and unresolved entries together.

Successful Save resets the timing undo history at the saved checkpoint. If lyrics change between workspace visits, reconciliation starts a new timing history against that source. The existing text-editor undo stack is separate and unaffected by timing controls or custom-value typing.

## 10. Unsaved state

Dirty state compares the local timing document with its clean checkpoint. The dock shows unsaved changes, and the Chord Timing tab gains an unsaved marker. Selection/navigation do not dirty timing. Reconciled source changes are recognized through the adapter's returned `sourceChanged` flag.

Workspace exit confirms keeping the draft. Page navigation/reload/close uses the browser's native `beforeunload` warning while timing is dirty, including when the lyrics workspace is currently shown. Browser restrictions can affect whether native warnings appear. Drafts are memory-only and do not survive a reload.

There are no prompts for ordinary selection or duration editing. Review decisions and destructive reloads require explicit confirmation.

## 11. Review workflow

**REVIEW TIMING** exposes unresolved older events with their chord snapshot, saved duration and previous section/line/chord numbers. Old rendered lyrics were intentionally not stored in Stage 3, so the UI does not invent old lyric context or substitute a potentially wrong current section title.

The user selects an older entry, selects a current chord in the song, and presses **ASSIGN TO SELECTED CHORD**. The confirmation states both chord names, duration and target occurrence/section. The UI does not rank or automatically choose a match that Stage 3 could not establish.

Assignment is allowed only to a current occurrence without a duration. Existing target timing must first be explicitly cleared. The operation uses Stage 3's one-to-one correspondence hook and explicitly removes the replaced untimed placeholder, preventing that placeholder from becoming another unresolved entry. An assigned older event is removed from the unresolved list and cannot be assigned twice. All other ambiguities remain unresolved.

**DISCARD OLD TIMING** confirms removal of just the selected older entry. Both assignment and discard have local Undo. Meter review shows the actual current meter, with explicit **USE CURRENT METER** acceptance and Undo.

Safely reconciled timing is displayed normally with “Timing updated to match current song”; it is not forced through manual review. Remaining unresolved data can be preserved in a timing draft Save once authorized persistence is enabled.

## 12. Save and conflict UI

The implemented Save path calls Stage 3 `store.save`, retaining selection and updating generation/revision on success, clearing dirty/history state and showing “Timing saved.” It saves the one timing document only.

On a newer timing revision, local edits remain intact and **RELOAD LATEST TIMING** is offered. Reload asks before discarding local changes. A failed reload retains the existing draft and disables unsafe saving. There is no force-save or silent merge.

If the parent source changed or disappeared, the UI also offers **RELOAD SONG**, with a warning that unsaved lyrics/timing will be lost. Unsaved source changes must go through ordinary song Save/reload and timing reconciliation before timing can save successfully. No parent-song save behavior was changed.

## 13. Exact timing I/O behavior

| Action | Reads | Writes |
| --- | --- | --- |
| Normal Creator, timing never entered | 0 extra timing reads | 0 timing writes |
| First entry for a saved song | At most 1 timing-document server read | 0 |
| Re-enter timing on this page | 0; cached draft/source reconciliation | 0 |
| New unsaved song | 0 | 0 |
| Select, navigate, change duration, Undo, review decisions | 0 | 0 |
| Explicit reload latest timing | 1 timing-document read | 0 |
| Save once authorization is enabled | Normally 2 transaction reads: parent + timing document | 1 timing-document write |
| Current normal UI Save | Disabled by the authorization-verification gate | 0 |

Contention retries can add transaction reads, as documented in Stage 3. No realtime timing listener, polling, per-chord document or per-event write was added. The test editing 50 durations and navigating 100 times recorded no I/O beyond the initial load.

## 14. Rules status

Available repository/environment configuration does not contain the deployed rules, and no explicitly safe authenticated emulator/test deployment is configured. The existing rules append examples do not prove permission for `lyrics/{songId}/musicalTiming/v1`.

Consequently, Creator mounts the workspace with `allowSave:false`. There is no user-facing switch that bypasses this gate. Loading remains a read-only explicit request on entry; denied reads produce “Saved timing unavailable,” not a false assumption that no saved timing exists. Local preview edits remain possible, with saving disabled.

Before production use, inspect the actual rules and verify the existing authorized lyrics editor's narrow get/create/update permissions for this child document. If missing, review/test/deploy only the approved narrow addition described in the Stage 3 report; do not add public access. Then the explicit code gate can be changed in a reviewed follow-up. No rules/configuration/indexes were changed or deployed during Stage 4.

## 15. Real Firestore changes

None. No real Firestore reads or writes were made during implementation/tests. All saved songs, timing documents, conflicts and failures were simulated with in-memory fixtures. No migrations or empty timing documents were created.

## 16. Keyboard shortcuts

Within the focused timing workspace: Left/Right select previous/next; `+`/`−` adjust by 0.5; Ctrl/Cmd+Z performs timing Undo. These shortcuts are ignored inside inputs, textareas, selects, contenteditable areas and textbox/combobox roles, and outside the workspace. Space remains untouched.

## 17. Stage 4 tests

22 focused tests passed, covering the 25 requested acceptance areas (Stage 2/3 regressions counted separately below). Tests exercise the actual workspace DOM plus the actual Creator controller for the integration boundary.

Covered: lazy single-load behavior; absence without creation; repeated/slash selection; half-beat values; presets/custom validation/clear; bounded navigation and minimal scroll deltas; independent Undo; dirty/exit warnings; one compact save and reload IDs; explicit review assignment/discard and Undo; meter review; cached source reconciliation; timing/source conflicts; denied reads/writes; disabled live-write gate; keyboard exclusions; source HTML preservation and parent Save payloads without timing IDs.

CSS parse and static tablet-width budget checks passed. JavaScript syntax and Git whitespace/scope checks passed. These tests use simulated DOM geometry; they are not visual, physical touch or Firebase rules tests.

## 18. Stage 2 regressions

All 18 Stage 2 unit tests passed. Isolated Creator/Viewer rendered section DOM and ordinary parent Save payloads matched the Stage 3 baseline. Existing metronome engine, performance-tempo and focused LyricView/admin playback checks passed.

The known obsolete full LyricView test's initial sidebar-placement assertion remains unchanged at baseline; its fixture still reports the same indices. It was not repaired as part of this workspace. Focused metronome behavior passes.

## 19. Stage 3 regressions

All 28 Stage 3 tests passed. Combined focused suites: **68 tests, 68 passed, 0 failed**. No Stage 3 timing schema change was needed; the store's added source-change metadata is returned to the UI only and is not persisted.

Reproduction, using the already installed external test-only linkedom dependency:

```sh
export LS26_TEST_NODE_MODULES=/path/to/test-tools/node_modules
export LS26_BASELINE_REF=a644b18ce938960e7bc4f2fc687a67aaf3ed3ae4
node --test ls26try/tests/chord-foundation.test.cjs ls26try/tests/chord-spelling.test.cjs ls26try/tests/musical-transport.test.cjs ls26try/tests/timing-persistence.test.cjs ls26try/tests/chord-timing-workspace.test.cjs
node ls26try/verification/chord-foundation-pages.cjs
node ls26try/verification/stage2-metronome.cjs
node ls26try/verification/metronome-engine.cjs
node ls26try/verification/performance-tempo.cjs
```

## 20. Browser/tablet testing

No runnable Chromium/Chrome executable was available in the workspace. No browser screenshots, actual tablet layout, physical touch or on-screen-keyboard verification is claimed. The isolated DOM tests and static CSS checks are the evidence available this run. No live application was opened for testing.

## 21. Before Stage 5

- Verify/test the narrowly scoped Firestore authorization before enabling normal timing Save. Until then, edits are local and cannot be saved through the normal UI.
- Check the workspace on the actual tablet in portrait/landscape, especially short landscape screens, review panels and the optional custom-value keyboard. Browser-native unload warnings need real-device verification.
- Confirm that source reconciliation/review is comfortable on representative real songs without production write tests. Plain normalized lyric context intentionally differs from the rich editable HTML layout; source HTML remains untouched.
- A new unsaved song must first be saved normally. Changes to lyrics between workspace visits clear earlier timing Undo history while preserving/reconciling the draft.
- Stage 5 will require a separately approved decision about connecting a single authoritative transport/audio clock and performance capture shortcuts. No such connection or capture behavior is included here.

Stopped after Stage 4. Stage 5 requires explicit approval.
