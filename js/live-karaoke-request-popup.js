(() => {
  "use strict";

  if (!/\/online\/(?:index\.html)?$/i.test(location.pathname)) return;

  // Dedicated duplicate of the BillyLee26 request experience for Live Karaoke.
  // This intentionally does NOT load billylee26/.
  const FRAME_URL = "livekaraoke26/#req";
  let overlay = null;

  function closePopup() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.documentElement.classList.remove("live-karaoke-request-open");
  }

  function openPopup() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "liveKaraokeRequestOverlay";
    overlay.setAttribute("role", "presentation");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);";

    const frame = document.createElement("iframe");
    frame.id = "liveKaraokeRequestFrame";
    frame.title = "Live Karaoke song requests";
    frame.src = FRAME_URL;
    frame.allow = "clipboard-write";
    frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;color-scheme:dark;";
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    document.documentElement.classList.add("live-karaoke-request-open");
  }

  window.openLiveKaraokeRequestPopup = openPopup;
  window.closeLiveKaraokeRequestPopup = closePopup;

  function neutraliseRequestLink(button) {
    if (!button) return;
    if (button.getAttribute("href") !== "#") button.setAttribute("href", "#");
    if (button.hasAttribute("target")) button.removeAttribute("target");
    if (button.hasAttribute("rel")) button.removeAttribute("rel");
  }

  function normaliseRequestLinks(root = document) {
    root.querySelectorAll?.("#heroRequestBtn,#songListBtn").forEach(button => {
      if (button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled-button")) return;
      neutraliseRequestLink(button);
    });
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.("#heroRequestBtn,#songListBtn");
    if (!button) return;

    const disabled = button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled-button");
    if (disabled) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    neutraliseRequestLink(button);
    openPopup();
  }, true);

  window.addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "live-karaoke-request-close") closePopup();
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay) closePopup();
  });

  const observer = new MutationObserver(() => normaliseRequestLinks());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href", "target", "class", "aria-disabled"]
  });
  normaliseRequestLinks();

  if (window.__liveKaraokeRequestOpenPending) {
    window.__liveKaraokeRequestOpenPending = false;
    queueMicrotask(openPopup);
  }
})();
