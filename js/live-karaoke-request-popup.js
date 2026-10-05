(() => {
  "use strict";

  if (!/\/online\/(?:index\.html)?$/i.test(location.pathname)) return;

  const FRAME_URL = "billylee26/?liveKaraokeMode=1#req";
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

  // Expose the opener so the early landing-page guard can call it directly.
  // This keeps REQUEST / SIGN UP in the current page instead of allowing the
  // anchor's old href/target behaviour to win on mobile browsers.
  window.openLiveKaraokeRequestPopup = openPopup;
  window.closeLiveKaraokeRequestPopup = closePopup;

  function normaliseRequestLinks(root = document) {
    root.querySelectorAll?.("#heroRequestBtn,#songListBtn").forEach(button => {
      if (button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled-button")) return;
      button.setAttribute("href", "#");
      button.removeAttribute("target");
      button.removeAttribute("rel");
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
    button.setAttribute("href", "#");
    button.removeAttribute("target");
    openPopup();
  }, true);

  window.addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "live-karaoke-request-close") closePopup();
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay) {
      const dialog = overlay.querySelector("iframe")?.contentDocument?.getElementById("requestDialog");
      if (!dialog?.open) closePopup();
    }
  });

  // Keep the links neutral even when renderSongAccess() rewrites their href.
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