(() => {
  "use strict";

  window.LK = window.LK || {};
  LK.sessionTools = LK.sessionTools || {};

  const state = {
    db: null,
    sessionId: "",
    session: null,
    currentControl: null,
    requests: [],
    runOrder: { sessionId:"", items:[] },
    songs: [],
    globalUnsubs: [],
    sessionUnsubs: [],
    uiBound: false
  };

  const $ = id => document.getElementById(id);

  function dbRef() {
    return (
      window.LK?.db ||
      window.db ||
      (window.firebase?.firestore ? firebase.firestore() : null)
    );
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }

  function tsDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatClock(date) {
    if (!date) return "-";
    return date.toLocaleTimeString(undefined, {
      hour:"2-digit",
      minute:"2-digit",
      hour12:false
    });
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms)) return "-";
    if (ms <= 0) return "0 mins";

    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours && minutes) return `${hours}hr${hours === 1 ? "" : "s"} ${minutes}mins`;
    if (hours) return `${hours}hr${hours === 1 ? "" : "s"}`;
    return `${minutes}mins`;
  }

  function scheduledDurationMs() {
    const explicit = Number(
      state.session?.scheduledDurationMs ??
      state.currentControl?.scheduledDurationMs
    );

    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const start = tsDate(
      state.session?.scheduledStartAt ||
      state.currentControl?.scheduledStartAt
    );
    const end = tsDate(
      state.session?.scheduledEndAt ||
      state.currentControl?.scheduledEndAt
    );

    if (start && end && end > start) return end - start;
    return null;
  }

  function actualStartDate() {
    return tsDate(
      state.session?.actualStartedAt ||
      state.session?.startedAt ||
      state.currentControl?.startedAt
    );
  }

  function renderRemaining() {
    const remainingEl = $("tsRemainingTime");
    const windowEl = $("tsScheduledWindow");
    if (!remainingEl || !windowEl) return;

    if (!state.sessionId || !state.session) {
      remainingEl.textContent = "-";
      windowEl.textContent = "No active session";
      return;
    }

    const duration = scheduledDurationMs();
    const actualStart = actualStartDate();

    const scheduledStart = tsDate(state.session.scheduledStartAt);
    const scheduledEnd = tsDate(state.session.scheduledEndAt);

    windowEl.textContent =
      scheduledStart && scheduledEnd
        ? `Scheduled ${formatClock(scheduledStart)}–${formatClock(scheduledEnd)}`
        : "No scheduled time";

    if (!duration || !actualStart) {
      remainingEl.textContent = "-";
      return;
    }

    const target = actualStart.getTime() + duration;
    const remaining = target - Date.now();

    remainingEl.textContent =
      remaining > 0
        ? formatDuration(remaining)
        : `Over ${formatDuration(Math.abs(remaining))}`;
  }

  function isPendingRequest(request) {
    const status = String(request?.status || "").toLowerCase();
    return !status || ["active","pending","waiting"].includes(status);
  }

  function renderPending() {
    const list = $("tsPendingRequestsList");
    if (!list) return;

    const pending = state.requests.filter(isPendingRequest);
    if ($("tsPendingCount")) $("tsPendingCount").textContent = `(${pending.length})`;

    if (!state.sessionId) {
      list.innerHTML = `<div class="top-status-queue-empty">No active session.</div>`;
      return;
    }

    if (!pending.length) {
      list.innerHTML = `<div class="top-status-queue-empty">No pending requests.</div>`;
      return;
    }

    list.innerHTML = pending.map(request => `
      <div class="ts-pending-row">
        <div class="ts-request-main">
          <strong>${esc(request.songTitle || request.title || "Untitled Song")}</strong>
          <small>${esc(request.singerName || request.name || "Singer")}${request.artist || request.songArtist ? ` • ${esc(request.artist || request.songArtist)}` : ""}</small>
        </div>
        <div class="ts-pending-actions">
          <button type="button" class="accept" data-ts-accept="${esc(request.id)}">✓</button>
          <button type="button" class="decline" data-ts-decline="${esc(request.id)}">✕</button>
        </div>
      </div>
    `).join("");
  }

  function queueItems() {
    if (
      state.runOrder?.sessionId &&
      state.sessionId &&
      state.runOrder.sessionId !== state.sessionId
    ) {
      return [];
    }

    return Array.isArray(state.runOrder?.items) ? state.runOrder.items : [];
  }

  function renderRunOrder() {
    const list = $("tsRunOrderList");
    if (!list) return;

    const items = queueItems();
    if ($("tsRunOrderCount")) $("tsRunOrderCount").textContent = `(${items.length})`;

    if (!state.sessionId) {
      list.innerHTML = `<div class="top-status-queue-empty">No active session.</div>`;
      return;
    }

    if (!items.length) {
      list.innerHTML = `<div class="top-status-queue-empty">Run Order is empty.</div>`;
      return;
    }

    list.innerHTML = items.map((item,index) => `
      <div class="ts-run-order-row ${item.status === "played" ? "played" : ""}">
        <div class="ts-run-index">${index + 1}</div>
        <div class="ts-run-main">
          <strong>${esc(item.songTitle || item.title || item.songId || "Untitled Song")}</strong>
          <small>${esc(item.singerName || (item.source === "manual" ? "Host choice" : item.artist || ""))}${item.status === "played" ? " • PLAYED" : ""}</small>
        </div>
        <div class="ts-run-actions">
          <button type="button" data-ts-up="${esc(item.id)}">↑</button>
          <button type="button" data-ts-down="${esc(item.id)}">↓</button>
          <button type="button" class="remove" data-ts-remove="${esc(item.id)}">✕</button>
        </div>
      </div>
    `).join("");
  }

  function renderSongSelect() {
    const select = $("tsRunOrderSongSelect");
    if (!select) return;

    const current = select.value || "";
    select.innerHTML =
      `<option value="">Add a song…</option>` +
      state.songs.map(song =>
        `<option value="${esc(song.id)}">${esc(song.title || song.id)}${song.artist ? ` — ${esc(song.artist)}` : ""}</option>`
      ).join("");

    if (state.songs.some(song => song.id === current)) select.value = current;
  }

  async function saveRunOrder(items) {
    if (!state.db || !state.sessionId) return;

    await state.db.collection("karaokeControl").doc("runOrder").set({
      sessionId: state.sessionId,
      items,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  function makeQueueItemFromRequest(request) {
    return {
      id: `req_${request.id}`,
      songId: request.songId || "",
      songTitle: request.songTitle || request.title || "",
      artist: request.artist || request.songArtist || "",
      singerName: request.singerName || request.name || "",
      requestId: request.id,
      source: "request",
      status: "queued",
      addedAtMs: Date.now()
    };
  }

  async function acceptRequest(requestId) {
    const request = state.requests.find(entry => entry.id === requestId);
    if (!request || !state.sessionId) return;

    const items = queueItems().map(item => ({...item}));

    if (!items.some(item => item.requestId === requestId)) {
      items.push(makeQueueItemFromRequest(request));
      await saveRunOrder(items);
    }

    await state.db.collection("publicSongRequests").doc(requestId).set({
      status: "queued",
      acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  async function declineRequest(requestId) {
    await state.db.collection("publicSongRequests").doc(requestId).set({
      status: "declined",
      declinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  async function moveRunOrder(itemId,direction) {
    const items = queueItems().map(item => ({...item}));
    const index = items.findIndex(item => item.id === itemId);
    if (index < 0) return;

    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    [items[index],items[target]] = [items[target],items[index]];
    await saveRunOrder(items);
  }

  async function removeRunOrder(itemId) {
    const items = queueItems().map(item => ({...item}));
    const item = items.find(entry => entry.id === itemId);

    await saveRunOrder(items.filter(entry => entry.id !== itemId));

    if (item?.requestId) {
      await state.db.collection("publicSongRequests").doc(item.requestId).set({
        status: "left",
        removedFromRunOrderAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    }
  }

  async function addManualSong() {
    const songId = $("tsRunOrderSongSelect")?.value || "";
    const song = state.songs.find(entry => entry.id === songId);
    if (!song || !state.sessionId) return;

    const items = queueItems().map(item => ({...item}));
    items.push({
      id:`manual_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      songId:song.id,
      songTitle:song.title || "",
      artist:song.artist || "",
      singerName:"",
      requestId:"",
      source:"manual",
      status:"queued",
      addedAtMs:Date.now()
    });

    await saveRunOrder(items);
    $("tsRunOrderSongSelect").value = "";
  }

  function renderPublicSetlistName(data) {
    const el = $("tsDashPublicSetlist");
    if (el) el.textContent = data?.setlistName || "Not selected";
  }

  function clearSessionSubscriptions() {
    state.sessionUnsubs.forEach(fn => {
      try { fn(); } catch {}
    });
    state.sessionUnsubs = [];
  }

  function subscribeSession(sessionId) {
    clearSessionSubscriptions();

    state.sessionId = sessionId || "";
    state.session = null;
    state.requests = [];

    if (!sessionId) {
      renderRemaining();
      renderPending();
      renderRunOrder();
      return;
    }

    state.sessionUnsubs.push(
      state.db.collection("performanceSessions").doc(sessionId).onSnapshot(doc => {
        state.session = doc.exists ? { id:doc.id, ...(doc.data() || {}) } : null;
        renderRemaining();
      }, console.warn)
    );

    state.sessionUnsubs.push(
      state.db.collection("publicSongRequests")
        .where("sessionId","==",sessionId)
        .onSnapshot(snapshot => {
          state.requests = snapshot.docs.map(doc => ({id:doc.id,...(doc.data() || {})}));
          renderPending();
        }, console.warn)
    );
  }

  function startListeners() {
    state.globalUnsubs.push(
      state.db.collection("karaokeControl").doc("currentSession").onSnapshot(doc => {
        const data = doc.exists ? (doc.data() || {}) : {};
        state.currentControl = data;

        const sessionId =
          data.active === true
            ? (data.sessionId || data.activeSessionId || "")
            : "";

        if (sessionId !== state.sessionId) {
          subscribeSession(sessionId);
        }

        renderRemaining();
      }, console.warn)
    );

    state.globalUnsubs.push(
      state.db.collection("karaokeControl").doc("runOrder").onSnapshot(doc => {
        state.runOrder = doc.exists
          ? {sessionId:"",items:[],...(doc.data() || {})}
          : {sessionId:"",items:[]};

        renderRunOrder();
      }, console.warn)
    );

    state.globalUnsubs.push(
      state.db.collection("karaokeControl").doc("publicSongList").onSnapshot(doc => {
        renderPublicSetlistName(doc.exists ? (doc.data() || {}) : {});
      }, console.warn)
    );

    state.db.collection("lyrics").get().then(snapshot => {
      state.songs = snapshot.docs
        .map(doc => ({id:doc.id,...(doc.data() || {})}))
        .sort((a,b) =>
          String(a.title || "").localeCompare(String(b.title || ""), undefined, {sensitivity:"base"})
        );
      renderSongSelect();
    }).catch(console.warn);
  }

  function bindUi() {
    if (state.uiBound) return;
    state.uiBound = true;

    document.addEventListener("click", event => {
      const accept = event.target.closest("[data-ts-accept]");
      if (accept) return acceptRequest(accept.dataset.tsAccept);

      const decline = event.target.closest("[data-ts-decline]");
      if (decline) return declineRequest(decline.dataset.tsDecline);

      const up = event.target.closest("[data-ts-up]");
      if (up) return moveRunOrder(up.dataset.tsUp,-1);

      const down = event.target.closest("[data-ts-down]");
      if (down) return moveRunOrder(down.dataset.tsDown,1);

      const remove = event.target.closest("[data-ts-remove]");
      if (remove) return removeRunOrder(remove.dataset.tsRemove);
    });

    $("tsRunOrderAddBtn")?.addEventListener("click",addManualSong);
  }

  function waitForInjectedMarkup() {
    if ($("topStatusBar")) {
      bindUi();
      renderRemaining();
      renderPending();
      renderRunOrder();
      renderSongSelect();
      return true;
    }
    return false;
  }

  function init() {
    state.db = dbRef();
    if (!state.db) {
      console.warn("top-statusbar-session-tools.js: Firestore not available.");
      return;
    }

    startListeners();

    if (!waitForInjectedMarkup()) {
      const observer = new MutationObserver(() => {
        if (waitForInjectedMarkup()) {
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement,{childList:true,subtree:true});
    }

    setInterval(renderRemaining,1000);
  }

  LK.sessionTools.getRunOrder = () => queueItems().map(item => ({...item}));
  LK.sessionTools.getSessionId = () => state.sessionId;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",init);
  } else {
    init();
  }
})();
