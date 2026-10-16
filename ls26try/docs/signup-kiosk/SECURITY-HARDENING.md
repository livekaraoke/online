# Complete Firestore rules — 16 October 2026

The complete replacement is `firestore.rules.production-candidate`. Copy its
**entire contents** into Firebase Console → livekaraokesuite → Firestore Database
→ Rules. Save a copy of the currently deployed rules first, then Publish.
Do not append it to the existing rules: overlapping allow statements are ORed.

This file is based on the complete rules supplied in this conversation and the
repository candidate. The Firebase Console's live rules cannot be inferred from
GitHub. If you have since added other collection rules in Firebase, retain those
only after reviewing their permissions; this file cannot include unseen changes.

## Coordinated rollout

1. Deploy the accompanying public request client changes on GitHub Pages.
2. Publish this full replacement rules file in Firebase Console.
3. Reload Live Karaoke and BillyLee26 request pages, including open popups/tabs.
4. Sign into LiveSuite Admin with the configured owner account before host edits.
5. Open Requests → SIGN-UP KIOSK; choose the setlist and publish it. Open the
   generated token-bearing kiosk URL on the iPad.

The kiosk switch was already enabled in repository commit c6127912a4b6a412b6ebbd57814e2685f7a531c6;
this change does not flip it again or claim that repository flags verify deployed
Firebase rules. Old open public request tabs need reloading. Between the client
and rules deployments, requester note edits/cancellations fail closed. Normal
request creation is unchanged by the new proof protocol.

## Fixed security defect

The earlier private-owner proof rule compared the token in the *resulting*
document with the stored token. Firestore merges partial updates before checking
rules, so an attacker could update only `proofAt` and inherit the secret without
knowing it. This was reproduced against the earlier COMPLETE candidate in the
local Firestore emulator, using no production data.

Owner records are now immutable to guests. Every requester edit/cancellation
atomically writes:

- the existing `publicSongRequests/{id}` patch, including a fresh `requestProofId`;
- a new `publicSongRequestProofs/{proofId}` with `requestId`, the private token,
  and server `createdAt`.

The proof must not exist before the batch, must contain the correct secret, must
refer to that same request, and must be created at the same server request time.
Proofs cannot be read, updated, or deleted by the public. Replays are rejected.
No token is put in the public queue. Existing private owner tokens remain valid;
no migration or rewrite of requests is needed. Cost remains two writes per
requester edit/cancellation. Private proofs accumulate one small document per edit;
no cleanup or production data deletion is performed.

A new request still uses one atomic batch: public request + private owner record.
Its browser key is retained before submission, so a lost response does not discard
ownership. Requests made before ownership keys existed, on a different browser,
or after browser storage was cleared can only be edited/cancelled by the host.

## Other permissions

- Songs, timing, setlists, host controls, sessions, notes/settings, events, venues
  and host queue edits require the existing owner email authentication predicate.
  Signed-in non-owner staff no longer inherit broad write permission.
- Normal guest requests require a real visible song, valid selected setlist
  membership where supplied, an active session and open request gate. Explicit
  website test sessions require the owner-controlled test-mode setting.
- New requests cannot inject arbitrary fields or host result/approval fields.
- Public request reads are preserved for the existing queue/history interfaces.
  This is not a privacy redesign of that existing public collection.
- Existing review, booking, reminder, inbox and user-profile predicates are
  preserved. Booking creation remains the user's existing public rule; a spam/
  rate-limit redesign is outside this kiosk rules change.
- Kiosk requests require the active private token, matching song snapshot,
  session, enabled state and request gate. Queue request + private receipt are
  created atomically. Guests cannot edit either after creation.

## Verification

`ls26try/verification/full-kiosk-rules.cjs` tests the COMPLETE replacement rules
in a local `demo-ls26-rules` Firestore emulator on 127.0.0.1:8188. It includes the
actual two public client initializers using the Firebase SDK against the emulator,
create/reload/edit/cancel, replay/forgery rejection, kiosk REST submissions,
closed/ended sessions, token rotation, owner permissions and non-owner rejection.
No test contacts production Firebase.

Results: 51 complete-rules emulator checks passed; 18 focused unit tests passed.
Browser/tablet visual testing was not performed for this data/rules change.
Firebase rules are supplied for manual publication, not deployed by these tests.
