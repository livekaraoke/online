(function(){
  "use strict";

  const firebaseConfig = window.SITE_FIREBASE_CONFIG;

  if (!firebaseConfig) {
    console.error("Billy Lee Firebase configuration is unavailable. Check db/currentdb.js.");
    return;
  }

  window.BILLYLEE_FIREBASE_CONFIG = firebaseConfig;

  if (!window.firebase) {
    console.error("Firebase SDK has not loaded.");
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  window.BillyLeeDB = firebase.firestore();
})();
