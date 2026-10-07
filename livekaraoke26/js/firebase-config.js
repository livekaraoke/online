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

  const rawDb = firebase.firestore();
  const capability = window.LS26PublicRequestCapability;
  const cryptoApi = window.crypto || window.msCrypto;

  if (capability && cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    window.BillyLeeDB = capability.wrap({
      db: rawDb,
      firebase,
      storage: window.localStorage,
      cryptoApi
    });
  } else {
    console.warn("Secure request ownership capability unavailable; using create-only compatibility mode.");
    window.BillyLeeDB = rawDb;
  }
})();
