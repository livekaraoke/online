# Firebase integration notes

Existing collections and documents are reused. No migration or bulk copy runs on page load.

New collection: `songInbox/{sha256(normalizedTitle + '|' + normalizedArtist)}`.

Fields: title, artist, titleKey, artistKey, status, requestCount, firstRequestedAt, lastRequestedAt, lastRequester, lastSessionId, lastVenue, recentCaptureIds (up to 40), recentOccurrences (up to 20), updatedAt when status changes.

The existing archive does not contain your deployed rules, so they cannot safely be replaced. Merge a rule for Song Inbox into your existing database match block, using the **same trusted host/admin authorization predicate already protecting song editing**. For example, if your rules already define `isHost()`:

```text
match /songInbox/{songId} {
  allow read: if isHost();
  allow create, update: if isHost()
    && request.resource.data.title is string
    && request.resource.data.title.size() > 0
    && request.resource.data.title.size() <= 180
    && request.resource.data.artist is string
    && request.resource.data.artist.size() <= 140
    && request.resource.data.requestCount is int
    && request.resource.data.requestCount >= 1
    && request.resource.data.status in ['New', 'To Learn', 'Added', 'Skip']
    && request.resource.data.recentCaptureIds.size() <= 40
    && request.resource.data.recentOccurrences.size() <= 20;
  allow delete: if false;
}
```

This is a merge example, **not a standalone deployable rules file**: do not invent or weaken the existing isHost() implementation, and do not use `allow read, write: if true`. Shared public singer/venue clients should not receive Song Inbox write/read privileges. Existing overlapping broad rules must also be reviewed because Firestore grants access when any matching allow expression permits it.

The Inbox list uses a single-field descending requestCount query with a 50-document cursor page. It does not need a new composite index under default indexing. Existing active-session request queries and other legacy queries still need whatever indexes/rules they required before.

Test in your Firebase emulator or staging project before a gig:

1. Signed-in host can capture/read/status-edit Inbox; singer and anonymous clients cannot.
2. Repeated title/artist increments one entry; a failed transaction retains the local draft.
3. Two hosts accepting the same request produce one run-order entry.
4. Request reason is visible on your actual requester page.
5. Break/Resume and End Session maintain the event/session archives.
6. Page reload/reconnect, switch Firebase project, and return from Lyrics Creator.
7. Check Firebase Usage during a representative rehearsal.

No production Firebase writes, rule deployment, or quota measurement were performed while building this package.
