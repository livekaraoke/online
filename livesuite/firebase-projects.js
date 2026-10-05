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

  // The public Live Karaoke landing page uses the same request experience as
  // BillyLee26, adapted at runtime to the active Live Karaoke session.
  if (/\/online\/(?:index\.html)?$/i.test(location.pathname)) {
    // Intercept the request links immediately, before the popup module finishes
    // loading. This prevents Android/mobile browsers from following the old
    // song-list href (or any stale target=_blank) during the short load window.
    document.addEventListener("click", event => {
      const button = event.target.closest?.("#heroRequestBtn,#songListBtn");
      if (!button) return;
      const disabled = button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled-button");
      if (disabled) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      button.setAttribute("href", "#");
      button.removeAttribute("target");

      if (typeof window.openLiveKaraokeRequestPopup === "function") {
        window.openLiveKaraokeRequestPopup();
      } else {
        window.__liveKaraokeRequestOpenPending = true;
      }
    }, true);

    const script = document.createElement("script");
    script.src = new URL("../js/live-karaoke-request-popup.js?v=20261006-v2", document.currentScript?.src || location.href).href;
    script.async = false;
    document.head.appendChild(script);
  }
})();