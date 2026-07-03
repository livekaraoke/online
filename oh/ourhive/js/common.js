function $(id) { return document.getElementById(id); }
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function emailKey(email) { return normalizeEmail(email).replace(/[^a-z0-9]/g, "_"); }
function makeId(text) { return String(text || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item"; }
function fmtDate(value) {
  if (!value) return "";
  const d = value.toDate ? value.toDate() : new Date(value);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayDate(value) {
  if (!value) return "";
  const d = value.toDate ? value.toDate() : new Date(value);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}
function showModal(title, html, actions = []) {
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    const buttons = actions.length ? actions : [{ label: "OK", value: true, className: "primary" }];
    wrap.innerHTML = `
      <div class="modal-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="modal-content">${html}</div>
        <div class="modal-actions"></div>
      </div>`;
    const actionsEl = wrap.querySelector(".modal-actions");
    buttons.forEach(a => {
      const b = document.createElement("button");
      b.className = "btn " + (a.className || "");
      b.textContent = a.label;
      b.onclick = () => { wrap.remove(); resolve(a.value); };
      actionsEl.appendChild(b);
    });
    document.body.appendChild(wrap);
  });
}
function confirmBox(title, message) {
  return showModal(title, `<p>${escapeHtml(message)}</p>`, [
    { label: "Cancel", value: false },
    { label: "OK", value: true, className: "primary" }
  ]);
}
function currentYearMonth() { return new Date().toISOString().slice(0, 7); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

async function saveUserProfile(user) {
  if (!user) return;
  await db.collection("users").doc(user.uid).set({
    uid: user.uid,
    displayName: user.displayName || user.email,
    email: normalizeEmail(user.email),
    photoURL: user.photoURL || "",
    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

function requireAuth(callback) {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    await saveUserProfile(user);
    callback(user);
  });
}

async function logout() {
  await auth.signOut();
  window.location.href = "index.html";
}

async function getMyHives(user) {
  const email = normalizeEmail(user.email);
  const memberSnap = await db.collection("hives").where("memberIds", "array-contains", user.uid).get();
  const inviteSnap = await db.collection("hives").where("inviteEmails", "array-contains", email).get();
  const map = new Map();
  memberSnap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
  inviteSnap.forEach(d => map.set(d.id, { id: d.id, ...d.data(), invited: true }));
  return [...map.values()].sort((a,b) => (a.name || "").localeCompare(b.name || ""));
}

async function createHive(user, name = OURHIVE.defaultHiveName) {
  const ref = db.collection("hives").doc();
  const email = normalizeEmail(user.email);
  await ref.set({
    name,
    tagline: "Built for two. Ready for more.",
    ownerId: user.uid,
    ownerEmail: email,
    memberIds: [user.uid],
    memberEmails: [email],
    inviteEmails: [],
    members: {
      [user.uid]: { role: "owner", email, displayName: user.displayName || email, photoURL: user.photoURL || "" }
    },
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function joinHive(user, hiveId) {
  const ref = db.collection("hives").doc(hiveId);
  const email = normalizeEmail(user.email);
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("Hive not found");
    const h = doc.data();
    const inviteEmails = (h.inviteEmails || []).filter(e => e !== email);
    const memberIds = Array.from(new Set([...(h.memberIds || []), user.uid]));
    const memberEmails = Array.from(new Set([...(h.memberEmails || []), email]));
    const members = h.members || {};
    members[user.uid] = { role: "member", email, displayName: user.displayName || email, photoURL: user.photoURL || "" };
    tx.update(ref, { inviteEmails, memberIds, memberEmails, members, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  });
}

function getHiveId() {
  return localStorage.getItem("ourhive_activeHiveId") || new URLSearchParams(location.search).get("hive");
}
function setHiveId(id) { localStorage.setItem("ourhive_activeHiveId", id); }

async function ensureHive(user) {
  let hiveId = getHiveId();
  if (hiveId) return hiveId;
  const hives = await getMyHives(user);
  if (hives.length) {
    setHiveId(hives[0].id);
    return hives[0].id;
  }
  hiveId = await createHive(user, "Our Hive");
  setHiveId(hiveId);
  return hiveId;
}

function renderShell(active = "dashboard") {
  const nav = $("sideNav");
  if (!nav) return;
  const items = [
    ["dashboard.html", "dashboard", "🏠", "Dashboard"],
    ["shopping.html", "shopping", "🛒", "Shopping List"],
    ["links.html", "links", "🔗", "Link Share"],
    ["photos.html", "photos", "🖼️", "Photos"],
    ["calendar.html", "calendar", "📅", "Calendar"],
    ["notes.html", "notes", "📝", "Notes"],
    ["places.html", "places", "📍", "Places"],
    ["settings.html", "settings", "⚙️", "Settings"]
  ];
  nav.innerHTML = items.map(([href,key,icon,label]) => `
    <a class="nav-item ${active === key ? "active" : ""}" href="${href}">
      <span>${icon}</span><b>${label}</b>
    </a>`).join("");
}

function mobileNav(active = "dashboard") {
  const el = $("mobileNav");
  if (!el) return;
  const items = [
    ["dashboard.html", "dashboard", "🏠", "Home"],
    ["shopping.html", "shopping", "🛒", "Shop"],
    ["links.html", "links", "🔗", "Links"],
    ["photos.html", "photos", "🖼️", "Photos"],
    ["calendar.html", "calendar", "📅", "Calendar"],
    ["notes.html", "notes", "📝", "Notes"]
  ];
  el.innerHTML = items.map(([href,key,icon,label]) => `<a class="${active === key ? "active" : ""}" href="${href}">${icon}<span>${label}</span></a>`).join("");
}

async function loadHiveHeader(user, hiveId) {
  const doc = await db.collection("hives").doc(hiveId).get();
  const hive = doc.data() || {};
  const nameEl = $("hiveName");
  if (nameEl) nameEl.textContent = hive.name || "Our Hive";
  const userEl = $("currentUserName");
  if (userEl) userEl.textContent = user.displayName || user.email;
  const emailEl = $("currentUserEmail");
  if (emailEl) emailEl.textContent = user.email || "";
  const img = $("currentUserPhoto");
  if (img && user.photoURL) img.src = user.photoURL;
  return hive;
}
