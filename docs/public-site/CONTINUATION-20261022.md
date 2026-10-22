# Continuation after skipping Cloudflare sign-in

Fetched and preserved main `aaa6decd3f9509bf8d022c652b209c19b58031e8`, including
the newer prompter scrolling work. No prompter files were changed in this stage.

## Visible repairs

- Overdue event countdown says **Starting now**, without public lateness wording.
- Request rejection now distinguishes session/QR eligibility from connectivity.
- Existing homepage artwork, green request action, popup, profiles, favourites,
  requests and booking controls remain in place.

## Security implementation added, not activated

- Explicit public live/event/settings projections; no requester details or
  private operational fields are copied.
- Shared owner source subscriptions, source-cache guards, stable comparisons,
  duplicate-write suppression and a bounded live lease.
- Public view readers, three shared listeners, expiry/error clearing and no
  private fallback. Song availability preserves existing request restrictions.
- Roxanna's configured repertoire stays independent of another act's global list.
- Separately generated additive Firestore rules candidate and security tests.
- Automated GitHub regression workflow using an isolated demo Firebase project.

All new reader switches remain disabled. Production rules remain the previously
published request-gate/booking rules until a separately verified rules operation.
Full private-data read separation is still unfinished. This is not a declaration
that private lyrics, sessions or request records are secured from public reads.

## Validation

- 19 policy, catalogue, publisher, projection and Malta-time test cases passed.
- Public repertoire/render/search/act-isolation test passed.
- Full candidate Firestore rules passed live-view access/expiry checks, the 28
  request-gate scenarios, 48 ownership/client/kiosk checks, booking validation
  and cooldown tests, and catalogue access tests.
- Authoritative permission checks use server reads, not cached document reads.
- Browser workflows passed at 1440×900, 1280×800 landscape touch, 390×844 and
  360×800, both with the current data path and with projected live/catalogue
  views. Checks include popup tap, search, profile, favourites, one request on
  repeated taps, source/session identity, closed requests, breaks/end, booking
  duplicate prevention and shared subscriptions. These are emulated devices.
- No production test requests, bookings or sessions were created.

## Remaining work and limits

Cloudflare host verification was skipped at the owner's request. Initial owner
publication and the dependent private-read cutover remain blocked. Request
history/ownership reads, legitimate Singer Screen access and legacy public
consumers still require migration before original collection permissions can
be closed. Separate Billy Lee/Roxanna origins remain unverified. Automatic
private sync still lacks `LIVESUITE_SYNC_TOKEN`; manual receiver reruns are an
available existing deployment route. Email/push notifications and App Check
enforcement are not configured. Existing enquiry dashboard/badges remain.
No Blaze upgrade, paid backend, DNS or Access-policy changes were made.

Production commit/build/file verification is appended after deployment succeeds.
