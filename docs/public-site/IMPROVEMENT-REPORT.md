# Public Live Karaoke focused improvement pass — 6 October 2026

Production URL verified by the existing admin return link and a successful HTTP
response: https://livekaraoke.github.io/online/. No CNAME/custom domain was found.

## Files

| File | Change |
| --- | --- |
| index.html | AVIF/WebP/PNG picture; visible single H1; description/canonical/Open Graph/X metadata; Organization and event JSON-LD; booking cards and nine native FAQ accordions; enquiry validation, busy/double-submit/cooldown/error handling; App Check bootstrap; automatic year; relevant image/focus/form accessibility; Malta event display/order/countdown integration |
| css/style.css | Responsive cards/FAQ and restrained red accents; hero H1 sizing; modern background image delivery; form sizing/focus states and hidden success/form state handling |
| css/live-karaoke-public-refresh.css | Preserve the existing hero background but use AVIF/WebP with PNG fallback |
| img/banner.webp; img/banner.avif | Optimized derivatives at original 1774 × 887 resolution; original banner.png unchanged |
| js/public-event-time.js | Timestamp-first event instants; DST-aware Europe/Malta conversion for legacy local fields; overnight end handling; consistent formatting/order |
| js/public-enquiry-config.js | Public Enterprise site-key slots per existing Firebase project, blank until console registration |
| js/public-app-check.js | Initialize Enterprise App Check before root Firestore access when a site key is configured, automatic token refresh |
| docs/public-site/booking-enquiries.rules.fragment | Strict server-side schema/type/length/allowed-key/timestamp validation for root enquiries; no anonymous read/update/delete grants |
| docs/public-site/SECURITY-ROLLOUT.md | Exact safe merge, App Check setup, shared-client enforcement and backend limitations |
| verification/public-site/event-time.test.cjs | Winter/summer/DST/overnight/Timestamp/visitor-timezone checks |
| verification/public-site/browser.test.cjs | All six viewport sizes, hero/navigation/FAQ/form/live states/countdown/order/schema/fallback/error checks; writes intercepted |
| verification/public-site/rules.test.cjs | Demo Firestore emulator tests for valid and invalid submissions and private-data restrictions |
| docs/public-site/IMPROVEMENT-REPORT.md | This report |

## Images

| Format | Bytes | Decimal size | Reduction from PNG |
| --- | ---: | ---: | ---: |
| Original PNG (retained) | 1,937,905 | 1.94 MB | — |
| WebP, quality 90 | 162,926 | 163 KB | 91.6% |
| AVIF, quality 70, 4:4:4 chroma | 106,438 | 106 KB | 94.5% |

Hero is eager, high priority and async decoded, with explicit dimensions and
responsive CSS. Below-fold images are lazy. Social previews reuse the original
branded PNG for crawler compatibility. Original logo, mic, typography, neon slogan
and identity remain intact; no generative image changes were used.

## SEO and event timing

One visible H1: LIVE KARAOKE IN MALTA. Useful Malta/guitar/looping/event description,
canonical production URL and complete social metadata added. Organization schema
uses existing brand/social URLs only. Event schema comes from the SAME existing
upcomingEvents listener and visible event list; no duplicate data collection.
Only future live-karaoke events with a known start time and venue are marked up.
No invented addresses, ratings, offers or events. JSON-LD instants use ISO UTC;
human-facing dates/times explicitly use Europe/Malta. Invalid DST gap times are
rejected; autumn repeated times use the earlier occurrence unless a Timestamp
specifies otherwise. Existing live-session control remains authoritative for Live
Now and song access. No stored event documents were migrated.

## Security and remaining manual steps

There was no Functions infrastructure or deployed Firestore rules in this repo.
The approved fallback was implemented. The form still writes to bookingEnquiries;
its document shape and admin integration are preserved. Client validation,
honeypot, busy guard and local cooldown do NOT replace server protection and do
NOT provide true per-IP rate limiting. No private enquiry data is logged.

The rules fragment is emulator-tested but NOT published to production. Its merge
must use the actual existing rules/admin predicates and preserve separately
validated other form sources. Remove overlapping permissive grants; adding a
restrictive match cannot override them. App Check SITE keys are intentionally
blank, so App Check is NOT active/enforced yet.

Required: export/merge/test/publish current rules; register the web apps with
reCAPTCHA Enterprise; fill their public site keys; deploy config; monitor metrics;
only enforce Firestore App Check after ALL clients sharing that service have
App Check integration. Enforcement before that point could block LiveSuite and
other existing clients. See SECURITY-ROLLOUT.md for steps and official sources.
True per-IP limiting requires a backend follow-up. No undeployed endpoint was
introduced and no private credentials were committed.

## Validation

Passed Chromium checks at 1920×1080, 1366×768, 1280×800, 1024×768, 390×844 and
360×800: original hero branding, modern image and PNG/WebP fallback loading,
navigation, keyboard FAQ operation, form success/error/validation/double submit,
configured App Check success/failure branches, current/next songs, live/break/end
states, request controls, event ordering, Malta countdown, JSON parsing, one H1,
canonical metadata, unique IDs, no local missing assets, no JS page errors and no
horizontal overflow. Form and live-state checks use controlled fixtures; no test
enquiry was written to production. Real public Firestore reads succeeded for
upcomingEvents (20 documents), karaokeControl/currentSession, karaokeControl/runOrder
and karaoke/state. This does not claim a completed real-event live performance or
production App Check/rules enforcement test.

Timezone tests passed with Europe/London, America/New_York and Australia/Sydney
visitor timezones. Demo emulator accepted a valid enquiry and rejected 20 invalid
payloads, anonymous reads/lists/updates/deletes and arbitrary collection writes.
The actual merged production rules still require regression checks with existing
staff access and other app sources. Inline JS parses; git diff whitespace checks
pass. Screenshots inspected for desktop/mobile layouts.

## Deployment and scope

Only root public assets, root-only helper scripts and scoped docs/tests changed.
GitHub Pages publishes main. HTML/CSS/JS publishing does not deploy Firebase rules
or create App Check registration. No changes to LyricSuite, ls26try, BillyLee26,
Roxanna, request popup implementation, admin interfaces, shared Firebase selector,
unrelated collections or the original banner source. No framework, new prices,
fake events, ratings or unrelated refactoring.
