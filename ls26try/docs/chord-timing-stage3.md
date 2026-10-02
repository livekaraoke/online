# LiveSuite Stage 3 — optional timing persistence

Stage 3 only: versioned local timing model, persistent IDs, normalized source fingerprints, conservative reconciliation and a Firestore compat adapter. No timing workspace, Tap Timing, playback connection, highlighting or chord-follow scrolling. No push or deployment. No real Firebase requests or rules/index changes.

## 1. Git status before Stage 3

The working tree was clean on `ls26try-chord-foundation`, at the exact approved Stage 2 commit `5f784b42affb3b1e029a0d22f5fdcb4f44cb508e`. The restore tag `ls26try-pre-chord-timing` still resolved to `f5a09ce8007d418b3e148f8d826d4cbad4c731ff`. Both remain intact.

## 2. Stage 3 commit

The final response identifies the Stage 3 commit, which is a direct descendant of Stage 2. Nothing is pushed. A verified complete-history Git bundle accompanies the result and retains the original restore tag and current development branch.

## 3. Files added/changed

All paths below are relative to `ls26try/`.

| File | Change |
| --- | --- |
| `shared/timing-model.js` | New pure schema, SHA-256 source snapshot, persistent UUIDs, duration editing, validation and reconciliation API. |
| `shared/timing-store.js` | New explicitly invoked Firestore compat load/save adapter and structured conflict/error results. |
| `host/lyricscreator.html` | Load the two dormant modules after chord recognition. |
| `host/lyricview.html` | Load the two dormant modules after chord recognition. |
| `tests/timing-persistence.test.cjs` | New isolated data/transaction tests. |
| `verification/chord-foundation-pages.cjs` | Exercise actual Creator Save with a seeded companion timing document; check parent payload and companion preservation against Stage 2. |
| `docs/chord-timing-stage3.md` | This schema, API and results report. |

Creator/Viewer controllers, existing save semantics, chord-foundation module, transport, metronomes, scrolling and Firebase initialization remain unchanged. All `livesuite3/` files remain unchanged.

## 4. Exact schema

This is a valid one-chord example generated locally, never written to Firestore. Arrays scale to the ordered source occurrences. UUID values are illustrative; hashes correspond to a `lyrics` section titled `VERSE` containing the text `G`, with explicit 4/4.

```json
{
  "schemaVersion": 1,
  "generation": "5ce46a6b-eab2-4e5a-8c1e-8b4a5ffb66cf",
  "revision": 1,
  "source": {
    "algorithm": "ls26-source-v1-sha256",
    "fingerprint": "sha256:ab2e556e393d599dcceb75fee5f6a0494cc2302adbd603899f789ad60abc9d5f",
    "musicalFingerprint": "sha256:07ce65978d5d69c8cb618f98e5e354aa144a7234326326d460658c8b86ef3d1f",
    "meter": {
      "beatsPerBar": 4,
      "beatUnit": 4,
      "transportBeatUnit": 4,
      "assumed": false
    },
    "sections": [{
      "type": "lyrics",
      "title": "VERSE",
      "lines": [{
        "textHash": "sha256:aa61870c76b8f6f57889888fbf24c006487753f3139494f7790353cf5a998492",
        "templateHash": "sha256:8840c664c05eee4fd5b3e4a2e38bde4b0edf94bdc83d873d056f8b1c318db68f",
        "slots": [{"chord": "G", "start": 0, "end": 1}]
      }]
    }]
  },
  "meter": {
    "beatsPerBar": 4,
    "beatUnit": 4,
    "transportBeatUnit": 4,
    "assumed": false
  },
  "events": [{
    "id": "2a793808-dfb2-4969-9723-dbe177a0999c",
    "kind": "chord",
    "chord": "G",
    "sourceAnchor": {
      "sectionIndex": 0,
      "lineIndex": 0,
      "slotIndex": 0,
      "start": 0,
      "end": 1
    },
    "durationBeats": 4
  }],
  "unresolved": [],
  "reviewReasons": []
}
```

All shown top-level fields are required. No arbitrary extra fields are silently discarded. `durationBeats` is optional for an unassigned occurrence; when present it must be a positive numeric multiple of 0.5. It is never a string, seconds value or null. `setDuration(..., null)` explicitly clears the property locally.

`revision` is 0 in a new local draft and a positive safe integer after persistence. Each Save increments it once. `generation` is an opaque UUID identifying this timing-document lifetime, protecting against deletion/recreation with the same revision number.

Every current source chord has exactly one event, in section/line/slot order. Duplicate IDs, changed event order, wrong anchors or mismatched symbols are rejected. `source` stores hashes and compact chord slots, not rendered HTML, complete duplicated lyrics or DOM attributes. A conservative 256 KiB serialized budget and 2,000 current-event limit fail before attempting writes.

An unresolved entry has this exact shape:

```json
{
  "event": {"id": "opaque-prior-id", "kind": "chord", "chord": "G", "sourceAnchor": {"sectionIndex": 0, "lineIndex": 0, "slotIndex": 0, "start": 0, "end": 1}, "durationBeats": 4},
  "sourceFingerprint": "sha256:<64 lowercase hex characters>",
  "reason": "source-edit"
}
```

`reviewReasons` contains unique values from `unresolved-events` and `meter-changed`. The unresolved flag must agree with the unresolved list. These are persisted review states, not ephemeral booleans that disappear on reload.

The ordered event array, opaque IDs and `kind` discriminator can be extended to rest/lead-in/hold payloads without adopting per-event documents. This client explicitly refuses unsupported kinds/schema algorithms instead of deleting fields it does not understand. Extending validation/source binding is required before those kinds are writable.

## 5. Exact storage path

`lyrics/{songId}/musicalTiming/v1` — one optional document in a subcollection. Firebase uses the already-selected app's injected `db`; the modules create no project/configuration or authentication behavior.

The current Creator uses `lyrics/{songId}.set(data, {merge:false})`. That replaces the parent document's fields, not this separate child document. Its save code was left unchanged and the actual controller was tested against the in-memory fixture. Normal song deletion may leave an orphan subcollection; timing saves reject a missing parent. No new deletion or cleanup operations are provided.

## 6. Persistent event IDs

`createDraft(source)` explicitly generates cryptographically random UUIDs for occurrences and the document generation. Reconciled events retain their existing UUIDs and duration metadata. IDs never depend on symbol text, array position or rendered pixels. No IDs enter source HTML or parent-song fields. Save/reload retains them.

Absence of a document returns `timing:null` and does not even create a persistent-ID draft automatically. Inserting a new occurrence into an existing explicitly loaded timing draft generates a fresh local UUID; it persists only on explicit Save.

## 7. Fingerprints

Stage 2's source extractor reads normalized logical source lines. CRLF/CR become newline, NBSP becomes space, line/block boundaries are retained, and chord tokens have UTF-16 start/end offsets. No layout measurement is used.

- `textHash`: SHA-256 of each normalized line's plain text.
- `templateHash`: SHA-256 of that line with recognized chord spans replaced by the same marker, keeping interstitial lyrics/spacing. This supplies evidence for a one-symbol correction.
- `fingerprint`: SHA-256 of canonical JSON containing the versioned algorithm, semantic meter and ordered sections (type/title and line hashes/slots).
- `musicalFingerprint`: SHA-256 of the same ordered musical layout and meter, excluding lyric text/template hashes. This is diagnostic evidence only, never sufficient on its own to assign IDs.

Canonical JSON sorts object keys and preserves array order. Fingerprints ignore fonts, sizes, colors, ordinary inline wrappers, CSS and rendered dimensions. Section/line order, source chord offsets and chord spelling contribute, detecting meaningful insertions, deletions, movement and symbol changes. Logical spacing is retained because it is part of source positioning. Nonmusical tab/note/separator section content is excluded, but section boundaries/type/title remain as context.

Lyric-only edits can change the full fingerprint while leaving musical correspondence recoverable. Making an assumed 4/4 explicit does not change semantic hashes or invalidate timing. The `assumed` metadata is deliberately excluded from hashing. There is no new revision field in the parent song: timing `revision` plus source fingerprints provide the source/revision contract.

Snapshot comparison cannot detect an intervening deletion/recreation or exchange of identical chords that results in identical source text. Future operation tracking/explicit correspondence is needed where this distinction matters; anchors alone are not permanent identity.

## 8. Reconciliation algorithm

1. Validate schema, source digests, IDs, durations, meter and event order.
2. Exact full fingerprint: retain every source-bound identity.
3. Otherwise pair unique unchanged whole sections, allowing section movement. Additional section pairing uses unique type/title; an unnamed section is paired this way only when both sources have exactly one section.
4. Within a changed paired section, pair unique unchanged logical lines, allowing line movement.
5. For unmatched same-position lines with unchanged line count, preserve timing when the complete unchanged chord layout is unique in that section, despite lyric-only changes.
6. Preserve a one-symbol edit when one unique unchanged non-chord template, equal slot count and exactly one changed symbol establish structural correspondence. Other slots retain IDs even when the longer symbol shifts their offsets.
7. Other changed lines remain unbound. Create untimed current occurrences and retain unmatched old events separately, with original IDs/durations/source fingerprint. Never shift duration assignments by array index or chord name.

Known editing operations or explicit user confirmation can supply `matches:[{eventId,candidateIndex,allowSymbolChange}]`. Duplicate/conflicting IDs/targets are rejected. `discardEventIds` explicitly discards confirmed deleted occurrences. These hints, and `acceptMeter`, require `expectedFingerprint` equal to the exact previous source fingerprint. No UI currently supplies such confirmations.

## 9. State behavior

| Result | Meaning |
| --- | --- |
| `UNTIMED` | No document; normal song behavior continues. |
| `VALID` | Exact correspondence and all current chords have durations. |
| `RECONCILED` | Safe source change with complete retained timing. |
| `PARTIAL` | Known current occurrences have unassigned durations, or there are no chord events. |
| `NEEDS_REVIEW` | Unresolved old occurrences or unaccepted meter change. |
| `UNSUPPORTED` | Schema/source algorithm/event kind this client must not overwrite. |
| `INVALID` | Invalid document/input; must not overwrite. |
| `UNAVAILABLE` | Permission/network/clock-capability failure, not an absent document. |
| `CONFLICT` | Stale revision/source or missing parent; reload/review required. |
| `SAVED` | Persistence succeeded; inspect `LS26Timing.status(result.timing)` for usability. |

`NEEDS_REVIEW` survives Save/reload. Saving preserves unresolved metadata as a draft; it does not authorize musical following. Future playback must use only `VALID`/`RECONCILED` timing, after successful source validation, and use existing behavior otherwise. An untimed/new event has no guessed duration.

## 10–11. Edits and repeated chords

| Edit | Result |
| --- | --- |
| Lyrics edited on another line, or unique chord anchors unchanged on the same line | IDs/durations retained, usually `RECONCILED`. |
| New chord on a distinct new line | Safely matched old lines retained; new ID with no duration; `PARTIAL`. |
| Insertion into a changed chord line | That line needs correspondence/review; unaffected unique lines/sections retain timing. |
| Deletion | Removed timing retained unresolved; never assigned to the next same-named chord. |
| `G D G C` → `G D G G C` | Ambiguous line gets fresh unassigned events; old events retained unresolved; `NEEDS_REVIEW`. |
| Unique unchanged line/section moved | IDs/durations retained in new source order. |
| Individual chord moved without sufficient evidence | Review required; explicit matching hook available. |
| `Am` → `Am7` with one unique unchanged template | Identity/duration retained, chord snapshot/offsets updated. |
| Duplicate line templates or multiple swapped symbols | Review required. |

Each G occurrence is a distinct UUID. Identical line/section copies are deliberately not treated as interchangeable.

## 12. Beat and time signature semantics

`durationBeats` always measures Stage 2 transport beats: quarter notes (`transportBeatUnit:4`), independent of BPM. It accepts 0.5, 1, 1.5, 2, etc. The transport and metronome were not modified or connected to persistence.

`beatsPerBar` is the time-signature numerator; `beatUnit` is its denominator. For example 6/8 stores `{beatsPerBar:6, beatUnit:8, transportBeatUnit:4, assumed:false}`: six eighth notes equals three transport quarter-note beats per bar. No compound-meter accent/grouping behavior is implemented.

Missing/empty meter uses 4/4 with `assumed:true`, without editing the parent. Malformed/unsupported explicit notation returns an error instead of silently guessing. A semantic meter change retains occurrences but requires review until explicitly accepted.

## 13–14. Read/write counts

| Operation | Timing-related reads | Writes |
| --- | --- | --- |
| Existing pages open at Stage 3 | 0; adapter is dormant | 0 |
| Explicit `store.load(songId, alreadyLoadedSong)` | 1 direct timing-document server read, including missing document | 0 |
| Playback or transport operations | 0 | 0 |
| Local duration edits/reconciliation or future local taps | 0 | 0 |
| Explicit `store.save(...)` without contention | 2 transaction reads: parent song + timing document | 1 timing-document write |
| Conflict/invalid data | At most attempted validation/transaction reads | 0 |

The parent read on Save verifies current source even if an older client has changed lyrics. Transaction retries can increase reads; there is no per-event write, query, polling or realtime timing listener. Rules that call `get/exists` may add rule-evaluation reads depending on the eventual authorization policy; these are not hidden in the estimates.

## 15. Conflict handling and API

`LS26TimingStore.create({db,document})` requires an injected existing Firestore compat instance. Construction and script loading do no I/O.

`load(songId,song)` returns the normalized source, reconciled timing and `base:{generation,revision}` (or explicit null if the document is absent). Reads are server-only: denied/offline reads cannot be confused with a missing document.

`save(songId,{timing,base})` detaches the mutable draft/token before asynchronous work. It transactionally reads both documents before writing, rejects unknown/invalid existing schemas, compares the generation/revision, verifies that the draft belongs to that revision, rebuilds source from the latest parent song, and rejects stale source. Only then does it write the complete single timing document with revision incremented.

Firestore optimistic retry semantics re-evaluate these checks if either read document changes during commit. Callback computation is local/pure; retries do not create additional IDs or mutate UI state. Offline/permission failures return `UNAVAILABLE`, not a queued overwrite. No force-save fallback exists.

Typical explicit future caller sequence (no UI created in this stage):

```js
const store = LS26TimingStore.create({db: window.db, document});
const opened = await store.load(songId, alreadyLoadedSong);
if (opened.status === 'UNTIMED') {
  let draft = await LS26Timing.createDraft(opened.source);
  draft = LS26Timing.setDuration(draft, draft.events[0].id, 4);
  const result = await store.save(songId, {timing: draft, base: null});
  // Handle SAVED, CONFLICT, INVALID, UNSUPPORTED or UNAVAILABLE explicitly.
}
```

This example is documentation, not code run against Firebase. Existing lyric changes must be saved to the parent first, then timing reloaded/reconciled before its Save. Existing Creator Save behavior was not rewritten.

## 16. Firestore rules implications

The repository has no deployed Firestore rules or configured emulator. It contains only unrelated append examples. Therefore current permission at the proposed path cannot be confirmed. A parent-only `match /lyrics/{songId}` does not automatically authorize the child timing document. No rule file or deployed rule was modified.

The minimal permission addition, **if the existing rules do not already cover this path**, is one narrow match inside the existing documents block. The two authorization functions below are integration placeholders: replace them with the actual existing lyrics read/editor policy. They are not functions known to exist in this repository. This is a review template, not a deployable replacement ruleset:

```js
match /lyrics/{songId}/musicalTiming/{version} {
  allow get: if version == 'v1' && canReadLyrics(songId);
  allow create: if version == 'v1' && canEditLyrics(songId)
    && exists(/databases/$(database)/documents/lyrics/$(songId))
    && request.resource.data.schemaVersion == 1
    && request.resource.data.revision == 1;
  allow update: if version == 'v1' && canEditLyrics(songId)
    && exists(/databases/$(database)/documents/lyrics/$(songId))
    && resource.data.schemaVersion == 1
    && request.resource.data.schemaVersion == 1
    && request.resource.data.generation == resource.data.generation
    && request.resource.data.revision == resource.data.revision + 1;
}
```

No new list/delete grant is needed by this API. Do not grant all authenticated users write access unless that is already the approved lyrics editor policy. Final rules should also bound/validate the top-level schema, arrays and meter under that policy; client validation is not a substitute for security rules. Evaluating the exact authorization/schema addition requires the actual rules and an isolated rules test environment before enabling live use. No index changes are required for direct document reads.

Firebase primary references used to verify this architecture:

- https://firebase.google.com/docs/firestore/security/rules-structure
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/firestore/data-model

## 17. Real Firestore activity

Zero real Firestore reads or writes. All timing saves, transaction races, parent changes and deletes in tests use an in-memory mock. The actual page/controller checks use the existing isolated Firebase fixture. No production record, timing document, schema, rule, index, project configuration or authentication behavior was changed.

## 18. Stage 3 automated results

28 focused tests passed. Coverage includes all 20 requested categories: schema/version, half beats, repeated IDs, save/reload, exact and lyric-only matches, insertion/deletion/repeated insertion, movement, symbol corrections, ambiguity, absence, invalid/future data, revision/generation conflicts, one compact save, no per-event writes, transport with zero I/O, unchanged parent Save payload and slash events.

Additional checks cover concurrent source/timing edits during transaction retries, denied reads/writes, persisted review state, meter defaults/changes, coherent source snapshots and browser-module loading against forbidden I/O stubs. The focused tests simulate optimistic transaction retry; they do not claim SDK/emulator or live rules validation.

## 19. Stage 2 regressions

All 18 Stage 2 unit tests passed. Actual Creator/Viewer controllers loaded and rendered isolated untimed fixtures with Stage 2 DOM/save-payload parity. Creator's actual Save preserved a seeded timing companion document and omitted all local/persistent timing IDs from the parent payload. Existing metronome engine, performance-tempo and focused LyricView/admin metronome checks passed.

The known obsolete full LyricView sidebar-placement assertion remains unchanged and fails identically at the Stage 2 baseline; focused playback checks pass. Browser/tablet/physical-audio testing was unavailable and is not claimed.

Reproduce with Node and the already-installed external test-only linkedom dependency:

```sh
export LS26_TEST_NODE_MODULES=/path/to/test-tools/node_modules
export LS26_BASELINE_REF=5f784b42affb3b1e029a0d22f5fdcb4f44cb508e
node --test ls26try/tests/chord-foundation.test.cjs ls26try/tests/chord-spelling.test.cjs ls26try/tests/musical-transport.test.cjs ls26try/tests/timing-persistence.test.cjs
node ls26try/verification/chord-foundation-pages.cjs
node ls26try/verification/stage2-metronome.cjs
node ls26try/verification/metronome-engine.cjs
node ls26try/verification/performance-tempo.cjs
```

No application dependencies were installed or upgraded.

## 20. Before Stage 4

- Obtain/review the actual Firestore rules and approve/test the minimal authorized child-document access before live persistence is enabled.
- Keep future UI edits local; one explicit timing Save with the returned base token. Handle conflicts/unsupported data explicitly, never force overwrite.
- Design visible review/discard/known-operation confirmation controls. Reconciliation intentionally requires review for ambiguous same-line edits and duplicated structures.
- Meter grouping, rests/lead-ins/holds, rendering-to-event mapping and metronome/transport integration remain later work. This client rejects unsupported future event kinds safely.
- Existing older clients can still replace parent song data; child timing survives, but source validation/reconciliation must run whenever timing is loaded against changed lyrics.
- Test browser/tablet behavior and Web Crypto availability in the real HTTPS environment before relying on the future workspace. No changes to current playback behavior have been made.

Stopped after Stage 3. Stage 4 requires explicit approval.
