(() => {
  const db = window.db;
  const params = new URLSearchParams(location.search);
  const songId = params.get("id") || params.get("firebaseId");
  const requestId = params.get("requestId") || "";

  let currentSong = null;
  let currentSongId = songId;
  let sectionTitleDefaults = {
    verse: "#ffffff",
    preChorus: "#ffb45c",
    chorus: "#42f35c",
    postChorus: "#ffffff",
    bridge: "#ffffff",
    intro: "#ffffff",
    outro: "#ffffff",
    instrumental: "#ffffff",
    solo: "#ffffff",
    guitarTab: "#ffffff",
    hostNote: "#ffffff",
    ending: "#ffd400",
    fallback: "#ffffff"
  };
  let sectionEls = [];
  let currentSectionIndex = 0;
  let scrollTimer = null;
  let autoScrollOn = false;
  let performanceRecordCreated = false;
  let autoScrollEndHandled = false;

  // AUTOSCROLL:
  // 1.00× is now physically one-third of the old 1.00× pace.
  // The multiplier is stored separately for every song in Firestore.
  let scrollSpeed = 1;
  const AUTO_SCROLL_BASE_PX_PER_MS = 0.006; // one-third of old 0.018 base
  let chordShift = 0;
  let tabShift = 0;
  let capoDisplayShift = 0;
  let notesSaveTimer = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const toNumber = value => {
    const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  function showModal(title, message, withCancel = false) {
    return new Promise(resolve => {
      const modal = $("confirmModal");
      $("confirmTitle").textContent = title;
      $("confirmMessage").textContent = message;
      $("confirmCancel").style.display = withCancel ? "inline-flex" : "none";
      modal.classList.remove("hidden");
      $("confirmOk").onclick = () => { modal.classList.add("hidden"); resolve(true); };
      $("confirmCancel").onclick = () => { modal.classList.add("hidden"); resolve(false); };
    });
  }

  function setTopTitle(song) {
    $("topbarSongTitle").innerHTML = `<strong>${esc(song.title || "Untitled")}</strong><span>${esc(song.artist || "")}</span>`;
    $("infoSongTitle").textContent = `${song.title || "Untitled"}${song.artist ? " — " + song.artist : ""}`;
  }

  function setInfo(song) {
    const tempo = toNumber(song.userBpm);
    const original = toNumber(song.originalBpm);
    const time = song.timeSignature || song.time || "4/4";
    const capo = song.capo === "" || song.capo == null ? "0" : song.capo;

    // SONG INFO sidebar
    $("infoKey").textContent = song.key || "–";
    $("infoTime").textContent = time;
    $("infoCapo").textContent = capo;
    $("infoYear").textContent = song.year || "–";
    $("infoSongNotes").textContent = song.note || song.songNote || "No song notes.";
    $("capoDisplayValue").textContent = String(toNumber(song.capo) || 0);

    // Render BPM number and suffix separately so the number can be larger
    // while the "BPM" label stays smaller and centred beside it.
    function renderBpmValue(el, value) {
      if (!el) return;

      if (value == null) {
        el.innerHTML = `<span class="bpm-number">–</span>`;
        return;
      }

      el.innerHTML =
        `<span class="bpm-number">${esc(String(value))}</span>` +
        `<span class="bpm-suffix">BPM</span>`;
    }

    renderBpmValue($("infoTempo"), tempo);
    renderBpmValue($("infoOriginalBpm"), original);

    // PERFORMANCE QUICK INFO above the first section
    if ($("quickKey")) $("quickKey").textContent = song.key || "–";
    if ($("quickTime")) $("quickTime").textContent = time;
    renderBpmValue($("quickTempo"), tempo);
    renderBpmValue($("quickOriginalBpm"), original);
    if ($("quickCapo")) $("quickCapo").textContent = capo;

    const tempoTargets = [$("infoTempo"), $("quickTempo")].filter(Boolean);
    const originalTargets = [$("infoOriginalBpm"), $("quickOriginalBpm")].filter(Boolean);

    tempoTargets.forEach(el => el.classList.remove("tempo-match", "tempo-different"));
    originalTargets.forEach(el => el.classList.remove("original-different"));

    if (tempo != null && original != null) {
      if (tempo === original) {
        tempoTargets.forEach(el => el.classList.add("tempo-match"));
      } else {
        tempoTargets.forEach(el => el.classList.add("tempo-different"));
        originalTargets.forEach(el => el.classList.add("original-different"));
      }
    }

    $("myNotesInput").value = song.myNotes || "";
  }

  function sectionTypeClass(section) {
    const key = `${section.type || ""} ${section.title || ""}`.toLowerCase();
    if (/tab/.test(key)) return "is-tab";
    if (/chorus repeat|repeat chorus|refrain/.test(key)) return "is-repeat";
    if (/chorus/.test(key)) return "is-chorus";
    if (/bridge/.test(key)) return "is-bridge";
    if (/pre.?chorus/.test(key)) return "is-prechorus";
    if (/intro|instrumental|solo/.test(key)) return "is-instrumental";
    if (/ending|outro|end/.test(key)) return "is-ending";
    if (/host.?note/.test(key)) return "is-host-note";
    if (/performance.?note|cue/.test(key)) return "is-performance-note";
    return "is-lyrics";
  }

  function cleanSectionHtml(html) {
    const holder = document.createElement("div");
    holder.innerHTML = String(html || "");
    holder.querySelectorAll(".tab-block-controls,.tab-insert-row,.delete-tab-line-btn,.delete-tab-time-btn,.delete-tab-btn,.delete-tab-btn-bottom,.move-tab-up-btn,.move-tab-down-btn,.duplicate-tab-btn").forEach(n => n.remove());
    holder.querySelectorAll("[contenteditable]").forEach(n => n.removeAttribute("contenteditable"));
    return holder.innerHTML;
  }

  function normaliseSectionTitleKey(title) {
    const clean = String(title || "").trim().toUpperCase().replace(/\s+/g, " ");

    if (clean === "VERSE" || /^VERSE \d+$/.test(clean)) return "verse";
    if (clean === "PRE-CHORUS" || clean === "PRE CHORUS") return "preChorus";
    if (clean === "CHORUS" || /^CHORUS \d+$/.test(clean) || clean === "CHORUS REPEAT") return "chorus";
    if (clean === "POST-CHORUS" || clean === "POST CHORUS") return "postChorus";
    if (clean === "BRIDGE" || /^BRIDGE \d+$/.test(clean)) return "bridge";
    if (clean === "INTRO") return "intro";
    if (clean === "OUTRO") return "outro";
    if (clean === "INSTRUMENTAL" || clean === "INSTRUMENTAL BREAK") return "instrumental";
    if (clean === "SOLO" || clean === "GUITAR SOLO") return "solo";
    if (clean === "GUITAR TAB" || clean === "TAB") return "guitarTab";
    if (clean === "HOST NOTE" || clean === "HOST NOTES") return "hostNote";
    if (clean === "ENDING" || clean === "END") return "ending";

    return "fallback";
  }

  function getSystemSectionTitleColour(title) {
    return sectionTitleDefaults[normaliseSectionTitleKey(title)] || sectionTitleDefaults.fallback || "#ffffff";
  }

  async function loadSectionTitleDefaultsForView() {
    try {
      const snap = await db.collection("noteSettings").doc("lyricsCreatorSectionTitleDefaults").get();
      if (snap.exists) sectionTitleDefaults = { ...sectionTitleDefaults, ...(snap.data() || {}) };
    } catch (error) {
      console.warn("Section title defaults unavailable:", error);
    }
  }


  // Colour every literal "-" character without changing fret numbers/chords.
  // The colour is saved per-section by lyricscreator.html.
  function applySectionDashColour(root, colour) {
    if (!root) return;
    const dashColour = colour || "#777777";

    // Avoid wrapping dashes twice.
    root.querySelectorAll("span.section-dash-char").forEach(span => {
      span.replaceWith(document.createTextNode(span.textContent || "-"));
    });

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.includes("-")) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || parent.closest("script,style,button,select,option")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
      const parts = node.nodeValue.split("-");
      if (parts.length < 2) return;

      const frag = document.createDocumentFragment();
      parts.forEach((part, index) => {
        if (part) frag.appendChild(document.createTextNode(part));
        if (index < parts.length - 1) {
          const dash = document.createElement("span");
          dash.className = "section-dash-char";
          dash.style.color = dashColour;
          dash.textContent = "-";
          frag.appendChild(dash);
        }
      });
      node.replaceWith(frag);
    });
  }

  function buildBeatGridTab(section, wrapper) {
    const html = section.html || "";
    const holder = document.createElement("div");
    holder.innerHTML = cleanSectionHtml(html);
    const tabBlocks = [...holder.querySelectorAll(".tab-block")];
    if (!tabBlocks.length) {
      wrapper.innerHTML = holder.innerHTML;
      return;
    }

    tabBlocks.forEach((block, blockIndex) => {
      const card = document.createElement("div");
      card.className = "performance-tab-card";
      const rhythm = section.rhythmMode || section.tabRhythmMode || "Beat Grid";
      const beatLabels = Array.isArray(section.beatLabels) && section.beatLabels.length
        ? section.beatLabels
        : ["1","&","2","&","3","&","4","&"];
      const head = document.createElement("div");
      head.className = "performance-tab-head";
      head.innerHTML = `<span>GUITAR TAB${rhythm && rhythm !== "None" ? ` <em>(${esc(rhythm)})</em>` : ""}</span>${blockIndex ? `<small>Riff ${blockIndex + 1}</small>` : ""}`;
      card.appendChild(head);

      if (rhythm !== "None") {
        const beats = document.createElement("div");
        beats.className = "performance-beat-row";
        beatLabels.forEach(v => {
          const s = document.createElement("span");
          s.textContent = v;
          beats.appendChild(s);
        });
        card.appendChild(beats);
      }

      const body = document.createElement("div");
      body.className = "performance-tab-body";
      body.appendChild(block.cloneNode(true));
      card.appendChild(body);
      wrapper.appendChild(card);
    });
  }

  function renderSections(song) {
    const container = $("lyricsContent");
    container.innerHTML = "";
    sectionEls = [];

    (song.sections || []).forEach((section, index) => {
      if (section.type === "separator") {
        const sep = document.createElement("div");
        sep.className = "host-separator";
        container.appendChild(sep);
        return;
      }
      if ((section.type || "").toLowerCase() === "host-note") return;

      const card = document.createElement("section");
      card.className = `host-section ${sectionTypeClass(section)}`;
      card.dataset.sectionIndex = String(index);
      card.dataset.sectionTitle = section.title || section.type || `Section ${index + 1}`;
      if (section.collapsed === true) card.classList.add("collapsed");

      const header = document.createElement("button");
      header.className = "host-section-header";
      header.type = "button";
      header.innerHTML = `<span class="collapse-arrow">${card.classList.contains("collapsed") ? "▸" : "▾"}</span><strong>${esc(section.title || section.type || "SECTION")}</strong><span class="header-spacer"></span><span class="collapse-hint">${card.classList.contains("collapsed") ? "SHOW" : "HIDE"}</span>`;

      // Optional per-section title colour from Lyrics Creator.
      const titleColour = section.style?.titleColor || getSystemSectionTitleColour(section.title);
      card.dataset.sectionTitleColor = titleColour;

      const titleEl = header.querySelector("strong");
      if (titleEl) titleEl.style.color = titleColour;

      const body = document.createElement("div");
      body.className = "host-section-body";
      body.style.fontFamily = section.style?.fontFamily || "Verdana, Arial, sans-serif";
      if (section.style?.fontSize) body.style.fontSize = `${Number(section.style.fontSize) || 18}px`;
      if (section.style?.color) body.style.color = section.style.color;

      if (sectionTypeClass(section) === "is-tab") buildBeatGridTab(section, body);
      else body.innerHTML = cleanSectionHtml(section.html || section.text || "");

      // Apply saved per-section dash colour. Default is gray.
      applySectionDashColour(body, section.style?.dashColor || "#777777");

      header.addEventListener("click", () => {
        card.classList.toggle("collapsed");
        const collapsed = card.classList.contains("collapsed");
        header.querySelector(".collapse-arrow").textContent = collapsed ? "▸" : "▾";
        header.querySelector(".collapse-hint").textContent = collapsed ? "SHOW" : "HIDE";
        requestAnimationFrame(updateSectionProgress);
      });

      card.append(header, body);
      container.appendChild(card);
      sectionEls.push(card);
    });

    renderHostNotes(song);
    renderSectionProgress();
    applyChordTranspose();
    applyTabTranspose();
    updateSectionProgress();
  }

  function renderHostNotes(song) {
    const notes = (song.sections || []).filter(s => `${s.type || ""} ${s.title || ""}`.toLowerCase().includes("host note"));
    const out = $("hostLyricNotes");
    if (!notes.length) { out.textContent = "No host-note sections."; return; }
    out.innerHTML = notes.map(n => `<article><strong>${esc(n.title || "HOST NOTE")}</strong><div>${cleanSectionHtml(n.html || n.text || "")}</div></article>`).join("");
  }

  function renderSectionProgress() {
    const progress = $("sectionProgress");
    progress.innerHTML = "";
    sectionEls.forEach((el, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "progress-section";

      const progressTitleColour =
        el.dataset.sectionTitleColor ||
        getSystemSectionTitleColour(el.dataset.sectionTitle || "");

      b.style.setProperty("--progress-title-color", progressTitleColour);
      b.innerHTML = `<span>${esc(el.dataset.sectionTitle || `S${i+1}`)}</span><i></i>`;
      b.onclick = () => scrollToSection(i);
      progress.appendChild(b);
    });

    // Keep the currently active section visible even when the song
    // contains more sections than can fit across the tablet screen.
    requestAnimationFrame(() => centerActiveProgressSection(false));
  }

  /************************************************************
   * SECTION NAVIGATION AUTO-FOLLOW
   * Horizontally scrolls ONLY the bottom section guide.
   * It does not move the lyrics vertically.
   ************************************************************/
  function centerActiveProgressSection(smooth = true) {
    const progress = $("sectionProgress");
    if (!progress) return;

    const items = [...progress.querySelectorAll(".progress-section")];
    const active = items[currentSectionIndex];
    if (!active) return;

    const target =
      active.offsetLeft -
      ((progress.clientWidth - active.offsetWidth) / 2);

    const maxScroll = Math.max(0, progress.scrollWidth - progress.clientWidth);
    const left = Math.max(0, Math.min(maxScroll, target));

    progress.scrollTo({
      left,
      top: 0,
      behavior: smooth ? "smooth" : "auto"
    });
  }

  function scrollToSection(index) {
    if (!sectionEls.length) return;
    currentSectionIndex = Math.max(0, Math.min(sectionEls.length - 1, index));

    // Update/centre the guide immediately when Prev/Next or a guide item is used.
    [...$("sectionProgress").children]
      .forEach((el, i) => el.classList.toggle("active", i === currentSectionIndex));

    sectionEls.forEach((el, i) => {
      el.classList.toggle("current-section", i === currentSectionIndex);
    });

    centerActiveProgressSection(true);

    sectionEls[currentSectionIndex].scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    setTimeout(updateSectionProgress, 350);
  }

  function updateSectionProgress() {
    if (!sectionEls.length) return;

    const anchor = Math.max(120, window.innerHeight * .27);
    let bestIndex = 0;
    let best = Infinity;

    sectionEls.forEach((el, i) => {
      const d = Math.abs(el.getBoundingClientRect().top - anchor);
      if (d < best) {
        best = d;
        bestIndex = i;
      }
    });

    const changed = bestIndex !== currentSectionIndex;
    currentSectionIndex = bestIndex;

    [...$("sectionProgress").children]
      .forEach((el, i) => el.classList.toggle("active", i === currentSectionIndex));

    // Match the bottom guide: tint the section header that is currently
    // nearest the performance reading position.
    sectionEls.forEach((el, i) => {
      el.classList.toggle("current-section", i === currentSectionIndex);
    });

    // As the performer scrolls through the song, automatically bring the
    // current section marker into view and keep it roughly centred.
    if (changed) {
      centerActiveProgressSection(true);
    }
  }

  window.addEventListener("resize", () => {
    requestAnimationFrame(() => centerActiveProgressSection(false));
  });

  function smoothRelativeScroll(direction) {
    const amount = window.innerHeight * .5 * direction;
    const start = window.scrollY;
    const target = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, start + amount));
    const started = performance.now();
    const duration = 700;
    function frame(now) {
      const t = Math.min(1,(now-started)/duration);
      const e = t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
      scrollTo(0,start+(target-start)*e);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function chordParts(chord) {
    const m = String(chord || "").match(/^([A-G])([#b]?)(.*)$/);
    return m ? {root:m[1]+m[2], suffix:m[3]} : null;
  }
  const NOTES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const NOTE_INDEX = {C:0,"B#":0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,Fb:4,F:5,"E#":5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11,Cb:11};
  function transposeChordToken(token, shift) {
    const split = token.split("/");
    const main = chordParts(split[0]);
    if (!main || NOTE_INDEX[main.root] == null) return token;
    const root = NOTES_SHARP[(NOTE_INDEX[main.root]+shift+120)%12] + main.suffix;
    if (!split[1]) return root;
    const bass = chordParts(split[1]);
    return bass && NOTE_INDEX[bass.root] != null ? `${root}/${NOTES_SHARP[(NOTE_INDEX[bass.root]+shift+120)%12]}${bass.suffix}` : root;
  }

  function captureOriginalChordText() {
    document.querySelectorAll(".host-section-body span, .host-section-body b, .host-section-body strong").forEach(el => {
      const text = el.textContent.trim();
      if (/^[A-G][#b]?(?:m|maj|min|dim|aug|sus|add|\d|\(|\)|\+|\-|\/|#|b)*$/i.test(text) && !el.dataset.originalChord) el.dataset.originalChord = text;
    });
  }
  function applyChordTranspose() {
    captureOriginalChordText();
    document.querySelectorAll("[data-original-chord]").forEach(el => el.textContent = transposeChordToken(el.dataset.originalChord, chordShift));
    $("chordTransposeValue").textContent = String(chordShift);
  }

  function captureOriginalTabCells() {
    document.querySelectorAll(".performance-tab-card .tab-cell.filled, .performance-tab-card .tab-dashes .filled").forEach(el => {
      const t = el.textContent.trim();
      if (/^\d{1,2}$/.test(t) && el.dataset.originalFret == null) el.dataset.originalFret = t;
    });
  }
  function applyTabTranspose() {
    captureOriginalTabCells();
    document.querySelectorAll("[data-original-fret]").forEach(el => {
      const n = Number(el.dataset.originalFret);
      el.textContent = String(Math.max(0, n + tabShift));
    });
    $("tabTransposeValue").textContent = String(tabShift);
  }

  async function sendToKaraoke() {
    if (!currentSong) return;
    await db.collection("karaokeControl").doc("liveLyrics").set({
      currentSongId: currentSongId,
      songId: currentSongId,
      title: currentSong.title || "",
      artist: currentSong.artist || "",
      song: currentSong,
      reset: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    await showModal("Sent to Karaoke", "The singer display has been updated.");
  }

  async function resetKaraoke() {
    await db.collection("karaokeControl").doc("liveLyrics").set({
      currentSongId: null,
      songId: null,
      song: null,
      title: "",
      artist: "",
      reset: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    $("karaokeMenu").classList.add("hidden");
  }

  /************************************************************
   * SEND LYRICS DROPDOWN
   *
   * RESTORED TO THE ORIGINAL WORKING song-data.js LOGIC.
   *
   * song-data.js:
   *   root/adm/files/song-data.js
   *
   * loaded by lyricview.html as:
   *   ../adm/files/song-data.js
   *
   * It exposes:
   *   window.songs = [...]
   *
   * The original working URL format is:
   *   lyrics/song.html?id=allthesmallthings
   *
   * IMPORTANT:
   * We use the ID ALREADY STORED IN song.url.
   * We DO NOT generate IDs from title + artist.
   ************************************************************/

  function dVal(v) {
    return String(v || "").replace(/"/g, "&quot;");
  }

  function getSlaveLyricsSongs() {
    if (!Array.isArray(window.songs)) {
      console.error(
        "window.songs is missing. Check that ../adm/files/song-data.js loads before js/lyricview.js"
      );
      return [];
    }

    return window.songs
      .filter(song =>
        song &&
        song.hasLyrics === true &&
        typeof song.url === "string" &&
        song.url.trim()
      )
      .map(song => {
        // EXACTLY the same ID extraction pattern used by the original code.
        const id = String(song.url || "")
          .replace(/^lyrics\/song\.html\?id=/i, "")
          .trim();

        return {
          id,
          title: song.title || id,
          artist: song.artist || "",
          url: song.url || "",
          fileName: `${id}.js`
        };
      })
      .filter(song => song.id)
      .sort((a, b) =>
        String(a.title).localeCompare(
          String(b.title),
          undefined,
          { sensitivity: "base" }
        )
      );
  }

  function findCurrentSlaveLyricsId(entries) {
    if (!entries.length) return "";

    // First use the song's saved Karaoke Lyrics ID if it already has one.
    const savedId = String(currentSong?.karaokeLyrics || "").trim();

    if (savedId && savedId !== "No") {
      const exact = entries.find(entry => entry.id === savedId);
      if (exact) return exact.id;
    }

    // Otherwise match by title only.
    // Do NOT append artist to the ID.
    const title = String(currentSong?.title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (!title) return "";

    const match = entries.find(entry =>
      String(entry.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") === title
    );

    return match?.id || "";
  }

  async function loadSlaveLyricsOptions() {
    const selects = [
      $("slaveLyricsSelect"),
      $("quickSlaveLyricsSelect")
    ].filter(Boolean);

    if (!selects.length) return;

    const entries = getSlaveLyricsSongs();

    if (!entries.length) {
      console.error(
        "No songs with hasLyrics:true were found in window.songs.",
        window.songs
      );

      selects.forEach(select => {
        select.disabled = false;
        select.innerHTML =
          `<option value="">No karaoke lyric songs found</option>`;
      });
      return;
    }

    const options =
      `<option value="">Choose lyrics to send…</option>` +
      entries.map(song => {
        const artist = song.artist ? ` — ${song.artist}` : "";

        return (
          `<option value="${esc(dVal(song.id))}" ` +
          `data-lyrics-file="${esc(dVal(song.fileName))}">` +
          `${esc(song.title)}${esc(artist)}` +
          `</option>`
        );
      }).join("");

    const selectedId = findCurrentSlaveLyricsId(entries);

    selects.forEach(select => {
      select.innerHTML = options;
      select.disabled = false;
      select.value = selectedId || "";
    });

    console.log(
      `SEND LYRICS dropdown loaded ${entries.length} songs from window.songs`
    );
  }

  async function sendSlaveLyrics(selectId = "slaveLyricsSelect") {
    const select = $(selectId);
    const id = String(select?.value || "").trim();

    if (!id) {
      return showModal(
        "Choose Lyrics",
        "Select lyrics to send first."
      );
    }

    const fileName = `${id}.js`;

    await db.collection("karaokeControl").doc("liveLyrics").set({
      currentSongId: id,
      songId: id,

      // Explicit legacy mapping. No artist is added to the filename.
      lyricsFileId: id,
      lyricsFileName: fileName,
      lyricsFilePath: `../adm/host/lyrics/lyrics-data/${fileName}`,
      lyricsSource: "song-data-js",

      reset: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    showModal(
      "Singer Lyrics Updated",
      `${fileName} was sent to the singer display.`
    );
  }

  async function saveMyNotes() {
    if (!currentSongId) return;
    const value = $("myNotesInput").value;
    $("myNotesSaveStatus").textContent = "Saving…";
    try {
      await db.collection("lyrics").doc(currentSongId).set({myNotes:value,myNotesUpdatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      $("myNotesSaveStatus").textContent = "Saved automatically";
      await logNoteEditToSession(value);
    } catch (e) {
      console.error(e);
      $("myNotesSaveStatus").textContent = "Save failed";
    }
  }

  async function logNoteEditToSession(value) {
    try {
      const ctl = await db.collection("karaokeControl").doc("currentSession").get();
      const d = ctl.exists ? ctl.data() : null;
      const sessionId = d?.active === true ? (d.sessionId || d.activeSessionId) : null;
      if (!sessionId) return;
      await db.collection("performanceSessions").doc(sessionId).collection("activityLog").add({
        type:"songMyNotesEdited",
        songId:currentSongId,
        songTitle:currentSong?.title || "",
        songArtist:currentSong?.artist || "",
        note:value,
        message:`Edited MY NOTES in ${currentSong?.title || "Song"}${currentSong?.artist ? " - " + currentSong.artist : ""}`,
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { console.warn("Session note logging skipped",e); }
  }

  function loadSongScrollSpeed(songData) {
    const saved = Number(songData?.hostScrollSpeed);

    // Songs that do not have a saved value yet start at 1.00×.
    // Because the base rate itself is now 1/6, this is already much slower.
    scrollSpeed = Number.isFinite(saved)
      ? Math.max(0.1, Math.min(10, saved))
      : 1;

    updateSpeed();
  }

  async function saveSongScrollSpeed() {
    if (!currentSongId) return;

    try {
      await db.collection("lyrics").doc(currentSongId).set({
        hostScrollSpeed: scrollSpeed,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Could not save this song's autoscroll speed:", error);
    }
  }

  async function getActiveSessionContext() {
    try {
      const snap = await db.collection("karaokeControl").doc("currentSession").get();
      const data = snap.exists ? (snap.data() || {}) : {};

      const sessionId =
        data.active === true
          ? (data.sessionId || data.activeSessionId || "")
          : "";

      return { sessionId, control:data };
    } catch (error) {
      console.warn("Could not read current Performance Session:", error);
      return { sessionId:"", control:{} };
    }
  }

  async function findCurrentRunOrderItem(items) {
    if (!Array.isArray(items)) return null;

    if (requestId) {
      const byRequest = items.find(item => item.requestId === requestId);
      if (byRequest) return byRequest;
    }

    return items.find(item =>
      item.songId === currentSongId &&
      !["played","abandoned","left","deleted","deletedbyhost","declined"]
        .includes(String(item.status || "").toLowerCase())
    ) || null;
  }

  async function setCurrentRunOrderStatus(status) {
    const { sessionId } = await getActiveSessionContext();
    if (!sessionId) return null;

    const runRef = db.collection("karaokeControl").doc("runOrder");
    const runSnap = await runRef.get();
    const runData = runSnap.exists ? (runSnap.data() || {}) : {};

    if (runData.sessionId !== sessionId || !Array.isArray(runData.items)) {
      return null;
    }

    const matched = await findCurrentRunOrderItem(runData.items);
    if (!matched) return null;

    const items = runData.items.map(item =>
      item.id === matched.id
        ? {
            ...item,
            status,
            ...(status === "playing"
              ? { playingAtMs: Date.now() }
              : {}),
            ...(status === "played"
              ? { playedAtMs: Date.now() }
              : {})
          }
        : item
    );

    await runRef.set({
      sessionId,
      items,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });

    return matched;
  }

  async function recordCurrentSongPlayed() {
    if (!currentSong || !currentSongId) return;

    const { sessionId } = await getActiveSessionContext();
    if (!sessionId) return;

    // Keep the current Run Order song visible and highlighted while scrolling.
    await setCurrentRunOrderStatus("playing");

    if (performanceRecordCreated) return;
    performanceRecordCreated = true;

    const startedAt = firebase.firestore.Timestamp.now();
    const performedId =
      `${currentSongId}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

    const record = {
      songId: currentSongId,
      songTitle: currentSong.title || "",
      songArtist: currentSong.artist || "",
      artist: currentSong.artist || "",
      requestId: requestId || "",
      source: "lyricview-autoscroll",
      startedAt,
      playedAt: startedAt,
      createdAt: startedAt
    };

    try {
      await db.collection("performanceSessions")
        .doc(sessionId)
        .collection("performedSongs")
        .doc(performedId)
        .set(record);

      await db.collection("performanceLogs").add({
        sessionId,
        ...record,
        performanceType: "Auto-scroll Play",
        performedBy: "host"
      });
    } catch (error) {
      console.error("Could not create performance record:", error);
    }
  }

  async function finalizeCurrentSongPlayed() {
    try {
      const matched = await setCurrentRunOrderStatus("played");
      const linkedRequestId = requestId || matched?.requestId || "";

      if (linkedRequestId) {
        const now = firebase.firestore.Timestamp.now();

        await db.collection("publicSongRequests").doc(linkedRequestId).set({
          status: "completed",
          playedAt: now,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge:true });
      }
    } catch (error) {
      console.error("Could not finalize played song:", error);
    }
  }

  async function pauseCurrentRunOrderSong() {
    try {
      const { sessionId } = await getActiveSessionContext();
      if (!sessionId) return;

      const runRef = db.collection("karaokeControl").doc("runOrder");
      const snap = await runRef.get();
      const data = snap.exists ? (snap.data() || {}) : {};

      if (data.sessionId !== sessionId || !Array.isArray(data.items)) return;

      const matched = await findCurrentRunOrderItem(data.items);
      if (!matched || String(matched.status || "").toLowerCase() !== "playing") {
        return;
      }

      const items = data.items.map(item =>
        item.id === matched.id
          ? { ...item, status:"queued" }
          : item
      );

      await runRef.set({
        sessionId,
        items,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    } catch (error) {
      console.error("Could not pause Run Order song:", error);
    }
  }

  function showEndNextSongButton(show) {
    const button = $("endNextRunOrderSongBtn");
    if (!button) return;
    button.hidden = !show;
  }

  async function stopAutoScrollAtEnd() {
    if (autoScrollEndHandled) return;
    autoScrollEndHandled = true;

    autoScrollOn = false;

    if (scrollTimer) {
      cancelAnimationFrame(scrollTimer);
      scrollTimer = null;
    }

    $("autoScrollBtn")?.classList.remove("active");
    if ($("autoScrollBtn")) $("autoScrollBtn").textContent = "▶";

    await finalizeCurrentSongPlayed();
    showEndNextSongButton(true);
    await renderEndNextSongDetails();
  }


  async function getNextRunOrderItem() {
    const { sessionId } = await getActiveSessionContext();
    if (!sessionId) return null;

    const snap = await db.collection("karaokeControl").doc("runOrder").get();
    const data = snap.exists ? (snap.data() || {}) : {};

    if (
      data.sessionId !== sessionId ||
      !Array.isArray(data.items) ||
      !data.items.length
    ) {
      return null;
    }

    const terminal = new Set([
      "played","abandoned","left","deleted","deletedbyhost","declined"
    ]);

    const items = data.items;
    let currentIndex = -1;

    if (requestId) {
      currentIndex = items.findIndex(item => item.requestId === requestId);
    }

    if (currentIndex < 0) {
      currentIndex = items.findIndex(item => item.songId === currentSongId);
    }

    for (let i = Math.max(0, currentIndex + 1); i < items.length; i++) {
      if (
        items[i].songId &&
        !terminal.has(String(items[i].status || "").toLowerCase())
      ) {
        return items[i];
      }
    }

    if (currentIndex < 0) {
      return items.find(item =>
        item.songId &&
        !terminal.has(String(item.status || "").toLowerCase())
      ) || null;
    }

    return null;
  }

  function nextDetailField(label, value) {
    const clean = String(value ?? "").trim();
    if (!clean) return "";

    return `
      <div class="host-next-detail-row">
        <span>${esc(label)}</span>
        <strong>${esc(clean)}</strong>
      </div>
    `;
  }

  async function renderEndNextSongDetails() {
    const card = $("endNextSongDetailsCard");
    if (!card) return;

    const next = await getNextRunOrderItem();

    if (!next?.songId) {
      card.hidden = false;
      card.innerHTML = `
        <div class="host-next-song-card-title">NEXT IN RUN ORDER</div>
        <div class="host-next-song-empty">No next song in the Run Order.</div>
      `;
      return;
    }

    let song = {};
    let request = {};

    try {
      const songSnap = await db.collection("lyrics").doc(next.songId).get();
      if (songSnap.exists) song = songSnap.data() || {};
    } catch (error) {
      console.warn("Could not load next song details:", error);
    }

    if (next.requestId) {
      try {
        const requestSnap = await db
          .collection("publicSongRequests")
          .doc(next.requestId)
          .get();

        if (requestSnap.exists) request = requestSnap.data() || {};
      } catch (error) {
        console.warn("Could not load next request details:", error);
      }
    }

    const bpm =
      song.userBpm ??
      song.bpm ??
      next.bpm ??
      "";

    const requester =
      request.singerName ||
      request.name ||
      next.singerName ||
      "";

    card.hidden = false;
    card.innerHTML = `
      <div class="host-next-song-card-title">NEXT IN RUN ORDER</div>

      <div class="host-next-song-hero">
        <strong>${esc(song.title || next.songTitle || next.title || "Untitled Song")}</strong>
        <span>${esc(song.artist || next.artist || "")}</span>
      </div>

      <div class="host-next-song-detail-grid">
        ${nextDetailField("BPM", bpm)}
        ${nextDetailField("Key", song.key)}
        ${nextDetailField("Capo", song.capo)}
        ${nextDetailField("Song Year", song.year)}
        ${nextDetailField("Requested By", requester)}
        ${nextDetailField("Country / From", request.location)}
        ${nextDetailField("Age Range", request.ageRange)}
        ${nextDetailField("Rating", request.rating ? `${request.rating}/5` : "")}
        ${nextDetailField("Request Note", request.note)}
      </div>
    `;
  }

  async function goToNextRunOrderSong() {
    const { sessionId } = await getActiveSessionContext();

    if (!sessionId) {
      await showModal("No Active Session", "Start a Performance Session first.");
      return;
    }

    const next = await getNextRunOrderItem();

    if (!next) {
      await showModal("End of Run Order", "There is no next unplayed song.");
      return;
    }

    const params = new URLSearchParams();
    params.set("id",next.songId);
    if (next.requestId) params.set("requestId",next.requestId);

    location.href = `lyricview.html?${params.toString()}`;
  }


  function startAutoScroll() {
    const wasOff = !autoScrollOn;
    autoScrollOn = !autoScrollOn;

    $("autoScrollBtn").classList.toggle("active", autoScrollOn);
    $("autoScrollBtn").textContent = autoScrollOn ? "Ⅱ" : "▶";

    if (wasOff && autoScrollOn) {
      autoScrollEndHandled = false;
      showEndNextSongButton(false);
      if ($("endNextSongDetailsCard")) {
        $("endNextSongDetailsCard").hidden = true;
        $("endNextSongDetailsCard").innerHTML = "";
      }

      // PLAY marks the matching Run Order item as "playing", keeping it
      // visible and highlighted in the Top Status Bar.
      recordCurrentSongPlayed();
    }

    if (autoScrollOn) {
      let last = performance.now();
      let fractionalY = 0;

      const tick = now => {
        if (!autoScrollOn) return;

        const dt = Math.min(50, Math.max(0, now - last));
        last = now;

        if (!document.hidden) {
          fractionalY += dt * AUTO_SCROLL_BASE_PX_PER_MS * scrollSpeed;

          const wholePixels = Math.floor(fractionalY);
          if (wholePixels > 0) {
            window.scrollBy(0, wholePixels);
            fractionalY -= wholePixels;
          }

          const doc = document.documentElement;
          const atBottom =
            window.scrollY + window.innerHeight >=
            Math.max(doc.scrollHeight, document.body.scrollHeight) - 3;

          if (atBottom) {
            stopAutoScrollAtEnd();
            return;
          }
        }

        scrollTimer = requestAnimationFrame(tick);
      };

      scrollTimer = requestAnimationFrame(tick);
    } else {
      if (scrollTimer) {
        cancelAnimationFrame(scrollTimer);
        scrollTimer = null;
      }

      // A manual pause means the song is no longer actively playing.
      pauseCurrentRunOrderSong();
    }
  }


  function bindUi() {
    $("exitBtn").onclick = () => location.href = "lyricsviewer.html";
    // SONG INFO button now toggles the drawer open/closed.
    // This keeps the same top-bar button usable as the close control.
    $("songInfoBtn").onclick = () => {
      const drawer = $("songInfoDrawer");
      if (!drawer) return;
      const willOpen = !drawer.classList.contains("open");
      drawer.classList.toggle("open", willOpen);
      drawer.setAttribute("aria-hidden", willOpen ? "false" : "true");
      $("songInfoBtn").classList.toggle("active", willOpen);
    };
    $("closeSongInfoBtn").onclick = () => {
      const drawer = $("songInfoDrawer");
      if (!drawer) return;
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      $("songInfoBtn").classList.remove("active");
    };
    $("navUpBtn").onclick = () => smoothRelativeScroll(-1);
    $("navDownBtn").onclick = () => smoothRelativeScroll(1);
    $("navPrevBtn").onclick = () => scrollToSection(currentSectionIndex-1);
    $("navNextBtn").onclick = () => scrollToSection(currentSectionIndex+1);
    $("autoScrollBtn").onclick = startAutoScroll;
    $("scrollSpeedDown").onclick = async () => {
      scrollSpeed = Math.max(0.1, +(scrollSpeed - 0.1).toFixed(1));
      updateSpeed();
      await saveSongScrollSpeed();
    };

    $("scrollSpeedUp").onclick = async () => {
      scrollSpeed = Math.min(10, +(scrollSpeed + 0.1).toFixed(1));
      updateSpeed();
      await saveSongScrollSpeed();
    };
    if ($("nextRunOrderSongBtn")) {
      $("nextRunOrderSongBtn").onclick = goToNextRunOrderSong;
    }
    if ($("endNextRunOrderSongBtn")) {
      $("endNextRunOrderSongBtn").onclick = goToNextRunOrderSong;
    }
    $("chordMinus").onclick = () => { chordShift--; applyChordTranspose(); };
    $("chordPlus").onclick = () => { chordShift++; applyChordTranspose(); };
    $("tabMinus").onclick = () => { tabShift--; applyTabTranspose(); };
    $("tabPlus").onclick = () => { tabShift++; applyTabTranspose(); };
    $("capoMinus").onclick = () => { capoDisplayShift--; $("capoDisplayValue").textContent = String((toNumber(currentSong?.capo)||0)+capoDisplayShift); };
    $("capoPlus").onclick = () => { capoDisplayShift++; $("capoDisplayValue").textContent = String((toNumber(currentSong?.capo)||0)+capoDisplayShift); };
    $("sendToKaraokeBtn").onclick = sendToKaraoke;
    $("karaokeMenuBtn").onclick = () => $("karaokeMenu").classList.toggle("hidden");
    $("resetKaraokeBtn").onclick = resetKaraoke;
    $("editSongBtn").onclick = () => location.href = `lyricscreator.html?firebaseId=${encodeURIComponent(currentSongId)}`;
    $("sendSlaveLyricsBtn").onclick = () => sendSlaveLyrics("slaveLyricsSelect");

    // Duplicate performance tools above the first lyric section.
    if ($("quickSendToKaraokeBtn")) $("quickSendToKaraokeBtn").onclick = sendToKaraoke;
    if ($("quickKaraokeMenuBtn")) {
      $("quickKaraokeMenuBtn").onclick = () => $("quickKaraokeMenu").classList.toggle("hidden");
    }
    if ($("quickResetKaraokeBtn")) {
      $("quickResetKaraokeBtn").onclick = async () => {
        await resetKaraoke();
        $("quickKaraokeMenu")?.classList.add("hidden");
      };
    }
    if ($("quickEditSongBtn")) {
      $("quickEditSongBtn").onclick = () =>
        location.href = `lyricscreator.html?firebaseId=${encodeURIComponent(currentSongId)}`;
    }
    if ($("quickSendSlaveLyricsBtn")) {
      $("quickSendSlaveLyricsBtn").onclick = () => sendSlaveLyrics("quickSlaveLyricsSelect");
    }
    $("adminShortcutBtn").onclick = () => window.open("../../admin-new/admin.html","_blank","noopener");
    $("myNotesInput").addEventListener("input",() => { clearTimeout(notesSaveTimer); notesSaveTimer=setTimeout(saveMyNotes,700); });
    window.addEventListener("scroll",updateSectionProgress,{passive:true});
    window.addEventListener("resize",updateSectionProgress);
    document.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" && e.altKey) smoothRelativeScroll(1);
      if (e.key === "ArrowUp" && e.altKey) smoothRelativeScroll(-1);
      if (e.key === "ArrowRight" && e.altKey) scrollToSection(currentSectionIndex+1);
      if (e.key === "ArrowLeft" && e.altKey) scrollToSection(currentSectionIndex-1);
    });
    updateSpeed();
  }
  function updateSpeed(){ $("scrollSpeedLabel").textContent = `${scrollSpeed.toFixed(1)}×`; }

  async function init() {
    await loadSectionTitleDefaultsForView();
    bindUi();
    if (!songId) {
      $("lyricsContent").innerHTML = `<div class="host-load-error">No song selected.</div>`;
      return;
    }
    // A displayed song is effectively static during a performance. Use one
    // document read instead of a permanent realtime listener to reduce quota.
    try {
      const doc = await db.collection("lyrics").doc(songId).get();
      if (!doc.exists) {
        $("lyricsContent").innerHTML = `<div class="host-load-error">Could not load song data.</div>`;
        return;
      }
      currentSong = {id:doc.id,...doc.data()};

      loadSongScrollSpeed(currentSong);
      setTopTitle(currentSong);
      setInfo(currentSong);
      renderSections(currentSong);
      loadSlaveLyricsOptions();
    } catch (err) {
      console.error(err);
      $("lyricsContent").innerHTML = `<div class="host-load-error">${esc(err.message)}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

/************************************************************
 * FIXED TWO-ROW HEADER STACK SYNC
 * Measures the wrapper containing BOTH the song-title bar and
 * the loaded top-status bar. The page and drawer are offset by
 * that exact height. Keep this block after the main lyric code.
 ************************************************************/
(function initHostStickyStack(){
  function syncHostStickyStack(){
    const stack = document.getElementById("hostStickyStack");
    if (!stack) return;

    const h = Math.ceil(stack.getBoundingClientRect().height || 0);
    const safeHeight = Math.max(h, 58);
    document.documentElement.style.setProperty("--host-sticky-stack-height", safeHeight + "px");
    document.documentElement.style.setProperty("--lv-stack-h", safeHeight + "px");
  }

  window.syncHostStickyStack = syncHostStickyStack;

  function bindObservers(){
    const stack = document.getElementById("hostStickyStack");
    const status = document.getElementById("topStatusContainer");
    if (!stack) return;

    syncHostStickyStack();
    requestAnimationFrame(syncHostStickyStack);
    setTimeout(syncHostStickyStack, 100);
    setTimeout(syncHostStickyStack, 350);
    setTimeout(syncHostStickyStack, 900);

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => requestAnimationFrame(syncHostStickyStack));
      ro.observe(stack);
      if (status) ro.observe(status);
    }

    if (status && "MutationObserver" in window) {
      const mo = new MutationObserver(() => requestAnimationFrame(syncHostStickyStack));
      mo.observe(status, {childList:true, subtree:true, attributes:true, characterData:true});
    }
  }

  document.addEventListener("DOMContentLoaded", bindObservers);
  window.addEventListener("load", syncHostStickyStack);
  window.addEventListener("resize", syncHostStickyStack);
  window.addEventListener("orientationchange", () => setTimeout(syncHostStickyStack, 120));
})();
