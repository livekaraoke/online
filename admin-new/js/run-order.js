(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const db =
    window.db ||
    window.LK?.db ||
    (window.firebase?.firestore ? firebase.firestore() : null);

  if (!db) {
    console.error("run-order.js: Firestore unavailable.");
    return;
  }

  const RUN_ORDER_REF = db.collection("karaokeControl").doc("runOrder");

  let currentSessionId = "";
  let runOrder = { sessionId:"", items:[] };
  let lyricsSongs = [];
  let unsubRunOrder = null;

  function esc(value) {
    return String(value || "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }

  function uid(prefix = "q") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  }

  function normaliseItems(data) {
    return Array.isArray(data?.items) ? data.items.map(item => ({...item})) : [];
  }

  async function saveItems(items) {
    await RUN_ORDER_REF.set({
      sessionId: currentSessionId || runOrder.sessionId || "",
      items,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  function renderSongSelect() {
    const select = $("adminRunOrderSongSelect");
    if (!select) return;

    const current = select.value || "";
    select.innerHTML =
      `<option value="">Choose song to add…</option>` +
      lyricsSongs.map(song =>
        `<option value="${esc(song.id)}">${esc(song.title || song.id)}${song.artist ? ` — ${esc(song.artist)}` : ""}</option>`
      ).join("");

    if (lyricsSongs.some(song => song.id === current)) select.value = current;
  }

  function render() {
    const box = $("adminRunOrderList");
    if (!box) return;

    const items = normaliseItems(runOrder);
    if ($("adminRunOrderCount")) $("adminRunOrderCount").textContent = `(${items.length})`;

    if (!currentSessionId) {
      box.innerHTML = `<div class="dashboard-event-empty">Start a Performance Session to use Run Order.</div>`;
      return;
    }

    if (!items.length) {
      box.innerHTML = `<div class="dashboard-event-empty">Run Order is empty.</div>`;
      return;
    }

    box.innerHTML = items.map((item,index) => `
      <div class="admin-run-order-row ${item.status === "played" ? "played" : ""}">
        <div class="admin-run-order-index">${index + 1}</div>

        <div class="admin-run-order-main">
          <strong>${esc(item.songTitle || item.title || item.songId || "Untitled Song")}</strong>
          <small>${esc(item.artist || item.songArtist || "")}${item.status === "played" ? " • PLAYED" : ""}</small>
        </div>

        <div class="admin-run-order-singer">
          ${esc(item.singerName || (item.source === "manual" ? "Host choice" : "—"))}
        </div>

        <div class="admin-run-order-actions">
          <button type="button" data-run-up="${esc(item.id)}" title="Move up">↑</button>
          <button type="button" data-run-down="${esc(item.id)}" title="Move down">↓</button>
          <button type="button" class="remove" data-run-remove="${esc(item.id)}" title="Remove">✕</button>
        </div>
      </div>
    `).join("");
  }

  async function move(itemId, direction) {
    const items = normaliseItems(runOrder);
    const index = items.findIndex(item => item.id === itemId);
    if (index < 0) return;

    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    [items[index], items[target]] = [items[target], items[index]];
    await saveItems(items);
  }

  async function remove(itemId) {
    const items = normaliseItems(runOrder);
    const item = items.find(entry => entry.id === itemId);
    const next = items.filter(entry => entry.id !== itemId);

    await saveItems(next);

    if (item?.requestId) {
      await db.collection("publicSongRequests").doc(item.requestId).set({
        status: "left",
        removedFromRunOrderAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true }).catch(console.warn);
    }
  }

  async function addManualSong() {
    if (!currentSessionId) return;

    const select = $("adminRunOrderSongSelect");
    const songId = select?.value || "";
    const song = lyricsSongs.find(entry => entry.id === songId);
    if (!song) return;

    const items = normaliseItems(runOrder);
    items.push({
      id: uid("manual"),
      songId: song.id,
      songTitle: song.title || "",
      artist: song.artist || "",
      singerName: "",
      requestId: "",
      source: "manual",
      status: "queued",
      addedAtMs: Date.now()
    });

    await saveItems(items);
    select.value = "";
  }

  function listenCurrentSession() {
    db.collection("karaokeControl").doc("currentSession").onSnapshot(doc => {
      const data = doc.exists ? (doc.data() || {}) : {};
      currentSessionId = data.active === true
        ? (data.sessionId || data.activeSessionId || "")
        : "";

      render();
    });
  }

  function listenRunOrder() {
    if (unsubRunOrder) unsubRunOrder();

    unsubRunOrder = RUN_ORDER_REF.onSnapshot(doc => {
      runOrder = doc.exists
        ? { sessionId:"", items:[], ...(doc.data() || {}) }
        : { sessionId:"", items:[] };

      // Never show another session's order as the current session's order.
      if (
        currentSessionId &&
        runOrder.sessionId &&
        runOrder.sessionId !== currentSessionId
      ) {
        runOrder = { sessionId:currentSessionId, items:[] };
      }

      render();
    }, error => {
      console.warn("Run Order unavailable:", error);
    });
  }

  async function loadSongs() {
    try {
      const snap = await db.collection("lyrics").get();
      lyricsSongs = snap.docs
        .map(doc => ({ id:doc.id, ...(doc.data() || {}) }))
        .sort((a,b) =>
          String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity:"base" })
        );
      renderSongSelect();
    } catch (error) {
      console.warn("Could not load songs for Run Order:", error);
    }
  }

  function bind() {
    $("adminRunOrderAddBtn")?.addEventListener("click", addManualSong);

    document.addEventListener("click", event => {
      const up = event.target.closest("[data-run-up]");
      if (up) return move(up.dataset.runUp, -1);

      const down = event.target.closest("[data-run-down]");
      if (down) return move(down.dataset.runDown, 1);

      const removeBtn = event.target.closest("[data-run-remove]");
      if (removeBtn) return remove(removeBtn.dataset.runRemove);
    });
  }

  function init() {
    bind();
    listenCurrentSession();
    listenRunOrder();
    loadSongs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
