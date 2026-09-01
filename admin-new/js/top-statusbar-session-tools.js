(() => {
  "use strict";

  window.LK = window.LK || {};
  LK.sessionTools = LK.sessionTools || {};

  const state = {
    db: null,
    sessionId: "",
    session: null,
    linkedEvent: null,
    linkedEventId: "",
    linkedEventUnsub: null,
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
      state.currentControl?.scheduledDurationMs ??
      state.linkedEvent?.scheduledDurationMs
    );

    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const start = tsDate(
      state.session?.scheduledStartAt ||
      state.currentControl?.scheduledStartAt ||
      state.linkedEvent?.scheduledStartAt
    );
    const end = tsDate(
      state.session?.scheduledEndAt ||
      state.currentControl?.scheduledEndAt ||
      state.linkedEvent?.scheduledEndAt
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

  function localDateTime(dateString, timeString, addDayIfBefore = null) {
    if (!dateString || !timeString) return null;

    let date = new Date(`${dateString}T${timeString}:00`);
    if (Number.isNaN(date.getTime())) return null;

    if (addDayIfBefore instanceof Date && date < addDayIfBefore) {
      date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    }

    return date;
  }

  function eventScheduleFallback() {
    const event =
      state.linkedEvent ||
      state.session?.eventSnapshot ||
      state.currentControl?.eventSnapshot ||
      null;

    if (!event) return { start:null, end:null };

    const start = localDateTime(event.date, event.startTime);
    const end = localDateTime(event.date, event.endTime, start);

    return { start, end };
  }

  function resolvedSchedule() {
    let start = tsDate(
      state.session?.scheduledStartAt ||
      state.currentControl?.scheduledStartAt
    );

    let end = tsDate(
      state.session?.scheduledEndAt ||
      state.currentControl?.scheduledEndAt
    );

    const fallback = eventScheduleFallback();

    if (!start) start = fallback.start;
    if (!end) end = fallback.end;

    return { start, end };
  }

  function renderRemaining() {
    const compactRemaining = $("tsCompactRemaining");
    const compactEnd = $("tsCompactScheduledEnd");
    const adjustedRemaining = $("tsAdjustedRemainingTime");
    const adjustedEnd = $("tsAdjustedEndTime");
    const adjustedHint = $("tsAdjustedRemainingHint");

    // Compatibility targets retained for older code.
    const legacyRemaining = $("tsRemainingTime");
    const legacyWindow = $("tsScheduledWindow");

    if (!state.sessionId || !state.session) {
      if (compactRemaining) {
        compactRemaining.textContent = "-";
        compactRemaining.classList.remove("is-overdue", "is-remaining");
      }
      if (compactEnd) compactEnd.textContent = "No scheduled end";
      if (adjustedRemaining) {
        adjustedRemaining.textContent = "-";
        adjustedRemaining.classList.remove("is-overdue", "is-remaining");
      }
      if (adjustedEnd) adjustedEnd.textContent = "Adjusted end —";
      if (adjustedHint) adjustedHint.textContent = "No active session";
      if (legacyRemaining) legacyRemaining.textContent = "-";
      if (legacyWindow) legacyWindow.textContent = "No active session";
      return;
    }

    const actualStart = actualStartDate();
    const schedule = resolvedSchedule();

    let duration = scheduledDurationMs();

    // If the duration itself wasn't persisted, derive it from the
    // resolved scheduled start/end (including eventSnapshot fallback).
    if (
      (!Number.isFinite(duration) || duration <= 0) &&
      schedule.start &&
      schedule.end &&
      schedule.end > schedule.start
    ) {
      duration = schedule.end - schedule.start;
    }

    /* ------------------------------------------------------
       COLLAPSED REMAINING = OFFICIAL / SCHEDULED END
       ------------------------------------------------------ */
    const officialTarget = schedule.end;

    if (compactEnd) {
      compactEnd.textContent = officialTarget
        ? `ENDS ${formatClock(officialTarget)}`
        : "No scheduled end";
    }

    if (legacyWindow) {
      legacyWindow.textContent =
        schedule.start && schedule.end
          ? `Scheduled ${formatClock(schedule.start)}–${formatClock(schedule.end)}`
          : "No scheduled time";
    }

    if (officialTarget) {
      const officialMs = officialTarget.getTime() - Date.now();
      const isOverdue = officialMs <= 0;
      const text = formatDuration(Math.abs(officialMs));

      if (compactRemaining) {
        compactRemaining.textContent = text;
        compactRemaining.classList.toggle("is-overdue", isOverdue);
        compactRemaining.classList.toggle("is-remaining", !isOverdue);
      }

      if (legacyRemaining) {
        legacyRemaining.textContent = text;
        legacyRemaining.classList.toggle("is-overdue", isOverdue);
        legacyRemaining.classList.toggle("is-remaining", !isOverdue);
      }
    } else {
      if (compactRemaining) {
        compactRemaining.textContent = "-";
        compactRemaining.classList.remove("is-overdue", "is-remaining");
      }

      if (legacyRemaining) {
        legacyRemaining.textContent = "-";
        legacyRemaining.classList.remove("is-overdue", "is-remaining");
      }
    }

    /* ------------------------------------------------------
       EXPANDED REMAINING = ADJUSTED END
       The original scheduled duration is applied from the
       ACTUAL session start.

       Example:
       scheduled 20:00–23:00 = 3hrs
       actual start 20:10
       adjusted finish 23:10
       ------------------------------------------------------ */
    let adjustedTarget = null;

    if (actualStart && Number.isFinite(duration) && duration > 0) {
      adjustedTarget = new Date(actualStart.getTime() + duration);
    }

    if (adjustedTarget) {
      const adjustedMs = adjustedTarget.getTime() - Date.now();

      if (adjustedRemaining) {
        const isOverdue = adjustedMs <= 0;

        adjustedRemaining.textContent =
          formatDuration(Math.abs(adjustedMs));

        adjustedRemaining.classList.toggle("is-overdue", isOverdue);
        adjustedRemaining.classList.toggle("is-remaining", !isOverdue);
      }

      if (adjustedEnd) {
        adjustedEnd.innerHTML =
          `Adjusted end <strong>${formatClock(adjustedTarget)}</strong>`;
      }

      if (adjustedHint) {
        const delay =
          schedule.start && actualStart
            ? Math.round((actualStart - schedule.start) / 60000)
            : 0;

        if (delay > 0) {
          adjustedHint.textContent =
            `Started ${delay} min${delay === 1 ? "" : "s"} late • finish shifted by ${delay} min${delay === 1 ? "" : "s"}`;
        } else if (delay < 0) {
          const early = Math.abs(delay);
          adjustedHint.textContent =
            `Started ${early} min${early === 1 ? "" : "s"} early • finish shifted earlier`;
        } else {
          adjustedHint.textContent = "Started on schedule";
        }
      }
    } else {
      if (adjustedRemaining) {
        adjustedRemaining.textContent = "-";
        adjustedRemaining.classList.remove("is-overdue", "is-remaining");
      }
      if (adjustedEnd) adjustedEnd.textContent = "Adjusted end —";
      if (adjustedHint) adjustedHint.textContent =
        "Scheduled duration unavailable";
    }
  }

  function renderCompactHostStrip() {
    const venueEl = $("tsCompactVenue");
    const typeEl = $("tsCompactType");
    const startedEl = $("tsCompactStarted");
    const elapsedEl = $("tsCompactElapsed");
    const requestsEl = $("tsCompactRequests");
    const alertsEl = $("tsCompactAlerts");

    const session = state.session;
    const control = state.currentControl || {};

    if (!state.sessionId || !session) {
      if (venueEl) venueEl.textContent = "No active session";
      if (typeEl) typeEl.textContent = "—";
      if (startedEl) startedEl.textContent = "--:--";
      if (elapsedEl) elapsedEl.textContent = "0 mins";
      if (requestsEl) requestsEl.textContent = "0";
      if (alertsEl) alertsEl.textContent = "0";
      return;
    }

    const actualStart = actualStartDate();

    if (venueEl) {
      venueEl.textContent =
        session.venue ||
        control.venue ||
        session.eventSnapshot?.venue ||
        "Venue TBC";
    }

    if (typeEl) {
      typeEl.textContent =
        session.sessionType ||
        session.type ||
        control.sessionType ||
        control.type ||
        session.eventSnapshot?.type ||
        "Performance";
    }

    if (startedEl) {
      startedEl.textContent = actualStart ? formatClock(actualStart) : "--:--";
    }

    if (elapsedEl) {
      elapsedEl.textContent =
        actualStart
          ? formatDuration(Math.max(0, Date.now() - actualStart.getTime()))
          : "0 mins";
    }

    if (requestsEl) {
      requestsEl.textContent = String(
        state.requests.filter(request => {
          const status = String(request?.status || "").toLowerCase();
          return !status || ["active","pending","waiting","queued"].includes(status);
        }).length
      );
    }

    // Existing top-statusbar.js owns notifications. Read its badge if present.
    if (alertsEl) {
      const badge = $("tsNotificationBadge");
      const count = Number(badge?.textContent || 0);
      alertsEl.textContent = Number.isFinite(count) ? String(count) : "0";
    }
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
          <button
            type="button"
            class="accept"
            data-ts-accept="${esc(request.id)}"
            title="Accept request"
            aria-label="Accept request"
          >✓</button>

          <button
            type="button"
            class="abandon"
            data-ts-abandon-request="${esc(request.id)}"
            title="Singer left / request abandoned"
            aria-label="Mark request abandoned"
          >⊘</button>

          <button
            type="button"
            class="decline"
            data-ts-delete-request="${esc(request.id)}"
            title="Delete / decline request"
            aria-label="Delete request"
          >✕</button>
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

    // Played entries remain stored in Firestore/session history, but are no
    // longer displayed in the live Run Order. The host only sees what is left.
    const terminalStatuses = new Set([
      "played",
      "abandoned",
      "left",
      "deleted",
      "deletedbyhost",
      "declined"
    ]);

    const items = queueItems().filter(item =>
      !terminalStatuses.has(String(item?.status || "").toLowerCase())
    );

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
      <div class="ts-run-order-row">
        <div class="ts-run-index">${index + 1}</div>
        <div class="ts-run-main">
          <strong>${esc(item.songTitle || item.title || item.songId || "Untitled Song")}</strong>
          <small>${esc(item.singerName || (item.source === "manual" ? "Host choice" : item.artist || ""))}</small>
        </div>
        <div class="ts-run-actions">
          <button
            type="button"
            data-ts-up="${esc(item.id)}"
            title="Move up"
            aria-label="Move song up"
          >↑</button>

          <button
            type="button"
            data-ts-down="${esc(item.id)}"
            title="Move down"
            aria-label="Move song down"
          >↓</button>

          <button
            type="button"
            class="abandon"
            data-ts-abandon-run="${esc(item.id)}"
            title="Singer left / song abandoned"
            aria-label="Mark song abandoned"
          >⊘</button>

          <button
            type="button"
            class="remove"
            data-ts-remove="${esc(item.id)}"
            title="Remove from Run Order"
            aria-label="Remove song from Run Order"
          >✕</button>
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

  async function abandonRequest(requestId) {
    if (!requestId || !state.db) return;

    await state.db.collection("publicSongRequests").doc(requestId).set({
      status: "abandoned",
      abandonedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }

  async function deleteRequest(requestId) {
    if (!requestId || !state.db) return;

    await state.db.collection("publicSongRequests").doc(requestId).set({
      status: "deletedByHost",
      deletedByHostAt: firebase.firestore.FieldValue.serverTimestamp(),
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

  async function abandonRunOrder(itemId) {
    const items = queueItems().map(item => ({...item}));
    const item = items.find(entry => entry.id === itemId);
    if (!item) return;

    const now = firebase.firestore.FieldValue.serverTimestamp();

    // Keep the row in Firestore/session history, but mark it terminal so it
    // immediately disappears from the live Run Order display.
    const updatedItems = items.map(entry =>
      entry.id === itemId
        ? {
            ...entry,
            status: "abandoned",
            abandonedAtMs: Date.now()
          }
        : entry
    );

    await saveRunOrder(updatedItems);

    if (item.requestId) {
      await state.db.collection("publicSongRequests").doc(item.requestId).set({
        status: "abandoned",
        abandonedAt: now,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    }
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

  function clearLinkedEventSubscription() {
    if (typeof state.linkedEventUnsub === "function") {
      try { state.linkedEventUnsub(); } catch {}
    }
    state.linkedEventUnsub = null;
    state.linkedEventId = "";
    state.linkedEvent = null;
  }

  function subscribeLinkedEvent(eventId) {
    const cleanId = String(eventId || "").trim();

    if (!cleanId) {
      clearLinkedEventSubscription();
      renderRemaining();
      return;
    }

    if (cleanId === state.linkedEventId && state.linkedEventUnsub) return;

    clearLinkedEventSubscription();
    state.linkedEventId = cleanId;

    state.linkedEventUnsub = state.db
      .collection("upcomingEvents")
      .doc(cleanId)
      .onSnapshot(doc => {
        state.linkedEvent = doc.exists
          ? { id:doc.id, ...(doc.data() || {}) }
          : null;

        renderRemaining();
      }, error => {
        console.warn("Could not load linked Upcoming Event:", error);
        state.linkedEvent = null;
        renderRemaining();
      });
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
      clearLinkedEventSubscription();
      renderRemaining();
      renderPending();
      renderRunOrder();
      renderCompactHostStrip();
      return;
    }

    state.sessionUnsubs.push(
      state.db.collection("performanceSessions").doc(sessionId).onSnapshot(doc => {
        state.session = doc.exists ? { id:doc.id, ...(doc.data() || {}) } : null;

        subscribeLinkedEvent(
          state.session?.eventId ||
          state.currentControl?.eventId ||
          ""
        );

        renderRemaining();
        renderCompactHostStrip();
      }, console.warn)
    );

    state.sessionUnsubs.push(
      state.db.collection("publicSongRequests")
        .where("sessionId","==",sessionId)
        .onSnapshot(snapshot => {
          state.requests = snapshot.docs.map(doc => ({id:doc.id,...(doc.data() || {})}));
          renderPending();
          renderCompactHostStrip();
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
        } else if (sessionId) {
          subscribeLinkedEvent(
            state.session?.eventId ||
            data.eventId ||
            ""
          );
        }

        renderRemaining();
        renderCompactHostStrip();
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

  function isStatusExpanded() {
    const bar = $("topStatusBar");
    return !!bar && !bar.classList.contains("collapsed");
  }

  function syncStatusToggleUi() {
    const bar = $("topStatusBar");
    if (!bar) return;

    const expanded = !bar.classList.contains("collapsed");
    const strip = bar.querySelector("[data-ts-toggle-strip]") || bar.querySelector(".top-status-strip");
    const btn = $("tsToggleBtn");

    strip?.setAttribute("aria-expanded", String(expanded));

    if (btn) {
      btn.textContent = expanded ? "▲" : "▼";
      btn.setAttribute(
        "aria-label",
        expanded ? "Collapse status dashboard" : "Expand status dashboard"
      );
      btn.setAttribute("aria-expanded", String(expanded));
    }
  }

  function setStatusExpanded(expanded) {
    const bar = $("topStatusBar");
    if (!bar) return;

    bar.classList.toggle("collapsed", !expanded);
    bar.classList.toggle("expanded", expanded);

    syncStatusToggleUi();
  }

  function toggleStatusExpanded() {
    setStatusExpanded(!isStatusExpanded());
  }

  function initialiseStatusToggle() {
    const bar = $("topStatusBar");
    if (!bar || bar.dataset.toggleBound === "1") return;

    bar.dataset.toggleBound = "1";

    // Always load collapsed. Expansion is a deliberate host action.
    setStatusExpanded(false);

    const strip =
      bar.querySelector("[data-ts-toggle-strip]") ||
      bar.querySelector(".top-status-strip");

    const button =
      bar.querySelector("[data-ts-toggle-button]") ||
      $("tsToggleBtn");

    if (strip) {
      strip.addEventListener("click", event => {
        // The dedicated button has its own listener; avoid a double toggle.
        if (event.target.closest("[data-ts-toggle-button], #tsToggleBtn")) return;
        toggleStatusExpanded();
      });

      strip.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleStatusExpanded();
      });
    }

    if (button) {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        toggleStatusExpanded();
      });
    }

    // Keep compatibility with pages/older code that call LK.topStatus.toggle().
    window.LK = window.LK || {};
    window.LK.topStatus = window.LK.topStatus || {};
    window.LK.topStatus.toggle = toggleStatusExpanded;
    window.LK.topStatus.expand = () => setStatusExpanded(true);
    window.LK.topStatus.collapse = () => setStatusExpanded(false);

    syncStatusToggleUi();
  }

  function setStatusTab(tabName) {
    const tab = tabName === "break" ? "break" : "session";

    const sessionBtn = $("tsSessionStatusTab");
    const breakBtn = $("tsBreakStatusTab");
    const sessionPane = $("tsSessionStatusPane");
    const breakPane = $("tsBreakStatusPane");

    const showSession = tab === "session";

    sessionBtn?.classList.toggle("active", showSession);
    breakBtn?.classList.toggle("active", !showSession);
    sessionBtn?.setAttribute("aria-selected", String(showSession));
    breakBtn?.setAttribute("aria-selected", String(!showSession));

    if (sessionPane) {
      sessionPane.hidden = !showSession;
      sessionPane.classList.toggle("active", showSession);
    }

    if (breakPane) {
      breakPane.hidden = showSession;
      breakPane.classList.toggle("active", !showSession);
    }
  }

  function initialiseStatusTabs() {
    const bar = $("topStatusBar");
    if (!bar || bar.dataset.statusTabsBound === "1") return;

    bar.dataset.statusTabsBound = "1";
    setStatusTab("session");

    bar.addEventListener("click", event => {
      const btn = event.target.closest("[data-ts-status-tab]");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      setStatusTab(btn.dataset.tsStatusTab);
    });
  }

  function setInfoTab(tabName) {
    const tab = tabName === "notes" ? "notes" : "notifications";

    const notificationsBtn = $("tsNotificationsTab");
    const notesBtn = $("tsNotesTab");
    const notificationsPane = $("tsNotificationsPane");
    const notesPane = $("tsNotesPane");

    const showNotifications = tab === "notifications";

    notificationsBtn?.classList.toggle("active", showNotifications);
    notesBtn?.classList.toggle("active", !showNotifications);

    notificationsBtn?.setAttribute("aria-selected", String(showNotifications));
    notesBtn?.setAttribute("aria-selected", String(!showNotifications));

    if (notificationsPane) {
      notificationsPane.hidden = !showNotifications;
      notificationsPane.classList.toggle("active", showNotifications);
    }

    if (notesPane) {
      notesPane.hidden = showNotifications;
      notesPane.classList.toggle("active", !showNotifications);
    }
  }

  function initialiseInfoTabs() {
    const bar = $("topStatusBar");
    if (!bar || bar.dataset.infoTabsBound === "1") return;

    bar.dataset.infoTabsBound = "1";

    // User requested Notifications as the default.
    setInfoTab("notifications");

    bar.addEventListener("click", event => {
      const btn = event.target.closest("[data-ts-info-tab]");
      if (!btn) return;

      event.preventDefault();
      event.stopPropagation();
      setInfoTab(btn.dataset.tsInfoTab);
    });
  }

  function bindUi() {
    if (state.uiBound) return;
    state.uiBound = true;

    document.addEventListener("click", event => {
      const accept = event.target.closest("[data-ts-accept]");
      if (accept) return acceptRequest(accept.dataset.tsAccept);

      const abandonRequestBtn = event.target.closest("[data-ts-abandon-request]");
      if (abandonRequestBtn) {
        return abandonRequest(abandonRequestBtn.dataset.tsAbandonRequest);
      }

      const deleteRequestBtn = event.target.closest("[data-ts-delete-request]");
      if (deleteRequestBtn) {
        return deleteRequest(deleteRequestBtn.dataset.tsDeleteRequest);
      }

      const up = event.target.closest("[data-ts-up]");
      if (up) return moveRunOrder(up.dataset.tsUp,-1);

      const down = event.target.closest("[data-ts-down]");
      if (down) return moveRunOrder(down.dataset.tsDown,1);

      const abandonRun = event.target.closest("[data-ts-abandon-run]");
      if (abandonRun) return abandonRunOrder(abandonRun.dataset.tsAbandonRun);

      const remove = event.target.closest("[data-ts-remove]");
      if (remove) return removeRunOrder(remove.dataset.tsRemove);
    });

    $("tsRunOrderAddBtn")?.addEventListener("click",addManualSong);
  }

  function waitForInjectedMarkup() {
    if ($("topStatusBar")) {
      initialiseStatusToggle();
      initialiseStatusTabs();
      initialiseInfoTabs();
      bindUi();
      renderRemaining();
      renderPending();
      renderRunOrder();
      renderSongSelect();
      renderCompactHostStrip();
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

    setInterval(() => {
      renderRemaining();
      renderCompactHostStrip();
    },1000);
  }

  LK.sessionTools.getRunOrder = () => queueItems().map(item => ({...item}));
  LK.sessionTools.getSessionId = () => state.sessionId;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",init);
  } else {
    init();
  }
})();
