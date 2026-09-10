/* Copyright © 2026 LiveSuite. All rights reserved.
 * host/js/firebase-config.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
/* Firebase configuration shared by the Live Karaoke lyrics tools. */
const firebaseConfig = window.LKFirebaseProjects
  ? window.LKFirebaseProjects.getSelectedConfig()
  : window.LK_FIREBASE_CONFIG;

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

/* Expose these globally because the existing suite uses db directly. */
window.db = firebase.firestore();
// Some host/viewer pages intentionally load only Firebase App + Firestore.
window.auth =
  typeof firebase.auth === "function"
    ? firebase.auth()
    : null;
