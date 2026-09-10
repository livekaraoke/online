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

  function readViewState() {
    try {
      return JSON.parse(localStorage.getItem(VIEW_STATE_KEY) || "null") || {};
    } catch {
      return {};
    }
  }

  function currentViewState() {
    return {
      sidebarCollapsed: $("libraryShell")?.classList.contains("sidebar-collapsed") || false,
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

    if (restoredState.sidebarCollapsed) {
      $("libraryShell")?.classList.add("sidebar-collapsed");
    }

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
    const currentArtist = filters.artist.value || restoredState?.artist || "";
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
      const matchesSearch =
        !query ||
        `${song.title} ${song.artist} ${song.key} ${song.year} ${song.sections.map(s=>s.content||s.html||s.text||" ").join(" ")}`
          .toLowerCase()
          .includes(query);

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
        a.title.localeCompare(b.title)
      );
    } else if (filters.sort.value === "artist") {
      list.sort((a, b) =>
        a.artist.localeCompare(b.artist) ||
        a.title.localeCompare(b.title)
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
      list.sort((a, b) => a.title.localeCompare(b.title));
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
        header.textContent = group === "#" ? "0–9" : group;
        $("songRows").appendChild(header);
        lastGroup = group;
      }

      const row = document.createElement("div");
      row.className = "song-table-row"+(song.firebaseId===selectedId?" is-selected":"");
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
          <small>${LyricsCommon.escapeHTML(song.artist)}${song.year ? " · "+LyricsCommon.escapeHTML(song.year) : ""}</small>
        </button>

        <strong class="key-cell">
          ${LyricsCommon.escapeHTML(song.key || "—")}
        </strong>

        <span class="bpm-cell">
          ${LyricsCommon.escapeHTML(song.userBpm || song.originalBpm || "—")}
        </span>

        <span class="capo-cell">${LyricsCommon.escapeHTML(song.capo || "0")}</span>
        <span class="row-actions">
          <button
            class="row-play-btn"
            data-open="${song.firebaseId}"
            type="button"
            title="Play / Open song">
            ▶
          </button>

          <button class="row-queue-btn" data-queue="${song.firebaseId}" type="button" title="Add to Run Order">＋ Queue</button>
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
    const caption=$("ls26SessionSetlistName");caption.hidden=scope!=='session';caption.textContent=sessionList?.name||session.setlistName||pub.setlistName||'No session setlist selected';
    document.querySelectorAll("[data-scope]").forEach(b=>b.classList.toggle("active",b.dataset.scope===scope));
    selectedIndex = Math.min(selectedIndex, visibleSongs.length - 1);

    restoreScrollWhenReady();
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
    const artistKey = normaliseRunSongIdentity(item.artist || item.songArtist);

    const matches = songs.filter(song =>
      normaliseRunSongIdentity(song.title) === titleKey
    );

    if (artistKey) {
      const artistMatch = matches.find(song =>
        normaliseRunSongIdentity(song.artist) === artistKey
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
        nextRunOrderItem.artist || "",
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

  function syncSidebarButton(){const open=!$("librarySidebar").hidden;$("sidebarToggleBtn").setAttribute('aria-expanded',String(open));}
  function updateSelected(){const song=songs.find(x=>x.firebaseId===selectedId);$("ls26SelectedTitle").textContent=song?`${song.title} — ${song.artist}`:'Select a song';$("ls26OpenSelected").disabled=!song;$("ls26QueueSelected").disabled=!song;document.querySelectorAll('.song-table-row').forEach(x=>x.classList.toggle('is-selected',x.dataset.id===selectedId));}
  async function queueSong(id,button){const song=songs.find(x=>x.firebaseId===id);if(!song)return;button.disabled=true;try{await LK.sessionTools.enqueueSong(song);window.LS26.toast('Added to Run Order');}catch(error){window.LS26.toast(error.message);}finally{button.disabled=false;}}
  $("ls26OpenSelected").onclick=()=>selectedId&&openSong(selectedId);
  $("ls26QueueSelected").onclick=e=>queueSong(selectedId,e.currentTarget);
  document.querySelectorAll('[data-scope]').forEach(button=>button.onclick=()=>{scope=button.dataset.scope;filters.setlist.value='';render();saveViewState();});
  filters.setlist.addEventListener('change',()=>{scope='all';render();saveViewState();});
  document.querySelectorAll('[data-bpm]').forEach(button=>button.onclick=()=>{const [id,delta]=button.dataset.bpm.split(':');const input=$(id);input.value=Math.max(0,Math.min(400,(Number(input.value)||100)+Number(delta)));input.dispatchEvent(new Event('input'));});
  $("songRows").addEventListener('scroll',saveViewState,{passive:true});

  document.addEventListener("click", event => {
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

  $("clearFiltersBtn").onclick = () => {
    filters.search.value = "";
    filters.artist.value = "";
    filters.key.value = "";
    filters.visibility.value = "";
    filters.content.value = "";
    filters.setlist.value = "";
    filters.sort.value = "title";
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

    params.set("play","1");
    location.href = LS26.url(`host/lyricview.html?${params.toString()}`);
  };

  $("openRunOrderBtn").onclick = openRunOrderPanel;

  window.addEventListener("lk:runorder-updated", event => {
    updateRunOrderPlayer(event.detail?.items || []);
  });

  $("sidebarToggleBtn").onclick = () => {
    $("librarySidebar").hidden=!$("librarySidebar").hidden;
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
