# LiveSuite Stage 2 — local chord and transport foundation

Completed scope: Stage 2 only. No deployment, remote Git publication, real Firebase access, timing persistence, timing workspace, Tap Timing, chord highlighting or chord-follow scrolling. All application changes are inside `ls26try/`. The existing `livesuite3/` tree was left unchanged and was not used as implementation source.

## 1. Restore point

The repository and `ls26try/` were clean before editing, with no uncommitted or untracked application changes. The restore-point name did not already exist locally or remotely. An annotated tag was created before source modifications and its `ls26try/` tree compared with the working directory, with no differences.

## 2. Git names and hashes

- Restore tag: `ls26try-pre-chord-timing`.
- Target commit: `f5a09ce8007d418b3e148f8d826d4cbad4c731ff`.
- Annotated tag object: `a3d9676561afcc1694c6b21ec9435144904ca878`.
- Exact baseline `ls26try` tree: `157b2fc5cc277f6aeeba9291ddf3ee9e002156be`.
- Stage 2 working branch: `ls26try-chord-foundation`.

The baseline commit message describes the earlier development copy; nevertheless, its `ls26try/` tree is the verified unchanged working application. Restore this path only, not the entire repository. For a later rollback, after preserving any newer work, the path-scoped command is:

```sh
git restore --source=ls26try-pre-chord-timing --staged --worktree -- ls26try
```

This command was **not** executed. A verified Git bundle also preserves the restore point independently of the working checkout. Tags and commits remain local; nothing was pushed.

## 3. Files changed

All paths below are relative to `ls26try/`.

| File | Purpose |
| --- | --- |
| `shared/chord-foundation.js` | Shared recognition/transposition, source extraction, local IDs and conservative reconciliation. |
| `shared/musical-transport.js` | Local monotonic/audio beat-position API. |
| `host/js/lyricscreator.js` | Refresh a separate local occurrence model when sections render/synchronize; expose a read-only snapshot API. |
| `host/js/lyricview.js` | Use shared recognition/transposition and build a separate local occurrence model from source sections. |
| `host/lyricscreator.html` | Load both shared modules before the controller; update controller cache version. |
| `host/lyricview.html` | Load both shared modules before the controller; update controller cache version. |
| `tests/chord-foundation.test.cjs` | Recognition, transposition, extraction and identity/review regression tests. |
| `tests/musical-transport.test.cjs` | Beat position, lifecycle, tempo, audio adapter and no-side-effect tests. |
| `tests/chord-spelling.test.cjs` | Adapt the existing spelling regression to the shared transpose function. |
| `verification/chord-foundation-pages.cjs` | Isolated actual-controller loading, rendering, mock-save and restore-point parity checks. |
| `verification/stage2-metronome.cjs` | Focused existing-metronome checks using existing isolated fixtures. |
| `docs/chord-timing-stage2.md` | This report and API/testing notes. |

No application packages, Firebase configuration, metronome implementation, scrolling implementation, CSS, song records or `livesuite3/` files changed.

## 4. Shared recognition

`LS26Chords.parse`, `isChord` and `transpose` are the common grammar and transposition functions. Both pages now build occurrences through the same `extractSections` implementation. LyricView's active chord capture and transpose functions delegate to this shared module.

All requested forms are recognized: `A`, `Am`, `A7`, `Am7`, `Amaj7`, `Asus2`, `Asus4`, `Aadd9`, `A5`, `A#`, `Bb`, `F#m`, `C/G`, `Bbmaj7/D`. Extended suffixes and Unicode accidentals are supported. A compatibility fallback preserves every token admitted by the former active LyricView regex, including permissive/incomplete legacy forms. This is deliberately not a strict input validator.

LyricsCreator previously allowed arbitrary nonempty text in its chord insertion dialog; this remains allowed. Unrecognized custom text is preserved visibly but is not automatically classified as a timing occurrence. There is no destructive normalization or rewrite.

Extraction reads detached source HTML into logical lines, accounting for line breaks, block boundaries, whitespace and formatted chord elements. It recognizes marked chords and plain chord-only lines, and excludes tabs, controls and host/performance-note sections. Offsets are UTF-16 source-text offsets, not pixels or live rendered DOM identities.

The legacy `LyricsCommon` singer/filter/export helpers remain unchanged to avoid changing other applications. Shared source interpretation does not make the existing two renderers identical. In particular, LyricView retains its existing leaf `span`/`b`/`strong` capture scope; this stage does not wrap every plain-text or nested chord in new markup. Those occurrences can exist in the local model without an individual highlightable element yet.

## 5. Slash chords

Root and slash bass are parsed independently. Examples at +2 semitones:

- `C/G` becomes `D/A`.
- `Bbmaj7/D` becomes `Cmaj7/E`.
- `Bb/Db` becomes `C/Eb`.

Zero and octave transposition preserve the exact original spelling and whitespace. Existing source-based reset behavior is retained. Invalid/unknown tokens remain unchanged. LyricView now admits slash chords that its previous capture regex missed.

## 6. Local occurrence model

`LS26Chords.createModel()` exposes `update(extracted, options)` and `snapshot()`. Each event contains an opaque session ID, `kind: 'chord'`, symbol, source anchor, line/section context, recognition source and reconciliation status. The snapshot also holds `unresolved` and `needsReview`.

The model is separate from `sections`, `loadedSong` and `currentSong`. No IDs are inserted into lyrics, rendered attributes, local storage or Firestore. IDs are intentionally not stable across page reloads or independently opened pages. Persistent identity is deferred to Stage 3.

Both pages expose `window.LS26ChordOccurrences.snapshot()`. Creator additionally exposes `refresh()`, which uses its existing source synchronization. Normal editing uses the existing synchronization/undo paths; no new polling or autosave is introduced.

The `kind` discriminator and opaque IDs leave room for rests/lead-ins. Such events and actual `durationBeats` data are not produced by the application in Stage 2. Tests use synthetic duration metadata solely to prove that reconciliation does not transfer it to the wrong chord.

## 7. Repeated identical chords

`G D G C` produces four distinct IDs. The two Gs are separate occurrences even though their symbols match. IDs survive unchanged-source refreshes and presentation-only changes. Unchanged unique sections or lines can move while retaining their occurrences.

## 8. Ambiguous edits

Automatic matches require unchanged canonical source anchors, an unchanged unique whole section, or an unchanged unique logical line. Matching is never based on chord spelling alone. Editing lyrics on another line generally preserves IDs; editing the same logical line conservatively requires review unless explicit edit correspondence is supplied.

Inserting/deleting/moving chords within a changed line gives unbound occurrences fresh IDs and keeps unmatched prior events in `unresolved`. Matching-looking new events are marked `needs-review`; old timing metadata is not copied into them. This state survives later unchanged refreshes.

`reconcile(previous, extracted, {matches:[{id, candidateIndex}]})` is a validated one-to-one hook for later known editor operations or explicit user resolution. It rejects duplicate/conflicting matches and different symbols. Ordinary contenteditable operations do not yet supply these hints. A future review UI must support confirming matches and discarding genuinely deleted events. Snapshot comparison cannot detect an intervening deletion/recreation when the resulting source is identical; operation tracking and saved source revision checks remain necessary before persisted timing is trusted.

## 9. Musical transport design

`LS26MusicalTransport.create({now, bpm, beatUnit})` accepts a monotonic clock in seconds; the default is `performance.now()/1000`. `fromAudioContext(existingContext, options)` binds directly to `existingContext.currentTime`, with no wall-clock fallback.

The API provides `start`, `stop`, `pause`, `resume`, `seek`, `reset`, `setBpm`, `getBeat`, `snapshot` and `timeAtBeat`. Loading the file creates no running transport or audio context. Quarter-note beats are explicit; alternative beat units are rejected until meter handling is designed. Fractional beats are unrestricted, so 0.5-beat events need no rounding of the transport itself.

Negative starting beats and a scheduled start delay provide count-in building blocks, without adding a count-in UI or changing current click behavior. Invalid input and backward-moving clocks fail explicitly. Audio-context suspension freezes an audio-backed transport because its clock stops; the eventual integration must define the intended pause/resume policy.

## 10. Beat calculation

While playing:

```text
beat = anchorBeat + max(0, audioOrMonotonicSeconds - anchorSeconds) * BPM / 60
```

Pause captures the current beat. Resume establishes a new time anchor. Tempo changes capture the current position before using the new BPM, preserving beat continuity. Stop resets to zero; seek retains the current play/pause state; reset stops at an explicit beat.

There is no accumulating interval, timeout or animation-frame counter. The value remains correct without periodic reads, including long gaps. `timeAtBeat` maps a future beat into the same clock domain for later scheduler integration; queued audio must be rescheduled appropriately after tempo/seek changes.

## 11. Existing metronome

No existing metronome code was modified, and it does **not yet use** the new transport. Current LyricView uses `shared/lyricview-metronome.js` and `shared/metronome-engine.js`: Web Audio scheduling uses `AudioContext.currentTime`, a 25 ms scheduling interval and a roughly 100 ms lookahead. The existing engine has click/bar/subdivision counters and resets late scheduling after a stall; these counters are not yet a continuous authoritative song position.

The new transport supplies that mathematical foundation in a compatible clock domain. Future integration must share one AudioContext/anchor with the click scheduler. Until that integration is explicitly implemented and tested, do not treat an independently started transport as synchronized with existing metronome clicks. Current scrolling and metronome controls remain as before.

## 12. Firestore activity

Real Firestore reads and writes during this implementation/testing: **zero**. New recognition, occurrence and transport modules contain no database calls or persistence. No timing documents, schema, fields, rules, indexes or song changes were made.

Isolated fixtures recorded zero writes during untimed song loading and local snapshot refresh. An explicit Save was exercised only against an in-memory mock: its song payload matched the restore-point implementation exactly after excluding the generated timestamp, and contained no occurrence IDs or timing metadata. This does not claim that all existing application paths are write-free: legacy migration-on-load and ordinary Save behavior remain unchanged.

## 13. Tests performed

- 18 Node tests passed across shared chord foundation, musical transport and existing spelling tests.
- All 14 requested chord forms, expanded/legacy notation, normal/slash transposition, spelling and whitespace preservation passed.
- Repeated IDs, local snapshots, lyric/style edits, insertion/deletion ambiguity, known-move hints, section reordering and duplicate-section ambiguity passed.
- Actual Creator and Viewer controllers loaded isolated untimed fixtures with lyrics, chords, section boundaries, notes and tabs. Zero-transpose DOM structure matched the restore point. Explicit mock Save payload matched the restore point. Viewer slash transposition/reset preserved spacing and IDs.
- Long-gap beat position, half beats, pause/resume/stop/seek/reset, tempo changes, scheduled start and audio clock behavior passed. Forbidden database/storage/network/timer stubs detected no new-module side effects.
- Existing `verification/metronome-engine.cjs` and `verification/performance-tempo.cjs` passed.
- Focused LyricView metronome start/stop, audio scheduling and independent/scroll-linked behavior passed both before and after Stage 2. Admin metronome checks passed start/stop, scheduling, tap BPM, half/double tempo, silent mode, presets, hidden-page stopping and cancelled startup.
- Syntax, whitespace-error and change-scope checks were performed. Existing metronome files and the `livesuite3/` Git tree remain identical to the restore point.

One existing full test, `verification/lyricview-metronome.cjs`, fails at its initial sidebar placement assertion. It expects a karaoke toggle as a direct drawer child, but that element is now nested. The same failing child indices (`1`, `-1`) occur at the restore point. The unrelated assertion/application layout was left unchanged. The focused runner transparently reuses the fixture without executing that obsolete layout assertion or the unrelated reminder suite.

Reproduction (Node plus external test-only `linkedom@0.18.12`; no application dependency added):

```sh
export LS26_TEST_NODE_MODULES=/path/to/test-tools/node_modules
export LS26_BASELINE_REF=ls26try-pre-chord-timing
node --test ls26try/tests/chord-foundation.test.cjs ls26try/tests/musical-transport.test.cjs ls26try/tests/chord-spelling.test.cjs
node ls26try/verification/chord-foundation-pages.cjs
node ls26try/verification/stage2-metronome.cjs
node ls26try/verification/metronome-engine.cjs
node ls26try/verification/performance-tempo.cjs
```

## 14. Limits of testing

An executable browser was unavailable. No live browser/tablet, physical audio, touch editing, real authentication, live Firebase or production deployment was tested. Simulated DOM equality is evidence about structure and spacing preservation, not a screenshot or pixel-layout proof.

Current LyricView HTML does not expose chord-transpose controls; its renderer's transpose/reset function was invoked through a test-only VM hook. No UI controls or test hooks were added to application code. Real-device audio suspension, background throttling and precise click/transport phase integration remain untested because this stage does not wire the systems together.

## 15. Risks and decisions before Stage 3

1. Approve the optional persistence location and source revision contract. Creator's existing `lyrics/{id}.set(data, {merge:false})` still replaces the parent document, so new parent fields would be unsafe without an explicit preservation design. A separately versioned optional companion document is a candidate, not an implemented schema.
2. Persisting IDs requires song identity, source fingerprints/revisions, stale-data checks, explicit ambiguity resolution and a policy for old clients editing lyrics. Local IDs alone cannot survive reloads or coordinate independent clients.
3. Define which existing custom notation should become timing events. Arbitrary creator text stays readable but is not all classifiable as chords. Plain/nested occurrences need deliberate renderer-to-event mapping before highlighting.
4. Decide beat-unit/time-signature semantics, especially compound meter. The foundation currently uses quarter-note beats. Define audio suspension, count-in and seek behavior before connecting the scheduler and transport.
5. Conservative reconciliation intentionally favors review over a wrong timing assignment. Persistent unresolved-event retention, discard operations, undo and known-edit hints need explicit Stage 3/4 design.
6. Perform browser/tablet visual and audio checks before relying on this during a performance. Normal playback must continue to have zero timing-related Firestore writes.

Stage 3 has not begun. Further implementation requires explicit approval.
