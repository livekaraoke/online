(() => {
  const $ = id => document.getElementById(id);
  let song = null;
  let speed = 1;
  let scrolling = false;
  let frame = null;
  let unsubscribeSong = null;

  function setStandby(message = "Waiting for the host…") {
    $("standbyView").classList.remove("hidden");
    $("singerLyrics").classList.add("hidden");
    $("singerControls").classList.add("hidden");
    $("singerTitle").textContent = "KARAOKE LYRIC VIEW";
    $("singerArtist").textContent = message;
  }

  function listenForHost() {
    db.collection("karaokeControl").doc("liveLyrics").onSnapshot(doc => {
      const data = doc.exists ? doc.data() : {};
      const id = data.currentLyricsSongId || data.currentSongId || "";
      if (!id) { setStandby(); return; }
      if (unsubscribeSong) unsubscribeSong();
      unsubscribeSong = db.collection("lyrics").doc(id).onSnapshot(songDoc => {
        if (!songDoc.exists) { setStandby("The selected song is not in the lyrics database."); return; }
        song = LyricsCommon.normalizeSong(songDoc.data(), songDoc.id);
        renderSingerSong();
      }, error => setStandby(error.message));
    }, error => setStandby(error.message));
  }

  function renderSingerSong() {
    $("standbyView").classList.add("hidden");
    $("singerLyrics").classList.remove("hidden");
    $("singerControls").classList.remove("hidden");
    $("singerTitle").textContent = song.title;
    $("singerArtist").textContent = song.artist;
    const content = $("singerLyrics"); content.innerHTML = "";
    (song.sections || []).forEach(section => {
      if (section.type === "separator" || section.type === "tab") return;
      const html = LyricsCommon.singerHTMLFromSection(section);
      if (!html) return;
      if (section.type === "performanceNote" || section.type === "performance-note") {
        const cue = document.createElement("div"); cue.className="singer-performance-cue"; cue.innerHTML=html; content.appendChild(cue); return;
      }
      const block = document.createElement("section");
      block.className = `singer-section type-${String(section.title || section.type || "lyrics").toLowerCase().replace(/[^a-z0-9]+/g,"-")}`;
      block.innerHTML = `${section.title ? `<h2>${LyricsCommon.escapeHTML(section.title)}</h2>` : ""}<div class="singer-section-body">${html}</div>`;
      content.appendChild(block);
    });
    const end = document.createElement("div"); end.className="singer-end"; end.textContent="[ END ]"; content.appendChild(end);
  }

  function scrollLoop() {
    if (!scrolling) return;
    window.scrollBy(0, .42 * speed);
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) { scrolling=false; $("singerPlayBtn").textContent="▶"; return; }
    frame = requestAnimationFrame(scrollLoop);
  }
  function toggleScroll() { scrolling=!scrolling; $("singerPlayBtn").textContent=scrolling?"Ⅱ":"▶"; if(scrolling)scrollLoop(); else cancelAnimationFrame(frame); }
  function updateSpeed(delta) { speed=Math.max(.25,Math.min(3,speed+delta)); $("singerSpeedLabel").textContent=`${speed.toFixed(2)}×`; $("singerBottomSpeed").textContent=`${speed.toFixed(2)}×`; }

  $("singerSettingsBtn").onclick = () => $("singerSettings").classList.toggle("hidden");
  $("closeSingerSettings").onclick = () => $("singerSettings").classList.add("hidden");
  $("fullscreenSingerBtn").onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  $("backBtn").onclick = () => history.back();
  $("singerPlayBtn").onclick = toggleScroll;
  $("singerAutoScroll").onchange = e => { if(e.target.checked !== scrolling) toggleScroll(); };
  $("singerSpeedDown").onclick = () => updateSpeed(-.25);
  $("singerSpeedUp").onclick = () => updateSpeed(.25);
  $("singerMinusBtn").onclick = () => updateSpeed(-.25);
  $("singerPlusBtn").onclick = () => updateSpeed(.25);

  document.addEventListener("click", e => {
    const theme=e.target.dataset.theme; if(theme){document.body.dataset.theme=theme; e.target.parentElement.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===e.target));}
    const font=e.target.dataset.font; if(font){document.body.dataset.font=font; e.target.parentElement.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===e.target));}
    const size=e.target.dataset.size; if(size){document.body.dataset.size=size; e.target.parentElement.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===e.target));}
    const spacing=e.target.dataset.spacing; if(spacing){document.body.dataset.spacing=spacing; e.target.parentElement.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===e.target));}
  });

  setStandby();
  listenForHost();
})();
