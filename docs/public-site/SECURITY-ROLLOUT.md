# Public enquiry security rollout

The public root is a static GitHub Pages site at https://livekaraoke.github.io/online/.
The repo contains no firebase.json, deployed Firestore rules, Functions package,
service account or Firebase CLI deployment identity. The shared Firebase project
selector defaults to livekaraokesuite, with livekaraokemt also selectable.

## Implemented fallback

The form preserves bookingEnquiries and its existing admin-compatible document
shape. It validates required values, types, lengths, email, event types and guest
counts. It rejects markup/control characters, trims strings, uses a fixed canonical
pageUrl (no URL query data), and writes server timestamps. Its honeypot and in-page
60-second success cooldown are UX/spam deterrents, not server security boundaries.
No private submissions or tokens are logged. There is no per-IP rate limiting.

## Rules: manual merge required

1. Export the CURRENT rules from Firebase Console before editing. They were not
   available in this repo and have NOT been changed remotely by this pass.
2. Merge booking-enquiries.rules.fragment into the documents scope. Replace the
   old anonymous bookingEnquiries creation grant with validLiveKaraokeEnquiry().
   Keep the actual existing staff-only permissions and independently validated
   other public form sources. Do not overwrite unrelated collection rules.
3. Remove any broader grant that lets anonymous users read/update/delete private
   enquiries or create arbitrary enquiry documents. Overlapping `allow` rules are
   ORed: a restrictive match cannot override a permissive wildcard or another
   matching allow. Check EVERY matching rule, including global recursive matches.
4. If other public forms share bookingEnquiries, retain their separately validated
   create predicates in the existing match. This fragment alone only accepts
   Live Karaoke submissions; it must not replace their validated predicates.
5. Emulator-test with the actual merged rules: valid Live Karaoke create succeeds;
   unexpected fields/oversized data/wrong source/status/timestamps/bad types fail;
   anonymous get/list/update/delete fail; verified staff still work; unrelated app
   paths and other public enquiry sources retain their existing access.
6. Publish merged rules in the correct Firebase project(s). This is necessary for
   server-enforced validation; client validation alone cannot restrict direct API
   calls. Firestore rules do not provide per-IP rate limiting or total spam quotas.

## App Check: manual configuration required

1. Create a score-based reCAPTCHA Enterprise web SITE key for the production domain
   livekaraoke.github.io (and any other real production domains). No localhost in
   the production key. Register each Firebase web app with the Enterprise provider.
2. Put each PUBLIC SITE key in js/public-enquiry-config.js under its project ID.
   Never commit a private reCAPTCHA secret, service account, or debug token.
3. Deploy that config. SDK initialization occurs before the root Firestore use;
   automatic token refresh is enabled. A configured form waits for a valid token.
4. Monitor Firebase App Check metrics before enabling Firestore enforcement.
   Enforcement applies to the project/service, NOT just this form or collection.
   First register/integrate every legitimate client of that service, including
   existing LiveSuite, request screens and other sites. Those clients were outside
   this task and were not modified. Do not enforce until they are ready.
5. Enable Cloud Firestore App Check enforcement and confirm real browser traffic.

Blank keys deliberately leave the existing form operational. App Check is NOT
active until a real key is configured; attestation is NOT enforced until the
console switch is enabled. Rules and App Check are complementary.

## Backend follow-up

True per-IP throttling requires a backend endpoint. There is no Functions
infrastructure/deployment authorization identity in this checkout, so the fallback
was used instead of redirecting the live form to an undeployed endpoint. A future
callable Function should enforce App Check, reject unknown fields/request sizes,
validate on the server, apply shared transactional rate limits, and write with the
Admin SDK. Close anonymous direct enquiry creates after every relevant form source
has migrated. Do not enable an undeployed endpoint in the production client.

## Deployment

Commit/push these root changes to the GitHub Pages publishing branch (main).
Rules/App Check console changes are separate; pushing HTML does not deploy rules.
No unrelated Firebase collection, admin interface or data model was changed.

## Event compatibility

public-event-time.js prioritizes Date/Firestore Timestamp or offset-qualified ISO
instants in startAt/startTimestamp/start and endAt/endTimestamp/end. Legacy date,
startTime, endDate and endTime are interpreted in Europe/Malta via Intl timezone
data. No UTC or permanent +02 offset is assumed. Missing endTime stays unspecified;
an earlier endTime without endDate rolls into the next Malta calendar day. A DST
gap yields no instant; a repeated autumn local time uses the earlier occurrence.
Use an explicit Timestamp to select the later occurrence. No stored events were
rewritten. Live Now remains controlled by the existing live-session documents,
not inferred from a scheduled clock time. Past ended dates are removed from the
upcoming list; same-day events without an end retain the existing "starting now"
behaviour. JSON-LD uses UTC ISO instants, displayed times explicitly use Malta.

## Official references

- https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- https://firebase.google.com/docs/firestore/security/rules-structure
- https://firebase.google.com/docs/firestore/security/rules-fields
