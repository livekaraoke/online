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
  let legacyMarkerMigrationAttempted = false;
  let myNotesSaveTimer = null;
  let lastSavedMyNotes = "";

  if (!songId) {
    $("hostLyricsContent").innerHTML = '<div class="error-state">No song selected.</div>';
    return;
  }

  /**********************************************************************
   * TEMPORARY ONE-TIME DATABASE CLEANUP — REMOVE LEGACY LEADING "●"
   *
   * This migration runs once when lyricview.html loads. It scans EVERY
   * document in the Firebase "lyrics" collection and removes a standalone
   * "●" only when it is the first meaningful line of a saved section.
   * Firestore batches are kept below the 500-operation limit.
   *
   * DELETE this entire marked block, plus the temporary call in loadSong(),
   * after the migration has completed successfully for all songs.
   **********************************************************************/
  function stripLegacyLeadingMarkerFromHTML(html) {
    const original = String(html || "");
    if (!original.trim()) return original;

    const holder = document.createElement("div");
    holder.innerHTML = original;

    while (
      holder.firstChild &&
      holder.firstChild.nodeType === Node.TEXT_NODE &&
      !holder.firstChild.textContent.trim()
    ) {
      holder.firstChild.remove();
    }

    const first = holder.firstChild;
    if (
      first &&
      first.nodeType === Node.ELEMENT_NODE &&
      first.textContent.trim() === "●"
    ) {
      first.remove();
      return holder.innerHTML.replace(/^(?:\s|&nbsp;|<br\s*\/?\s*>)+/i, "");
    }

    return original
      .replace(/^\s*●\s*(?:<br\s*\/?\s*>|\r?\n)/i, "")
      .replace(/^\s*<span[^>]*>\s*●\s*<\/span>\s*(?:<br\s*\/?\s*>)?/i, "");
  }

  function stripLegacyLeadingMarkerFromText(text) {
    return String(text || "").replace(/^\s*●\s*(?:\r?\n|$)/, "");
  }

  function cleanLegacyMarkersFromSongData(rawSong) {
    if (!Array.isArray(rawSong.sections)) {
      return { changed: false, data: rawSong };
    }

    let changed = false;
    const sections = rawSong.sections.map(section => {
      const cleaned = { ...section };

      if (typeof cleaned.html === "string") {
        const nextHTML = stripLegacyLeadingMarkerFromHTML(cleaned.html);
        if (nextHTML !== cleaned.html) {
          cleaned.html = nextHTML;
          changed = true;
        }
      }

      if (typeof cleaned.text === "string") {
        const nextText = stripLegacyLeadingMarkerFromText(cleaned.text);
        if (nextText !== cleaned.text) {
          cleaned.text = nextText;
          changed = true;
        }
      }

      return cleaned;
    });

    return {
      changed,
      data: changed ? { ...rawSong, sections } : rawSong
    };
  }

  async function migrateLegacySectionMarkersAcrossDatabase() {
    if (legacyMarkerMigrationAttempted) return;
    legacyMarkerMigrationAttempted = true;

    const snapshot = await db.collection("lyrics").get();
    const updates = [];

    snapshot.forEach(doc => {
      const cleaned = cleanLegacyMarkersFromSongData(doc.data() || {});
      if (cleaned.changed) {
        updates.push({ ref: doc.ref, sections: cleaned.data.sections });
      }
    });

    for (let offset = 0; offset < updates.length; offset += 450) {
      const batch = db.batch();
      updates.slice(offset, offset + 450).forEach(update => {
        batch.set(update.ref, {
          sections: update.sections,
          legacyLeadingMarkersRemoved: true,
          legacyLeadingMarkersRemovedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
    }

    console.info(`Legacy leading ● migration complete. Updated ${updates.length} song(s).`);
  }
  /**************** END TEMPORARY LEGACY MARKER CLEANUP ****************/

  function loadSong() {
    db.collection("lyrics").doc(songId).onSnapshot(async doc => {
      if (!doc.exists) {
        $("hostLyricsContent").innerHTML = '<div class="error-state">Song not found.</div>';
        return;
      }

      const rawSong = doc.data() || {};

      try {
        // TEMPORARY MIGRATION CALL — remove together with the block above.
        await migrateLegacySectionMarkersAcrossDatabase();
      } catch (migrationError) {
        console.error("Legacy marker cleanup failed:", migrationError);
        // Continue loading the song even if migration permissions fail.
      }

      // Also clean the current snapshot locally so the old marker never flashes.
      const locallyCleanedSong = cleanLegacyMarkersFromSongData(rawSong).data;
      song = LyricsCommon.normalizeSong(locallyCleanedSong, doc.id);
      // Preserve the private sidebar note field even if normalizeSong only returns known fields.
      song.myNotes = locallyCleanedSong.myNotes || "";
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

  function bpmNumber(value) {
    const number = Number(String(value || "").match(/\d+(?:\.\d+)?/)?.[0]);
    return Number.isFinite(number) ? number : null;
  }

  function updateTempoStyling() {
    const tempoEl = $("summaryTempo");
    const originalEl = $("summaryOriginalBpm");
    if (!tempoEl || !originalEl || !song) return;

    const tempo = bpmNumber(song.userBpm);
    const original = bpmNumber(song.originalBpm);

    tempoEl.classList.remove("tempo-match", "tempo-different", "tempo-unknown");
    originalEl.classList.remove("original-bpm-different", "original-bpm-match");

    if (tempo === null || original === null) {
      tempoEl.classList.add("tempo-unknown");
      return;
    }

    if (Math.abs(tempo - original) < 0.001) {
      tempoEl.classList.add("tempo-match");
      originalEl.classList.add("original-bpm-match");
    } else {
      tempoEl.classList.add("tempo-different");
      originalEl.classList.add("original-bpm-different");
    }
  }

  function htmlToPlainText(value) {
    const holder = document.createElement("div");
    holder.innerHTML = String(value || "");
    return holder.innerText.trim();
  }

  function renderHostLyricNotes() {
    const notes = (song.sections || [])
      .filter(section => section.type === "hostNote" || section.type === "host-note")
      .map(section => ({
        title: section.title || "Host Note",
        text: htmlToPlainText(section.text || section.html || "")
      }))
      .filter(note => note.text || note.title);

    $("hostNotes").innerHTML = notes.length
      ? notes.map(note => `
          <div class="host-lyric-note-item">
            <strong>${LyricsCommon.escapeHTML(note.title)}</strong>
            <span>${LyricsCommon.escapeHTML(note.text || "—")}</span>
          </div>`).join("")
      : '<span class="muted">No Host Note sections saved in these lyrics.</span>';
  }

  function syncMyNotesInput() {
    const input = $("myNotesInput");
    if (!input || document.activeElement === input || input.dataset.dirty === "true") return;
    input.value = song.myNotes || "";
    lastSavedMyNotes = input.value;
  }

  async function getActivePerformanceSessionId() {
    try {
      const snap = await db.collection("karaokeControl").doc("currentSession").get();
      if (!snap.exists) return null;
      const data = snap.data() || {};
      if (data.active === false) return null;
      return data.sessionId || data.activeSessionId || null;
    } catch (error) {
      console.warn("Could not read the current performance session:", error);
      return null;
    }
  }

  async function saveMyNotes() {
    const input = $("myNotesInput");
    const status = $("myNotesSaveStatus");
    if (!input || !song) return;

    const note = input.value;
    if (note === lastSavedMyNotes) {
      input.dataset.dirty = "false";
      return;
    }

    status.textContent = "Saving…";

    try {
      await db.collection("lyrics").doc(song.firebaseId).set({
        myNotes: note,
        myNotesUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const sessionId = await getActivePerformanceSessionId();
      if (sessionId) {
        const entry = {
          type: "songMyNotesEdited",
          message: `Edited Note in ${song.title || "Untitled"} - ${song.artist || "Unknown Artist"}`,
          songId: song.firebaseId,
          songTitle: song.title || "",
          songArtist: song.artist || "",
          note,
          editedAt: firebase.firestore.Timestamp.now()
        };

        await db.collection("performanceSessions").doc(sessionId).set({
          activityLog: firebase.firestore.FieldValue.arrayUnion(entry),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      song.myNotes = note;
      lastSavedMyNotes = note;
      input.dataset.dirty = "false";
      status.textContent = sessionId ? "Saved and logged in the active session." : "Saved.";
      setTimeout(() => {
        if (status.textContent.startsWith("Saved")) status.textContent = "";
      }, 2600);
    } catch (error) {
      console.error("Could not save My Notes:", error);
      status.textContent = `Save failed: ${error.message}`;
    }
  }

  function queueMyNotesSave() {
    const input = $("myNotesInput");
    if (!input) return;
    input.dataset.dirty = "true";
    $("myNotesSaveStatus").textContent = "Unsaved changes…";
    clearTimeout(myNotesSaveTimer);
    myNotesSaveTimer = setTimeout(saveMyNotes, 900);
  }

  function renderSong() {
    $("topTitle").textContent = song.title;
    $("topArtist").textContent = song.artist;
    $("summaryKey").textContent = song.key || "—";
    $("summaryTime").textContent = song.timeSignature || "4/4";
    $("summaryTempo").textContent = song.userBpm ? `${song.userBpm} BPM` : "—";
    $("summaryCapo").textContent = capoDisplay;
    $("summaryOriginalBpm").textContent = song.originalBpm ? `${song.originalBpm} BPM` : "—";
    updateTempoStyling();
    $("summaryYear").textContent = song.year || "—";
    $("summaryNote").textContent = song.note || "No song notes.";
    $("chordTransposeValue").textContent = chordShift;
    $("tabTransposeValue").textContent = tabShift;
    $("capoValue").textContent = capoDisplay;
    $("chordKeyLabel").textContent = song.key ? `${LyricsCommon.transposeRoot(song.key, chordShift)} ${chordShift ? `(from ${song.key})` : "(Original)"}` : "Original key";
    $("youtubeLink").classList.toggle("hidden", !song.youtubeLink);
    if (song.youtubeLink) $("youtubeLink").href = song.youtubeLink;
    renderHostLyricNotes();
    syncMyNotesInput();
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
        displayState: "loading",
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

  async function resetKaraoke() {
    const button = $("resetKaraokeBtn");
    if (button) button.disabled = true;
    $("sendStatus").textContent = "Resetting karaoke…";

    try {
      await db.collection("karaokeControl").doc("liveLyrics").set({
        currentLyricsSongId: "",
        currentSongId: "",
        songTitle: "",
        songArtist: "",
        chordTranspose: 0,
        displayState: "idle",
        resetAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      $("sendStatus").textContent = "Karaoke reset ✓";
      setTimeout(() => $("sendStatus").textContent = "", 3000);
      setSendMenuOpen(false);
    } catch (error) {
      console.error(error);
      $("sendStatus").textContent = `Reset failed: ${error.message}`;
    } finally {
      if (button) button.disabled = false;
    }
  }

  function setSendMenuOpen(open) {
    const menu = $("sendKaraokeMenu");
    const arrow = $("sendKaraokeMenuBtn");
    menu.classList.toggle("hidden", !open);
    arrow.setAttribute("aria-expanded", open ? "true" : "false");
    arrow.textContent = open ? "▲" : "▼";
  }

  /**********************************************************************
   * LEGACY SLAVE-LYRICS TOOL
   * Loads songs from ../adm/files/song-data.js where hasLyrics === true,
   * then writes currentSongId for adm/host/lyrics/song.html.
   **********************************************************************/
  function legacySongCatalogue() {
    // song-data.js has used both a global `songs` variable and window.songs
    // in different versions of the project. Support both without fetching.
    if (typeof songs !== "undefined" && Array.isArray(songs)) return songs;
    if (Array.isArray(window.songs)) return window.songs;
    if (Array.isArray(window.songData)) return window.songData;
    if (Array.isArray(window.karaokeSongs)) return window.karaokeSongs;
    return [];
  }

  function legacySongIdFromUrl(url) {
    const text = String(url || "");
    try {
      const parsed = new URL(text, window.location.href);
      return parsed.searchParams.get("id") || "";
    } catch (_) {
      const match = text.match(/[?&]id=([^&#]+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    }
  }

  function populateLegacyLyricsSongs() {
    const select = $("legacyLyricsSongSelect");
    if (!select) return;

    const list = legacySongCatalogue()
      .filter(item => item && item.hasLyrics === true)
      .map(item => ({
        id: legacySongIdFromUrl(item.url),
        title: String(item.title || "Untitled"),
        artist: String(item.artist || "Unknown Artist")
      }))
      .filter(item => item.id)
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

    select.innerHTML = '<option value="">Choose lyrics to send…</option>' +
      list.map(item => `<option value="${LyricsCommon.escapeHTML(item.id)}">${LyricsCommon.escapeHTML(item.title)} - ${LyricsCommon.escapeHTML(item.artist)}</option>`).join("");

    if (!list.length) {
      select.innerHTML = '<option value="">No hasLyrics songs found</option>';
      console.error(
        "SLAVE LYRICS catalogue is empty. Confirm ../adm/files/song-data.js exists and exposes songs, window.songs, window.songData, or window.karaokeSongs."
      );
    }
  }

  async function sendLegacyLyrics() {
    const select = $("legacyLyricsSongSelect");
    const status = $("legacyLyricsStatus");
    const button = $("sendLegacyLyricsBtn");
    const selectedId = select?.value || "";

    if (!selectedId) {
      if (status) status.textContent = "Choose a song first.";
      return;
    }

    const selectedOption = select.options[select.selectedIndex];
    button.disabled = true;
    if (status) status.textContent = "Sending lyrics…";

    try {
      await db.collection("karaokeControl").doc("liveLyrics").set({
        currentSongId: selectedId,
        legacySongLabel: selectedOption?.textContent || selectedId,
        legacyLyricsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      if (status) status.textContent = "Lyrics sent ✓";
      setTimeout(() => {
        if (status?.textContent === "Lyrics sent ✓") status.textContent = "";
      }, 2600);
    } catch (error) {
      console.error("Could not send legacy lyrics:", error);
      if (status) status.textContent = `Send failed: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  function setSidebarOpen(open) {
    const sidebar = $("hostSidebar");
    const toggle = $("sidebarToggleBtn");
    sidebar.classList.toggle("open", open);
    sidebar.setAttribute("aria-hidden", open ? "false" : "true");
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
  $("sendLegacyLyricsBtn").onclick = sendLegacyLyrics;
  $("sendKaraokeMenuBtn").onclick = event => {
    event.stopPropagation();
    setSendMenuOpen($("sendKaraokeMenu").classList.contains("hidden"));
  };
  $("resetKaraokeBtn").onclick = resetKaraoke;
  $("sidebarToggleBtn").onclick = toggleSidebar;
  $("sidebarCloseBtn").onclick = () => setSidebarOpen(false);
  $("singerPreviewBtn").onclick = () => window.open("karaoke-lyric-view.html", "karaokeSingerView");
  $("fontDownBtn").onclick = () => { fontScale = Math.max(.75, fontScale - .1); renderSong(); };
  $("fontUpBtn").onclick = () => { fontScale = Math.min(1.8, fontScale + .1); renderSong(); };
  $("fullscreenBtn").onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  $("adminShortcutBtn").onclick = () => window.open("../admin-new/admin.html", "_blank", "noopener");
  $("myNotesInput").addEventListener("input", queueMyNotesSave);
  $("playScrollBtn").onclick = toggleScroll;
  $("scrollToggleBtn").onclick = toggleScroll;
  $("speedDownBtn").onclick = () => { scrollSpeed = Math.max(.25, scrollSpeed - .25); $("speedLabel").textContent = `${scrollSpeed.toFixed(2)}×`; };
  $("speedUpBtn").onclick = () => { scrollSpeed = Math.min(3, scrollSpeed + .25); $("speedLabel").textContent = `${scrollSpeed.toFixed(2)}×`; };
  $("prevSectionBtn").onclick = () => { activeSectionIndex = Math.max(0, activeSectionIndex - 1); sectionElements[activeSectionIndex]?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  $("nextSectionBtn").onclick = () => { activeSectionIndex = Math.min(sectionElements.length - 1, activeSectionIndex + 1); sectionElements[activeSectionIndex]?.scrollIntoView({ behavior: "smooth", block: "center" }); };

  document.addEventListener("click", event => {
    if (!event.target.closest(".send-karaoke-split")) setSendMenuOpen(false);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      setSidebarOpen(false);
      setSendMenuOpen(false);
    }
  });

  populateLegacyLyricsSongs();
  loadSong();
})();
