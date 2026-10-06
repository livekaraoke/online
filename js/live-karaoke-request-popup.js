(() => {
  "use strict";

  if (!/\/online\/(?:index\.html)?$/i.test(location.pathname)) return;

  // Request-only Live Karaoke document. This is not /billylee26/ and does not
  // contain the Billy Lee website shell.
  const FRAME_URL = "livekaraoke26/request.html?v=20261006-red-theme-2#req";
  let overlay = null;
  let frame = null;
  let previousBodyOverflow = "";

  const REQUEST_THEME_CSS = `
    :root{
      --bg:#050505!important;
      --panel:#090909!important;
      --panel2:#111111!important;
      --cyan:#ff2b2b!important;
      --cyan2:#ff5a5a!important;
      --line:rgba(255,43,43,.58)!important;
      --text:#ffffff!important;
      --muted:#bdbdbd!important;
      --warm:#ffb1b1!important;
      color-scheme:dark!important;
      background:transparent!important;
    }
    html,body{
      margin:0!important;
      min-height:100%!important;
      background:none!important;
      background-color:transparent!important;
      background-image:none!important;
      color:#fff!important;
    }
    body{font-family:Bahnschrift,Arial,sans-serif!important;}
    dialog::backdrop{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}

    #requestDialog,
    .request-note-dialog,
    .request-action-confirm-dialog{
      background:linear-gradient(180deg,rgba(13,13,13,.985),rgba(4,4,4,.99))!important;
      border-color:rgba(255,43,43,.68)!important;
      box-shadow:0 24px 80px rgba(0,0,0,.88),0 0 28px rgba(255,0,0,.16)!important;
      color:#fff!important;
    }
    #requestDialog .request-modal-top{
      background:#090909!important;
      border-bottom-color:rgba(255,43,43,.34)!important;
    }
    #requestDialog .request-modal-close{
      background:#080808!important;
      border:1px solid rgba(255,43,43,.42)!important;
      color:#fff!important;
      border-radius:999px!important;
      box-shadow:0 0 16px rgba(255,0,0,.10)!important;
    }
    #requestDialog .request-modal-close:hover,
    #requestDialog .request-modal-close:focus-visible{
      background:#210707!important;
      border-color:#ff3434!important;
      box-shadow:0 0 18px rgba(255,0,0,.20)!important;
    }
    #requestDialog .eyebrow,
    #requestDialog .request-notice,
    #requestDialog .request-field>label,
    #requestDialog .request-note-label,
    #requestDialog .request-review-label,
    .request-note-dialog .eyebrow{
      color:#ff3434!important;
      text-shadow:0 0 10px rgba(255,0,0,.28)!important;
    }
    #requestDialog .requesting-as-inline{
      background:#101010!important;
      border-color:rgba(255,43,43,.45)!important;
      color:#fff!important;
    }
    #requestDialog .requesting-as-inline span,
    #requestDialog .requesting-as-inline i{color:#ff4747!important;}

    #requestDialog .request-category-grid button{
      color:#fff!important;
      border-color:rgba(255,43,43,.48)!important;
      background:linear-gradient(160deg,rgba(31,8,8,.96),rgba(8,8,8,.99))!important;
      box-shadow:inset 0 0 18px rgba(255,0,0,.025)!important;
    }
    #requestDialog .request-category-grid button strong{color:#fff!important;}
    #requestDialog .request-category-grid button span{color:#aaa!important;}
    #requestDialog .request-category-grid button:hover,
    #requestDialog .request-category-grid button:focus-visible,
    #requestDialog .request-category-grid button.active{
      border-color:#ff3434!important;
      background:linear-gradient(160deg,rgba(101,0,0,.58),rgba(12,12,12,.99))!important;
      box-shadow:0 0 16px rgba(255,0,0,.18),inset 0 0 16px rgba(255,0,0,.05)!important;
    }
    #requestDialog .request-category-grid .request-favs-card,
    #requestDialog .request-category-grid .request-favs-card.active{
      border-color:rgba(255,43,43,.62)!important;
      background:linear-gradient(160deg,rgba(66,5,5,.96),rgba(9,9,9,.99))!important;
      box-shadow:0 0 15px rgba(255,0,0,.10)!important;
    }
    #requestDialog .request-category-grid .request-favs-card strong{color:#fff!important;}

    #requestDialog .request-alphabet-row button,
    #requestDialog .request-filter-clear,
    #requestDialog .request-back-btn,
    #requestDialog .forget-profile-btn,
    #requestDialog .recover-profile-btn,
    #requestDialog .small-btn,
    .request-note-dialog .small-btn{
      background:#0b0b0b!important;
      border-color:rgba(255,43,43,.34)!important;
      color:#e8e8e8!important;
    }
    #requestDialog .request-alphabet-row button:hover,
    #requestDialog .request-alphabet-row button.active,
    #requestDialog .request-filter-clear:hover,
    #requestDialog .request-back-btn:hover{
      border-color:#ff3535!important;
      color:#ff4a4a!important;
      background:#180707!important;
    }

    #requestDialog input,
    #requestDialog textarea,
    #requestDialog select,
    .request-note-dialog textarea{
      background:#050505!important;
      color:#fff!important;
      border-color:rgba(255,43,43,.34)!important;
      caret-color:#ff3434!important;
    }
    #requestDialog input:focus,
    #requestDialog textarea:focus,
    #requestDialog select:focus,
    .request-note-dialog textarea:focus{
      outline:none!important;
      border-color:#ff3434!important;
      box-shadow:0 0 0 1px rgba(255,43,43,.35),0 0 15px rgba(255,0,0,.10)!important;
    }
    #requestDialog input[type="checkbox"]{accent-color:#ff2b2b!important;}

    #requestDialog .song-results,
    #requestDialog .artist-browse-results{
      background:#050505!important;
      border-color:rgba(255,43,43,.25)!important;
    }
    #requestDialog .song-row{
      background:#090909!important;
      border-bottom-color:rgba(255,255,255,.08)!important;
      color:#fff!important;
    }
    #requestDialog .song-row:hover{background:#140707!important;}
    #requestDialog .song-row.is-playing,
    #requestDialog .song-row.playing,
    #requestDialog .song-row.now-playing,
    #requestDialog .song-row[data-song-session-state="playing"]{
      background:linear-gradient(90deg,rgba(105,0,0,.72),rgba(20,7,7,.98))!important;
      box-shadow:inset 3px 0 0 #ff2b2b!important;
    }
    #requestDialog .song-row small{color:#aaa!important;}
    #requestDialog .song-row button,
    #requestDialog [data-toggle-favourite]{
      background:#0a0a0a!important;
      color:#ff4a4a!important;
      border-color:rgba(255,43,43,.42)!important;
    }
    #requestDialog [data-toggle-favourite].is-favourite{
      color:#ff6a6a!important;
      border-color:#ff3d3d!important;
      background:rgba(255,0,0,.12)!important;
      box-shadow:0 0 12px rgba(255,0,0,.10)!important;
    }
    #requestDialog .artist-song-group{
      border-bottom-color:rgba(255,43,43,.18)!important;
    }
    #requestDialog .artist-song-group-heading{
      border-bottom-color:rgba(255,43,43,.30)!important;
      background:linear-gradient(90deg,#2a0808,#120707)!important;
      box-shadow:0 5px 12px rgba(0,0,0,.26)!important;
    }
    #requestDialog .artist-song-group-heading strong{color:#ff5555!important;}
    #requestDialog .artist-song-group-heading span{color:#9b9b9b!important;}

    #requestDialog .primary-btn,
    .request-note-dialog .primary-btn,
    .request-action-confirm-dialog .request-action-confirm-ok{
      background:linear-gradient(180deg,#ff3b3b,#b90000)!important;
      color:#fff!important;
      border:1px solid #ff4a4a!important;
      box-shadow:0 0 12px rgba(255,0,0,.22)!important;
      text-shadow:0 1px 0 rgba(0,0,0,.35)!important;
    }
    #requestDialog .primary-btn:hover,
    .request-note-dialog .primary-btn:hover,
    .request-action-confirm-dialog .request-action-confirm-ok:hover{
      background:linear-gradient(180deg,#ff5050,#d10000)!important;
      box-shadow:0 0 18px rgba(255,0,0,.34)!important;
    }

    #requestDialog .request-name-gate-card,
    #requestDialog .request-review-card,
    #requestDialog .request-confirm-card,
    #requestDialog .request-history-body,
    #requestDialog .request-history-card,
    #requestDialog .request-info-item,
    #requestDialog .my-request,
    #requestDialog .personal-favourites-card,
    .request-note-dialog .request-note-modal-card,
    .request-action-confirm-dialog .request-action-confirm-card{
      background:#0a0a0a!important;
      border-color:rgba(255,43,43,.25)!important;
    }

    #requestDialog .my-request{
      border:1px solid rgba(255,43,43,.24)!important;
      border-radius:10px!important;
      background:linear-gradient(160deg,#0e0e0e,#070707)!important;
    }
    #requestDialog .my-request-detail b{
      color:#ff5555!important;
      border-color:rgba(255,43,43,.38)!important;
      background:rgba(255,0,0,.08)!important;
    }
    #requestDialog .my-request-actions button{
      background:#0b0b0b!important;
      border-color:rgba(255,43,43,.38)!important;
      color:#f2f2f2!important;
    }
    #requestDialog .my-request-actions button:hover{
      background:#1c0707!important;
      border-color:#ff3434!important;
      color:#fff!important;
    }
    #requestDialog .my-request-actions .cancel-request{
      background:#120707!important;
      border-color:rgba(255,80,80,.48)!important;
      color:#ff8585!important;
    }
    #requestDialog .status-playing,
    #requestDialog .status-queued,
    #requestDialog .status-active{
      color:#ff6969!important;
    }

    #requestDialog .request-info-list details{
      background:linear-gradient(180deg,#101010,#090909)!important;
      border-color:rgba(255,43,43,.25)!important;
      box-shadow:none!important;
    }
    #requestDialog .request-info-list summary{color:#f7f7f7!important;}
    #requestDialog .request-info-list p{color:#b2b2b2!important;}

    #requestDialog .request-history-tabs button{
      background:#0a0a0a!important;
      border-color:rgba(255,43,43,.26)!important;
      color:#aaa!important;
      box-shadow:none!important;
    }
    #requestDialog .request-history-tabs button.active{
      color:#ff4a4a!important;
      border-color:#ff3434!important;
      border-bottom-color:#ff3434!important;
      background:#180707!important;
      box-shadow:inset 0 -3px 0 #ff2b2b!important;
    }
    #requestDialog .request-history-tabs button.active::after{
      background:#ff2b2b!important;
    }
    #requestDialog .request-history-stat-grid article{
      border-color:rgba(255,43,43,.23)!important;
      background:linear-gradient(160deg,rgba(42,8,8,.82),rgba(10,10,10,.96))!important;
    }
    #requestDialog .request-history-stat-grid span,
    #requestDialog .request-history-highlight-grid article>span,
    #requestDialog .request-history-fun-stat>span{
      color:#ff6262!important;
    }
    #requestDialog .request-history-highlight-grid article{
      border:1px solid rgba(255,43,43,.21)!important;
      background:radial-gradient(circle at 100% 0,rgba(255,0,0,.09),transparent 42%),#0a0a0a!important;
    }
    #requestDialog .request-history-highlight-grid small{color:#9f9f9f!important;}
    #requestDialog .request-history-summary div{
      border-color:rgba(255,43,43,.16)!important;
      background:#0b0b0b!important;
    }
    #requestDialog .request-history-summary span{color:#8f8f8f!important;}
    #requestDialog .request-history-summary strong{color:#f1f1f1!important;}
    #requestDialog .request-history-row{
      border-color:rgba(255,43,43,.18)!important;
      background:#0a0a0a!important;
    }
    #requestDialog .request-history-row-main>span{color:#a9a9a9!important;}
    #requestDialog .request-history-row-main>small{color:#777!important;}
    #requestDialog .request-history-row-main>em{color:#aaa!important;}
    #requestDialog .request-history-favourites-grid>section{
      border-color:rgba(255,43,43,.20)!important;
      background:#0a0a0a!important;
    }
    #requestDialog .request-history-section-title strong,
    #requestDialog .request-ranking-list strong,
    #requestDialog .request-session-numbers b{
      color:#ff5b5b!important;
    }
    #requestDialog .request-history-fun-stat{
      border-color:rgba(255,43,43,.24)!important;
      background:rgba(110,0,0,.10)!important;
    }
    #requestDialog .request-history-fun-stat>strong{color:#ff7777!important;}
    #requestDialog .request-session-history article{
      border-color:rgba(255,43,43,.19)!important;
      background:#0a0a0a!important;
    }
    #requestDialog .request-session-history article>div:first-child span,
    #requestDialog .request-session-history article>small{color:#8f8f8f!important;}
    #requestDialog .personal-favourites-card{
      border-color:rgba(255,43,43,.24)!important;
      background:radial-gradient(circle at 100% 0,rgba(255,0,0,.08),transparent 42%),#0a0a0a!important;
    }
    #requestDialog .personal-favourite-list>div{
      border-color:rgba(255,43,43,.18)!important;
      background:#0b0b0b!important;
    }

    #requestDialog .request-bottom-tabs{
      background:#070707!important;
      border-top-color:rgba(255,43,43,.28)!important;
      box-shadow:0 -10px 28px rgba(0,0,0,.40)!important;
    }
    #requestDialog .request-bottom-tabs button{
      background:#080808!important;
      color:#8f8f8f!important;
      border-color:rgba(255,43,43,.16)!important;
    }
    #requestDialog .request-bottom-tabs button.active{
      color:#ff4747!important;
      background:linear-gradient(180deg,rgba(255,0,0,.13),#080808)!important;
      box-shadow:inset 0 3px 0 #ff2b2b,0 -7px 16px rgba(255,0,0,.07)!important;
    }
    #requestDialog .request-bottom-tabs button.active span,
    #requestDialog .request-bottom-tabs button.active small{color:#ff4747!important;}

    #requestDialog .success-mark{color:#ff3434!important;border-color:#ff3434!important;}
    #requestDialog ::selection{background:#9d0000!important;color:#fff!important;}
    #requestDialog *{scrollbar-color:#8d1717 #080808;}
  `;

  function applyFrameTheme() {
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;

      doc.documentElement.style.setProperty("background", "transparent", "important");
      doc.documentElement.style.setProperty("background-color", "transparent", "important");
      if (doc.body) {
        doc.body.style.setProperty("background", "transparent", "important");
        doc.body.style.setProperty("background-color", "transparent", "important");
        doc.body.style.setProperty("background-image", "none", "important");
      }

      let style = doc.getElementById("live-karaoke-red-request-theme");
      if (!style) {
        style = doc.createElement("style");
        style.id = "live-karaoke-red-request-theme";
        doc.head.appendChild(style);
      }
      style.textContent = REQUEST_THEME_CSS;
    } catch (error) {
      console.warn("Could not apply Live Karaoke request theme", error);
    }
  }

  function closePopup() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    frame = null;
    document.documentElement.classList.remove("live-karaoke-request-open");
    document.body.style.overflow = previousBodyOverflow;
  }

  function openPopup() {
    if (overlay) return;

    previousBodyOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";

    overlay = document.createElement("div");
    overlay.id = "liveKaraokeRequestOverlay";
    overlay.setAttribute("role", "presentation");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.42);backdrop-filter:blur(6px) brightness(.48) saturate(.78);-webkit-backdrop-filter:blur(6px) brightness(.48) saturate(.78);overflow:hidden;touch-action:none;";

    frame = document.createElement("iframe");
    frame.id = "liveKaraokeRequestFrame";
    frame.title = "Live Karaoke song requests";
    frame.src = FRAME_URL;
    frame.allow = "clipboard-write";
    frame.setAttribute("allowtransparency", "true");
    frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:none transparent!important;color-scheme:dark;visibility:hidden;";
    frame.addEventListener("load", applyFrameTheme);

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
      applyFrameTheme();
      requestAnimationFrame(() => {
        if (frame) frame.style.visibility = "visible";
      });
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
