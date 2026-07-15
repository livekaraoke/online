(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  let songs = [];
  let setlists = [];
  let current = null;
  let songOrder = [];
  let lyricsUnsubscribe = null;
  let setlistsUnsubscribe = null;
  let editorStarted = false;

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeSong(data, id) {
    return {
      firebaseId: id,
      title: String(data?.title || "Untitled").trim(),
      artist: String(data?.artist || "").trim(),
      year: String(data?.year || "").trim()
    };
  }

  function showEditorMessage(message, isError = false) {
    const el = $("setlistEditorMessage");
    if (!el) return;
    el.textContent = message || "";
    el.style.color = isError ? "#ff6268" : "#f4c544";
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText || "WORKING...";
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function showAuthGate(show) {
    $("setlistAuthGate")?.classList.toggle("hidden", !show);
  }

  function updateAuthUi(user) {
    const state = $("setlistAuthState");
    const logout = $("setlistLogoutBtn");
    const newButton = $("newSetlistBtn");

    if (user) {
      if (state) state.textContent = `● ${user.email || "SIGNED IN"}`;
      logout?.classList.remove("hidden");
      if (newButton) newButton.disabled = false;
    } else {
      if (state) state.textContent = "NOT SIGNED IN";
      logout?.classList.add("hidden");
      if (newButton) newButton.disabled = true;
    }
  }

  async function login() {
    const email = $("setlistEmailInput")?.value.trim() || "";
    const password = $("setlistPasswordInput")?.value || "";
    const error = $("setlistAuthError");
    const button = $("setlistLoginBtn");

    if (!email || !password) {
      if (error) error.textContent = "Enter your email and password.";
      return;
    }

    if (error) error.textContent = "Signing in...";
    setBusy(button, true, "SIGNING IN...");

    try {
      await auth.signInWithEmailAndPassword(email, password);
      if (error) error.textContent = "";
    } catch (err) {
      console.error("Setlist login failed:", err);
      if (error) error.textContent = err.message || "Could not sign in.";
    } finally {
      setBusy(button, false);
    }
  }

  async function logout() {
    await auth.signOut();
  }

  function startEditorListeners() {
    if (editorStarted) return;
    editorStarted = true;

    lyricsUnsubscribe = db.collection("lyrics").onSnapshot(snapshot => {
      songs = snapshot.docs
        .map(doc => normalizeSong(doc.data(), doc.id))
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      renderEditor();
    }, handleFirestoreError);

    setlistsUnsubscribe = db.collection("lyricsSetlists").onSnapshot(snapshot => {
      setlists = snapshot.docs.map(doc => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          ...data,
          songIds: Array.isArray(data.songIds) ? data.songIds : []
        };
      }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));

      if (current) {
        current = setlists.find(item => item.id === current.id) || null;
        if (!current) songOrder = [];
      }

      renderList();
      renderEditor();
    }, handleFirestoreError);
  }

  function stopEditorListeners() {
    if (lyricsUnsubscribe) lyricsUnsubscribe();
    if (setlistsUnsubscribe) setlistsUnsubscribe();
    lyricsUnsubscribe = null;
    setlistsUnsubscribe = null;
    editorStarted = false;
    songs = [];
    setlists = [];
    current = null;
    songOrder = [];
    renderList();
    renderEditor();
  }

  function handleFirestoreError(error) {
    console.error("Setlist Firestore error:", error);
    showEditorMessage(
      error?.code === "permission-denied"
        ? "Firebase denied access. Confirm this page is signed in and that the lyricsSetlists rule has been published."
        : (error?.message || "Could not load Firebase data."),
      true
    );
  }

  function renderList() {
    if ($("setlistCount")) $("setlistCount").textContent = String(setlists.length);

    const list = $("setlistList");
    if (!list) return;

    list.innerHTML = setlists.length
      ? setlists.map(setlist => `
          <button class="setlist-list-item ${current?.id === setlist.id ? "active" : ""}" data-select="${esc(setlist.id)}" type="button">
            <strong>${esc(setlist.name || "Untitled Setlist")}</strong>
            <span>${setlist.songIds.length} songs</span>
          </button>
        `).join("")
      : '<div class="empty-state">No setlists yet.</div>';
  }

  function renderEditor() {
    const empty = $("setlistEmpty");
    const editor = $("setlistEditor");

    empty?.classList.toggle("hidden", !!current);
    editor?.classList.toggle("hidden", !current);

    if (!current) return;

    if (!songOrder.length || songOrder.join("|") !== current.songIds.join("|")) {
      songOrder = [...current.songIds];
    }

    $("setlistNameInput").value = current.name || "";
    $("setlistNotesInput").value = current.notes || "";
    $("selectedSongCount").textContent = String(songOrder.length);

    $("selectedSongs").innerHTML = songOrder.map(id => {
      const song = songs.find(item => item.firebaseId === id);
      if (!song) return "";

      return `
        <div class="setlist-song-row" draggable="true" data-id="${esc(id)}">
          <span class="drag" title="Drag to reorder">☰</span>
          <div>
            <strong>${esc(song.title)}</strong>
            <small>${esc(song.artist)}${song.year ? ` · ${esc(song.year)}` : ""}</small>
          </div>
          <button data-up="${esc(id)}" type="button" title="Move up">↑</button>
          <button data-down="${esc(id)}" type="button" title="Move down">↓</button>
          <button data-remove="${esc(id)}" type="button" title="Remove from setlist">×</button>
        </div>
      `;
    }).join("") || '<div class="empty-state">No songs in this setlist.</div>';

    renderAvailable();
    enableDrag();
  }

  function renderAvailable() {
    if (!current) return;

    const query = $("availableSearch")?.value.toLowerCase().trim() || "";
    const selected = new Set(songOrder);
    const available = songs.filter(song => {
      if (selected.has(song.firebaseId)) return false;
      return !query || `${song.title} ${song.artist} ${song.year}`.toLowerCase().includes(query);
    });

    $("availableSongs").innerHTML = available.map(song => `
      <div class="setlist-song-row">
        <div>
          <strong>${esc(song.title)}</strong>
          <small>${esc(song.artist)}${song.year ? ` · ${esc(song.year)}` : ""}</small>
        </div>
        <button data-add="${esc(song.firebaseId)}" type="button" title="Add to setlist">＋</button>
      </div>
    `).join("") || '<div class="empty-state">No available songs.</div>';
  }

  async function createNewSetlist() {
    const user = auth.currentUser;
    const button = $("newSetlistBtn");

    if (!user) {
      showAuthGate(true);
      $("setlistAuthError").textContent = "Sign in before creating a setlist.";
      return;
    }

    setBusy(button, true, "CREATING...");
    showEditorMessage("Creating setlist...");

    try {
      const ref = await db.collection("lyricsSetlists").add({
        name: "New Setlist",
        notes: "",
        songIds: [],
        createdBy: user.uid,
        createdByEmail: user.email || "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      current = {
        id: ref.id,
        name: "New Setlist",
        notes: "",
        songIds: []
      };
      songOrder = [];
      renderList();
      renderEditor();
      showEditorMessage("New setlist created. Rename it and press SAVE SETLIST.");
      $("setlistNameInput")?.focus();
      $("setlistNameInput")?.select();
    } catch (error) {
      console.error("Could not create setlist:", error);
      showEditorMessage(
        error?.code === "permission-denied"
          ? "Permission denied. This page is signed in, but the published Firebase rule does not allow this account to write lyricsSetlists."
          : (error?.message || "Could not create the setlist."),
        true
      );
    } finally {
      setBusy(button, false);
    }
  }

  async function saveCurrentSetlist() {
    if (!current) return;
    if (!auth.currentUser) {
      showAuthGate(true);
      return;
    }

    const name = $("setlistNameInput")?.value.trim() || "";
    if (!name) {
      showEditorMessage("Enter a setlist name.", true);
      return;
    }

    const button = $("saveSetlistBtn");
    setBusy(button, true, "SAVING...");

    try {
      await db.collection("lyricsSetlists").doc(current.id).set({
        name,
        notes: $("setlistNotesInput")?.value || "",
        songIds: [...songOrder],
        updatedBy: auth.currentUser.uid,
        updatedByEmail: auth.currentUser.email || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      current = { ...current, name, notes: $("setlistNotesInput")?.value || "", songIds: [...songOrder] };
      showEditorMessage("Setlist saved.");
    } catch (error) {
      console.error("Could not save setlist:", error);
      showEditorMessage(error?.message || "Could not save the setlist.", true);
    } finally {
      setBusy(button, false);
    }
  }

  async function deleteCurrentSetlist() {
    if (!current || !auth.currentUser) return;
    if (!confirm(`Delete ${current.name || "this setlist"}?`)) return;

    const button = $("deleteSetlistBtn");
    setBusy(button, true, "DELETING...");

    try {
      await db.collection("lyricsSetlists").doc(current.id).delete();
      current = null;
      songOrder = [];
      renderEditor();
      showEditorMessage("");
    } catch (error) {
      console.error("Could not delete setlist:", error);
      showEditorMessage(error?.message || "Could not delete the setlist.", true);
    } finally {
      setBusy(button, false);
    }
  }

  function enableDrag() {
    let dragged = null;

    document.querySelectorAll("#selectedSongs .setlist-song-row").forEach(row => {
      row.addEventListener("dragstart", () => {
        dragged = row;
        row.classList.add("dragging");
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        dragged = null;
        songOrder = [...document.querySelectorAll("#selectedSongs .setlist-song-row")]
          .map(item => item.dataset.id);
        current = { ...current, songIds: [...songOrder] };
        renderEditor();
      });

      row.addEventListener("dragover", event => {
        event.preventDefault();
        if (!dragged || dragged === row) return;
        const rect = row.getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) row.after(dragged);
        else row.before(dragged);
      });
    });
  }

  document.addEventListener("click", event => {
    const select = event.target.closest("[data-select]");
    if (select) {
      current = setlists.find(item => item.id === select.dataset.select) || null;
      songOrder = [...(current?.songIds || [])];
      renderList();
      renderEditor();
      showEditorMessage("");
      return;
    }

    const add = event.target.closest("[data-add]");
    if (add) {
      if (!songOrder.includes(add.dataset.add)) songOrder.push(add.dataset.add);
      current = { ...current, songIds: [...songOrder] };
      renderEditor();
      return;
    }

    const remove = event.target.closest("[data-remove]");
    if (remove) {
      songOrder = songOrder.filter(id => id !== remove.dataset.remove);
      current = { ...current, songIds: [...songOrder] };
      renderEditor();
      return;
    }

    const up = event.target.closest("[data-up]");
    const down = event.target.closest("[data-down]");
    const moveButton = up || down;

    if (moveButton) {
      const id = moveButton.dataset.up || moveButton.dataset.down;
      const index = songOrder.indexOf(id);
      const targetIndex = index + (up ? -1 : 1);

      if (targetIndex >= 0 && targetIndex < songOrder.length) {
        [songOrder[index], songOrder[targetIndex]] = [songOrder[targetIndex], songOrder[index]];
        current = { ...current, songIds: [...songOrder] };
        renderEditor();
      }
    }
  });

  $("setlistLoginBtn")?.addEventListener("click", login);
  $("setlistLogoutBtn")?.addEventListener("click", logout);
  $("newSetlistBtn")?.addEventListener("click", createNewSetlist);
  $("saveSetlistBtn")?.addEventListener("click", saveCurrentSetlist);
  $("deleteSetlistBtn")?.addEventListener("click", deleteCurrentSetlist);
  $("availableSearch")?.addEventListener("input", renderAvailable);

  $("setlistPasswordInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") login();
  });

  auth.onAuthStateChanged(user => {
    updateAuthUi(user);

    if (user) {
      showAuthGate(false);
      $("setlistAuthError").textContent = "";
      startEditorListeners();
    } else {
      stopEditorListeners();
      showAuthGate(true);
      if ($("setlistEmpty")) {
        $("setlistEmpty").textContent = "Sign in, then select a setlist or create a new one.";
      }
    }
  });
})();
