(() => {
  "use strict";

  if (!/\/online\/(?:index\.html)?$/i.test(location.pathname)) return;

  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

  function ensureFavicons() {
    document.querySelectorAll('link[rel~="icon"][href="favicon.png"]').forEach(node => node.remove());

    const head = document.head;
    if (!head) return;

    const wanted = [
      { rel:"icon", type:"image/png", sizes:"16x16", href:"favicon-16x16.png" },
      { rel:"icon", type:"image/png", sizes:"32x32", href:"favicon-32x32.png" },
      { rel:"apple-touch-icon", sizes:"180x180", href:"apple-touch-icon.png" }
    ];

    wanted.forEach(item => {
      if (head.querySelector(`link[href="${item.href}"]`)) return;
      const link = document.createElement("link");
      link.rel = item.rel;
      if (item.type) link.type = item.type;
      if (item.sizes) link.sizes = item.sizes;
      link.href = item.href;
      head.appendChild(link);
    });
  }

  function setupGetStarted() {
    const button = [...document.querySelectorAll(".hero-content .main-button")]
      .find(node => String(node.textContent || "").trim().toUpperCase() === "GET STARTED");
    const target = document.querySelector(".live-status-section");
    if (!button || !target) return;

    if (!target.id) target.id = "live-karaoke-status";
    if (button.getAttribute("href") !== "#live-karaoke-status") {
      button.setAttribute("href", "#live-karaoke-status");
    }
    if (button.hasAttribute("onclick")) button.removeAttribute("onclick");

    if (button.dataset.liveKaraokeScrollBound === "1") return;
    button.dataset.liveKaraokeScrollBound = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      target.scrollIntoView({
        behavior: reducedMotion() ? "auto" : "smooth",
        block: "start"
      });
    });
  }

  function howStep(number, title, description, svg) {
    return `
      <article class="how-step">
        <span class="how-step-number">${number}</span>
        <div class="how-step-icon" aria-hidden="true">${svg}</div>
        <h3>${title}</h3>
        <p>${description}</p>
      </article>
    `;
  }

  function buildHowItWorks() {
    const container = document.querySelector("#howitworks .instructions-container");
    if (!container || container.dataset.htmlSteps === "1") return;
    container.dataset.htmlSteps = "1";
    container.innerHTML = `
      <div class="how-it-works-grid" role="list" aria-label="How Live Karaoke works">
        ${howStep(1,"PICK A SONG","Browse the song list and choose what you want to sing.",`<svg viewBox="0 0 64 64"><path d="M18 12h30v36H18z"/><path d="M25 22h16M25 29h16M25 36h10"/><path d="M43 12v15"/><circle cx="39" cy="29" r="4"/></svg>`)}
        ${howStep(2,"JOIN THE QUEUE","Add yourself to the next singer rotation and wait for your turn.",`<svg viewBox="0 0 64 64"><circle cx="20" cy="23" r="7"/><circle cx="44" cy="23" r="7"/><path d="M8 47c1-9 6-14 12-14s11 5 12 14"/><path d="M32 47c1-9 6-14 12-14s11 5 12 14"/><path d="M27 16h10M32 11v10"/></svg>`)}
        ${howStep(3,"GRAB THE MIC","When your name is called, step up and take the microphone.",`<svg viewBox="0 0 64 64"><rect x="24" y="8" width="16" height="30" rx="8"/><path d="M18 29c0 8 6 14 14 14s14-6 14-14"/><path d="M32 43v10M23 54h18"/><path d="M28 14h8M28 20h8M28 26h8"/></svg>`)}
        ${howStep(4,"PERFORM LIVE!","Sing with live guitar, looping and a real crowd.",`<svg viewBox="0 0 64 64"><path d="M32 7l7.2 14.6L55 23.9 43.5 35l2.7 15.7L32 43.3l-14.2 7.4L20.5 35 9 23.9l15.8-2.3z"/><path d="M14 11l4 4M50 11l-4 4M8 37h6M50 37h6"/></svg>`)}
      </div>
    `;
  }

  function removeEmailIcon() {
    document.querySelectorAll('.social-icons a[href^="mailto:"]').forEach(node => node.remove());
  }

  function removeEventSubheadings() {
    document.querySelectorAll(".event-subheading").forEach(node => node.remove());
  }

  function keepSongListBrowseable() {
    const button = document.getElementById("songListBtn");
    if (button) {
      if (button.classList.contains("disabled-button")) button.classList.remove("disabled-button");
      if (!button.classList.contains("main-button")) button.classList.add("main-button");
      if (!button.classList.contains("song-list-browse-btn")) button.classList.add("song-list-browse-btn");
      if (button.getAttribute("aria-disabled") !== "false") button.setAttribute("aria-disabled", "false");
      if (button.textContent.trim() !== "BROWSE SONGS") button.textContent = "BROWSE SONGS";
      if (button.onclick) button.onclick = null;
      if (button.tagName === "A" && button.getAttribute("href") !== "#") button.setAttribute("href", "#");
    }

    const message = document.getElementById("songListAccessMessage");
    const copy = "Browse the Live Karaoke songbook anytime. When a Live Karaoke session is live, you can join the queue and send your request directly from the list.";
    if (message && message.textContent.trim() !== copy) message.textContent = copy;
  }

  function markHeroRequest() {
    const button = document.getElementById("heroRequestBtn");
    if (button && !button.classList.contains("hero-request-green")) {
      button.classList.add("hero-request-green");
    }
  }

  function applyPopupIconTheme() {
    const iframe = document.getElementById("liveKaraokeRequestFrame");
    const doc = iframe?.contentDocument;
    if (!doc?.head) return;
    let style = doc.getElementById("live-karaoke-icon-theme-fix");
    if (!style) {
      style = doc.createElement("style");
      style.id = "live-karaoke-icon-theme-fix";
      doc.head.appendChild(style);
    }
    const css = `
      #requestDialog .request-history-section-title>span{
        color:#ff5b5b!important;
        text-shadow:0 0 8px rgba(255,0,0,.16)!important;
      }
      #requestDialog .request-bottom-tabs button>span{
        filter:grayscale(1) saturate(0)!important;
      }
    `;
    if (style.textContent !== css) style.textContent = css;
  }

  function openSongbookFromButton(event) {
    const button = event.target.closest?.("#songListBtn");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (typeof window.openLiveKaraokeRequestPopup === "function") {
      window.openLiveKaraokeRequestPopup();
    } else {
      window.__liveKaraokeRequestOpenPending = true;
    }
  }

  function applyStaticRefinements() {
    ensureFavicons();
    setupGetStarted();
    buildHowItWorks();
    removeEmailIcon();
    removeEventSubheadings();
    keepSongListBrowseable();
    markHeroRequest();
  }

  document.addEventListener("pointerdown", event => {
    if (event.target.closest?.("#songListBtn")) event.preventDefault();
  }, true);
  document.addEventListener("click", openSongbookFromButton, true);

  window.addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "live-karaoke-request-ready") {
      applyPopupIconTheme();
      requestAnimationFrame(applyPopupIconTheme);
    }
  });

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyStaticRefinements();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyStaticRefinements, { once:true });
  } else {
    applyStaticRefinements();
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, {
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:["class","aria-disabled","href"]
  });
})();
