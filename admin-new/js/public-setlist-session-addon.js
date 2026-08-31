(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const PUBLIC_LIST_DOC = db.collection("karaokeControl").doc("publicSongList");
  let publicSetlists = [];
  let currentPublicSetlistId = "";
  let currentSessionIdFromControl = "";

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setPublicListStatus(text, error = false) {
    const el = $("publicSetlistSaveStatus");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = error ? "#ff6d72" : "#6fbd79";
  }

  function populatePublicSetlistSelect() {
    const select = $("publicSetlistSelect");
    if (!select) return;

    select.innerHTML =
      `<option value="">Choose public setlist...</option>` +
      publicSetlists.map(setlist =>
        `<option value="${esc(setlist.id)}">${esc(setlist.name || "Untitled Setlist")} (${setlist.songIds.length})</option>`
      ).join("");

    if (
      currentPublicSetlistId &&
      [...select.options].some(option => option.value === currentPublicSetlistId)
    ) {
      select.value = currentPublicSetlistId;
    } else {
      select.value = "";
    }
  }

  function listenForSetlists() {
    db.collection("lyricsSetlists").onSnapshot(snapshot => {
      publicSetlists = snapshot.docs
        .map(doc => {
          const data = doc.data() || {};
          return {
            id: doc.id,
            name: data.name || "Untitled Setlist",
            songIds: Array.isArray(data.songIds) ? data.songIds : []
          };
        })
        .sort((a, b) =>
          String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" })
        );

      populatePublicSetlistSelect();
    }, error => {
      console.error("Could not load Lyrics Suite setlists:", error);
      const select = $("publicSetlistSelect");
      if (select) select.innerHTML = `<option value="">Could not load setlists</option>`;
      setPublicListStatus("Setlists unavailable", true);
    });
  }

  function listenForCurrentPublicList() {
    PUBLIC_LIST_DOC.onSnapshot(doc => {
      const data = doc.exists ? (doc.data() || {}) : {};
      currentPublicSetlistId = data.setlistId || "";

      populatePublicSetlistSelect();

      if (data.setlistName) {
        setPublicListStatus(`Current: ${data.setlistName}`);
      } else if (!currentPublicSetlistId) {
        setPublicListStatus("No setlist selected");
      }
    }, error => {
      console.error("Could not read selected public setlist:", error);
    });
  }

  async function savePublicSetlistSelection() {
    const select = $("publicSetlistSelect");
    if (!select) return;

    const id = select.value || "";
    const setlist = publicSetlists.find(item => item.id === id) || null;

    select.disabled = true;
    setPublicListStatus("Saving...");

    try {
      await PUBLIC_LIST_DOC.set({
        setlistId: setlist?.id || "",
        setlistName: setlist?.name || "",
        songCount: setlist?.songIds?.length || 0,
        source: "lyricsSetlists",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Mirror the selected name/id into karaoke/state so any older dashboards
      // already listening to this state can also see it.
      await db.collection("karaoke").doc("state").set({
        publicSongListSetlistId: setlist?.id || "",
        publicSongListSetlistName: setlist?.name || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      setPublicListStatus(setlist ? `Current: ${setlist.name}` : "No setlist selected");
      if (typeof window.logAdmin === "function") {
        window.logAdmin(
          setlist
            ? `Public Song List changed to setlist: ${setlist.name}`
            : "Public Song List setlist cleared"
        );
      }
    } catch (error) {
      console.error("Could not save public setlist:", error);
      setPublicListStatus(error.message || "Could not save", true);
    } finally {
      select.disabled = false;
    }
  }

  function listenCurrentSessionType() {
    db.collection("karaokeControl").doc("currentSession").onSnapshot(doc => {
      const data = doc.exists ? (doc.data() || {}) : {};
      currentSessionIdFromControl = data.sessionId || data.activeSessionId || "";

      const type = data.sessionType || data.type || "Live Karaoke";

      if ($("sessionTypeLabel")) $("sessionTypeLabel").textContent = type;
      if ($("sessionTypeInput") && !data.active && !data.activeSessionId) {
        $("sessionTypeInput").value = type || "Live Karaoke";
      }

      // When the existing session code reveals setup fields for editing,
      // keep the Type dropdown synchronized with the active session.
      if ($("sessionTypeInput") && currentSessionIdFromControl) {
        $("sessionTypeInput").value = type;
      }
    });
  }

  async function saveActiveSessionType() {
    const type = $("sessionTypeInput")?.value || "Live Karaoke";
    if (!currentSessionIdFromControl) return;

    try {
      await db.collection("performanceSessions").doc(currentSessionIdFromControl).set({
        type,
        sessionType: type,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await db.collection("karaokeControl").doc("currentSession").set({
        type,
        sessionType: type,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      if ($("sessionTypeLabel")) $("sessionTypeLabel").textContent = type;
    } catch (error) {
      console.error("Could not update active session type:", error);
    }
  }

  function wrapStartPerformance() {
    if (typeof window.startPerformance !== "function") return;
    if (window.startPerformance.__sessionTypeWrapped) return;

    const originalStart = window.startPerformance;

    const wrapped = async function (...args) {
      const type = $("sessionTypeInput")?.value || "Live Karaoke";

      const result = await originalStart.apply(this, args);

      try {
        const snap = await db.collection("karaokeControl").doc("currentSession").get();
        const data = snap.exists ? (snap.data() || {}) : {};
        const sessionId = data.sessionId || data.activeSessionId || "";

        await db.collection("karaokeControl").doc("currentSession").set({
          type,
          sessionType: type,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (sessionId) {
          await db.collection("performanceSessions").doc(sessionId).set({
            type,
            sessionType: type,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }

        if ($("sessionTypeLabel")) $("sessionTypeLabel").textContent = type;
      } catch (error) {
        console.error("Session started, but TYPE could not be stored:", error);
      }

      return result;
    };

    wrapped.__sessionTypeWrapped = true;
    window.startPerformance = wrapped;
  }

  function init() {
    $("publicSetlistSelect")?.addEventListener("change", savePublicSetlistSelection);
    $("sessionTypeInput")?.addEventListener("change", saveActiveSessionType);

    listenForSetlists();
    listenForCurrentPublicList();
    listenCurrentSessionType();

    // Existing admin JS files are loaded before this addon.
    wrapStartPerformance();
    setTimeout(wrapStartPerformance, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
