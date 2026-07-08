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

  function updateDashboard(session) {
    const dash = $("sessionDashboard");
    if (!dash) return;

    if (!session) {
      dash.innerHTML = `
        <div class="dashboard-grid">
          <div class="dashboard-card"><strong>Status</strong><span>No active session</span></div>
          <div class="dashboard-card"><strong>Breaks</strong><span>0 (0 mins)</span></div>
        </div>`;
      return;
    }

    const started = LK.dashboard.getDateFromTimestamp(session.startedAt);
    const breakMs = calculateBreakMs(session);
    const elapsedMs = started ? Date.now() - started.getTime() : 0;
    const playingMs = Math.max(0, elapsedMs - breakMs);
    const requests = LK.state.currentRequests || [];
    const completed = requests.filter(r => r.status === "completed").length;
    const abandoned = requests.filter(r => r.status === "abandoned").length;
    const deleted = requests.filter(r => r.status === "deleted").length;
    const left = requests.filter(r => !r.status || r.status === "active" || r.status === "pending" || r.status === "waiting").length;
    const avgBpmArr = requests.map(r => Number(r.userBpm || r.songUserBpm || r.bpm)).filter(Boolean);
    const avgBpm = avgBpmArr.length ? Math.round(avgBpmArr.reduce((a, b) => a + b, 0) / avgBpmArr.length) : "-";

    dash.innerHTML = `
      <div class="dashboard-grid">
        <div class="dashboard-card"><strong>Status</strong><span>Active Session</span></div>
        <div class="dashboard-card"><strong>Started</strong><span>${LK.dashboard.formatTime(started)}</span></div>
        <div class="dashboard-card"><strong>Elapsed incl. breaks</strong><span>${LK.dashboard.formatDuration(elapsedMs)}</span></div>
        <div class="dashboard-card"><strong>Total Breaks</strong><span>${(session.breaks || []).length} (${LK.dashboard.formatDuration(breakMs)})</span></div>
        <div class="dashboard-card"><strong>Play Time excl. breaks</strong><span>${LK.dashboard.formatDuration(playingMs)}</span></div>
        <div class="dashboard-card"><strong>Completed</strong><span>${completed}</span></div>
        <div class="dashboard-card"><strong>Abandoned</strong><span>${abandoned}</span></div>
        <div class="dashboard-card"><strong>Deleted</strong><span>${deleted}</span></div>
        <div class="dashboard-card"><strong>Songs Left Active</strong><span>${left}</span></div>
        <div class="dashboard-card"><strong>Total Requests</strong><span>${requests.length}</span></div>
        <div class="dashboard-card"><strong>Average BPM</strong><span>${avgBpm}</span></div>
        <div class="dashboard-card"><strong>Date</strong><span>${LK.dashboard.formatDate(started)}</span></div>
      </div>`;
  }

  function setSessionStatus(message) {
    if ($("sessionActionStatus")) $("sessionActionStatus").innerText = message || "";
    if (message) LK.dashboard.logAdmin(message);
  }

  async function confirmStartPerformance() {
    if (await LK.dashboard.showConfirm("Start Performance?", "This will start a new performance session and attach new song requests to it.")) {
      ormance();
    }
  }

  async function confirmEndPerformance() {
    if (await LK.dashboard.showConfirm("End Performance?", "This will end the current session. Are you sure?")) {
      endPerformance();
    }
  }

  async function startPerformance() {

console.log("START session clicked", {
  LK,
  db: LK?.db,
  titleInput: $("sessionTitleInput"),
  venueInput: $("venueInput")
});

    const title = $("sessionTitleInput")?.value.trim() || "Untitled Session";
    const venue = $("venueInput")?.value.trim() || "Unknown Venue";
    const notes = $("sessionNotesInput")?.value || "";

    const ref = await LK.db.collection("performanceSessions").add({
      title,
      venue,
      notes,
      status: "active",
      isActive: true,
      breakOpen: false,
      startedAt: serverNow(),
      endedAt: null,
      breaks: [],
      createdAt: serverNow(),
      updatedAt: serverNow()
    });

    LK.state.currentSessionId = ref.id;

    await LK.db.collection("karaokeControl").doc("currentSession").set({
      active: true,
      sessionId: ref.id,
      activeSessionId: ref.id,
      title,
      venue,
      updatedAt: serverNow()
    }, { merge: true });

    setSessionStatus("Performance started.");
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
    title: "",
    venue: "",
    updatedAt: serverNow()
  }, { merge: true });

  LK.state.currentSessionId = null;
  LK.state.currentSessionData = null;

  setSessionStatus("Performance ended.");
}

  async function startBreak() {
console.log("START break clicked", {
  LK,
  db: LK?.db,
  titleInput: $("sessionTitleInput"),
  venueInput: $("venueInput")
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
  titleInput: $("sessionTitleInput"),
  venueInput: $("venueInput")
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
    const session = LK.state.currentSessionData;
    if (!session) return;
    $("sessionSetupFields").style.display = "block";
    $("sessionTitleInput").value = session.title || "";
    $("venueInput").value = session.venue || "";
  }

  function listenCurrentSession() {
    LK.db.collection("karaokeControl").doc("currentSession").onSnapshot(snap => {
      const data = snap.data() || {};
      if (!data.active || !data.sessionId) {
        LK.state.currentSessionId = null;
        LK.state.currentSessionData = null;
        updateSessionUi(null);
        LK.requests.listenRequestsForSession(null);
        return;
      }

      LK.state.currentSessionId = data.sessionId;
      if (LK.state.sessionUnsubscribe) LK.state.sessionUnsubscribe();

      LK.state.sessionUnsubscribe = LK.db.collection("performanceSessions").doc(LK.state.currentSessionId).onSnapshot(s => {
        if (!s.exists) {
          updateSessionUi(null);
          return;
        }
        LK.state.currentSessionData = { id: s.id, ...s.data() };
        updateSessionUi(LK.state.currentSessionData);
        LK.requests.listenRequestsForSession(LK.state.currentSessionId);
        LK.dashboard.updateStatusStrip();
      });
    });
  }

  function updateSessionUi(session) {
    const active = !!(session && session.status !== "ended");
    if ($("sessionSetupFields")) $("sessionSetupFields").style.display = active ? "none" : "block";
    if ($("activeSessionLabels")) $("activeSessionLabels").classList.toggle("hidden", !active);

    if (active) {
      if ($("sessionTitleLabel")) $("sessionTitleLabel").innerText = session.title || "";
      if ($("venueLabel")) $("venueLabel").innerText = session.venue || "";
      if ($("sessionNotesInput") && document.activeElement !== $("sessionNotesInput")) $("sessionNotesInput").value = session.notes || "";
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
    listenCurrentSession();
    $("sessionNotesInput")?.removeEventListener("input", saveSessionNotesLive);
    $("sessionNotesInput")?.addEventListener("input", saveSessionNotesLive);
    updateDashboard(null);
  }

  LK.sessions = { initSessions, listenCurrentSession, updateDashboard, setSessionStatus };
  window.confirmStartPerformance = confirmStartPerformance;
  window.confirmEndPerformance = confirmEndPerformance;
  window.startBreak = startBreak;
  window.endBreak = endBreak;
  window.editActiveSessionDetails = editActiveSessionDetails;
})();
