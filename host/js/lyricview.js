(() => {
  const $ = id => document.getElementById(id);
  const songId = new URLSearchParams(location.search).get("id");
  let song = null;
  let chordShift = 0;
  let tabShift = 0;
  let capoDisplay = 0;
  let fontScale = 1;
  let scrollSpeed = 1;
  let scrolling = false;
  let scrollFrame = null;
  let sectionElements = [];
  let activeSectionIndex = 0;

  if (!songId) {
    $("hostLyricsContent").innerHTML = '<div class="error-state">No song selected.</div>';
    return;
  }

  function loadSong() {
    db.collection("lyrics").doc(songId).onSnapshot(doc => {
      if (!doc.exists) {
        $("hostLyricsContent").innerHTML = '<div class="error-state">Song not found.</div>';
        return;
      }
      song = LyricsCommon.normalizeSong(doc.data(), doc.id);
      capoDisplay = Number(String(song.capo || "0").match(/-?\d+/)?.[0] || 0);
      renderSong();
    }, error => {
      console.error(error);
      $("hostLyricsContent").innerHTML = `<div class="error-state">${LyricsCommon.escapeHTML(error.message)}</div>`;
    });
  }

  function sectionTitle(section, isTab, fallback) {
    return section.title || (isTab ? "GUITAR TAB" : fallback);
  }

  function createCollapsibleSection(section, index, contentHTML, extraClass = "") {
    const block = document.createElement("section");
    const collapsed = section.collapsed === true;
    block.className = `host-section collapsible-host-section ${extraClass} ${collapsed ? "is-collapsed" : ""}`;
    block.dataset.sectionIndex = index;
    const title = sectionTitle(section, extraClass.includes("host-tab-section"), `SECTION ${index + 1}`);
    block.innerHTML = `
      <button class="host-section-toggle" type="button" aria-expanded="${collapsed ? "false" : "true"}">
        <span>${LyricsCommon.escapeHTML(title)}${extraClass.includes("host-tab-section") ? " (TAB)" : ""}</span>
        <small>${collapsed ? "▼ OPEN" : "▲ HIDE"}</small>
      </button>
      <div class="host-section-body" ${collapsed ? "hidden" : ""}>${contentHTML}</div>`;
    const toggle = block.querySelector(".host-section-toggle");
    const body = block.querySelector(".host-section-body");
    toggle.onclick = () => {
      const isCollapsed = block.classList.toggle("is-collapsed");
      body.hidden = isCollapsed;
      toggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      toggle.querySelector("small").textContent = isCollapsed ? "▼ OPEN" : "▲ HIDE";
    };
    return block;
  }

  function renderSong() {
    $("topTitle").textContent = song.title;
    $("topArtist").textContent = song.artist;
    $("summaryKey").textContent = song.key || "—";
    $("summaryTime").textContent = song.timeSignature || "4/4";
    $("summaryTempo").textContent = song.userBpm ? `${song.userBpm} BPM` : "—";
    $("summaryCapo").textContent = capoDisplay;
    $("summaryOriginalBpm").textContent = song.originalBpm ? `${song.originalBpm} BPM` : "—";
    $("summaryYear").textContent = song.year || "—";
    $("summaryNote").textContent = song.note || "No song notes.";
    $("chordTransposeValue").textContent = chordShift;
    $("tabTransposeValue").textContent = tabShift;
    $("capoValue").textContent = capoDisplay;
    $("chordKeyLabel").textContent = song.key ? `${LyricsCommon.transposeRoot(song.key, chordShift)} ${chordShift ? `(from ${song.key})` : "(Original)"}` : "Original key";
    $("youtubeLink").classList.toggle("hidden", !song.youtubeLink);
    if (song.youtubeLink) $("youtubeLink").href = song.youtubeLink;
    $("hostNotes").textContent = song.note || "No host-only notes saved.";
    $("editSongBtn").onclick = () => location.href = `lyricscreator.html?firebaseId=${encodeURIComponent(song.firebaseId)}`;

    const content = $("hostLyricsContent");
    content.innerHTML = "";
    sectionElements = [];

    (song.sections || []).forEach((section, index) => {
      if (section.type === "separator") {
        const hr = document.createElement("hr");
        hr.className = "host-separator";
        content.appendChild(hr);
        return;
      }

      if (section.type === "performanceNote" || section.type === "performance-note") {
        const cueHTML = `<div class="performance-cue host-cue">${LyricsCommon.escapeHTML(section.text || section.title || "Performance cue")}</div>`;
        const block = createCollapsibleSection(section, index, cueHTML, "host-performance-note-section");
        content.appendChild(block);
        sectionElements.push(block);
        return;
      }

      if (section.type === "hostNote" || section.type === "host-note") {
        const noteHTML = `<div class="host-only-section-note">${LyricsCommon.escapeHTML(section.text || section.html || "Host note")}</div>`;
        const block = createCollapsibleSection(section, index, noteHTML, "host-only-note-section");
        content.appendChild(block);
        sectionElements.push(block);
        return;
      }

      const isTab = section.type === "tab" || /tab-block/.test(section.html || "");
      const raw = LyricsCommon.stripEditorControls(section.html || "");
      const chorded = LyricsCommon.transposeChordHTML(raw, chordShift);
      const finalHtml = isTab ? LyricsCommon.transposeTabHTML(chorded, tabShift) : chorded;
      const block = createCollapsibleSection(section, index, finalHtml, isTab ? "host-tab-section" : "");
      block.style.fontFamily = section.style?.fontFamily || "inherit";
      block.style.fontSize = section.style?.fontSize ? `${section.style.fontSize}px` : "";
      block.style.color = section.style?.color || "";
      content.appendChild(block);
      sectionElements.push(block);
    });

    content.style.setProperty("--host-font-scale", fontScale);
    renderPerformanceNotes();
    renderStructure();
    renderTabOverview();
  }

  function renderPerformanceNotes() {
    const notes = LyricsCommon.getPerformanceNotes(song);
    $("performanceNotesList").innerHTML = notes.length
      ? notes.map(note => `<div>♫ ${LyricsCommon.escapeHTML(note)}</div>`).join("")
      : '<span class="muted">No singer-visible performance notes.</span>';
  }

  function renderStructure() {
    $("songStructure").innerHTML = (song.sections || [])
      .filter(section => section.type !== "separator")
      .map((section, index) => `<button data-jump="${index}" type="button"><span>${LyricsCommon.escapeHTML(section.title || section.type || `Section ${index + 1}`)}</span><small>${section.type || "lyrics"}</small></button>`)
      .join("");
  }

  function renderTabOverview() {
    const tabs = (song.sections || []).filter(section => section.type === "tab" || /tab-block/.test(section.html || ""));
    const wrap = $("tabOverview");
    if (!tabs.length) {
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    wrap.innerHTML = `<h3>GUITAR TABS · TAB SHIFT ${tabShift >= 0 ? "+" : ""}${tabShift}</h3>${tabs.slice(0, 1).map(section => LyricsCommon.transposeTabHTML(LyricsCommon.stripEditorControls(section.html || ""), tabShift)).join("")}`;
  }

  async function sendToSinger() {
    if (!song) return;
    const button = $("sendSingerBtn");
    button.disabled = true;
    $("sendStatus").textContent = "Sending…";
    try {
      await db.collection("karaokeControl").doc("liveLyrics").set({
        currentLyricsSongId: song.firebaseId,
        currentSongId: song.firebaseId,
        songTitle: song.title,
        songArtist: song.artist,
        chordTranspose: chordShift,
        sentAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      $("sendStatus").textContent = "Sent to karaoke ✓";
      setTimeout(() => $("sendStatus").textContent = "", 3000);
    } catch (error) {
      console.error(error);
      $("sendStatus").textContent = `Send failed: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  function setSidebarOpen(open) {
    const sidebar = $("hostSidebar");
    const backdrop = $("sidebarBackdrop");
    const toggle = $("sidebarToggleBtn");
    sidebar.classList.toggle("open", open);
    sidebar.setAttribute("aria-hidden", open ? "false" : "true");
    backdrop.classList.toggle("hidden", !open);
    document.body.classList.toggle("host-sidebar-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.classList.toggle("active", open);
    toggle.textContent = open ? "✕ CLOSE INFO" : "☰ SONG INFO";
  }

  function toggleSidebar() {
    setSidebarOpen(!$("hostSidebar").classList.contains("open"));
  }

  function autoScrollLoop() {
    if (!scrolling) return;
    window.scrollBy(0, 0.35 * scrollSpeed);
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      scrolling = false;
      $("playScrollBtn").textContent = "▶";
      return;
    }
    scrollFrame = requestAnimationFrame(autoScrollLoop);
  }

  function toggleScroll() {
    scrolling = !scrolling;
    $("playScrollBtn").textContent = scrolling ? "Ⅱ" : "▶";
    if (scrolling) autoScrollLoop();
    else cancelAnimationFrame(scrollFrame);
  }

  document.addEventListener("click", event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "chord-minus") { chordShift--; renderSong(); }
    if (action === "chord-plus") { chordShift++; renderSong(); }
    if (action === "tab-minus") { tabShift--; renderSong(); }
    if (action === "tab-plus") { tabShift++; renderSong(); }
    if (action === "capo-minus") { capoDisplay = Math.max(0, capoDisplay - 1); renderSong(); }
    if (action === "capo-plus") { capoDisplay++; renderSong(); }
    const jump = event.target.closest("[data-jump]");
    if (jump) document.querySelector(`[data-section-index="${jump.dataset.jump}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("sendSingerBtn").onclick = sendToSinger;
  $("sidebarToggleBtn").onclick = toggleSidebar;
  $("sidebarCloseBtn").onclick = () => setSidebarOpen(false);
  $("sidebarBackdrop").onclick = () => setSidebarOpen(false);
  $("singerPreviewBtn").onclick = () => window.open("karaoke-lyric-view.html", "karaokeSingerView");
  $("fontDownBtn").onclick = () => { fontScale = Math.max(.75, fontScale - .1); renderSong(); };
  $("fontUpBtn").onclick = () => { fontScale = Math.min(1.8, fontScale + .1); renderSong(); };
  $("fullscreenBtn").onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  $("playScrollBtn").onclick = toggleScroll;
  $("scrollToggleBtn").onclick = toggleScroll;
  $("speedDownBtn").onclick = () => { scrollSpeed = Math.max(.25, scrollSpeed - .25); $("speedLabel").textContent = `${scrollSpeed.toFixed(2)}×`; };
  $("speedUpBtn").onclick = () => { scrollSpeed = Math.min(3, scrollSpeed + .25); $("speedLabel").textContent = `${scrollSpeed.toFixed(2)}×`; };
  $("prevSectionBtn").onclick = () => { activeSectionIndex = Math.max(0, activeSectionIndex - 1); sectionElements[activeSectionIndex]?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  $("nextSectionBtn").onclick = () => { activeSectionIndex = Math.min(sectionElements.length - 1, activeSectionIndex + 1); sectionElements[activeSectionIndex]?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  $("favouriteBtn").onclick = () => { const key = `fav:${songId}`; const on = localStorage.getItem(key) === "1"; localStorage.setItem(key, on ? "0" : "1"); $("favouriteBtn").textContent = on ? "☆" : "★"; };
  $("liveSessionBtn").onclick = () => window.open("../../admin-new/admin.html", "_blank");

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setSidebarOpen(false);
  });

  loadSong();
})();
