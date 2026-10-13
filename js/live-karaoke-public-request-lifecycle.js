/* Public Live Karaoke request/status lifecycle for the root website. */
(() => {
  "use strict";

  let db = null;
  let karaokeState = {};
  let currentSession = {};
  let runOrder = [];
  let websiteSettings = {};
  let queued = false;
  const unsubs = [];
  const playedStatuses = new Set(["played","completed","finished"]);

  const $ = id => document.getElementById(id);
  const sessionId = () => String(currentSession.sessionId || currentSession.activeSessionId || "").trim();
  const active = () => currentSession.active === true && !!sessionId();
  const requestsOpen = () => Object.prototype.hasOwnProperty.call(karaokeState,"songsEnabled")
    ? karaokeState.songsEnabled === true
    : active();
  const preSessionOpen = () => !active() && requestsOpen() && !!String(karaokeState.preSessionRequestSessionId || "").trim();
  const items = () => Array.isArray(runOrder.items) ? runOrder.items : [];
  const playing = () => items().find(item => String(item?.status || "").toLowerCase() === "playing") || null;
  const hasPlayed = () => items().some(item => playedStatuses.has(String(item?.status || "").toLowerCase()));
  const requestText = () => String(websiteSettings.requestButtonText || "REQUEST / SIGN UP").trim() || "REQUEST / SIGN UP";
  const browseText = () => String(websiteSettings.songListButtonText || "BROWSE SONGS").trim() || "BROWSE SONGS";

  function ensureStyles() {
    if ($("liveKaraokePublicRequestLifecycleStyles")) return;
    const style = document.createElement("style");
    style.id = "liveKaraokePublicRequestLifecycleStyles";
    style.textContent = `
      .hero-current-song .request-starting-title{color:#55e68a!important}
      .next-live-label.request-starting-soon{color:#69eca0!important}
      .public-requests-open-chip{display:inline-flex;align-items:center;margin-left:8px;padding:3px 8px;border:1px solid rgba(85,230,138,.45);border-radius:999px;color:#75f0a3;background:rgba(20,82,48,.28);font-size:.68rem;font-weight:850;letter-spacing:.05em}
    `;
    document.head.appendChild(style);
  }

  function enableRequestButtons() {
    const heroButton = $("heroRequestBtn");
    if (heroButton) {
      heroButton.disabled = false;
      heroButton.removeAttribute("href");
      heroButton.className = "main-button hero-request-btn";
      heroButton.setAttribute("aria-disabled","false");
      heroButton.textContent = requestText();
    }

    const browseButton = $("songListBtn");
    if (browseButton) {
      browseButton.disabled = false;
      browseButton.removeAttribute("href");
      browseButton.className = "main-button";
      browseButton.setAttribute("aria-disabled","false");
      browseButton.textContent = browseText();
    }

    const message = $("songListAccessMessage");
    if (message) {
      message.textContent = requestsOpen()
        ? "Browse the song list and send a request while requests are open."
        : "Requests are currently closed, but you can still browse the song list.";
    }
  }

  function renderStartingPanel() {
    const hero = $("heroLiveNow");
    const venue = $("heroLiveVenue");
    const current = $("heroCurrentSong");
    if (!hero || !current) return;

    if (preSessionOpen()) {
      hero.classList.remove("hidden");
      const nextVenue = document.querySelector("#liveStatus .next-live-karaoke-box > strong")?.textContent?.trim();
      if (venue) venue.textContent = nextVenue || "Live Karaoke";
      current.innerHTML = '<span>LIVE PERFORMANCE</span><strong class="request-starting-title">STARTING SOON</strong><small>Requests are open before the performance starts.</small>';
      return;
    }

    if (active() && !playing() && !hasPlayed()) {
      hero.classList.remove("hidden");
      current.innerHTML = '<span>LIVE PERFORMANCE</span><strong class="request-starting-title">STARTING</strong><small>The first song will start shortly.</small>';
      return;
    }

    if (active() && !playing() && hasPlayed()) {
      hero.classList.remove("hidden");
      current.innerHTML = '<span>LIVE PERFORMANCE</span><strong>BETWEEN SONGS</strong><small>The next song will start shortly.</small>';
    }
  }

  function renderPublicStatusLabel() {
    const liveStatus = $("liveStatus");
    if (!liveStatus) return;

    if (preSessionOpen()) {
      const label = liveStatus.querySelector(".next-live-label");
      if (label) {
        label.textContent = "STARTING SOON · REQUESTS OPEN";
        label.classList.add("request-starting-soon");
      }
      return;
    }

    if (active()) {
      const strong = liveStatus.querySelector(".public-live-box strong");
      if (strong && !liveStatus.querySelector(".public-requests-open-chip")) {
        const chip = document.createElement("span");
        chip.className = "public-requests-open-chip";
        chip.textContent = requestsOpen() ? "REQUESTS OPEN" : "REQUESTS CLOSED";
        strong.insertAdjacentElement("afterend", chip);
      } else {
        const chip = liveStatus.querySelector(".public-requests-open-chip");
        if (chip) chip.textContent = requestsOpen() ? "REQUESTS OPEN" : "REQUESTS CLOSED";
      }
    }
  }

  function sync() {
    ensureStyles();
    enableRequestButtons();
    renderPublicStatusLabel();
    renderStartingPanel();
  }

  function queueSync() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      sync();
    },0);
  }

  function start() {
    if (!window.firebase) return;
    if (!firebase.apps.length) {
      const config = window.LKFirebaseProjects?.getSelectedConfig?.() || window.LK_FIREBASE_CONFIG;
      if (!config) return;
      firebase.initializeApp(config);
    }
    db = firebase.firestore();

    unsubs.push(db.collection("karaoke").doc("state").onSnapshot(snapshot => {
      karaokeState = snapshot.exists ? (snapshot.data() || {}) : {};
      queueSync();
    }));
    unsubs.push(db.collection("karaokeControl").doc("currentSession").onSnapshot(snapshot => {
      currentSession = snapshot.exists ? (snapshot.data() || {}) : {};
      queueSync();
    }));
    unsubs.push(db.collection("karaokeControl").doc("runOrder").onSnapshot(snapshot => {
      runOrder = snapshot.exists ? (snapshot.data() || {}) : {items:[]};
      queueSync();
    }));
    unsubs.push(db.collection("karaokeControl").doc("liveKaraokeWebsiteSettings").onSnapshot(snapshot => {
      websiteSettings = snapshot.exists ? (snapshot.data() || {}) : {};
      queueSync();
    }));

    queueSync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true});
  else start();

  addEventListener("pagehide", () => unsubs.forEach(unsub => { try { unsub?.(); } catch {} }), {once:true});
})();