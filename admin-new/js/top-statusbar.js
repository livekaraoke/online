(function () {
  function $(id) {
    return document.getElementById(id);
  }

  let currentSession = null;
  let currentRequests = [];
  let notifications = [];
  let lastSeenNotificationTime = Number(localStorage.getItem("lkTopStatusSeen") || 0);

function loadTopStatusBar() {
  const target = document.getElementById("topStatusContainer");
  if (!target) return Promise.resolve();

  const includePath =
    document.currentScript?.dataset.include ||
    "../../admin-new/includes/top-statusbar.html";

  return fetch(includePath)
    .then(r => {
      if (!r.ok) throw new Error("Top status bar include not found: " + includePath);
      return r.text();
    })
    .then(html => {
      target.innerHTML = html;
      listenStatus();
      listenCurrentSession();
      listenRequests();
    });
}

function getDb() {
  return window.LK?.db || window.db || null;
}
    
  function toggle() {
    const bar = $("topStatusBar");
    const btn = $("tsToggleBtn");
    if (!bar) return;

    const expanded = bar.classList.toggle("expanded");
    bar.classList.toggle("collapsed", !expanded);

    if (btn) btn.innerText = expanded ? "▲" : "▼";

    if (expanded) markNotificationsSeen();
  }

  function markNotificationsSeen() {
    lastSeenNotificationTime = Date.now();
    localStorage.setItem("lkTopStatusSeen", String(lastSeenNotificationTime));

    const bar = $("topStatusBar");
    if (bar) bar.classList.remove("has-new");
  }

  function addNotification(text) {
    const item = {
      text,
      time: Date.now()
    };

    notifications.unshift(item);
    notifications = notifications.slice(0, 20);

    renderNotifications();

    if (item.time > lastSeenNotificationTime) {
      $("topStatusBar")?.classList.add("has-new");
    }
  }

  function renderNotifications() {
    const label = $("tsNotificationLabel");
    const list = $("tsNotificationsList");

    if (label) {
      label.innerText = notifications.length
        ? `${notifications.length} alert${notifications.length === 1 ? "" : "s"}`
        : "No new alerts";
    }

    if (!list) return;

    if (!notifications.length) {
      list.innerHTML = "No notifications yet.";
      return;
    }

    list.innerHTML = notifications.map(n => `
      <div class="top-status-notification">
        <strong>${escapeHTML(new Date(n.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</strong>
        ${escapeHTML(n.text)}
      </div>
    `).join("");
  }

function listenStatus() {
  const dbRef = getDb();
  if (!dbRef) return;

  dbRef.collection("karaoke").doc("state").onSnapshot(doc => {
    const data = doc.data() || {};

      const isLive = data.isLive === true;
      const songsEnabled = data.songsEnabled === true;

      setText("tsLiveLabel", isLive ? "LIVE NOW!" : "Offline");
      setText("tsDashLive", isLive ? "LIVE NOW!" : "Offline");
      setText("tsDashSongs", songsEnabled ? "Unlocked" : "Locked");

      const dot = $("tsLiveDot");
      if (dot) {
        dot.className = `dot ${isLive ? "green" : "blue"}`;
      }
    });
  }

  function listenCurrentSession() {
    const dbRef = getDb();
    if (!dbRef) return;
  
    dbRef.collection("karaokeControl").doc("currentSession").onSnapshot(doc => {
      const pointer = doc.data() || {};
      const sessionId = pointer.activeSessionId || pointer.sessionId || null;

      if (!sessionId) {
        currentSession = null;
        renderSession();
        return;
      }

      LK.db.collection("performanceSessions").doc(sessionId).onSnapshot(snap => {
        currentSession = snap.exists ? { id: snap.id, ...snap.data() } : null;
        renderSession();
      });
    });
  }

  function listenRequests() {
    const dbRef = getDb();
    if (!dbRef) return;
  
    dbRef.collection("publicSongRequests")
      .where("status", "in", ["pending", "waiting", "active"])
      .onSnapshot(snap => {
        const previousCount = currentRequests.length;

        currentRequests = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        if (currentRequests.length > previousCount) {
          addNotification("New song request received.");
        }

        renderRequests();
      }, error => {
        console.error(error);
      });
  }

  function renderSession() {
    if (!currentSession) {
      setText("tsSessionLabel", "No active session");
      setText("tsDashSession", "No active session");
      setText("tsDashVenue", "-");
      setText("tsDashStarted", "-");
      setText("tsDashElapsed", "0 mins");
      return;
    }

    setText("tsSessionLabel", currentSession.title || "Active session");
    setText("tsDashSession", currentSession.title || "Active session");
    setText("tsDashVenue", currentSession.venue || "-");

    const started = toDate(currentSession.startedAt);
    setText("tsDashStarted", started ? started.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-");
    setText("tsDashElapsed", started ? formatDuration(Date.now() - started.getTime()) : "0 mins");
  }

  function renderRequests() {
    const active = currentRequests.filter(r =>
      !r.status ||
      r.status === "pending" ||
      r.status === "waiting" ||
      r.status === "active"
    );

    const completed = currentRequests.filter(r => r.status === "completed");

    setText("tsRequestsLabel", `${active.length} request${active.length === 1 ? "" : "s"}`);
    setText("tsDashRequests", String(active.length));
    setText("tsDashCompleted", String(completed.length));
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.innerText = value;
  }

  function toDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    return new Date(value);
  }

  function formatDuration(ms) {
    const mins = Math.max(0, Math.floor(ms / 60000));
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;

    if (hrs === 0) return `${mins} mins`;
    if (rem === 0) return `${hrs} hr`;
    return `${hrs} hr ${rem} mins`;
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  setInterval(() => {
    renderSession();
  }, 1000);

  window.LK = window.LK || {};
  LK.topStatus = {
    loadTopStatusBar,
    toggle,
    addNotification,
    markNotificationsSeen
  };
})();
