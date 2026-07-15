(() => {
  const $ = id => document.getElementById(id);
  let songs = [];
  let setlists = [];
  let visibleSongs = [];
  let selectedIndex = -1;
  let songsUnsub = null;
  let setlistsUnsub = null;
  const favourites = new Set(JSON.parse(localStorage.getItem("lyricsViewerFavourites") || "[]"));

  const filters = {
    search: $("searchInput"), artist: $("artistFilter"), key: $("keyFilter"),
    visibility: $("visibilityFilter"), content: $("contentFilter"), sort: $("sortSelect"), setlist: $("setlistFilter")
  };

  function saveFavourites() { localStorage.setItem("lyricsViewerFavourites", JSON.stringify([...favourites])); }

  function loadData() {
    $("songRows").innerHTML = '<div class="loading-state">Loading songs…</div>';
    if (songsUnsub) songsUnsub();
    if (setlistsUnsub) setlistsUnsub();
    songsUnsub = db.collection("lyrics").onSnapshot(snapshot => {
      songs = snapshot.docs.map(doc => LyricsCommon.normalizeSong(doc.data(), doc.id));
      populateFilters(); render();
    }, showError);
    setlistsUnsub = db.collection("lyricsSetlists").onSnapshot(snapshot => {
      setlists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), songIds: Array.isArray(doc.data().songIds) ? doc.data().songIds : [] }));
      populateSetlists(); render();
    }, showError);
  }

  function showError(error) {
    console.error(error);
    $("songRows").innerHTML = `<div class="error-state">Could not load data: ${LyricsCommon.escapeHTML(error.message)}</div>`;
  }

  function populateSetlists() {
    const current = filters.setlist.value;
    filters.setlist.innerHTML = '<option value="">All Setlists / Songs</option>' + setlists.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))).map(s=>`<option value="${LyricsCommon.escapeHTML(s.id)}">${LyricsCommon.escapeHTML(s.name || "Untitled Setlist")} (${s.songIds.length})</option>`).join("");
    filters.setlist.value = current;
    $("statSetlists").textContent = setlists.length.toLocaleString();
  }

  function populateFilters() {
    const currentArtist = filters.artist.value;
    const currentKey = filters.key.value;
    const artists = [...new Set(songs.map(s => s.artist).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const keys = [...new Set(songs.map(s => s.key).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    filters.artist.innerHTML = '<option value="">All Artists</option>' + artists.map(v=>`<option>${LyricsCommon.escapeHTML(v)}</option>`).join("");
    filters.key.innerHTML = '<option value="">All Keys</option>' + keys.map(v=>`<option>${LyricsCommon.escapeHTML(v)}</option>`).join("");
    filters.artist.value = currentArtist; filters.key.value = currentKey;
  }

  function filteredSongs() {
    const query = filters.search.value.toLowerCase().trim();
    const chosenSetlist = setlists.find(s => s.id === filters.setlist.value);
    const allowedIds = chosenSetlist ? new Set(chosenSetlist.songIds) : null;
    let list = songs.filter(song => {
      const matchesSearch = !query || `${song.title} ${song.artist} ${song.key} ${song.year}`.toLowerCase().includes(query);
      const matchesArtist = !filters.artist.value || song.artist === filters.artist.value;
      const matchesKey = !filters.key.value || song.key === filters.key.value;
      const matchesVisibility = !filters.visibility.value || (filters.visibility.value === "shown" ? song.publicSongListVisible : !song.publicSongListVisible);
      const matchesContent = !filters.content.value || (filters.content.value === "tabs" ? LyricsCommon.hasTabs(song) : LyricsCommon.hasLyrics(song));
      const matchesSetlist = !allowedIds || allowedIds.has(song.firebaseId);
      return matchesSearch && matchesArtist && matchesKey && matchesVisibility && matchesContent && matchesSetlist;
    });
    if ($("stickyFavToggle").checked) list.sort((a,b)=>Number(favourites.has(b.firebaseId))-Number(favourites.has(a.firebaseId)) || a.title.localeCompare(b.title));
    else if (filters.sort.value === "artist") list.sort((a,b)=>a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
    else if (filters.sort.value === "recent") list.sort((a,b)=>(LyricsCommon.toDate(b.updatedAt)?.getTime()||0)-(LyricsCommon.toDate(a.updatedAt)?.getTime()||0));
    else if (filters.sort.value === "bpm") list.sort((a,b)=>(Number(a.userBpm)||9999)-(Number(b.userBpm)||9999));
    else list.sort((a,b)=>a.title.localeCompare(b.title));
    return list;
  }

  function groupFor(title) {
    const c = String(title || "").trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : "#";
  }

  function renderAlphabetNav(groups) {
    $("alphabetNav").innerHTML = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(letter => `<button type="button" data-letter="${letter}" ${groups.has(letter) ? "" : "disabled"}>${letter}</button>`).join("");
  }

  function render() {
    visibleSongs = filteredSongs();
    $("resultCount").textContent = visibleSongs.length.toLocaleString();
    $("statTotal").textContent = songs.length.toLocaleString();
    $("statFavs").textContent = favourites.size.toLocaleString();
    $("statPublic").textContent = songs.filter(s=>s.publicSongListVisible).length.toLocaleString();
    $("songRows").innerHTML = "";
    const groups = new Set();
    let lastGroup = null;
    visibleSongs.forEach((song, index) => {
      const group = groupFor(song.title); groups.add(group);
      if (group !== lastGroup) {
        const header = document.createElement("div");
        header.className = "letter-row"; header.id = `letter-${group === "#" ? "number" : group}`; header.textContent = group === "#" ? "0–9" : group;
        $("songRows").appendChild(header); lastGroup = group;
      }
      const row = document.createElement("div"); row.className = "song-table-row"; row.dataset.id = song.firebaseId;
      row.innerHTML = `<span>${index + 1}</span>
        <button class="star-btn ${favourites.has(song.firebaseId)?"active":""}" data-fav="${song.firebaseId}" type="button">${favourites.has(song.firebaseId)?"★":"☆"}</button>
        <button class="song-title-cell" data-open="${song.firebaseId}" type="button"><strong>${LyricsCommon.escapeHTML(song.title)}</strong><small>${LyricsCommon.escapeHTML(song.artist)}</small></button>
        <span>${LyricsCommon.escapeHTML(song.artist)}</span><strong class="key-cell">${LyricsCommon.escapeHTML(song.key || "—")}</strong><span>${LyricsCommon.escapeHTML(song.userBpm || "—")}</span>
        <span><span class="public-badge ${song.publicSongListVisible?"shown":"hidden-status"}">${song.publicSongListVisible?"SONG LIST":"NOT SHOWN"}</span></span>
        <span class="row-actions"><button data-open="${song.firebaseId}" title="Open">▷</button><a href="lyricscreator.html?firebaseId=${encodeURIComponent(song.firebaseId)}" title="Edit">▧</a><button data-visibility="${song.firebaseId}" data-next="${song.publicSongListVisible ? "false" : "true"}" title="Toggle public visibility">${song.publicSongListVisible ? "◉" : "○"}</button></span>`;
      $("songRows").appendChild(row);
    });
    if (!visibleSongs.length) $("songRows").innerHTML = '<div class="empty-state">No songs match the current filters.</div>';
    renderAlphabetNav(groups);
    selectedIndex = Math.min(selectedIndex, visibleSongs.length - 1);
  }

  function openSong(id) { window.location.href = `lyricview.html?id=${encodeURIComponent(id)}`; }
  function selectRelative(delta) {
    if (!visibleSongs.length) return;
    selectedIndex = Math.max(0, Math.min(visibleSongs.length - 1, (selectedIndex < 0 ? 0 : selectedIndex + delta)));
    $("selectedSongLabel").textContent = `${visibleSongs[selectedIndex].title} — ${visibleSongs[selectedIndex].artist}`;
  }
  function exportCSV() {
    const rows = [["Title","Artist","Key","BPM","Year","Public Song List"], ...visibleSongs.map(s=>[s.title,s.artist,s.key,s.userBpm,s.year,s.publicSongListVisible?"Shown":"Hidden"])];
    const csv = rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="lyrics-song-list.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  document.addEventListener("click", async event => {
    const open = event.target.closest("[data-open]"); if (open) return openSong(open.dataset.open);
    const fav = event.target.closest("[data-fav]"); if (fav) { favourites.has(fav.dataset.fav) ? favourites.delete(fav.dataset.fav) : favourites.add(fav.dataset.fav); saveFavourites(); render(); return; }
    const vis = event.target.closest("[data-visibility]"); if (vis) { await db.collection("lyrics").doc(vis.dataset.visibility).set({ publicSongListVisible: vis.dataset.next === "true", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true }); return; }
    const letter = event.target.closest("[data-letter]"); if (letter && !letter.disabled) document.getElementById(`letter-${letter.dataset.letter === "#" ? "number" : letter.dataset.letter}`)?.scrollIntoView({behavior:"smooth",block:"start"});
  });

  Object.values(filters).forEach(el => el?.addEventListener(el.tagName === "INPUT" ? "input" : "change", render));
  $("stickyFavToggle").addEventListener("change", render);
  $("clearFiltersBtn").onclick = () => { filters.search.value=""; filters.artist.value=""; filters.key.value=""; filters.visibility.value=""; filters.content.value=""; filters.setlist.value=""; filters.sort.value="title"; render(); };
  $("refreshBtn").onclick = loadData; $("exportBtn").onclick = exportCSV;
  $("prevSongBtn").onclick = () => selectRelative(-1); $("nextSongBtn").onclick = () => selectRelative(1); $("playSelectedBtn").onclick = () => selectedIndex >= 0 && openSong(visibleSongs[selectedIndex].firebaseId);
  $("sidebarToggleBtn").onclick = () => { const collapsed = $("libraryShell").classList.toggle("sidebar-collapsed"); $("sidebarToggleBtn").setAttribute("aria-expanded", String(!collapsed)); localStorage.setItem("lyricsSidebarCollapsed", collapsed ? "1" : "0"); };
  if (localStorage.getItem("lyricsSidebarCollapsed") === "1") $("libraryShell").classList.add("sidebar-collapsed");
  loadData();
})();
