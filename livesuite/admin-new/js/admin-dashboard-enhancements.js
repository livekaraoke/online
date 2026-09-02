(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const db =
    window.db ||
    window.LK?.db ||
    (window.firebase?.firestore ? firebase.firestore() : null);

  if (!db) {
    console.error("admin-dashboard-enhancements.js: Firestore is not available.");
    return;
  }

  let pastSessions = [];
  let pastSessionUnsubscribe = null;

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

    const months = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"
    ];

    return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]}`;
  }

  function formatLongDate(date) {
    if (!date) return "-";
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function formatTime(date) {
    if (!date) return "-";

    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function formatDurationMs(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "-";

    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours && minutes) {
      return `${hours}hr${hours === 1 ? "" : "s"} ${minutes}mins`;
    }

    if (hours) {
      return `${hours}hr${hours === 1 ? "" : "s"}`;
    }

    return `${minutes}mins`;
  }

  function eventDuration(event) {
    if (!event?.date || !event.startTime || !event.endTime) return "-";

    const start = new Date(`${event.date}T${event.startTime}:00`);
    let end = new Date(`${event.date}T${event.endTime}:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
    if (end < start) end = new Date(end.getTime() + 86400000);

    return formatDurationMs(end - start);
  }

  function sessionActualStart(session) {
    return tsDate(session.actualStartedAt || session.startedAt);
  }

  function sessionActualEnd(session) {
    return tsDate(session.actualEndedAt || session.endedAt);
  }

  function sessionScheduledStart(session) {
    return tsDate(session.scheduledStartAt);
  }

  function sessionScheduledEnd(session) {
    return tsDate(session.scheduledEndAt);
  }

  function breakDurationMs(session) {
    const now = new Date();

    return (session.breaks || []).reduce((sum, br) => {
      const start = tsDate(br.startedAt || br.start);
      const end = tsDate(br.endedAt || br.end) || now;

      if (!start || !end || end < start) return sum;
      return sum + (end - start);
    }, 0);
  }

  function sessionDuration(session) {
    const start = sessionActualStart(session);
    const end = sessionActualEnd(session);

    if (!start || !end) return "-";

    const total = Math.max(0, end - start);
    const active = Math.max(0, total - breakDurationMs(session));

    return `${formatDurationMs(active)} (${formatDurationMs(total)})`;
  }

  function openDetailModal(html) {
    const modal = $("dashboardDetailModal");
    const content = $("dashboardDetailModalContent");

    if (!modal || !content) return;

    content.innerHTML = html;
    modal.classList.remove("hidden");
  }

  function closeDetailModal() {
    $("dashboardDetailModal")?.classList.add("hidden");
    if ($("dashboardDetailModalContent")) {
      $("dashboardDetailModalContent").innerHTML = "";
    }
  }

  function detailCell(label, value) {
    return `
      <div class="dashboard-detail-cell">
        <span>${esc(label)}</span>
        <strong>${esc(value || "-")}</strong>
      </div>
    `;
  }

  function viewUpcomingEvent(eventId) {
    const event = window.LKAdminEvents?.getUpcomingEvent?.(eventId);
    if (!event) return;

    const start = event.date && event.startTime
      ? new Date(`${event.date}T${event.startTime}:00`)
      : null;

    let end = event.date && event.endTime
      ? new Date(`${event.date}T${event.endTime}:00`)
      : null;

    if (start && end && end < start) {
      end = new Date(end.getTime() + 86400000);
    }

    openDetailModal(`
      <div class="dashboard-detail-head">
        <span>UPCOMING GIG / EVENT</span>
        <h2>${esc(event.name || "Untitled Event")}</h2>
        <p>${esc(event.type || "Other")} • ${esc(event.status || "Confirmed")}</p>
      </div>

      <div class="dashboard-detail-grid">
        ${detailCell("DATE", start ? formatLongDate(start) : event.date || "-")}
        ${detailCell("START", start ? formatTime(start) : event.startTime || "-")}
        ${detailCell("END", end ? formatTime(end) : event.endTime || "-")}
        ${detailCell("EVENT LENGTH", eventDuration(event))}
        ${detailCell("TYPE", event.type || "-")}
        ${detailCell("STATUS", event.status || "-")}
        ${detailCell("VENUE", event.venue || "-")}
        ${detailCell("ARRIVAL / SETUP", event.arrivalTime || "-")}
        ${detailCell("ADDRESS", event.address || "-")}
        ${detailCell("CONTACT NAME", event.contactName || "-")}
        ${detailCell("CONTACT", event.contact || "-")}
        ${detailCell("LINKED SESSION", event.linkedSessionId || "Not started")}
      </div>

      <div class="dashboard-detail-section">
        <h3>NOTES</h3>
        <div class="dashboard-detail-copy">${esc(event.notes || "No notes.")}</div>
      </div>

      <div class="admin-modal-actions">
        <button
          type="button"
          class="admin-action-btn danger"
          data-detail-prefill-event="${esc(event.id)}">
          ＋ Use for Performance Session
        </button>

        <button
          type="button"
          class="admin-action-btn muted"
          onclick="window.location.href='upcoming-events.html'">
          Manage Events
        </button>
      </div>
    `);
  }

  function sessionRequestSummary(session, requests) {
    if (session.requestSummary && typeof session.requestSummary === "object") {
      return session.requestSummary;
    }

    const result = {
      total: requests.length,
      completed: 0,
      left: 0,
      abandoned: 0,
      deleted: 0
    };

    requests.forEach(request => {
      const status = String(request.status || "").toLowerCase();

      if (["completed", "played"].includes(status)) {
        result.completed++;
      } else if (["abandoned", "singerleft", "singer_left"].includes(status)) {
        result.abandoned++;
      } else if (["deleted", "deletedbyhost", "declined"].includes(status)) {
        result.deleted++;
      } else {
        result.left++;
      }
    });

    return result;
  }

  function requestStatusLabel(status) {
    const value = String(status || "").toLowerCase();

    if (["completed", "played"].includes(value)) return "Played";
    if (["abandoned", "singerleft", "singer_left"].includes(value)) return "Singer Left";
    if (["deleted", "deletedbyhost", "declined"].includes(value)) return "Deleted / Declined";
    if (["queued", "accepted"].includes(value)) return "Queued";
    return "Left / Not Played";
  }

  async function loadSessionRecords(session) {
    let requests = Array.isArray(session.requestSnapshot)
      ? session.requestSnapshot
      : [];

    let played = Array.isArray(session.playedSongsSnapshot)
      ? session.playedSongsSnapshot
      : [];

    const runOrder = Array.isArray(session.runOrderSnapshot)
      ? session.runOrderSnapshot
      : [];

    try {
      const queries = [];

      if (!requests.length) {
        queries.push(
          db.collection("publicSongRequests")
            .where("sessionId", "==", session.id)
            .get()
            .then(snapshot => {
              requests = snapshot.docs.map(doc => ({
                id: doc.id,
                ...(doc.data() || {})
              }));
            })
        );
      }

      if (!played.length) {
        queries.push(
          db.collection("performanceSessions")
            .doc(session.id)
            .collection("performedSongs")
            .get()
            .then(snapshot => {
              played = snapshot.docs.map(doc => ({
                id: doc.id,
                ...(doc.data() || {})
              }));
            })
        );
      }

      await Promise.all(queries);
    } catch (error) {
      console.warn("Could not load complete session records:", error);
    }

    return { requests, played, runOrder };
  }

  async function viewPastSession(sessionId) {
    const session = pastSessions.find(item => item.id === sessionId);
    if (!session) return;

    openDetailModal(`
      <div class="dashboard-detail-head">
        <span>PAST PERFORMANCE SESSION</span>
        <h2>${esc(session.title || "Performance Session")}</h2>
        <p>Loading complete session record…</p>
      </div>
    `);

    const records = await loadSessionRecords(session);
    const summary = sessionRequestSummary(session, records.requests);

    const requestRows = records.requests.length
      ? records.requests.map(request => `
          <div class="dashboard-record-row">
            <strong>${esc(request.songTitle || request.title || "Untitled Song")} — ${esc(request.artist || request.songArtist || "")}</strong>
            <span>${esc(request.singerName || request.name || "Singer")}</span>
            <span>${esc(requestStatusLabel(request.status))}</span>
          </div>
        `).join("")
      : `<div class="dashboard-detail-copy">No requests recorded.</div>`;

    const playedRows = records.played.length
      ? records.played.map(song => `
          <div class="dashboard-record-row">
            <strong>${esc(song.songTitle || song.title || song.songId || "Untitled Song")} — ${esc(song.artist || song.songArtist || "")}</strong>
            <span>${esc(song.singerName || "")}</span>
            <span>${esc(formatTime(tsDate(song.playedAt || song.createdAt)))}</span>
          </div>
        `).join("")
      : `<div class="dashboard-detail-copy">No played-song records.</div>`;

    const runRows = records.runOrder.length
      ? records.runOrder.map((item, index) => `
          <div class="dashboard-record-row">
            <strong>${index + 1}. ${esc(item.songTitle || item.songId || "Untitled Song")}</strong>
            <span>${esc(item.singerName || item.source || "")}</span>
            <span>${esc(item.status || "queued")}</span>
          </div>
        `).join("")
      : `<div class="dashboard-detail-copy">No Run Order snapshot.</div>`;

    openDetailModal(`
      <div class="dashboard-detail-head">
        <span>PAST PERFORMANCE SESSION</span>
        <h2>${esc(session.title || "Performance Session")}</h2>
        <p>${esc(session.sessionType || session.type || "")}${session.venue ? ` • ${esc(session.venue)}` : ""}</p>
      </div>

      <div class="dashboard-detail-grid">
        ${detailCell("VENUE", session.venue || "-")}
        ${detailCell("TYPE", session.sessionType || session.type || "-")}
        ${detailCell("SCHED. START", `${formatLongDate(sessionScheduledStart(session))} ${formatTime(sessionScheduledStart(session))}`)}
        ${detailCell("SCHED. END", `${formatLongDate(sessionScheduledEnd(session))} ${formatTime(sessionScheduledEnd(session))}`)}
        ${detailCell("ACTUAL START", `${formatLongDate(sessionActualStart(session))} ${formatTime(sessionActualStart(session))}`)}
        ${detailCell("ACTUAL END", `${formatLongDate(sessionActualEnd(session))} ${formatTime(sessionActualEnd(session))}`)}
        ${detailCell("DURATION", sessionDuration(session))}
        ${detailCell("BREAKS", `${(session.breaks || []).length} • ${formatDurationMs(breakDurationMs(session))}`)}
        ${detailCell("REQUESTS", summary.total || 0)}
        ${detailCell("PLAYED REQUESTS", summary.completed || 0)}
        ${detailCell("LEFT / NOT PLAYED", summary.left || 0)}
        ${detailCell("SINGER LEFT", summary.abandoned || 0)}
        ${detailCell("DELETED / DECLINED", summary.deleted || 0)}
        ${detailCell("SONGS PLAYED", records.played.length)}
        ${detailCell("EVENT ID", session.eventId || "-")}
        ${detailCell("STATUS", session.status || "ended")}
      </div>

      <div class="dashboard-detail-section">
        <h3>SESSION NOTES</h3>
        <div class="dashboard-detail-copy">${esc(session.notes || "No notes.")}</div>
      </div>

      <div class="dashboard-detail-section">
        <h3>SONG REQUESTS (${records.requests.length})</h3>
        <div class="dashboard-record-list">${requestRows}</div>
      </div>

      <div class="dashboard-detail-section">
        <h3>SONGS PLAYED (${records.played.length})</h3>
        <div class="dashboard-record-list">${playedRows}</div>
      </div>

      <div class="dashboard-detail-section">
        <h3>FINAL RUN ORDER (${records.runOrder.length})</h3>
        <div class="dashboard-record-list">${runRows}</div>
      </div>

      <div class="admin-modal-actions">
        <button
          type="button"
          class="admin-action-btn muted"
          onclick="window.location.href='performance-sessions.html'">
          Open Performance Sessions
        </button>
      </div>
    `);
  }

  function renderPastSessions() {
    const list = $("dashboardPastSessionsList");
    if (!list) return;

    const ended = pastSessions
      .filter(session => {
        const status = String(session.status || "").toLowerCase();
        return status === "ended" || !!session.actualEndedAt || !!session.endedAt;
      })
      .sort((a, b) => {
        const aDate = sessionActualEnd(a) || sessionActualStart(a) || new Date(0);
        const bDate = sessionActualEnd(b) || sessionActualStart(b) || new Date(0);
        return bDate - aDate;
      });

    if ($("dashboardPastSessionCount")) {
      $("dashboardPastSessionCount").textContent = `(${ended.length})`;
    }

    const latest = ended.slice(0, 5);

    if (!latest.length) {
      list.innerHTML = `<div class="dashboard-event-empty">No completed sessions yet.</div>`;
      return;
    }

    list.innerHTML = latest.map(session => {
      const end = sessionActualEnd(session);
      const start = sessionActualStart(session);
      const date = end || start;

      const playedCount = Array.isArray(session.playedSongsSnapshot)
        ? session.playedSongsSnapshot.length
        : 0;

      const requestCount = Number(session.requestSummary?.total || 0);

      return `
        <article
          class="dashboard-past-session-row"
          data-view-past-session="${esc(session.id)}"
          title="Click to view the full session record">

          <div class="dashboard-past-session-date">${esc(formatDate(date))}</div>

          <div class="dashboard-past-session-main">
            <strong>${esc(session.title || "Performance Session")}</strong>
            <small>${esc(session.venue || "-")} • ${esc(session.sessionType || session.type || "-")}</small>
          </div>

          <div class="dashboard-past-session-meta">${esc(formatTime(start))}–${esc(formatTime(end))}</div>
          <div class="dashboard-past-session-meta">${esc(sessionDuration(session))}</div>
          <span class="past-session-status">${playedCount} songs • ${requestCount} req.</span>
        </article>
      `;
    }).join("");
  }

  function listenPastSessions() {
    if (pastSessionUnsubscribe) pastSessionUnsubscribe();

    pastSessionUnsubscribe = db.collection("performanceSessions").onSnapshot(snapshot => {
      pastSessions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() || {})
      }));

      renderPastSessions();
    }, error => {
      console.warn("Could not load Past Sessions dashboard:", error);
      if ($("dashboardPastSessionsList")) {
        $("dashboardPastSessionsList").innerHTML =
          `<div class="dashboard-event-empty">Could not load past sessions.</div>`;
      }
    });
  }

  /* ======================================================
     MEMBERS PANEL
     ====================================================== */

  function setMembersCollapsed(collapsed) {
    const panel = $("membersPanel");
    const button = $("membersToggleBtn");

    if (!panel || !button) return;

    panel.classList.toggle("collapsed", collapsed);
    button.textContent = collapsed ? "▼ Expand" : "▲ Collapse";
  }

  function installMembersToggleOverride() {
    setMembersCollapsed(true);

    window.toggleMembersPanel = function toggleMembersPanel() {
      const panel = $("membersPanel");
      if (!panel) return;

      const willCollapse = !panel.classList.contains("collapsed");
      setMembersCollapsed(willCollapse);

      if (!willCollapse && typeof window.loadAllMembers === "function") {
        window.loadAllMembers();
      }
    };
  }

  function randomPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let value = "LK!";

    for (let i = 0; i < 9; i++) {
      value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return value;
  }

  function clearNewUserForm() {
    $("newMemberEmailInput").value = "";
    $("newMemberDisplayNameInput").value = "";
    $("newMemberRoleInput").value = "Member";
    $("newMemberPasswordInput").value = randomPassword();
    $("newMemberNotesInput").value = "";
    $("newMemberCreateStatus").textContent = "";
  }

  function openNewUserModal() {
    clearNewUserForm();
    $("addMemberUserModal").classList.remove("hidden");
    setTimeout(() => $("newMemberEmailInput").focus(), 30);
  }

  function closeNewUserModal() {
    $("addMemberUserModal").classList.add("hidden");
  }

  async function createMemberUser() {
    const email = $("newMemberEmailInput").value.trim();
    const displayName = $("newMemberDisplayNameInput").value.trim();
    const role = $("newMemberRoleInput").value;
    const password = $("newMemberPasswordInput").value;
    const adminNotes = $("newMemberNotesInput").value.trim();
    const status = $("newMemberCreateStatus");
    const button = $("createMemberUserBtn");

    if (!email) {
      status.textContent = "Enter an email address.";
      return;
    }

    if (!password || password.length < 6) {
      status.textContent = "Temporary password must be at least 6 characters.";
      return;
    }

    button.disabled = true;
    status.textContent = "Creating user…";

    const secondaryName = `memberCreator_${Date.now()}`;
    let secondaryApp = null;

    try {
      secondaryApp = firebase.initializeApp(firebase.app().options, secondaryName);

      const secondaryAuth = secondaryApp.auth();
      const secondaryDb = secondaryApp.firestore();

      const credential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      const user = credential.user;

      if (displayName) {
        await user.updateProfile({ displayName });
      }

      await secondaryDb.collection("userProfiles").doc(user.uid).set({
        email,
        displayName: displayName || email.split("@")[0],
        role,
        adminNotes,
        phone: "",
        bio: "",
        photoURL: "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      status.textContent = `User created: ${email}`;
      setMembersCollapsed(false);

      if (typeof window.loadAllMembers === "function") {
        setTimeout(() => window.loadAllMembers(), 250);
      }

      setTimeout(closeNewUserModal, 900);
    } catch (error) {
      console.error("Could not create member/user:", error);
      status.textContent = error.message || "Could not create user.";
    } finally {
      button.disabled = false;

      if (secondaryApp) {
        try {
          await secondaryApp.delete();
        } catch {}
      }
    }
  }

  function bindUi() {
    $("dashboardDetailCloseBtn")?.addEventListener("click", closeDetailModal);

    $("dashboardDetailModal")?.addEventListener("click", event => {
      if (event.target === $("dashboardDetailModal")) closeDetailModal();
    });

    $("addMemberUserBtn")?.addEventListener("click", openNewUserModal);
    $("cancelCreateMemberUserBtn")?.addEventListener("click", closeNewUserModal);
    $("generateMemberPasswordBtn")?.addEventListener("click", () => {
      $("newMemberPasswordInput").value = randomPassword();
    });
    $("createMemberUserBtn")?.addEventListener("click", createMemberUser);

    $("addMemberUserModal")?.addEventListener("click", event => {
      if (event.target === $("addMemberUserModal")) closeNewUserModal();
    });

    document.addEventListener("click", event => {
      const prefillFromDetail = event.target.closest("[data-detail-prefill-event]");
      if (prefillFromDetail) {
        const id = prefillFromDetail.dataset.detailPrefillEvent;
        closeDetailModal();
        window.prefillSessionFromEvent?.(id);
        return;
      }

      const upcoming = event.target.closest("[data-view-upcoming-event]");
      if (upcoming) {
        // The + button has its own prefill action and must not open details.
        if (event.target.closest("[data-prefill-session]")) return;
        viewUpcomingEvent(upcoming.dataset.viewUpcomingEvent);
        return;
      }

      const past = event.target.closest("[data-view-past-session]");
      if (past) {
        viewPastSession(past.dataset.viewPastSession);
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeDetailModal();
        closeNewUserModal();
      }
    });
  }

  function init() {
    bindUi();
    installMembersToggleOverride();
    listenPastSessions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
