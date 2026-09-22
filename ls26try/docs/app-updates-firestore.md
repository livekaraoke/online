# Enable App Updates

App Updates uses Cloud Firestore collection `appUpdateNotes` in the Firebase project selected in LiveSuite. The UI cannot change security rules. The repository does not contain the deployed rules, so this is an additive example, not a replacement ruleset.

1. Open the selected project in Firebase Console → Authentication → Users. Copy the UID of your host/admin sign-in account.
2. Open Firestore Database → Rules.
3. Inside the existing `match /databases/{database}/documents { ... }`, add the block below. Replace `YOUR_HOST_UID` with the copied UID. Keep existing rules intact.
4. Publish the rules and sign into LiveSuite Admin with that account. Retry the saved draft.

```firebase-security-rules
match /appUpdateNotes/{noteId} {
  allow read, create, update: if request.auth != null
    && request.auth.uid == 'YOUR_HOST_UID';
}
```

This grants only that account access to this notes collection; deleting notes is not needed. For multiple authorized hosts, use an explicitly maintained UID allowlist or your existing trusted admin-role predicate. Do not grant public access or blanket access to all signed-in users: guest accounts can also be authenticated.

Existing broader matching rules can also grant access; adding this block does not revoke other grants. Validate using the Firestore Rules simulator: signed-out/guest denied; chosen host can read, create, and update. Test in the selected project, since UIDs/rules may differ across projects.

Reference: https://firebase.google.com/docs/firestore/security/rules-conditions
