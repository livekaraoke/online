## Visual correction — visual2

Library now uses a dedicated stylesheet and inline filters matching the supplied reference. Navigation and session share a sticky wrapper; the session panel expands to a taller scrollable area. Song actions, transpose drawer and logos were corrected. Library filtering stays local and row Queue uses an active-session transaction. URLs work when the folder is named `ls26try` as well as `ls26`.

Replace files using the accompanying upload guide. No Firebase configuration replacement or database migration is needed for this visual patch. Existing Song Inbox rules requirements still apply. Browser rendering has not been verified, so exact visual equivalence is not certified.

# LiveSuite LS26

Implementation package based on the supplied `livesuite(1).rar` archive. Upload the **ls26 directory** alongside the existing livesuite directory in your GitHub Pages repository. Open `ls26/index.html` (or `/online/ls26/index.html` when the repository is served under `/online/`). No build step is needed. Keep the old livesuite directory available during acceptance testing.

## Verification status

This is an implementation candidate, not a certified gig-ready release. JavaScript syntax, local routes/assets, and isolated data/workflow tests were checked. Browser access to the local preview was rejected by automatic approval review; visual matching, real tablet layout and complete browser regression testing are **not verified**. No live Firebase data was read or changed during development. Live authentication, rules, composite indexes, and recipient-side display of request reasons require testing on your project.

The approved mockups guide the dark blue theme, compact one-row Session Bar, five-tab panel, lyric metadata/tools, side drawer and large performance controls. Exact pixel equivalence is not claimed without visual testing. Existing renderer CSS is retained where needed for lyrics, guitar tabs, editor, and admin compatibility.

## Entry points

- `index.html`: mode launcher — Host / Venue / Singer / Player / Lyricsuite. No Firebase reads or writes. Host opens Admin; Lyricsuite opens Library directly.
- `library.html`: Library selected. The Admin dashboard also links here.
- `host/lyricsviewer.html`: compatibility entry to the same Library engine.
- `host/lyricview.html?id=FIRESTORE_SONG_ID`: lyric performance view.
- `library.html?view=setlist`: Library filtered to session setlist IDs, session-selected setlist, or current public setlist. It shows an empty result if none is selected, never silently all songs.
- `requests.html`: current session requests using the shared session engine.
- `song-inbox.html`: management, popularity, status, pagination and Creator handoff.
- `admin-new/admin.html`: existing admin dashboard with LS26 colours and navigation. Gear and Host Mode open this page.
- `venue.html`: karaoke lyric screen plus clearly disabled future Request Form / Venue Display destinations.
- Singer Mode opens only the existing karaoke lyric screen (no injected host controls).
- `player.html`: explicitly planned future destination.

Mode links are navigation, not a replacement for Firebase authorization. The existing admin authentication remains in place. Direct URLs must still be protected by your Firestore rules.

## Performance behaviour

The Session Bar is one horizontal row. Expanded content has five tabs with browser-persisted selection. The metadata/karaoke block sticks below the headers until the second rendered lyric section reaches that area. Play starts the existing performance-recording workflow and auto-scroll. Pause stops scrolling only; it does not pause the song's run-order status. Previous/next controls move between lyric sections. `Next song ↓` pauses scrolling and jumps to the end cards; `PLAY NEXT SONG` finalizes a started song, opens the next one and starts it.

Transpose opens by default when a song loads and closes when it starts. Chord/tab transposition reuses the supplied algorithms. Current BPM adjustments are stored for the current browser tab, with no database write; original BPM remains unchanged. Existing guitar-tab transposition clamps negative frets to zero, as before: alternate voicing selection is not newly implemented.

End-of-song lists reuse the same snapshots and actions as the top panel. Current/latest played song is retained and highlighted. Pending requests use Accept / Abandon / Reject, and request reasons are written to the existing `publicSongRequests.reason` field. This is not a new SMS/email/push service. The requester frontend was not included, so delivery/display on that frontend cannot be verified.

End Session routes through the existing authenticated Admin confirmation and archive workflow rather than duplicating event/archive logic in the lyric page. Break/Resume uses the existing session writer with confirmation.

## Song Inbox

Quick capture records title, optional artist/requester, device timestamp and available active session/venue. Normalized title + artist determines one SHA-256 document ID, and a transaction increments the count. Case, accents and punctuation do not create duplicates. Different/missing artist information can still produce separate entries; there is deliberately no fuzzy merging of potentially different songs.

Captures are saved locally before the transaction. Failed/offline captures remain visible in the management page's retry count. Retry is explicit. Each document retains 20 recent occurrences and 40 capture IDs; the total counter is unbounded. Retrying the same retained capture ID is idempotent. A very old stale draft whose ID has aged out of the last 40 IDs can count again.

Management loads 50 items at a time, most requested first. Search/status filters apply to loaded results; use Load more for older results. Statuses: New, To Learn, Added, Skip. Open Creator prefills title/artist; mark Added after the song is successfully saved. No automatic claim of a successful library addition is made.

## Firebase setup

See `FIREBASE-SETUP.md` before live use. The archive did not include security rules. New `songInbox` access may be denied until an appropriate host-only rule is merged and deployed. The default selected project and existing browser project selector are retained. Admin now uses the same selector as the host views.

Firebase web configuration is retained from your archive. It is not a service-account credential. Do not add service-account keys to this client-side directory.

## Quota controls

- Library songs, setlists and event-fallback reads use a shared in-flight promise and a **15-minute, per-tab, project/user-scoped cache**. Refresh Library explicitly invalidates songs/setlists. Opening the editor invalidates the corresponding cache. Other devices' changes may need Refresh Library.
- No new listeners for end cards or the Requests mirrors. Existing session/request/run-order listeners remain authoritative.
- Event fallback uses a cached one-time read instead of a permanent full-collection listener.
- Clock, elapsed time, scroll position, transposition and navigation do not write Firestore.
- Session/song notes wait five seconds after typing. Session drafts survive navigation locally. Restored drafts show an unsynced notice; edit them to retry saving.
- Scroll-speed writes are debounced 1.2 seconds. Navigating sooner may lose that last preference change, but not song data.
- Automatically observed notifications use a bounded local journal instead of writing activity logs from every browser. Existing historical session logs remain readable.
- Request acceptance is atomic/idempotent. Reordering is transactional and keeps the current/completed song fixed.
- Inbox management uses one-time pages, not a real-time collection listener.

These changes reduce avoidable work but cannot guarantee the free quota. Initial collection sizes, other devices, original admin listeners, reconnects and security-rule dependent reads still count. Offline Firestore persistence has not been added; local draft/cache storage is distinct from Firestore persistence. Check Firebase Usage for actual totals. Official billing reference: https://firebase.google.com/docs/firestore/pricing

## Future themes and maintenance

`shared/theme.css` owns new colour/spacing/asset tokens. `--ls-logo` selects the supplied branding image. `LS26.themes` in `shared/shell.js` is the asset manifest seam. Blue is implemented; red/black, pink and monochrome are future themes, not incomplete selectable options.

Read `FUNCTIONS.txt` before changing functionality. Keep additions in their owning modules; edit existing declarations instead of adding repeated override blocks. Add a dated change entry and verify call sites before removing a function. Preserve all older functionality until its replacement passes real regression checks. File headers carry copyright and purpose; original copyright notices are retained.

## Known inherited external links

The supplied archive references Note Keeper, Song Meta/Metronome and an older venue lyric book that are not included in that archive. Those original external tool dependencies have not been recreated. Library, lyric view, creator, setlists, karaoke screen and the bundled admin pages are included. Do not delete the existing livesuite installation until these external destinations are reconciled.

## Isolated tests

With Node installed, from this directory:

```
node verification/data-and-inbox.cjs
node verification/queue-workflows.cjs
```

These use in-memory fixtures only and never contact Firebase. They do not replace real-browser testing or concurrent emulator/security-rule testing.
