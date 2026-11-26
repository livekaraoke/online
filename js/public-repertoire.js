(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  if (!window.firebase || !$("newSongsToggle")) return;

  const config = window.LKFirebaseProjects?.getSelectedConfig?.() || window.LK_FIREBASE_CONFIG;
  if (!firebase.apps.length) firebase.initializeApp(config);
  const productionApp = firebase.app();
  const db = firebase.firestore();

  if (productionApp.options.projectId !== "livekaraokesuite") {
    console.error("Unexpected public Firebase project:", productionApp.options.projectId);
  }

  function cleanNote(value) {
    return String(value || "").trim().slice(0, 200);
  }

  async function readDefaultCatalogue() {
    try {
      if (window.LK_PUBLIC_CATALOGUE_V1?.["live-karaoke"] && window.LKPublicCatalogue) {
        const projected = await window.LKPublicCatalogue.load(db, "live-karaoke");
        if (projected?.setlist && Array.isArray(projected.setlist.newSongIds)) return projected;
      }
    } catch (error) {
      console.info("Projected NEW songs unavailable; using the existing repertoire source.", error);
    }

    const control = db.collection("karaokeControl");
    const [settingsSnap, publicListSnap] = await Promise.all([
      control.doc("liveKaraokeWebsiteSettings").get(),
      control.doc("publicSongList").get()
    ]);
    const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    const fallback = publicListSnap.exists ? (publicListSnap.data() || {}) : {};
    const setlistId = String(settings.defaultBrowseSetlistId || fallback.setlistId || "").trim();
    if (!setlistId) return { songs: [], setlist: null };

    const setlistSnap = await db.collection("lyricsSetlists").doc(setlistId).get();
    if (!setlistSnap.exists) return { songs: [], setlist: null };
    const setlist = { ...(setlistSnap.data() || {}), id: setlistSnap.id };
    const songIds = Array.isArray(setlist.songIds) ? setlist.songIds.map(String) : [];
    const newIds = new Set((Array.isArray(setlist.newSongIds) ? setlist.newSongIds : []).map(String));
    const ids = songIds.filter(id => newIds.has(id));

    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
    const snapshots = await Promise.all(chunks.map(chunk =>
      db.collection("lyrics")
        .where(firebase.firestore.FieldPath.documentId(), "in", chunk)
        .get()
    ));
    const byId = new Map();
    snapshots.forEach(group => group.docs.forEach(doc => {
      byId.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
    }));

    return { setlist, songs: ids.map(id => byId.get(id)).filter(Boolean) };
  }

  function renderNewSongs(result) {
    const setlist = result?.setlist || {};
    const notes = setlist.newSongNotes && typeof setlist.newSongNotes === "object"
      ? setlist.newSongNotes : {};
    const songs = Array.isArray(result?.songs) ? result.songs : [];

    $("newSongsCount").textContent = "• " + songs.length;
    const list = $("newSongsList");
    list.replaceChildren();

    if (!songs.length) {
      const empty = document.createElement("p");
      empty.className = "lk-new-songs-empty";
      empty.textContent = "No songs are currently marked NEW.";
      list.appendChild(empty);
      return;
    }

    songs.forEach(song => {
      const row = document.createElement("p");
      row.className = "lk-new-song-row";
      const artist = String(song.artist || song.songArtist || "").trim();
      row.append(document.createTextNode('🎵 "'));
      const title = document.createElement("strong");
      title.className = "lk-new-song-title";
      title.textContent = String(song.title || "Untitled");
      row.append(title, document.createTextNode('"' + (artist ? " by " + artist : "")));
      const note = cleanNote(notes[String(song.id)]);
      if (note) {
        row.append(document.createTextNode(" ("));
        const italic = document.createElement("span");
        italic.className = "lk-new-song-note";
        italic.textContent = note;
        row.append(italic, document.createTextNode(")"));
      }
      list.appendChild(row);
    });
  }

  async function refreshNewSongs() {
    try {
      renderNewSongs(await readDefaultCatalogue());
    } catch (error) {
      console.warn("Could not load NEW songs.", error);
      $("newSongsCount").textContent = "• 0";
      $("newSongsList").innerHTML =
        '<p class="lk-new-songs-empty">New songs are temporarily unavailable.</p>';
    }
  }

  $("newSongsToggle").addEventListener("click", () => {
    const panel = $("newSongsPanel");
    const isOpen = $("newSongsToggle").getAttribute("aria-expanded") === "true";
    $("newSongsToggle").setAttribute("aria-expanded", String(!isOpen));
    panel.hidden = isOpen;
  });

  const dialog = $("suggestSongDialog");

  function fitDialogToVisibleViewport() {
    if (!dialog) return;
    const vv = window.visualViewport;
    if (!vv) {
      dialog.style.removeProperty("--suggest-dialog-center");
      dialog.style.removeProperty("--suggest-dialog-max-height");
      return;
    }
    dialog.style.setProperty("--suggest-dialog-center", (vv.offsetTop + vv.height / 2) + "px");
    dialog.style.setProperty("--suggest-dialog-max-height", Math.max(280, vv.height - 20) + "px");
  }

  window.visualViewport?.addEventListener("resize", fitDialogToVisibleViewport);
  window.visualViewport?.addEventListener("scroll", fitDialogToVisibleViewport);

  dialog.addEventListener("close", () => {
    dialog.style.removeProperty("--suggest-dialog-center");
    dialog.style.removeProperty("--suggest-dialog-max-height");
    resetSuggestionDialog();
  });

  $("suggestSongForm").addEventListener("focusin", event => {
    fitDialogToVisibleViewport();
    setTimeout(() => {
      event.target?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }, 120);
  });

  function resetSuggestionDialog() {
    dialog.classList.remove("is-success");
    $("suggestSongSuccess").hidden = true;
    $("suggestSongHeading").textContent = "SUGGEST A SONG";
    $("suggestSongStatus").textContent = "";
  }

  function closeSuggestionDialog() {
    if (dialog.close) dialog.close();
    else dialog.removeAttribute("open");
  }

  $("suggestSongBtn").addEventListener("click", () => {
    resetSuggestionDialog();
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    fitDialogToVisibleViewport();
    setTimeout(() => {
      fitDialogToVisibleViewport();
      $("suggestSongName")?.focus();
    }, 0);
  });
  $("closeSuggestSongBtn").addEventListener("click", closeSuggestionDialog);
  $("closeSuggestSongSuccessBtn").addEventListener("click", closeSuggestionDialog);
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    closeSuggestionDialog();
  });

  $("suggestSongForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String($("suggestSongName").value || "").trim();
    const artist = String($("suggestSongArtist").value || "").trim();
    const note = String($("suggestSongNote").value || "").trim();
    const status = $("suggestSongStatus");
    const button = $("submitSuggestSongBtn");

    if (!title) {
      status.textContent = "Enter the song name.";
      $("suggestSongName").focus();
      return;
    }

    button.disabled = true;
    status.textContent = "Sending…";
    try {
      await db.collection("websiteSongSuggestions").add({
        title: title.slice(0, 160),
        artist: artist.slice(0, 160),
        note: note.slice(0, 500),
        status: "pending",
        source: "livekaraoke-homepage",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      form.reset();
      document.activeElement?.blur?.();
      status.textContent = "";
      $("suggestSongHeading").textContent = "SUGGESTION SENT!";
      $("suggestSongSuccess").hidden = false;
      dialog.classList.add("is-success");
      fitDialogToVisibleViewport();
    } catch (error) {
      console.error("Song suggestion failed", {
        code: error?.code || "",
        message: error?.message || "",
        projectId: productionApp?.options?.projectId || ""
      });

      const code = String(error?.code || "unknown").replace(/^firestore\//, "");
      const detail = String(error?.message || "")
        .replace(/^FirebaseError:\s*/i, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
      status.textContent =
        "Could not send your suggestion (" + code + ")" +
        (detail ? ": " + detail : ".") +
        " Please try again.";
    } finally {
      button.disabled = false;
    }
  });

  refreshNewSongs();
})();