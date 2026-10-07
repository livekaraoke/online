/* Deployment gate: enable only after the deployed, combined Firestore rules
 * pass docs/signup-kiosk/README.md. This is a rollout switch, not security. */
window.LKSignupPolicy = {
  rulesVerified: false,
  projectId: 'livekaraokesuite',
  schemaVersion: 1
};
