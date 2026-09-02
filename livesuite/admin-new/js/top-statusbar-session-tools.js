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
    upcomingEvents: [],
    linkedEventUnsub: null,
    currentControl: null,
    requests: [],
    runOrder: { sessionId:"", items:[] },
    songs: [],
    notifications: [],
    notificationUnread: 0,
    knownNotificationIds: new Set(),
    requestSnapshotReady: false,
    knownRequestIds: new Set(),
    lastBreakOpen: null,
    lastRunStatuses: new Map(),
    runOrderSnapshotReady: false,
    notesSaveTimer: null,
    globalUnsubs: [],
    sessionUnsubs: [],
    uiBound: false
  };

  const $ = id => document.getElementById(id);

  function publishSharedSession() {
    window.LK = window.LK || {};
    window.LK.sessionTools = window.LK.sessionTools || {};
    window.LK.sessionTools.getSession = () =>
      state.session ? { ...state.session } : null;

    window.dispatchEvent(new CustomEvent("lk:session-updated", {
      detail: {
        session: state.session ? { ...state.session } : null,
        sessionId: state.sessionId || ""
      }
    }));
  }


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
    // performanceSessions.startedAt is the authoritative start used by Admin.
    // Prefer it over addon/legacy fields so ELAPSED cannot jump to a stale time.
    return tsDate(
      state.session?.startedAt ||
      state.currentControl?.startedAt ||
      state.session?.actualStartedAt
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
      inferLinkedEvent() ||
      null;

    if (!event) return { start:null, end:null };

    let start = tsDate(event.scheduledStartAt);
    let end = tsDate(event.scheduledEndAt);

    if (!start) start = localDateTime(event.date, event.startTime);
    if (!end) end = localDateTime(event.date, event.endTime, start);

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
    const legacyRemaining = $("tsRemainingTime");
    const legacyWindow = $("tsScheduledWindow");

    const setValueState = (el, ms) => {
      if (!el) return;
      if (!Number.isFinite(ms)) {
        el.textContent = "-";
        el.classList.remove("is-overdue", "is-remaining");
        return;
      }
      const overdue = ms <= 0;
      el.textContent = formatDuration(Math.abs(ms));
      el.classList.toggle("is-overdue", overdue);
      el.classList.toggle("is-remaining", !overdue);
    };

    if (!state.sessionId || !state.session) {
      setValueState(compactRemaining, NaN);
      setValueState(adjustedRemaining, NaN);
      setValueState(legacyRemaining, NaN);
      if (compactEnd) compactEnd.textContent = "No scheduled end";
      if (adjustedEnd) adjustedEnd.textContent = "Adjusted end —";
      if (adjustedHint) adjustedHint.textContent = "No active session";
      if (legacyWindow) legacyWindow.textContent = "No active session";
      return;
    }

    const actualStart = actualStartDate();
    const schedule = resolvedSchedule();
    let duration = scheduledDurationMs();

    if ((!Number.isFinite(duration) || duration <= 0) && schedule.start && schedule.end && schedule.end > schedule.start) {
      duration = schedule.end - schedule.start;
    }

    // REMAINING is based on the actual performance start plus the booked
    // duration. This keeps the compact and expanded values consistent.
    // If no booked duration is available, fall back to the explicit end time.
    let target = null;
    if (actualStart && Number.isFinite(duration) && duration > 0) {
      target = new Date(actualStart.getTime() + duration);
    } else if (schedule.end) {
      target = schedule.end;
    }

    const remainingMs = target ? target.getTime() - Date.now() : NaN;
    setValueState(compactRemaining, remainingMs);
    setValueState(adjustedRemaining, remainingMs);
    setValueState(legacyRemaining, remainingMs);

    if (compactEnd) {
      compactEnd.textContent = target ? `ENDS ${formatClock(target)}` : "No scheduled end";
    }

    if (adjustedEnd) {
      adjustedEnd.innerHTML = target
        ? `Adjusted end <strong>${formatClock(target)}</strong>`
        : "Adjusted end —";
    }

    if (legacyWindow) {
      legacyWindow.textContent = schedule.start && schedule.end
        ? `Scheduled ${formatClock(schedule.start)}–${formatClock(schedule.end)}`
        : "No scheduled time";
    }

    if (adjustedHint) {
      if (!target) {
        adjustedHint.textContent = "Scheduled duration unavailable";
      } else if (schedule.start && actualStart) {
        const delay = Math.round((actualStart - schedule.start) / 60000);
        if (delay > 0) adjustedHint.textContent = `Started ${delay} min${delay === 1 ? "" : "s"} late • finish shifted by ${delay} min${delay === 1 ? "" : "s"}`;
        else if (delay < 0) adjustedHint.textContent = `Started ${Math.abs(delay)} min${Math.abs(delay) === 1 ? "" : "s"} early • finish shifted earlier`;
        else adjustedHint.textContent = "Started on schedule";
      } else {
        adjustedHint.textContent = "Remaining from active session schedule";
      }
    }
  }

  function breakStartDate(br) {
    return tsDate(br?.startedAt || br?.start || null);
  }

  function breakEndDate(br) {
    return tsDate(br?.endedAt || br?.end || null);
  }

  function getBreakState() {
    const breaks = Array.isArray(state.session?.breaks) ? state.session.breaks : [];
    const last = breaks[breaks.length - 1] || null;
    const start = breakStartDate(last);
    const end = breakEndDate(last);
    const open = !!last && !!start && !end;
    let totalMs = 0;
    const now = Date.now();
    for (const br of breaks) {
      const s = breakStartDate(br);
      if (!s) continue;
      const e = breakEndDate(br);
      totalMs += Math.max(0, (e ? e.getTime() : now) - s.getTime());
    }
    return { breaks, last, start, end, open, totalMs, currentMs: open && start ? Math.max(0, now - start.getTime()) : 0 };
  }

  function activityDate(entry) {
    return tsDate(entry?.at) ||
      (Number(entry?.atMs) ? new Date(Number(entry.atMs)) : null);
  }

  function activityIcon(type, fallback = "•") {
    const icons = {
      request: "🎤",
      request_accepted: "✓",
      request_declined: "✕",
      break_start: "☕",
      break_end: "▶",
      song_start: "▶",
      song_end: "✓",
      song_abandoned: "⊘",
      run_order: "♫",
      session: "●"
    };
    return icons[type] || fallback;
  }

  function syncNotificationsFromSession() {
    const log = Array.isArray(state.session?.activityLog)
      ? state.session.activityLog
      : [];

    const ordered = log
      .map(entry => ({ ...entry }))
      .sort((a,b) => {
        const ad = activityDate(a)?.getTime() || 0;
        const bd = activityDate(b)?.getTime() || 0;
        return bd - ad;
      });

    const previousIds = state.knownNotificationIds;
    const nextIds = new Set(
      ordered.map(entry => entry.id || entry.key).filter(Boolean)
    );

    if (previousIds.size) {
      ordered.forEach(entry => {
        const id = entry.id || entry.key;
        if (id && !previousIds.has(id)) {
          state.notificationUnread++;
        }
      });
    }

    state.notifications = ordered;
    state.knownNotificationIds = nextIds;
  }

  async function persistActivityEntry(entry) {
    if (!state.db || !state.sessionId || !entry?.id) return;

    const sessionRef = state.db
      .collection("performanceSessions")
      .doc(state.sessionId);

    try {
      await state.db.runTransaction(async transaction => {
        const snap = await transaction.get(sessionRef);
        if (!snap.exists) return;

        const data = snap.data() || {};
        const current = Array.isArray(data.activityLog)
          ? data.activityLog
          : [];

        if (current.some(item => item?.id === entry.id)) return;

        const next = [...current, entry].slice(-500);

        transaction.set(sessionRef, {
          activityLog: next,
          activityUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge:true });
      });
    } catch (error) {
      console.warn("Could not persist session activity:", error);
    }
  }

  function pushNotification(
    text,
    key = "",
    type = "session",
    meta = {},
    persist = true
  ) {
    const clean = String(text || "").trim();
    if (!clean) return;

    const id =
      String(key || "").trim() ||
      `${type}:${Date.now()}:${Math.random().toString(36).slice(2,7)}`;

    if (state.notifications.some(item => item.id === id || item.key === id)) {
      return;
    }

    const entry = {
      id,
      key:id,
      type,
      icon: activityIcon(type),
      text:clean,
      atMs:Date.now(),
      ...meta
    };

    state.notifications.unshift(entry);
    state.notifications = state.notifications.slice(0, 500);
    state.knownNotificationIds.add(id);
    state.notificationUnread++;

    renderNotifications();

    if (persist) {
      persistActivityEntry(entry);
    }
  }

  function markNotificationsRead() {
    state.notificationUnread = 0;
    renderNotifications();
  }

  function renderNotifications() {
    const list = $("tsNotificationsList");
    const badge = $("tsNotificationBadge");
    const label = $("tsNotificationLabel");
    const alerts = $("tsCompactAlerts");
    const tabCount = $("tsNotificationTabCount");

    const count = state.notifications.length;
    const unread = state.notificationUnread;

    if (badge) {
      badge.textContent = String(unread);
      badge.classList.toggle("hidden", unread === 0);
    }

    if (tabCount) {
      tabCount.textContent = `(${unread})`;
      tabCount.classList.toggle("hidden", unread === 0);
      tabCount.classList.toggle("has-count", unread > 0);
    }

    if (alerts) alerts.textContent = String(unread);
    if (label) {
      label.textContent = unread
        ? `${unread} new notification${unread === 1 ? "" : "s"}`
        : "No new alerts";
    }

    if (!list) return;

    list.innerHTML = count
      ? state.notifications.map(entry => {
          const date = activityDate(entry) || new Date();
          const time = formatClock(date);
          const icon = entry.icon || activityIcon(entry.type);

          return `
            <div class="top-status-live-notification compact-notification">
              <span class="notification-time">${esc(time)}</span>
              <span class="notification-icon">${esc(icon)}</span>
              <span class="notification-text">${esc(entry.text)}</span>
            </div>
          `;
        }).join("")
      : `<div class="top-status-empty">No notifications yet.</div>`;
  }

  function breakRunOrderPosition() {
    const items = queueItems();
    const terminal = new Set([
      "played","abandoned","left","deleted","deletedbyhost","declined"
    ]);

    return items.filter(item =>
      terminal.has(String(item?.status || "").toLowerCase())
    ).length;
  }

  function trackBreakStateNotification() {
    const b = getBreakState();
    const changed =
      state.lastBreakOpen !== null &&
      state.lastBreakOpen !== b.open;

    if (changed) {
      if (b.open) {
        const startedMs = b.start?.getTime() || Date.now();
        pushNotification(
          `Break started after Run Order position ${breakRunOrderPosition()}`,
          `break:start:${startedMs}`,
          "break_start",
          {
            breakStartedAtMs: startedMs,
            runOrderPosition: breakRunOrderPosition()
          }
        );
      } else {
        const lastBreak = b.breaks[b.breaks.length - 1] || {};
        const startedMs = breakStartDate(lastBreak)?.getTime() || 0;
        const endedMs = breakEndDate(lastBreak)?.getTime() || Date.now();

        pushNotification(
          `Break ended (${formatDuration(Math.max(0, endedMs - startedMs))})`,
          `break:end:${startedMs || endedMs}`,
          "break_end",
          {
            breakStartedAtMs: startedMs || null,
            breakEndedAtMs: endedMs,
            runOrderPosition: breakRunOrderPosition()
          }
        );
      }
    }

    state.lastBreakOpen = b.open;

    if (changed) {
      renderRunOrder();
    }
  }

  function trackRunOrderActivity(items) {
    const current = new Map();

    items.forEach((item, index) => {
      const status = String(item?.status || "").toLowerCase();
      current.set(item.id, status);

      if (!state.runOrderSnapshotReady) return;

      const previous = state.lastRunStatuses.get(item.id) || "";

      if (status === previous) return;

      const meta = {
        runOrderItemId:item.id,
        requestId:item.requestId || "",
        songId:item.songId || "",
        songTitle:item.songTitle || item.title || item.songId || "Song",
        artist:item.artist || "",
        singerName:item.singerName || "",
        runOrderPosition:index + 1
      };

      if (status === "playing") {
        const atMs = Number(item.playingAtMs) || Date.now();

        pushNotification(
          `Song started: ${meta.songTitle}${meta.singerName ? ` — ${meta.singerName}` : ""}`,
          `song:start:${item.id}:${atMs}`,
          "song_start",
          { ...meta, songStartedAtMs:atMs }
        );
      } else if (status === "played") {
        const atMs = Number(item.playedAtMs) || Date.now();

        pushNotification(
          `Song completed: ${meta.songTitle}`,
          `song:end:${item.id}:${atMs}`,
          "song_end",
          { ...meta, songEndedAtMs:atMs }
        );
      } else if (status === "abandoned") {
        pushNotification(
          `Song abandoned: ${meta.songTitle}`,
          `song:abandoned:${item.id}:${Date.now()}`,
          "song_abandoned",
          meta
        );
      }
    });

    state.lastRunStatuses = current;
    state.runOrderSnapshotReady = true;
  }


  function renderBreakControls() {
    const b = getBreakState();
    const btn = $("tsBreakActionBtn");
    const status = $("tsBreakStatusLabel");
    const details = $("tsBreakDetails");
    const started = $("tsBreakStarted");
    const duration = $("tsBreakDuration");
    const total = $("tsDashBreakTotal");
    const count = $("tsDashBreakCount");
    const current = $("tsCurrentBreakDuration");
    const message = $("tsBreakActionMessage");

    const active = !!state.sessionId && !!state.session && String(state.session.status || "active").toLowerCase() !== "ended";
    if (btn) {
      btn.disabled = !active;
      btn.textContent = b.open ? "▶ End Break" : "☕ Start Break";
      btn.classList.toggle("start", !b.open);
      btn.classList.toggle("end", b.open);
    }
    if (status) status.textContent = !active ? "No active session" : (b.open ? "Break in progress" : "Not on break");
    if (details) details.classList.toggle("hidden", !b.open);
    if (started) started.textContent = b.start ? formatClock(b.start) : "-";
    if (duration) duration.textContent = formatDuration(b.currentMs);
    if (total) total.textContent = formatDuration(b.totalMs);
    if (count) count.textContent = String(b.breaks.length);
    if (current) current.textContent = formatDuration(b.currentMs);
    if (message && !active) message.textContent = "";


  }

  async function toggleBreak() {
    if (!state.db || !state.sessionId || !state.session) return;
    const b = getBreakState();
    const breaks = b.breaks.map(item => ({ ...item }));
    const now = firebase.firestore.Timestamp.now();

    if (b.open) {
      const last = breaks[breaks.length - 1];
      if (Object.prototype.hasOwnProperty.call(last, "start") && !Object.prototype.hasOwnProperty.call(last, "startedAt")) {
        last.end = now;
      } else {
        last.endedAt = now;
      }
      await state.db.collection("performanceSessions").doc(state.sessionId).set({
        breaks,
        breakOpen: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    } else {
      breaks.push({ startedAt: now, endedAt: null });
      await state.db.collection("performanceSessions").doc(state.sessionId).set({
        breaks,
        breakOpen: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    }
  }

  function renderSessionNotes() {
    const notes = $("tsSessionNotes");
    const status = $("tsNotesSaveStatus");
    if (!notes) return;
    const active = !!state.sessionId && !!state.session && String(state.session.status || "active").toLowerCase() !== "ended";
    notes.disabled = !active;
    if (!active) {
      if (document.activeElement !== notes) notes.value = "";
      if (status) status.textContent = "No active session";
      return;
    }
    const serverValue = String(state.session.notes || "");
    if (document.activeElement !== notes && notes.value !== serverValue) notes.value = serverValue;
    if (status && document.activeElement !== notes) status.textContent = "Autosaves to this session";
  }

  function saveTopbarNotes() {
    const notes = $("tsSessionNotes");
    const status = $("tsNotesSaveStatus");
    if (!notes || !state.sessionId || !state.db) return;
    clearTimeout(state.notesSaveTimer);
    if (status) status.textContent = "Saving…";
    state.notesSaveTimer = setTimeout(async () => {
      try {
        await state.db.collection("performanceSessions").doc(state.sessionId).set({
          notes: notes.value,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge:true });
        if (status) status.textContent = "Saved";
      } catch (error) {
        console.warn("Could not save session notes:", error);
        if (status) status.textContent = "Save failed";
      }
    }, 450);
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

    if (alertsEl) {
      const pendingCount = state.requests.filter(isPendingRequest).length;
      alertsEl.textContent = String(Math.max(pendingCount, state.notifications.length));
    }
  }

  function isPendingRequest(request) {
    const status = String(request?.status || "").toLowerCase();
    return !status || ["active","pending","waiting"].includes(status);
  }

  function renderPending() {
    const list = $("tsPendingRequestsList");
    const countEl = $("tsPendingCount");
    const tabCount = $("tsPendingTabCount");
    const pending = state.requests.filter(isPendingRequest);

    if (countEl) countEl.textContent = `(${pending.length})`;

    if (tabCount) {
      tabCount.textContent = `(${pending.length})`;
      tabCount.classList.toggle("hidden", pending.length === 0);
      tabCount.classList.toggle("has-count", pending.length > 0);
    }

    if (!list) return;

    if (!state.sessionId) {
      list.innerHTML = `<div class="top-status-queue-empty">No active session.</div>`;
      return;
    }

    if (!pending.length) {
      list.innerHTML = `<div class="top-status-queue-empty">No pending requests.</div>`;
      return;
    }

    list.innerHTML = pending.map(request => `
      <div class="ts-pending-request-row">
        <div class="ts-pending-main">
          <strong>${esc(request.songTitle || request.title || "Untitled Song")}</strong>
          <small>${esc(request.singerName || request.name || "Singer")}</small>
        </div>
        <div class="ts-pending-actions">
          <button
            type="button"
            class="accept"
            data-ts-accept="${esc(request.id)}"
            title="Accept into Run Order"
          >✓</button>
          <button
            type="button"
            class="abandon"
            data-ts-abandon-request="${esc(request.id)}"
            title="Singer left / abandoned"
          >⊘</button>
          <button
            type="button"
            class="decline"
            data-ts-decline="${esc(request.id)}"
            title="Decline request"
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

  function runOrderPlayingItem(items = queueItems()) {
    return items.find(item =>
      String(item?.status || "").toLowerCase() === "playing"
    ) || null;
  }

  function requestForRunItem(item) {
    if (!item?.requestId) return null;
    return state.requests.find(request => request.id === item.requestId) || null;
  }

  function canLaunchRunOrderSong(items = queueItems()) {
    return (
      !!state.sessionId &&
      !getBreakState().open &&
      !runOrderPlayingItem(items)
    );
  }

  function openRunOrderSong(itemId) {
    const item = queueItems().find(entry => entry.id === itemId);
    if (!item?.songId) return;

    const params = new URLSearchParams();
    params.set("id", item.songId);
    if (item.requestId) params.set("requestId", item.requestId);

    // Top Status Bar is used on both host/lyricsviewer.html and
    // host/lyricview.html, so this relative path works in both.
    location.href = `lyricview.html?${params.toString()}`;
  }

  function detailValue(label, value) {
    const clean = String(value ?? "").trim();
    if (!clean) return "";

    return `
      <div class="ts-run-detail-field">
        <span>${esc(label)}</span>
        <strong>${esc(clean)}</strong>
      </div>
    `;
  }

  function openRunOrderDetails(itemId) {
    const item = queueItems().find(entry => entry.id === itemId);
    if (!item) return;

    const request = requestForRunItem(item);
    const modal = $("tsRunOrderDetailsModal");
    const body = $("tsRunDetailsBody");
    const title = $("tsRunDetailsTitle");

    if (!modal || !body || !title) return;

    title.textContent =
      item.songTitle ||
      item.title ||
      item.songId ||
      "Song Request";

    if (!request) {
      body.innerHTML = `
        ${detailValue("Song", item.songTitle || item.title || item.songId)}
        ${detailValue("Artist", item.artist)}
        ${detailValue("Added by", item.source === "manual" ? "Host" : item.singerName)}
        <div class="ts-run-detail-empty">
          This Run Order item was added manually and has no singer signup details.
        </div>
      `;
    } else {
      const rating = request.rating
        ? `${request.rating}/5`
        : "";

      body.innerHTML = `
        ${detailValue("Singer", request.singerName || request.name)}
        ${detailValue("Visiting from", request.location)}
        ${detailValue("Age range", request.ageRange)}
        ${detailValue("Rating tonight", rating)}
        ${detailValue("Song", request.songTitle || request.title || item.songTitle)}
        ${detailValue("Artist", request.songArtist || request.artist || item.artist)}
        ${detailValue("Comment / note", request.note)}
      ` || `<div class="ts-run-detail-empty">No additional signup details.</div>`;
    }

    modal.classList.remove("hidden");
  }

  function closeRunOrderDetails() {
    $("tsRunOrderDetailsModal")?.classList.add("hidden");
  }

  function renderRunOrder() {
    const list = $("tsRunOrderList");
    if (!list) return;

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

    if ($("tsRunOrderCount")) {
      $("tsRunOrderCount").textContent = `(${items.length})`;
    }

    const tabCount = $("tsRunOrderTabCount");
    if (tabCount) {
      tabCount.textContent = `(${items.length})`;
      tabCount.classList.toggle("hidden", items.length === 0);
    }

    if (!state.sessionId) {
      list.innerHTML = `<div class="top-status-queue-empty">No active session.</div>`;
      return;
    }

    const breakState = getBreakState();
    const hasPlayingSong = !!runOrderPlayingItem(items);
    const showPlayButtons = !hasPlayingSong && !breakState.open;

    const breakRow = breakState.open
      ? `
        <div class="ts-run-order-row ts-current-break-row">
          <div class="ts-run-index">☕</div>
          <div class="ts-run-main">
            <strong>CURRENTLY ON BREAK</strong>
            <small>
              Started ${esc(formatClock(breakState.start))}
              · ${esc(formatDuration(breakState.currentMs))}
              · after position ${breakRunOrderPosition()}
            </small>
          </div>
          <div class="ts-run-actions"></div>
        </div>
      `
      : "";

    if (!items.length) {
      list.innerHTML =
        breakRow ||
        `<div class="top-status-queue-empty">Run Order is empty.</div>`;
      return;
    }

    list.innerHTML =
      breakRow +
      items.map((item,index) => {
        const status = String(item?.status || "").toLowerCase();
        const isPlaying = status === "playing";

        return `
          <div
            class="ts-run-order-row${isPlaying ? " is-playing" : ""}"
            data-ts-run-details="${esc(item.id)}"
            title="${isPlaying ? "Currently playing" : "View singer/request details"}">

            <div class="ts-run-index">${index + 1}</div>

            <div class="ts-run-main">
              <strong>${esc(item.songTitle || item.title || item.songId || "Untitled Song")}</strong>
              <small>
                ${esc(item.singerName || (item.source === "manual" ? "Host choice" : item.artist || ""))}
                ${isPlaying ? `<em class="ts-playing-label">PLAYING</em>` : ""}
              </small>
            </div>

            <div class="ts-run-actions">
              ${
                showPlayButtons
                  ? `<button
                      type="button"
                      class="play-song"
                      data-ts-play="${esc(item.id)}"
                      title="Open this song"
                      aria-label="Open this song"
                    >▶</button>`
                  : ""
              }

              <button type="button" data-ts-up="${esc(item.id)}" title="Move up" aria-label="Move song up">↑</button>
              <button type="button" data-ts-down="${esc(item.id)}" title="Move down" aria-label="Move song down">↓</button>
              <button type="button" class="abandon" data-ts-abandon-run="${esc(item.id)}" title="Singer left / song abandoned" aria-label="Mark song abandoned">⊘</button>
              <button type="button" class="remove" data-ts-remove="${esc(item.id)}" title="Remove from Run Order" aria-label="Remove song from Run Order">✕</button>
            </div>
          </div>
        `;
      }).join("");
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

  function inferLinkedEvent() {
    if (!state.session || !Array.isArray(state.upcomingEvents)) return null;
    const venue = String(state.session.venue || state.currentControl?.venue || "").trim().toLowerCase();
    const title = String(state.session.title || state.currentControl?.title || "").trim().toLowerCase();
    const started = actualStartDate();
    const candidates = state.upcomingEvents.filter(event => {
      const eventVenue = String(event.venue || "").trim().toLowerCase();
      const eventTitle = String(event.name || event.title || "").trim().toLowerCase();
      const venueMatch = venue && eventVenue === venue;
      const titleMatch = title && (eventTitle === title || title.includes(eventTitle) || eventTitle.includes(title));
      if (!venueMatch && !titleMatch) return false;
      if (!started || !event.date) return true;
      const eventDay = new Date(`${event.date}T12:00:00`);
      return !Number.isNaN(eventDay.getTime()) && Math.abs(eventDay.getTime() - started.getTime()) < 36 * 60 * 60 * 1000;
    });
    if (candidates.length === 1) return candidates[0];
    const exact = candidates.filter(event => String(event.venue || "").trim().toLowerCase() === venue && String(event.name || event.title || "").trim().toLowerCase() === title);
    return exact.length === 1 ? exact[0] : null;
  }

  function subscribeLinkedEvent(eventId) {
    let cleanId = String(eventId || "").trim();

    if (!cleanId) {
      const inferred = inferLinkedEvent();
      if (inferred) {
        clearLinkedEventSubscription();
        state.linkedEventId = inferred.id || "inferred";
        state.linkedEvent = inferred;
        renderRemaining();
        return;
      }
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
    state.notifications = [];
    state.notificationUnread = 0;
    state.knownNotificationIds = new Set();
    state.lastRunStatuses = new Map();
    state.runOrderSnapshotReady = false;
    publishSharedSession();

    if (!sessionId) {
      clearLinkedEventSubscription();
      state.requestSnapshotReady = false;
      state.knownRequestIds = new Set();
      state.lastBreakOpen = null;
      renderRemaining();
      renderPending();
      renderRunOrder();
      renderCompactHostStrip();
      renderNotifications();
      return;
    }

    state.sessionUnsubs.push(
      state.db.collection("performanceSessions").doc(sessionId).onSnapshot(doc => {
        state.session = doc.exists ? { id:doc.id, ...(doc.data() || {}) } : null;
        publishSharedSession();
        syncNotificationsFromSession();
        trackBreakStateNotification();

        subscribeLinkedEvent(
          state.session?.eventId ||
          state.currentControl?.eventId ||
          ""
        );

        renderRemaining();
        renderCompactHostStrip();
            renderNotifications();
      }, console.warn)
    );

    state.sessionUnsubs.push(
      state.db.collection("publicSongRequests")
        .where("sessionId","==",sessionId)
        .onSnapshot(snapshot => {
          const nextRequests = snapshot.docs.map(doc => ({id:doc.id,...(doc.data() || {})}));
          if (state.requestSnapshotReady) {
            nextRequests.forEach(req => {
              if (!state.knownRequestIds.has(req.id) && isPendingRequest(req)) {
                pushNotification(
                  `New request: ${req.songTitle || req.title || "Song"} — ${req.singerName || req.name || "Singer"}`,
                  `request:new:${req.id}`,
                  "request",
                  {
                    requestId:req.id,
                    songTitle:req.songTitle || req.title || "",
                    singerName:req.singerName || req.name || ""
                  }
                );
              }
            });
          }
          state.requests = nextRequests;
          state.knownRequestIds = new Set(nextRequests.map(req => req.id));
          state.requestSnapshotReady = true;
          renderPending();
          renderCompactHostStrip();
          renderNotifications();
        }, console.warn)
    );
  }

  function startListeners() {
    state.globalUnsubs.push(
      state.db.collection("karaokeControl").doc("currentSession").onSnapshot(doc => {
        const data = doc.exists ? (doc.data() || {}) : {};
        state.currentControl = data;

        const candidateSessionId = data.sessionId || data.activeSessionId || "";
        const sessionId = (data.active === false && !data.activeSessionId) ? "" : candidateSessionId;

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
            renderNotifications();
      }, console.warn)
    );

    state.globalUnsubs.push(
      state.db.collection("karaokeControl").doc("runOrder").onSnapshot(doc => {
        state.runOrder = doc.exists
          ? {sessionId:"",items:[],...(doc.data() || {})}
          : {sessionId:"",items:[]};

        trackRunOrderActivity(queueItems());
        renderRunOrder();

        window.dispatchEvent(new CustomEvent("lk:runorder-updated", {
          detail: {
            sessionId: state.runOrder.sessionId || "",
            items: queueItems().map(item => ({...item}))
          }
        }));
      }, console.warn)
    );

    state.globalUnsubs.push(
      state.db.collection("karaokeControl").doc("publicSongList").onSnapshot(doc => {
        renderPublicSetlistName(doc.exists ? (doc.data() || {}) : {});
      }, console.warn)
    );

    state.globalUnsubs.push(
      state.db.collection("upcomingEvents").onSnapshot(snapshot => {
        state.upcomingEvents = snapshot.docs.map(doc => ({ id:doc.id, ...(doc.data() || {}) }));
        if (state.sessionId && !state.session?.eventId && !state.currentControl?.eventId) {
          subscribeLinkedEvent("");
        }
      }, error => console.warn("Could not load upcoming events for schedule fallback:", error))
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

  function setInfoTab(tabName) {
    const tab =
      ["session","notifications","notes"].includes(tabName)
        ? tabName
        : "session";

    const controls = [
      ["session", $("tsSessionStatusTab"), $("tsSessionStatusPane")],
      ["notifications", $("tsNotificationsTab"), $("tsNotificationsPane")],
      ["notes", $("tsNotesTab"), $("tsNotesPane")]
    ];

    controls.forEach(([name, button, pane]) => {
      const active = name === tab;

      button?.classList.toggle("active", active);
      button?.setAttribute("aria-selected", String(active));

      if (pane) {
        pane.hidden = !active;
        pane.classList.toggle("active", active);
      }
    });

    if (tab === "notifications") {
      markNotificationsRead();
    }
  }

  function initialiseInfoTabs() {
    const bar = $("topStatusBar");
    if (!bar || bar.dataset.infoTabsBound === "1") return;

    bar.dataset.infoTabsBound = "1";
    setInfoTab("session");

    bar.addEventListener("click", event => {
      const button = event.target.closest("[data-ts-info-tab]");
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      setInfoTab(button.dataset.tsInfoTab);
    });
  }


  function setWorkflowTab(tabName) {
    const tab = tabName === "runorder" ? "runorder" : "pending";

    const pendingBtn = $("tsPendingTab");
    const runBtn = $("tsRunOrderTab");
    const pendingPane = $("tsPendingPane");
    const runPane = $("tsRunOrderPane");

    const showPending = tab === "pending";

    pendingBtn?.classList.toggle("active", showPending);
    runBtn?.classList.toggle("active", !showPending);
    pendingBtn?.setAttribute("aria-selected", String(showPending));
    runBtn?.setAttribute("aria-selected", String(!showPending));

    if (pendingPane) {
      pendingPane.hidden = !showPending;
      pendingPane.classList.toggle("active", showPending);
    }

    if (runPane) {
      runPane.hidden = showPending;
      runPane.classList.toggle("active", !showPending);
    }
  }

  function initialiseWorkflowTabs() {
    const bar = $("topStatusBar");
    if (!bar || bar.dataset.workflowTabsBound === "1") return;

    bar.dataset.workflowTabsBound = "1";
    setWorkflowTab("pending");

    bar.addEventListener("click", event => {
      const button = event.target.closest("[data-ts-workflow-tab]");
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      setWorkflowTab(button.dataset.tsWorkflowTab);
    });
  }

  function openRunOrderTab() {
    const bar = $("topStatusBar");
    bar?.classList.remove("collapsed");
    setWorkflowTab("runorder");
    syncStatusToggleUi();
  }

  function bindUi() {
    if (state.uiBound) return;
    state.uiBound = true;

    document.addEventListener("click", event => {
      const play = event.target.closest("[data-ts-play]");
      if (play) {
        event.preventDefault();
        event.stopPropagation();
        return openRunOrderSong(play.dataset.tsPlay);
      }

      const closeDetails = event.target.closest("#tsRunDetailsClose");
      if (closeDetails || event.target.id === "tsRunOrderDetailsModal") {
        event.preventDefault();
        event.stopPropagation();
        closeRunOrderDetails();
        return;
      }

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

      const details = event.target.closest("[data-ts-run-details]");
      if (details) {
        event.preventDefault();
        openRunOrderDetails(details.dataset.tsRunDetails);
      }
    });

    $("tsRunOrderAddBtn")?.addEventListener("click",addManualSong);

    window.LK = window.LK || {};
    window.LK.topStatus = window.LK.topStatus || {};
    // top-statusbar.js remains the single writer for Break actions and Session Notes.
  }

  function waitForInjectedMarkup() {
    if ($("topStatusBar")) {
      initialiseStatusToggle();
      initialiseInfoTabs();
      initialiseWorkflowTabs();
      bindUi();
      renderRemaining();
      renderPending();
      renderRunOrder();
      renderSongSelect();
      renderCompactHostStrip();
      renderNotifications();
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
  LK.sessionTools.getSession = () => state.session ? { ...state.session } : null;
  LK.sessionTools.openRunOrderTab = openRunOrderTab;
  LK.sessionTools.setWorkflowTab = setWorkflowTab;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",init);
  } else {
    init();
  }
})();
