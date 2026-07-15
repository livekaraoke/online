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

  function renderSong() {
    $("topTitle").textContent = song.title;
    $("topArtist").textContent = song.artist;
    $("summaryKey").textContent = song.key || "—";
    $("summaryTime").textContent = song.timeSignature || "4/4";
    $("summaryTempo").textContent = song.userBpm ? `${song.userBpm} BPM` : "—";
    $("summaryCapo").textContent = capoDisplay;
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
        const hr = document.createElement("hr"); hr.className = "host-separator"; content.appendChild(hr); return;
      }
      if (section.type === "performanceNote" || section.type === "performance-note") {
        const cue = document.createElement("div"); cue.className="performance-cue host-cue"; cue.textContent=section.text||section.title||section.html||"Performance cue"; content.appendChild(cue); sectionElements.push(cue); return;
      }
      const isTab = section.type === "tab" || /tab-block/.test(section.html || "");
      const block = document.createElement("section");
      block.className = `host-section ${isTab ? "host-tab-section" : ""}`;
      block.dataset.sectionIndex = index;
      const raw = LyricsCommon.stripEditorControls(section.html || "");
      const chorded = LyricsCommon.transposeChordHTML(raw, chordShift);
      const finalHtml = isTab ? LyricsCommon.transposeTabHTML(chorded, tabShift) : chorded;
      block.innerHTML = `${section.title ? `<h2>${LyricsCommon.escapeHTML(section.title)}${isTab ? " (TAB)" : ""}</h2>` : ""}<div class="host-section-body">${finalHtml}</div>`;
      block.style.fontFamily = section.style?.fontFamily || "inherit";
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
    $("performanceNotesList").innerHTML = notes.length ? notes.map(n=>`<div>♫ ${LyricsCommon.escapeHTML(n)}</div>`).join("") : '<span class="muted">No singer-visible performance notes.</span>';
  }

  function renderStructure() {
    $("songStructure").innerHTML = (song.sections || []).filter(s=>s.type!=="separator").map((section,i)=>`<button data-jump="${i}" type="button"><span>${LyricsCommon.escapeHTML(section.title || section.type || `Section ${i+1}`)}</span><small>${section.type || "lyrics"}</small></button>`).join("");
  }

  function renderTabOverview() {
    const tabs = (song.sections || []).filter(s=>s.type==="tab" || /tab-block/.test(s.html||""));
    const wrap = $("tabOverview");
    if (!tabs.length) { wrap.classList.add("hidden"); return; }
    wrap.classList.remove("hidden");
    wrap.innerHTML = `<h3>GUITAR TABS · TAB SHIFT ${tabShift >= 0 ? "+" : ""}${tabShift}</h3>${tabs.slice(0,1).map(s=>LyricsCommon.transposeTabHTML(LyricsCommon.stripEditorControls(s.html||""),tabShift)).join("")}`;
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
      $("sendStatus").textContent = "Sent to singer tablet ✓";
      setTimeout(()=>$("sendStatus").textContent="",3000);
    } catch (error) {
      console.error(error);
      $("sendStatus").textContent = `Send failed: ${error.message}`;
    } finally { button.disabled = false; }
  }

  function changeChord(delta) { chordShift += delta; renderSong(); }
  function changeTab(delta) { tabShift += delta; renderSong(); }
  function changeCapo(delta) { capoDisplay = Math.max(0, capoDisplay + delta); renderSong(); }

  function autoScrollLoop() {
    if (!scrolling) return;
    window.scrollBy(0, 0.35 * scrollSpeed);
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) { scrolling=false; $("playScrollBtn").textContent="▶"; return; }
    scrollFrame = requestAnimationFrame(autoScrollLoop);
  }
  function toggleScroll() { scrolling=!scrolling; $("playScrollBtn").textContent=scrolling?"Ⅱ":"▶"; if(scrolling) autoScrollLoop(); else cancelAnimationFrame(scrollFrame); }

  document.addEventListener("click", e => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "chord-minus") changeChord(-1);
    if (action === "chord-plus") changeChord(1);
    if (action === "tab-minus") changeTab(-1);
    if (action === "tab-plus") changeTab(1);
    if (action === "capo-minus") changeCapo(-1);
    if (action === "capo-plus") changeCapo(1);
    const jump = e.target.closest("[data-jump]");
    if (jump) document.querySelector(`[data-section-index="${jump.dataset.jump}"]`)?.scrollIntoView({behavior:"smooth",block:"start"});
  });

  $("sendSingerBtn").onclick = sendToSinger;
  $("singerPreviewBtn").onclick = () => window.open("karaoke-lyric-view.html", "karaokeSingerView");
  $("fontDownBtn").onclick = () => { fontScale=Math.max(.75,fontScale-.1); renderSong(); };
  $("fontUpBtn").onclick = () => { fontScale=Math.min(1.8,fontScale+.1); renderSong(); };
  $("fullscreenBtn").onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  $("playScrollBtn").onclick = toggleScroll;
  $("scrollToggleBtn").onclick = toggleScroll;
  $("speedDownBtn").onclick = () => {scrollSpeed=Math.max(.25,scrollSpeed-.25);$("speedLabel").textContent=`${scrollSpeed.toFixed(2)}×`;};
  $("speedUpBtn").onclick = () => {scrollSpeed=Math.min(3,scrollSpeed+.25);$("speedLabel").textContent=`${scrollSpeed.toFixed(2)}×`;};
  $("prevSectionBtn").onclick = () => {activeSectionIndex=Math.max(0,activeSectionIndex-1);sectionElements[activeSectionIndex]?.scrollIntoView({behavior:"smooth",block:"center"});};
  $("nextSectionBtn").onclick = () => {activeSectionIndex=Math.min(sectionElements.length-1,activeSectionIndex+1);sectionElements[activeSectionIndex]?.scrollIntoView({behavior:"smooth",block:"center"});};
  $("favouriteBtn").onclick = () => { const key=`fav:${songId}`; const on=localStorage.getItem(key)==="1"; localStorage.setItem(key,on?"0":"1"); $("favouriteBtn").textContent=on?"☆":"★"; };
  $("liveSessionBtn").onclick = () => window.open("../../admin-new/admin.html", "_blank");

  loadSong();
})();
