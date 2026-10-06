(function () {
  'use strict';
  const config = window.LKFirebaseProjects?.getSelectedConfig() || window.LK_FIREBASE_CONFIG;
  if (!firebase.apps.length) firebase.initializeApp(config);
  const key = window.LK_PUBLIC_APP_CHECK_KEYS?.[config.projectId];
  window.LK_PUBLIC_APP_CHECK_READY = false;
  if (!key) return;
  try {
    firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(key), true);
    window.LK_PUBLIC_APP_CHECK_READY = true;
  } catch (_) {
    // No tokens or form details in console output. Submission reports failure.
  }
})();
