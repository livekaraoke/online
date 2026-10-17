# Best Next / venue rotation — 17 October 2026

Implementation is committed for the existing app, not a new application or queue.
Live/tablet acceptance remains with the owner; browser verification is not claimed. Public-site
`_config.yml` exclusions are deliberately unchanged. Correct host supplied by the
owner: https://livesuite.livekaraoke.eu/ls26try/ .

## Existing architecture inspected

- `lyrics` document IDs are canonical song IDs (`firebaseId` in Library); raw
  fields survive normalization. Current editor/viewer use title, artist, BPM,
  key, year, sections and notes. Library supports genre/genres when present.
- Session startup selects an event and copies its venue string into
  `performanceSessions/{id}` and `karaokeControl/currentSession`. Venues are
  managed separately by the existing events/admin UI; historical identity is
  the stored venue name. This feature trims/case-normalizes names, not fuzzy
  matches or destructive migration of venue records.
- Playback records `performanceSessions/{id}/performedSongs` at song start with
  song ID, title, artist, timestamp, request association and performance BPM.
  Run Order tracks queued, playing and played states. Pause isn't a new play.
- End-session archiving copies played songs, legacy performance logs, requests
  and final Run Order into the parent session document. Analytics reads these
  snapshots and can load older subcollections on demand. Recommendations use
  the snapshots, without triggering that per-session fallback.
- Saved setlists (`lyricsSetlists`) describe planned repertoire, not proof of
  a performance. Existing Library scopes/search/setlists remain in effect.
- Energy, reliabilityScore, venueFit, crowdFunction and setPosition appear in
  legacy bundled song lists. They are not imported into this feature or joined
  speculatively to current Firestore songs. Live records were not inspected
  because the protected host could not be opened.

## Added controls and use

1. Open LiveSuite and sign in through the existing host flow. Select/start a
   venue session normally. Its venue automatically controls recommendations.
2. In Library, the rotation dropdown offers ALL, BEST NEXT, FRESH HERE,
   RECENT HERE (includes TOO SOON), and NEVER PLAYED HERE. These intersect all
   existing search/artist/key/genre/setlist filters. BEST NEXT is explicitly ranked. Other rotation filters retain Title A–Z
   unless Recommended is explicitly selected. Title A–Z exits the ranked view;
   Clear filters resets rotation to ALL and sorting to Title A–Z.
3. Open a song in LyricView and use existing Play/finish controls normally.
   Current-song and recorded/playing/played songs cannot recommend themselves.
4. Expand the session/status area and select RUN ORDER. BEST NEXT appears
   directly below ADD SONG / ADD REQUEST and above the entries, including when
   the queue is empty. The card shows title, score, badge and one reason. USE NEXT
   queues the suggestion; SHOW 5 opens the existing recommendation panel. Library
   retains its BEST NEXT button. The panel closes with X or Escape. No separate
   BEST NEXT strip or end preview is added to LyricView.
5. USE NEXT promotes an existing queued song (preserving its requester) or
   inserts a new entry before the first queued item. Playing/completed entries
   remain in place. It uses the existing Run Order transaction; it does not
   auto-start playback. Continue using existing Run Order/next-song controls.
6. Intent options are BEST NEXT, TEMPO UP, KEEP TEMPO and TEMPO DOWN. They use
   BPM and never claim to measure crowd energy. Unsupported energy/singalong/
   big-finish modes are deliberately absent.
7. INFO & TOOLS contains Venue History: count, last venue-gig distance, date,
   recorded requests/completions/abandonments and global count/date.
8. Without an active session, the panel allows choosing a recorded venue for
   planning. During a session the venue follows the session and cannot be
   independently changed in the recommendation panel.

## Badges and exact scoring

The latest ended venue session is **1 gig ago**, even if last night. Distance
counts ended recorded gigs, including gigs in which that song wasn't played.
Current/open sessions do not enter this historical distance.

| Badge | Default rule |
| --- | --- |
| TONIGHT | Current performed-song record or Run Order playing/played/completed/start timestamp |
| TOO SOON | Last played 1 venue gig ago |
| RECENT | Last played 2 venue gigs ago |
| READY | Last played 3–4 venue gigs ago |
| FRESH | Last played 5+ venue gigs ago, or no play found in recorded venue history |
| UNKNOWN | No selected venue or unavailable history |

“Never played” always means **in recorded history**. Incomplete archives are
labelled. Missing archives do not cause subcollection queries or crashes.
Numbered/symbol-leading entries follow the current Library's personal-note
classification and are excluded from performance filters/recommendations.

Actual base weights: freshness **55**, requests/outcomes **20**, flow **20**,
global neglect **5**. Each component ranges from zero to one:

- Freshness: unseen = 1; otherwise clamp((gigsAgo − 1)/(freshAfter − 1),0,1).
- Requests: no requests = neutral 0.5; otherwise min(1, 0.5 + 0.05 × min(requests,5)
  + 0.05 × min(completedRequests,5) − 0.1 × min(abandonedRequests,3)). Rejected,
  deleted and cancelled requests don't count as demand. Completion is not a
  crowd-success rating and free-text comments are not sentiment-scored.
- Flow: no previous/current song = 0.5; same known artist = 0.2; different = 0.8.
  If both BPM values exist, average that with tempo fit: within 20 BPM = 1,
  otherwise 0.4. Tempo-up/down give 1 for the desired direction within 30 BPM,
  0.6 beyond 30, zero in the wrong direction; keep-tempo uses
  max(0,1 − abs(BPM difference)/25).
- Global: clamp(days since last recorded global play/90,0,1); unknown = 0.5.
- Normalize available components to 100; subtract **18** for same artist and
  **15** for previous-venue-gig songs. Clamp/round to 0–100. If venue history
  is unavailable, omit freshness and normalize remaining weights.
- Exclude tonight, current open song and personal notes. Ties sort by title
  then authoritative ID. Live-history listener failure pauses recommendations
  until reload rather than risking an unrecorded repeat.

Fresh-after is configurable in the panel: **3 / 5 / 8** venue gigs, remembered
per Firebase project/user in this browser. READY starts at 3 unless fresh-after
is also 3. Weights, ready threshold and penalties live in `DEFAULTS` in
`shared/song-rotation.js`. No weight editor or invented reliability/venue-fit
score has been added.

## Firebase and performance impact

No new collections, schema, rules or indexes. Existing reference-song cache is
reused (`LS26Data`/`sessionTools.ensureSongs`). One `performanceSessions.get()`
loads archives: N returned documents cost approximately N reads, not one read.
The compact archive cache lasts six hours in project/user-scoped sessionStorage
and is reused across Library/LyricView navigation. A new session ID or explicit
Refresh/Retry History causes a reload. No timer polls historical data.

One listener on the current session's existing `performedSongs` subcollection
provides cross-device updates and survives Run Order removal. It is detached on
session change, sign-out or page exit. Initial listener reads scale with songs
already played tonight; subsequent record updates are ordinary Firestore
listener reads. There are no per-song history queries. Panel open, sorting,
venue selection, intent changes and scoring perform **zero** database reads.
USE NEXT makes the existing one-document Run Order transaction.

This is additional bounded work, not a claim of zero cost or measured Firebase
production usage. Cache write failure falls back to memory for the current page;
subsequent navigation can reread archives. Six-hour history caching can miss an
archive corrected by another device; use Refresh History then.

## Verification and remaining limits

- 49 focused tests passed: new history/scoring and DOM adapter tests, existing
  performance timing and timing persistence tests.
- Existing Library filter verification and extended Run Order transactions pass.
- DOM tests exercise real new module code with in-memory fixtures: venue change,
  current-song change, Song Info, top-five rendering, USE NEXT adapter, auth
  cleanup, cache reuse and explicit refresh. Twenty panel open/close/session
  updates leave history reads at one and live listeners at one.
- Existing session/load-only suite: 5 of 10 fail identically on unchanged HEAD.
- Existing chord-playback/workspace suite: 19 of 58 fail identically on unchanged
  HEAD (including Linkedom Event/Range support and stale layout expectations).
  These are not claimed as passing regression coverage.
- Browser/tablet rendering, live Firebase permissions/data, real autoscroll/
  chord-follow regression and deployed operation are **not verified**. Browser
  access to the Cloudflare authentication redirect was rejected by automatic
  approval review. Local preview is unreachable from the separate cloud browser.
- No live test gigs or requests were created. Historical archives may be missing
  or incomplete. Old title-only records are not guessed; ID resolution falls
  back only to a unique exact normalized title+artist match. Separate sessions
  at the same venue count separately even if they occurred on one night.
- Counts may be incomplete for old records; deduplication merges identical
  song/request/timestamp records, not uncertain near-time matches.
- No crowd ratings, inferred sentiment, imported legacy tags, or estimated
  energy/reliability/singalong suitability. Those require verified current data.

Run focused tests with Node and Linkedom available via LS26_TEST_NODE_MODULES:
`node --test ls26try/tests/song-rotation.test.cjs ls26try/tests/best-next-integration.test.cjs ls26try/tests/performance-timing.test.cjs ls26try/tests/timing-persistence.test.cjs`

## LyricView restoration / Run Order relocation

Compared against e9ac3893638d3184494f5774a6bbaac461522c31. Reversed only
the subsequent layout hunks: title/stack relocation, tuning/tools flow changes,
new offset calculation, and the control rail/gutter. Removed lyricview-layout.css.
Restored baseline window scrolling, tuning/tools release thresholds and floating
controls. Retained the extensionless performance-controls route guard and the
current-song event. Engine, Library ordering, session writes and pipeline unchanged.

Run Order tooling owns tsRunOrderBestNext immediately before tsRunOrderList.
It refreshes from the existing rotation-updated event without additional reads.
58 focused engine/adapter/route/timing/baseline-restoration tests pass. These are
in-memory DOM and source checks, not live browser or tablet scroll verification.
