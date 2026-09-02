(function () {
  function calculateBreakMs(session) {
    let total = 0;
    (session?.breaks || []).forEach(b => {
      const start = LK.dashboard.getDateFromTimestamp(b.start);
      const end = LK.dashboard.getDateFromTimestamp(b.end) || new Date();
      if (start) total += Math.max(0, end - start);
    });
    return total;
  }

  function ensureDashboardLayout() {
    const dash = $("sessionDashboard");
    if (!dash || dash.dataset.layoutReady === "1") return dash;

    dash.innerHTML = `
      <div class="dashboard-grid">
        <div class="dashboard-card"><strong>Completed</strong><span id="sdCompleted">0</span></div>
        <div class="dashboard-card"><strong>Abandoned</strong><span id="sdAbandoned">0</span></div>
        <div class="dashboard-card"><strong>Deleted</strong><span id="sdDeleted">0</span></div>
        <div class="dashboard-card"><strong>Songs Left Active</strong><span id="sdLeft">0</span></div>
        <div class="dashboard-card"><strong>Total Requests</strong><span id="sdTotal">0</span></div>
      </div>`;

    dash.dataset.layoutReady = "1";
    return dash;
  }

  function setDashValue(id, value) {
    const el = $(id);
    if (el && el.textContent !== String(value)) {
      el.textContent = String(value);
    }
  }

  function scheduledStartDate(session) {
    const direct = LK.dashboard.getDateFromTimestamp(session?.scheduledStartAt);
    if (direct) return direct;

    const snapshot = session?.eventSnapshot || {};
    if (snapshot.date && snapshot.startTime) {
      const parsed = new Date(`${snapshot.date}T${snapshot.startTime}:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  }

  function varianceText(started, scheduled) {
    if (!started || !scheduled) return { text:"", state:"" };

    const diffMinutes = Math.round((started.getTime() - scheduled.getTime()) / 60000);

    if (Math.abs(diffMinutes) < 1) {
      return { text:"On time", state:"" };
    }

    const abs = Math.abs(diffMinutes);
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;

    let duration = "";
    if (hours) duration += `${hours}hr${hours === 1 ? "" : "s"}`;
    if (mins) duration += `${hours ? " " : ""}${mins}min${mins === 1 ? "" : "s"}`;

    return diffMinutes > 0
      ? { text:`${duration} late`, state:"is-late" }
      : { text:`${duration} early`, state:"is-early" };
  }

  function updateLiveSessionDetails(session, started, elapsedMs, playingMs, breakMs, avgBpm) {
    if (!session) return;

    const scheduled = scheduledStartDate(session);
    const variance = varianceText(started, scheduled);

    setDashValue("sessionNameLiveLabel", session.title || session.eventSnapshot?.name || "-");
    setDashValue("sessionStatusLiveLabel", "Active Session");
    setDashValue("sessionStartedLiveLabel", LK.dashboard.formatTime(started));
    setDashValue(
      "sessionScheduledLiveLabel",
      scheduled ? LK.dashboard.formatTime(scheduled) : "-"
    );
    setDashValue("sessionElapsedLiveLabel", LK.dashboard.formatDuration(elapsedMs));
    setDashValue("sessionPlayLiveLabel", LK.dashboard.formatDuration(playingMs));
    setDashValue(
      "sessionBreaksLiveLabel",
      `${(session.breaks || []).length} (${LK.dashboard.formatDuration(breakMs)})`
    );
    setDashValue("sessionAvgBpmLiveLabel", avgBpm);
    setDashValue(
      "sessionDateLiveLabel",
      scheduled
        ? LK.dashboard.formatDate(scheduled)
        : LK.dashboard.formatDate(started)
    );

    const varianceEl = $("sessionStartVarianceLabel");
    if (varianceEl) {
      varianceEl.textContent = variance.text;
      varianceEl.classList.toggle("is-late", variance.state === "is-late");
      varianceEl.classList.toggle("is-early", variance.state === "is-early");
    }
  }

  function updateDashboard(session) {
    ensureDashboardLayout();

    const requests = LK.state.currentRequests || [];

    const completed = requests.filter(r =>
      ["completed","played"].includes(String(r.status || "").toLowerCase())
    ).length;

    const abandoned = requests.filter(r =>
      String(r.status || "").toLowerCase() === "abandoned"
    ).length;

    const deleted = requests.filter(r =>
      ["deleted","deletedbyhost","declined"].includes(String(r.status || "").toLowerCase())
    ).length;

    const left = requests.filter(r =>
      !r.status ||
      ["active","pending","waiting","queued","accepted"].includes(String(r.status).toLowerCase())
    ).length;

    setDashValue("sdCompleted", completed);
    setDashValue("sdAbandoned", abandoned);
    setDashValue("sdDeleted", deleted);
    setDashValue("sdLeft", left);
    setDashValue("sdTotal", requests.length);

    if (!session) return;

    const started = LK.dashboard.getDateFromTimestamp(session.startedAt);
    const breakMs = calculateBreakMs(session);
    const elapsedMs = started ? Math.max(0, Date.now() - started.getTime()) : 0;
    const playingMs = Math.max(0, elapsedMs - breakMs);

    const avgBpmArr = requests
      .map(r => Number(r.userBpm || r.songUserBpm || r.bpm))
      .filter(Boolean);

    const avgBpm = avgBpmArr.length
      ? Math.round(avgBpmArr.reduce((a,b) => a + b, 0) / avgBpmArr.length)
      : "-";

    updateLiveSessionDetails(
      session,
      started,
      elapsedMs,
      playingMs,
      breakMs,
      avgBpm
    );
  }

  function setSessionStatus(message) {
    if ($("sessionActionStatus")) $("sessionActionStatus").innerText = message || "";
    if (message) LK.dashboard.logAdmin(message);
  }

  async function confirmStartPerformance() {
  const ok = await LK.dashboard.showConfirm(
    "Start Session?",
    "Start the session linked to the selected upcoming gig?"
  );

  if (!ok) return;

  await startPerformance();
}

  async function confirmEndPerformance() {
    if (await LK.dashboard.showConfirm("End Session?", "This will end the current session. Are you sure?")) {
      endPerformance();
    }
  }

  async function startPerformance() {
    const event =
      typeof window.getSelectedSessionEvent === "function"
        ? window.getSelectedSessionEvent()
        : null;

    if (!event?.id) {
      setSessionStatus("Choose an Upcoming Event before starting the Session.");
      $("sessionEventSelect")?.focus();
      return;
    }

    const title =
      event.name ||
      `${event.type || "Performance"}${event.venue ? ` @ ${event.venue}` : ""}`;

    const venue = event.venue || "Unknown Venue";
    const sessionType = event.type || "Other";
    const notes = $("sessionNotesInput")?.value || event.notes || "";

    const localStartedAt = nowTimestamp();

    const eventSnapshot = {
      id: event.id || "",
      name: event.name || "",
      title,
      type: sessionType,
      venue,
      address: event.address || "",
      date: event.date || "",
      startTime: event.startTime || "",
      endTime: event.endTime || "",
      arrivalTime: event.arrivalTime || "",
      contactName: event.contactName || "",
      contact: event.contact || "",
      notes: event.notes || ""
    };

    const scheduleStart = event.date && event.startTime
      ? new Date(`${event.date}T${event.startTime}:00`)
      : null;

    let scheduleEnd = event.date && event.endTime
      ? new Date(`${event.date}T${event.endTime}:00`)
      : null;

    if (scheduleStart && scheduleEnd && scheduleEnd <= scheduleStart) {
      scheduleEnd = new Date(scheduleEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    const scheduledStartAt =
      scheduleStart && !Number.isNaN(scheduleStart.getTime())
        ? firebase.firestore.Timestamp.fromDate(scheduleStart)
        : null;

    const scheduledEndAt =
      scheduleEnd && !Number.isNaN(scheduleEnd.getTime())
        ? firebase.firestore.Timestamp.fromDate(scheduleEnd)
        : null;

    const sessionPayload = {
      title,
      venue,
      type: sessionType,
      sessionType,
      eventId: event.id,
      eventSnapshot,
      notes,
      status: "active",
      isActive: true,
      breakOpen: false,
      startedAt: serverNow(),
      endedAt: null,
      breaks: [],
      createdAt: serverNow(),
      updatedAt: serverNow()
    };

    if (scheduledStartAt) sessionPayload.scheduledStartAt = scheduledStartAt;
    if (scheduledEndAt) sessionPayload.scheduledEndAt = scheduledEndAt;

    const ref = await LK.db.collection("performanceSessions").add(sessionPayload);

    LK.state.currentSessionId = ref.id;
    LK.state.currentSessionData = {
      id: ref.id,
      ...sessionPayload,
      startedAt: localStartedAt
    };

    updateSessionUi(LK.state.currentSessionData);

    const controlPayload = {
      active: true,
      sessionId: ref.id,
      activeSessionId: ref.id,
      eventId: event.id,
      title,
      venue,
      type: sessionType,
      sessionType,
      eventSnapshot,
      startedAt: serverNow(),
      updatedAt: serverNow()
    };

    if (scheduledStartAt) controlPayload.scheduledStartAt = scheduledStartAt;
    if (scheduledEndAt) controlPayload.scheduledEndAt = scheduledEndAt;

    await LK.db.collection("karaokeControl").doc("currentSession").set(
      controlPayload,
      { merge: true }
    );

    // A Performance Session is the authoritative live state.
    await LK.db.collection("karaoke").doc("state").set({
      isLive: true,
      manualOverride: true,
      updatedAt: serverNow()
    }, { merge:true });

    setSessionStatus(`Session started: ${title}`);
  }

  async function endPerformance() {
  console.log("END session clicked", {
    LK,
    db: LK?.db,
    currentSessionId: LK.state.currentSessionId
  });

  if (!LK.state.currentSessionId) {
    setSessionStatus("No active session to end.");
    return;
  }

  await LK.db.collection("performanceSessions").doc(LK.state.currentSessionId).set({
    status: "ended",
    isActive: false,
    breakOpen: false,
    endedAt: serverNow(),
    updatedAt: serverNow()
  }, { merge: true });

  await LK.db.collection("karaokeControl").doc("currentSession").set({
    active: false,
    sessionId: null,
    activeSessionId: null,
    eventId: null,
    title: "",
    venue: "",
    type: "",
    sessionType: "",
    updatedAt: serverNow()
  }, { merge: true });

  await LK.db.collection("karaoke").doc("state").set({
    isLive: false,
    manualOverride: true,
    updatedAt: serverNow()
  }, { merge:true });

  LK.state.currentSessionId = null;
  LK.state.currentSessionData = null;
  updateSessionUi(null);
  LK.requests.listenRequestsForSession(null);

  setSessionStatus("Session ended.");
}

  async function startBreak() {
console.log("START break clicked", {
  LK,
  db: LK?.db,
});
    const session = LK.state.currentSessionData;
    if (!LK.state.currentSessionId || !session) return;
    const breaks = [...(session.breaks || [])];
    if (breaks.length && !breaks[breaks.length - 1].end) return;
    breaks.push({ start: nowTimestamp(), end: null });
    await LK.db.collection("performanceSessions").doc(LK.state.currentSessionId).set({ breaks, breakOpen: true, updatedAt: serverNow() }, { merge: true });
    setSessionStatus("Break started.");
  }

  async function endBreak() {
console.log("END break clicked", {
  LK,
  db: LK?.db,
});
    const session = LK.state.currentSessionData;
    if (!LK.state.currentSessionId || !session) return;
    const breaks = [...(session.breaks || [])];
    if (!breaks.length || breaks[breaks.length - 1].end) return;
    breaks[breaks.length - 1].end = nowTimestamp();
    await LK.db.collection("performanceSessions").doc(LK.state.currentSessionId).set({ breaks, breakOpen: false, updatedAt: serverNow() }, { merge: true });
    setSessionStatus("Break ended.");
  }

  function saveSessionNotesLive() {
    if (!LK.state.currentSessionId) return;
    clearTimeout(LK.state.notesSaveTimer);
    LK.state.notesSaveTimer = setTimeout(async () => {
      await LK.db.collection("performanceSessions").doc(LK.state.currentSessionId).set({
        notes: $("sessionNotesInput")?.value || "",
        updatedAt: serverNow()
      }, { merge: true });
      setSessionStatus("Notes autosaved.");
    }, 700);
  }

  function editActiveSessionDetails() {
    // Session identity comes from its linked Upcoming Event and is read-only.
  }

  function listenCurrentSession() {
    let boundSessionId = "";

    LK.db.collection("karaokeControl").doc("currentSession").onSnapshot(snap => {
      const data = snap.data() || {};
      const nextSessionId =
        data.active === true
          ? (data.sessionId || data.activeSessionId || "")
          : "";

      if (!nextSessionId) {
        boundSessionId = "";

        if (LK.state.sessionUnsubscribe) {
          LK.state.sessionUnsubscribe();
          LK.state.sessionUnsubscribe = null;
        }

        LK.state.currentSessionId = null;
        LK.state.currentSessionData = null;
        updateSessionUi(null);
        LK.requests.listenRequestsForSession(null);
        return;
      }

      LK.state.currentSessionId = nextSessionId;

      if (boundSessionId === nextSessionId && LK.state.sessionUnsubscribe) {
        return;
      }

      boundSessionId = nextSessionId;

      if (LK.state.sessionUnsubscribe) {
        LK.state.sessionUnsubscribe();
      }

      LK.requests.listenRequestsForSession(nextSessionId);

      LK.state.sessionUnsubscribe = LK.db
        .collection("performanceSessions")
        .doc(nextSessionId)
        .onSnapshot(sessionSnap => {
          if (!sessionSnap.exists) {
            LK.state.currentSessionData = null;
            updateSessionUi(null);
            return;
          }

          LK.state.currentSessionData = {
            id: sessionSnap.id,
            ...sessionSnap.data()
          };

          updateSessionUi(LK.state.currentSessionData);
          LK.dashboard.updateStatusStrip();
        });
    });
  }

  function updateSessionUi(session) {
    const active = !!(session && session.status !== "ended");
    if ($("sessionSetupFields")) $("sessionSetupFields").style.display = active ? "none" : "block";
    if ($("activeSessionLabels")) $("activeSessionLabels").classList.toggle("hidden", !active);

    if (active) {
      if ($("sessionNotesInput") && document.activeElement !== $("sessionNotesInput")) {
        $("sessionNotesInput").value = session.notes || "";
      }
    }

    const breaks = session?.breaks || [];
    const inBreak = !!(breaks.length && !breaks[breaks.length - 1].end);
    if ($("startPerformanceBtn")) $("startPerformanceBtn").disabled = active;
    if ($("startBreakBtn")) $("startBreakBtn").disabled = !active || inBreak;
    if ($("endBreakBtn")) $("endBreakBtn").disabled = !active || !inBreak;
    if ($("endPerformanceBtn")) $("endPerformanceBtn").disabled = !active;
    updateDashboard(session);
  }

  function initSessions() {
    updateSessionUi(null);
    listenCurrentSession();
    $("sessionNotesInput")?.removeEventListener("input", saveSessionNotesLive);
    $("sessionNotesInput")?.addEventListener("input", saveSessionNotesLive);
  }

  LK.sessions = { initSessions, listenCurrentSession, updateDashboard, setSessionStatus };
  window.confirmStartPerformance = confirmStartPerformance;
  window.confirmEndPerformance = confirmEndPerformance;
  window.startBreak = startBreak;
  window.endBreak = endBreak;
  window.editActiveSessionDetails = editActiveSessionDetails;
})();
