(function () {
  "use strict";

  const firebaseConfig = window.SITE_FIREBASE_CONFIG;

  if (!firebaseConfig) {
    console.error("Roxanna Firebase configuration is unavailable. Check db/currentdb.js.");
    return;
  }

  window.ROXANNA_FIREBASE_CONFIG = firebaseConfig;

  if (!window.firebase) {
    console.error("Firebase SDK has not loaded.");
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  window.ROXANNA_DB = firebase.firestore();
})();
