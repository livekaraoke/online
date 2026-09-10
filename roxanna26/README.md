# Roxanna26

Upload this complete folder beside `billylee26/` in your website root. Open
`roxanna26/index.html`. No build or installation is required. The existing
`roxanna/`, `billylee26/` and LiveSuite folders are not changed.

The existing Roxanna logo, band photos, cross-fading hero, gold/black colours and
serif headings are retained. The structure follows BillyLee26: next/live gig,
live request player, named requests and status tracking, full gig details,
photos/lightbox, video player, about section and booking enquiry form. Roxanna's
full repertoire browsing, popular-song preview, share and social links remain.
Requests are now submitted one song at a time, like BillyLee26, with a confirmation
step and a per-session My Requests list. The footer links to `../billylee26/`.

## LiveSuite data

- Firebase selection is copied from your current Roxanna `db/currentdb.js`.
- Upcoming events query `type` values Roxanna / ROXANNA / roxanna only.
- Live status requires the currentSession pointer and an active Roxanna
  performanceSessions document. Unknown/conflicting types fail closed.
- Run Order must have the exact matching sessionId. Its listener exists only
  while a verified Roxanna session is active. Other acts never appear as live.
- Requests require `karaoke/state.songsEnabled === true`. A transaction rechecks
  the current session, its act, request gate and queue before writing one request.
- Requests are marked source `roxanna26`, type/performerType/project `Roxanna`,
  with the active session ID and dedicated public setlist metadata.
- Booking enquiries go to the existing bookingEnquiries collection and are marked
  type/performerType `Roxanna`, source `Roxanna Website`, sourceKey `roxanna26`.

## Repertoire and optional media

Your existing Roxanna configuration selected a Lyrics Suite setlist named
`Roxanna`; this remains the default. Case variants ROXANNA and roxanna work too.
If there are duplicate names, set `repertoireSetlistId` in `js/config.js` to the
intended Roxanna list's document ID. Only songs in that list are read. Explicitly
hidden songs are excluded. There is no full-library or shared Solo/Karaoke list
fallback. An explicit configured ID is an administrator's Roxanna-list mapping;
choose a Roxanna list, not another act's list.

Roxanna video URLs were not supplied, so Watch & Listen displays “Videos coming
soon.” Add Roxanna YouTube URLs/IDs to `videos` in `js/config.js` to activate the
existing player and gallery. Digital tips stay disabled until tipUrl is set.
No Billy Lee photos, videos or solo marketing copy were copied into this site.
The Instagram URL was corrected from www.instagram/roxanna.mt to
www.instagram.com/roxanna.mt/; external account ownership was not verified.

## Reads and writes

No polling or timer writes. Two shared status-document listeners and one
Roxanna-only event query are used. A session and queue listener are attached only
when needed, and detached on session change. Tracked-request listeners are limited
to this browser's current-session IDs while the request dialog is open; queue
updates do not recreate them. The dedicated repertoire is cached/coalesced for
the page lifetime and fetched in document-ID chunks, never as the whole lyrics
collection. Venue details are cached. Only explicit requests and enquiries write.
A request preflight costs four document reads plus one request write, subject to
Firestore transaction retries. Clock/slideshow updates are local only.

## Verification and limits

Node syntax, required DOM IDs, local assets and anchor references passed.
Run `node verification/isolation.cjs` for fixture checks covering act isolation,
foreign queue rejection, cached repertoire reads, requests closed, a remote
session switch during submission, listener reuse/cleanup and Roxanna bookings.
These checks do not access Firebase. Live Firebase permissions/indexes, browser
rendering and external links have not been tested. The site reuses your existing
public read/create permissions; no rules or database migrations are included.
Client-side filtering is not a replacement for Firestore access rules.

Before using at a gig, start a Roxanna session, open requests, submit a test song,
confirm it in LiveSuite, and check My Requests. Then switch to a Solo session:
Roxanna26 must show no active session and disable requests. Confirm a Roxanna
booking enquiry appears in Admin. All uploaded images are included locally.
