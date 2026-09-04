(() => {
  "use strict";

  const cfg = window.ROXANNA_CONFIG || {};
  const db = window.ROXANNA_DB;

  if (!db) {
    console.error("ROXANNA: Firestore unavailable.");
    return;
  }

  const $ = id => document.getElementById(id);
  const terminalStatuses = new Set([
    "played", "completed", "abandoned", "left", "deleted",
    "deletedbyhost", "declined"
  ]);

  let currentControl = {};
  let currentSession = {};
  let activeSessionId = "";
  let runOrder = { sessionId:"", items:[] };
  let publicListControl = {};
  let allLyrics = [];
  let setlists = [];
  let repertoire = [];
  let activeSetlist = null;
  let upcomingEvents = [];
  let cart = [];
  let sessionUnsub = null;
  let toastTimer = null;

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function norm(value) {
    return String(value || "").trim().toLowerCase();
  }

  function actMatches(type) {
    return norm(type) === norm(cfg.actType || cfg.actName || "Roxanna");
  }

  function controlSessionId() {
    return String(currentControl.sessionId || currentControl.activeSessionId || "").trim();
  }

  function currentType() {
    return (
      currentControl.sessionType ||
      currentControl.type ||
      currentSession.sessionType ||
      currentSession.type ||
      currentSession.eventSnapshot?.type ||
      ""
    );
  }

  function isRoxannaLive() {
    return currentControl.active === true && !!controlSessionId() && actMatches(currentType());
  }

  function activeRunItems() {
    if (runOrder.sessionId && activeSessionId && runOrder.sessionId !== activeSessionId) return [];
    return (Array.isArray(runOrder.items) ? runOrder.items : [])
      .filter(item => !terminalStatuses.has(norm(item.status)));
  }

  function playingItem() {
    return activeRunItems().find(item => norm(item.status) === "playing") || null;
  }

  function showToast(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function openModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal(id) {
    $(id)?.classList.add("hidden");
    if (!document.querySelector(".modal:not(.hidden)")) {
      document.body.classList.remove("modal-open");
    }
  }

  function eventStillUpcoming(event) {
    const status = norm(event.status);
    const sessionStatus = norm(event.sessionStatus);
    if (["cancelled","canceled","ended","completed","done"].includes(status)) return false;
    if (["active","live","started","ended","completed","done"].includes(sessionStatus)) return false;
    if (event.activeSessionId || event.startedSessionId || event.completedAt) return false;
    if (currentControl.eventId && event.id === currentControl.eventId) return false;
    return true;
  }

  function eventSortValue(event) {
    return `${event.date || "9999-12-31"}T${event.startTime || "23:59"}`;
  }

  function renderLiveStatus() {
    const card = $("liveCard");
    const heading = $("liveHeading");
    const eyebrow = $("liveEyebrow");
    const box = $("nowPlaying");
    const coming = $("comingUp");
    if (!card || !heading || !box || !coming) return;

    const live = isRoxannaLive();
    card.classList.toggle("is-live", live);

    if (!live) {
      eyebrow.textContent = cfg.actName || "ROXANNA";
      heading.textContent = "NOT LIVE RIGHT NOW";
      box.innerHTML = `
        <span>NOW PLAYING</span>
        <strong>—</strong>
        <small>Current song appears here during a ROXANNA performance.</small>`;
      coming.innerHTML = "";
      renderRequestStatus();
      renderSongRows();
      renderPopularSongs();
      return;
    }

    const venue = currentControl.venue || currentSession.venue || currentSession.eventSnapshot?.venue || "LIVE NOW";
    eyebrow.textContent = "ROXANNA · LIVE NOW";
    heading.textContent = venue;

    const playing = playingItem();
    if (currentSession.breakOpen === true) {
      box.innerHTML = `
        <span>LIVE STATUS</span>
        <strong>CURRENTLY ON BREAK</strong>
        <small>Requests stay open. We'll be back shortly.</small>`;
    } else if (playing) {
      box.innerHTML = `
        <span>NOW PLAYING</span>
        <strong>${esc(playing.songTitle || playing.title || "Song")}</strong>
        <small>${esc(playing.artist || playing.songArtist || "")}</small>`;
    } else {
      box.innerHTML = `
        <span>LIVE STATUS</span>
        <strong>BETWEEN SONGS</strong>
        <small>Waiting for the next song.</small>`;
    }

    const next = activeRunItems()
      .filter(item => !playing || item.id !== playing.id)
      .filter(item => norm(item.status) !== "playing")
      .slice(0,3);

    coming.innerHTML = next.length
      ? `<span class="coming-label">COMING UP</span>${next.map((item,index) => `
          <div class="next-song">
            <b>${index + 1}</b>
            <div>
              <strong>${esc(item.songTitle || item.title || "Song")}</strong>
              <small>${esc(item.artist || item.songArtist || "")}</small>
            </div>
          </div>`).join("")}`
      : `<span class="coming-label">REQUESTS OPEN</span>`;

    renderRequestStatus();
    renderSongRows();
    renderPopularSongs();
  }

  function renderRequestStatus() {
    const el = $("requestStatusText");
    const submit = $("submitRequestBtn");
    const openForm = $("openRequestFormBtn");
    const live = isRoxannaLive();

    if (el) {
      el.textContent = live
        ? "Requests are open — choose a song and send it to the band."
        : (cfg.copy?.requestClosed || "Requests open while ROXANNA is performing.");
    }
    if (submit) submit.disabled = !live || !cart.length;
    if (openForm) openForm.disabled = !live || !cart.length;
  }

  function songById(id) {
    return allLyrics.find(song => song.id === id) || null;
  }

  function getPreferredOfflineSetlist() {
    const preferredId = String(cfg.repertoireSetlistId || "").trim();
    if (preferredId) return setlists.find(item => item.id === preferredId) || null;

    const preferredName = norm(cfg.repertoireSetlistName || cfg.actName || "Roxanna");
    return setlists.find(item => norm(item.name) === preferredName) || null;
  }

  function resolveRepertoire() {
    let chosen = null;

    // The dedicated Roxanna setlist is the default source of truth.
    // A shared LiveSuite public-list override is optional in config.js.
    if (cfg.useLiveSuitePublicSetlistAsLiveOverride === true && isRoxannaLive() && publicListControl.setlistId) {
      chosen = setlists.find(item => item.id === publicListControl.setlistId) || null;
    }

    if (!chosen) chosen = getPreferredOfflineSetlist();
    activeSetlist = chosen;

    if (chosen && Array.isArray(chosen.songIds)) {
      const ids = new Set(chosen.songIds);
      repertoire = allLyrics
        .filter(song => ids.has(song.id))
        .sort((a,b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity:"base" }));
    } else if (cfg.fallbackToAllPublicSongs === true) {
      repertoire = allLyrics
        .filter(song => song.publicSongListVisible !== false)
        .sort((a,b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity:"base" }));
    } else {
      repertoire = [];
    }

    $("songCount").textContent = String(repertoire.length || 0);
    renderPopularSongs();
    renderSongRows();
  }

  function renderPopularSongs() {
    const box = $("popularSongs");
    if (!box) return;

    if (!repertoire.length) {
      box.innerHTML = `<div class="empty-row">${esc(cfg.copy?.noRepertoire || "Roxanna repertoire not configured.")}</div>`;
      return;
    }

    const featuredIds = Array.isArray(cfg.featuredSongIds) ? cfg.featuredSongIds : [];
    let songs = featuredIds.map(songById).filter(song => song && repertoire.some(item => item.id === song.id));
    if (!songs.length) songs = repertoire.slice(0,5);

    const canRequest = isRoxannaLive();
    box.innerHTML = songs.slice(0,5).map(song => `
      <div class="song-preview-row">
        <span class="play-bullet">▶</span>
        <strong>${esc(song.title)}</strong>
        <span class="artist">${esc(song.artist || "")}</span>
        <button class="request-btn" type="button" data-request-song="${esc(song.id)}" ${canRequest ? "" : "disabled"}>
          ${canRequest ? "REQUEST" : "CLOSED"}
        </button>
      </div>`).join("");
  }

  function cartHas(id) {
    return cart.some(song => song.id === id);
  }

  function renderSongRows() {
    const box = $("songList");
    if (!box) return;

    if (!repertoire.length) {
      box.innerHTML = `<div class="empty-row">${esc(cfg.copy?.noRepertoire || "Roxanna repertoire not configured.")}</div>`;
      return;
    }

    const query = norm($("songSearch")?.value);
    const visible = query
      ? repertoire.filter(song => norm(`${song.title} ${song.artist} ${song.year}`).includes(query))
      : repertoire;

    if (!visible.length) {
      box.innerHTML = `<div class="empty-row">No matching songs.</div>`;
      return;
    }

    const canRequest = isRoxannaLive();
    box.innerHTML = visible.map(song => {
      const selected = cartHas(song.id);
      return `
        <div class="song-list-row">
          <div>
            <strong>${esc(song.title)}</strong>
            ${song.year ? `<small style="display:block;color:#776e61;margin-top:3px">${esc(song.year)}</small>` : ""}
          </div>
          <span class="song-artist">${esc(song.artist || "")}</span>
          <button class="song-add-btn${selected ? " selected" : ""}" type="button" data-toggle-song="${esc(song.id)}" ${canRequest ? "" : "disabled"}>
            ${selected ? "✓ ADDED" : "+ ADD"}
          </button>
        </div>`;
    }).join("");
  }

  function toggleSong(id) {
    const song = repertoire.find(item => item.id === id);
    if (!song) return;
    if (!isRoxannaLive()) {
      showToast("Requests are closed until ROXANNA is live.");
      return;
    }

    if (cartHas(id)) cart = cart.filter(item => item.id !== id);
    else cart.push(song);

    renderCart();
    renderSongRows();
  }

  function renderCart() {
    $("cartCount").textContent = String(cart.length);
    renderRequestStatus();

    const box = $("requestSelection");
    if (box) {
      box.innerHTML = cart.length
        ? cart.map(song => `
            <div class="request-selection-row">
              <strong>${esc(song.title)}</strong>
              <span>${esc(song.artist || "")}</span>
            </div>`).join("")
        : `<div class="empty-row">No songs selected.</div>`;
    }
  }

  function openRequestForSong(id) {
    if (!isRoxannaLive()) {
      openModal("songModal");
      showToast("Requests are closed until ROXANNA is live.");
      return;
    }
    if (!cartHas(id)) {
      const song = repertoire.find(item => item.id === id);
      if (song) cart.push(song);
    }
    renderCart();
    openModal("requestModal");
  }

  async function submitRequest() {
    const name = $("requestName")?.value.trim();
    const note = $("requestNote")?.value.trim();
    const message = $("requestMessage");
    const btn = $("submitRequestBtn");

    if (!isRoxannaLive()) {
      if (message) {
        message.textContent = "Requests have closed because the ROXANNA session is no longer active.";
        message.className = "form-message error";
      }
      return;
    }
    if (!name) {
      if (message) {
        message.textContent = "Please enter your name.";
        message.className = "form-message error";
      }
      return;
    }
    if (!cart.length) return;

    btn.disabled = true;
    btn.textContent = "SENDING…";
    if (message) {
      message.textContent = "";
      message.className = "form-message";
    }

    const sessionId = controlSessionId();
    const shared = {
      sessionId,
      listId: activeSetlist?.id || "",
      publicSetlistId: activeSetlist?.id || "",
      publicSetlistName: activeSetlist?.name || cfg.repertoireSetlistName || "Roxanna",
      status: "active",
      singerName: name,
      name,
      requesterName: name,
      requestType: "band-song-request",
      project: cfg.actName || "Roxanna",
      source: "roxanna-website",
      note,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      for (const song of cart) {
        await db.collection("publicSongRequests").add({
          ...shared,
          songId: song.id,
          songTitle: song.title || "",
          artist: song.artist || "",
          songArtist: song.artist || "",
          year: song.year || ""
        });
      }

      const count = cart.length;
      cart = [];
      renderCart();
      renderSongRows();
      renderPopularSongs();
      $("requestName").value = "";
      $("requestNote").value = "";

      if (message) {
        message.textContent = `${count} request${count === 1 ? "" : "s"} sent to ROXANNA.`;
        message.className = "form-message success";
      }
      setTimeout(() => closeModal("requestModal"), 1100);
    } catch (error) {
      console.error("Could not send Roxanna request:", error);
      if (message) {
        message.textContent = "Could not send the request. Please try again.";
        message.className = "form-message error";
      }
    } finally {
      btn.textContent = "SEND TO ROXANNA";
      btn.disabled = !isRoxannaLive() || !cart.length;
    }
  }

  function renderGigs() {
    const box = $("gigsList");
    if (!box) return;

    const events = upcomingEvents
      .filter(event => actMatches(event.type))
      .filter(eventStillUpcoming)
      .sort((a,b) => eventSortValue(a).localeCompare(eventSortValue(b)))
      .slice(0,5);

    if (!events.length) {
      box.innerHTML = `<div class="empty-row">${esc(cfg.copy?.noGigs || "New dates coming soon.")}</div>`;
      return;
    }

    box.innerHTML = events.map(event => {
      const date = event.date ? new Date(`${event.date}T12:00:00`) : null;
      const valid = date && !Number.isNaN(date.getTime());
      const month = valid ? date.toLocaleDateString(undefined,{month:"short"}).toUpperCase() : "TBC";
      const day = valid ? String(date.getDate()).padStart(2,"0") : "—";
      const venue = event.venue || event.name || "Venue TBC";
      const locality = event.venueLocality || event.address || "";
      const maps = [venue,event.address].filter(Boolean).join(", ");
      const mapsUrl = maps ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(maps)}` : "";
      return `
        <div class="gig-row">
          <div class="gig-date"><small>${esc(month)}</small><strong>${esc(day)}</strong></div>
          <div class="gig-main"><strong>${esc(venue)}</strong><small>${esc(locality)}</small></div>
          <div class="gig-time">${esc(event.startTime || "TIME TBC")}</div>
          ${mapsUrl ? `<a class="details-btn" href="${mapsUrl}" target="_blank" rel="noopener">DETAILS</a>` : `<span></span>`}
        </div>`;
    }).join("");
  }

  function renderSocials() {
    const box = $("socialRow");
    if (!box) return;
    const links = [
      ["FACEBOOK",cfg.facebookUrl],
      ["INSTAGRAM",cfg.instagramUrl],
      ["YOUTUBE",cfg.youtubeUrl],
      ["TIKTOK",cfg.tiktokUrl],
      ["EMAIL",cfg.contactEmail ? `mailto:${cfg.contactEmail}` : ""]
    ].filter(([,url]) => !!url);

    box.innerHTML = links.length
      ? links.map(([label,url]) => `<a class="social-link" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`).join("")
      : `<span class="empty-row" style="padding:0;text-align:left">Add social links in <code>js/config.js</code>.</span>`;
  }

  function action(name) {
    if (name === "request") {
      openModal("songModal");
      if (!isRoxannaLive()) showToast("You can browse now; requests open while ROXANNA is live.");
      return;
    }
    if (name === "songs") return openModal("songModal");
    if (name === "gigs") return $("gigsSection")?.scrollIntoView({behavior:"smooth"});
    if (name === "connect") return $("connectSection")?.scrollIntoView({behavior:"smooth"});
    if (name === "tips") {
      if (cfg.tipUrl) window.open(cfg.tipUrl,"_blank","noopener");
      else showToast("Add your digital tip link in js/config.js.");
      return;
    }
    if (name === "media") {
      if (cfg.mediaUrl) window.open(cfg.mediaUrl,"_blank","noopener");
      else showToast("Add your video/music link in js/config.js.");
    }
  }

  async function shareSite() {
    const data = { title:"ROXANNA", text:"ROXANNA — Live Music", url:location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(location.href);
        showToast("Website link copied.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") console.warn(error);
    }
  }

  function listenPerformanceSession() {
    if (sessionUnsub) {
      sessionUnsub();
      sessionUnsub = null;
    }
    currentSession = {};
    const id = controlSessionId();
    activeSessionId = currentControl.active === true ? id : "";

    if (!activeSessionId) {
      renderLiveStatus();
      resolveRepertoire();
      return;
    }

    sessionUnsub = db.collection("performanceSessions").doc(activeSessionId).onSnapshot(doc => {
      currentSession = doc.exists ? { id:doc.id, ...(doc.data() || {}) } : {};
      renderLiveStatus();
      resolveRepertoire();
    }, error => console.warn("ROXANNA performance session listener failed:", error));
  }

  async function loadLibrary() {
    try {
      const [lyricsSnap,setlistsSnap] = await Promise.all([
        db.collection("lyrics").get(),
        db.collection("lyricsSetlists").get()
      ]);

      allLyrics = lyricsSnap.docs.map(doc => {
        const data = doc.data() || {};
        return {
          id:doc.id,
          title:data.title || "",
          artist:data.artist || "",
          year:data.year || "",
          publicSongListVisible:data.publicSongListVisible !== false
        };
      }).filter(song => song.title);

      setlists = setlistsSnap.docs.map(doc => ({ id:doc.id, ...(doc.data() || {}) }));
      resolveRepertoire();
    } catch (error) {
      console.error("ROXANNA library load failed:", error);
      $("popularSongs").innerHTML = `<div class="empty-row">Could not load the repertoire.</div>`;
      $("songList").innerHTML = `<div class="empty-row">Could not load the repertoire.</div>`;
    }
  }

  function startListeners() {
    db.collection("karaokeControl").doc("currentSession").onSnapshot(doc => {
      const previous = controlSessionId();
      currentControl = doc.exists ? (doc.data() || {}) : {};
      const next = controlSessionId();
      if (previous !== next || !sessionUnsub) listenPerformanceSession();
      else {
        activeSessionId = currentControl.active === true ? next : "";
        renderLiveStatus();
        resolveRepertoire();
      }
    }, error => console.warn("ROXANNA current session listener failed:", error));

    db.collection("karaokeControl").doc("runOrder").onSnapshot(doc => {
      runOrder = doc.exists ? { sessionId:"",items:[],...(doc.data() || {}) } : { sessionId:"",items:[] };
      renderLiveStatus();
    }, error => console.warn("ROXANNA run order listener failed:", error));

    db.collection("karaokeControl").doc("publicSongList").onSnapshot(doc => {
      publicListControl = doc.exists ? (doc.data() || {}) : {};
      resolveRepertoire();
    }, error => console.warn("ROXANNA public list listener failed:", error));

    db.collection("upcomingEvents").onSnapshot(snapshot => {
      upcomingEvents = snapshot.docs.map(doc => ({ id:doc.id, ...(doc.data() || {}) }));
      renderGigs();
    }, error => console.warn("ROXANNA upcoming gigs listener failed:", error));
  }

  function bind() {
    document.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", () => action(el.dataset.action));
    });

    document.querySelectorAll("[data-close]").forEach(el => {
      el.addEventListener("click", () => closeModal(el.dataset.close));
    });

    document.querySelectorAll(".modal").forEach(modal => {
      modal.addEventListener("click", event => {
        if (event.target === modal) closeModal(modal.id);
      });
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        document.querySelectorAll(".modal:not(.hidden)").forEach(modal => closeModal(modal.id));
      }
    });

    $("songSearch")?.addEventListener("input", renderSongRows);
    $("clearCartBtn")?.addEventListener("click", () => {
      cart = [];
      renderCart();
      renderSongRows();
    });
    $("openRequestFormBtn")?.addEventListener("click", () => {
      if (!cart.length || !isRoxannaLive()) return;
      renderCart();
      openModal("requestModal");
    });
    $("submitRequestBtn")?.addEventListener("click", submitRequest);
    $("shareBtn")?.addEventListener("click", shareSite);

    document.addEventListener("click", event => {
      const toggle = event.target.closest("[data-toggle-song]");
      if (toggle) return toggleSong(toggle.dataset.toggleSong);
      const request = event.target.closest("[data-request-song]");
      if (request) return openRequestForSong(request.dataset.requestSong);
    });
  }

  function init() {
    $("year").textContent = String(new Date().getFullYear());
    $("liveEyebrow").textContent = cfg.actName || "ROXANNA";
    bind();
    renderSocials();
    renderCart();
    renderRequestStatus();
    loadLibrary();
    startListeners();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
