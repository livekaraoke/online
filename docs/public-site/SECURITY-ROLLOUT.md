# Free-plan public-site rollout

Production is https://livekaraoke.eu/ (GitHub Pages, online/main). The private
LiveSuite mirror is a separate workflow and deployment. Firebase remains Spark.
No Cloud Functions, Blaze upgrade, payment method or paid backend is required by
this change. The project selector defaults to livekaraokesuite; /list/ still uses
the separate livekaraokemt project.

## Booking validation and cooldown

`booking-enquiries.rules.fragment` is merged into the CURRENT deployed rules,
not used as a replacement for the full ruleset. It validates the existing
bookingEnquiries schema and the three exact act/source combinations. Owner-only
management is preserved. Public reads/updates/deletes remain denied.

`js/public-booking.js` commits the enquiry and a private publicBookingLimits
receipt atomically. Rules enforce 60 seconds between submissions with the same
case-insensitive email address. This is a per-email deterrent, not per-IP
throttling and not proof that an email belongs to the submitter. No mail or
server credentials are embedded in the website. Duplicate clicks share the
in-flight promise and all forms preserve success/error feedback.

Safe rollout order:
1. Publish the validator and publicBookingLimits permissions, temporarily leaving
   booking create as `validPublicBookingEnquiry()` for existing cached forms.
2. Deploy all three forms, including the exported Roxanna package.
3. Verify both public Pages and private LiveSuite files; allow cached HTML to
   expire. Then add `&& validBookingCooldown(enquiryId)` to booking create.
4. Verify the published Console version. A Git commit does not deploy rules.

The isolated emulator test covers valid submissions for all three acts,
malformed/oversized data, source mismatches, missing/duplicate cooldown receipts,
owner management and unauthorised reads/writes. Do not create test bookings in
production. Keep the prior Console rules version as a rollback point.

## Public/private boundary

The rules inspected in Firebase Console on 22 October 2026 were published on
16 October and still permitted anonymous reads of full lyrics, timing, setlists,
requests, performance sessions and controls. A public JavaScript field filter
cannot secure those records. The booking rollout does NOT close those reads.

A free-plan migration must publish allowlisted public views from authenticated
host code, migrate all public consumers, initialise the views, and only then
restrict the original collections. Existing lyrics IDs and selected setlist IDs
remain authoritative. Private Singer Screen and kiosk access must be validated
before cutover. Never close reads first or enable a public fallback to full
private records after cutover.

## App Check and notifications

App Check keys are currently blank. No service-wide enforcement has been enabled.
Do not enable Firestore enforcement until every legitimate host, singer, kiosk
and all three acts' clients are registered and verified. App Check does not
replace rules. The existing enquiries dashboard is retained; a successful
Firestore write is not evidence of an email notification.

## Validation commands

- `node --test verification/public-site/public-policy.test.cjs verification/public-site/event-time.test.cjs`
- `node verification/public-site/live-karaoke-catalogue.test.cjs`
- `node verification/public-site/repair-browser.test.cjs` (Playwright/Chromium)
- `firebase emulators:exec --config firebase.emulators.json --project demo-lk-public --only firestore 'node verification/public-site/rules.test.cjs'`

Browser tests use isolated fixtures and block all external writes. The emulator
uses a demo project. Malta event timestamps/DST are tested independently.
