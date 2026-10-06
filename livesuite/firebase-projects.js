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

  if (/\/online\/(?:index\.html)?$/i.test(location.pathname)) {
    function turnIntoButton(node) {
      if (!node) return node;
      if (node.tagName === "A") {
        const button = document.createElement("button");
        for (const attr of [...node.attributes]) {
          if (["href", "target", "rel"].includes(attr.name)) continue;
          button.setAttribute(attr.name, attr.value);
        }
        button.type = "button";
        button.innerHTML = node.innerHTML;
        node.replaceWith(button);
        return button;
      }
      node.removeAttribute("href");
      node.removeAttribute("target");
      node.removeAttribute("rel");
      if (node.tagName === "BUTTON") node.type = "button";
      return node;
    }

    function hardenRequestControls() {
      document.querySelectorAll?.("#heroRequestBtn,#songListBtn").forEach(turnIntoButton);
    }

    function isBlocked(button) {
      if (button?.id === "songListBtn") return false;
      return button?.getAttribute("aria-disabled") === "true" || button?.classList.contains("disabled-button");
    }

    document.addEventListener("pointerdown", event => {
      const button = event.target.closest?.("#heroRequestBtn,#songListBtn");
      if (!button) return;
      if (!isBlocked(button)) event.preventDefault();
    }, true);

    document.addEventListener("click", event => {
      const button = event.target.closest?.("#heroRequestBtn,#songListBtn");
      if (!button || isBlocked(button)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      hardenRequestControls();
      if (typeof window.openLiveKaraokeRequestPopup === "function") window.openLiveKaraokeRequestPopup();
      else window.__liveKaraokeRequestOpenPending = true;
    }, true);

    document.addEventListener("DOMContentLoaded", hardenRequestControls, { once:true });
    const observer = new MutationObserver(hardenRequestControls);
    observer.observe(document.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:["href","target","rel","class","aria-disabled"]});

    const base = document.currentScript?.src || location.href;
    const refreshCss = document.createElement("link");
    refreshCss.rel = "stylesheet";
    refreshCss.href = new URL("../css/live-karaoke-public-refresh.css?v=20261006-spacing-fix-v1", base).href;
    document.head.appendChild(refreshCss);

    const enquiryCss = document.createElement("link");
    enquiryCss.rel = "stylesheet";
    enquiryCss.href = new URL("../css/live-karaoke-enquiry-green.css?v=20261006-enquiry-green-v1", base).href;
    document.head.appendChild(enquiryCss);

    const refreshScript = document.createElement("script");
    refreshScript.src = new URL("../js/live-karaoke-public-refresh.js?v=20261006-review-name-v1", base).href;
    refreshScript.async = false;
    document.head.appendChild(refreshScript);

    const script = document.createElement("script");
    script.src = new URL("../js/live-karaoke-request-popup.js?v=20261006-red-theme-v7", base).href;
    script.async = false;
    document.head.appendChild(script);

    const freshRequestScript = document.createElement("script");
    freshRequestScript.src = new URL("../js/live-karaoke-request-fresh.js?v=20261006-offline-browse-v2", base).href;
    freshRequestScript.async = false;
    document.head.appendChild(freshRequestScript);
  }
})();