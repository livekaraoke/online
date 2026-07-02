/************************************************************
 * LIVE KARAOKE ADMIN.JS
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

let logHistory = [];
let currentState = null;
let currentSessionId = null;
let currentSessionData = null;
let currentRequests = [];
let sessionUnsubscribe = null;
let requestsUnsubscribe = null;
let notesSaveTimer = null;

/************************************************************
 * BASIC HELPERS
 ************************************************************/

function $(id) {
  return document.getElementById(id);
}

function nowTimestamp() {
  return firebase.firestore.Timestamp.now();
}

function formatTime(date) {
  if (!date) return "-";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getDateFromTimestamp(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  return new Date(value);
}

function minutesAgo(timestamp) {
  const date = getDateFromTimestamp(timestamp);
  if (!date) return "-";
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function msToMinutes(ms) {
  return Math.max(0, Math.floor(ms / 60000));
}

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/************************************************************
 * ADMIN CONSOLE
 ************************************************************/

function logAdmin(message) {
  const time = new Date().toLocaleTimeString();
  logHistory.push(`[${time}] ${message}`);
  if (logHistory.length > 50) logHistory.shift();
  renderConsole();
}

function renderConsole() {
  const consoleBox = $("adminConsole");
  if (!consoleBox) return;

  consoleBox.innerHTML = "";

  logHistory.slice(-10).forEach(line => {
    const div = document.createElement("div");
    div.className = "console-line";
    div.innerText = line;
    consoleBox.appendChild(div);
  });

  consoleBox.scrollTop = consoleBox.scrollHeight;
}

/************************************************************
 * LOGIN
 ************************************************************/

function adminLogin() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;
  const error = $("passwordError");

  error.textContent = "Checking...";

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      $("passwordGate").style.display = "none";
      $("adminContent").style.display = "block";
      error.textContent = "";
      logAdmin("Admin logged in");
    })
    .catch(err => {
      console.error(err);
      error.textContent = "Incorrect email or password";
    });
}

function adminLogout() {
  auth.signOut().then(() => {
    logAdmin("Logged out");
  });
}

auth.onAuthStateChanged(user => {
  const gate = $("passwordGate");
  const content = $("adminContent");

  if (user) {
    gate.style.display = "none";
    content.style.display = "block";
    logAdmin("Logged in as: " + user.email);
    initAdminAfterLogin();
  } else {
    gate.style.display = "flex";
    content.style.display = "none";
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && $("passwordGate")?.style.display !== "none") {
    adminLogin();
  }
});

window.adminLogin = adminLogin;
window.adminLogout = adminLogout;

/************************************************************
 * TOP ADMIN CONTROLS
 ************************************************************/

function goMainSite() {
  window.location.href = "https://livekaraoke.github.io/online/";
}

window.goMainSite = goMainSite;

function getCurrentEvent(event) {
  if (!event || !event.start || !event.end) return null;

  let start = new Date(event.start);
  let end = new Date(event.end);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  const now = new Date();

  if (event.repeatWeekly) {
    while (end < now) {
      start.setDate(start.getDate() + 7);
      end.setDate(end.getDate() + 7);
    }
  }

  return { start, end };
}

function listenKaraokeState() {
  db.collection("karaoke").doc("state").onSnapshot(doc => {
    currentState = doc.data() || {};
    updateAdminButtons(currentState);
  });
}

function updateAdminButtons(data) {
  if (!data) return;

  const eventTimes = getCurrentEvent(data.nextEvent);
  const now = new Date();

  let isLive = false;

  if (data.manualOverride) {
    isLive = data.isLive === true;
  } else if (eventTimes) {
    isLive = now >= eventTimes.start && now <= eventTimes.end;
  }

  let songsAvailable = data.songsOverride
    ? data.songsEnabled === true
    : isLive;

  if ($("liveToggleBtn")) {
    $("liveToggleBtn").innerText = isLive ? "🔴 END LIVE" : "🟢 GO LIVE";
  }

  if ($("songsToggleBtn")) {
    $("songsToggleBtn").innerText = !isLive
      ? "🔒 SONGS LOCKED"
      : songsAvailable
        ? "🔴 LOCK SONGS"
        : "🟢 UNLOCK SONGS";
  }
}

function toggleLive() {
  if (!currentState) return;

  const eventTimes = getCurrentEvent(currentState.nextEvent);
  const now = new Date();

  const isLive = currentState.manualOverride
    ? currentState.isLive === true
    : eventTimes && now >= eventTimes.start && now <= eventTimes.end;

  db.collection("karaoke").doc("state").set({
    manualOverride: true,
    isLive: !isLive
  }, { merge: true });

  logAdmin(!isLive ? "GO LIVE activated" : "LIVE ended manually");
}

function toggleSongsAuto() {
  if (!currentState) return;

  const eventTimes = getCurrentEvent(currentState.nextEvent);
  const now = new Date();

  const isLive = currentState.manualOverride
    ? currentState.isLive === true
    : eventTimes && now >= eventTimes.start && now <= eventTimes.end;

  if (!isLive) {
    db.collection("karaoke").doc("state").set({
      songsOverride: true,
      songsEnabled: false
    }, { merge: true });

    logAdmin("Cannot unlock songs: event is not live");
    return;
  }

  const songsAvailable = currentState.songsOverride
    ? currentState.songsEnabled === true
    : true;

  db.collection("karaoke").doc("state").set({
    songsOverride: !songsAvailable,
    songsEnabled: !songsAvailable
  }, { merge: true });

  logAdmin(songsAvailable ? "Songs LOCKED manually" : "Songs UNLOCKED");
}

window.toggleLive = toggleLive;
window.toggleSongsAuto = toggleSongsAuto;

/************************************************************
 * SESSION MANAGEMENT
 ************************************************************/

function setSessionStatus(message) {
  const el = $("sessionActionStatus");
  if (el) el.innerText = message || "";
  if (message) logAdmin(message);
}

function showCustomConfirm(title, message, yesCallback) {
  const ok = confirm(`${title}\n\n${message}`);
  if (ok) yesCallback();
}

function confirmStartPerformance() {
  showCustomConfirm(
    "Start Performance?",
    "This will start a new session and attach new song requests to it.",
    startPerformance
  );
}

function confirmEndPerformance() {
  showCustomConfirm(
    "End Performance?",
    "This will end the current session. Are you sure?",
    endPerformance
  );
}

async function getOrCreateTestSession() {
  const ref = db.collection("performanceSessions").doc("test-session");
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      title: "Test Session",
      venue: "Test",
      notes: "",
      status: "test",
      isActive: false,
      breakOpen: false,
      startedAt: null,
      endedAt: null,
      breaks: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  return "test-session";
}

async function startPerformance() {
  const title = $("sessionTitleInput")?.value.trim() || "Untitled Session";
  const venue = $("venueInput")?.value.trim() || "Unknown Venue";
  const notes = $("sessionNotesInput")?.value || "";

  const ref = await db.collection("performanceSessions").add({
    title,
    venue,
    notes,
    status: "active",
    isActive: true,
    breakOpen: false,
    startedAt: firebase.firestore.FieldValue.serverTimestamp(),
    endedAt: null,
    breaks: [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  currentSessionId = ref.id;

  await db.collection("karaokeControl").doc("currentSession").set({
    active: true,
    sessionId: currentSessionId,
    title,
    venue,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  setSessionStatus("Performance started.");
}

async function endPerformance() {
  if (!currentSessionId) return;

  await db.collection("performanceSessions").doc(currentSessionId).set({
    status: "ended",
    isActive: false,
    breakOpen: false,
    endedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await db.collection("karaokeControl").doc("currentSession").set({
    active: false,
    sessionId: null,
    title: "",
    venue: "",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  setSessionStatus("Performance ended.");
}

async function startBreak() {
  if (!currentSessionId || !currentSessionData) return;

  const breaks = currentSessionData.breaks || [];
  const lastBreak = breaks[breaks.length - 1];

  if (lastBreak && !lastBreak.end) return;

  breaks.push({
    start: nowTimestamp(),
    end: null
  });

  await db.collection("performanceSessions").doc(currentSessionId).set({
    breaks,
    breakOpen: true,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  setSessionStatus("Break started.");
}

async function endBreak() {
  if (!currentSessionId || !currentSessionData) return;

  const breaks = currentSessionData.breaks || [];
  const lastBreak = breaks[breaks.length - 1];

  if (!lastBreak || lastBreak.end) return;

  lastBreak.end = nowTimestamp();

  await db.collection("performanceSessions").doc(currentSessionId).set({
    breaks,
    breakOpen: false,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  setSessionStatus("Break ended.");
}

function saveSessionNotesLive() {
  if (!currentSessionId) return;

  clearTimeout(notesSaveTimer);

  notesSaveTimer = setTimeout(async () => {
    await db.collection("performanceSessions").doc(currentSessionId).set({
      notes: $("sessionNotesInput")?.value || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    setSessionStatus("Notes saved.");
  }, 700);
}

function listenCurrentSession() {
  db.collection("karaokeControl").doc("currentSession").onSnapshot(async snap => {
    const data = snap.data();

    if (!data || !data.active || !data.sessionId) {
      currentSessionId = null;
      currentSessionData = null;
      updateSessionUi(null);
      listenRequestsForSession(null);
      return;
    }

    currentSessionId = data.sessionId;

    if (sessionUnsubscribe) sessionUnsubscribe();

    sessionUnsubscribe = db.collection("performanceSessions")
      .doc(currentSessionId)
      .onSnapshot(sessionSnap => {
        if (!sessionSnap.exists) {
          updateSessionUi(null);
          return;
        }

        currentSessionData = {
          id: sessionSnap.id,
          ...sessionSnap.data()
        };

        updateSessionUi(currentSessionData);
        listenRequestsForSession(currentSessionId);
      });
  });
}

function updateSessionUi(session) {
  const setup = $("sessionSetupFields");
  const labels = $("activeSessionLabels");

  const startBtn = $("startPerformanceBtn");
  const startBreakBtn = $("startBreakBtn");
  const endBreakBtn = $("endBreakBtn");
  const endBtn = $("endPerformanceBtn");

  if (!session || session.status === "ended") {
    if (setup) setup.style.display = "block";
    if (labels) labels.style.display = "none";

    if (startBtn) startBtn.disabled = false;
    if (startBreakBtn) startBreakBtn.disabled = true;
    if (endBreakBtn) endBreakBtn.disabled = true;
    if (endBtn) endBtn.disabled = true;

    updateDashboard(null);
    return;
  }

  if (setup) setup.style.display = "none";
  if (labels) labels.style.display = "block";

  if ($("sessionTitleLabel")) $("sessionTitleLabel").innerText = session.title || "";
  if ($("venueLabel")) $("venueLabel").innerText = session.venue || "";

  if ($("sessionNotesInput") && document.activeElement !== $("sessionNotesInput")) {
    $("sessionNotesInput").value = session.notes || "";
  }

  const breaks = session.breaks || [];
  const lastBreak = breaks[breaks.length - 1];
  const inBreak = !!(lastBreak && !lastBreak.end);

  if (startBtn) startBtn.disabled = true;
  if (startBreakBtn) startBreakBtn.disabled = inBreak;
  if (endBreakBtn) endBreakBtn.disabled = !inBreak;
  if (endBtn) endBtn.disabled = false;

  updateDashboard(session);
}

window.confirmStartPerformance = confirmStartPerformance;
window.confirmEndPerformance = confirmEndPerformance;
window.startBreak = startBreak;
window.endBreak = endBreak;

/************************************************************
 * DASHBOARD
 ************************************************************/

function calculateBreakMs(session) {
  if (!session || !Array.isArray(session.breaks)) return 0;

  let total = 0;

  session.breaks.forEach(br => {
    const start = getDateFromTimestamp(br.start);
    const end = getDateFromTimestamp(br.end) || new Date();

    if (start) total += Math.max(0, end - start);
  });

  return total;
}

function updateDashboard(session) {
  const dash = $("sessionDashboard");
  if (!dash) return;

  if (!session) {
    dash.innerHTML = `
      <div class="dashboard-card">
        <strong>Status:</strong> No active session
      </div>
      <div class="dashboard-card">
        <strong>Breaks:</strong> 0 ( 0mins )
      </div>
    `;
    return;
  }

  const startedAt = getDateFromTimestamp(session.startedAt);
  const breakMs = calculateBreakMs(session);
  const elapsedMs = startedAt ? Date.now() - startedAt.getTime() : 0;
  const playingMs = Math.max(0, elapsedMs - breakMs);

  const completed = currentRequests.filter(r => r.status === "completed").length;
  const abandoned = currentRequests.filter(r => r.status === "abandoned").length;
  const deleted = currentRequests.filter(r => r.status === "deleted").length;
  const activeLeft = currentRequests.filter(r => !r.status || r.status === "active").length;

  dash.innerHTML = `
    <div class="dashboard-grid">
      <div class="dashboard-card"><strong>Status:</strong> Active session</div>
      <div class="dashboard-card"><strong>Date:</strong> ${startedAt ? startedAt.toLocaleDateString() : "-"}</div>
      <div class="dashboard-card"><strong>Venue:</strong> ${escapeHTML(session.venue || "-")}</div>
      <div class="dashboard-card"><strong>Started:</strong> ${formatTime(startedAt)}</div>
      <div class="dashboard-card"><strong>Elapsed:</strong> ${msToMinutes(elapsedMs)}mins</div>
      <div class="dashboard-card"><strong>Breaks:</strong> ${(session.breaks || []).length} ( ${msToMinutes(breakMs)}mins )</div>
      <div class="dashboard-card"><strong>Total incl. breaks:</strong> ${msToMinutes(elapsedMs)}mins</div>
      <div class="dashboard-card"><strong>Total excl. breaks:</strong> ${msToMinutes(playingMs)}mins</div>
      <div class="dashboard-card"><strong>Completed:</strong> ${completed}</div>
      <div class="dashboard-card"><strong>Abandoned:</strong> ${abandoned}</div>
      <div class="dashboard-card"><strong>Deleted:</strong> ${deleted}</div>
      <div class="dashboard-card"><strong>Left:</strong> ${activeLeft}</div>
    </div>
  `;
}

setInterval(() => {
  if (currentSessionData) updateDashboard(currentSessionData);
  renderActiveRequests();
}, 30000);

/************************************************************
 * REQUESTS
 ************************************************************/

function listenRequestsForSession(sessionId) {
  if (requestsUnsubscribe) requestsUnsubscribe();

  if (!sessionId) {
    currentRequests = [];
    renderActiveRequests();
    return;
  }

  requestsUnsubscribe = db.collection("publicSongRequests")
    .where("sessionId", "==", sessionId)
    .onSnapshot(snap => {
      currentRequests = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      currentRequests.sort((a, b) => {
        const da = getDateFromTimestamp(a.createdAt)?.getTime() || 0;
        const dbb = getDateFromTimestamp(b.createdAt)?.getTime() || 0;
        return da - dbb;
      });

      renderActiveRequests();
      updateDashboard(currentSessionData);
    });
}

async function attachRequestToCurrentSession(requestId) {
  const sessionId = currentSessionId || await getOrCreateTestSession();

  await db.collection("publicSongRequests").doc(requestId).set({
    sessionId,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

function renderActiveRequests() {
  const box = $("activeRequestsList");
  if (!box) return;

  const active = currentRequests.filter(req => !req.status || req.status === "active");

  box.innerHTML = "";

  if (!active.length) {
    box.innerHTML = `<div class="request-empty">No active song requests</div>`;
    return;
  }

  active.forEach(req => {
    const row = document.createElement("div");
    row.className = "active-request-row";

    const bpm = req.userBpm || req.songUserBpm || "-";
    const ago = minutesAgo(req.createdAt);

    row.innerHTML = `
      <div class="request-main">
        <strong>${escapeHTML(req.songTitle || req.title || "Untitled")}</strong>
        <span>${escapeHTML(req.name || req.singerName || "Unknown")} · BPM: ${escapeHTML(bpm)} · ${ago}mins ago</span>
      </div>

      <button class="request-done" onclick="completeRequest('${req.id}')">★</button>
      <button class="request-abandoned" onclick="abandonRequest('${req.id}')">🚶</button>
      <button class="request-delete" onclick="deleteRequestWithReason('${req.id}')">✕</button>
    `;

    box.appendChild(row);
  });
}

async function completeRequest(requestId) {
  await db.collection("publicSongRequests").doc(requestId).set({
    status: "completed",
    completedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  setSessionStatus("Request completed.");
}

async function abandonRequest(requestId) {
  await db.collection("publicSongRequests").doc(requestId).set({
    status: "abandoned",
    abandonedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  setSessionStatus("Request marked abandoned.");
}

async function deleteRequestWithReason(requestId) {
  const reason = prompt("Reason for deleting this request? You can leave it blank.") || "";

  await db.collection("publicSongRequests").doc(requestId).set({
    status: "deleted",
    deleteReason: reason,
    deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  setSessionStatus("Request deleted.");
}

window.completeRequest = completeRequest;
window.abandonRequest = abandonRequest;
window.deleteRequestWithReason = deleteRequestWithReason;

/************************************************************
 * INIT
 ************************************************************/

function initAdminAfterLogin() {
  listenKaraokeState();
  listenCurrentSession();
updateDashboard(currentSessionData);
renderActiveRequests();

  if ($("sessionNotesInput")) {
    $("sessionNotesInput").removeEventListener("input", saveSessionNotesLive);
    $("sessionNotesInput").addEventListener("input", saveSessionNotesLive);
  }

  logAdmin("System loaded");
}

window.addEventListener("load", () => {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);

  if ($("passwordGate")) {
    $("passwordGate").style.height = window.innerHeight + "px";
  }
});

window.addEventListener("resize", () => {
  if ($("passwordGate")) {
    $("passwordGate").style.height = window.innerHeight + "px";
  }
});
