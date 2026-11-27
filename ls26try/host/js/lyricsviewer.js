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
  let selectedStage = 0;
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

  // Rotation is a visual overlay; only the explicit sort changes order.
  function recommendationOrder() {
    return filters.sort.value === "recommended";
  }
  function rotationHighlight(song) {
    const mode=$("rotationFilter")?.value||"all";
    if(mode==="all"||personalNote(song)||!window.LS26BestNext?.matches(song))return "";
    return mode==="best"||mode==="fresh"?" rotation-highlight-yellow":" rotation-highlight-blue";
  }
  function changeRotation(value) {
    if($("rotationFilter"))$("rotationFilter").value=value;
    window.LS26BestNext?.filter(value);
  }
  function changeSort() {
    if(filters.sort.value === "title")$("stickyFavToggle").checked=false;
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
      sortExplicit: true,
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
    if (filters.sort) filters.sort.value = restoredState.sort === "recommended" && !restoredState.sortExplicit ? "title" : (restoredState.sort || "title");
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

      window.LS26BestNext?.setSongs(songs);
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

  function populateSetlists(current = filters.setlist.value || restoredState?.setlist || "") {

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
      const missingFilter=$('missingDataFilter')?.value;
      if(missingFilter){const missing=window.LS26Intelligence?.missing(song)||[];if(missingFilter==='any'?!missing.length:!missing.includes(missingFilter))return false;}
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

    if (recommendationOrder()) {
      list.sort((a,b)=>(window.LS26BestNext?.compare(a,b)||0)||compareTitles(a,b));
    } else if ($("stickyFavToggle").checked) {
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

  // Use only completed performances belonging to the active session.
  // Both sources are already subscribed elsewhere; no additional Firestore reads.
  function playedSongIds(session, sessionId, performances, runOrder) {
    const ids = new Set();
    if (!sessionId || session?.status !== "active" || session.id !== sessionId) return ids;
    const completed = record => ["played","completed","finished"].includes(String(record?.status || "").toLowerCase());
    const records = performances?.sessionId === sessionId ? (performances.records || []) : [];
    for (const record of [...records, ...(runOrder || [])]) {
      if (record?.songId && (!record.sessionId || record.sessionId === sessionId) && completed(record)) ids.add(String(record.songId));
    }
    return ids;
  }

  function currentPlayedSongIds() {
    const tools = window.LK?.sessionTools;
    return playedSongIds(tools?.getSession?.(), tools?.getSessionId?.(), window.LS26BestNext?.getSessionPerformances?.(), tools?.getRunOrder?.());
  }

  function render() {
    const playedIds = currentPlayedSongIds();
    syncNotesControls();
    visibleSongs = filteredSongs();
    if (!visibleSongs.some(song => song.firebaseId === selectedId)) selectedStage = 0;

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

      if (!recommendationOrder() && group !== lastGroup) {
        const header = document.createElement("div");
        header.className = "letter-row";
        header.id = `letter-${group === "#" ? "number" : group}`;
        header.textContent = group === "#" ? "Numbers & symbols" : group;
        $("songRows").appendChild(header);
        lastGroup = group;
      }

      const row = document.createElement("div");
      const note = personalNote(song);
      const played = playedIds.has(String(song.firebaseId));
      row.className = "song-table-row"+(song.firebaseId===selectedId?" is-selected":"")+(note?" personal-note-row":"")+(played?" is-played":"")+rotationHighlight(song);
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
          <strong>${played?`<span class="played-song-title">${LyricsCommon.escapeHTML(song.title)}</span><span class="played-song-label">(PLAYED)</span>`:LyricsCommon.escapeHTML(song.title)}</strong>${note?"":(window.LS26BestNext?.badge(song)||"")}
          <small>${LyricsCommon.escapeHTML(ArtistNames.display(song.artist))}${song.year ? " · "+LyricsCommon.escapeHTML(song.year) : ""}${note ? ` <span class="personal-note-badge" title="${LyricsCommon.escapeHTML(note.label)}">Note · ${LyricsCommon.escapeHTML(note.label)}</span>` : ""}</small>
        </button>

        <span class="library-placeholder-cell">-</span>
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
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3 21 12 7 21Z"/></svg><span class="row-play-label" aria-hidden="true">PLAY</span>
          </button>

          <button class="row-edit-btn" data-edit="${song.firebaseId}" type="button" aria-label="Edit song" title="Edit song"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L21 7l-4-4Z" fill="none" stroke="currentColor" stroke-width="2"/></svg></button><button class="row-queue-btn" data-queue="${song.firebaseId}" type="button" title="Add to Run Order" aria-label="Add to Run Order"><svg viewBox="0 0 28 24" aria-hidden="true"><path d="M2 12h8M6 8v8M15 5h2m3 0h6M15 12h2m3 0h6M15 19h2m3 0h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button><button class="row-setlist-btn" data-add-setlist="${song.firebaseId}" type="button" title="Add to setlist" aria-label="Add to setlist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h12M3 10h12M3 15h7M18 12v8M14 16h8"/></svg></button>
        </span>
      `;

      $("songRows").appendChild(row);
    });

    if (!visibleSongs.length) {
      $("songRows").innerHTML =
        '<div class="empty-state">No songs match the current filters.</div>';
    }

    renderAlphabetNav(recommendationOrder() ? new Set() : groups);
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

    selectedId=visibleSongs[selectedIndex].firebaseId;selectedStage=1;updateSelected();
  }

  function exportCSV(list) {
    const rows = [
      ["Title", "Artist", "Key", "BPM", "Year", "Public Song List"],
      ...list.map(song => [
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

  function formatExportText(list, includeDetails = false) {
    const clean = value => String(value ?? "").replace(/[\r\n]+/g, " ").trim();
    return list.map(song => {
      const title = clean(song.title);
      const artist = clean(ArtistNames.display(song.artist));
      const basic = artist ? title + " - " + artist : title;
      if (!includeDetails) return basic;
      const key = clean(song.key) || "Unknown key";
      const bpm = [song.userBpm, song.originalBpm].map(clean)
        .find(value => Number.isFinite(Number(value)) && Number(value) > 0);
      return basic + " - " + key + " - " + (bpm ? bpm + "BPM" : "Unknown BPM");
    }).join("\n");
  }

  // Analytics is computed solely from the rendered list; never query Firebase.
  function analyseLibrary(list, bpmMode = "effective") {
    const entries=list.filter(song=>!personalNote(song));
    const total=entries.length;
    const numeric=value=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<=400?n:null;};
    const counts=()=>new Map();
    const groups={tempo:new Map(),keys:new Map(),decades:new Map(),modes:new Map(),genres:new Map(),artists:new Map(),coverage:new Map()};
    const addGroup=(type,label,song,value)=>{const group=groups[type];if(!group.has(label))group.set(label,[]);group.get(label).push({song,value});};
    const increment=(map,label)=>map.set(label,(map.get(label)||0)+1);
    const ordered=map=>[...map].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])));
    const keys=counts(),modes=counts(),decades=counts(),years=counts(),genreCounts=counts(),artists=counts();
    const bpmValues=[],bpmBins=[["<60",0],["60–79",0],["80–99",0],["100–119",0],["120–139",0],["140–159",0],["160–179",0],["180+",0]];
    let userCount=0,originalCount=0,keyCount=0,yearCount=0,genreCount=0,artistCount=0;
    for(const song of entries){
      const user=numeric(song.userBpm),original=numeric(song.originalBpm);
      if(user!==null){userCount++;addGroup("coverage","User BPM",song,user+" BPM");}
      if(original!==null){originalCount++;addGroup("coverage","Original BPM",song,original+" BPM");}
      const bpm=bpmMode==="user"?user:bpmMode==="original"?original:user??original;
      if(bpm!==null){bpmValues.push(bpm);const bucket=bpm<60?0:Math.min(7,1+Math.floor((bpm-60)/20));bpmBins[bucket][1]++;addGroup("tempo",bpmBins[bucket][0],song,bpm+" BPM");}
      const rawKey=String(song.key??"").trim().replace(/♯/g,"#").replace(/♭/g,"b");
      if(rawKey&&!/^[-—–?]+$|^(unknown|n\/a|none)$/i.test(rawKey)){
        keyCount++;
        const match=rawKey.match(/^([A-Ga-g])([#b]?)[\s]*(major|maj|minor|min|m)?$/i);
        const minor=match&&/^(minor|min|m)$/i.test(match[3]||"")&&match[3]!=="M";
        const key=match?match[1].toUpperCase()+match[2]+(minor?"m":""):rawKey;
        const mode=match?(minor?"Minor":"Major"):"Other / unspecified";
        increment(keys,key);increment(modes,mode);addGroup("keys",key,song,key);addGroup("modes",mode,song,key);addGroup("coverage","Key",song,key);
      }
      const year=Number(song.year);
      if(Number.isInteger(year)&&year>=1000&&year<=2100){yearCount++;increment(years,year);const decade=Math.floor(year/10)*10;increment(decades,decade);addGroup("decades",decade+"s",song,String(year));addGroup("coverage","Release year",song,String(year));}
      const tags=[...new Set(genres(song).map(tag=>tag.trim()).filter(Boolean))];
      if(tags.length){genreCount++;tags.forEach(tag=>{increment(genreCounts,tag);addGroup("genres",tag,song,tag);});addGroup("coverage","Genre",song,tags.join(", "));}
      const artist=String(ArtistNames.display(song.artist)||"").trim();
      if(artist&&!/^[-—–?]+$|^(unknown|n\/a|none)$/i.test(artist)){artistCount++;increment(artists,artist);addGroup("artists",artist,song,artist);addGroup("coverage","Artist",song,artist);}
    }
    bpmValues.sort((a,b)=>a-b);const n=bpmValues.length,mid=Math.floor(n/2);
    const mean=n?bpmValues.reduce((sum,value)=>sum+value,0)/n:null;
    const median=n?(n%2?bpmValues[mid]:(bpmValues[mid-1]+bpmValues[mid])/2):null;
    const sortedYears=[...years.keys()].sort((a,b)=>a-b);
    return {groups,total,excluded:list.length-total,bpmCount:n,userCount,originalCount,keyCount,yearCount,genreCount,artistCount,
      mean,median,min:n?bpmValues[0]:null,max:n?bpmValues[n-1]:null,bpmBins,keys:ordered(keys),modes:ordered(modes),
      decades:[...decades].sort((a,b)=>a[0]-b[0]).map(([year,count])=>[year+"s",count]),years:sortedYears,
      genres:ordered(genreCounts),artists:ordered(artists)};
  }

  function openLibraryAnalysis() {
    const list=visibleSongs.slice();
    const chosen=setlists.find(item=>item.id===filters.setlist.value);
    const scopeLabel=chosen?.name||(scope==="favourites"?"Favourites":scope==="session"?"Session setlist":"All songs");
    const dialog=document.createElement("dialog");
    dialog.className="ls26-dialog library-analysis-dialog";
    dialog.setAttribute("aria-labelledby","libraryAnalysisTitle");
    dialog.innerHTML='<header class="library-analysis-header"><div><h2 id="libraryAnalysisTitle">Song Library Analysis</h2><p class="library-analysis-scope"></p></div><button type="button" data-analysis-close aria-label="Close analysis">×</button></header><div class="library-analysis-bpm"><label for="libraryAnalysisBpm">Tempo source</label><select id="libraryAnalysisBpm"><option value="effective">User BPM, otherwise original</option><option value="user">User BPM only</option><option value="original">Original BPM only</option></select></div><div class="library-analysis-content"></div>';
    dialog.querySelector(".library-analysis-scope").textContent=scopeLabel+" · current filtered list";
    const content=dialog.querySelector(".library-analysis-content"),selector=dialog.querySelector("select");
    const esc=value=>LyricsCommon.escapeHTML(String(value));
    const fmt=value=>value===null?"–":Number(value.toFixed(1)).toLocaleString();
    const percent=(count,total)=>total?Math.round(count/total*100):0;
    let analysis=null;
    const charts=new Map();
    let detailView=null,overviewScroll=0,returnFocus=null;
    function bars(title,rows,denominator,detail,limit=Infinity,type){
      charts.set(type,{title,rows,denominator,detail});
      const shown=rows.slice(0,limit),max=Math.max(1,...shown.map(row=>row[1]));
      const markup=shown.map(([name,count],index)=>'<button type="button" class="library-analysis-bar-row" data-analysis-group="'+index+'" aria-label="'+esc(name)+': '+count+' songs. View songs"><span class="library-analysis-bar-label" title="'+esc(name)+'">'+esc(name)+'</span><span class="library-analysis-track" aria-hidden="true"><span style="width:'+count/max*100+'%"></span></span><strong>'+count+' <small>'+percent(count,denominator)+'%</small></strong></button>').join("");
      return '<section class="library-analysis-chart" data-analysis-chart="'+type+'"><h3><button type="button" data-analysis-all>'+esc(title)+'<span aria-hidden="true">›</span></button></h3><p>'+esc(detail)+'</p>'+(shown.length?markup:'<p class="library-analysis-empty">No recorded data</p>')+(rows.length>limit?'<p>Showing top '+limit+' of '+rows.length+' · open card for all</p>':'')+'<button type="button" class="library-analysis-view-songs" data-analysis-all>View songs by group ›</button></section>';
    }
    function draw(){
      const a=analysis=analyseLibrary(list,selector.value);charts.clear();detailView=null;
      const metrics=[["Songs",a.total],["Average BPM",fmt(a.mean)],["Median BPM",fmt(a.median)],["BPM range",a.min===null?"–":fmt(a.min)+"–"+fmt(a.max)],["Most common key",a.keys[0]?.[0]||"–"],["Release years",a.years.length?a.years[0]+"–"+a.years[a.years.length-1]:"–"]];
      content.innerHTML='<div class="library-analysis-metrics">'+metrics.map(([name,value])=>'<div><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>').join("")+'</div>'+
        '<p class="library-analysis-note">'+a.total+' songs analysed'+(a.excluded?' · '+a.excluded+' personal notes excluded':'')+'. Unknown values are excluded from distributions; coverage below shows missing data.</p>'+
        '<div class="library-analysis-grid">'+
        bars("Tempo distribution",a.bpmCount?a.bpmBins:[],a.bpmCount,a.bpmCount+" songs with usable BPM",Infinity,"tempo")+
        bars("Musical keys",a.keys,a.keyCount,a.keyCount+" songs with a recorded key",Infinity,"keys")+
        bars("Release decades",a.decades,a.yearCount,a.yearCount+" songs with a release year",Infinity,"decades")+
        bars("Major / minor",a.modes,a.keyCount,"Based on the saved key notation",Infinity,"modes")+
        bars("Genres",a.genres,a.total,"Share of songs; songs can have multiple genres",12,"genres")+
        bars("Most represented artists",a.artists,a.total,"Grouped by stored artist credit",12,"artists")+
        bars("Data completeness",[["User BPM",a.userCount],["Original BPM",a.originalCount],["Key",a.keyCount],["Release year",a.yearCount],["Genre",a.genreCount],["Artist",a.artistCount]],a.total,"Recorded values out of "+a.total+" songs",Infinity,"coverage")+
        '</div>';
    }
    function showDetails(type,index=null,restore=false){
      const chart=charts.get(type);
      if(!chart)return;
      if(!restore){overviewScroll=dialog.scrollTop;returnFocus={type,index};}
      const selected=index===null?chart.rows:chart.rows.slice(index,index+1);
      const groupMap=analysis.groups[type];
      detailView={type,index};
      const songMarkup=(entries)=>entries.map(({song,value})=>'<div class="library-analysis-song"><div><strong>'+esc(song.title||"Untitled")+'</strong><small>'+esc(ArtistNames.display(song.artist)||"Unknown artist")+'</small></div><span>'+esc(value)+'</span></div>').join("");
      const groupMarkup=selected.map(([name,count])=>{
        const entries=[...(groupMap.get(name)||[])].sort((a,b)=>type==="tempo"?parseFloat(a.value)-parseFloat(b.value)||String(a.song.title).localeCompare(String(b.song.title)):type==="decades"?Number(a.value)-Number(b.value)||String(a.song.title).localeCompare(String(b.song.title)):String(a.song.title).localeCompare(String(b.song.title)));
        return '<section class="library-analysis-song-group"><h3>'+esc(name)+' <small>'+count+' '+(count===1?'song':'songs')+'</small></h3>'+(entries.length?songMarkup(entries):'<p>No songs in this group.</p>')+'</section>';
      }).join("");
      content.innerHTML='<div class="library-analysis-detail-header"><button type="button" data-analysis-back>‹ Back to charts</button><div><h3>'+esc(chart.title)+'</h3><p>'+esc(index===null?chart.detail:String(selected[0]?.[0]||""))+'</p></div></div>'+(index!==null?'<button type="button" data-analysis-full>View all groups ›</button>':'')+'<div class="library-analysis-song-groups">'+(groupMarkup||'<p>No recorded data.</p>')+'</div>';
      dialog.scrollTop=0;content.querySelector('[data-analysis-back]').focus({preventScroll:true});
    }
    content.addEventListener("click",event=>{
      if(event.target.closest('[data-analysis-back]')){
        const previous=returnFocus;draw();dialog.scrollTop=overviewScroll;
        const card=previous&&content.querySelector('[data-analysis-chart="'+previous.type+'"]');
        const target=card?.querySelector(previous.index===null?'[data-analysis-all]':'[data-analysis-group="'+previous.index+'"]');
        target?.focus({preventScroll:true});return;
      }
      if(event.target.closest('[data-analysis-full]')&&detailView){showDetails(detailView.type,null,true);return;}
      const card=event.target.closest('[data-analysis-chart]');
      if(!card)return;
      const group=event.target.closest('[data-analysis-group]');
      showDetails(card.dataset.analysisChart,group?Number(group.dataset.analysisGroup):null);
    });
    selector.addEventListener("change",()=>{const previous=detailView;draw();if(previous)showDetails(previous.type,null,true);});
    dialog.querySelector("[data-analysis-close]").onclick=()=>dialog.close();
    dialog.addEventListener("close",()=>{dialog.remove();$("libraryAnalysisBtn")?.focus({preventScroll:true});},{once:true});
    draw();document.body.append(dialog);dialog.showModal();
  }

  function openExportDialog() {
    // Snapshot the rendered list: retain filters and ordering, without fetching data.
    const list = visibleSongs.slice();
    const plainText = formatExportText(list);
    const detailedText = formatExportText(list, true);

    const dialog = document.createElement("dialog");
    dialog.className = "ls26-dialog";
    dialog.setAttribute("aria-labelledby", "libraryExportTitle");
    dialog.innerHTML = '<h2 id="libraryExportTitle">Export song list</h2>' +
      '<p class="ls26-dialog-message"></p>' +
      '<div class="ls26-dialog-actions">' +
      '<button type="button" data-export="download">Download CSV</button>' +
      '<button type="button" class="primary" data-export="copy">Copy to clipboard</button>' +
      '<button type="button" class="primary" data-export="copy-details">Copy with key &amp; BPM</button>' +
      '<button type="button" data-export="cancel">Close</button></div>' +
      '<p role="status" aria-live="polite"></p>' +
      '<textarea aria-label="Song list to copy manually" rows="6" readonly hidden></textarea>';
    dialog.querySelector(".ls26-dialog-message").textContent =
      list.length.toLocaleString() + (list.length === 1 ? " song" : " songs") +
      " in the displayed list. Current filters and sort order will be preserved.";
    const download = dialog.querySelector('[data-export="download"]');
    const copy = dialog.querySelector('[data-export="copy"]');
    const copyDetails = dialog.querySelector('[data-export="copy-details"]');
    const status = dialog.querySelector('[role="status"]');
    const manual = dialog.querySelector("textarea");
    download.disabled = copy.disabled = copyDetails.disabled = !list.length;
    download.onclick = () => exportCSV(list);
    const copyText = async (text, button) => {
      copy.disabled = copyDetails.disabled = true;
      status.textContent = "";
      try {
        let copied = false;
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(text);
            copied = true;
          } catch (_) { /* Try the selection-based fallback. */ }
        }
        if (!dialog.isConnected || !dialog.open) return;
        if (!copied) {
          manual.hidden = false;
          manual.value = text;
          manual.focus();
          manual.select();
          manual.setSelectionRange(0, manual.value.length);
          try { copied = document.execCommand("copy"); } catch (_) {}
        }
        if (copied) {
          manual.hidden = true;
          copy.disabled = copyDetails.disabled = false;
          button.focus({ preventScroll: true });
          status.textContent = list.length.toLocaleString() +
            (list.length === 1 ? " song copied" : " songs copied") + " to clipboard.";
        } else {
          status.textContent = "Clipboard access is unavailable. Copy the selected text below manually.";
        }
      } finally {
        copy.disabled = copyDetails.disabled = false;
      }
    };
    copy.onclick = () => copyText(plainText, copy);
    copyDetails.onclick = () => copyText(detailedText, copyDetails);
    dialog.querySelector('[data-export="cancel"]').onclick = () => dialog.close();
    dialog.addEventListener("close", () => {
      dialog.remove();
      $("exportBtn").focus({ preventScroll: true });
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }

  function syncSidebarButton(){const open=!$("libraryFilterPanel").hidden;$("sidebarToggleBtn").setAttribute('aria-expanded',String(open));}
  function updateSelected(){
    document.querySelectorAll('.song-table-row').forEach(row => {
      const selected = row.dataset.id === selectedId;
      row.classList.toggle('is-selected', selected);
      row.classList.toggle('is-armed', selected && selectedStage === 2);
      row.querySelector('[data-select]')?.setAttribute('aria-pressed', String(selected));
    });
  }
  function selectSongRow(id) {
    if (selectedId !== id || selectedStage === 0) { selectedId = id; selectedStage = 1; }
    else if (selectedStage === 1) selectedStage = 2;
    else { selectedStage = 1; openSong(id); return; }
    selectedIndex = visibleSongs.findIndex(song => song.firebaseId === id);
    updateSelected();
    saveViewState();
  }
  function insertSetlistSong(ids, id) {
    const lookup = new Map(songs.map(song => [song.firebaseId, song]));
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    if (ids.includes(id)) return [...ids];
    return [...ids, id].sort((a,b) => {
      const x=lookup.get(a), y=lookup.get(b);
      if (!x || !y) return x ? -1 : y ? 1 : 0;
      return collator.compare(x.title,y.title) || collator.compare(ArtistNames.display(x.artist),ArtistNames.display(y.artist)) || collator.compare(a,b);
    });
  }
  async function addSongToSetlist(id, setlistId) {
    const db = window.db || window.LK?.db;
    const user = firebase.auth().currentUser;
    if (!db || !user) throw Error('Sign in as host to add songs to setlists.');
    const ref = db.collection('lyricsSetlists').doc(setlistId);
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Error('This setlist no longer exists.');
      const data = snapshot.data() || {};
      const ids = Array.isArray(data.songIds) ? data.songIds : [];
      const added = !ids.includes(id);
      const songIds = insertSetlistSong(ids,id);
      if (added) transaction.update(ref, {songIds,updatedBy:user.uid,updatedByEmail:user.email||'',updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      return {data,songIds,added};
    });
    const current = filters.setlist.value;
    const local = { ...result.data,id:setlistId,songIds:result.songIds };
    setlists = setlists.map(item=>item.id===setlistId?local:item);
    LS26Data.invalidate('lyricsSetlists');
    populateSetlists(current);
    const top = $('songRows').scrollTop;
    render();
    $('songRows').scrollTop = top;
    window.dispatchEvent(new Event('ls26:working-setlist'));
    return result;
  }
  function openSetlistPicker(id, opener) {
    const song = songs.find(item=>item.firebaseId===id);
    if (!song) return;
    const dialog = document.createElement('dialog');
    dialog.className='ls26-dialog';
    dialog.setAttribute('aria-labelledby','librarySetlistPickerTitle');
    dialog.innerHTML='<h2 id="librarySetlistPickerTitle">Add to setlist</h2><p class="ls26-dialog-message"></p><div class="library-setlist-options"></div><p role="status" aria-live="polite"></p><div class="ls26-dialog-actions"><button type="button" data-picker-close>Close</button></div>';
    dialog.querySelector('.ls26-dialog-message').textContent=song.title+' - '+ArtistNames.display(song.artist);
    const options=dialog.querySelector('.library-setlist-options');
    const status=dialog.querySelector('[role="status"]');
    const close=dialog.querySelector('[data-picker-close]');
    let busy=false;
    const ordered=[...setlists].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    if (!ordered.length) status.textContent='No saved setlists. Create one in Setlists first.';
    for (const setlist of ordered) {
      const button=document.createElement('button');
      button.type='button';
      const name=document.createElement('span'); name.textContent=setlist.name||'Untitled Setlist';
      const meta=document.createElement('small');
      const already=setlist.songIds.includes(id);
      meta.textContent=already?'Already added':setlist.songIds.length+' songs  +';
      button.disabled=already;
      button.append(name,meta);
      options.appendChild(button);
      button.onclick=async()=>{
        if(busy)return;
        busy=true;close.disabled=true;
        const enabled=[...options.querySelectorAll('button:not(:disabled)')];
        enabled.forEach(item=>item.disabled=true);
        status.textContent='Saving…';
        try{
          const result=await addSongToSetlist(id,setlist.id);
          window.LS26.toast(result.added?'Added to '+name.textContent:'Already in '+name.textContent);
          dialog.close();
        }catch(error){
          status.textContent=error?.message||'Could not add song.';
          enabled.forEach(item=>item.disabled=false);
        }finally{busy=false;close.disabled=false;}
      };
    }
    close.onclick=()=>dialog.close();
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{
      dialog.remove();
      if(opener?.isConnected)opener.focus({preventScroll:true});
      else [...document.querySelectorAll('[data-add-setlist]')].find(item=>item.dataset.addSetlist===id)?.focus({preventScroll:true});
    },{once:true});
    document.body.append(dialog);
    dialog.showModal();
  }
  async function queueSong(id,button){
    const song=songs.find(x=>x.firebaseId===id);
    if(!song)return;
    button.disabled=true;
    try{
      const result=await LK.sessionTools.enqueueSong(song);
      if(Array.isArray(result?.items))updateRunOrderPlayer(result.items);
      else refreshRunOrderPlayerFromTools();
      window.LS26.toast('Added to Run Order');
    }catch(error){window.LS26.toast(error.message);}
    finally{button.disabled=false;}
  }
  $("libraryScrollTop").onclick=()=>$("songRows").scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  document.querySelectorAll('[data-scope]').forEach(button=>button.onclick=()=>{scope=button.dataset.scope;filters.setlist.value='';window.dispatchEvent(new Event('ls26:working-setlist'));render();saveViewState();});
  filters.setlist.addEventListener('change',()=>{scope='all';render();saveViewState();});
  document.querySelectorAll('[data-bpm]').forEach(button=>button.onclick=()=>{const [id,delta]=button.dataset.bpm.split(':');const input=$(id);input.value=Math.max(0,Math.min(400,(Number(input.value)||100)+Number(delta)));input.dispatchEvent(new Event('input'));});
  $("songRows").addEventListener('scroll',saveViewState,{passive:true});

  document.addEventListener("click", event => {
    const edit=event.target.closest('[data-edit]');if(edit){location.href=LS26.url('host/lyricscreator.html?firebaseId='+encodeURIComponent(edit.dataset.edit)+($('missingDataFilter')?.value?'&missing='+encodeURIComponent($('missingDataFilter').value):''));return;}
    const queue=event.target.closest('[data-queue]');if(queue){queueSong(queue.dataset.queue,queue);return;}
    const addSetlist=event.target.closest('[data-add-setlist]');if(addSetlist){openSetlistPicker(addSetlist.dataset.addSetlist,addSetlist);return;}
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

    const row = event.target.closest(".song-table-row");
    if (row) { selectSongRow(row.dataset.id); return; }

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
        if(element === filters.sort)changeSort();
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

  window.addEventListener('ls26:rotation-updated',()=>{if(songs.length)render();});
  $('missingDataFilter')?.addEventListener('change',render);
  $('setlistFilter')?.addEventListener('change',()=>window.dispatchEvent(new Event('ls26:working-setlist')));
  $('rotationFilter')?.addEventListener('change',event=>{
    changeRotation(event.target.value);
    const rows=$("songRows"),top=rows.scrollTop;
    render();rows.scrollTop=top;saveViewState();
  });
  $("clearFiltersBtn").onclick = () => {
    if($('rotationFilter'))$('rotationFilter').value='all';
    window.LS26BestNext?.filter('all');
    filters.search.value = "";
    filters.artist.value = "";
    filters.key.value = "";
    filters.visibility.value = "";
    filters.content.value = "";
    filters.setlist.value = "";
    filters.sort.value = "title";
    noteCategory = "";
    saveNotesState(); // Clear category/search without revealing hidden notes.
    if($("missingDataFilter"))$("missingDataFilter").value="";
    filters.genre.value="";filters.decade.value="";filters.bpmMin.value="";filters.bpmMax.value="";scope="all";$("stickyFavToggle").checked=false;
    window.dispatchEvent(new Event('ls26:working-setlist'));
    render();
    saveViewState();
  };

  $("refreshBtn").onclick = ()=>{LS26Data.invalidate("lyrics");LS26Data.invalidate("lyricsSetlists");loadData();};
  $("exportBtn").onclick = openExportDialog;
  if ($("libraryAnalysisBtn")) $("libraryAnalysisBtn").onclick = openLibraryAnalysis;
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
