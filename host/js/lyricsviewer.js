(() => {
  const $ = id => document.getElementById(id);
  let songs = [];
  let selectedIndex = -1;
  const favourites = new Set(JSON.parse(localStorage.getItem("lyricsViewerFavourites") || "[]"));

  const filters = {
    search: $("searchInput"), artist: $("artistFilter"), key: $("keyFilter"),
    visibility: $("visibilityFilter"), content: $("contentFilter"), sort: $("sortSelect")
  };

  function saveFavourites() { localStorage.setItem("lyricsViewerFavourites", JSON.stringify([...favourites])); }

  function loadSongs() {
    $("songRows").innerHTML = '<div class="loading-state">Loading songs…</div>';
    db.collection("lyrics").onSnapshot(snapshot => {
      songs = snapshot.docs.map(doc => LyricsCommon.normalizeSong(doc.data(), doc.id));
      populateFilters();
      render();
    }, error => {
      console.error(error);
      $("songRows").innerHTML = `<div class="error-state">Could not load songs: ${LyricsCommon.escapeHTML(error.message)}</div>`;
    });
  }

  function populateFilters() {
    const currentArtist = filters.artist.value;
    const currentKey = filters.key.value;
    const artists = [...new Set(songs.map(s => s.artist).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const keys = [...new Set(songs.map(s => s.key).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    filters.artist.innerHTML = '<option value="">All Artists</option>' + artists.map(v=>`<option>${LyricsCommon.escapeHTML(v)}</option>`).join("");
    filters.key.innerHTML = '<option value="">All Keys</option>' + keys.map(v=>`<option>${LyricsCommon.escapeHTML(v)}</option>`).join("");
    filters.artist.value = currentArtist;
    filters.key.value = currentKey;
  }

  function filteredSongs() {
    const query = filters.search.value.toLowerCase().trim();
    let list = songs.filter(song => {
      const matchesSearch = !query || `${song.title} ${song.artist} ${song.key} ${song.year}`.toLowerCase().includes(query);
      const matchesArtist = !filters.artist.value || song.artist === filters.artist.value;
      const matchesKey = !filters.key.value || song.key === filters.key.value;
      const matchesVisibility = !filters.visibility.value || (filters.visibility.value === "shown" ? song.publicSongListVisible : !song.publicSongListVisible);
      const matchesContent = !filters.content.value || (filters.content.value === "tabs" ? LyricsCommon.hasTabs(song) : LyricsCommon.hasLyrics(song));
      return matchesSearch && matchesArtist && matchesKey && matchesVisibility && matchesContent;
    });
    if ($("stickyFavToggle").checked) list.sort((a,b)=>Number(favourites.has(b.firebaseId))-Number(favourites.has(a.firebaseId)) || a.title.localeCompare(b.title));
    else if (filters.sort.value === "artist") list.sort((a,b)=>a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
    else if (filters.sort.value === "recent") list.sort((a,b)=>(LyricsCommon.toDate(b.updatedAt)?.getTime()||0)-(LyricsCommon.toDate(a.updatedAt)?.getTime()||0));
    else if (filters.sort.value === "bpm") list.sort((a,b)=>(Number(a.userBpm)||9999)-(Number(b.userBpm)||9999));
    else list.sort((a,b)=>a.title.localeCompare(b.title));
    return list;
  }

  function render() {
    const list = filteredSongs();
    $("resultCount").textContent = list.length.toLocaleString();
    $("statTotal").textContent = songs.length.toLocaleString();
    $("statFavs").textContent = favourites.size.toLocaleString();
    $("statPublic").textContent = songs.filter(s=>s.publicSongListVisible).length.toLocaleString();
    const latest = songs.map(s=>LyricsCommon.toDate(s.updatedAt || s.createdAt)).filter(Boolean).sort((a,b)=>b-a)[0];
    $("statUpdated").textContent = latest ? latest.toLocaleDateString() : "—";
    $("songRows").innerHTML = "";

    let lastGroup = null;
    list.forEach((song, index) => {
      const first = song.title.trim().charAt(0).toUpperCase();
      const group = /[A-Z]/.test(first) ? first : "0–9";
      if (group !== lastGroup) {
        const header = document.createElement("div"); header.className = "letter-row"; header.textContent = group; $("songRows").appendChild(header); lastGroup = group;
      }
      const row = document.createElement("div");
      row.className = "song-table-row";
      row.dataset.id = song.firebaseId;
      row.innerHTML = `
        <span>${index + 1}</span>
        <button class="star-btn ${favourites.has(song.firebaseId)?"active":""}" data-fav="${song.firebaseId}" type="button">${favourites.has(song.firebaseId)?"★":"☆"}</button>
        <button class="song-title-cell" data-open="${song.firebaseId}" type="button"><strong>${LyricsCommon.escapeHTML(song.title)}</strong><small>${LyricsCommon.escapeHTML(song.artist)}</small></button>
        <span>${LyricsCommon.escapeHTML(song.artist)}</span>
        <strong class="key-cell">${LyricsCommon.escapeHTML(song.key || "—")}</strong>
        <span>${LyricsCommon.escapeHTML(song.userBpm || "—")}</span>
        <span><span class="public-badge ${song.publicSongListVisible?"shown":"hidden-status"}">${song.publicSongListVisible?"SONG LIST":"NOT SHOWN"}</span></span>
        <span class="row-actions"><button data-open="${song.firebaseId}" title="Open">▷</button><a href="lyricscreator.html?firebaseId=${encodeURIComponent(song.firebaseId)}" title="Edit">▧</a><button data-menu="${song.firebaseId}" title="More">⋮</button></span>`;
      $("songRows").appendChild(row);
    });
    if (!list.length) $("songRows").innerHTML = '<div class="empty-state">No songs match the current filters.</div>';
  }

  function openSong(id) { window.location.href = `lyricview.html?id=${encodeURIComponent(id)}`; }

  document.addEventListener("click", event => {
    const open = event.target.closest("[data-open]"); if (open) { openSong(open.dataset.open); return; }
    const fav = event.target.closest("[data-fav]"); if (fav) { const id=fav.dataset.fav; favourites.has(id)?favourites.delete(id):favourites.add(id); saveFavourites(); render(); return; }
    const menu = event.target.closest("[data-menu]"); if (menu) { selectedIndex = filteredSongs().findIndex(s=>s.firebaseId===menu.dataset.menu); $("selectedSongLabel").textContent = selectedIndex>=0 ? `${filteredSongs()[selectedIndex].title} — ${filteredSongs()[selectedIndex].artist}` : "Select a song"; }
  });

  Object.values(filters).forEach(el => el?.addEventListener(el.tagName === "INPUT" ? "input" : "change", render));
  $("stickyFavToggle").addEventListener("change", render);
  $("clearFiltersBtn").onclick = () => { filters.search.value=""; filters.artist.value=""; filters.key.value=""; filters.visibility.value=""; filters.content.value=""; filters.sort.value="title"; render(); };
  $("refreshBtn").onclick = loadSongs;
  $("playSelectedBtn").onclick = () => { const list=filteredSongs(); if (selectedIndex<0 && list.length) selectedIndex=0; if (list[selectedIndex]) openSong(list[selectedIndex].firebaseId); };
  $("prevSongBtn").onclick = () => { const list=filteredSongs(); if (!list.length) return; selectedIndex=(selectedIndex-1+list.length)%list.length; $("selectedSongLabel").textContent=`${list[selectedIndex].title} — ${list[selectedIndex].artist}`; };
  $("nextSongBtn").onclick = () => { const list=filteredSongs(); if (!list.length) return; selectedIndex=(selectedIndex+1)%list.length; $("selectedSongLabel").textContent=`${list[selectedIndex].title} — ${list[selectedIndex].artist}`; };
  $("exportBtn").onclick = () => { const rows = filteredSongs().map(s=>[s.title,s.artist,s.key,s.userBpm,s.publicSongListVisible?"SONG LIST":"NOT SHOWN"].map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(",")); const blob=new Blob([["Title,Artist,Key,BPM,Public List",...rows].join("\n")],{type:"text/csv"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="lyrics-song-list.csv"; a.click(); URL.revokeObjectURL(a.href); };
  loadSongs();
})();
