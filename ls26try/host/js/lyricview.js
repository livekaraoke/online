/* Copyright © 2026 LiveSuite. All rights reserved.
 * host/js/lyricview.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
(() => {
  const db = window.db;
  const params = new URLSearchParams(location.search);
  const songId = params.get("id") || params.get("firebaseId");
  const requestId = params.get("requestId") || "";
  const returnTo = params.get("returnTo") || "";
  const fromTitle = params.get("fromTitle") || "";

  let currentSong = null;
  let currentSongId = songId;
  let performanceTempo = null;
  async function flushPerformanceTempo(){await performanceRecordPromise;return performanceTempo?.flush();}
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
  let sectionItems = [];
  let activeSessionType = "";
  let showAllSectionsOverride = false;
  let currentSectionIndex = 0;
  let manualSectionUntil = 0;
  let relativeScrollFrame = 0;
  let scrollTimer = null;
  let autoScrollOn = false;
  let sectionPauseUntil = 0;
  let sectionPauseStartsAt = 0;
  let lastSectionPauseIndex = -1;
  let sectionPauseCountdownFrame = 0;
  let quickToolsResizeObserver = null;
  let performanceRecordCreated = false;
  let performanceRecordPromise = null;
  let ensurePlayingPromise = null;
  let ensurePlayingDone = false;
  let ensurePlayingRetryAfter = 0;
  let autoScrollEndHandled = false;

  // AUTOSCROLL:
  // 1.00× is now physically one-third of the old 1.00× pace.
  // The multiplier is stored separately for every song in Firestore.
  let scrollSpeed = 1;
  const AUTO_SCROLL_BASE_PX_PER_MS = 0.006; // one-third of old 0.018 base
  let chordShift = 0;
  let tabShift = 0;
  const DEFAULT_GUITAR_TUNING = {
    name:"Standard Tuning",
    strings:["E","A","D","G","B","e"]
  };
  let capoDisplayShift = 0;
  let notesSaveTimer = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const toNumber = value => {
    const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  function normaliseSongIdentity(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "");
  }

  function sameSongByMetadata(item, song) {
    if (!item || !song) return false;

    const itemTitle = normaliseSongIdentity(item.songTitle || item.title);
    const songTitle = normaliseSongIdentity(song.title);

    if (!itemTitle || itemTitle !== songTitle) return false;

    const itemArtist = normaliseSongIdentity(ArtistNames.display(item.artist || item.songArtist));
    const songArtist = normaliseSongIdentity(ArtistNames.display(song.artist));

    return !itemArtist || !songArtist || itemArtist === songArtist;
  }

  async function resolveRunOrderSongDocument(item) {
    const cached=window.LK?.sessionTools?.getSongs?.().find(s=>s.id===item?.songId);
    if(cached)return cached;
    if (!item) return null;

    // Fast path: current song ID really is a Firestore document ID.
    if (item.songId) {
      try {
        const direct = await db.collection("lyrics").doc(item.songId).get();
        if (direct.exists) {
          return { id:direct.id, ...(direct.data() || {}) };
        }
      } catch (error) {
        console.warn("Direct Run Order song lookup failed:", error);
      }
    }

    // Migrated/manual rows can contain a legacy "id" value generated from
    // title+artist rather than the actual Firestore doc ID. Resolve by title.
    const title = String(item.songTitle || item.title || "").trim();
    if (!title) return null;

    try {
      const snap = await db
        .collection("lyrics")
        .where("title", "==", title)
        .limit(10)
        .get();

      const candidates = snap.docs.map(doc => ({
        ...(doc.data() || {}),
        id:doc.id
      }));

      if (!candidates.length) return null;

      const artistKey = normaliseSongIdentity(ArtistNames.display(item.artist || item.songArtist));
      if (artistKey) {
        const exact = candidates.find(song =>
          normaliseSongIdentity(ArtistNames.display(song.artist)) === artistKey
        );
        if (exact) return exact;
      }

      return candidates.length === 1 ? candidates[0] : candidates[0];
    } catch (error) {
      console.warn("Could not resolve legacy Run Order song ID:", error);
      return null;
    }
  }

  async function repairSingleRunOrderItemSongId(item, resolvedSong, runData) {
    if (
      !item?.id ||
      !resolvedSong?.id ||
      item.songId === resolvedSong.id ||
      !Array.isArray(runData?.items)
    ) {
      return;
    }

    const items = runData.items.map(entry =>
      entry.id === item.id
        ? {
            ...entry,
            songId:resolvedSong.id,
            songTitle:entry.songTitle || resolvedSong.title || "",
            artist:entry.artist || resolvedSong.artist || ""
          }
        : entry
    );

    try {
      await db.collection("karaokeControl").doc("runOrder").set({
        sessionId:runData.sessionId || "",
        items,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    } catch (error) {
      console.warn("Could not self-heal Run Order song ID:", error);
    }
  }

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
    $("topbarSongTitle").innerHTML = `<strong>${esc(song.title || "Untitled")}</strong><span>${esc(ArtistNames.display(song.artist || ""))}${song.year ? " · " + esc(song.year) : ""}</span>`;
    $("infoSongTitle").textContent = `${song.title || "Untitled"}${song.artist ? " — " + ArtistNames.display(song.artist) : ""}`;
  }

  function setInfo(song, tempoOnly=false) {
    const savedTempo = toNumber(song.userBpm) || toNumber(song.originalBpm);
    const tempo = performanceTempo?.get() || savedTempo;
    const original = toNumber(song.originalBpm);
    const time = song.timeSignature || song.time || "4/4";
    const capo = song.capo === "" || song.capo == null ? "0" : song.capo;

    // SONG INFO sidebar
    $("infoKey").textContent = song.key || "–";
    $("infoTime").textContent = time;
    $("infoCapo").textContent = capo;
    $("infoYear").textContent = song.year || "–";
    $("infoSongNotes").textContent = song.note || song.songNote || "No song notes.";
    if ($("capoDisplayValue")) $("capoDisplayValue").textContent = String(toNumber(song.capo) || 0);

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

    // Current performance values in the sticky song title bar
    if ($("quickKey")) $("quickKey").textContent = song.key || "–";
    if ($("quickTime")) $("quickTime").textContent = time;
    renderBpmValue($("quickTempo"), savedTempo);
    renderBpmValue($("quickOriginalBpm"), original);
    if ($("quickCapo")) {
      $("quickCapo").textContent = capo;
      $("quickCapo").dataset.zero = String(Number(capo) === 0);
    }

    const tempoTargets = [$("infoTempo"), $("quickTempo")].filter(Boolean);
    const originalTargets = [$("infoOriginalBpm"), $("quickOriginalBpm")].filter(Boolean);

    tempoTargets.forEach(el => el.classList.remove("tempo-match", "tempo-different"));
    originalTargets.forEach(el => el.classList.remove("original-different"));

    for(const [el,value] of [[$("infoTempo"),tempo],[$("quickTempo"),savedTempo]]){
      if(el&&value!=null&&original!=null){
        el.classList.add(value===original?'tempo-match':'tempo-different');
        if(value!==original)originalTargets.forEach(target=>target.classList.add('original-different'));
      }
    }

    if(!tempoOnly){$("myNotesInput").value = song.myNotes || "";renderPerformanceSongReference(song);}
  }

  function songYoutubeLinks(song) {
    const values = Array.isArray(song?.youtubeLinks) && song.youtubeLinks.length
      ? song.youtubeLinks
      : [song?.youtubeLink || ""];
    const labels = Array.isArray(song?.youtubeLinkLabels) ? song.youtubeLinkLabels : [];
    const seen = new Set();
    return values.map((value,index)=>({
      url:String(value||"").trim(),
      label:String(labels[index]||"").trim()
    })).filter(item=>{
      if(!item.url||seen.has(item.url))return false;
      seen.add(item.url);
      return true;
    });
  }

  function renderPerformanceSongReference(song) {
    const root=$("performanceSongReference");
    if(!root)return;
    const note=String(song?.note||song?.songNote||"").trim();
    const details=String(song?.songDetails||"").trim();
    const links=songYoutubeLinks(song);
    const loopSlot = song?.loopSlot === null || song?.loopSlot === undefined || song?.loopSlot === "" ? "–" : String(song.loopSlot);
    const looping = song?.looping === true || ["true","yes"].includes(String(song?.looping||"").toLowerCase());
    const hostNotes=(song?.sections||[]).filter(section=>{
      const isHost=`${section?.type||""} ${section?.title||""}`.toLowerCase().includes("host note");
      return isHost&&(showAllSectionsOverride||sectionVisibleForActiveType(section));
    });

    const noteCard=$("performanceSongNoteCard");
    noteCard.hidden=false;
    $("performanceSongNote").textContent=note || "–";

    const youtubeCard=$("performanceYoutubeCard");
    youtubeCard.hidden=!links.length;
    $("performanceYoutubeLinks").innerHTML=links.map((link,index)=>{
      const label=link.label||`YouTube${links.length>1?` ${index+1}`:""}`;
      return `<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">▶ ${esc(label)}</a>`;
    }).join("");

    $("quickLoopSlot").textContent = loopSlot;
    $("quickLooping").textContent = looping ? "YES" : "NO";
    $("performanceLoopingCard").dataset.looping = looping ? "yes" : "no";
    $("performanceSongDetails").textContent = details || "—";

    // Host Note sections now render in their actual song position with the
    // normal LyricView sections. Do not duplicate them in the top reference row.
    const hostCard=$("performanceHostNotesCard");
    if (hostCard) hostCard.hidden=true;
    if ($("performanceHostNotes")) $("performanceHostNotes").innerHTML="";

    // TIME is now a permanent reference card beside the YouTube/notes cards,
    // so keep this reference row available even when a song has no note/link.
    root.hidden=false;
  }

  function openSongNoteModal() {
    if(!currentSong)return;
    $("songActionsMenu")?.classList.add("hidden");
    $("songActionsBtn")?.setAttribute("aria-expanded","false");
    $("songNoteEditInput").value=currentSong.note||currentSong.songNote||"";
    $("songNoteSaveStatus").textContent="";
    $("songNoteModal").classList.remove("hidden");
    $("songNoteModal").setAttribute("aria-hidden","false");
    requestAnimationFrame(()=>$("songNoteEditInput")?.focus());
  }

  function closeSongNoteModal() {
    $("songNoteModal")?.classList.add("hidden");
    $("songNoteModal")?.setAttribute("aria-hidden","true");
  }

  async function saveSongNoteFromPerformance() {
    if(!currentSongId)return;
    const button=$("songNoteSaveBtn");
    const value=$("songNoteEditInput").value.trim();
    button.disabled=true;
    $("songNoteSaveStatus").textContent="Saving…";
    try{
      await db.collection("lyrics").doc(currentSongId).set({
        note:value,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
      currentSong={...currentSong,note:value};
      setInfo(currentSong);
      $("songNoteSaveStatus").textContent="Saved";
      setTimeout(() => {
        closeSongNoteModal();
        window.LS26?.toast("Song note saved successfully.");
      },250);
    }catch(error){
      console.error("Could not save song note:",error);
      $("songNoteSaveStatus").textContent=error.message||"Could not save note.";
    }finally{button.disabled=false;}
  }

  function normaliseType(value) {
    return String(value || "").trim().toLowerCase();
  }

  function sectionVisibleForActiveType(section) {
    if (!activeSessionType) return true;
    if (!Object.prototype.hasOwnProperty.call(section || {}, "visibleForTypes") || section.visibleForTypes == null) return true;
    if (!Array.isArray(section.visibleForTypes)) return true;
    return section.visibleForTypes.some(type => normaliseType(type) === normaliseType(activeSessionType));
  }

  async function loadActiveSessionType() {
    activeSessionType = "";
    try {
      const { sessionId, control } = await getActiveSessionContext();
      if (!sessionId) return;
      activeSessionType = control.sessionType || control.type || "";
      if (!activeSessionType) {
        const sessionSnap = await db.collection("performanceSessions").doc(sessionId).get();
        const session = sessionSnap.exists ? (sessionSnap.data() || {}) : {};
        activeSessionType = session.sessionType || session.type || "";
      }
    } catch (error) {
      console.warn("Could not resolve active session type for section visibility:", error);
      activeSessionType = "";
    }
  }

  function safeReturnUrl() {
    if (!returnTo) return "";
    try {
      const target = new URL(returnTo, location.href);
      const here = new URL(location.href);
      if (target.protocol !== here.protocol || target.host !== here.host) return "";
      if (!target.pathname.endsWith("/lyricview.html")) return "";
      return target.href;
    } catch (_) {
      return "";
    }
  }

  function setupLinkedSongReturn() {
    const bar = $("linkedSongReturnBar");
    const button = $("linkedSongReturnBtn");
    const target = safeReturnUrl();
    if (!bar || !button || !target) return;
    bar.classList.remove("hidden");
    $("linkedSongReturnTitle").textContent = fromTitle || "Previous song";
    button.onclick = () => { location.href = target; };
  }

  function buildLinkedSongUrl(targetId) {
    const next = new URL("lyricview.html", location.href);
    next.searchParams.set("id", targetId);
    const currentRelative = `lyricview.html${location.search}${location.hash}`;
    next.searchParams.set("returnTo", currentRelative);
    if (currentSong?.title) next.searchParams.set("fromTitle", currentSong.title);
    return `${next.pathname.split("/").pop()}?${next.searchParams.toString()}${next.hash}`;
  }

  function isHostNoteSection(section) {
    const key = `${section?.type || ""} ${section?.title || ""}`
      .toLowerCase()
      .replace(/[-_]+/g," ");
    return /host\s*note/.test(key) || String(section?.type || "").toLowerCase() === "hostnote";
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
    holder.innerHTML = LS26SectionContent.cleanHtml(html);
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

  function normaliseGuitarTuning(song) {
    const tuning = song?.guitarTuning && typeof song.guitarTuning === "object"
      ? song.guitarTuning
      : DEFAULT_GUITAR_TUNING;
    const name = String(tuning.name || DEFAULT_GUITAR_TUNING.name).trim() || DEFAULT_GUITAR_TUNING.name;
    const source = Array.isArray(tuning.strings) ? tuning.strings : DEFAULT_GUITAR_TUNING.strings;
    const strings = DEFAULT_GUITAR_TUNING.strings.map((fallback,index) =>
      String(source[index] ?? fallback).trim() || fallback
    );
    return {name,strings};
  }

  function renderGuitarTuning(song) {
    const card = $("guitarTuningCard");
    if (!card) return;
    const tuning = normaliseGuitarTuning(song);
    $("guitarTuningName").textContent = tuning.name;
    $("guitarTuningStrings").textContent = tuning.strings.join(" - ");
    card.hidden = false;
    requestAnimationFrame(updateGuitarTuningStickyState);
  }

  function secondVisibleSectionIndex() {
    let count = 0;
    for (const item of sectionItems) {
      if (item.hiddenBySession) continue;
      const index = sectionEls.indexOf(item.el);
      if (index < 0) continue;
      count++;
      if (count === 2) return index;
    }
    return -1;
  }

  function updateGuitarTuningStickyState() {
    const card = $("guitarTuningCard");
    if (!card || card.hidden) return;
    const secondSection = secondVisibleSectionIndex();
    const released = secondSection >= 0 && currentSectionIndex >= secondSection;
    card.classList.toggle("past-tuning-window", released);
  }

  function guitarTuningStickyHeight() {
    const card = $("guitarTuningCard");
    if (!card || card.hidden) return 0;
    // Keep the section activation anchor stable at the release boundary. The
    // card remains in document flow while visually hidden, so using its height
    // here prevents the active section from bouncing between Verse 1/Verse 2.
    return Math.ceil(card.getBoundingClientRect().height || 0) + 8;
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
    clearSectionPauseCountdown();
    const container = $("lyricsContent");
    container.innerHTML = "";
    sectionEls = [];
    sectionItems = [];

    (song.sections || []).forEach((section, index) => {
      if (section.type === "separator") {
        const sep = document.createElement("div");
        sep.className = "host-separator";
        container.appendChild(sep);
        return;
      }
      const hostNote = isHostNoteSection(section);
      const restrictedByType = !sectionVisibleForActiveType(section);
      const card = document.createElement("section");
      card.className = `host-section ${sectionTypeClass(section)}`;
      if (hostNote && section.displayAsCard === true) card.classList.add("display-as-card");
      card.dataset.sectionIndex = String(index);
      card.dataset.sectionTitle = section.title || section.type || `Section ${index + 1}`;
      card.dataset.typeRestricted = restrictedByType ? "true" : "false";
      if (section.collapsed === true) card.classList.add("collapsed");

      const header = document.createElement("button");
      header.className = "host-section-header";
      header.type = "button";
      header.innerHTML = `<span class="collapse-arrow">${card.classList.contains("collapsed") ? "▸" : "▾"}</span><strong>${esc(section.title || section.type || "SECTION")}</strong><span class="section-colour-indicator" aria-hidden="true"></span><span class="collapse-hint">${card.classList.contains("collapsed") ? "SHOW" : "HIDE"}</span>`;

      const titleColour = section.style?.titleColor || getSystemSectionTitleColour(section.title);
      card.dataset.sectionTitleColor = titleColour;
      const titleEl = header.querySelector("strong");
      if (titleEl) titleEl.style.color = titleColour;

      // Fill the otherwise empty part of the section heading with the exact
      // section-title colour chosen in Lyrics Creator. This is deliberately
      // presentation-only: it reuses section.style.titleColor and creates no
      // new song/database field.
      const colourIndicator = header.querySelector(".section-colour-indicator");
      if (colourIndicator) {
        colourIndicator.style.setProperty("--section-indicator-colour", titleColour);
        colourIndicator.style.backgroundColor = titleColour;
      }

      const body = document.createElement("div");
      body.className = "host-section-body";
      body.style.fontFamily = section.style?.fontFamily || "Verdana, Arial, sans-serif";
      body.style.fontSize = `${Number(section.style?.fontSize) || 23}px`;
      if (section.style?.color) body.style.color = section.style.color;
      body.style.textAlign = ["left","center","right"].includes(section.style?.textAlign) ? section.style.textAlign : "left";

      if (sectionTypeClass(section) === "is-tab") {
        buildBeatGridTab(section, body);
      } else if (hostNote) {
        // New Host Notes may contain rich formatting from LyricsCreator.
        // Existing plain-text notes remain fully compatible.
        body.innerHTML = section.html
          ? cleanSectionHtml(section.html)
          : esc(section.text || "").replace(/\r?\n/g, "<br>");
      } else {
        body.innerHTML = cleanSectionHtml(section.html || section.text || "");
      }

      applySectionDashColour(body, section.style?.dashColor || "#777777");

      header.addEventListener("click", () => {
        card.classList.toggle("collapsed");
        const collapsed = card.classList.contains("collapsed");
        header.querySelector(".collapse-arrow").textContent = collapsed ? "▸" : "▾";
        header.querySelector(".collapse-hint").textContent = collapsed ? "SHOW" : "HIDE";
        requestAnimationFrame(updateSectionProgress);
      });

      const pauseCountdown = document.createElement("div");
      pauseCountdown.className = "section-pause-countdown";
      pauseCountdown.hidden = true;
      pauseCountdown.setAttribute("aria-hidden", "true");

      body.appendChild(pauseCountdown);
      card.append(header, body);
      container.appendChild(card);
      sectionItems.push({ el:card, section, sourceIndex:index, restrictedByType });
    });

    applySectionVisibility(false);
    renderHostNotes(song);
    applyChordTranspose();
    applyTabTranspose();
    updateSectionProgress();
  }

  function applySectionVisibility(preserveScroll = true) {
    const previous = preserveScroll && sectionEls[currentSectionIndex]
      ? sectionEls[currentSectionIndex].dataset.sectionIndex
      : null;

    sectionItems.forEach(item => {
      const hiddenBySession = item.restrictedByType && !showAllSectionsOverride;
      item.el.classList.toggle("session-visibility-hidden", hiddenBySession);
      item.el.classList.toggle("type-restricted-section", item.restrictedByType);
      item.hiddenBySession = hiddenBySession;
    });

    sectionEls = sectionItems.filter(item => !item.hiddenBySession).map(item => item.el);
    if (previous != null) {
      const restored = sectionEls.findIndex(el => el.dataset.sectionIndex === previous);
      currentSectionIndex = restored >= 0 ? restored : Math.min(currentSectionIndex, Math.max(0, sectionEls.length - 1));
    } else {
      currentSectionIndex = Math.min(currentSectionIndex, Math.max(0, sectionEls.length - 1));
    }

    updateGuitarTuningStickyState();
    renderSectionProgress();
    updateSectionVisibilityUi();
  }

  function updateSectionVisibilityUi() {
    const status = $("sectionVisibilityStatus");
    const button = $("showAllSectionsBtn");
    if (!status || !button) return;

    const restrictedCount = sectionItems.filter(item => item.restrictedByType).length;
    if (!activeSessionType) {
      status.textContent = "No active session — all sections are visible.";
      button.textContent = "ALL SECTIONS VISIBLE";
      button.disabled = true;
      return;
    }

    if (!restrictedCount) {
      status.textContent = `${activeSessionType} session — no sections are hidden.`;
      button.textContent = "ALL SECTIONS VISIBLE";
      button.disabled = true;
      return;
    }

    button.disabled = false;
    if (showAllSectionsOverride) {
      status.textContent = `${activeSessionType} session — visibility override active. ${restrictedCount} restricted section${restrictedCount === 1 ? "" : "s"} forced visible.`;
      button.textContent = `USE ${activeSessionType.toUpperCase()} FILTER`;
    } else {
      status.textContent = `${activeSessionType} session — ${restrictedCount} section${restrictedCount === 1 ? "" : "s"} hidden by section settings.`;
      button.textContent = "SHOW ALL SECTIONS";
    }
  }

  function renderHostNotes(song) {
    const notes = (song.sections || []).filter(s => {
      const isHost = `${s.type || ""} ${s.title || ""}`.toLowerCase().includes("host note");
      if (!isHost) return false;
      return showAllSectionsOverride || sectionVisibleForActiveType(s);
    });
    const out = $("hostLyricNotes");
    if (!notes.length) { out.textContent = "No host-note sections for this session type."; return; }
    out.innerHTML = notes.map(n => `<article><strong>${esc(n.title || "HOST NOTE")}</strong><div>${cleanSectionHtml(n.html || n.text || "")}</div></article>`).join("");
  }

  function renderSectionProgress() {
    const progress = $("sectionProgress");
    progress.innerHTML = "";

    sectionItems.forEach((item, allIndex) => {
      const el = item.el;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "progress-section";
      if (item.restrictedByType) b.classList.add("type-restricted");
      if (item.hiddenBySession) b.classList.add("session-hidden");

      const visibleIndex = sectionEls.indexOf(el);
      b.dataset.visibleIndex = String(visibleIndex);
      b.setAttribute("aria-disabled", item.hiddenBySession ? "true" : "false");

      const progressTitleColour =
        el.dataset.sectionTitleColor ||
        getSystemSectionTitleColour(el.dataset.sectionTitle || "");

      b.style.setProperty("--progress-title-color", progressTitleColour);
      b.innerHTML = `<span>${esc(el.dataset.sectionTitle || `S${allIndex+1}`)}</span><i></i>`;
      b.onclick = () => {
        if (item.hiddenBySession || visibleIndex < 0) return;
        scrollToSection(visibleIndex);
      };
      progress.appendChild(b);
    });

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
    const active = items.find(item => item.classList.contains("active")) ||
      items.find(item => Number(item.dataset.visibleIndex) === currentSectionIndex && !item.classList.contains("session-hidden"));
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

  function sectionActivationOffset() {
    const fromSettings = Number(window.LS26Settings?.get?.().lyricSectionActivationOffset);
    if (Number.isFinite(fromSettings)) return fromSettings;
    const cssValue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ls26-section-activation-offset"));
    return Number.isFinite(cssValue) ? cssValue : 320;
  }

  function performanceActivationAnchor() {
    const header=document.getElementById("ls26StickyHeader");
    const quick=document.getElementById("performanceQuickInfo");
    return (header?.getBoundingClientRect().height||0)
      +(quick&&!quick.classList.contains("ls26-released")?quick.getBoundingClientRect().height:0)
      +guitarTuningStickyHeight()
      +sectionActivationOffset();
  }

  function sectionFocusSettings() {
    const settings=window.LS26Settings?.get?.()||{};
    const past=Math.max(0,Math.min(1,Number(settings.lyricPastSectionOpacity??50)/100));
    const upcoming=Math.max(0,Math.min(1,Number(settings.lyricUpcomingSectionOpacity??50)/100));
    const upcomingFadeDistance=Math.max(0,Math.min(800,Number(settings.lyricUpcomingFadeDistance??180)));
    const previousFadeDistance=Math.max(0,Math.min(800,Number(settings.lyricPreviousFadeDistance??180)));
    const duringPlayback=settings.lyricSectionFocusDuringPlayback!==false;
    const whenStopped=settings.lyricSectionFocusWhenStopped===true;
    return {past,upcoming,upcomingFadeDistance,previousFadeDistance,duringPlayback,whenStopped};
  }

  function sectionFadeProgress(distance,leadDistance) {
    if(leadDistance<=0)return distance<=0?1:0;
    return Math.max(0,Math.min(1,1-(distance/leadDistance)));
  }

  function updateSectionFocusOpacity(anchor=performanceActivationAnchor()) {
    if(!sectionEls.length)return;
    const {
      past,upcoming,upcomingFadeDistance,previousFadeDistance,
      duringPlayback,whenStopped
    }=sectionFocusSettings();
    const focusEnabled=autoScrollOn?duringPlayback:whenStopped;

    if(!focusEnabled){
      sectionEls.forEach(el=>{
        el.dataset.focusState="normal";
        el.style.opacity="1";
      });
      return;
    }

    const nextIndex=currentSectionIndex+1;
    const nextEl=sectionEls[nextIndex]||null;
    const activeEl=sectionEls[currentSectionIndex]||null;
    const nextDistance=nextEl?nextEl.getBoundingClientRect().top-anchor:Infinity;
    const upcomingProgress=nextEl?sectionFadeProgress(nextDistance,upcomingFadeDistance):0;
    const activeTravel=activeEl?Math.max(0,anchor-activeEl.getBoundingClientRect().top):0;
    const previousProgress=previousFadeDistance<=0
      ? (currentSectionIndex>0?1:0)
      : Math.max(0,Math.min(1,activeTravel/previousFadeDistance));

    sectionEls.forEach((el,index)=>{
      let opacity=1;
      let state="active";

      if(index<currentSectionIndex){
        if(index===currentSectionIndex-1){
          opacity=1-((1-past)*previousProgress);
          state="previous";
        }else{
          opacity=past;
          state="past";
        }
      }else if(index===currentSectionIndex){
        // The active section remains fully visible. Once it becomes previous,
        // its fade is driven by scroll distance travelled after activation.
        opacity=1;
        state="active";
      }else{
        opacity=upcoming;
        state=index===nextIndex?"next":"future";

        if(index===nextIndex){
          opacity=upcoming+((1-upcoming)*upcomingProgress);
        }
      }

      el.dataset.focusState=state;
      el.style.opacity=String(Math.max(0,Math.min(1,opacity)));
    });
  }

  function songCompletionActivationY(anchor=performanceActivationAnchor()) {
    const dock=document.querySelector(".host-bottom-dock");
    const dockTop=dock?.getBoundingClientRect().top||window.innerHeight;
    const desired=Math.max(anchor+70,window.innerHeight*.47);
    const capped=Math.min(dockTop-120,desired);
    return Math.max(anchor+30,capped);
  }

  function slowScrollCompletionIntoView() {
    const panel=$("endCompletionPanel");
    if(!panel||panel.hidden)return;
    cancelAnimationFrame(relativeScrollFrame);

    const sticky=document.getElementById("ls26StickyHeader");
    const targetViewportTop=(sticky?.getBoundingClientRect().height||0)+22;
    const start=window.scrollY;
    const panelDocumentTop=panel.getBoundingClientRect().top+start;
    const maxScroll=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
    const target=Math.max(0,Math.min(maxScroll,panelDocumentTop-targetViewportTop));
    const distance=target-start;
    if(Math.abs(distance)<3)return;

    const started=performance.now();
    const duration=1500;
    const step=now=>{
      const t=Math.min(1,(now-started)/duration);
      const eased=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      window.scrollTo(0,start+(distance*eased));
      if(t<1)relativeScrollFrame=requestAnimationFrame(step);
    };
    relativeScrollFrame=requestAnimationFrame(step);
  }

  function sectionPauseMsForIndex(index) {
    const el=sectionEls[index];
    if(!el)return 0;
    const item=sectionItems.find(entry=>entry.el===el);
    const value=Number(item?.section?.pauseMs);
    return Number.isFinite(value)&&value>0?Math.round(value):0;
  }

  function clearSectionPauseCountdown() {
    if(sectionPauseCountdownFrame){
      cancelAnimationFrame(sectionPauseCountdownFrame);
      sectionPauseCountdownFrame=0;
    }
    sectionItems.forEach(item=>{
      const output=item.el?.querySelector?.(".section-pause-countdown");
      if(!output)return;
      output.hidden=true;
      output.textContent="";
    });
  }

  function runSectionPauseCountdown(index) {
    clearSectionPauseCountdown();
    const card=sectionEls[index];
    const output=card?.querySelector?.(".section-pause-countdown");
    if(!card||!output||sectionPauseMsForIndex(index)<=0)return;

    const tick=()=>{
      if(!autoScrollOn||currentSectionIndex!==index||sectionPauseUntil<=0){
        output.hidden=true;
        output.textContent="";
        sectionPauseCountdownFrame=0;
        return;
      }

      const now=Date.now();
      if(now<sectionPauseStartsAt){
        output.hidden=true;
        output.textContent="";
        sectionPauseCountdownFrame=requestAnimationFrame(tick);
        return;
      }

      const remaining=sectionPauseUntil-now;
      if(remaining<=0){
        output.hidden=true;
        output.textContent="";
        sectionPauseCountdownFrame=0;
        return;
      }

      output.textContent=String(Math.max(1,Math.ceil(remaining/1000)));
      output.hidden=false;
      sectionPauseCountdownFrame=requestAnimationFrame(tick);
    };

    tick();
  }

  function syncQuickToolsHeight() {
    const quick=$("performanceQuickInfo");
    const height=quick&&!quick.hidden&&!quick.classList.contains("ls26-released")
      ? Math.ceil(quick.getBoundingClientRect().height||0)
      : 0;
    document.documentElement?.style?.setProperty?.("--ls26-karaoke-tools-h",height+"px");
  }

  function setQuickToolsReleased(released) {
    const quick=$("performanceQuickInfo");
    quick?.classList.toggle("ls26-released",!!released);
    syncQuickToolsHeight();
  }

  function beginCurrentSectionEndPause(index) {
    if(
      !autoScrollOn ||
      index<0 ||
      index>=sectionEls.length ||
      index===lastSectionPauseIndex
    )return 0;

    const pauseMs=sectionPauseMsForIndex(index);
    if(pauseMs<=0)return 0;

    lastSectionPauseIndex=index;
    sectionPauseStartsAt=Date.now();
    sectionPauseUntil=sectionPauseStartsAt+pauseMs;
    runSectionPauseCountdown(index);
    return pauseMs;
  }

  function maybeBeginCurrentSectionEndPause(anchor) {
    if(!autoScrollOn||!sectionEls.length)return false;

    const activeIndex=currentSectionIndex;
    const nextIndex=activeIndex+1;
    if(
      activeIndex<0 ||
      nextIndex>=sectionEls.length ||
      activeIndex===lastSectionPauseIndex ||
      sectionPauseMsForIndex(activeIndex)<=0
    )return false;

    const nextEl=sectionEls[nextIndex];
    const nextDistance=nextEl.getBoundingClientRect().top-anchor;
    const fadeDistance=sectionFocusSettings().upcomingFadeDistance;

    // Trigger a few pixels BEFORE the next section enters its fade-in zone.
    // The current section remains current and fully visible while its pause
    // counts down; only after the pause ends can the next section start fading.
    const preFadeBuffer=8;
    if(nextDistance<=0 || nextDistance>fadeDistance+preFadeBuffer)return false;

    return beginCurrentSectionEndPause(activeIndex)>0;
  }

  function scrollToSection(index) {
    if (!sectionEls.length) return;
    cancelAnimationFrame(relativeScrollFrame);
    manualSectionUntil=Date.now()+650;
    currentSectionIndex = Math.max(0, Math.min(sectionEls.length - 1, index));
    updateGuitarTuningStickyState();

    // Update/centre the guide immediately when Prev/Next or a guide item is used.
    [...$("sectionProgress").children]
      .forEach(el => el.classList.toggle("active", Number(el.dataset.visibleIndex) === currentSectionIndex && !el.classList.contains("session-hidden")));

    sectionEls.forEach((el, i) => {
      el.classList.toggle("current-section", i === currentSectionIndex);
    });

    centerActiveProgressSection(true);

    const quick=document.getElementById('performanceQuickInfo');
    setQuickToolsReleased(currentSectionIndex>0);
    const header=document.getElementById('ls26StickyHeader');
    const offset=(header?.getBoundingClientRect().height||0)+(currentSectionIndex===0&&!quick?.classList.contains('ls26-released')?(quick?.getBoundingClientRect().height||0):0)+guitarTuningStickyHeight()+sectionActivationOffset();
    sectionPauseStartsAt=0;
    sectionPauseUntil=0;
    clearSectionPauseCountdown();
    window.scrollTo({top:Math.max(0,sectionEls[currentSectionIndex].getBoundingClientRect().top+window.scrollY-offset),behavior:'instant'});
    requestAnimationFrame(()=>updateSectionFocusOpacity(performanceActivationAnchor()));
    setTimeout(updateSectionProgress,700);
  }

  function updateSectionProgress() {
    if (!sectionEls.length) return;

    const anchor=performanceActivationAnchor();
    if(Date.now()<manualSectionUntil){
      updateSectionFocusOpacity(anchor);
      return;
    }

    if(maybeBeginCurrentSectionEndPause(anchor))return;

    let bestIndex = 0;
    sectionEls.forEach((el,i)=>{if(el.getBoundingClientRect().top<=anchor)bestIndex=i;});

    const changed = bestIndex !== currentSectionIndex;
    currentSectionIndex = bestIndex;
    updateGuitarTuningStickyState();

    [...$("sectionProgress").children]
      .forEach(el => el.classList.toggle("active", Number(el.dataset.visibleIndex) === currentSectionIndex && !el.classList.contains("session-hidden")));

    // Match the bottom guide: tint the section header that is currently
    // nearest the performance reading position.
    sectionEls.forEach((el, i) => {
      el.classList.toggle("current-section", i === currentSectionIndex);
    });
    updateSectionFocusOpacity(anchor);

    // As the performer scrolls through the song, automatically bring the
    // current section marker into view and keep it roughly centred.
    if (changed) {
      setQuickToolsReleased(currentSectionIndex>0);
      centerActiveProgressSection(true);
    }

    // [ END ] completes lower in the viewport than ordinary section changes.
    // This gives the performer a final visual beat before the completion card.
    const endMarker=$("endMarker");
    const completionY=songCompletionActivationY(anchor);
    if (
      autoScrollOn &&
      !autoScrollEndHandled &&
      endMarker &&
      endMarker.getBoundingClientRect().top <= completionY
    ) {
      void stopAutoScrollAtEnd();
    }
  }

  window.addEventListener("resize", () => {
    requestAnimationFrame(() => centerActiveProgressSection(false));
  });
  window.addEventListener("ls26:settings-applied",()=>{
    requestAnimationFrame(()=>updateSectionFocusOpacity(performanceActivationAnchor()));
  });

  function smoothRelativeScroll(direction) {
    cancelAnimationFrame(relativeScrollFrame);
    manualSectionUntil=Date.now()+750;
    const amount = window.innerHeight * .5 * direction;
    const start = window.scrollY;
    const target = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, start + amount));
    const started = performance.now();
    const duration = 700;
    function frame(now) {
      const t = Math.min(1,(now-started)/duration);
      const e = t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
      scrollTo(0,start+(target-start)*e);
      if (t < 1) relativeScrollFrame=requestAnimationFrame(frame);
    }
    relativeScrollFrame=requestAnimationFrame(frame);
  }

  function chordParts(chord) {
    const m = String(chord || "").match(/^([A-G])([#b]?)(.*)$/);
    return m ? {root:m[1]+m[2], suffix:m[3]} : null;
  }
  const NOTES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const NOTES_FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
  const NOTE_INDEX = {C:0,"B#":0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,Fb:4,F:5,"E#":5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11,Cb:11};
  function transposeChordToken(token, shift) {
    const normalizedShift = ((Number(shift) || 0) % 12 + 12) % 12;
    // Zero transpose is identity: never rewrite Bb as A# (or vice versa).
    if (normalizedShift === 0) return token;
    const split = token.split("/");
    const main = chordParts(split[0]);
    if (!main || NOTE_INDEX[main.root] == null) return token;
    const mainNotes = main.root.includes("b") ? NOTES_FLAT : NOTES_SHARP;
    const root = mainNotes[(NOTE_INDEX[main.root]+normalizedShift)%12] + main.suffix;
    if (!split[1]) return root;
    const bass = chordParts(split[1]);
    if (!bass || NOTE_INDEX[bass.root] == null) return root;
    const bassNotes = bass.root.includes("b") ? NOTES_FLAT : NOTES_SHARP;
    return `${root}/${bassNotes[(NOTE_INDEX[bass.root]+normalizedShift)%12]}${bass.suffix}`;
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
    if ($("chordTransposeValue")) $("chordTransposeValue").textContent = String(chordShift);
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
    if ($("tabTransposeValue")) $("tabTransposeValue").textContent = String(tabShift);
  }

  async function sendToKaraoke() {
    if (!currentSong || !currentSongId) {
      return showModal(
        "No Song Loaded",
        "Open a song before sending it to the karaoke display."
      );
    }

    const button = $("sendToKaraokeBtn");
    const quickButton = $("quickSendToKaraokeBtn");

    if (button) button.disabled = true;
    if (quickButton) quickButton.disabled = true;

    try {
      const reloadToken =
        `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;

      // karaoke-lyric-view.html listens to karaokeControl/liveLyrics.
      // Write both supported ID fields and an explicit display state.
      // forceReloadToken means pressing SEND TO KARAOKE again also reloads
      // the same song instead of being ignored as an unchanged ID.
      await db.collection("karaokeControl").doc("liveLyrics").set({
        currentLyricsSongId: currentSongId,
        currentSongId: currentSongId,
        songId: currentSongId,

        songTitle: currentSong.title || "",
        songArtist: currentSong.artist || "",
        title: currentSong.title || "",
        artist: currentSong.artist || "",

        song: currentSong,
        displayState: "song",
        reset: false,
        forceReloadToken: reloadToken,
        sentAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });

      await showModal(
        "Sent to Karaoke",
        `${currentSong.title || "The song"} is being sent to the karaoke display.`
      );
    } catch (error) {
      console.error("Could not send song to karaoke display:", error);

      await showModal(
        "Send Failed",
        error?.message || "Could not update the karaoke display."
      );
    } finally {
      if (button) button.disabled = false;
      if (quickButton) quickButton.disabled = false;
    }
  }

  async function resetKaraoke() {
    const button = $("resetKaraokeBtn");
    const quickButton = $("quickResetKaraokeBtn");

    if (button) button.disabled = true;
    if (quickButton) quickButton.disabled = true;

    try {
      // karaoke-lyric-view.html listens to this exact control document.
      // Clearing BOTH supported song-id fields and setting displayState=idle
      // sends the singer display back to standby immediately.
      await db.collection("karaokeControl").doc("liveLyrics").set({
        currentLyricsSongId: "",
        currentSongId: "",
        songId: "",
        song: null,
        songTitle: "",
        songArtist: "",
        title: "",
        artist: "",
        chordTranspose: 0,
        transpose: 0,
        displayState: "idle",
        reset: true,
        resetAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });

      $("karaokeMenu")?.classList.add("hidden");
    } catch (error) {
      console.error("Could not reset karaoke display:", error);
      await showModal(
        "Reset Failed",
        error?.message || "Could not reset the karaoke display."
      );
    } finally {
      if (button) button.disabled = false;
      if (quickButton) quickButton.disabled = false;
    }
  }

  /************************************************************
   * SEND LYRICS DROPDOWN
   *
   * RESTORED TO THE ORIGINAL WORKING song-data.js LOGIC.
   *
   * song-data.js:
   *   root/livesuite/oldadmin/files/song-data-kl.js
   *
   * loaded by lyricview.html as:
   *   ../oldadmin/files/song-data-kl.js
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
        "window.songs is missing. Check that ../oldadmin/files/song-data-kl.js loads before js/lyricview.js"
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
        const artist = song.artist ? ` — ${ArtistNames.display(song.artist)}` : "";

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
      lyricsFilePath: `../oldadmin/host/lyrics/lyrics-data/${fileName}`,
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
    const shared=window.LK?.sessionTools?.getControl?.();
    if(shared)return {sessionId:shared.active===false?'':(shared.sessionId||shared.activeSessionId||''),control:shared};
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

    const byId = items.find(item => item.songId === currentSongId);
    if (byId) return byId;

    // Important for host-selected songs whose old Run Order row contains a
    // legacy title+artist slug rather than the Firestore document ID.
    if (currentSong) {
      const byMetadata = items.find(item =>
        sameSongByMetadata(item, currentSong)
      );
      if (byMetadata) return byMetadata;
    }

    return null;
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
            // Self-heal the legacy wrong Run Order ID as soon as this song
            // starts/finishes from lyricview.
            songId:currentSongId || item.songId,
            songTitle:item.songTitle || currentSong?.title || "",
            artist:item.artist || currentSong?.artist || "",
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

  async function ensureCurrentSongPlaying() {
    if (!currentSongId || !currentSong) return 0;

    // This function may be reached from more than one PLAY/NEXT path. Never let
    // those paths create concurrent Firestore transactions/reads for the same song.
    if (ensurePlayingDone) return Number(window.__lyricviewPlayingStartedMs || 0);
    if (ensurePlayingPromise) return ensurePlayingPromise;
    if (Date.now() < ensurePlayingRetryAfter) return 0;

    ensurePlayingPromise = (async () => {
      const { sessionId } = await getActiveSessionContext();
      if (!sessionId) return 0;

      const runRef = db.collection("karaokeControl").doc("runOrder");

      try {
        // A normal read + conditional write is deliberate here. The previous
        // transaction was automatically retried by Firestore when quota was
        // exhausted, multiplying BatchGet requests. Lyricview only needs one
        // idempotent update when PLAY begins.
        const snap = await runRef.get();
        const data = snap.exists ? (snap.data() || {}) : {};
        let items = data.sessionId === sessionId && Array.isArray(data.items) ? [...data.items] : [];

        let index = -1;
        if (requestId) index = items.findIndex(item => item.requestId === requestId);
        if (index < 0) index = items.findIndex(item =>
          item.songId === currentSongId &&
          !["played","completed"].includes(String(item.status || "").toLowerCase())
        );
        if (index < 0) index = items.findIndex(item =>
          sameSongByMetadata(item, currentSong) &&
          !["played","completed"].includes(String(item.status || "").toLowerCase())
        );

        const existing = index >= 0 ? items[index] : null;
        const existingStarted = existing && String(existing.status || "").toLowerCase() === "playing"
          ? (Number(existing.playingAtMs) || (existing.playingAt?.toMillis ? existing.playingAt.toMillis() : 0))
          : 0;
        const startedMs = existingStarted || Date.now();

        let changed = false;
        items = items.map((item,i) => {
          if (i !== index && String(item.status || "").toLowerCase() === "playing") {
            changed = true;
            return { ...item, status:"played", playedAtMs:startedMs };
          }
          return item;
        });

        if (index >= 0) {
          const old = items[index];
          const alreadyCorrect =
            String(old.status || "").toLowerCase() === "playing" &&
            old.songId === currentSongId &&
            Number(old.playingAtMs || 0) === Number(startedMs);

          if (!alreadyCorrect) {
            changed = true;
            items[index] = {
              ...old,
              songId:currentSongId,
              songTitle:currentSong.title || old.songTitle || "",
              title:currentSong.title || old.title || "",
              artist:currentSong.artist || old.artist || "",
              songArtist:currentSong.artist || old.songArtist || "",
              status:"playing",
              playingAtMs:startedMs,
              playingAt:firebase.firestore.Timestamp.fromMillis(startedMs)
            };
          }
        } else {
          changed = true;
          items.push({
            id:`lyricview_${currentSongId}_${startedMs}`,
            songId:currentSongId,
            songTitle:currentSong.title || "",
            title:currentSong.title || "",
            artist:currentSong.artist || "",
            songArtist:currentSong.artist || "",
            requestId:requestId || "",
            singerName:"",
            source:"lyricview",
            status:"playing",
            playingAtMs:startedMs,
            playingAt:firebase.firestore.Timestamp.fromMillis(startedMs),
            addedAtMs:startedMs
          });
        }

        if (changed) {
          await runRef.set({
            sessionId,
            items,
            updatedAt:firebase.firestore.FieldValue.serverTimestamp()
          },{merge:true});
        }

        if (requestId) {
          // One request-status write per lyric page/play, not on every call.
          await db.collection("publicSongRequests").doc(requestId).set({
            status:"playing",
            playingAtMs:startedMs,
            playingAt:firebase.firestore.Timestamp.fromMillis(startedMs),
            updatedAt:firebase.firestore.FieldValue.serverTimestamp()
          },{merge:true});
        }

        window.__lyricviewPlayingStartedMs = startedMs;
        ensurePlayingDone = true;
        return startedMs;
      } catch (error) {
        // Do not hammer Firestore after a quota/network failure. A later manual
        // PLAY can retry after the cooldown instead of triggering SDK retry storms.
        ensurePlayingRetryAfter = Date.now() + 60000;
        console.error("Could not put current lyric-view song in Run Order:", error);
        return 0;
      }
    })();

    try {
      return await ensurePlayingPromise;
    } finally {
      ensurePlayingPromise = null;
    }
  }

  async function recordCurrentSongPlayed() {
    if (!currentSong || !currentSongId) return;

    // Claim this recording immediately, before any await. This prevents rapid
    // PLAY toggles / NEXT from racing and creating duplicate history/log writes.
    if (performanceRecordCreated) return performanceRecordPromise;
    performanceRecordCreated = true;

    const startingBpm=performanceTempo.get();
    performanceRecordPromise = (async () => {
      const { sessionId } = await getActiveSessionContext();
      if (!sessionId) {performanceRecordCreated=false;return;}

      const startedMs = await ensureCurrentSongPlaying();
      const actualStartedMs = startedMs || Date.now();
      const startedAt = firebase.firestore.Timestamp.fromMillis(actualStartedMs);
      const performedId = `${currentSongId}_${actualStartedMs}`;

      const performanceBpm = performanceTempo.get();

      const record = {
        songId: currentSongId,
        songTitle: currentSong.title || "",
        songArtist: currentSong.artist || "",
        artist: currentSong.artist || "",
        requestId: requestId || "",
        source: "lyricview-autoscroll",
        userBpm: toNumber(currentSong.userBpm) || null,
        startingBpm,
        performanceBpm: performanceBpm || null,
        originalBpm: toNumber(currentSong.originalBpm) || null,
        startedAt,
        playingAtMs: actualStartedMs,
        playedAt: startedAt,
        createdAt: startedAt
      };

      try {
        // Keep the per-session performed-song record used by Session History.
        // Use a deterministic id so the same play cannot be duplicated by a race.
        const recordRef=db.collection("performanceSessions").doc(sessionId).collection("performedSongs").doc(performedId);
        await recordRef.set(record, { merge:true });
        await performanceTempo.attach(recordRef,performanceBpm);

        // Intentionally DO NOT also add to performanceLogs. That second global
        // log duplicated every play and is unnecessary for lyricview operation.
      } catch (error) {
        performanceRecordCreated=false;
        console.error("Could not create performance record:", error);
        window.LS26?.toast("Could not save this performance. Press Play again to retry.");
      }
    })();

    return performanceRecordPromise;
  }

  async function finalizeCurrentSongPlayed() {
    await flushPerformanceTempo();
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

  function showEndCompletionPanel(show) {
    const panel=$("endCompletionPanel");
    if (panel) panel.hidden=!show;
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
    sectionPauseStartsAt = 0;
    sectionPauseUntil = 0;
    clearSectionPauseCountdown();
    window.dispatchEvent(new CustomEvent("ls26:scroll-state",{detail:{playing:false}}));
    window.dispatchEvent(new Event("ls26:song-finished"));

    if (scrollTimer) {
      cancelAnimationFrame(scrollTimer);
      scrollTimer = null;
    }

    $("autoScrollBtn")?.classList.remove("active");
    if ($("autoScrollBtn")) $("autoScrollBtn").innerHTML = '<svg class="ls26-play-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 3 29 16 7 29Z"/></svg>';

    // Start persistence immediately, but do not hold the UI at [ END ] while
    // waiting for Firestore/network work.
    const finalizePromise=finalizeCurrentSongPlayed();
    showEndCompletionPanel(true);
    showEndNextSongButton(true);
    if ($("endSessionActions")) $("endSessionActions").hidden = false;
    const detailsPromise=renderEndNextSongDetails();

    requestAnimationFrame(()=>setTimeout(slowScrollCompletionIntoView,80));
    await Promise.allSettled([finalizePromise,detailsPromise]);
  }


  async function getNextRunOrderItem() {
    const { sessionId } = await getActiveSessionContext();

    const sharedRun=window.LK?.sessionTools?.getRunOrderSnapshot?.();
    const snap=sharedRun?null:await db.collection('karaokeControl').doc('runOrder').get();
    const data=sharedRun||(snap?.exists?snap.data():{});
    const expectedSessionId=sessionId||"";
    const runSessionId=String(data.sessionId||"");

    if (
      runSessionId !== expectedSessionId ||
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

    if (currentIndex < 0 && currentSong) {
      currentIndex = items.findIndex(item =>
        sameSongByMetadata(item, currentSong)
      );
    }

    let next = null;

    for (let i = Math.max(0, currentIndex + 1); i < items.length; i++) {
      if (
        items[i].songId &&
        !terminal.has(String(items[i].status || "").toLowerCase())
      ) {
        next = items[i];
        break;
      }
    }

    if (!next && currentIndex < 0) {
      next = items.find(item =>
        item.songId &&
        !terminal.has(String(item.status || "").toLowerCase())
      ) || null;
    }

    if (!next) return null;

    const resolved = await resolveRunOrderSongDocument(next);

    if (resolved?.id) {
      if (resolved.id !== next.songId) {
        await repairSingleRunOrderItemSongId(next, resolved, data);
      }

      return {
        ...next,
        songId:resolved.id,
        songTitle:next.songTitle || resolved.title || "",
        artist:next.artist || resolved.artist || "",
        _resolvedSong:resolved
      };
    }

    return next;
  }

  function prepNextIcon() {
    return `
      <span class="host-prep-next-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <path d="M11.2 22.5h9.6M12.7 26h6.6M10.4 19.5c-2.1-1.7-3.4-4.2-3.4-7A9 9 0 0 1 25 12.5c0 2.8-1.3 5.3-3.4 7-1.2 1-1.9 2.1-2.1 3.2h-7c-.2-1.1-.9-2.2-2.1-3.2Z"></path>
        </svg>
      </span>`;
  }

  function prepNextField(label, value) {
    const clean = String(value ?? "").trim() || "–";
    return `
      <span class="host-prep-next-field">
        <small>${esc(label)}</small>
        <strong>${esc(clean)}</strong>
      </span>
    `;
  }

  async function renderEndNextSongDetails() {
    const card = $("endNextSongDetailsCard");
    const button = $("endNextRunOrderSongBtn");
    if (!card || !button) return;

    showEndCompletionPanel(true);
    const next = await getNextRunOrderItem();

    if (!next?.songId) {
      button.hidden = false;
      button.disabled = true;
      if ($("endLoadNextSongBtn")) $("endLoadNextSongBtn").disabled = true;
      button.innerHTML = `
        <span class="host-next-song-play" aria-hidden="true">■</span>
        <span class="host-next-song-button-copy">
          <strong>No next song in Run Order</strong>
          <small>Add or queue a song before continuing.</small>
        </span>
      `;

      card.hidden = false;
      card.classList.add("is-empty");
      card.innerHTML = `
        <div class="host-prep-next-head">
          ${prepNextIcon()}
          <span><strong>PREP NEXT SONG</strong><small>NO NEXT SONG QUEUED</small></span>
        </div>
      `;
      return;
    }

    let song = next._resolvedSong || {};
    try {
      if (!song?.id) {
        const cached=window.LK?.sessionTools?.getSongs?.().find(s=>s.id===next.songId);
        if(cached) song=cached;
        else {
          const songSnap=await db.collection("lyrics").doc(next.songId).get();
          if(songSnap.exists) song={id:songSnap.id,...(songSnap.data()||{})};
        }
      }
    } catch (error) {
      console.warn("Could not load next song details:", error);
    }

    const title=song.title || next.songTitle || next.title || "Untitled Song";
    const artist=ArtistNames.display(song.artist || next.artist || "");
    const userBpm=song.userBpm ?? next.userBpm ?? next.bpm ?? "–";
    const capo=song.capo === "" || song.capo == null ? "0" : song.capo;
    const tuning=normaliseGuitarTuning(song).name;
    const key=song.key || "–";
    const time=song.timeSignature || song.time || "4/4";

    button.hidden = false;
    button.disabled = false;
    if ($("endLoadNextSongBtn")) $("endLoadNextSongBtn").disabled = false;
    button.innerHTML = `
      <span class="host-next-song-play" aria-hidden="true">▶</span>
      <span class="host-next-song-button-copy">
        <strong>Next Song: ${esc(title)}</strong>
        <small>${esc(artist || "Artist not set")}</small>
      </span>
      <span class="host-next-song-arrow" aria-hidden="true">›</span>
    `;

    card.hidden = false;
    card.classList.remove("is-empty");
    card.innerHTML = `
      <div class="host-prep-next-head">
        ${prepNextIcon()}
        <span><strong>PREP NEXT SONG</strong><small>${esc(title)}${artist ? ` · ${esc(artist)}` : ""}</small></span>
      </div>
      <div class="host-prep-next-fields">
        ${prepNextField("USER BPM", userBpm)}
        ${prepNextField("CAPO", capo)}
        ${prepNextField("TUNING", tuning)}
        ${prepNextField("KEY", key)}
        ${prepNextField("TIME", time)}
      </div>
    `;
  }

  async function goToNextRunOrderSong() {
    // PLAY NEXT finalizes a started song; previewing end cards never changes status.
    if(performanceRecordCreated)await finalizeCurrentSongPlayed();
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


  function stayOnCurrentSong() {
    showEndCompletionPanel(false);
    autoScrollEndHandled=false;
    const index=Math.max(0,Math.min(currentSectionIndex,sectionEls.length-1));
    if(sectionEls[index])scrollToSection(index);
    else $("endMarker")?.scrollIntoView({behavior:"smooth",block:"center"});
  }

  async function addCurrentSongToSetlist() {
    if(!currentSongId)return;
    let lists=[];
    try{
      const snap=await LS26Data.collection("lyricsSetlists");
      lists=snap.docs.map(doc=>({id:doc.id,...(doc.data()||{})}))
        .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),undefined,{sensitivity:"base"}));
    }catch(error){
      window.LS26?.toast(error.message||"Could not load setlists.");
      return;
    }
    if(!lists.length){
      await showModal("No Setlists","Create a setlist first, then use Add to Setlist again.");
      return;
    }

    const dialog=document.createElement("dialog");
    dialog.className="ls26-dialog lyricview-setlist-dialog";
    dialog.innerHTML=`
      <h2>Add to Setlist</h2>
      <p>Add <strong>${esc(currentSong?.title||"this song")}</strong> to:</p>
      <div class="lyricview-setlist-picker">
        ${lists.map(list=>{
          const contains=Array.isArray(list.songIds)&&list.songIds.includes(currentSongId);
          return `<button type="button" data-add-current-setlist="${esc(list.id)}" ${contains?"disabled":""}>
            <span><strong>${esc(list.name||"Untitled Setlist")}</strong><small>${(list.songIds||[]).length} songs</small></span>
            <span>${contains?"✓ Added":"＋ Add"}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="ls26-dialog-actions"><button type="button" data-close-setlist>Close</button></div>
    `;
    document.body.append(dialog);
    const close=()=>{try{dialog.close();}catch(_){}dialog.remove();};
    dialog.querySelector("[data-close-setlist]").onclick=close;
    dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
    dialog.addEventListener("click",async event=>{
      const add=event.target.closest("[data-add-current-setlist]");
      if(!add||add.disabled)return;
      add.disabled=true;
      try{
        await db.collection("lyricsSetlists").doc(add.dataset.addCurrentSetlist).set({
          songIds:firebase.firestore.FieldValue.arrayUnion(currentSongId),
          updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        },{merge:true});
        LS26Data.invalidate("lyricsSetlists");
        window.LS26?.toast("Song added to setlist");
        close();
      }catch(error){
        add.disabled=false;
        window.LS26?.toast(error.message||"Could not add song to setlist.");
      }
    });
    dialog.showModal();
  }

  function startAutoScroll() {
    const wasOff = !autoScrollOn;
    autoScrollOn = !autoScrollOn;
    // Synchronous gesture event: linked audio can unlock before any awaited work.
    window.dispatchEvent(new CustomEvent("ls26:scroll-state",{detail:{playing:autoScrollOn}}));

    $("autoScrollBtn").classList.toggle("active", autoScrollOn);
    $("autoScrollBtn").innerHTML = autoScrollOn ? '<svg class="ls26-play-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 4h6v24H7zM19 4h6v24h-6z"/></svg>' : '<svg class="ls26-play-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 3 29 16 7 29Z"/></svg>';
    $("autoScrollBtn").setAttribute('aria-label', autoScrollOn ? 'Pause auto-scroll (song stays playing)' : 'Start or resume auto-scroll');
    requestAnimationFrame(()=>updateSectionFocusOpacity(performanceActivationAnchor()));

    if (wasOff && autoScrollOn) {
      autoScrollEndHandled = false;
      showEndCompletionPanel(false);
      showEndNextSongButton(false);
      if ($("endSessionActions")) $("endSessionActions").hidden = true;
      if ($("endNextSongDetailsCard")) {
        $("endNextSongDetailsCard").hidden = true;
        $("endNextSongDetailsCard").innerHTML = "";
      }

      // PLAY marks the matching Run Order item as "playing", keeping it
      // visible and highlighted in the Top Status Bar.
      recordCurrentSongPlayed();
      window.dispatchEvent(new Event("ls26:song-started"));

      // Per-section pauses are end-of-section holds. They begin only just
      // before the following section would start fading in.
    }

    if (autoScrollOn) {
      let last = performance.now();
      let fractionalY = 0;

      const tick = now => {
        if (!autoScrollOn) return;

        const dt = Math.min(50, Math.max(0, now - last));
        last = now;

        if (!document.hidden && Date.now()>=manualSectionUntil && Date.now()>=sectionPauseUntil) {
          fractionalY += dt * AUTO_SCROLL_BASE_PX_PER_MS * scrollSpeed;

          const wholePixels = Math.floor(fractionalY);
          if (wholePixels > 0) {
            window.scrollBy(0, wholePixels);
            fractionalY -= wholePixels;
          }

          // Primary finish trigger: use the dedicated lower completion line,
          // matching updateSectionProgress. Keep the physical bottom check as
          // a safety fallback for malformed/legacy songs.
          const endMarker=$("endMarker");
          const endReached=endMarker && endMarker.getBoundingClientRect().top <= songCompletionActivationY(performanceActivationAnchor());
          const doc = document.documentElement;
          const atBottom =
            window.scrollY + window.innerHeight >=
            Math.max(doc.scrollHeight, document.body.scrollHeight) - 3;

          if (endReached || atBottom) {
            void stopAutoScrollAtEnd();
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
      sectionPauseStartsAt = 0;
      sectionPauseUntil = 0;
      clearSectionPauseCountdown();

      flushPerformanceTempo();
      // LS26: pausing affects scrolling only; current song remains playing.
    }
  }


  function bindUi() {
    if ($("exitBtn")) $("exitBtn").onclick = () => location.href = LS26.url("library.html");

    const quickTools=$("performanceQuickInfo");
    if(quickTools && window.ResizeObserver){
      quickToolsResizeObserver?.disconnect?.();
      quickToolsResizeObserver=new ResizeObserver(syncQuickToolsHeight);
      quickToolsResizeObserver.observe(quickTools);
    }
    requestAnimationFrame(syncQuickToolsHeight);
    setupLinkedSongReturn();
    if ($("showAllSectionsBtn")) {
      $("showAllSectionsBtn").onclick = () => {
        showAllSectionsOverride = !showAllSectionsOverride;
        applySectionVisibility(true);
        if (currentSong) {
          renderHostNotes(currentSong);
          renderPerformanceSongReference(currentSong);
        }
        requestAnimationFrame(updateSectionProgress);
      };
    }
    $("lyricsContent")?.addEventListener("click", event => {
      const link = event.target.closest("a.lyrics-song-link[data-song-link]");
      if (!link) return;
      const targetId = link.dataset.songLink;
      if (!targetId) return;
      event.preventDefault();
      location.href = buildLinkedSongUrl(targetId);
    });
    // SONG INFO button now toggles the drawer open/closed.
    // This keeps the same top-bar button usable as the close control.
    $("songInfoBtn").onclick = () => {
      const drawer = $("songInfoDrawer");
      if (!drawer) return;
      const willOpen = !drawer.classList.contains("open");
      drawer.classList.toggle("open", willOpen);
      drawer.setAttribute("aria-hidden", willOpen ? "false" : "true");
      $("songInfoBtn").classList.toggle("active", willOpen);
      $("songActionsMenu")?.classList.add("hidden");
      $("songActionsBtn")?.setAttribute("aria-expanded","false");
    };
    $("songActionsBtn").onclick = event => {
      event.stopPropagation();
      const menu=$("songActionsMenu");
      const opening=menu.classList.contains("hidden");
      menu.classList.toggle("hidden",!opening);
      $("songActionsBtn").setAttribute("aria-expanded",opening?"true":"false");
    };
    $("songNoteActionBtn").onclick=openSongNoteModal;
    $("songNoteCancelBtn").onclick=closeSongNoteModal;
    $("songNoteSaveBtn").onclick=saveSongNoteFromPerformance;
    document.addEventListener("click",event=>{
      if(!event.target.closest(".host-song-actions")){
        $("songActionsMenu")?.classList.add("hidden");
        $("songActionsBtn")?.setAttribute("aria-expanded","false");
      }
    });
    $("closeSongInfoBtn").onclick = () => {
      const drawer = $("songInfoDrawer");
      if (!drawer) return;
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      $("songInfoBtn").classList.remove("active");
    };
    const navButtons=[...document.querySelectorAll(".host-nav-btn")];
    navButtons.forEach(button => {
      button.addEventListener("click", () => {
        const settings=window.LS26Settings?.get?.()||{};
        const idle=Math.max(.1,Math.min(.9,Number(settings.lyricNavIdleOpacity??40)/100));
        const active=Math.max(.2,Math.min(.95,Number(settings.lyricNavActiveOpacity??60)/100));
        const peak=Math.max(.4,Math.min(1,Number(settings.lyricNavPressedOpacity??90)/100));
        const duration=Math.max(500,Math.min(10000,Number(settings.lyricNavFeedbackDuration??1800)));

        navButtons.forEach(nav=>nav.getAnimations?.().forEach(animation=>animation.cancel()));
        if(matchMedia("(prefers-reduced-motion: reduce)").matches||!button.animate)return;

        navButtons.forEach(nav=>{
          const clicked=nav===button;
          nav.animate(
            clicked
              ? [
                  {opacity:peak,scale:"1.08",offset:0},
                  {opacity:active,scale:"1.04",offset:.5},
                  {opacity:idle,scale:"1",offset:1}
                ]
              : [
                  {opacity:active,scale:"1",offset:0},
                  {opacity:active,scale:"1",offset:.5},
                  {opacity:idle,scale:"1",offset:1}
                ],
            {duration,easing:"ease-out"}
          );
        });
      });
    });
    $("navUpBtn").onclick = () => smoothRelativeScroll(-1);
    $("navDownBtn").onclick = () => smoothRelativeScroll(1);
    $("navPrevBtn").onclick = () => scrollToSection(currentSectionIndex-1);
    $("navNextBtn").onclick = () => scrollToSection(currentSectionIndex+1);
    $("autoScrollBtn").onclick = startAutoScroll;
    $("scrollSpeedDown").onclick = async () => {
      scrollSpeed = Math.max(0.1, +(scrollSpeed - 0.1).toFixed(1));
      updateSpeed();
      clearTimeout(window.__ls26SpeedSave); window.__ls26SpeedSave=setTimeout(saveSongScrollSpeed,1200);
    };

    $("scrollSpeedUp").onclick = async () => {
      scrollSpeed = Math.min(10, +(scrollSpeed + 0.1).toFixed(1));
      updateSpeed();
      clearTimeout(window.__ls26SpeedSave); window.__ls26SpeedSave=setTimeout(saveSongScrollSpeed,1200);
    };
    if ($("nextRunOrderSongBtn")) {
      $("nextRunOrderSongBtn").onclick = async () => {
        if (autoScrollOn) startAutoScroll();
        await renderEndNextSongDetails();
        $("endMarker").scrollIntoView({behavior:"smooth",block:"start"});
      };
    }
    if ($("endNextRunOrderSongBtn")) {
      $("endNextRunOrderSongBtn").onclick = goToNextRunOrderSong;
    }
    if ($("endLoadNextSongBtn")) $("endLoadNextSongBtn").onclick = goToNextRunOrderSong;
    if ($("endStaySongBtn")) $("endStaySongBtn").onclick = stayOnCurrentSong;
    if ($("endAddSetlistBtn")) $("endAddSetlistBtn").onclick = addCurrentSongToSetlist;
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
    if ($("endGoLibraryBtn")) {
      $("endGoLibraryBtn").onclick = () => {performanceTempo?.flush();location.href = "../library.html";};
    }
    if ($("endStartBreakBtn")) {
      $("endStartBreakBtn").onclick = async () => {
        const sessionId = window.LK?.sessionTools?.getSessionId?.() || "";
        if (!sessionId) {
          await showModal("No Active Session", "There is no active Performance Session to put on break.");
          return;
        }
        const breakButton = $("tsBreakActionBtn");
        if (!breakButton || breakButton.disabled) {
          await showModal("Break Unavailable", "The break control is not available right now.");
          return;
        }
        performanceTempo?.flush();
        window.dispatchEvent(new Event("ls26:song-finished"));
        breakButton.click();
      };
    }
    if ($("endSessionBtn")) {
      $("endSessionBtn").onclick = async () => {
        const sessionId = window.LK?.sessionTools?.getSessionId?.() || "";
        if (!sessionId) {
          await showModal("No Active Session", "There is no active Performance Session to end.");
          return;
        }
        await flushPerformanceTempo();
        // Admin owns the single end-session confirmation and the full archive lifecycle.
        location.href = `../admin-new/admin.html?endSession=${encodeURIComponent(sessionId)}`;
      };
    }
    $("myNotesInput").addEventListener("input",() => { clearTimeout(notesSaveTimer); notesSaveTimer=setTimeout(saveMyNotes,5000); });
    window.addEventListener("scroll",updateSectionProgress,{passive:true});
    window.addEventListener("resize",updateSectionProgress);
    window.addEventListener("ls26:settings-applied",() => requestAnimationFrame(updateSectionProgress));
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
    await Promise.all([loadSectionTitleDefaultsForView(), loadActiveSessionType()]);
    bindUi();
    if (!songId) {
      $("lyricsContent").innerHTML = `<div class="host-load-error">No song selected.</div>`;
      return;
    }
    // A displayed song is effectively static during a performance. Use one
    // document read instead of a permanent realtime listener to reduce quota.
    try {
      let doc = await db.collection("lyrics").doc(songId).get();

      if (!doc.exists) {
        // The URL may have been created from a legacy Run Order songId such as
        // "cometogetherbeatlesthe" while the real Firestore document is
        // "cometogether". Use the Run Order metadata to resolve and repair it.
        try {
          const context = await getActiveSessionContext();
          const runSnap = await db.collection("karaokeControl").doc("runOrder").get();
          const runData = runSnap.exists ? (runSnap.data() || {}) : {};
          const item = Array.isArray(runData.items)
            ? runData.items.find(entry =>
                entry.songId === songId ||
                (requestId && entry.requestId === requestId)
              )
            : null;

          if (item) {
            const resolved = await resolveRunOrderSongDocument(item);

            if (resolved?.id) {
              await repairSingleRunOrderItemSongId(item, resolved, runData);
              currentSongId = resolved.id;
              doc = await db.collection("lyrics").doc(resolved.id).get();

              // Keep address bar consistent without reloading the page.
              const repairedParams = new URLSearchParams(location.search);
              repairedParams.set("id", resolved.id);
              history.replaceState(
                null,
                "",
                `${location.pathname}?${repairedParams.toString()}${location.hash}`
              );
            }
          }
        } catch (repairError) {
          console.warn("Could not repair legacy Run Order URL:", repairError);
        }
      }

      if (!doc.exists) {
        $("lyricsContent").innerHTML = `<div class="host-load-error">Could not load song data.</div>`;
        return;
      }

      currentSong = { ...(doc.data() || {}), id:doc.id };

      performanceTempo=LS26PerformanceTempo.create({
        song:currentSong,storage:sessionStorage,key:`ls26:currentBpm:${firebase.app().options.projectId}:${currentSongId}`,
        onChange:()=>{setInfo(currentSong,true);window.dispatchEvent(new Event('ls26:tempo-changed'));},
        onError:()=>window.LS26?.toast('Current BPM could not be saved to session history. Check your connection and try again.')
      });
      loadSongScrollSpeed(currentSong);
      setTopTitle(currentSong);
      setInfo(currentSong);
      renderGuitarTuning(currentSong);
      renderSections(currentSong);
      loadSlaveLyricsOptions();
      window.LS26Performance = {
        song:()=>currentSong, sections:()=>sectionEls, isScrolling:()=>autoScrollOn,
        play:()=>{if(!autoScrollOn)startAutoScroll();},
        getBpm:()=>performanceTempo.get(),
        setBpm:value=>performanceTempo.set(value),
        flushTempo:flushPerformanceTempo,
        nextDetails:renderEndNextSongDetails
      };
      window.dispatchEvent(new Event("ls26:song-ready"));
    } catch (err) {
      console.error(err);
      $("lyricsContent").innerHTML = `<div class="host-load-error">${esc(err.message)}</div>`;
    }
  }

  window.addEventListener("pagehide",()=>{performanceTempo?.flush();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)performanceTempo?.flush();});
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
