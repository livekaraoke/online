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

/* LyricsCreator-only inline metadata tools. Loaded here to avoid changing the
   established creator script order. */
if (/\/lyricscreator\.html$/i.test(String(location.pathname || ""))) {
  const helper = document.createElement("script");
  helper.src = "js/inline-performance-tools.js?v=20261006-inline-section-tools-v1";
  helper.async = false;
  (document.head || document.documentElement).appendChild(helper);
}
