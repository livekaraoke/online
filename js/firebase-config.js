(function () {
  "use strict";

  // Current LIVEKARAOKESUITE client configuration copied from the latest
  // Live Karaoke source supplied on 4 September 2026. Firebase web config is
  // intentionally local to /roxanna/ so this folder can later be moved to a
  // separate GitHub repository without depending on ../livesuite/ files.
  window.ROXANNA_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAkJ6yKFE8jgcDoWtZfQKmHjhBk4rfZ8Fg",
    authDomain: "livekaraokesuite.firebaseapp.com",
    projectId: "livekaraokesuite",
    storageBucket: "livekaraokesuite.firebasestorage.app",
    messagingSenderId: "25324781952",
    appId: "1:25324781952:web:ca9467eecce90574ee8165",
    measurementId: "G-J1DVP1T0HW"
  };

  if (!window.firebase) {
    console.error("Firebase SDK has not loaded.");
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.ROXANNA_FIREBASE_CONFIG);
  }

  window.ROXANNA_DB = firebase.firestore();
})();
