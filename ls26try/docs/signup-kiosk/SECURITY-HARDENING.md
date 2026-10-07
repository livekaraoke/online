# Shared Firestore security hardening for the sign-up kiosk

## Why the kiosk is still locked

The kiosk implementation itself passed the isolated emulator checks, but testing
against the current rules shape exposed pre-existing anonymous write permissions
that can bypass a kiosk-only match. Firestore grants an operation when **any**
matching `allow` expression is true; a restrictive match later in the file does
not cancel an earlier broad `allow read, write: if true`.

Known broad-write areas from the current rules/audit include:

- `publicSongRequests`
- `lyrics`
- `karaokeControl`
- `performanceSessions`
- `noteSettings`

The existing nested `lyrics/{songId}/musicalTiming/{timingId}` owner-write rule is
already the desired model and should remain.

The production switch in `signup/kiosk-policy.js` therefore remains
`rulesVerified: false`. Do not change it merely because the Pages code exists.

## Public request ownership migration

Anonymous requesters do not have Firebase Authentication identities. Request IDs
are visible to public request/history clients, so knowing an ID cannot safely be
treated as ownership.

New BillyLee26 and LiveKaraoke26 requests now use a private per-request capability:

1. The browser generates a 256-bit random token with Web Crypto.
2. One Firestore batch creates:
   - `publicSongRequests/{requestId}` — unchanged public request payload.
   - `publicSongRequestOwners/{requestId}` — private `{token, createdAt, proofAt}`.
3. The token is stored only in that browser's localStorage under
   `ls26.publicRequestCapability.<requestId>`.
4. A requester note edit/cancellation atomically updates the request and refreshes
   `proofAt` in the private companion document with the unchanged token.
5. Firestore rules can then allow the narrowly permitted update only when the
   private proof is valid and fresh.

The token is never stored in `publicSongRequests`, so public queue/history reads do
not disclose it. `publicSongRequestOwners` must never be anonymously readable.

Other existing public request clients that only create requests do not need the
capability shim. Their creates remain compatible with the normal public-create
validator in the merge fragment. They simply cannot anonymously edit a request
unless they later adopt the ownership capability.

## Repository-side work already staged

- `billylee26/js/firebase-config.js` wraps only `publicSongRequests` add/set calls
  with the private capability batch. Other collections retain their existing SDK
  behavior.
- `livekaraoke26/js/firebase-config.js` has the same behavior. Its existing
  Live Karaoke adapter composes on top of this wrapper.
- `ls26try/tests/public-request-capability.test.cjs` verifies atomic create,
  capability-backed edit, pre-cutover fallback and unrelated-collection behavior.
- `security-hardening.fragment` contains the merge-oriented rule shape for:
  - normal public request create validation
  - capability-backed requester update/cancel
  - private owner companion documents
  - kiosk request/receipt/view validation
  - owner-write hardening for host-controlled collections

## Production merge requirements

The repository still does **not** contain the complete deployed Firestore rules
file, `firebase.json`, `.firebaserc`, or a rules deployment workflow. The complete
production rules must therefore be copied/exported from Firebase Console before
activation.

When merging:

1. Keep the existing `signedIn()` / `isOwner()` implementation. The current owner
   predicate uses the signed-in token email and must remain the source of owner
   authority.
2. Replace broad anonymous write grants for host-controlled collections; do not
   append a second restrictive match and assume it overrides them.
3. Replace the broad `publicSongRequests` write rule with the branch in
   `security-hardening.fragment`.
4. Add `publicSongRequestOwners`, kiosk admin/view/receipt rules and the kiosk
   validation helpers.
5. Preserve unrelated validated public workflows such as website reviews,
   booking enquiries, reminders and requester profiles. Do not replace those
   predicates with a blanket owner-only rule unless their public flow has been
   deliberately retired.
6. Run the emulator against the **complete merged rules file**, not only an
   isolated fragment.
7. Verify both positive and negative cases before publishing rules.
8. Only after the deployed rules pass should `signup/kiosk-policy.js` be changed
   to `rulesVerified: true`.

## Required verification matrix

### Normal public requests

Allow:
- create a well-formed request for a real song
- create through the existing BillyLee26/LiveKaraoke26 request UI
- owner queue updates
- new requester note edit with the correct private capability
- new requester cancellation with the correct private capability

Deny:
- malformed request creation
- creating a request with host result/approval fields pre-populated
- editing somebody else's request
- changing song/session/requester identity during requester edit
- anonymous request deletion
- reading `publicSongRequestOwners`
- capability replay against another request ID

### Kiosk

Allow:
- current token GET of its single published view
- valid paired kiosk request + receipt create while session/request gate is open
- owner enable/disable/rotate/publish actions

Deny:
- wrong/expired token
- list of kiosk views
- receipt read/update/delete
- kiosk request anonymous edit/delete
- disabled kiosk
- ended/changed session
- closed song requests
- song not present in published kiosk snapshot
- malformed/extra kiosk fields

### Host-controlled data

Anonymous/public clients may retain the reads required by the public sites, but
must not create/update/delete:

- `lyrics` song documents
- `lyricsSetlists`
- `karaokeControl`
- `karaoke`
- `performanceSessions` or their host activity subcollections
- `noteSettings`
- `liveLyrics`

Owner/Admin operation must continue to work.

## Rollout order

1. Obtain the exact current production Firestore rules.
2. Merge the hardening fragment into that exact file.
3. Emulator-test the complete rules.
4. Publish rules.
5. Confirm ordinary public requests and owner LiveSuite still work.
6. Flip `signup/kiosk-policy.js` to `rulesVerified: true` and cache-bust the kiosk
   policy references.
7. Publish the kiosk setlist from LiveSuite Requests.
8. Test one clearly identified kiosk request before using the iPad with guests.
