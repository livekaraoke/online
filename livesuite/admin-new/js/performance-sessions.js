(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const db =
    window.db ||
    window.LK?.db ||
    (window.firebase?.firestore ? firebase.firestore() : null);

  const auth =
    window.auth ||
    (window.firebase?.auth ? firebase.auth() : null);

  let sessions = [];
  let filtered = [];
  let currentPage = 1;
  let pageSize = 8;
  let pendingDeleteId = "";

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
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(date) {
    if (!date) return "-";
    return date.toLocaleDateString(undefined, {
      day:"2-digit",
      month:"short",
      year:"numeric"
    });
  }

  function formatTime(date) {
    if (!date) return "-";
    return date.toLocaleTimeString(undefined, {
      hour:"2-digit",
      minute:"2-digit",
      hour12:false
    });
  }

  function formatHours(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "-";

    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;

    if (hours && rem) return `${hours}hr${hours === 1 ? "" : "s"} ${rem}mins`;
    if (hours) return `${hours}hr${hours === 1 ? "" : "s"}`;
    return `${mins}mins`;
  }

  function getBreakMs(session) {
    const now = new Date();
    let total = 0;

    (session.breaks || []).forEach(br => {
      const start = tsDate(br.startedAt || br.start);
      const end = tsDate(br.endedAt || br.end) || now;
      if (start && end && end >= start) total += end - start;
    });

    return total;
  }

  function actualStart(session) {
    return tsDate(session.actualStartedAt || session.startedAt);
  }

  function actualEnd(session) {
    return tsDate(session.actualEndedAt || session.endedAt);
  }

  function scheduledStart(session) {
    return tsDate(session.scheduledStartAt);
  }

  function scheduledEnd(session) {
    return tsDate(session.scheduledEndAt);
  }

  function durationValues(session) {
    const start = actualStart(session);
    const end = actualEnd(session) || (session.status === "active" ? new Date() : null);

    if (!start || !end) return {totalMs:null,activeMs:null};

    const totalMs = Math.max(0,end-start);
    const activeMs = Math.max(0,totalMs-getBreakMs(session));

    return {totalMs,activeMs};
  }

  function requestStatusBucket(status) {
    const value = String(status || "").toLowerCase();

    if (["completed","played"].includes(value)) return "completed";
    if (["abandoned","singerleft","singer_left"].includes(value)) return "abandoned";
    if (["deletedbyhost","deleted","declined"].includes(value)) return "deleted";
    return "left";
  }

  function getRequestSnapshot(session) {
    return Array.isArray(session.requestSnapshot) ? session.requestSnapshot : [];
  }

  function countsFor(session) {
    if (session.requestSummary && typeof session.requestSummary === "object") {
      return {
        total:Number(session.requestSummary.total || 0),
        completed:Number(session.requestSummary.completed || 0),
        left:Number(session.requestSummary.left || 0),
        abandoned:Number(session.requestSummary.abandoned || 0),
        deleted:Number(session.requestSummary.deleted || 0)
      };
    }

    const requests = getRequestSnapshot(session);
    const counts = {
      total:requests.length,
      completed:0,
      left:0,
      abandoned:0,
      deleted:0
    };

    requests.forEach(req => counts[requestStatusBucket(req.status)]++);
    return counts;
  }

  function playedSnapshot(session) {
    const performed = Array.isArray(session.playedSongsSnapshot)
      ? session.playedSongsSnapshot
      : [];

    const logs = Array.isArray(session.performanceLogSnapshot)
      ? session.performanceLogSnapshot
      : [];

    const seen = new Set();
    const merged = [];

    [...performed,...logs].forEach(item => {
      const key = [
        item.songId || item.songTitle || "",
        item.requestId || "",
        tsDate(item.playedAt || item.createdAt)?.getTime() || ""
      ].join("|");

      if (seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });

    return merged;
  }

  function averageBpm(session) {
    const values = playedSnapshot(session)
      .map(item => Number(item.userBpm || item.bpm))
      .filter(Number.isFinite);

    if (!values.length) return "-";
    return Math.round(values.reduce((a,b)=>a+b,0)/values.length);
  }

  function sessionSearchText(session) {
    return [
      session.title,
      session.venue,
      session.type,
      session.sessionType,
      session.notes,
      session.eventSnapshot?.name
    ].join(" ").toLowerCase();
  }

  function populateVenueFilter() {
    const select = $("venueFilter");
    if (!select) return;

    const current = select.value || "all";
    const venues = [...new Set(
      sessions.map(session => String(session.venue || "").trim()).filter(Boolean)
    )].sort((a,b)=>a.localeCompare(b));

    select.innerHTML =
      `<option value="all">All Venues</option>` +
      venues.map(venue => `<option value="${esc(venue)}">${esc(venue)}</option>`).join("");

    select.value = venues.includes(current) ? current : "all";
  }

  function renderCurrentSession() {
    const panel = $("currentSessionPanel");
    if (!panel) return;

    const active = sessions.find(session => session.status === "active");
    if (!active) {
      panel.innerHTML = "";
      return;
    }

    const duration = durationValues(active);
    const counts = countsFor(active);

    panel.innerHTML = `
      <div class="current-session-grid">
        <div class="session-metric"><span>ACTIVE SESSION</span><strong>${esc(active.title || "Untitled")}</strong></div>
        <div class="session-metric"><span>VENUE</span><strong>${esc(active.venue || "-")}</strong></div>
        <div class="session-metric"><span>TYPE</span><strong>${esc(active.sessionType || active.type || "-")}</strong></div>
        <div class="session-metric"><span>SCHEDULED</span><strong>${formatTime(scheduledStart(active))}–${formatTime(scheduledEnd(active))}</strong></div>
        <div class="session-metric"><span>ACTUAL START</span><strong>${formatTime(actualStart(active))}</strong></div>
        <div class="session-metric"><span>ELAPSED X/BREAKS</span><strong>${formatHours(duration.activeMs)}</strong></div>
        <div class="session-metric"><span>REQUESTS</span><strong>${counts.total}</strong></div>
        <div class="session-metric"><span>PLAYED</span><strong>${playedSnapshot(active).length}</strong></div>
      </div>
    `;
  }

  function renderAnalytics() {
    const grid = $("analyticsGrid");
    if (!grid) return;

    const total = filtered.length;
    const ended = filtered.filter(s => s.status === "ended").length;
    const requests = filtered.reduce((sum,s)=>sum+countsFor(s).total,0);
    const completed = filtered.reduce((sum,s)=>sum+countsFor(s).completed,0);
    const played = filtered.reduce((sum,s)=>sum+playedSnapshot(s).length,0);

    const durationMs = filtered.reduce((sum,s)=>{
      const d = durationValues(s).activeMs;
      return sum + (Number.isFinite(d) ? d : 0);
    },0);

    grid.innerHTML = `
      <div class="analytics-item"><span>SESSIONS</span><strong>${total}</strong></div>
      <div class="analytics-item"><span>ENDED</span><strong>${ended}</strong></div>
      <div class="analytics-item"><span>REQUESTS</span><strong>${requests}</strong></div>
      <div class="analytics-item"><span>COMPLETED</span><strong>${completed}</strong></div>
      <div class="analytics-item"><span>SONGS PLAYED</span><strong>${played}</strong></div>
      <div class="analytics-item"><span>ACTIVE TIME</span><strong>${formatHours(durationMs)}</strong></div>
    `;
  }

  function renderTable() {
    const body = $("sessionsTableBody");
    if (!body) return;

    const start = (currentPage-1)*pageSize;
    const page = filtered.slice(start,start+pageSize);

    if (!page.length) {
      body.innerHTML = `<tr><td colspan="17">No sessions found.</td></tr>`;
    } else {
      body.innerHTML = page.map((session,index) => {
        const counts = countsFor(session);
        const duration = durationValues(session);
        const actualS = actualStart(session);
        const actualE = actualEnd(session);
        const scheduledS = scheduledStart(session);
        const scheduledE = scheduledEnd(session);

        return `
          <tr>
            <td>${start + index + 1}</td>
            <td>${esc(session.title || "Untitled")}</td>
            <td>${esc(session.venue || "-")}</td>
            <td>${formatDate(scheduledS || actualS)}</td>
            <td>${formatTime(scheduledS)}</td>
            <td>${formatTime(scheduledE)}</td>
            <td>${formatTime(actualS)}</td>
            <td>${formatTime(actualE)}</td>
            <td title="Excluding breaks; total elapsed in brackets">
              ${formatHours(duration.activeMs)}
              ${Number.isFinite(duration.totalMs) ? ` (${formatHours(duration.totalMs)})` : ""}
            </td>
            <td>${counts.completed}</td>
            <td>${counts.left}</td>
            <td>${counts.abandoned}</td>
            <td>${counts.deleted}</td>
            <td>${counts.total}</td>
            <td>${averageBpm(session)}</td>
            <td class="status-${esc(session.status || "")}">${esc(session.status || "-")}</td>
            <td>
              <button class="table-action-btn" onclick="viewSessionDetails('${esc(session.id)}')">View</button>
              <button class="table-action-btn delete" onclick="openDeleteDialog('${esc(session.id)}')">Delete</button>
            </td>
          </tr>
        `;
      }).join("");
    }

    const totalPages = Math.max(1,Math.ceil(filtered.length/pageSize));
    currentPage = Math.min(currentPage,totalPages);

    $("pageLabel").textContent = `${currentPage} / ${totalPages}`;
    $("tableShowingLabel").textContent =
      `Showing ${filtered.length ? start + 1 : 0}–${Math.min(start+pageSize,filtered.length)} of ${filtered.length} sessions`;
  }

  window.applyFilters = function applyFilters() {
    const fromValue = $("dateFromInput")?.value || "";
    const toValue = $("dateToInput")?.value || "";
    const venue = $("venueFilter")?.value || "all";
    const status = $("statusFilter")?.value || "all";
    const search = String($("sessionSearchInput")?.value || "").trim().toLowerCase();
    const sort = $("sortSelect")?.value || "newest";

    filtered = sessions.filter(session => {
      const date = scheduledStart(session) || actualStart(session);
      const key = date
        ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`
        : "";

      if (fromValue && key && key < fromValue) return false;
      if (toValue && key && key > toValue) return false;
      if (venue !== "all" && session.venue !== venue) return false;
      if (status !== "all" && session.status !== status) return false;
      if (search && !sessionSearchText(session).includes(search)) return false;

      return true;
    });

    filtered.sort((a,b) => {
      if (sort === "oldest") {
        return (scheduledStart(a) || actualStart(a) || new Date(0)) -
               (scheduledStart(b) || actualStart(b) || new Date(0));
      }

      if (sort === "duration") {
        return (durationValues(b).activeMs || 0) - (durationValues(a).activeMs || 0);
      }

      if (sort === "requests") {
        return countsFor(b).total - countsFor(a).total;
      }

      if (sort === "completion") {
        return countsFor(b).completed - countsFor(a).completed;
      }

      return (scheduledStart(b) || actualStart(b) || new Date(0)) -
             (scheduledStart(a) || actualStart(a) || new Date(0));
    });

    currentPage = 1;
    renderAnalytics();
    renderTable();
  };

  async function loadLiveFallback(session) {
    const result = {
      requests:getRequestSnapshot(session),
      played:playedSnapshot(session),
      runOrder:Array.isArray(session.runOrderSnapshot) ? session.runOrderSnapshot : []
    };

    if (result.requests.length && result.played.length) return result;

    try {
      const [requestsSnap,logsSnap,performedSnap] = await Promise.all([
        db.collection("publicSongRequests").where("sessionId","==",session.id).get(),
        db.collection("performanceLogs").where("sessionId","==",session.id).get(),
        db.collection("performanceSessions").doc(session.id).collection("performedSongs").get()
      ]);

      if (!result.requests.length) {
        result.requests = requestsSnap.docs.map(doc => ({id:doc.id,...(doc.data() || {})}));
      }

      if (!result.played.length) {
        const logs = logsSnap.docs.map(doc => ({id:doc.id,...(doc.data() || {})}));
        const performed = performedSnap.docs.map(doc => ({id:doc.id,...(doc.data() || {})}));
        result.played = [...performed,...logs];
      }
    } catch (error) {
      console.warn("Could not load live fallback session detail:",error);
    }

    return result;
  }

  function requestStatusLabel(status) {
    const value = String(status || "").toLowerCase();

    if (["completed","played"].includes(value)) return "Played";
    if (["abandoned","singerleft","singer_left"].includes(value)) return "Singer Left";
    if (["deletedbyhost","deleted","declined"].includes(value)) return "Deleted / Declined";
    if (["queued","accepted"].includes(value)) return "Queued";
    return "Left / Not Played";
  }

  window.viewSessionDetails = async function viewSessionDetails(id) {
    const session = sessions.find(item => item.id === id);
    if (!session) return;

    const detail = await loadLiveFallback(session);
    const counts = countsFor({...session,requestSnapshot:detail.requests,requestSummary:null});
    const duration = durationValues(session);

    const requestRows = detail.requests.length
      ? detail.requests.map(req => `
          <div class="detail-row">
            <strong>${esc(req.songTitle || req.title || "Untitled Song")} — ${esc(req.artist || req.songArtist || "")}</strong>
            <span>${esc(req.singerName || req.name || "Singer")}</span>
            <span class="status-chip ${esc(requestStatusBucket(req.status))}">${esc(requestStatusLabel(req.status))}</span>
          </div>
        `).join("")
      : `<div class="detail-row"><span>No song requests recorded.</span></div>`;

    const playedRows = detail.played.length
      ? detail.played.map(item => `
          <div class="detail-row">
            <strong>${esc(item.songTitle || item.title || item.songId || "Untitled Song")} — ${esc(item.songArtist || item.artist || "")}</strong>
            <span>${formatTime(tsDate(item.playedAt || item.createdAt))}</span>
            <span class="status-chip played">Played</span>
          </div>
        `).join("")
      : `<div class="detail-row"><span>No played songs recorded.</span></div>`;

    const runRows = detail.runOrder.length
      ? detail.runOrder.map((item,index) => `
          <div class="detail-row">
            <strong>${index+1}. ${esc(item.songTitle || item.songId || "Untitled Song")}</strong>
            <span>${esc(item.singerName || item.source || "")}</span>
            <span class="status-chip ${item.status === "played" ? "played" : ""}">${esc(item.status || "queued")}</span>
          </div>
        `).join("")
      : `<div class="detail-row"><span>No Run Order snapshot.</span></div>`;

    $("sessionModalContent").innerHTML = `
      <div class="session-detail-header">
        <h2>${esc(session.title || "Untitled Session")}</h2>
        <p>${esc(session.sessionType || session.type || "")}${session.venue ? ` • ${esc(session.venue)}` : ""}</p>
      </div>

      <div class="detail-grid">
        <div class="detail-card"><span>SCHEDULED START</span><strong>${formatDate(scheduledStart(session))} ${formatTime(scheduledStart(session))}</strong></div>
        <div class="detail-card"><span>SCHEDULED END</span><strong>${formatDate(scheduledEnd(session))} ${formatTime(scheduledEnd(session))}</strong></div>
        <div class="detail-card"><span>ACTUAL START</span><strong>${formatDate(actualStart(session))} ${formatTime(actualStart(session))}</strong></div>
        <div class="detail-card"><span>ACTUAL END</span><strong>${formatDate(actualEnd(session))} ${formatTime(actualEnd(session))}</strong></div>
        <div class="detail-card"><span>DURATION X/BREAKS</span><strong>${formatHours(duration.activeMs)}</strong></div>
        <div class="detail-card"><span>TOTAL ELAPSED</span><strong>${formatHours(duration.totalMs)}</strong></div>
        <div class="detail-card"><span>BREAKS</span><strong>${(session.breaks || []).length} • ${formatHours(getBreakMs(session))}</strong></div>
        <div class="detail-card"><span>EVENT ID</span><strong>${esc(session.eventId || "—")}</strong></div>
        <div class="detail-card"><span>REQUESTS</span><strong>${counts.total}</strong></div>
        <div class="detail-card"><span>PLAYED REQUESTS</span><strong>${counts.completed}</strong></div>
        <div class="detail-card"><span>LEFT / NOT PLAYED</span><strong>${counts.left}</strong></div>
        <div class="detail-card"><span>SINGER LEFT</span><strong>${counts.abandoned}</strong></div>
      </div>

      <div class="detail-section">
        <h3>SESSION NOTES</h3>
        <div class="detail-card">${esc(session.notes || "No notes.")}</div>
      </div>

      <div class="detail-section">
        <h3>SONG REQUESTS (${detail.requests.length})</h3>
        <div class="detail-list">${requestRows}</div>
      </div>

      <div class="detail-section">
        <h3>PLAYED SONGS (${detail.played.length})</h3>
        <div class="detail-list">${playedRows}</div>
      </div>

      <div class="detail-section">
        <h3>RUN ORDER (${detail.runOrder.length})</h3>
        <div class="detail-list">${runRows}</div>
      </div>
    `;

    $("sessionDetailModal").classList.remove("hidden");
  };

  window.closeSessionModal = function closeSessionModal() {
    $("sessionDetailModal").classList.add("hidden");
  };

  window.openDeleteDialog = function openDeleteDialog(id) {
    pendingDeleteId = id;
    $("deleteSessionDialog").classList.remove("hidden");
  };

  window.closeDeleteDialog = function closeDeleteDialog() {
    pendingDeleteId = "";
    $("deleteSessionDialog").classList.add("hidden");
  };

  async function deleteSession(id) {
    if (!id) return;

    const requestSnap = await db.collection("publicSongRequests").where("sessionId","==",id).get();
    const logSnap = await db.collection("performanceLogs").where("sessionId","==",id).get();
    const performedSnap = await db.collection("performanceSessions").doc(id).collection("performedSongs").get();

    const batch = db.batch();
    requestSnap.docs.forEach(doc => batch.delete(doc.ref));
    logSnap.docs.forEach(doc => batch.delete(doc.ref));
    performedSnap.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(db.collection("performanceSessions").doc(id));

    await batch.commit();
  }

  function showToast(message) {
    const box = $("toastBox");
    box.textContent = message;
    box.classList.remove("hidden");
    setTimeout(()=>box.classList.add("hidden"),2200);
  }

  window.prevPage = function prevPage() {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  };

  window.nextPage = function nextPage() {
    const pages = Math.max(1,Math.ceil(filtered.length/pageSize));
    if (currentPage < pages) {
      currentPage++;
      renderTable();
    }
  };

  window.changePageSize = function changePageSize() {
    pageSize = Number($("pageSizeSelect").value) || 8;
    currentPage = 1;
    renderTable();
  };

  window.exportSessionsCsv = function exportSessionsCsv() {
    const rows = [[
      "Session","Venue","Type","Scheduled Start","Scheduled End",
      "Actual Start","Actual End","Duration Excl Breaks","Total Elapsed",
      "Requests","Completed","Left","Abandoned","Deleted","Songs Played","Status"
    ]];

    filtered.forEach(session => {
      const counts = countsFor(session);
      const duration = durationValues(session);

      rows.push([
        session.title || "",
        session.venue || "",
        session.sessionType || session.type || "",
        scheduledStart(session)?.toISOString() || "",
        scheduledEnd(session)?.toISOString() || "",
        actualStart(session)?.toISOString() || "",
        actualEnd(session)?.toISOString() || "",
        formatHours(duration.activeMs),
        formatHours(duration.totalMs),
        counts.total,
        counts.completed,
        counts.left,
        counts.abandoned,
        counts.deleted,
        playedSnapshot(session).length,
        session.status || ""
      ]);
    });

    const csv = rows
      .map(row => row.map(value => `"${String(value).replace(/"/g,'""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance-sessions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  window.adminLogin = async function adminLogin() {
    if (!auth) return;

    $("passwordError").textContent = "";

    try {
      await auth.signInWithEmailAndPassword(
        $("emailInput").value.trim(),
        $("passwordInput").value
      );
    } catch (error) {
      $("passwordError").textContent = error.message || "Login failed.";
    }
  };

  async function loadSidebar() {
    const container = $("sidebarContainer");
    if (!container) return;

    try {
      const response = await fetch("includes/sidebar.html",{cache:"no-store"});
      if (!response.ok) throw new Error(String(response.status));
      container.innerHTML = await response.text();
      container.querySelector('[data-page="sessions"]')?.classList.add("active");
    } catch (error) {
      console.warn("Could not load sidebar:",error);
    }
  }

  function startSessionListener() {
    db.collection("performanceSessions").onSnapshot(snapshot => {
      sessions = snapshot.docs.map(doc => ({id:doc.id,...(doc.data() || {})}));

      populateVenueFilter();
      renderCurrentSession();
      applyFilters();
    }, error => {
      console.error("Could not load performance sessions:",error);
      showToast(error.message || "Could not load sessions.");
    });
  }

  function showApp() {
    $("passwordGate").classList.add("hidden");
    $("appShell").style.display = "";
    loadSidebar();
    startSessionListener();
  }

  function init() {
    if (!db || !auth) {
      $("passwordError").textContent = "Firebase is unavailable.";
      return;
    }

    $("confirmDeleteBtn").onclick = async () => {
      if (!pendingDeleteId) return;

      const id = pendingDeleteId;
      $("confirmDeleteBtn").disabled = true;

      try {
        await deleteSession(id);
        closeDeleteDialog();
        showToast("Session deleted.");
      } catch (error) {
        console.error(error);
        showToast(error.message || "Could not delete session.");
      } finally {
        $("confirmDeleteBtn").disabled = false;
      }
    };

    auth.onAuthStateChanged(user => {
      if (user) {
        showApp();
      } else {
        $("passwordGate").classList.remove("hidden");
        $("appShell").style.display = "none";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",init);
  } else {
    init();
  }
})();
