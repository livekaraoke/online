(function(){
  "use strict";

  const firebaseConfig = (window.LKFirebaseProjects && typeof window.LKFirebaseProjects.getSelectedConfig === "function")
    ? window.LKFirebaseProjects.getSelectedConfig()
    : window.LK_FIREBASE_CONFIG;

  if (!firebaseConfig) {
    console.error("LiveSuite Firebase project configuration is unavailable.");
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
