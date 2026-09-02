(function () {
  "use strict";

  const STORAGE_KEY = "liveKaraokeSuite.firebaseProject";
  const DEFAULT_PROJECT = "LIVEKARAOKESUITE";

  const PROJECTS = {
    LIVEKARAOKEMT: {
      label: "LIVEKARAOKEMT",
      apiKey: "AIzaSyC4gSodXM35E2ZdYaz6mrCvTUYzW75ZCBk",
      authDomain: "livekaraokemt.firebaseapp.com",
      projectId: "livekaraokemt",
      storageBucket: "livekaraokemt.firebasestorage.app",
      messagingSenderId: "425980659562",
      appId: "1:425980659562:web:892ddcd53fb209d1114713"
    },
    LIVEKARAOKESUITE: {
      label: "LIVEKARAOKESUITE",
      apiKey: "AIzaSyAkJ6yKFE8jgcDoWtZfQKmHjhBk4rfZ8Fg",
      authDomain: "livekaraokesuite.firebaseapp.com",
      projectId: "livekaraokesuite",
      storageBucket: "livekaraokesuite.firebasestorage.app",
      messagingSenderId: "25324781952",
      appId: "1:25324781952:web:ca9467eecce90574ee8165",
      measurementId: "G-J1DVP1T0HW"
    }
  };

  function normalizeKey(value) {
    return PROJECTS[value] ? value : DEFAULT_PROJECT;
  }

  function getSelectedKey() {
    try {
      return normalizeKey(localStorage.getItem(STORAGE_KEY) || DEFAULT_PROJECT);
    } catch (_) {
      return DEFAULT_PROJECT;
    }
  }

  function getSelectedConfig() {
    return { ...PROJECTS[getSelectedKey()] };
  }

  function selectProject(key, reload = true) {
    const selected = normalizeKey(key);
    localStorage.setItem(STORAGE_KEY, selected);
    if (reload) location.reload();
    return selected;
  }

  window.LKFirebaseProjects = {
    STORAGE_KEY,
    DEFAULT_PROJECT,
    PROJECTS,
    getSelectedKey,
    getSelectedConfig,
    selectProject
  };

  window.LK_FIREBASE_CONFIG = getSelectedConfig();
  window.LK_FIREBASE_PROJECT = getSelectedKey();
})();