(() => {
  "use strict";

  let unsubscribe = null;
  let observer = null;

  function dbRef() {
    const db =
      window.LK?.db ||
      window.db ||
      (window.firebase?.firestore ? firebase.firestore() : null);

    return db ? db.collection("karaokeControl").doc("publicSongList") : null;
  }

  function render(data) {
    const el = document.getElementById("tsDashPublicSetlist");
    if (!el) return false;

    el.textContent = data?.setlistName || "Not selected";
    el.title = data?.setlistName || "";
    return true;
  }

  function startListener() {
    if (unsubscribe) return;

    const ref = dbRef();
    if (!ref) return;

    unsubscribe = ref.onSnapshot(doc => {
      render(doc.exists ? (doc.data() || {}) : {});
    }, error => {
      console.warn("Public Song List status unavailable:", error);
    });
  }

  function waitForInjectedStatusBar() {
    startListener();

    observer = new MutationObserver(() => {
      if (document.getElementById("tsDashPublicSetlist")) {
        startListener();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForInjectedStatusBar);
  } else {
    waitForInjectedStatusBar();
  }
})();
