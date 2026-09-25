/* Copyright © 2026 LiveSuite. All rights reserved.
 * host/js/lyricsviewer.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
(() => {
  const $ = id => document.getElementById(id);

  let songs = [];
  let setlists = [];
  let visibleSongs = [];
  let selectedIndex = -1;
  let nextRunOrderItem = null;
  let selectedId = "";
  let scope = new URLSearchParams(location.search).get("view")==="setlist" ? "session" : "all";
  let songsUnsub = null;
  let setlistsUnsub = null;

  const VIEW_STATE_KEY = "lyricsViewerUiStateV2";
  let restoredState = null;
  let initialScrollRestored = false;

  // A device preference, independent of search/scope and Clear filters.
  const NOTES_STATE_KEY = "ls26:libraryPersonalNotesV1";
  let notesVisible = true;
  let noteCategory = "";
  try {
    const saved = JSON.parse(localStorage.getItem(NOTES_STATE_KEY) || "{}");
    notesVisible = saved?.visible !== false;
    noteCategory = typeof saved?.category === "string" ? saved.category : "";
  } catch (_) {}

  function personalNote(song) {
    const title = String(song.title || "").trim();
    if (!title || /^\p{L}/u.test(title)) return null;
    const section = title.match(/^0\s*[-–—]\s*(\d+)(?=[.\s]|$)/u);
    if (section) {
      const number = String(Number(section[1]));
      const name = { "1": "Live Karaoke", "2": "Roxanna" }[number];
      return { category: `section:${number}`, label: `0 - ${number}${name ? " · " + name : ""}` };
    }
    const group = title.match(/^(\d+)/u);
    if (group) return { category: `group:${Number(group[1])}`, label: `Group ${Number(group[1])}` };
    return { category: "symbols", label: "Symbols / other notes" };
  }

  function saveNotesState() {
    try { localStorage.setItem(NOTES_STATE_KEY, JSON.stringify({ visible: notesVisible, category: noteCategory })); }
    catch (error) { console.warn("Could not save personal-note preference:", error); }
  }

  function populateNoteCategories() {
    const select = $("personalNotesCategory");
    if (!select) return;
    const categories = new Map();
    songs.forEach(song => {
      const note = personalNote(song);
      if (!note) return;
      const entry = categories.get(note.category) || { ...note, count: 0 };
      entry.count++;
      categories.set(note.category, entry);
    });
    const options = [...categories.values()].sort((a,b) => a.label.localeCompare(b.label, undefined, { numeric:true }));
    select.innerHTML = '<option value="">Songs &amp; all notes</option><option value="notes">Notes only · all categories</option>' +
      options.map(note => `<option value="${LyricsCommon.escapeHTML(note.category)}">${LyricsCommon.escapeHTML(note.label)} (${note.count})</option>`).join("");
    if (noteCategory && noteCategory !== "notes" && !categories.has(noteCategory)) {
      noteCategory = "";
      saveNotesState();
    }
    select.value = noteCategory;
  }

  function syncNotesControls() {
    const button = $("personalNotesToggle"), category = $("personalNotesCategory");
    if (!button || !category) return;
    const count = songs.filter(song => personalNote(song)).length;
    button.textContent = `${notesVisible ? "Hide" : "Show"} personal notes (${count})`;
    button.setAttribute("aria-pressed", String(notesVisible));
    button.title = `Personal notes are ${notesVisible ? "shown" : "hidden"}. This choice is remembered on this browser, including after Clear filters.`;
    $("personalNotesTools").hidden = !notesVisible;
    category.value = noteCategory;
  }

  function compareTitles(a, b) {
    // Keep song ordering intact; sort numbered notes as 1.2, 1.3, 1.10.
    return personalNote(a) && personalNote(b)
      ? a.title.localeCompare(b.title, undefined, { numeric:true })
      : a.title.localeCompare(b.title);
  }

  function readViewState() {
    try {
      return JSON.parse(localStorage.getItem(VIEW_STATE_KEY) || "null") || {};
    } catch {
      return {};
    }
  }

  function currentViewState() {
    return {
      filtersExpanded: !$("libraryFilterPanel").hidden,
      search: filters.search?.value || "",
      artist: filters.artist?.value || "",
      key: filters.key?.value || "",
      visibility: filters.visibility?.value || "",
      content: filters.content?.value || "",
      sort: filters.sort?.value || "title",
      setlist: filters.setlist?.value || "",
      stickyFavs: $("stickyFavToggle")?.checked || false,
      genre: filters.genre.value, decade: filters.decade.value, bpmMin: filters.bpmMin.value, bpmMax: filters.bpmMax.value, scope, selectedId,
      listScroll: $("songRows").scrollTop,
      scrollY: Math.max(0, window.scrollY || 0)
    };
  }

  function saveViewState() {
    try {
      localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(currentViewState()));
    } catch (error) {
      console.warn("Could not save Lyrics Viewer state:", error);
    }
  }

  function applyImmediateRestoredState() {
    restoredState = readViewState();
    scope = new URLSearchParams(location.search).get("view")==="setlist" ? "session" : (restoredState.scope||"all");
    selectedId=restoredState.selectedId||"";
    filters.bpmMin.value=restoredState.bpmMin||"";filters.bpmMax.value=restoredState.bpmMax||"";

    $("libraryFilterPanel").hidden = !restoredState.filtersExpanded;

    if (filters.search) filters.search.value = restoredState.search || "";
    if (filters.visibility) filters.visibility.value = restoredState.visibility || "";
    if (filters.content) filters.content.value = restoredState.content || "";
    if (filters.sort) filters.sort.value = restoredState.sort || "title";
    if ($("stickyFavToggle")) $("stickyFavToggle").checked = !!restoredState.stickyFavs;
  }

  function restoreScrollWhenReady() {
    if (initialScrollRestored || !restoredState) return;
    initialScrollRestored = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        $("songRows").scrollTop=Number(restoredState.listScroll)||0;
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: "auto"
        });
      });
    });
  }

  function updateStickyOffsets() {
    const topbar = document.querySelector(".lyricsviewer-topbar");
    const height = topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--lyricsviewer-topbar-h", `${height}px`);
  }

  const favourites = new Set(
    JSON.parse(localStorage.getItem("lyricsViewerFavourites") || "[]")
  );

  const filters = {
    search: $("searchInput"),
    artist: $("artistFilter"),
    key: $("keyFilter"),
    visibility: $("visibilityFilter"),
    content: $("contentFilter"),
    sort: $("sortSelect"),
    setlist: $("setlistFilter"), genre:$("genreFilter"), decade:$("decadeFilter"), bpmMin:$("bpmMin"), bpmMax:$("bpmMax")
  };

  function saveFavourites() {
    localStorage.setItem(
      "lyricsViewerFavourites",
      JSON.stringify([...favourites])
    );
  }

  window.addEventListener("lk:session-updated",()=>{if(songs.length)render();});
  window.addEventListener("ls26:public-list",()=>{if(songs.length)render();});
  function loadData() {
    $("songRows").innerHTML =
      '<div class="loading-state">Loading songs…</div>';

    // The song library is large and does not need a permanent realtime listener.
    // One-time reads avoid re-reading the entire collection whenever a listener
    // reconnects, which can consume Firestore daily read quota very quickly.
    Promise.all([
      LS26Data.collection("lyrics"),
      LS26Data.collection("lyricsSetlists")
    ]).then(([songSnapshot, setlistSnapshot]) => {
      songs = songSnapshot.docs.map(doc =>
        LyricsCommon.normalizeSong(doc.data(), doc.id)
      );

      setlists = setlistSnapshot.docs.map(doc => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          ...data,
          songIds: Array.isArray(data.songIds) ? data.songIds : []
        };
      });

      populateExtraFilters();
      populateFilters();
      populateSetlists();
      populateNoteCategories();
      render();
    }).catch(showError);
  }

  function showError(error) {
    console.error(error);
    $("songRows").innerHTML = `
      <div class="error-state">
        Could not load data: ${LyricsCommon.escapeHTML(error.message)}
      </div>
    `;
  }

  function populateSetlists() {
    const current = filters.setlist.value || restoredState?.setlist || "";

    const ordered = [...setlists].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );

    filters.setlist.innerHTML =
      '<option value="">Choose setlist</option>' +
      ordered.map(setlist => `
        <option value="${LyricsCommon.escapeHTML(setlist.id)}">
          ${LyricsCommon.escapeHTML(setlist.name || "Untitled Setlist")}
          (${setlist.songIds.length})
        </option>
      `).join("");

    const setlistExists = [...filters.setlist.options].some(option => option.value === current);
    filters.setlist.value = setlistExists ? current : "";
    $("statSetlists").textContent = setlists.length.toLocaleString();
  }

  function populateFilters() {
    const currentArtist = ArtistNames.display(filters.artist.value || restoredState?.artist || "");
    const currentKey = filters.key.value || restoredState?.key || "";

    const artists = [...new Set(songs.map(song => song.artist).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    const keys = [...new Set(songs.map(song => song.key).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    filters.artist.innerHTML =
      '<option value="">All Artists</option>' +
      artists.map(value =>
        `<option>${LyricsCommon.escapeHTML(value)}</option>`
      ).join("");

    filters.key.innerHTML =
      '<option value="">All Keys</option>' +
      keys.map(value =>
        `<option>${LyricsCommon.escapeHTML(value)}</option>`
      ).join("");

    filters.artist.value = [...filters.artist.options].some(option => option.value === currentArtist)
      ? currentArtist
      : "";
    filters.key.value = [...filters.key.options].some(option => option.value === currentKey)
      ? currentKey
      : "";
  }

  // All filtering is performed against the already loaded library; no new reads.
  function genres(song){return (Array.isArray(song.genres)?song.genres:String(song.genre||song.genres||'').split(',')).map(x=>String(x).trim()).filter(Boolean);}
  function populateExtraFilters(){
    const entries=[['genre',[...new Set(songs.flatMap(genres))].sort(),'All genres'],['decade',[...new Set(songs.map(x=>Math.floor(Number(x.year)/10)*10).filter(x=>x>=1900&&x<=2100))].sort((a,b)=>a-b),'All decades']];
    entries.forEach(([key,values,label])=>{const current=filters[key].value||restoredState?.[key]||'';filters[key].innerHTML='<option value="">'+label+'</option>'+values.map(v=>'<option value="'+LyricsCommon.escapeHTML(v)+'">'+LyricsCommon.escapeHTML(v)+(key==='decade'?'s':'')+'</option>').join('');filters[key].value=values.some(v=>String(v)===String(current))?current:'';});
  }

  function filteredSongs() {
    const query = filters.search.value.toLowerCase().trim();
    const chosenSetlist = setlists.find(
      setlist => setlist.id === filters.setlist.value
    );
    let allowedIds = chosenSetlist
      ? new Set(chosenSetlist.songIds)
      : null;

    if(scope==='session'){
      const session=window.LK?.sessionTools?.getSession?.();
      const publicList=window.LK?.sessionTools?.getPublicList?.()||{};
      const selected=setlists.find(x=>x.id===(session?.setlistId||session?.publicSetlistId||publicList.setlistId));
      allowedIds=new Set(session?.setlistSongIds||selected?.songIds||[]);
    }
    let list = songs.filter(song => {
      const note = personalNote(song);
      if (!notesVisible && note) return false;
      if (notesVisible && noteCategory && (!note || (noteCategory !== "notes" && note.category !== noteCategory))) return false;
      const matchesSearch =
        !query ||
        ArtistNames.matchesSong(song, query, `${song.key} ${song.sections.map(s=>s.content||s.html||s.text||" ").join(" ")}`);

      const matchesArtist =
        !filters.artist.value || song.artist === filters.artist.value;

      const matchesKey =
        !filters.key.value || song.key === filters.key.value;

      const matchesVisibility =
        !filters.visibility.value ||
        (filters.visibility.value === "shown"
          ? song.publicSongListVisible
          : !song.publicSongListVisible);

      const matchesContent =
        !filters.content.value ||
        (filters.content.value === "tabs"
          ? LyricsCommon.hasTabs(song)
          : LyricsCommon.hasLyrics(song));

      const matchesSetlist =
        !allowedIds || allowedIds.has(song.firebaseId);

      const bpm=Number(song.userBpm||song.originalBpm)||0;
      const extra=(!filters.genre.value||genres(song).includes(filters.genre.value)) &&
        (!filters.decade.value||Math.floor(Number(song.year)/10)*10===Number(filters.decade.value)) &&
        (!filters.bpmMin.value||bpm>=Number(filters.bpmMin.value)) && (!filters.bpmMax.value||(bpm>0&&bpm<=Number(filters.bpmMax.value))) &&
        (scope!=='favourites'||favourites.has(song.firebaseId));
      return extra && matchesSearch &&
        matchesArtist &&
        matchesKey &&
        matchesVisibility &&
        matchesContent &&
        matchesSetlist;
    });

    if ($("stickyFavToggle").checked) {
      list.sort((a, b) =>
        Number(favourites.has(b.firebaseId)) -
          Number(favourites.has(a.firebaseId)) ||
        compareTitles(a, b)
      );
    } else if (filters.sort.value === "artist") {
      list.sort((a, b) =>
        a.artist.localeCompare(b.artist) ||
        compareTitles(a, b)
      );
    } else if (filters.sort.value === "recent") {
      list.sort((a, b) =>
        (LyricsCommon.toDate(b.updatedAt)?.getTime() || 0) -
        (LyricsCommon.toDate(a.updatedAt)?.getTime() || 0)
      );
    } else if (filters.sort.value === "bpm") {
      list.sort((a, b) =>
        (Number(a.userBpm) || 9999) -
        (Number(b.userBpm) || 9999)
      );
    } else {
      list.sort(compareTitles);
    }

    return list;
  }

  function groupFor(title) {
    const first = String(title || "").trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(first) ? first : "#";
  }

  function renderAlphabetNav(groups) {
    $("alphabetNav").innerHTML = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
      .map(letter => `
        <button
          type="button"
          data-letter="${letter}"
          ${groups.has(letter) ? "" : "disabled"}>
          ${letter}
        </button>
      `)
      .join("");
  }

  function render() {
    syncNotesControls();
    visibleSongs = filteredSongs();

    $("resultCount").textContent = visibleSongs.length.toLocaleString();
    $("statTotal").textContent = songs.length.toLocaleString();
    $("statFavs").textContent = favourites.size.toLocaleString();
    $("statPublic").textContent = songs
      .filter(song => song.publicSongListVisible)
      .length
      .toLocaleString();

    $("songRows").innerHTML = "";

    const groups = new Set();
    let lastGroup = null;

    visibleSongs.forEach((song, index) => {
      const group = groupFor(song.title);
      groups.add(group);

      if (group !== lastGroup) {
        const header = document.createElement("div");
        header.className = "letter-row";
        header.id = `letter-${group === "#" ? "number" : group}`;
        header.textContent = group === "#" ? "Numbers & symbols" : group;
        $("songRows").appendChild(header);
        lastGroup = group;
      }

      const row = document.createElement("div");
      const note = personalNote(song);
      row.className = "song-table-row"+(song.firebaseId===selectedId?" is-selected":"")+(note?" personal-note-row":"");
      row.dataset.id = song.firebaseId;

      row.innerHTML = `


        <button
          class="star-btn ${favourites.has(song.firebaseId) ? "active" : ""}"
          data-fav="${song.firebaseId}"
          type="button"
          title="Favourite">
          ${favourites.has(song.firebaseId) ? "★" : "☆"}
        </button>

        <button
          class="song-title-cell"
          data-select="${song.firebaseId}"
          type="button">
          <strong>${LyricsCommon.escapeHTML(song.title)}</strong>
          <small>${LyricsCommon.escapeHTML(ArtistNames.display(song.artist))}${song.year ? " · "+LyricsCommon.escapeHTML(song.year) : ""}${note ? ` <span class="personal-note-badge" title="${LyricsCommon.escapeHTML(note.label)}">Note · ${LyricsCommon.escapeHTML(note.label)}</span>` : ""}</small>
        </button>

        <strong class="key-cell">
          ${LyricsCommon.escapeHTML(song.key || "—")}
        </strong>

        <span class="bpm-cell ${String(song.userBpm ?? "").trim() ? "has-user-bpm" : ""}">
          ${LyricsCommon.escapeHTML(song.userBpm || "—")}
        </span>

        <span class="original-bpm-cell">${LyricsCommon.escapeHTML(song.originalBpm || "—")}</span>
        <span class="capo-cell ${Number(song.capo) >= 1 ? "has-capo" : ""}">${LyricsCommon.escapeHTML(Number(song.capo) ? song.capo : "-")}</span>
        <span class="row-actions">
          <button
            class="row-play-btn"
            data-open="${song.firebaseId}"
            type="button"
            title="Play / Open song">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3 21 12 7 21Z"/></svg>
          </button>

          <button class="row-edit-btn" data-edit="${song.firebaseId}" type="button" aria-label="Edit song" title="Edit song"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L21 7l-4-4Z" fill="none" stroke="currentColor" stroke-width="2"/></svg></button><button class="row-queue-btn" data-queue="${song.firebaseId}" type="button" title="Add to Run Order" aria-label="Add to Run Order"><svg viewBox="0 0 28 24" aria-hidden="true"><path d="M2 12h8M6 8v8M15 5h2m3 0h6M15 12h2m3 0h6M15 19h2m3 0h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
        </span>
      `;

      $("songRows").appendChild(row);
    });

    if (!visibleSongs.length) {
      $("songRows").innerHTML =
        '<div class="empty-state">No songs match the current filters.</div>';
    }

    renderAlphabetNav(groups);
    updateSelected();
    const session=window.LK?.sessionTools?.getSession?.()||{},pub=window.LK?.sessionTools?.getPublicList?.()||{};
    const sessionList=setlists.find(x=>x.id===(session.setlistId||session.publicSetlistId||pub.setlistId));
    const chosen=setlists.find(x=>x.id===filters.setlist.value);
    const caption=$("ls26SessionSetlistName");caption.hidden=scope!=='session'&&!chosen;
    const ids=scope==='session'?(session.setlistSongIds||sessionList?.songIds||[]):(chosen?.songIds||[]);
    const count=songs.filter(x=>new Set(ids).has(x.firebaseId)).length;
    const name=scope==='session'?(sessionList?.name||session.setlistName||pub.setlistName||'No session setlist selected'):chosen?.name;
    caption.textContent=`${name||''} · ${count} songs`;
    $("libraryShowingCount").textContent = `Showing: ${visibleSongs.length}`;
    filters.setlist.classList.toggle("active", !!chosen);
    document.querySelectorAll("[data-scope]").forEach(b => {
      const active = !chosen && b.dataset.scope === scope;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    selectedIndex = Math.min(selectedIndex, visibleSongs.length - 1);

    restoreScrollWhenReady();
    requestAnimationFrame(syncSongTableHeaderAlignment);
  }

  function syncSongTableHeaderAlignment() {
    const list = $("songRows");
    const head = document.querySelector(".song-table-head");
    if (!list || !head) return;

    // Match the heading grid to the actual scrollable row width. Android uses
    // overlay scrollbars (0px gutter), while desktop browsers may reserve one.
    const scrollbarGutter = Math.max(0, list.offsetWidth - list.clientWidth);
    head.style.paddingLeft = "7px";
    head.style.paddingRight = `${7 + scrollbarGutter}px`;
  }

  function terminalRunOrderStatus(status) {
    return [
      "played","abandoned","left","deleted","deletedbyhost","declined"
    ].includes(String(status || "").toLowerCase());
  }

  function chooseNextRunOrderItem(items) {
    if (!Array.isArray(items)) return null;

    const active = items.filter(item =>
      item?.songId &&
      !terminalRunOrderStatus(item.status)
    );

    const playingIndex = active.findIndex(item =>
      String(item.status || "").toLowerCase() === "playing"
    );

    if (playingIndex >= 0) {
      return active[playingIndex + 1] || null;
    }

    return active[0] || null;
  }

  function normaliseRunSongIdentity(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "");
  }

  function authoritativeViewerSong(item) {
    if (!item) return null;

    const exact = songs.find(song =>
      song.firebaseId === item.songId
    );
    if (exact) return exact;

    const titleKey = normaliseRunSongIdentity(item.songTitle || item.title);
    const artistKey = normaliseRunSongIdentity(ArtistNames.display(item.artist || item.songArtist));

    const matches = songs.filter(song =>
      normaliseRunSongIdentity(song.title) === titleKey
    );

    if (artistKey) {
      const artistMatch = matches.find(song =>
        normaliseRunSongIdentity(ArtistNames.display(song.artist)) === artistKey
      );
      if (artistMatch) return artistMatch;
    }

    return matches.length === 1 ? matches[0] : null;
  }

  function updateRunOrderPlayer(items) {
    nextRunOrderItem = chooseNextRunOrderItem(items);

    if (nextRunOrderItem) {
      const authoritative = authoritativeViewerSong(nextRunOrderItem);
      if (authoritative?.firebaseId) {
        nextRunOrderItem = {
          ...nextRunOrderItem,
          songId:authoritative.firebaseId,
          songTitle:nextRunOrderItem.songTitle || authoritative.title || "",
          artist:nextRunOrderItem.artist || authoritative.artist || ""
        };
      }
    }

    const label = $("selectedSongLabel");
    const meta = $("runOrderPlayerMeta");
    const play = $("playSelectedBtn");

    if (!nextRunOrderItem) {
      if (label) label.textContent = "No song queued";
      if (meta) meta.textContent = "Waiting for Run Order";
      if (play) play.disabled = true;
      return;
    }

    if (label) {
      label.textContent =
        nextRunOrderItem.songTitle ||
        nextRunOrderItem.title ||
        nextRunOrderItem.songId ||
        "Untitled Song";
    }

    if (meta) {
      const parts = [
        ArtistNames.display(nextRunOrderItem.artist || ""),
        nextRunOrderItem.singerName
          ? `Requested by ${nextRunOrderItem.singerName}`
          : ""
      ].filter(Boolean);

      meta.textContent = parts.join(" · ") || "Next performance";
    }

    if (play) play.disabled = false;
  }

  function refreshRunOrderPlayerFromTools() {
    const items = window.LK?.sessionTools?.getRunOrder?.() || [];
    updateRunOrderPlayer(items);
  }

  function openRunOrderPanel() {
    if (window.LK?.sessionTools?.openRunOrderTab) {
      LK.sessionTools.openRunOrderTab();
      document.getElementById("topStatusBar")?.scrollIntoView({
        behavior:"smooth",
        block:"start"
      });
    }
  }

  function openSong(id) {
    saveViewState();
    window.location.href = LS26.url(`host/lyricview.html?id=${encodeURIComponent(id)}`);
  }

  function selectRelative(delta) {
    if (!visibleSongs.length) return;

    selectedIndex = Math.max(
      0,
      Math.min(
        visibleSongs.length - 1,
        selectedIndex < 0 ? 0 : selectedIndex + delta
      )
    );

    selectedId=visibleSongs[selectedIndex].firebaseId;updateSelected();
  }

  function exportCSV() {
    const rows = [
      ["Title", "Artist", "Key", "BPM", "Year", "Public Song List"],
      ...visibleSongs.map(song => [
        song.title,
        song.artist,
        song.key,
        song.userBpm,
        song.year,
        song.publicSongListVisible ? "Shown" : "Hidden"
      ])
    ];

    const csv = rows
      .map(row =>
        row.map(value =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")
      )
      .join("\n");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv" })
    );
    link.download = "lyrics-song-list.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function syncSidebarButton(){const open=!$("libraryFilterPanel").hidden;$("sidebarToggleBtn").setAttribute('aria-expanded',String(open));}
  function updateSelected(){document.querySelectorAll('.song-table-row').forEach(x=>x.classList.toggle('is-selected',x.dataset.id===selectedId));}
  async function queueSong(id,button){const song=songs.find(x=>x.firebaseId===id);if(!song)return;button.disabled=true;try{await LK.sessionTools.enqueueSong(song);window.LS26.toast('Added to Run Order');}catch(error){window.LS26.toast(error.message);}finally{button.disabled=false;}}
  $("libraryScrollTop").onclick=()=>$("songRows").scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  document.querySelectorAll('[data-scope]').forEach(button=>button.onclick=()=>{scope=button.dataset.scope;filters.setlist.value='';render();saveViewState();});
  filters.setlist.addEventListener('change',()=>{scope='all';render();saveViewState();});
  document.querySelectorAll('[data-bpm]').forEach(button=>button.onclick=()=>{const [id,delta]=button.dataset.bpm.split(':');const input=$(id);input.value=Math.max(0,Math.min(400,(Number(input.value)||100)+Number(delta)));input.dispatchEvent(new Event('input'));});
  $("songRows").addEventListener('scroll',saveViewState,{passive:true});

  document.addEventListener("click", event => {
    const edit=event.target.closest('[data-edit]');if(edit){location.href=LS26.url('host/lyricscreator.html?firebaseId='+encodeURIComponent(edit.dataset.edit));return;}
    const queue=event.target.closest('[data-queue]');if(queue){queueSong(queue.dataset.queue,queue);return;}
    const select=event.target.closest('[data-select]');if(select){selectedId=select.dataset.select;updateSelected();saveViewState();return;}
    const open = event.target.closest("[data-open]");
    if (open) {
      openSong(open.dataset.open);
      return;
    }

    const favourite = event.target.closest("[data-fav]");
    if (favourite) {
      if (favourites.has(favourite.dataset.fav)) {
        favourites.delete(favourite.dataset.fav);
      } else {
        favourites.add(favourite.dataset.fav);
      }

      saveFavourites();
      render();
      return;
    }

    const letter = event.target.closest("[data-letter]");
    if (letter && !letter.disabled) {
      const targetId =
        `letter-${letter.dataset.letter === "#" ? "number" : letter.dataset.letter}`;

      const target=document.getElementById(targetId),list=$("songRows");
      if(target)list.scrollTo({top:target.getBoundingClientRect().top-list.getBoundingClientRect().top+list.scrollTop,behavior:'smooth'});
      document.querySelectorAll('[data-letter]').forEach(x=>x.classList.toggle('active',x===letter));
    }
  });

  Object.values(filters).forEach(element => {
    element?.addEventListener(
      element.tagName === "INPUT" ? "input" : "change",
      () => {
        render();
        saveViewState();
      }
    );
  });

  $("stickyFavToggle").addEventListener("change", () => {
    render();
    saveViewState();
  });

  $("personalNotesToggle")?.addEventListener("click", () => {
    notesVisible = !notesVisible;
    saveNotesState();
    $("songRows").scrollTop = 0;
    render();
    saveViewState();
  });
  $("personalNotesCategory")?.addEventListener("change", event => {
    noteCategory = event.target.value;
    saveNotesState();
    $("songRows").scrollTop = 0;
    render();
    saveViewState();
  });

  $("clearFiltersBtn").onclick = () => {
    filters.search.value = "";
    filters.artist.value = "";
    filters.key.value = "";
    filters.visibility.value = "";
    filters.content.value = "";
    filters.setlist.value = "";
    filters.sort.value = "title";
    noteCategory = "";
    saveNotesState(); // Clear category/search without revealing hidden notes.
    filters.genre.value="";filters.decade.value="";filters.bpmMin.value="";filters.bpmMax.value="";scope="all";$("stickyFavToggle").checked=false;
    render();
    saveViewState();
  };

  $("refreshBtn").onclick = ()=>{LS26Data.invalidate("lyrics");LS26Data.invalidate("lyricsSetlists");loadData();};
  $("exportBtn").onclick = exportCSV;
  $("playSelectedBtn").onclick = () => {
    if (!nextRunOrderItem?.songId) return;

    saveViewState();

    const params = new URLSearchParams();
    params.set("id", nextRunOrderItem.songId);

    if (nextRunOrderItem.requestId) {
      params.set("requestId", nextRunOrderItem.requestId);
    }

    location.href = LS26.url(`host/lyricview.html?${params.toString()}`);
  };

  $("openRunOrderBtn").onclick = openRunOrderPanel;

  window.addEventListener("resize", () => requestAnimationFrame(syncSongTableHeaderAlignment), { passive:true });

  window.addEventListener("lk:runorder-updated", event => {
    updateRunOrderPlayer(event.detail?.items || []);
  });

  $("sidebarToggleBtn").onclick = () => {
    $("libraryFilterPanel").hidden=!$("libraryFilterPanel").hidden;
    syncSidebarButton();
    saveViewState();
  };

  // Restore the exact library context the user left:
  // sidebar visibility, filters, setlist, sort, sticky favourites and scroll.
  applyImmediateRestoredState();
  syncSidebarButton();

  updateStickyOffsets();
  setTimeout(refreshRunOrderPlayerFromTools, 350);
  setTimeout(refreshRunOrderPlayerFromTools, 1000);
  window.addEventListener("resize", updateStickyOffsets);
  window.addEventListener("pagehide", saveViewState);
  window.addEventListener("beforeunload", saveViewState);

  loadData();
})();
