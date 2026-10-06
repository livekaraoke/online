(() => {
  "use strict";

  if (!/\/online\/(?:index\.html)?$/i.test(location.pathname)) return;

  const FRAME_URL = "livekaraoke26/#req";
  let overlay = null;
  let frame = null;

  function closePopup() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    frame = null;
    document.documentElement.classList.remove("live-karaoke-request-open");
  }

  function openPopup() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "liveKaraokeRequestOverlay";
    overlay.setAttribute("role", "presentation");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.74);overflow:hidden;";

    frame = document.createElement("iframe");
    frame.id = "liveKaraokeRequestFrame";
    frame.title = "Live Karaoke song requests";
    frame.src = FRAME_URL;
    frame.allow = "clipboard-write";
    frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;color-scheme:dark;visibility:hidden;";

    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    document.documentElement.classList.add("live-karaoke-request-open");
  }

  window.openLiveKaraokeRequestPopup = openPopup;
  window.closeLiveKaraokeRequestPopup = closePopup;

  function replaceAnchorWithButton(node) {
    if (!node || node.tagName !== "A") return node;
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

  function hardenRequestControls(root = document) {
    root.querySelectorAll?.("#heroRequestBtn,#songListBtn").forEach(original => {
      const button = replaceAnchorWithButton(original);
      button.removeAttribute("href");
      button.removeAttribute("target");
      button.removeAttribute("rel");
      if (button.tagName === "BUTTON") button.type = "button";
    });
  }

  document.addEventListener("pointerdown", event => {
    const button = event.target.closest?.("#heroRequestBtn,#songListBtn");
    if (!button) return;
    const disabled = button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled-button");
    if (disabled) return;
    event.preventDefault();
  }, true);

  document.addEventListener("click", event => {
    const button = event.target.closest?.("#heroRequestBtn,#songListBtn");
    if (!button) return;

    const disabled = button.getAttribute("aria-disabled") === "true" || button.classList.contains("disabled-button");
    if (disabled) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    hardenRequestControls();
    openPopup();
  }, true);

  window.addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "live-karaoke-request-ready" && frame) {
      frame.style.visibility = "visible";
      return;
    }
    if (event.data?.type === "live-karaoke-request-close") closePopup();
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay) closePopup();
  });

  const observer = new MutationObserver(() => hardenRequestControls());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href", "target", "rel", "class", "aria-disabled"]
  });

  hardenRequestControls();

  if (window.__liveKaraokeRequestOpenPending) {
    window.__liveKaraokeRequestOpenPending = false;
    queueMicrotask(openPopup);
  }
})();
