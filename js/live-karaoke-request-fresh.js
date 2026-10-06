(() => {
  "use strict";

  const FRESH_FRAME_URL = "livekaraoke26/request.html?v=20261006-offline-browse-v2#req";

  function install() {
    const original = window.openLiveKaraokeRequestPopup;
    if (typeof original !== "function" || original.__liveKaraokeFreshWrapped) return false;

    const wrapped = function (...args) {
      const result = original.apply(this, args);
      requestAnimationFrame(() => {
        const frame = document.getElementById("liveKaraokeRequestFrame");
        if (!frame) return;
        const fresh = new URL(FRESH_FRAME_URL, location.href).href;
        if (frame.src !== fresh) frame.src = fresh;
      });
      return result;
    };

    wrapped.__liveKaraokeFreshWrapped = true;
    window.openLiveKaraokeRequestPopup = wrapped;
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 100) clearInterval(timer);
    }, 50);
  }
})();
