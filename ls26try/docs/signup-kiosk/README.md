# Physical sign-up kiosk

## Current rollout status

The application code is implemented and tested against a **local Firestore emulator**.
Production activation is deliberately locked by `signup/kiosk-policy.js`:
`rulesVerified: false`. This prevents the guest page from making any database calls
and prevents host configuration writes. It is a deployment switch, NOT an access
control. Firestore rules are the security boundary.

The repository has no complete deployed Firestore rules, Firebase deployment
configuration or backend endpoint. Firebase Console was unavailable in the work
browser (Google sign-in/network error). **Do not enable the switch until the actual
combined production rules have been reviewed and tested.** Appending a restrictive
match is not sufficient: Firestore ORs all matching allow statements.

## Existing architecture reused

- `lyricsSetlists/{id}` has `name` and `songIds` referencing `lyrics/{songId}`.
- `karaokeControl/currentSession` identifies the active `performanceSessions/{id}`.
- `karaokeControl/publicSongList` is the ordinary public song-list selection. The
  host picker initially suggests it; kiosk selection does not overwrite it.
- `karaoke/state.songsEnabled` is the existing request-open gate. Kiosk creation
  additionally requires this gate to be open.
- `publicSongRequests/{id}` is the normal queue. Admin and the shared session bar
  listen by `sessionId`. Pending kiosk requests enter this queue, and existing
  acceptance puts them into `karaokeControl/runOrder`.
- Default public/app Firebase project is `livekaraokesuite`. Kiosk control refuses
  to publish if the host has selected a different project.

## Documents and flow

1. Owner opens **LiveSuite → Requests → SIGN-UP KIOSK**. No new listeners are added.
2. Owner chooses an existing setlist and clicks **ENABLE / PUBLISH SONG LIST**.
   Only that list's songs are fetched in batches of ten, with a 500-song cap.
   Songs with `publicSongListVisible === false` are omitted. Missing records block
   publication instead of silently presenting a partial list.
3. A transaction checks owner configuration revision, current session, current
   setlist membership and the request-open gate. It writes:
   - `signupKioskAdmin/control`: private owner configuration, token, enabled,
     schemaVersion, revision, sessionId, setlistId/name, venue, displayTitle,
     updatedAt.
   - `signupKioskViews/{token}`: the same non-secret context, plus
     `songs: {songId: {title, artist}}`; **no token field**, lyrics, timing or
     customer data.
4. The kiosk GETs only its token-addressed snapshot. It filters it locally.
5. SEND REQUEST uses one atomic REST commit with **two create-only writes**:
   the existing queue request and a private `signupKioskReceipts/{requestId}`.
   The receipt contains only `token` and server `createdAt`; it cannot be read,
   updated or deleted by guests. The request does not expose the token.

A private top-level configuration is used instead of `karaokeControl/signupKiosk`
because the existing public page reads karaoke control data. Putting the active
secret in a broadly readable control document would defeat the gate.

The second write is intentional. Existing public/mobile request clients read
session requests, so placing the active token in the queue would disclose it.
Rules use `getAfter()` to validate the receipt and queue request together. Neither
can be created by itself, and `currentDocument.exists: false` prevents replay of
the same request ID. No new parallel queue is introduced.

## Exact queue schema

```js
// publicSongRequests/kiosk_<32 random hex characters>
{
  source: "signup-kiosk",
  requestType: "karaoke-song-request",
  status: "pending",
  sessionId: "<current session>",
  publicSetlistId: "<chosen setlist>",
  publicSetlistName: "Tonight",
  kioskRevision: "<snapshot revision>",
  venue: "<current venue>",
  songId: "<existing lyrics document ID>",
  songTitle: "Wonderwall",
  songArtist: "Oasis",
  singerName: "Alex", // trimmed, 1–80 characters
  note: "",           // optional, <=300 characters
  createdAt: /* server REQUEST_TIME */
}
```

Queue renderers label these records **SIGN-UP KIOSK**. No account, email, phone,
profile document, device fingerprint, local customer storage or automatic queue
acceptance is added. Plain text input does not accept angle brackets.

## Security rollout — required before using at a gig

1. Export/review the complete deployed rules for **livekaraokesuite**.
2. Merge `rules.fragment` inside the database documents match. Reuse the existing
   owner predicate. Do not substitute anonymous/public writes for owner writes.
3. Integrate `validKioskRequest()` into the EXISTING `publicSongRequests` create
   rule, reserving IDs beginning `kiosk_` and source `signup-kiosk`. Preserve the
   actual legacy public create predicate for other requests; the test harness's
   `legacy-test-client` rule is synthetic, not a replacement production rule.
4. Existing public requester update/delete grants must exclude `kiosk_` IDs.
   Retain verified host queue-management permissions. Audit all wildcard and
   duplicate matches so none bypass the kiosk checks or expose config/receipts.
5. Run the emulator suite with the **complete merged production rules** too:
   normal public request create/edit/cancel must retain intended behavior, while
   kiosk tokens, list membership, timestamps, fields and protected collections
   must remain enforced. The included isolated harness proves the new fragment,
   not any unseen existing grants.
6. Publish the reviewed narrow rules using the project's established Firebase
   process. No rules, indexes, credentials or real records were changed by this
   code deployment.
7. Only after verification, change the one `rulesVerified` flag to true, bump its
   query version in the kiosk/Requests HTML, commit, and deploy Pages.
8. Use a clearly identified test session for the first live request. No production
   test requests have been created by this implementation.

Tokens are 256-bit random values generated by the host's Web Crypto implementation.
They are a venue link gate, not user authentication or rate limiting. A person with
an active link can still submit multiple requests. Do not publish the link/QR on
a public website. Rotation revokes the old view immediately through rules. Old
snapshot documents are retained, inaccessible publicly; no automatic deletion or
migration is performed. Retired receipts can be covered by a separately reviewed
retention policy if needed later.

## Host operation after activation

1. Sign in as the existing owner, start/select the gig, and open song requests.
2. Open `/online/ls26try/requests.html` → **SIGN-UP KIOSK**.
3. Choose the request setlist, optional title, and **ENABLE / PUBLISH SONG LIST**.
4. Open the generated private link on the iPad:
   `/online/signup/sign%20up.html?k=<token>`.
5. To change songs, save the existing setlist, then publish it here. The same iPad
   URL refreshes within 60 seconds; it also has REFRESH SONG LIST. Selection is
   cleared if its song disappears. Publication keeps the token unless rotated.
6. Ending/changing the active session closes the old session's kiosk server-side.
   Re-enable/publish against the new session. No need to rotate the token just to
   choose another list or event. DISABLE prevents further writes immediately.
7. ROTATE KIOSK LINK explicitly asks for confirmation; reopen the new link on the
   iPad after rotation. Rotating a disabled kiosk does not enable it. Another host's stale configuration save is rejected.

`/online/signup/index.html?k=...` redirects to the exact requested spaced filename,
preserving the query. Neither path changes the LiveSuite application location.

## Compatibility and failures

- ES5 JavaScript syntax checked with Acorn `ecmaVersion: 5`, including the alias.
- XMLHttpRequest + JSON + plain DOM; no SDK, modules, fetch, Promise, frameworks,
  external fonts, assets or application shell. About 19 KB total uncompressed.
- Block/table layout, basic media queries, explicit hidden fallback, 52px+ buttons,
  56px inputs and 70px Send. Only 30 results initially; more on explicit request.
- Chrome tested at 375, 768 and 1024px. This is **not a real iOS 9 test**. Old Safari
  HTTPS/TLS/certificate trust for both GitHub Pages and Google REST still needs
  checking on the actual iPad. JavaScript cannot fix an obsolete TLS trust store.
- Success is shown only after a complete successful commit response. PII clears
  immediately; the form returns after four seconds and reloads the snapshot.
- If a response is lost, the request might have committed: show REQUEST NOT
  CONFIRMED and ask the host to inspect the queue. No automatic re-send/new ID.
  Refresh asks for explicit confirmation before clearing that uncertain attempt.
- Load errors show NO CONNECTION / PLEASE ASK THE HOST and RETRY. An invalid token
  or ended session shows SIGN-UP UNAVAILABLE. No fabricated offline success and no
  persistent offline queue containing customer details.
- Timers stop on hidden/pagehide. No background realtime subscription.

## Operation budget

| Action | Client operations |
|---|---|
| Open ordinary Requests page, never open kiosk controls | 0 additional kiosk calls |
| Open host kiosk controls | 1 private config read + existing setlists query |
| Publish host snapshot | selected list read + N selected song reads; transaction reads config/session/list/request gate; 2 document writes |
| Guest load/manual refresh/visible 60-second refresh | 1 snapshot GET, plus rule-dependent config/session reads |
| Typing/search/select/edit | 0 database operations |
| Send | 1 REST commit, 2 document creates; rule-dependent validation reads |
| After success | 1 snapshot GET |
| Disable | 1 config transaction read + 2 document writes |
| Play/metronome/song timing | unaffected |

Rule-dependent reads are billable too and can be cached within rule evaluation.
Submission rules access config, session, open gate, snapshot and the atomic
request/receipt pair. Do not describe this as a zero-read submission or one write.
The kiosk does not read the request queue or listen to any collection.

## Repeatable verification

Install tools in an isolated directory, not this application's dependencies:
`firebase-tools@13.35.1`, `@firebase/rules-unit-testing@3.0.4`, `firebase@10.14.1`,
`acorn@8`. Set `LS26_KIOSK_TEST_MODULES` to its `node_modules` directory.

- `node --test ls26try/tests/signup-kiosk.test.cjs`
- Start the Firestore emulator at **127.0.0.1:8188**, project **demo-ls26-kiosk**.
- `node ls26try/verification/signup-kiosk-rules.cjs`
- In that same emulator run, execute
  `node ls26try/verification/signup-kiosk-browser.cjs` with
  `LS26_PLAYWRIGHT_MODULES` and `LS26_CHROMIUM` pointing to installed Playwright and
  Chromium. All external browser traffic is intercepted; only local emulator
  records are created. Optional `LS26_BROWSER_OUTPUT` saves a test screenshot.
- `node --test ls26try/tests/*.test.cjs` also needs `LS26_TEST_NODE_MODULES` pointing
  to the existing DOM-test dependencies.

New focused tests: 10 unit checks, 30 emulator checks, tablet/browser guest and
host flows. Existing suite: 166 tests, 134 pass, the same 32 pre-existing failures
as the prior baseline; no new failing test names. The old queue verification
script separately lacks a `CustomEvent` mock; the real-browser acceptance test
covers the unchanged queue workflow instead.

During browser integration, a pre-existing pending-queue fallback called undefined
`toDate(raw)` instead of its own `tsDate(raw)`. Missing timestamp values caused
repeated render errors. The focused one-call correction and regression test are
included; no Singer Screen, chord/timing or metronome behavior was changed.
