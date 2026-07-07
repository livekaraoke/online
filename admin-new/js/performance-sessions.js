/************************************************************
 * PERFORMANCE SESSIONS VIEWER
 ************************************************************/

const firebaseConfig = {
  apiKey: "AIzaSyC4gSodXM35E2ZdYaz6mrCvTUYzW75ZCBk",
  authDomain: "livekaraokemt.firebaseapp.com",
  projectId: "livekaraokemt",
  storageBucket: "livekaraokemt.firebasestorage.app",
  messagingSenderId: "425980659562",
  appId: "1:425980659562:web:892ddcd53fb209d1114713"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

let sessions = [];
let requests = [];
let filteredSessions = [];
let currentSessionPointer = null;
let page = 1;
let pageSize = 8;
let unsubscribeSessions = null;
let unsubscribeRequests = null;
let unsubscribeCurrent = null;

function $(id) { return document.getElementById(id); }
function escapeHTML(v) { return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function toDate(v) { if (!v) return null; if (v.toDate) return v.toDate(); return new Date(v); }
function msToMinutes(ms) { return Math.max(0, Math.floor(ms / 60000)); }
function formatTime(d) { return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–"; }
function formatDate(d) { return d ? d.toLocaleDateString("en-GB") : "–"; }
function slug(v) { return String(v || "").toLowerCase(); }

function adminLogin() {
  const email = $("emailInput")?.value.trim() || "";
  const pass = $("passwordInput")?.value || "";
  const err = $("passwordError");
  if (err) err.textContent = "Checking...";
  auth.signInWithEmailAndPassword(email, pass).catch(error => {
    console.error(error);
    if (err) err.textContent = "Incorrect email or password";
  });
}

function adminLogout() { auth.signOut(); }
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;

auth.onAuthStateChanged(user => {
  if (user) {
    $("passwordGate").style.display = "none";
    $("appShell").style.display = "grid";
    initPage();
  } else {
    $("passwordGate").style.display = "flex";
    $("appShell").style.display = "none";
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && $("passwordGate")?.style.display !== "none") adminLogin();
});

function initPage() {
  setDefaultDates();
  listenCurrentSessionPointer();
  listenSessions();
  listenRequests();
}

async function deleteSession(sessionId) {
  if (!sessionId) return;

  const ok = confirm(
    "Delete this performance session?\n\nThis will also delete its related request records and performance logs."
  );

  if (!ok) return;

  try {
    const batch = db.batch();

    // Delete session document
    const sessionRef = db.collection("performanceSessions").doc(sessionId);
    batch.delete(sessionRef);

    // Delete public song requests linked to this session
    const requestsSnap = await db.collection("publicSongRequests")
      .where("sessionId", "==", sessionId)
      .get();

    requestsSnap.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete performance logs linked to this session
    const logsSnap = await db.collection("performanceLogs")
      .where("sessionId", "==", sessionId)
      .get();

    logsSnap.forEach(doc => {
      batch.delete(doc.ref);
    });

    // If deleted session is current active session, clear it
    const currentSnap = await db.collection("karaokeControl")
      .doc("currentSession")
      .get();

    const current = currentSnap.exists ? currentSnap.data() : null;

    if (current && current.sessionId === sessionId) {
      batch.set(
        db.collection("karaokeControl").doc("currentSession"),
        {
          active: false,
          sessionId: null,
          title: "",
          venue: "",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    await batch.commit();

    alert("Session deleted.");

  } catch (error) {
    console.error(error);
    alert("Could not delete session: " + error.message);
  }
}

window.deleteSession = deleteSession;

function setDefaultDates() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 31);
  $("dateFromInput").value = from.toISOString().slice(0, 10);
  $("dateToInput").value = now.toISOString().slice(0, 10);
}



function listenCurrentSessionPointer() {
  if (unsubscribeCurrent) unsubscribeCurrent();
  unsubscribeCurrent = db.collection("karaokeControl").doc("currentSession").onSnapshot(doc => {
    currentSessionPointer = doc.exists ? doc.data() : null;
    applyFilters();
  });
}

function listenSessions() {
  if (unsubscribeSessions) unsubscribeSessions();
  unsubscribeSessions = db.collection("performanceSessions").onSnapshot(snapshot => {
    sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    applyFilters();
  }, error => {
    console.error(error);
    alert("Could not load performanceSessions. Check Firebase permissions.");
  });
}

function listenRequests() {
  if (unsubscribeRequests) unsubscribeRequests();
  unsubscribeRequests = db.collection("publicSongRequests").onSnapshot(snapshot => {
    requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    applyFilters();
  }, error => {
    console.error(error);
    alert("Could not load publicSongRequests. Check Firebase permissions.");
  });
}

function getSessionRequests(sessionId) {
  return requests.filter(r => r.sessionId === sessionId);
}

function requestStats(sessionId) {
  const list = getSessionRequests(sessionId);
  const completed = list.filter(r => r.status === "completed").length;
  const abandoned = list.filter(r => r.status === "abandoned").length;
  const deleted = list.filter(r => r.status === "deleted").length;
  const left = list.filter(r => !r.status || r.status === "active" || r.status === "pending" || r.status === "waiting").length;
  const total = list.length;
  const bpms = list.map(r => Number(r.userBpm || r.songUserBpm || r.bpm)).filter(Boolean);
  const avgBpm = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : 0;
  return { list, completed, abandoned, deleted, left, total, avgBpm };
}

function breakMs(session) {
  return (session.breaks || []).reduce((sum, b) => {
    const start = toDate(b.start);
    const end = toDate(b.end) || new Date();
    return start ? sum + Math.max(0, end - start) : sum;
  }, 0);
}

function durationMs(session) {
  const start = toDate(session.startedAt || session.createdAt);
  const end = toDate(session.endedAt) || new Date();
  return start ? Math.max(0, end - start) : 0;
}

function enrichedSession(session) {
  const stats = requestStats(session.id);
  const totalMs = durationMs(session);
  const noBreakMs = Math.max(0, totalMs - breakMs(session));
  const completionRate = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
  const startedAt = toDate(session.startedAt || session.createdAt);
  const endedAt = toDate(session.endedAt);
  const active = session.isActive === true || session.status === "active" || (currentSessionPointer?.active && currentSessionPointer?.sessionId === session.id);
  return { ...session, ...stats, totalMs, noBreakMs, completionRate, startedAt, endedAt, active };
}

function applyFilters() {
  const fromVal = $("dateFromInput")?.value;
  const toVal = $("dateToInput")?.value;
  const venue = $("venueFilter")?.value || "all";
  const status = $("statusFilter")?.value || "all";
  const q = slug($("sessionSearchInput")?.value || "");
  const sort = $("sortSelect")?.value || "newest";

  const from = fromVal ? new Date(fromVal + "T00:00:00") : null;
  const to = toVal ? new Date(toVal + "T23:59:59") : null;

  filteredSessions = sessions.map(enrichedSession).filter(s => {
    const d = s.startedAt || toDate(s.createdAt);
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    if (venue !== "all" && s.venue !== venue) return false;
    if (status !== "all") {
      const st = s.active ? "active" : (s.status || "ended");
      if (st !== status) return false;
    }
    if (q) {
      const hay = slug(`${s.title || ""} ${s.venue || ""} ${s.notes || ""}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filteredSessions.sort((a, b) => {
    if (sort === "oldest") return (a.startedAt?.getTime() || 0) - (b.startedAt?.getTime() || 0);
    if (sort === "duration") return b.noBreakMs - a.noBreakMs;
    if (sort === "requests") return b.total - a.total;
    if (sort === "completion") return b.completionRate - a.completionRate;
    return (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0);
  });

  renderCurrentSession();
  renderAnalytics();
  renderTable();
}

function renderCurrentSession() {
  const panel = $("currentSessionPanel");
  if (!panel) return;
  const active = sessions.map(enrichedSession).find(s => s.active) || filteredSessions[0] || null;
  if (!active) {
    panel.innerHTML = `<div class="current-title"><span class="live-dot" style="background:#777;box-shadow:none;"></span>No sessions found</div>`;
    return;
  }

  const completedPct = active.total ? Math.round(active.completed / active.total * 100) : 0;
  const leftPct = active.total ? Math.round(active.left / active.total * 100) : 0;
  const abandonedPct = active.total ? Math.round(active.abandoned / active.total * 100) : 0;
  const deletedPct = active.total ? Math.round(active.deleted / active.total * 100) : 0;
  const donut = `conic-gradient(var(--green) 0 ${completedPct}%, #ffb04d ${completedPct}% ${completedPct + abandonedPct}%, #e83b3b ${completedPct + abandonedPct}% ${completedPct + abandonedPct + deletedPct}%, #bdbdbd ${completedPct + abandonedPct + deletedPct}% 100%)`;

  panel.innerHTML = `
    <div class="current-grid">
      <div>
        <div class="current-title"><span class="live-dot"></span> Current Session <span class="live-text">(${active.active ? "LIVE" : "Latest"})</span></div>
        <div class="session-name">${escapeHTML(active.title || "Untitled Session")}</div>
        <div class="session-venue">${escapeHTML(active.venue || "Unknown Venue")}</div>
        <div class="session-stats-line">
          <div class="mini-stat"><span>Started</span><strong>${formatTime(active.startedAt)}</strong></div>
          <div class="mini-stat"><span>Elapsed</span><strong>${msToMinutes(active.totalMs)}m</strong></div>
          <div class="mini-stat"><span>Breaks</span><strong>${(active.breaks || []).length} (${msToMinutes(breakMs(active))}m)</strong></div>
          <div class="mini-stat"><span>Status</span><strong>${active.active ? "Active" : escapeHTML(active.status || "Ended")}</strong></div>
        </div>
        <div class="notes-box"><small>Session Notes</small><br>${escapeHTML(active.notes || "No notes yet.")}</div>
      </div>
      <div>
        <div class="metrics-row">
          <div class="metric-box"><span>Songs Completed</span><b class="icon">✓</b><strong>${active.completed}</strong><small>${completedPct}%</small></div>
          <div class="metric-box"><span>Songs Left</span><b class="icon">♫</b><strong>${active.left}</strong><small>${leftPct}%</small></div>
          <div class="metric-box"><span>Total Requests</span><b class="icon">♚</b><strong>${active.total}</strong></div>
          <div class="metric-box"><span>Average BPM</span><b class="icon">⌁</b><strong>${active.avgBpm || "–"}</strong></div>
        </div>
        <div class="progress-panel">
          <strong>Progress</strong>
          <div class="progress-bar"><div class="progress-fill" style="width:${completedPct}%"></div></div>
          <div class="progress-footer"><span>${completedPct}% Completed</span><span>${active.total} Total</span></div>
        </div>
      </div>
      <div class="outcomes-wrap">
        <div class="donut" style="background:${donut}"></div>
        <div class="legend">
          <div class="legend-row"><span class="legend-color completed"></span><span>Completed</span><strong>${completedPct}% (${active.completed})</strong></div>
          <div class="legend-row"><span class="legend-color abandoned"></span><span>Abandoned</span><strong>${abandonedPct}% (${active.abandoned})</strong></div>
          <div class="legend-row"><span class="legend-color deleted"></span><span>Deleted</span><strong>${deletedPct}% (${active.deleted})</strong></div>
          <div class="legend-row"><span class="legend-color left"></span><span>Left</span><strong>${leftPct}% (${active.left})</strong></div>
        </div>
      </div>
    </div>`;
}

function renderAnalytics() {
  const grid = $("analyticsGrid");
  if (!grid) return;
  const totalSessions = filteredSessions.length;
  const totalSongs = filteredSessions.reduce((s, x) => s + x.completed, 0);
  const totalRequests = filteredSessions.reduce((s, x) => s + x.total, 0);
  const avgLength = totalSessions ? Math.round(filteredSessions.reduce((s, x) => s + x.noBreakMs, 0) / totalSessions / 60000) : 0;
  const completion = totalRequests ? Math.round(totalSongs / totalRequests * 100) : 0;
  const bpmArr = filteredSessions.map(x => x.avgBpm).filter(Boolean);
  const avgBpm = bpmArr.length ? Math.round(bpmArr.reduce((a, b) => a + b, 0) / bpmArr.length) : 0;

  const boxes = [
    ["Total Sessions", totalSessions, "▲ selected period"],
    ["Total Songs", totalSongs, "▲ completed"],
    ["Avg. Session Length", `${Math.floor(avgLength / 60)}h ${avgLength % 60}m`, "▲ play time"],
    ["Completion Rate", `${completion}%`, "▲ request outcome"],
    ["Total Requests", totalRequests, "▲ signups"],
    ["Average BPM", avgBpm || "–", "▲ session average"]
  ];

  grid.innerHTML = boxes.map((b, i) => `
    <div class="analytics-box">
      <span>${b[0]}</span>
      <strong>${b[1]}</strong>
      <div class="analytics-delta">${b[2]}</div>
      ${sparkline(i)}
    </div>`).join("");
}

function sparkline(seed) {
  const points = Array.from({ length: 18 }, (_, i) => {
    const x = i * 6;
    const y = 20 - Math.abs(Math.sin((i + seed) * 1.3) * 15) - (Math.random() * 4);
    return `${x},${Math.max(2, y)}`;
  }).join(" ");
  return `<svg class="sparkline" viewBox="0 0 102 26" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="#ff3333" stroke-width="2"/></svg>`;
}

function renderTable() {
  const tbody = $("sessionsTableBody");
  if (!tbody) return;
  const start = (page - 1) * pageSize;
  const visible = filteredSessions.slice(start, start + pageSize);
  tbody.innerHTML = "";

  visible.forEach((s, i) => {
    const tr = document.createElement("tr");
    const statusClass = s.active ? "live" : (s.status === "test" ? "test" : "ended");
    const statusText = s.active ? "Active" : (s.status || "Ended");
    tr.innerHTML = `
      <td>${start + i + 1}</td>
      <td>${s.active ? '<span class="badge live">LIVE</span> ' : ''}${escapeHTML(s.title || "Untitled")}</td>
      <td>${escapeHTML(s.venue || "-")}</td>
      <td>${formatDate(s.startedAt)}</td>
      <td>${formatTime(s.startedAt)}</td>
      <td>${formatTime(s.endedAt)}</td>
      <td>${msToMinutes(s.noBreakMs)}m<br><small>(${msToMinutes(s.totalMs)}m)</small></td>
      <td class="comp">${s.completed}</td>
      <td class="left">${s.left}</td>
      <td class="aban">${s.abandoned}</td>
      <td class="del">${s.deleted}</td>
      <td>${s.total}</td>
      <td>${s.avgBpm || "–"}</td>
      <td><span class="badge ${statusClass}">${escapeHTML(statusText)}</span></td>
      <td>
  <div class="actions">
    <button title="View" onclick="openSessionModal('${s.id}')">👁</button>

    <button title="Analytics" onclick="openSessionModal('${s.id}')">▥</button>

    <button
      class="delete-btn"
      title="Delete Session"
      onclick="deleteSession('${s.id}')">
      🗑
    </button>
  </div>
</td>`;
    tbody.appendChild(tr);
  });

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  if (page > totalPages) { page = totalPages; renderTable(); return; }
  $("pageLabel").innerText = `${page}`;
  $("tableShowingLabel").innerText = `Showing ${visible.length ? start + 1 : 0} to ${Math.min(start + visible.length, filteredSessions.length)} of ${filteredSessions.length} sessions`;
}

function changePageSize() { pageSize = Number($("pageSizeSelect").value || 8); page = 1; renderTable(); }
function prevPage() { if (page > 1) { page--; renderTable(); } }
function nextPage() { if (page < Math.ceil(filteredSessions.length / pageSize)) { page++; renderTable(); } }
window.changePageSize = changePageSize; window.prevPage = prevPage; window.nextPage = nextPage;
const realApplyFilters = applyFilters;
window.applyFilters = () => {
  page = 1;
  realApplyFilters();
};

function openSessionModal(id) {
  const s = sessions.map(enrichedSession).find(x => x.id === id);
  if (!s) return;
  const reqs = getSessionRequests(id);
  $("sessionModalContent").innerHTML = `
    <h2>${escapeHTML(s.title || "Untitled Session")}</h2>
    <p>${escapeHTML(s.venue || "-")} · ${formatDate(s.startedAt)} · ${escapeHTML(s.status || (s.active ? "active" : "ended"))}</p>
    <div class="detail-grid">
      <div class="detail-card"><span>Started</span><strong>${formatTime(s.startedAt)}</strong></div>
      <div class="detail-card"><span>Ended</span><strong>${formatTime(s.endedAt)}</strong></div>
      <div class="detail-card"><span>Duration</span><strong>${msToMinutes(s.noBreakMs)}m</strong></div>
      <div class="detail-card"><span>Breaks</span><strong>${(s.breaks || []).length} (${msToMinutes(breakMs(s))}m)</strong></div>
      <div class="detail-card"><span>Completed</span><strong>${s.completed}</strong></div>
      <div class="detail-card"><span>Left</span><strong>${s.left}</strong></div>
      <div class="detail-card"><span>Abandoned</span><strong>${s.abandoned}</strong></div>
      <div class="detail-card"><span>Deleted</span><strong>${s.deleted}</strong></div>
    </div>
    <h3>Session Notes</h3>
    <div class="notes-box">${escapeHTML(s.notes || "No notes.")}</div>
    <h3>Song Requests</h3>
    <div class="detail-requests">
      ${reqs.length ? reqs.map(r => `<div class="detail-request-row"><div><strong>${escapeHTML(r.songTitle || r.title || "Untitled")}</strong><span>${escapeHTML(r.artist || r.songArtist || "")}</span></div><div>${escapeHTML(r.singerName || r.name || "Unknown")}</div><div>${escapeHTML(r.status || "active")}</div><div>${formatTime(toDate(r.createdAt))}</div></div>`).join("") : `<div class="detail-request-row"><div>No requests found</div></div>`}
    </div>`;
  $("sessionDetailModal").classList.remove("hidden");
}
function closeSessionModal() { $("sessionDetailModal").classList.add("hidden"); }
window.openSessionModal = openSessionModal;
window.closeSessionModal = closeSessionModal;

function exportSessionsCsv() {
  const header = ["Session", "Venue", "Date", "Started", "Ended", "DurationMinutes", "Completed", "Left", "Abandoned", "Deleted", "TotalRequests", "AvgBPM", "Status"];
  const rows = filteredSessions.map(s => [
    s.title || "", s.venue || "", formatDate(s.startedAt), formatTime(s.startedAt), formatTime(s.endedAt), msToMinutes(s.noBreakMs), s.completed, s.left, s.abandoned, s.deleted, s.total, s.avgBpm || "", s.active ? "active" : (s.status || "ended")
  ]);
  const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `performance-sessions-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window.exportSessionsCsv = exportSessionsCsv;
