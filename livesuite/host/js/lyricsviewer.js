(() => {
  const $ = id => document.getElementById(id);

  let songs = [];
  let setlists = [];
  let visibleSongs = [];
  let selectedIndex = -1;
  let nextRunOrderItem = null;
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
        window.scrollTo({
          top: Number(restoredState.scrollY) || 0,
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

    // The song library is large and does not need a permanent realtime listener.
    // One-time reads avoid re-reading the entire collection whenever a listener
    // reconnects, which can consume Firestore daily read quota very quickly.
    Promise.all([
      db.collection("lyrics").get(),
      db.collection("lyricsSetlists").get()
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
      '<option value="">All Setlists / Songs</option>' +
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

  function updateRunOrderPlayer(items) {
    nextRunOrderItem = chooseNextRunOrderItem(items);

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
    render();
    saveViewState();
  };

  $("refreshBtn").onclick = loadData;
  $("exportBtn").onclick = exportCSV;
  $("playSelectedBtn").onclick = () => {
    if (!nextRunOrderItem?.songId) return;

    saveViewState();

    const params = new URLSearchParams();
    params.set("id", nextRunOrderItem.songId);

    if (nextRunOrderItem.requestId) {
      params.set("requestId", nextRunOrderItem.requestId);
    }

    location.href = `lyricview.html?${params.toString()}`;
  };

  $("openRunOrderBtn").onclick = openRunOrderPanel;

  window.addEventListener("lk:runorder-updated", event => {
    updateRunOrderPlayer(event.detail?.items || []);
  });

  $("sidebarToggleBtn").onclick = () => {
    $("libraryShell").classList.toggle("sidebar-collapsed");
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
