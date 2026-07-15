(() => {
  const $ = id => document.getElementById(id);

  let songs = [];
  let setlists = [];
  let visibleSongs = [];
  let selectedIndex = -1;
  let songsUnsub = null;
  let setlistsUnsub = null;

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
    setlist: $("setlistFilter")
  };

  function saveFavourites() {
    localStorage.setItem(
      "lyricsViewerFavourites",
      JSON.stringify([...favourites])
    );
  }

  function loadData() {
    $("songRows").innerHTML =
      '<div class="loading-state">Loading songs…</div>';

    if (songsUnsub) songsUnsub();
    if (setlistsUnsub) setlistsUnsub();

    songsUnsub = db.collection("lyrics").onSnapshot(snapshot => {
      songs = snapshot.docs.map(doc =>
        LyricsCommon.normalizeSong(doc.data(), doc.id)
      );

      populateFilters();
      render();
    }, showError);

    setlistsUnsub = db.collection("lyricsSetlists").onSnapshot(snapshot => {
      setlists = snapshot.docs.map(doc => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          ...data,
          songIds: Array.isArray(data.songIds) ? data.songIds : []
        };
      });

      populateSetlists();
      render();
    }, showError);
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
    const current = filters.setlist.value;

    const ordered = [...setlists].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );

    filters.setlist.innerHTML =
      '<option value="">All Setlists / Songs</option>' +
      ordered.map(setlist => `
        <option value="${LyricsCommon.escapeHTML(setlist.id)}">
          ${LyricsCommon.escapeHTML(setlist.name || "Untitled Setlist")}
          (${setlist.songIds.length})
        </option>
      `).join("");

    filters.setlist.value = current;
    $("statSetlists").textContent = setlists.length.toLocaleString();
  }

  function populateFilters() {
    const currentArtist = filters.artist.value;
    const currentKey = filters.key.value;

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

    filters.artist.value = currentArtist;
    filters.key.value = currentKey;
  }

  function filteredSongs() {
    const query = filters.search.value.toLowerCase().trim();
    const chosenSetlist = setlists.find(
      setlist => setlist.id === filters.setlist.value
    );
    const allowedIds = chosenSetlist
      ? new Set(chosenSetlist.songIds)
      : null;

    let list = songs.filter(song => {
      const matchesSearch =
        !query ||
        `${song.title} ${song.artist} ${song.key} ${song.year}`
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

      return matchesSearch &&
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
      row.className = "song-table-row";
      row.dataset.id = song.firebaseId;

      row.innerHTML = `
        <span class="song-number">${index + 1}</span>

        <button
          class="star-btn ${favourites.has(song.firebaseId) ? "active" : ""}"
          data-fav="${song.firebaseId}"
          type="button"
          title="Favourite">
          ${favourites.has(song.firebaseId) ? "★" : "☆"}
        </button>

        <button
          class="song-title-cell"
          data-open="${song.firebaseId}"
          type="button">
          <strong>${LyricsCommon.escapeHTML(song.title)}</strong>
          <small>${LyricsCommon.escapeHTML(song.artist)}</small>
        </button>

        <span class="song-artist-cell">
          ${LyricsCommon.escapeHTML(song.artist)}
        </span>

        <strong class="key-cell">
          ${LyricsCommon.escapeHTML(song.key || "—")}
        </strong>

        <span class="bpm-cell">
          ${LyricsCommon.escapeHTML(song.userBpm || "—")}
        </span>

        <span class="row-actions">
          <button
            class="row-play-btn"
            data-open="${song.firebaseId}"
            type="button"
            title="Play / Open song">
            ▶
          </button>

          <a
            class="row-edit-btn"
            href="lyricscreator.html?firebaseId=${encodeURIComponent(song.firebaseId)}"
            title="Edit song">
            ✎
          </a>
        </span>
      `;

      $("songRows").appendChild(row);
    });

    if (!visibleSongs.length) {
      $("songRows").innerHTML =
        '<div class="empty-state">No songs match the current filters.</div>';
    }

    renderAlphabetNav(groups);
    selectedIndex = Math.min(selectedIndex, visibleSongs.length - 1);
  }

  function openSong(id) {
    window.location.href = `lyricview.html?id=${encodeURIComponent(id)}`;
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

    $("selectedSongLabel").textContent =
      `${visibleSongs[selectedIndex].title} — ${visibleSongs[selectedIndex].artist}`;
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

  function syncSidebarButton() {
    const collapsed = $("libraryShell").classList.contains("sidebar-collapsed");
    const button = $("sidebarToggleBtn");

    button.setAttribute("aria-expanded", String(!collapsed));
    button.classList.toggle("active", !collapsed);
  }

  document.addEventListener("click", event => {
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

      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });

  Object.values(filters).forEach(element => {
    element?.addEventListener(
      element.tagName === "INPUT" ? "input" : "change",
      render
    );
  });

  $("stickyFavToggle").addEventListener("change", render);

  $("clearFiltersBtn").onclick = () => {
    filters.search.value = "";
    filters.artist.value = "";
    filters.key.value = "";
    filters.visibility.value = "";
    filters.content.value = "";
    filters.setlist.value = "";
    filters.sort.value = "title";
    render();
  };

  $("refreshBtn").onclick = loadData;
  $("exportBtn").onclick = exportCSV;
  $("prevSongBtn").onclick = () => selectRelative(-1);
  $("nextSongBtn").onclick = () => selectRelative(1);
  $("playSelectedBtn").onclick = () => {
    if (selectedIndex >= 0) {
      openSong(visibleSongs[selectedIndex].firebaseId);
    }
  };

  $("sidebarToggleBtn").onclick = () => {
    const collapsed = $("libraryShell").classList.toggle("sidebar-collapsed");
    localStorage.setItem(
      "lyricsSidebarCollapsed",
      collapsed ? "1" : "0"
    );
    syncSidebarButton();
  };

  if (localStorage.getItem("lyricsSidebarCollapsed") === "1") {
    $("libraryShell").classList.add("sidebar-collapsed");
  }

  syncSidebarButton();
  loadData();
})();
