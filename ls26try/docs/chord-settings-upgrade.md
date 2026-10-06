# Chord correction, Auto Fill and global Prompter settings

Scope: `/ls26try/` only. Starting main: `449309e057084664416752963311ce5859b9eb2d`.
Restore tag: `ls26try-pre-chord-settings-upgrade-20261006` at that commit.

## Chord source and compatibility

The shared parser previously required A–G at the start of a token. `(G)` failed,
which could also disqualify an otherwise plain chord-only line. Balanced outer
parentheses/brackets are now recognized while `symbol` retains the exact displayed
spelling. Transposition changes root/bass inside the same wrappers. Whole-line
recognition remains conservative; prose and `SOLO: D C G x8 + x2` do not become
occurrences without explicit chord formatting.

The existing section toolbar has MARK / EDIT CHORD alongside the insertion tool.
Select text, or place the caret in a token, then open the existing chord modal.
MARK / UPDATE validates one chord; UNMARK keeps the displayed text.

Saved song HTML uses:

```html
<strong class="inserted-chord" data-ls26-chord="include">(G)</strong>
<span data-ls26-chord="exclude">D</span>
```

Exclusion wins over enclosing chord/bold formatting. These are source annotations,
not timing IDs. Range insertion preserves attributes which Chromium's legacy
`execCommand('insertHTML')` strips from an otherwise unstyled span. The existing
Creator snapshot undo history owns these edits. Song Save/reload preserves them.

Timing remains schemaVersion 1 at `lyrics/{songId}/musicalTiming/v1`.
No fingerprint algorithm or UUID persistence format changes. Marking a chord already
recognized at the same source anchor leaves its timing intact. Added/deleted/edited
occurrences use existing conservative reconciliation; ambiguous timing still needs
review. Newly detected wrapped chords can legitimately change the recognized source.
No saved songs or timing documents are automatically rewritten.

LyricView transposition and the shared Singer source adapter respect exclusions.
Singer synchronization, audio, scrolling, focus ownership and note tools are unchanged.

## Auto Fill Song

A bounded native LiveSuite-styled modal provides assumptions → progression templates
→ review → local Apply. Exact ordered canonical chord sequences are grouped, with
outer wrappers ignored for grouping only. Different meters remain separate groups.
Each group shows its section/line usages, existing/target/mixed state, bars, duration
fields, Replace-existing and Skip options.

Quarter-note beats per bar = numerator × 4 / denominator. TIME SIG markers establish
the meter of following occurrences. A change inside one chord line is skipped by
default and explicitly identified for manual checking.

Suggestions prefer a complete existing progression matching the requested total;
then usable partial existing values. Otherwise source character gaps supply relative
weights (the final chord uses the median inter-chord gap). Equal weights are the
fallback. Half-beat allocation gives each chord at least 0.5, apportions remaining
half-beats by weight, then distributes fractional remainders deterministically.
Spacing is a reviewable suggestion here, never the playback clock or stored unit.

Templates must sum exactly to bars × beats per bar, or be skipped. Existing durations
are retained by default. Review reports actual line totals that differ because of
retained values, incomplete sections, non-bar section totals, changing-meter sections,
and unresolved older events. Warnings require explicit acceptance as exceptions/manual
verification. Auto Fill never resolves ambiguous identities or changes lyrics.

Apply changes the shared local draft, retaining IDs and unresolved entries. One timing
Undo restores the complete pre-Apply draft. No reads/writes while planning/editing;
Save Timing remains the existing conflict-safe transaction (normally two document reads
and one timing-document write). Opening an untimed song creates no remote document.

## Spacing and settings

App Settings adds 0–40 px extra chord-line space above/below. Existing
`noteSettings/livesuiteAppSettings` stores `chordLineSpaceAbove/Below`.
LS26Settings applies `--ls26-chord-line-space-before/after`. LyricView wraps chord-only
rendered rows without adding source line boundaries; defaults are zero extra pixels.

Prompter Guitaroke has separate `chordAbove/Below` values, 0–40 px, default zero.
Only Singer chord rows receive them; Normal/Lyrics Pro hide those rows.

Global Prompter document: `noteSettings/livesuitePrompterSettings`:

```js
{
  schemaVersion: 1,
  revision: 1, // incremented by conflict-checked transaction
  updatedAt: serverTimestamp(),
  values: {
    guidance: 'normal', theme: 'default', font: 'default', size: 'normal',
    spacing: 'normal', background: '#00131a', bottomBar: true,
    autoScroll: true, speed: 1, focus: 40, currentScale: 1.72,
    contextScale: 1.48, mutedScale: 0.82, mutedOpacity: 0.60,
    currentColour: '#16d8ff', chordAbove: 0, chordBelow: 0
  }
}
```

Admin uses explicit Save Global Settings, not per-slider writes. A transaction reads
one document, verifies the loaded revision, then writes once. Conflict/errors preserve
local choices and offer Reload Global Settings. Reset is a local preview until Save.
No local values upload automatically. No new Firestore listeners/polling.

Singer uses its existing local keys immediately, then remote defaults on first session
load. A project-scoped session cache avoids repeated reads across reloads. Missing
remote documents do not overwrite later local adjustments. Network/permission failure
keeps local fallback. Existing Singer controls remain local performance adjustments;
shared defaults are saved in Admin. Singer includes an explicit Reload global defaults
control for already-open sessions. Rules/auth/credentials/indexes were not changed.
Production permission for the new document still needs user acceptance testing; all
write tests used an in-memory Firebase fixture.

## Sidebar

Labels: Prompter → Open Prompter / Settings; Website → Open / Reviews / Settings.
Disclosure handlers and remembered expansion are preserved.

Header colours reuse `karaokeControl/eventTypes.colors`: Live Karaoke, Solo, Roxanna.
Relative luminance chooses black/white foreground; absent colours use current-theme
fallback. One get when the five-minute cache is stale, no new listener. The existing
Gig & Events type listener refreshes that cache via a local event. Website content and
other app directories are untouched.

## Verification and limits

Focused node tests cover wrapped/ordinary/mixed text, exclusions, v1 reconciliation,
grouping, exact half-beat totals, retain/replace/skip, meter changes, section warnings,
global settings revisions/cross-device load, missing-document fallback and Singer
exclusion compatibility. Existing timing/transport/workspace suites are rerun.

`verification/chord-settings-upgrade.cjs` runs actual Creator, LyricView, Admin and Singer
pages in Chromium with all external requests blocked and in-memory Firebase. It checks
mark/edit/unmark → parent Save → reload, Auto Fill and single Undo, timing Save/reload
and operation counts, 768/1024 px layouts, spacing CSS, global settings in another browser
context, sidebar names/type colours, and no page errors.

`verification/singer-stability.cjs` still covers the stabilized Singer, Settings,
fullscreen, guidance, actual audio count-in, chord restart, START HERE, IMPROV, TIME SIG,
local sync, and PERF/HOST note insertion. A 60-second idle observation had zero DOM
mutations, zero script time, and about 0.012 seconds total task time.

Desktop Chromium responsive checks are not physical Samsung/tablet acceptance.
Auto Fill cannot infer musical intention from spacing; review suggestions, pickup bars,
and dynamic-meter exceptions. Newly recognized chords may need timing review.
