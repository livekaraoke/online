# Reminders and Metronome

## Reminders

Admin → Tools → Reminders opens the manager. The pending badge counts all pending
reminders for the signed-in user, including undated and future reminders. It is
not just a count of overdue items. The top-bar arrow → Add Reminder opens capture
without navigating away from lyrics or the current page.

Fields: reminder text, optional date/time, priority, category, related HTTP(S) link.
Date-only reminders are due at the end of their selected day. The capture timezone
is stored and shown. These are in-app due indicators, not background notifications.
Pending items can be completed, edited, moved to tomorrow or archived. Completed
and archived entries can be reopened. There is no permanent-delete action.

Capture drafts are scoped to the selected Firebase project and signed-in user in
localStorage. Saves write to `reminders` in the selected database. A failed write
retains the form/draft; it does not claim success or increment the badge.

One pending-query listener is shared between the manager and sidebar. It only
starts on Admin pages with the badge or the manager; ordinary performance pages
do not open it. DB Logs does not open it. Completed/archived/all views load 50
records at a time with Load more. Their search and sorting cover loaded records;
the UI explicitly notes when more remain. Pending reminders are all loaded by
the existing listener. Local overdue-label updates do not issue database reads.

### Firestore access

The repository does not contain the deployed Firestore rules. No rules are
published by this PR. If the selected project's rules do not yet permit this
collection, add a narrow rule inside the existing database match, using actual
authorized host UIDs. This is an additive example, not a replacement ruleset:

```firebase-security-rules
function reminderHost() {
  return request.auth != null && request.auth.uid in ['YOUR_HOST_UID'];
}
function validReminder(data) {
  return data.text is string && data.text.size() > 0 && data.text.size() <= 5000
    && data.status in ['pending', 'completed', 'archived']
    && data.priority in ['low', 'normal', 'high']
    && data.category is string && data.category.size() <= 80
    && data.link is string && data.link.size() <= 2000
    && (data.dueAt == null || data.dueAt is timestamp);
}
match /reminders/{id} {
  allow read: if reminderHost() && resource.data.createdBy == request.auth.uid;
  allow create: if reminderHost()
    && request.resource.data.createdBy == request.auth.uid
    && request.resource.data.createdAt == request.time
    && validReminder(request.resource.data);
  allow update: if reminderHost()
    && resource.data.createdBy == request.auth.uid
    && request.resource.data.createdBy == resource.data.createdBy
    && request.resource.data.createdAt == resource.data.createdAt
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'text','date','time','dueAt','timeZone','priority','category','link','status','updatedAt'
    ]) && validReminder(request.resource.data);
}
```

Queries include `createdBy == currentUser.uid`; the pending query also includes
`status == pending`. No composite orderBy index is required. Existing broad rules
can still grant additional access: this block alone does not revoke them. Verify
the full ruleset with signed-out/guest/other-host denials and the authorized host's
create/read/update cases before calling these records private.

Reference: https://firebase.google.com/docs/firestore/security/rules-conditions

## Metronome

Admin → Tools → Metronome / Click opens the dedicated page. It works without a
database connection once page assets have loaded. Audio only starts after a tap.

- 30–300 BPM, tap tempo (up to nine taps), ±1/±5, half/double tempo and slider.
- 1–12 beats per bar; per-beat normal/accent/silent controls.
- Straight beats, eighth notes, triplets or sixteenths; swing with eighth notes.
- Optional one/two-bar count-in; two click sounds; volume; silent visual mode.
- Bar/beat display and elapsed playback time; twelve locally saved named presets.
- Space starts/stops when not editing; T taps tempo. Shortcuts respect open dialogs.

Web Audio oscillators are scheduled 100 ms ahead, checked every 25 ms, using
AudioContext.currentTime. Stop cancels queued oscillators and UI timers. A stalled
scheduler reanchors without firing a backlog. Audio interruption, hidden tab or
navigation stops playback; it never starts again automatically. Bluetooth audio
can have device latency; no microphone recording or operating-system alarm is used.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques

## Verification

Run `node ls26try/verification/metronome-engine.cjs` for tempo, swing, count-in and
audio scheduling logic. `tools-integration.cjs` exercises the actual controllers
with a simulated DOM, Firestore and audio context (install the test-only
`linkedom@0.18.12` package and set `LS26_TEST_NODE_MODULES` to its node_modules).
No tests connect to the live database or emit sound. Real tablet audio and the
rendered layout still need device/browser verification; the cloud browser could
not access the local preview in this session.

## LyricView integration

Info & Tools now places a compact metronome below Current BPM and above Show
karaoke tools. Start/Stop works independently; Follow bottom Play / Pause links
it to scrolling. It uses Current BPM, with tap tempo, meter, subdivisions, first
beat accent and volume. The existing scroll-speed multiplier remains separate.
No audio starts on page load, including when Follow is remembered.

Open on LyricView startup is stored on this browser. Checked opens the sidebar
when a song loads and keeps it open on Play; unchecked starts closed. Manual
opening/closing does not change this preference.

Current BPM has separate per-song, per-project tab storage. The saved song's
User BPM and Original BPM are never changed by performance tempo controls. The
top User BPM remains the saved value; sidebar Current BPM is the live value.
Performed-song records retain userBpm as the saved preference, startingBpm as the
value at Play, and performanceBpm as the latest used tempo. Changes after Play
are coalesced for 400 ms and saved to the performed-song record only. Next/song
completion and the end-session handoff flush pending tempo changes before the
archive is built. History and averages prefer performanceBpm, with legacy
fallbacks. History displays BPM used beside each performed song.

Browser back/close triggers a best-effort flush; a forced browser termination or
lost network before Firebase acknowledges a write cannot guarantee persistence.
Live audio and the rendered tablet layout still require device verification.
