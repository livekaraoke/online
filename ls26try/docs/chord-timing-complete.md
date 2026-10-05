# Completed chord timing: tablet acceptance guide

The optional document remains `lyrics/{songId}/musicalTiming/v1`, schema 1.
No migration, parent-song save change, rule change or automatic timing write.

## Creator

Chord Timing uses the existing header and footer as reserved flex rows. Only
its song pane scrolls (the optional review panel has its own bounded scroll).
A visualViewport height variable and `100dvh` fallback handle toolbar/keyboard
changes. Ordinary editing restores its original page scrolling and position.
Custom temporarily compacts the dock; applying/closing restores manual controls.

Select an occurrence, choose TAP TIMING, choose no/one/two bars, and tap PLAY.
After count-in, tap NEXT CHORD at each harmony change. FINISH CHORD records the
last duration and pauses. STOP / EXIT keeps the captured local draft. Save
Timing is the same explicit owner-only, conflict-checked transaction as before.

Space captures; Enter plays/pauses; Ctrl/Cmd+Z undoes the last tap. These are
scoped to timing focus and ignored in text-entry controls. Held Space/Enter do
not repeat captures. Touch remains primary. Undo restores the previous duration,
selection and raw chord-start beat while the master clock continues, allowing a
corrected tap. Raw capture positions remain session-local and are not persisted.

Tap duration = current transport beat minus the last raw capture/start beat.
Round nearest half beat using `max(0.5, round(raw * 2) / 2)`; positive ties round
up. Ignore taps during pause/count-in or at zero elapsed position. Count-in beats
are negative and excluded from the first chord. Bar length is meter numerator
multiplied by `4 / beatUnit`; transport/storage beats always mean quarter notes.

BPM uses the existing PerformanceTempo convention: a current performance tempo
in sessionStorage, then User BPM, Original BPM, legacy bpm, then 96. The Creator
and Viewer use the same per-project/song session key. BPM changes re-anchor the
transport continuously and reschedule queued clicks, preserving fractional beat.

## LyricView

CHORD FOLLOW explicitly loads timing once and enables only complete,
VALID/RECONCILED timing with all timed sections visible and expanded. Untimed,
partial, unsupported, denied or ambiguous timing leaves normal auto-scroll.
Rendered correspondence is checked against source anchors before adding local
spans; persistent identities never enter source HTML or the parent song record.
Repeated chords highlight separately. Transposition retains occurrence identity.

Enabling follow resets musical position to zero; use bottom Play/Pause for the
performance. The existing compact metronome and highlighting share one Web Audio
transport/context. Its scheduler uses absolute `timeAtBeat` values and survives
UI stalls without resetting phase. Its existing advanced standalone metronome
continues using its unchanged legacy clock. Pause retains position; RESET BEAT
stops and resets to zero. Hidden tabs pause and require an explicit resume.

The focus area excludes the actual header/bottom dock. Comfortable same-line
chords cause no positioning. Departing lines move smoothly toward upper-middle.
Within the last `min(0.75, duration / 4)` beats, an otherwise hidden upcoming
line receives at most one preparation move capped at 35% of the usable height.
Manual wheel, touch drag, scrollbar/key scrolling or section navigation suspends
positioning until REJOIN CHORD. Timing/highlighting continue across sections.
Rejoin changes the viewport only, never the musical position.

Pixel-scroll speed and timed section pauseMs belong to the fallback scroll mode;
Chord Follow follows saved beat durations, with explicit transport pause for
holds. Rest/hold/lead-in event kinds remain a future schema extension, not guessed.
Hidden/collapsed timed sections must be shown before enabling follow. Render
mismatches are rejected safely. A changed source requires review in the Creator.

## Database operations

Ordinary Creator opening: zero additional timing reads/writes. Timing entry:
one server document read; re-entry reuses the local draft. Explicit reload is
another read. Local edits, taps, transport, highlight, follow and rejoin: zero
Firestore operations. Save: normally two transaction reads and one timing write;
optimistic retries can repeat reads. No timing listeners/polling/per-chord docs.

Chord Follow also suppresses the pre-existing periodic singer pixel-scroll sync
while it owns playback. The existing optional Play/run-order/history and tempo
history behavior remains outside the timing subsystem; no beat state is persisted.

## Acceptance checks

On tablet portrait and landscape: footer/dock visibility, internal-only song
scroll, Custom keyboard open/close, large tap controls, count-in and audible click
alignment, pause/resume/BPM continuity, mistap undo, save/reload. In Viewer: enable
follow before Play, transposed/repeated chords, section progression, anticipation,
manual scroll during motion, persistent override and REJOIN CHORD. Also try an
untimed/incomplete song and confirm the existing normal auto-scroll still works.

## Stabilization: editor state and timing availability

Timing has separate local `manualDirty`, `sourceChanged`, `needsSave` and
`needsReview` diagnostics. Opening/navigation never counts as a manual edit.
Persisted review items can be clean, while safe source reconciliation can need
saving without any manual edits. A source-only update is reproducible and does
not request a browser unload warning; genuine unsaved song/timing work does.
Switching workspaces keeps the draft, with a custom explanation for its state.

Save Song uses a custom SAVE BOTH / SAVE SONG ONLY / CANCEL decision when both
song and timing are manually dirty. Song-only Save stays in the editor when a
timing draft/update/review remains. It does not redirect into beforeunload.
Cancel preserves dirty state. Successful Song Save clears only the saved song
state; edits made during its asynchronous save remain dirty. Save Both is song
Save followed by the existing conflict-safe timing transaction, not an atomic
cross-document operation: a timing conflict retains its draft after song success.

Save Timing stays visible. Stage 3 permits saving unresolved entries as explicit
review state; this does not authorize playback or guess any mappings. Review
shows older unresolved entries separately from new untimed occurrences and safe
current durations. Counts come from the reconciled current event list; the
recognition/parser and persistent schema have not changed.

The Viewer dock has player/follow controls, a full-width section timeline, and
an independent full-width availability/status panel. FOLLOW labels do not wrap.
The existing footer has a separate reserved height. ResizeObserver reserves the
actual dock height for content/navigation. Below 900px, follow controls use a
second deliberate row. Chord Follow remains blocked until all current chords
are timed and review/meter issues are resolved. Status gives timed/total,
untimed and older review counts rather than a generic truncated error.
