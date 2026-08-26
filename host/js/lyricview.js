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
    ending: "#ffd400",
    fallback: "#ffffff"
  };
  let sectionEls = [];
  let currentSectionIndex = 0;
  let scrollTimer = null;
  let autoScrollOn = false;

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
    if (clean === "ENDING" || clean === "END" || clean === "OUTRO") return "ending";
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
   * SLAVE / KARAOKE LYRICS DROPDOWN
   *
   * IMPORTANT:
   * The dropdown is populated from:
   *   root/adm/files/song-data.js
   *
   * lyricview.html loads that file as:
   *   ../files/song-data.js
   *
   * song-data.js exposes window.songs.
   *
   * We deliberately DO NOT build the target from:
   *   Song Title + Artist
   *
   * Instead we take the ID/filename directly from each song's
   * saved URL in song-data.js. This restores the old behaviour
   * for files such as:
   *   allthesmallthings.js
   ************************************************************/

  function dVal(v) {
    return String(v || "").replace(/"/g, "&quot;");
  }

  function normaliseSlaveLyricsId(value) {
    return String(value || "")
      .trim()
      .replace(/^.*[\\/]/, "")
      .replace(/\.js(?:[?#].*)?$/i, "")
      .replace(/[?#].*$/, "");
  }

  function extractSlaveLyricsIdFromUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";

    // 1) Old karaoke URL format:
    //    lyrics/song.html?id=allthesmallthings
    //    song.html?id=allthesmallthings
    try {
      const absolute = new URL(raw, window.location.href);
      const queryId = absolute.searchParams.get("id");
      if (queryId) return normaliseSlaveLyricsId(queryId);

      // 2) Direct JS URL:
      //    host/lyrics/lyrics-data/allthesmallthings.js
      //    lyrics/lyrics-data/allthesmallthings.js
      const pathname = decodeURIComponent(absolute.pathname || "");
      const fileMatch = pathname.match(/([^/]+)\.js$/i);
      if (fileMatch) return normaliseSlaveLyricsId(fileMatch[1]);
    } catch (_) {
      // Fall through to string parsing below.
    }

    const idMatch = raw.match(/[?&]id=([^&#]+)/i);
    if (idMatch) {
      return normaliseSlaveLyricsId(decodeURIComponent(idMatch[1]));
    }

    const jsMatch = raw.match(/([^/?#]+)\.js(?:[?#].*)?$/i);
    if (jsMatch) {
      return normaliseSlaveLyricsId(decodeURIComponent(jsMatch[1]));
    }

    return "";
  }

  function getSlaveLyricsEntriesFromSongData() {
    const source = Array.isArray(window.songs) ? window.songs : [];

    const entries = [];
    const seen = new Set();

    source.forEach(song => {
      if (!song) return;

      // song-data.js is the authoritative mapping.
      // Some older rows use url, while a few builds may use one of the
      // alternate URL field names below, so support all of them safely.
      const sourceUrl =
        song.url ||
        song.lyricsUrl ||
        song.karaokeUrl ||
        song.karaokeLyricsUrl ||
        "";

      const id = extractSlaveLyricsIdFromUrl(sourceUrl);

      if (!id) return;

      const key = id.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const fileName = `${id}.js`;

      entries.push({
        id,
        fileName,
        title: String(song.title || id),
        artist: String(song.artist || ""),
        sourceUrl
      });
    });

    return entries.sort((a, b) =>
      String(a.title || a.fileName).localeCompare(
        String(b.title || b.fileName),
        undefined,
        { sensitivity: "base" }
      )
    );
  }

  function findCurrentSlaveLyricsId(entries) {
    if (!Array.isArray(entries) || !entries.length) return "";

    // First preference: the saved karaokeLyrics value on the Firestore song.
    const saved = normaliseSlaveLyricsId(currentSong?.karaokeLyrics);
    if (saved) {
      const match = entries.find(entry =>
        entry.id.toLowerCase() === saved.toLowerCase()
      );
      if (match) return match.id;
    }

    // Second preference: match current song title against song-data.js title.
    // We do NOT append the artist to create a filename.
    const currentTitle = String(currentSong?.title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (currentTitle) {
      const match = entries.find(entry =>
        String(entry.title || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "") === currentTitle
      );
      if (match) return match.id;
    }

    return "";
  }

  async function waitForSongData(timeoutMs = 4000) {
    if (Array.isArray(window.songs) && window.songs.length) {
      return true;
    }

    const start = Date.now();

    return await new Promise(resolve => {
      const timer = setInterval(() => {
        if (Array.isArray(window.songs) && window.songs.length) {
          clearInterval(timer);
          resolve(true);
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, 50);
    });
  }

  async function loadSlaveLyricsOptions() {
    const selects = [
      $("slaveLyricsSelect"),
      $("quickSlaveLyricsSelect")
    ].filter(Boolean);

    if (!selects.length) return;

    selects.forEach(select => {
      select.disabled = true;
      select.innerHTML =
        `<option value="">Loading lyrics list…</option>`;
    });

    const loaded = await waitForSongData();

    if (!loaded) {
      console.error(
        "song-data.js did not load. Expected: ../files/song-data.js"
      );

      selects.forEach(select => {
        select.disabled = false;
        select.innerHTML =
          `<option value="">Could not load song-data.js</option>`;
      });
      return;
    }

    const entries = getSlaveLyricsEntriesFromSongData();

    if (!entries.length) {
      console.error(
        "window.songs loaded, but no lyric IDs could be extracted from its URLs.",
        window.songs
      );

      selects.forEach(select => {
        select.disabled = false;
        select.innerHTML =
          `<option value="">No lyric JS files found in song-data.js</option>`;
      });
      return;
    }

    const options =
      `<option value="">Choose lyrics to send…</option>` +
      entries.map(entry => {
        const artistText = entry.artist ? ` — ${entry.artist}` : "";

        return (
          `<option value="${esc(dVal(entry.id))}" ` +
          `data-lyrics-file="${esc(dVal(entry.fileName))}">` +
          `${esc(entry.title)}${esc(artistText)} ` +
          `(${esc(entry.fileName)})` +
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
      `Loaded ${entries.length} slave lyric file entries from song-data.js`,
      entries
    );
  }

  async function sendSlaveLyrics(selectId = "slaveLyricsSelect") {
    const select = $(selectId);
    const id = String(select?.value || "").trim();

    if (!id) {
      return showModal(
        "Choose Lyrics",
        "Select a lyrics file first."
      );
    }

    const option = select.options[select.selectedIndex];

    const fileName =
      option?.dataset?.lyricsFile ||
      `${normaliseSlaveLyricsId(id)}.js`;

    // This is the actual file location from lyricview.html:
    // root/adm/host/lyrics/lyrics-data/<filename>.js
    const relativeFilePath =
      `../../adm/host/lyrics/lyrics-data/${fileName}`;

    await db.collection("karaokeControl").doc("liveLyrics").set({
      // Keep old compatibility fields.
      currentSongId: id,
      songId: id,

      // Explicit file mapping so the singer/slave page never has to invent
      // a filename using song title + artist.
      lyricsFileId: id,
      lyricsFileName: fileName,
      lyricsFilePath: relativeFilePath,
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

  function startAutoScroll() {
    autoScrollOn = !autoScrollOn;
    $("autoScrollBtn").classList.toggle("active", autoScrollOn);
    $("autoScrollBtn").textContent = autoScrollOn ? "Ⅱ" : "▶";

    if (autoScrollOn) {
      let last = performance.now();
      let fractionalY = 0;

      const tick = now => {
        if (!autoScrollOn) return;

        // Keep scrolling tied to the browser's refresh cycle.
        // Fractional accumulation avoids stop/start integer-pixel jumps
        // at slower speeds while remaining stable at high speeds.
        const dt = Math.min(50, Math.max(0, now - last));
        last = now;

        if (!document.hidden) {
          fractionalY += dt * AUTO_SCROLL_BASE_PX_PER_MS * scrollSpeed;

          const wholePixels = Math.floor(fractionalY);
          if (wholePixels > 0) {
            window.scrollBy(0, wholePixels);
            fractionalY -= wholePixels;
          }
        }

        scrollTimer = requestAnimationFrame(tick);
      };

      scrollTimer = requestAnimationFrame(tick);
    } else if (scrollTimer) {
      cancelAnimationFrame(scrollTimer);
      scrollTimer = null;
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
    $("jumpTopBtn").onclick = () => scrollTo({top:0,behavior:"smooth"});
    $("jumpBottomBtn").onclick = () => scrollTo({top:document.documentElement.scrollHeight,behavior:"smooth"});
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
    db.collection("lyrics").doc(songId).onSnapshot(doc => {
      if (!doc.exists) { $("lyricsContent").innerHTML = `<div class="host-load-error">Could not load song data.</div>`; return; }
      currentSong = {id:doc.id,...doc.data()};

      // Restore this song's own saved autoscroll multiplier.
      loadSongScrollSpeed(currentSong);

      setTopTitle(currentSong);
      setInfo(currentSong);
      renderSections(currentSong);
      loadSlaveLyricsOptions();
    }, err => {
      console.error(err);
      $("lyricsContent").innerHTML = `<div class="host-load-error">${esc(err.message)}</div>`;
    });
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
