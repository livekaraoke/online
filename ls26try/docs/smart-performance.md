# Smart Performance — implementation checkpoint, 18 October 2026

Restore point: source main `14706e95eeede0745701ef77370aa1b1511ee085`.
Local restore tag: `ls26try-pre-smart-performance-20261018`. No historical migration.

## What was inspected and reused

- `performanceSessions` owns session identity, `startedAt`, schedules, notes, breaks
  and ended snapshots. `karaokeControl/currentSession` is the shared active pointer.
- `upcomingEvents` supplies `venueId`, venue name and `type` (including Solo,
  Roxanna and Live Karaoke). Prior linkage incorrectly stamped preparation as
  actual start and could clear the session-start transaction's Run Order.
- `karaokeControl/runOrder.items` owns queue order, request associations and states.
  `publicSongRequests` owns requests; public signup includes `requesterDeviceId`.
- LyricView Play was the genuine start boundary; viewing a song did not start it.
  Previously completion did not close the matching `performedSongs` record.
- `lyrics` document IDs are canonical. `lyricsSetlists.songIds` defines repertoire.
  Shared LS26Data caches songs, lists and events. Current Firestore metadata is
  used; legacy bundled song tags are not speculatively joined.
- Session History already supports parent snapshots and old subcollection fallback.
  Recommendations reuse snapshots, not per-song or per-gig fallback reads.

## Access

- Expanded RUN ORDER: approved BEST NEXT position, immediately below Add Song /
  Add Request; compact title/score/badge/reason, USE NEXT and SHOW 5.
- SHOW 5: recommendation venue, USE SESSION VENUE, source, act-history scope,
  priority, intent and freshness. Venue Intelligence is a disclosure in this panel.
- RUN ORDER: CURRENT / PLAYING, NEXT and FOLLOWING labels; FINISH & NEXT plus
  optional crowd response. Energy Flow disclosure follows committed order.
- Expanded SESSION STATUS: Performance Timing & Estimates; fallback average,
  transition seconds and explicit actual-start correction. Existing projected-end
  editing now preserves the originally scheduled end.
- Pending Requests: Singer Rotation suggestion, only for a Live Karaoke session.
  Its explicit Add Request action calls existing acceptance; it never calls a singer.
- Library Filters: Missing Data; existing pencil opens LyricsCreator. Performance
  Tags & Data Requirements is expanded when reached from a missing-data result.
- End Session: archived Gig Summary appears in Admin. Session History → View
  shows it again from that session's archived/live-fallback records.

## Lifecycle and identity

New sessions have timingVersion=2. `startedAt` remains preparation for compatibility;
`openedAt` captures START SESSION press time. An informational line is appended once
inside the creation transaction, preserving multiline notes. `actualStartedAt` is
null until genuine Play; standalone metronome/count-in does not call this lifecycle.
The existing Play semantics (including its transport count-in) are retained.
Explicit actual starts are preserved; manual correction records its prior value.
Old sessions retain their original interpretation; no dates are guessed/backfilled.

Shared bounded transactions (max 3 attempts) update the existing queue/session/
performed record/request. Start uses deterministic song + actual-start ID and
reuses an existing playing entry on reload. Completion updates that record, never
creates a second performance. Old started queue rows missing a record reconcile
once at that ID, marked `reconciledFromRunOrder`. Source history is not rewritten.

FINISH & NEXT captures the playing queue-entry ID; double taps share one pending
operation. A stale/already-finished ID cannot finish the following song. On success,
it stops local playback and opens the next queued song through the existing action.
It does not mark the next song playing or start transport. Failed saves do not advance.
Abandoning a playing request closes it as abandoned. End Session finishes the current
song before atomically closing session/control/gate and ongoing breaks. `closedAt`
is End press time; `actualEndedAt` comes from the last known performance end.
Archive failure exposes Retry Session Archive rather than silently claiming success.

Each new performance carries canonical song/session IDs, venue ID/name, act, queue
entry, position, actual start/end, status, request relationship, BPM, host tag snapshot
and optional `crowdResponse`. Device IDs are not assumed to uniquely identify singers:
fairness uses stable requester identity where available, otherwise device + name or
name fallback, clearly flagged. Shared-device singers are not merged by device alone.

## Recommendation context and scoring

Active venue is automatic. Manual recommendation overrides never mutate the session.
Exact IDs win. ID-less old venue names join an ID only on a unique exact normalized
name mapping; two distinct IDs with the same name remain separate. Act filtering is
explicit; unknown historical acts stay unknown. Global play counts span all acts.

Active session repertoire defaults to its stored setlist IDs or assigned saved list.
No assigned list means no automatic recommendations (choose All Songs explicitly).
No session uses the working Library list when available. Overrides persist in scoped
sessionStorage across page navigation. The committed queue is never filtered away.

Weights: freshness 30, request demand 15, artist/tempo flow 15, global neglect 5,
explicit energy 10, explicit reliability 10, genre variety 10, host outcomes 5.
A priority preset adds 25 to the selected component, then weights normalize.
Missing tags are neutral (0.5); no crowd success is inferred from BPM or text.
Venue fit is preserved/editable but not scored from unstructured text.

- Freshness: unseen complete history 1; unseen incomplete history .5; otherwise
  clamp((venueGigsAgo−1)/(freshAfter−1)).
- Demand: no request evidence .5; otherwise min(1, .5+.05 min(requests,5)
  +.05 min(completedRequests,5)−.1 min(abandonedRequests,3)).
- Artist flow: no preceding song .5; same known artist .2, different .8. If both
  BPMs exist, average with tempo fit (within 20 BPM 1, otherwise .4). Intent can
  prefer up/down within 30 BPM or similarity. Actual playing song has priority
  over a merely opened song for flow.
- Global: clamp(days since last recorded play / 90), unknown .5.
- Energy: explicit low/medium/high only; build/keep/chill use those values.
  Singalong/closer intents use explicit crowdFunction/setPosition tags.
- Reliability: high/reliable 1, medium .6, low .2, unknown .5.
- Variety: .15 when candidate repeats the genre of at least two recent plays;
  otherwise neutral .5.
- Outcomes: (positive host ratings + 1)/(rated performances + 2), or .5 unrated.
- Subtract 18 for same artist and 15 for last venue gig. Round/clamp 0–100.
  Missing history caps at 60; incomplete/truncated history caps at 75; no recorded
  venue gigs caps at 65. Scores are rankings, not probabilities.
- Exclude current/tonight, personal notes, songs outside selected recommendation
  source, and songs explicitly tagged for other acts. Already queued suggestions
  are labelled; USE NEXT explicitly promotes existing entries without duplication.

Badges unchanged: TONIGHT; TOO SOON 1 venue gig; RECENT 2; READY 3–4; FRESH 5+
or no play found in recorded coverage. Fresh threshold selectable 3/5/8. UNKNOWN
means unavailable context. Incomplete histories say “No play found”, not “never”.

## Timing, metadata and truthful limits

Known durationSeconds/savedDurationSeconds take precedence, then recorded completed
performance median, then configurable 4-minute fallback with 20-second transitions.
Ranges use ±20% average duration. BPM alone never supplies duration. Queue finish is
an estimate from remaining current-song time + upcoming durations/gaps; ongoing
breaks are shown but their future length cannot be known. Break intervals are merged
for overlap-safe totals. Performance-window duration excludes breaks but includes gaps.

Chords/timing are required only when marked by the host. Timing lives in a separate
subdocument: Missing Data says “check needed” until the host verifies saved timing;
it does not query every timing document or claim the verification is automatic.
Existing editor saves retain additional tag fields; no metadata is auto-generated.

Venue distributions use actual records plus current tags. Gig-summary distributions
use tags captured with new performances. Older unknown tags/outcomes remain unknown.
The end summary intentionally does not fetch all previous gigs for repeat comparisons;
those are available in Venue Intelligence within loaded coverage.

## Firebase and verification

No new collections, listeners, Firestore rules or indexes. Existing performedSongs
listener remains one per active context. Reference lists reuse LS26Data. Archive
recommendations are a single ordered query limited to 101 documents (100 used plus
truncation indicator), cached 6 hours per project/user/session context. Archives
missing startedAt are outside this query and coverage is labelled timestamped.
No per-second writes or per-song timing/history reads. Removed archive BPM enrichment
fan-out; absent old BPM remains unknown. Complete empty snapshots no longer trigger
subcollection fallback in Session History. Existing History full-session listener
remains unchanged; this upgrade does not add another analytics history listener.

Tests use in-memory Firestore/DOM, not the protected deployment. Focused tests cover
context/source/act separation, missing data, scoring, breaks/midnight, actual start,
completion safety/failures, queue integration, singer fairness, summaries and
baseline LyricView markup/positioning. Shared playback source is unchanged except
persistence and an exposed stop action. Tempo verification found and fixed a mid-save
BPM race. Existing chord test fixture was corrected to use DOM Event rather than
Node Event; older scroll/dock expectations still need fixture maintenance. Live
browser/physical tablet scroll acceptance is not claimed.

Final verification: 94 focused tests passed, plus Library filter/order, queue, tempo
persistence and metronome checks. Creator save/timing tests: 8 passed; its unrelated
dialog fixture still lacks location. Chord suite after DOM Event fixture correction:
9 passed; 9 older scroll/dock fixture expectations fail against unchanged playback
source. The legacy session-selection/display fixtures also fail on restore HEAD.
These failures are not presented as passing coverage or live tablet verification.
