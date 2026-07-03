/************************************************************
 * LIVE KARAOKE ADMIN.JS - ADVANCED DASHBOARD + USERS
 ************************************************************/

const OWNER_EMAIL = "leeborg23@gmail.com";
const USER_ROLES = ["Admin", "Manager", "Band Member", "Venue", "Host", "Member", "Fan"];

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
let confirmResolver = null;
let reasonRequestId = null;
let reasonMode = "delete";
let currentUserProfile = null;
let allMembers = [];
let membersUnsubscribe = null;

function $(id) { return document.getElementById(id); }
function serverNow() { return firebase.firestore.FieldValue.serverTimestamp(); }
function nowTimestamp() { return firebase.firestore.Timestamp.now(); }
function getDateFromTimestamp(value) { if (!value) return null; if (value.toDate) return value.toDate(); return new Date(value); }
function formatTime(date) { return date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"; }
function formatDate(date) { return date ? date.toLocaleDateString("en-GB") : "-"; }
function msToMinutes(ms) { return Math.max(0, Math.floor(ms / 60000)); }
function minutesAgo(ts) { const d = getDateFromTimestamp(ts); return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000)) : "-"; }
function escapeHTML(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function isOwner() { return (auth.currentUser?.email || "").toLowerCase() === OWNER_EMAIL.toLowerCase(); }

function logAdmin(message) {
  const time = new Date().toLocaleTimeString();
  logHistory.push(`[${time}] ${message}`);
  if (logHistory.length > 100) logHistory.shift();
  renderConsole();
}
function renderConsole() {
  const box = $("adminConsole");
  if (!box) return;
  box.innerHTML = logHistory.slice(-40).map(line => `<div class="console-line">${escapeHTML(line)}</div>`).join("");
  box.scrollTop = box.scrollHeight;
}
function clearConsole() { logHistory = []; renderConsole(); }
function exportLog() {
  const blob = new Blob([logHistory.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `karaoke-admin-log-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function scrollToConsole() { $("consolePanel")?.scrollIntoView({ behavior: "smooth" }); }
window.clearConsole = clearConsole; window.exportLog = exportLog; window.scrollToConsole = scrollToConsole;

function adminLogin() {
  const email = $("emailInput")?.value.trim() || "";
  const password = $("passwordInput")?.value || "";
  const error = $("passwordError");
  if (error) error.textContent = "Checking...";
  auth.signInWithEmailAndPassword(email, password).catch(err => {
    console.error(err);
    if (error) error.textContent = "Incorrect email or password";
  });
}
function adminLogout() { auth.signOut(); }
window.adminLogin = adminLogin; window.adminLogout = adminLogout;

auth.onAuthStateChanged(async user => {
  if (user) {
    $("passwordGate").style.display = "none";
    $("adminContent").style.display = "grid";
    await ensureMyProfile(user);
    applyProfileToDashboard();
    initAdminAfterLogin();
  } else {
    $("passwordGate").style.display = "flex";
    $("adminContent").style.display = "none";
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && $("passwordGate")?.style.display !== "none") adminLogin();
});

async function ensureMyProfile(user) {
  const ref = db.collection("userProfiles").doc(user.uid);
  const snap = await ref.get();
  const defaultRole = user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase() ? "Admin" : "Member";

  if (!snap.exists) {
    await ref.set({
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || user.email || "User",
      photoURL: user.photoURL || "",
      phone: "",
      bio: "",
      role: defaultRole,
      isOwner: user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase(),
      createdAt: serverNow(),
      updatedAt: serverNow(),
      lastLoginAt: serverNow()
    }, { merge: true });
  } else {
    const patch = { email: user.email || "", lastLoginAt: serverNow(), updatedAt: serverNow() };
    if (user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) patch.role = "Admin";
    await ref.set(patch, { merge: true });
  }

  const fresh = await ref.get();
  currentUserProfile = { id: fresh.id, ...fresh.data() };
  logAdmin("Profile loaded: " + (currentUserProfile.displayName || currentUserProfile.email));
}

function applyProfileToDashboard() {
  const p = currentUserProfile || {};
  const displayName = p.displayName || p.email || auth.currentUser?.email || "Admin";
  const role = p.role || "Member";

  if ($("adminUserName")) $("adminUserName").innerText = displayName;
  if ($("adminUserRole")) $("adminUserRole").innerText = role;

  const img = $("sidebarProfileImg");
  const fallback = $("sidebarProfileFallback");
  if (img && fallback) {
    if (p.photoURL) {
      img.src = p.photoURL;
      img.style.display = "block";
      fallback.style.display = "none";
    } else {
      img.src = "";
      img.style.display = "none";
      fallback.style.display = "grid";
    }
  }

  const membersPanel = $("membersPanel");
  const membersNav = $("membersNavLink");
  const showMembers = isOwner();
  if (membersPanel) membersPanel.style.display = showMembers ? "block" : "none";
  if (membersNav) membersNav.style.display = showMembers ? "block" : "none";
}

function openProfileModal() {
  const p = currentUserProfile || {};
  $("profileDisplayName").value = p.displayName || "";
  $("profilePhotoURL").value = p.photoURL || "";
  $("profilePhone").value = p.phone || "";
  $("profileBio").value = p.bio || "";
  $("profileEmailLabel").innerText = p.email || auth.currentUser?.email || "-";
  $("profileRoleLabel").innerText = p.role || "Member";
  $("profilePreviewName").innerText = p.displayName || p.email || "Profile";
  $("profilePreviewRole").innerText = p.role || "Member";
  const img = $("profilePreviewImg");
  img.src = p.photoURL || "";
  img.style.display = p.photoURL ? "block" : "none";
  $("profileModal").classList.remove("hidden");
}
function closeProfileModal() { $("profileModal").classList.add("hidden"); }
async function saveMyProfile() {
  const user = auth.currentUser;
  if (!user) return;
  const ref = db.collection("userProfiles").doc(user.uid);
  const patch = {
    displayName: $("profileDisplayName").value.trim() || user.email || "User",
    photoURL: $("profilePhotoURL").value.trim(),
    phone: $("profilePhone").value.trim(),
    bio: $("profileBio").value.trim(),
    updatedAt: serverNow()
  };
  await ref.set(patch, { merge: true });
  const fresh = await ref.get();
  currentUserProfile = { id: fresh.id, ...fresh.data() };
  applyProfileToDashboard();
  closeProfileModal();
  logAdmin("Profile saved.");
}
window.openProfileModal = openProfileModal; window.closeProfileModal = closeProfileModal; window.saveMyProfile = saveMyProfile;

function loadAllMembers() {
  if (!isOwner()) return;
  if (membersUnsubscribe) membersUnsubscribe();
  membersUnsubscribe = db.collection("userProfiles").onSnapshot(snap => {
    allMembers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allMembers.sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));
    renderMembersList();
  });
}
function renderMembersList() {
  const box = $("membersList");
  if (!box) return;
  const search = ($("memberSearchInput")?.value || "").toLowerCase().trim();
  const members = allMembers.filter(m => `${m.displayName || ""} ${m.email || ""} ${m.role || ""}`.toLowerCase().includes(search));
  if (!members.length) {
    box.innerHTML = `<div class="request-empty">No users found</div>`;
    return;
  }
  box.innerHTML = members.map(m => `
    <div class="member-row">
      <div class="member-avatar">${m.photoURL ? `<img src="${escapeHTML(m.photoURL)}" alt="">` : "👤"}</div>
      <div class="member-main"><strong>${escapeHTML(m.displayName || m.email || "User")}</strong><span>${escapeHTML(m.email || "")}</span></div>
      <div class="member-role role-${escapeHTML(String(m.role || "Member").toLowerCase().replace(/\s+/g, "-"))}">${escapeHTML(m.role || "Member")}</div>
      <div class="member-last">${m.lastLoginAt ? formatDate(getDateFromTimestamp(m.lastLoginAt)) : "-"}</div>
      <button class="member-edit-btn" onclick="openMemberModal('${m.id}')">Edit</button>
    </div>
  `).join("");
}
function openMemberModal(uid) {
  if (!isOwner()) return;
  const m = allMembers.find(x => x.id === uid);
  if (!m) return;
  $("memberUidInput").value = uid;
  $("memberEmailInput").value = m.email || "";
  $("memberDisplayNameInput").value = m.displayName || "";
  $("memberRoleInput").value = m.email?.toLowerCase() === OWNER_EMAIL.toLowerCase() ? "Admin" : (m.role || "Member");
  $("memberPhotoInput").value = m.photoURL || "";
  $("memberAdminNotesInput").value = m.adminNotes || "";
  $("memberRoleInput").disabled = m.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
  $("memberModal").classList.remove("hidden");
}
function closeMemberModal() { $("memberModal").classList.add("hidden"); }
async function saveMemberFromModal() {
  if (!isOwner()) return;
  const uid = $("memberUidInput").value;
  if (!uid) return;
  const email = $("memberEmailInput").value;
  const forcedRole = email?.toLowerCase() === OWNER_EMAIL.toLowerCase() ? "Admin" : $("memberRoleInput").value;
  await db.collection("userProfiles").doc(uid).set({
    displayName: $("memberDisplayNameInput").value.trim(),
    role: forcedRole,
    photoURL: $("memberPhotoInput").value.trim(),
    adminNotes: $("memberAdminNotesInput").value.trim(),
    roleUpdatedBy: auth.currentUser?.email || "",
    roleUpdatedAt: serverNow(),
    updatedAt: serverNow()
  }, { merge: true });
  closeMemberModal();
  logAdmin("Member updated.");
}
window.loadAllMembers = loadAllMembers; window.renderMembersList = renderMembersList; window.openMemberModal = openMemberModal; window.closeMemberModal = closeMemberModal; window.saveMemberFromModal = saveMemberFromModal;

function getCurrentEvent(event) {
  if (!event || !event.start || !event.end) return null;
  let start = new Date(event.start);
  let end = new Date(event.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const now = new Date();
  if (event.repeatWeekly) while (end < now) { start.setDate(start.getDate() + 7); end.setDate(end.getDate() + 7); }
  return { start, end };
}
function listenKaraokeState() {
  db.collection("karaoke").doc("state").onSnapshot(doc => {
    currentState = doc.data() || {};
    updateAdminButtons(currentState);
    updateStatusStrip();
  });
}
function getIsLive(data) {
  if (!data) return false;
  if (data.manualOverride) return data.isLive === true;
  const ev = getCurrentEvent(data.nextEvent);
  const now = new Date();
  return !!(ev && now >= ev.start && now <= ev.end);
}
function getSongsAvailable(data, live) { return data?.songsOverride ? data.songsEnabled === true : live; }
function updateAdminButtons(data) {
  const live = getIsLive(data);
  const songs = getSongsAvailable(data, live);
  const liveBtn = $("liveCircleBtn");
  const songsBtn = $("songsCircleBtn");
  if (liveBtn) {
    liveBtn.className = live ? "circle-status-btn stop" : "circle-status-btn go";
    liveBtn.innerText = live ? "■" : "▶";
    liveBtn.title = live ? "Go offline" : "Go live";
  }
  if (songsBtn) {
    songsBtn.className = songs ? "circle-status-btn stop" : "circle-status-btn go";
    songsBtn.innerText = songs ? "🔒" : "🔓";
    songsBtn.title = songs ? "Lock public song list" : "Unlock public song list";
  }
}
function updateStatusStrip() {
  const live = getIsLive(currentState);
  const songs = getSongsAvailable(currentState, live);
  const ev = getCurrentEvent(currentState?.nextEvent);
  const end = ev?.end || null;
  const minsLeft = end ? Math.max(0, msToMinutes(end - new Date())) : null;

  const liveLabel = $("statusLiveLabel");
  const songsLabel = $("statusSongsLabel");

  if (liveLabel) {
    liveLabel.className = live ? "live-now-status" : "offline-status";
    liveLabel.innerText = live ? "LIVE NOW!" : "● Offline";
  }
  if (songsLabel) {
    songsLabel.className = songs ? "songs-unlocked" : "songs-locked";
    songsLabel.innerText = songs ? "UNLOCKED" : "LOCKED";
  }

  if ($("statusVenueLabel")) $("statusVenueLabel").innerText = currentSessionData?.venue || currentState?.nextEvent?.venue || "-";
  if ($("statusEventEndLabel")) $("statusEventEndLabel").innerText = end ? `${formatTime(end)} (${minsLeft}m left)` : "-";
  if ($("statusUpdatedLabel")) $("statusUpdatedLabel").innerText = new Date().toLocaleTimeString();
}
function toggleLive() {
  const live = getIsLive(currentState);
  db.collection("karaoke").doc("state").set({ manualOverride: true, isLive: !live }, { merge: true });
  logAdmin(!live ? "GO LIVE activated" : "LIVE ended manually");
}
function toggleSongsAuto() {
  const live = getIsLive(currentState);
  if (!live) {
    db.collection("karaoke").doc("state").set({ songsOverride: true, songsEnabled: false }, { merge: true });
    logAdmin("Cannot unlock songs: event is not live");
    return;
  }
  const songs = getSongsAvailable(currentState, live);
  db.collection("karaoke").doc("state").set({ songsOverride: !songs, songsEnabled: !songs }, { merge: true });
  logAdmin(songs ? "Public Song List LOCKED" : "Public Song List UNLOCKED");
}
function goMainSite() { window.location.href = "https://livekaraoke.github.io/online/"; }
window.toggleLive = toggleLive; window.toggleSongsAuto = toggleSongsAuto; window.goMainSite = goMainSite;

function showConfirm(title, message) {
  $("confirmModalTitle").innerText = title;
  $("confirmModalMessage").innerText = message;
  $("confirmModal").classList.remove("hidden");
  return new Promise(resolve => { confirmResolver = resolve; $("confirmModalOk").onclick = () => closeConfirmModal(true); });
}
function closeConfirmModal(value) { $("confirmModal").classList.add("hidden"); if (confirmResolver) confirmResolver(value); confirmResolver = null; }
window.closeConfirmModal = closeConfirmModal;

async function confirmStartPerformance() { if (await showConfirm("Start Performance?", "This will start a new performance session and attach new song requests to it.")) startPerformance(); }
async function confirmEndPerformance() { if (await showConfirm("End Performance?", "This will end the current session. Are you sure?")) endPerformance(); }
async function startPerformance() {
  const title = $("sessionTitleInput")?.value.trim() || "Untitled Session";
  const venue = $("venueInput")?.value.trim() || "Unknown Venue";
  const notes = $("sessionNotesInput")?.value || "";
  const ref = await db.collection("performanceSessions").add({ title, venue, notes, status: "active", isActive: true, breakOpen: false, startedAt: serverNow(), endedAt: null, breaks: [], createdAt: serverNow(), updatedAt: serverNow() });
  currentSessionId = ref.id;
  await db.collection("karaokeControl").doc("currentSession").set({ active: true, sessionId: ref.id, title, venue, updatedAt: serverNow() }, { merge: true });
  setSessionStatus("Performance started.");
}
async function endPerformance() {
  if (!currentSessionId) return;
  await db.collection("performanceSessions").doc(currentSessionId).set({ status: "ended", isActive: false, breakOpen: false, endedAt: serverNow(), updatedAt: serverNow() }, { merge: true });
  await db.collection("karaokeControl").doc("currentSession").set({ active: false, sessionId: null, title: "", venue: "", updatedAt: serverNow() }, { merge: true });
  setSessionStatus("Performance ended.");
}
async function startBreak() {
  if (!currentSessionId || !currentSessionData) return;
  const breaks = [...(currentSessionData.breaks || [])];
  if (breaks.length && !breaks[breaks.length - 1].end) return;
  breaks.push({ start: nowTimestamp(), end: null });
  await db.collection("performanceSessions").doc(currentSessionId).set({ breaks, breakOpen: true, updatedAt: serverNow() }, { merge: true });
  setSessionStatus("Break started.");
}
async function endBreak() {
  if (!currentSessionId || !currentSessionData) return;
  const breaks = [...(currentSessionData.breaks || [])];
  if (!breaks.length || breaks[breaks.length - 1].end) return;
  breaks[breaks.length - 1].end = nowTimestamp();
  await db.collection("performanceSessions").doc(currentSessionId).set({ breaks, breakOpen: false, updatedAt: serverNow() }, { merge: true });
  setSessionStatus("Break ended.");
}
function setSessionStatus(message) { if ($("sessionActionStatus")) $("sessionActionStatus").innerText = message || ""; if (message) logAdmin(message); }
function saveSessionNotesLive() {
  if (!currentSessionId) return;
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(async () => {
    await db.collection("performanceSessions").doc(currentSessionId).set({ notes: $("sessionNotesInput")?.value || "", updatedAt: serverNow() }, { merge: true });
    setSessionStatus("Notes autosaved.");
  }, 700);
}
function editActiveSessionDetails() {
  if (!currentSessionData) return;
  $("sessionSetupFields").style.display = "block";
  $("sessionTitleInput").value = currentSessionData.title || "";
  $("venueInput").value = currentSessionData.venue || "";
}
window.confirmStartPerformance = confirmStartPerformance; window.confirmEndPerformance = confirmEndPerformance; window.startBreak = startBreak; window.endBreak = endBreak; window.editActiveSessionDetails = editActiveSessionDetails;

function listenCurrentSession() {
  db.collection("karaokeControl").doc("currentSession").onSnapshot(snap => {
    const data = snap.data() || {};
    if (!data.active || !data.sessionId) {
      currentSessionId = null; currentSessionData = null;
      updateSessionUi(null); listenRequestsForSession(null); return;
    }
    currentSessionId = data.sessionId;
    if (sessionUnsubscribe) sessionUnsubscribe();
    sessionUnsubscribe = db.collection("performanceSessions").doc(currentSessionId).onSnapshot(s => {
      if (!s.exists) { updateSessionUi(null); return; }
      currentSessionData = { id: s.id, ...s.data() };
      updateSessionUi(currentSessionData);
      listenRequestsForSession(currentSessionId);
      updateStatusStrip();
    });
  });
}
function updateSessionUi(session) {
  const active = !!(session && session.status !== "ended");
  $("sessionSetupFields").style.display = active ? "none" : "block";
  $("activeSessionLabels").classList.toggle("hidden", !active);
  if (active) {
    $("sessionTitleLabel").innerText = session.title || "";
    $("venueLabel").innerText = session.venue || "";
    if (document.activeElement !== $("sessionNotesInput")) $("sessionNotesInput").value = session.notes || "";
  }
  const breaks = session?.breaks || [];
  const inBreak = !!(breaks.length && !breaks[breaks.length - 1].end);
  $("startPerformanceBtn").disabled = active;
  $("startBreakBtn").disabled = !active || inBreak;
  $("endBreakBtn").disabled = !active || !inBreak;
  $("endPerformanceBtn").disabled = !active;
  updateDashboard(session);
}
function calculateBreakMs(session) {
  let total = 0;
  (session?.breaks || []).forEach(b => { const start = getDateFromTimestamp(b.start); const end = getDateFromTimestamp(b.end) || new Date(); if (start) total += Math.max(0, end - start); });
  return total;
}
function updateDashboard(session) {
  const dash = $("sessionDashboard"); if (!dash) return;
  if (!session) { dash.innerHTML = `<div class="dashboard-grid"><div class="dashboard-card"><strong>Status</strong><span>No active session</span></div><div class="dashboard-card"><strong>Breaks</strong><span>0 (0mins)</span></div></div>`; return; }
  const started = getDateFromTimestamp(session.startedAt);
  const breakMs = calculateBreakMs(session);
  const elapsedMs = started ? Date.now() - started.getTime() : 0;
  const playingMs = Math.max(0, elapsedMs - breakMs);
  const completed = currentRequests.filter(r => r.status === "completed").length;
  const abandoned = currentRequests.filter(r => r.status === "abandoned").length;
  const deleted = currentRequests.filter(r => r.status === "deleted").length;
  const left = currentRequests.filter(r => !r.status || r.status === "active" || r.status === "pending" || r.status === "waiting").length;
  const avgBpmArr = currentRequests.map(r => Number(r.userBpm || r.songUserBpm || r.bpm)).filter(Boolean);
  const avgBpm = avgBpmArr.length ? Math.round(avgBpmArr.reduce((a,b)=>a+b,0) / avgBpmArr.length) : "-";
  dash.innerHTML = `<div class="dashboard-grid">
    <div class="dashboard-card"><strong>Status</strong><span>Active Session</span></div>
    <div class="dashboard-card"><strong>Started</strong><span>${formatTime(started)}</span></div>
    <div class="dashboard-card"><strong>Elapsed incl. breaks</strong><span>${msToMinutes(elapsedMs)}m</span></div>
    <div class="dashboard-card"><strong>Total Breaks</strong><span>${(session.breaks || []).length} (${msToMinutes(breakMs)}m)</span></div>
    <div class="dashboard-card"><strong>Play Time excl. breaks</strong><span>${msToMinutes(playingMs)}m</span></div>
    <div class="dashboard-card"><strong>Completed</strong><span>${completed}</span></div>
    <div class="dashboard-card"><strong>Abandoned</strong><span>${abandoned}</span></div>
    <div class="dashboard-card"><strong>Deleted</strong><span>${deleted}</span></div>
    <div class="dashboard-card"><strong>Songs Left Active</strong><span>${left}</span></div>
    <div class="dashboard-card"><strong>Total Requests</strong><span>${currentRequests.length}</span></div>
    <div class="dashboard-card"><strong>Average BPM</strong><span>${avgBpm}</span></div>
    <div class="dashboard-card"><strong>Date</strong><span>${formatDate(started)}</span></div>
  </div>`;
}

function listenRequestsForSession(sessionId) {
  if (requestsUnsubscribe) requestsUnsubscribe();
  if (!sessionId) { currentRequests = []; renderActiveRequests(); return; }
  requestsUnsubscribe = db.collection("publicSongRequests").where("sessionId", "==", sessionId).onSnapshot(snap => {
    currentRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderActiveRequests(); updateDashboard(currentSessionData);
  }, err => { console.error(err); logAdmin("Request listener error: " + err.message); });
}
function renderActiveRequests() {
  const box = $("activeRequestsList"); if (!box) return;
  const active = currentRequests.filter(r => !r.status || r.status === "active" || r.status === "pending" || r.status === "waiting");
  const sort = $("requestSortSelect")?.value || "oldest";
  active.sort((a,b) => {
    if (sort === "song") return String(a.songTitle || a.title || "").localeCompare(String(b.songTitle || b.title || ""));
    const da = getDateFromTimestamp(a.createdAt)?.getTime() || 0; const dbb = getDateFromTimestamp(b.createdAt)?.getTime() || 0;
    return sort === "newest" ? dbb - da : da - dbb;
  });
  if ($("activeRequestCount")) $("activeRequestCount").innerText = `(${active.length})`;
  if (!active.length) { box.innerHTML = `<div class="request-empty">No active song requests</div>`; return; }
  box.innerHTML = `<div class="request-header"><div>#</div><div>Song</div><div>Requested By</div><div>BPM</div><div>Time</div><div>Actions</div></div>`;
  active.forEach((req, i) => {
    const row = document.createElement("div"); row.className = "active-request-row";
    const title = req.songTitle || req.title || "Untitled";
    const artist = req.songArtist || req.artist || "";
    const name = req.singerName || req.name || "Unknown";
    const locationAge = [req.location, req.ageRange].filter(Boolean).join(" · ");
    const bpm = req.userBpm || req.songUserBpm || req.bpm || "-";
    row.innerHTML = `<div class="request-number">${i + 1}</div>
      <div class="request-main"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(artist)}</span></div>
      <div class="request-person"><strong>${escapeHTML(name)}</strong><span>${escapeHTML(locationAge)}</span></div>
      <div>${escapeHTML(bpm)}</div><div>${minutesAgo(req.createdAt)} mins ago</div>
      <div class="request-actions"><button class="request-done" onclick="completeRequest('${req.id}')">★</button><button class="request-abandoned" onclick="openReasonModal('${req.id}', 'abandoned')">🚶</button><button class="request-delete" onclick="openReasonModal('${req.id}', 'deleted')">×</button></div>`;
    box.appendChild(row);
  });
}
async function completeRequest(id) { await db.collection("publicSongRequests").doc(id).set({ status: "completed", completedAt: serverNow(), updatedAt: serverNow() }, { merge: true }); setSessionStatus("Request completed."); }
function openReasonModal(id, mode) { reasonRequestId = id; reasonMode = mode; $("reasonModalTitle").innerText = mode === "abandoned" ? "Mark Request Abandoned" : "Delete Request"; $("reasonModalInput").value = ""; $("reasonModal").classList.remove("hidden"); $("reasonConfirmBtn").onclick = confirmRequestReason; }
function closeReasonModal() { $("reasonModal").classList.add("hidden"); reasonRequestId = null; }
async function confirmRequestReason() {
  if (!reasonRequestId) return;
  const note = $("reasonModalInput").value || "";
  const patch = { status: reasonMode, reason: note, updatedAt: serverNow() };
  if (reasonMode === "abandoned") patch.abandonedAt = serverNow(); else patch.deletedAt = serverNow();
  await db.collection("publicSongRequests").doc(reasonRequestId).set(patch, { merge: true });
  closeReasonModal(); setSessionStatus(reasonMode === "abandoned" ? "Request abandoned." : "Request deleted.");
}
window.renderActiveRequests = renderActiveRequests; window.completeRequest = completeRequest; window.openReasonModal = openReasonModal; window.closeReasonModal = closeReasonModal; window.confirmRequestReason = confirmRequestReason;

function initAdminAfterLogin() {
  listenKaraokeState();
  listenCurrentSession();
  if (isOwner()) loadAllMembers();
  $("sessionNotesInput")?.addEventListener("input", saveSessionNotesLive);
  logAdmin("System loaded");
  updateDashboard(null); renderActiveRequests(); updateClock();
}
function updateClock() {
  const now = new Date();
  const day = now.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  if ($("dayLabel")) $("dayLabel").innerText = day;
  if ($("todayLabel")) $("todayLabel").innerText = formatDate(now);
  if ($("clockLabel")) $("clockLabel").innerText = formatTime(now);
}
setInterval(() => { updateClock(); if (currentSessionData) updateDashboard(currentSessionData); updateStatusStrip(); }, 30000);
window.addEventListener("load", updateClock);
