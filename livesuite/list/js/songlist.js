const MAIN_LIST_ID = "venue-main-public-song-list";
const DEFAULT_LIST_NAME = "Venue Main Public Song List";

let currentList = null;
let sections = [];
let sectionSongs = [];
let lyricsSongs = [];
let selectedSignupSong = null;
let requestCart = [];
let requestsOpen = false;
let currentSignupSession = null;
let fullSongListOpen = false;

// The Admin dashboard chooses which Lyrics Suite setlist is public.
// Configuration is stored in karaokeControl/publicSongList.
let selectedPublicSetlist = null;
let selectedPublicSongIds = null;
let publicSetlistUnsubscribe = null;

const PUBLIC_CATEGORY_DEFS = [
  { key:"mostPopular", title:"MOST POPULAR", icon:"🔥" },
  { key:"partyAnthems", title:"PARTY ANTHEMS", icon:"🎉" },
  { key:"easyToSing", title:"EASY TO SING", icon:"🎤" },
  { key:"newAdditions", title:"NEW ADDITIONS", icon:"🆕" }
];

let publicCategoryConfig = {
  mostPopular:[],
  partyAnthems:[],
  easyToSing:[],
  newAdditions:[]
};
let publicCategoryUnsubscribe = null;
let publicCategoryOpenState = {};

let liveSessionRequests = [];
let liveRequestsUnsubscribe = null;
let liveSessionUnsubscribe = null;

const ACTIVE_REQUEST_STATUSES = ["pending", "active", "waiting"];
const CLOSED_REQUEST_STATUSES = ["completed"];
const RELEASED_REQUEST_STATUSES = ["abandoned", "deleted", "deletedByHost"];


/*const CATEGORY_ICONS = ["🔥", "🎉", "🎤", "🆕", "★"];*/
const CATEGORY_ICONS = ["🔥", "🎉", "🎤", "🆕", "★"];

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeSongKey(song) {
  return String(
    song.songId ||
    song.lyricsId ||
    song.id ||
    `${song.songTitle || song.title || ""}-${song.artist || song.songArtist || ""}`
  )
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isActiveRequest(req) {
  return !req.status || ACTIVE_REQUEST_STATUSES.includes(req.status);
}

function isSongUnavailable(song) {
  const key = normalizeSongKey(song);

  return liveSessionRequests.some(req => {
    if (!isActiveRequest(req)) return false;
    return normalizeSongKey(req) === key;
  });
}

function startLiveRequestListener() {
  if (liveSessionUnsubscribe) liveSessionUnsubscribe();

  liveSessionUnsubscribe = db
    .collection("karaokeControl")
    .doc("currentSession")
    .onSnapshot(doc => {
      const data = doc.exists ? doc.data() : {};

      const sessionId =
        data.sessionId ||
        data.activeSessionId ||
        "";

      if (liveRequestsUnsubscribe) {
        liveRequestsUnsubscribe();
        liveRequestsUnsubscribe = null;
      }

      liveSessionRequests = [];

      if (!data.active || !sessionId) {
        updateLiveRequestUi();
        return;
      }

      liveRequestsUnsubscribe = db
        .collection("publicSongRequests")
        .where("sessionId", "==", sessionId)
        .onSnapshot(snapshot => {
          liveSessionRequests = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          updateLiveRequestUi();
        });
    });
}

function updateLiveRequestUi() {
  renderPublicSongList();
  renderSearchResults();

  const queuePanelOpen =
    document.getElementById("bottomPanel") &&
    !document.getElementById("bottomPanel").classList.contains("hidden");

  if (queuePanelOpen && typeof openQueuePanel === "function") {
    openQueuePanel();
  }
}

function cleanText(value) { return String(value || "").trim(); }
function sortByTitle(a, b) { return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }); }
function sortByOrderThenTitle(a, b) {
  const orderA = Number(a.order || 0);
  const orderB = Number(b.order || 0);
  if (orderA !== orderB) return orderA - orderB;
  return sortByTitle(a, b);
}
function getSongText(song) { return `${song.title || ""} ${song.artist || ""} ${song.year || ""}`.toLowerCase(); }
function getLyricsSongById(id) { return lyricsSongs.find(song => song.id === id) || null; }
function getVisibleFullSongs() {
  // When a Lyrics Suite setlist has been selected in Admin, that setlist is
  // authoritative. Individual publicSongListVisible flags do not hide songs
  // that were deliberately placed into the selected public setlist.
  if (selectedPublicSongIds instanceof Set) {
    return lyricsSongs
      .filter(song => selectedPublicSongIds.has(song.id))
      .sort(sortByTitle);
  }

  // Backward-compatible fallback before a public setlist is selected.
  return lyricsSongs
    .filter(song => song.publicSongListVisible !== false)
    .sort(sortByTitle);
}
function getFullSongCount() { return getVisibleFullSongs().length; }
function getSectionSongs(sectionId) {
  return sectionSongs
    .filter(item => item.sectionId === sectionId)
    .filter(item => {
      if (!(selectedPublicSongIds instanceof Set)) return true;
      return selectedPublicSongIds.has(item.lyricsId);
    })
    .sort(sortByOrderThenTitle);
}
function getSectionSongDisplay(item) {
  const source = getLyricsSongById(item.lyricsId);
  return {
    id: item.lyricsId || item.id,
    entryId: item.id,
    lyricsId: item.lyricsId,
    title: item.title || source?.title || "",
    artist: item.artist || source?.artist || "",
    year: item.year || source?.year || "",
    visible: item.visible !== false,
    order: item.order || 0
  };
}
function getAlphaGroup(title) {
  const first = String(title || "").trim().charAt(0).toUpperCase();
  if ("AB".includes(first)) return "A – B";
  if ("CD".includes(first)) return "C – D";
  if ("EFGH".includes(first)) return "E – H";
  if ("IJKL".includes(first)) return "I – L";
  if ("MNOPQ".includes(first)) return "M – Q";
  if ("RS".includes(first)) return "R – S";
  return "T – Z";
}
function alphabetGroups(list) {
  const order = ["A – B", "C – D", "E – H", "I – L", "M – Q", "R – S", "T – Z"];
  const groups = {};
  order.forEach(name => groups[name] = []);
  list.forEach(song => groups[getAlphaGroup(song.title)].push(song));
  return { order, groups };
}
function isAlreadyPlayedToday(song) {
  const title = String(song.title || "").toLowerCase().replace(/[’']/g, "'");
  return title.includes("don't stop believin") || title.includes("dont stop believin");
}

function getActiveRequestListId() {
  return selectedPublicSetlist?.id || MAIN_LIST_ID;
}

function updatePublicSetlistBanner() {
  const el = document.getElementById("publicSetlistName");
  if (!el) return;

  el.textContent =
    selectedPublicSetlist?.name ||
    "Venue Main Public Song List";
}

async function resolvePublicSetlist(configData) {
  const setlistId = configData?.setlistId || "";

  if (!setlistId) {
    selectedPublicSetlist = null;
    selectedPublicSongIds = null;
    updatePublicSetlistBanner();
    return;
  }

  try {
    const snap = await db.collection("lyricsSetlists").doc(setlistId).get();

    if (!snap.exists) {
      console.warn("Selected public setlist no longer exists:", setlistId);
      selectedPublicSetlist = null;
      selectedPublicSongIds = new Set();
      updatePublicSetlistBanner();
      return;
    }

    const data = snap.data() || {};
    const songIds = Array.isArray(data.songIds) ? data.songIds : [];

    selectedPublicSetlist = {
      id: snap.id,
      name: data.name || configData?.setlistName || "Untitled Setlist",
      songIds
    };

    selectedPublicSongIds = new Set(songIds);
    updatePublicSetlistBanner();
  } catch (error) {
    console.error("Could not resolve selected public setlist:", error);
    selectedPublicSetlist = null;
    selectedPublicSongIds = null;
    updatePublicSetlistBanner();
  }
}

async function loadPublicSetlistConfig() {
  try {
    const snap = await db.collection("karaokeControl").doc("publicSongList").get();
    await resolvePublicSetlist(snap.exists ? (snap.data() || {}) : {});
  } catch (error) {
    console.warn("Public setlist config unavailable; using legacy public list.", error);
    selectedPublicSetlist = null;
    selectedPublicSongIds = null;
    updatePublicSetlistBanner();
  }
}

function startPublicSetlistListener() {
  if (publicSetlistUnsubscribe) return;

  publicSetlistUnsubscribe = db
    .collection("karaokeControl")
    .doc("publicSongList")
    .onSnapshot(async doc => {
      await resolvePublicSetlist(doc.exists ? (doc.data() || {}) : {});
      await loadPublicCategoryConfig();

      // No page reload required: changing the Admin dropdown immediately
      // changes the public list for visitors who already have it open.
      renderPublicSongList();
      renderSearchResults();
    }, error => {
      console.warn("Could not listen for Public Song List selection:", error);
    });
}

function applyPublicCategoryConfig(data) {
  const setlistId = selectedPublicSetlist?.id || "";
  const cfg = setlistId && data?.setlists?.[setlistId]
    ? data.setlists[setlistId]
    : {};

  PUBLIC_CATEGORY_DEFS.forEach(def => {
    publicCategoryConfig[def.key] = Array.isArray(cfg[def.key])
      ? cfg[def.key].filter(id =>
          !(selectedPublicSongIds instanceof Set) ||
          selectedPublicSongIds.has(id)
        )
      : [];
  });
}

async function loadPublicCategoryConfig() {
  try {
    const snap = await db.collection("karaokeControl").doc("publicSongCategories").get();
    applyPublicCategoryConfig(snap.exists ? (snap.data() || {}) : {});
  } catch (error) {
    console.warn("Could not load public song categories:", error);
    applyPublicCategoryConfig({});
  }
}

function startPublicCategoryListener() {
  if (publicCategoryUnsubscribe) return;

  publicCategoryUnsubscribe = db
    .collection("karaokeControl")
    .doc("publicSongCategories")
    .onSnapshot(doc => {
      applyPublicCategoryConfig(doc.exists ? (doc.data() || {}) : {});
      renderPublicSongList();
    }, error => {
      console.warn("Could not listen for public song categories:", error);
    });
}

async function ensureMainList() {
  const ref = db.collection("songlists").doc(MAIN_LIST_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      name: DEFAULT_LIST_NAME,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  const fresh = await ref.get();
  currentList = { id: fresh.id, ...fresh.data() };
  return currentList;
}
async function loadSections() {
  const snap = await db.collection("songlistSections").where("listId", "==", MAIN_LIST_ID).get();
  sections = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByOrderThenTitle);
}
async function loadSectionSongs() {
  const snap = await db.collection("songlistSongs").where("listId", "==", MAIN_LIST_ID).get();
  sectionSongs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByOrderThenTitle);
}
async function loadLyricsSongs() {
  const snap = await db.collection("lyrics").get();
  lyricsSongs = snap.docs.map(doc => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      title: data.title || "",
      artist: data.artist || "",
      year: data.year || "",
      publicSongListVisible: data.publicSongListVisible !== false
    };
  }).filter(song => song.title).sort(sortByTitle);
}
async function reloadAll() {
  await ensureMainList();
  await loadSections();
  await loadSectionSongs();
  await loadLyricsSongs();
}

async function getCurrentSignupSession(showClosed = true) {
  const snap = await db.collection("karaokeControl").doc("currentSession").get();
  const data = snap.exists ? snap.data() : {};
  const activeId = data.activeSessionId || data.sessionId;

  if (data.active === true && activeId) {
    requestsOpen = true;
    currentSignupSession = { sessionId: data.sessionId, isTestSession: false };
    return {
  sessionId: activeId,
  isTestSession: false
};
  }
  requestsOpen = false;
  currentSignupSession = null;
  if (showClosed) showRequestsClosedOnly();
  return null;
}
function showRequestsClosedOnly() {
  document.body.classList.add("requests-closed");
  document.querySelectorAll(".requests-open-only").forEach(el => el.classList.add("hidden"));
  const msg = document.getElementById("requestsClosedMessage");
  if (msg) msg.classList.remove("hidden");
}
function showRequestsOpenPage() {
  document.body.classList.remove("requests-closed");
  document.querySelectorAll(".requests-open-only").forEach(el => el.classList.remove("hidden"));
  const msg = document.getElementById("requestsClosedMessage");
  if (msg) msg.classList.add("hidden");
}

function songKey(song) { return song.id || song.lyricsId || `${song.title}|${song.artist}`; }
function isInCart(song) { return requestCart.some(item => songKey(item) === songKey(song)); }
function updateCartCount() {
  document.querySelectorAll(".cart-count").forEach(el => el.innerText = String(requestCart.length));
  document.querySelectorAll(".signup-song-btn").forEach(btn => {
    const key = btn.dataset.songKey;
    if (!key) return;
    btn.classList.toggle("in-cart", requestCart.some(item => songKey(item) === key));
  });
}
function addSongToCart(song, requestAnyway = false) {
  if (!requestsOpen) { showRequestsClosedOnly(); return; }
  const key = songKey(song);
  if (!requestCart.some(item => songKey(item) === key)) {
    requestCart.push({
      id: song.id || song.lyricsId || "",
      title: song.title || "",
      artist: song.artist || "",
      year: song.year || "",
      requestAnyway: !!requestAnyway,
      alreadyPlayedToday: isAlreadyPlayedToday(song)
    });
  }
  updateCartCount();
  showCartToast(`${song.title || "Song"} added to your requests`);
}
function removeSongFromCart(key) {
  requestCart = requestCart.filter(item => songKey(item) !== key);
  renderCartPreview();
  updateCartCount();
}
function showCartToast(text) {
  const toast = document.getElementById("cartToast");
  if (!toast) return;
  toast.innerText = text;
  toast.classList.add("show");
  clearTimeout(showCartToast.timer);
  showCartToast.timer = setTimeout(() => toast.classList.remove("show"), 1400);
}
function signupButtonHTML(song) {
  const alreadyPlayed = isAlreadyPlayedToday(song);
  const key = songKey(song);
  const json = encodeURIComponent(JSON.stringify({
    id: song.id || song.lyricsId || "",
    title: song.title || "",
    artist: song.artist || "",
    year: song.year || ""
  }));
  return `
    <div class="song-right-side ${alreadyPlayed ? "already-played-side" : ""}">
      ${alreadyPlayed ? `<span class="already-played-label">! ALREADY PLAYED TODAY</span>` : ""}
      <strong class="song-year">${escapeHTML(song.year)}</strong>
      <button
        class="signup-song-btn ${alreadyPlayed ? "request-anyway-btn" : ""} ${isInCart(song) ? "in-cart" : ""}"
        type="button"
        data-song-key="${escapeHTML(key)}"
        title="${alreadyPlayed ? "Request anyway" : "Add to request"}"
        onclick="addSongToCartFromButton('${json}', ${alreadyPlayed ? "true" : "false"})">
        ${alreadyPlayed ? "➜" : "+"}
      </button>
    </div>`;
}
function addSongToCartFromButton(encoded, requestAnyway) {
  try { addSongToCart(JSON.parse(decodeURIComponent(encoded)), requestAnyway); }
  catch (e) { console.error(e); }
}
window.addSongToCartFromButton = addSongToCartFromButton;

function openSignupModal() {
  clearSearchResults();
  if (!requestCart.length) {
    showCartToast("Tap + beside songs first");
    return;
  }
  document.getElementById("signupSongTitle").innerText = `${requestCart.length} song request${requestCart.length === 1 ? "" : "s"}`;
  document.getElementById("signupSongArtist").innerText = "Review your songs, enter your name, then sign up.";
  document.getElementById("signupName").value = "";
  document.getElementById("signupLocation").value = "";
  document.getElementById("signupAgeRange").value = "";
  document.getElementById("signupRating").value = "";
  document.getElementById("signupNote").value = "";
  document.getElementById("signupMessage").innerText = "";
  renderCartPreview();
  document.getElementById("signupModal").classList.remove("hidden");
  document.getElementById("signupName").focus();
}
function closeSignupModal() { document.getElementById("signupModal").classList.add("hidden"); }
function renderCartPreview() {
  const box = document.getElementById("signupCartPreview");
  if (!box) return;
  box.innerHTML = requestCart.map(item => `
    <div class="signup-cart-row">
      <div><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.artist)}${item.year ? " • " + escapeHTML(item.year) : ""}</span>${item.alreadyPlayedToday ? `<small>Request anyway after already played</small>` : ""}</div>
      <button type="button" onclick="removeSongFromCart('${escapeHTML(songKey(item))}')">×</button>
    </div>`).join("");
}
async function submitSongSignup() {
  const name = document.getElementById("signupName").value.trim();
  if (!name) { document.getElementById("signupMessage").innerText = "Please enter your name."; return; }
  if (!requestCart.length) { document.getElementById("signupMessage").innerText = "Please add at least one song."; return; }
  const submitBtn = document.getElementById("signupSubmitBtn");
  submitBtn.disabled = true; submitBtn.innerText = "SENDING...";
  const sessionInfo = await getCurrentSignupSession(false);
  if (!sessionInfo) { submitBtn.disabled = false; submitBtn.innerText = "SIGN UP"; showRequestsClosedOnly(); return; }
  try {
    const shared = {
      listId: getActiveRequestListId(),
      publicSetlistId: selectedPublicSetlist?.id || "",
      publicSetlistName: selectedPublicSetlist?.name || "",
      sessionId: sessionInfo.sessionId,
      isTestSession: sessionInfo.isTestSession,
      status: "active",
      singerName: name,
      name,
      location: document.getElementById("signupLocation").value.trim(),
      ageRange: document.getElementById("signupAgeRange").value,
      rating: document.getElementById("signupRating").value,
      note: document.getElementById("signupNote").value.trim(),
      source: "public-songlist",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    for (const item of requestCart) {
      await db.collection("publicSongRequests").add({
        ...shared,
        songId: item.id || "",
        songTitle: item.title || "",
        artist: item.artist || "",
        songArtist: item.artist || "",
        year: item.year || "",
        requestAnyway: !!item.requestAnyway,
        alreadyPlayedToday: !!item.alreadyPlayedToday
      });
    }
    document.getElementById("signupMessage").innerHTML = `Thank you! ${requestCart.length} request${requestCart.length === 1 ? "" : "s"} received. We’ll call you shortly.`;
    requestCart = [];
    updateCartCount();
    setTimeout(closeSignupModal, 2100);
  } catch (error) {
    console.error(error);
    document.getElementById("signupMessage").innerText = "Could not send request. Please try again.";
  }
  submitBtn.disabled = false; submitBtn.innerText = "SIGN UP";
}
window.openSignupModal = openSignupModal;
window.closeSignupModal = closeSignupModal;
window.removeSongFromCart = removeSongFromCart;

function renderSearchResults() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResultsBox");
  if (!input || !box) return;
  const search = input.value.toLowerCase().trim();
  if (!search) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const unique = new Map();
  getVisibleFullSongs().forEach(song => unique.set(song.id || `${song.title}-${song.artist}`, song));
  const results = [...unique.values()].filter(song => getSongText(song).includes(search)).sort(sortByTitle);
  box.innerHTML = "";
  if (!results.length) { box.innerHTML = `<div class="search-result-row empty">No songs found</div>`; box.classList.remove("hidden"); return; }
  results.slice(0, 20).forEach(song => {
    const row = document.createElement("div");
    row.className = "search-result-row";
    row.innerHTML = `<div class="song-text-main"><strong>${escapeHTML(song.title)}</strong><span>${escapeHTML(song.artist)}</span></div>${signupButtonHTML(song)}`;
    box.appendChild(row);
  });
  box.classList.remove("hidden");
}
function clearSearchResults() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResultsBox");
  if (input) input.value = "";
  if (box) { box.innerHTML = ""; box.classList.add("hidden"); }
}

function renderCategoryNav() {
  const nav = document.getElementById("categoryNav");
  if (!nav) return;
  nav.innerHTML = "";
  const visibleSections = sections.filter(section => section.visible !== false).sort(sortByOrderThenTitle);
  visibleSections.forEach((section, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-card";
    btn.innerHTML = `<b>${CATEGORY_ICONS[index] || "🎵"}</b><strong>${escapeHTML(section.title)}</strong><span>${categorySubText(section.title, index)}</span>`;
    btn.onclick = () => document.getElementById(`customSection-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    nav.appendChild(btn);
  });
  const fullBtn = document.createElement("button");
  fullBtn.type = "button";
  fullBtn.className = "category-card full-category-card";
  fullBtn.innerHTML = `<b>★</b><strong>FULL SONG LIST</strong><span>All songs A–Z</span>`;
  fullBtn.onclick = () => toggleFullSongList(true);
  nav.appendChild(fullBtn);
}
function categorySubText(title, index) {
  const t = String(title || "").toLowerCase();
  if (t.includes("popular")) return "Top crowd picks";
  if (t.includes("party")) return "Get the party started";
  if (t.includes("easy")) return "Great for everyone";
  if (t.includes("new")) return "Recently added";
  return index === 0 ? "Top crowd picks" : "Browse category";
}
function toggleFullSongList(forceOpen = false) {
  fullSongListOpen = forceOpen ? true : !fullSongListOpen;
  renderPublicSongList();
  document.getElementById("fullSongListSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
window.toggleFullSongList = toggleFullSongList;

async function initPublicSongList() {
  await loadPublicSetlistConfig();
  await reloadAll();
  await loadPublicCategoryConfig();
  startPublicSetlistListener();
  startPublicCategoryListener();
  const sessionInfo = await getCurrentSignupSession(false);
  if (!sessionInfo) { showRequestsClosedOnly(); return; }
  showRequestsOpenPage();
  renderCategoryNav();
  renderPublicSongList();
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearchBtn");
  if (searchInput) {
    searchInput.addEventListener("input", renderSearchResults);
    searchInput.addEventListener("blur", () => setTimeout(clearSearchResults, 180));
  }
  if (clearBtn) clearBtn.onclick = clearSearchResults;
  window.addEventListener("scroll", () => {
    const box = document.getElementById("searchResultsBox");
    const search = document.getElementById("searchInput");
    if (!box || !search || box.classList.contains("hidden")) return;
    const rect = search.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) clearSearchResults();
  });
  startLiveRequestListener();
}
function renderPublicSongList() {
  const container = document.getElementById("publicSongList");
  if (!container) return;
  container.innerHTML = "";
  renderPublicCustomSections(container, "");
  renderPublicFullList(container, "");
  updateCartCount();
}
function renderPublicCustomSections(container, search) {
  sections.filter(section => section.visible !== false).sort(sortByOrderThenTitle).forEach((section, sectionIndex) => {
    const items = getSectionSongs(section.id).map(getSectionSongDisplay).filter(song => song.visible !== false).filter(song => !search || getSongText(song).includes(search));
    if (!items.length && search) return;
    const sectionEl = document.createElement("section");
    sectionEl.className = "song-section public-section custom-section";
    sectionEl.id = `customSection-${sectionIndex}`;
    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "section-red-header";
    const body = document.createElement("div");
    body.className = "public-section-songs section-body-card";
    body.style.display = fullSongListOpen ? "none" : (section.openByDefault ? "block" : "none");
    function updateHeading() {
      const isOpen = body.style.display !== "none";
      heading.innerHTML = `<span>${escapeHTML(section.title)}</span><em>${isOpen ? "VIEW LESS" : "VIEW ALL"} →</em>`;
    }
    heading.onclick = () => { const open = body.style.display !== "none"; body.style.display = open ? "none" : "block"; updateHeading(); };
    updateHeading();
    renderPlainSongList(body, items.slice(0, fullSongListOpen ? 0 : items.length));
    sectionEl.appendChild(heading);
    sectionEl.appendChild(body);
    container.appendChild(sectionEl);
  });
}
function renderPublicFullList(container, search) {
  const fullSongs = getVisibleFullSongs().filter(song => !search || getSongText(song).includes(search));
  const wrapper = document.createElement("section");
  wrapper.id = "fullSongListSection";
  wrapper.className = `full-song-list-wrapper ${fullSongListOpen ? "open" : "closed"}`;
  const banner = document.createElement("button");
  banner.type = "button";
  banner.className = "full-song-list-toggle";
  banner.onclick = () => toggleFullSongList(false);
  banner.innerHTML = `<span>★ FULL SONG LIST ★</span><small>BROWSE ALL SONGS A–Z</small><b>${fullSongListOpen ? "⌃" : "›"}</b>`;
  wrapper.appendChild(banner);
  if (!fullSongListOpen) { container.appendChild(wrapper); return; }
  const { order, groups } = alphabetGroups(fullSongs);
  let counter = 1;
  order.forEach(groupName => {
    const groupSongs = groups[groupName];
    if (!groupSongs.length) return;
    const section = document.createElement("section");
    section.className = "song-section full-alpha-section";
    section.innerHTML = `<div class="song-section-box"><h2 class="alphabet-subheader alpha-heading">${escapeHTML(groupName)}</h2><ol start="${counter}"></ol></div>`;
    const ol = section.querySelector("ol");
    groupSongs.forEach(song => {
      const li = document.createElement("li");
      li.className = isAlreadyPlayedToday(song) ? "already-played-song" : "";
      li.innerHTML = `<div class="song-info song-info-with-year"><div class="song-text-main"><span>${escapeHTML(song.title)}</span><em>${escapeHTML(song.artist)}</em></div>${signupButtonHTML(song)}</div>`;
      ol.appendChild(li); counter++;
    });
    wrapper.appendChild(section);
  });
  container.appendChild(wrapper);
}
function renderPlainSongList(container, list) {
  const ol = document.createElement("ol");
  ol.className = "custom-song-list";
  list.forEach((song, idx) => {
    const li = document.createElement("li");
    li.className = isAlreadyPlayedToday(song) ? "already-played-song" : "";
    li.innerHTML = `<div class="song-info song-info-with-year"><div class="song-text-main"><span>${escapeHTML(song.title)}</span><em>${escapeHTML(song.artist)}</em></div>${signupButtonHTML(song)}</div>`;
    ol.appendChild(li);
  });
  container.appendChild(ol);
}

async function initEditor() {
  await reloadAll();
  const listNameInput = document.getElementById("listNameInput");
  if (listNameInput) listNameInput.value = currentList.name || DEFAULT_LIST_NAME;
  renderSectionsEditor();
  renderFullSongEditor();
}

function renderSectionsEditor() {
  const container = document.getElementById("sectionsEditor");
  if (!container) return;
  container.innerHTML = "";
  if (!sections.length) {
    const empty = document.createElement("div");
    empty.className = "editor-section-empty";
    empty.innerText = "No custom sections yet. Add one above.";
    container.appendChild(empty);
    return;
  }

  sections.sort(sortByOrderThenTitle).forEach(section => {
    const sectionBox = document.createElement("div");
    sectionBox.className = "editor-section";
    sectionBox.dataset.sectionId = section.id;
    sectionBox.draggable = true;
    const isCollapsed = section.editorCollapsed === true;
    const sectionItems = getSectionSongs(section.id);

    sectionBox.innerHTML = `
      <div class="editor-section-head">
        <span class="drag-handle section-drag-handle" title="Drag section">☰</span>
        <button class="section-collapse-btn" onclick="toggleEditorSectionCollapsed('${section.id}', ${isCollapsed ? "false" : "true"})">${isCollapsed ? "▼" : "▲"}</button>
        <input class="section-title-edit" value="${escapeHTML(section.title)}" onchange="renameSection('${section.id}', this.value)">
        <label class="mini-check"><input type="checkbox" ${section.visible !== false ? "checked" : ""} onchange="toggleSectionVisible('${section.id}', this.checked)"> Show</label>
        <label class="mini-check"><input type="checkbox" ${section.openByDefault ? "checked" : ""} onchange="toggleSectionDefault('${section.id}', this.checked)"> Open</label>
        <button class="section-edit-btn" onclick="focusSectionTitle(this)">✎</button>
        <button class="section-delete-btn" onclick="deleteSection('${section.id}')">✕</button>
      </div>
      <div class="editor-section-body ${isCollapsed ? "hidden" : ""}">
        <div class="add-existing-song-row">
          <select id="addSongSelect-${section.id}">${buildLyricsOptionsForSection(section.id)}</select>
          <button class="editor-btn gold" onclick="addExistingSongToSection('${section.id}')">Add Song To Section</button>
        </div>
        <div class="section-song-list" data-section-id="${section.id}"></div>
      </div>`;

    const listEl = sectionBox.querySelector(".section-song-list");
    if (!sectionItems.length) {
      const empty = document.createElement("div");
      empty.className = "editor-section-empty";
      empty.innerText = "No songs in this section yet.";
      listEl.appendChild(empty);
    } else {
      sectionItems.forEach(item => listEl.appendChild(createSectionSongRow(getSectionSongDisplay(item), section.id)));
    }
    container.appendChild(sectionBox);
  });
  enableSectionDragOrdering();
  enableSongDragOrdering();
}

function buildLyricsOptionsForSection(sectionId) {
  const existingIds = new Set(sectionSongs.filter(item => item.sectionId === sectionId).map(item => item.lyricsId));
  const available = lyricsSongs.filter(song => !existingIds.has(song.id)).sort(sortByTitle);
  if (!available.length) return `<option value="">No available songs</option>`;
  return [`<option value="">Choose a song from database...</option>`, ...available.map(song => `<option value="${song.id}">${escapeHTML(song.title)}${song.artist ? " - " + escapeHTML(song.artist) : ""}${song.year ? " (" + escapeHTML(song.year) + ")" : ""}</option>`)].join("");
}

function createSectionSongRow(song, sectionId) {
  const row = document.createElement("div");
  row.className = `editor-song-row section-song-row ${song.visible ? "" : "hidden-song"}`;
  row.dataset.entryId = song.entryId;
  row.dataset.sectionId = sectionId;
  row.draggable = true;

  row.innerHTML = `
    <span class="drag-handle song-drag-handle" title="Drag song">☰</span>

    <div class="editor-song-main">
      <strong>${escapeHTML(song.title)}</strong>
      <span>${escapeHTML(song.artist)}</span>
    </div>

    <span class="song-year">${escapeHTML(song.year)}</span>

    <div class="editor-song-buttons">
      <button onclick="toggleSectionSongVisible('${song.entryId}', ${song.visible ? "false" : "true"})">
        ${song.visible ? "Hide" : "Show"}
      </button>

      <button onclick="deleteSectionSong('${song.entryId}')">Delete</button>
    </div>
  `;

  return row;
}

function renderFullSongEditor() {
  const countEl = document.getElementById("fullSongCount");
  if (countEl) countEl.innerText = `Total songs: ${getFullSongCount()}`;
  const container = document.getElementById("fullSongList");
  if (!container) return;
  container.innerHTML = "";
  if (!lyricsSongs.length) {
    const empty = document.createElement("div");
    empty.className = "editor-section-empty";
    empty.innerText = "No songs found in Firebase collection: lyrics";
    container.appendChild(empty);
    return;
  }
  lyricsSongs.sort(sortByTitle).forEach(song => {
    const row = document.createElement("div");
    row.className = `editor-song-row full-song-row ${song.publicSongListVisible ? "" : "hidden-song"}`;
    row.innerHTML = `
  <div class="editor-song-main">
    <strong>${escapeHTML(song.title)}</strong>
    <span>${escapeHTML(song.artist)}</span>
  </div>

  <span class="song-year">${escapeHTML(song.year)}</span>

  <div class="editor-song-buttons single">
    <button onclick="toggleFullSongVisible('${song.id}', ${song.publicSongListVisible ? "false" : "true"})">
      ${song.publicSongListVisible ? "Hide" : "Show"}
    </button>
  </div>
`;
    container.appendChild(row);
  });
}

async function saveListSettings() {
  const input = document.getElementById("listNameInput");
  const name = cleanText(input?.value) || DEFAULT_LIST_NAME;
  await db.collection("songlists").doc(MAIN_LIST_ID).set({ name, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await initEditor();
  alert("List settings saved.");
}

async function addSection() {
  const titleInput = document.getElementById("sectionTitleInput");
  const openInput = document.getElementById("sectionOpenInput");
  const title = cleanText(titleInput?.value);
  if (!title) return alert("Enter a section title.");
  await db.collection("songlistSections").add({
    listId: getActiveRequestListId(), publicSetlistId: selectedPublicSetlist?.id || "", publicSetlistName: selectedPublicSetlist?.name || "",
    title,
    visible: true,
    openByDefault: !!openInput?.checked,
    editorCollapsed: false,
    order: sections.length + 1,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  titleInput.value = "";
  await initEditor();
}

async function renameSection(sectionId, title) {
  const clean = cleanText(title);
  if (!clean) {
    alert("Section title cannot be empty.");
    return initEditor();
  }
  await db.collection("songlistSections").doc(sectionId).set({ title: clean, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await initEditor();
}

async function toggleSectionVisible(sectionId, visible) {
  await db.collection("songlistSections").doc(sectionId).set({ visible, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await initEditor();
}

async function toggleSectionDefault(sectionId, openByDefault) {
  await db.collection("songlistSections").doc(sectionId).set({ openByDefault, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await initEditor();
}

async function toggleEditorSectionCollapsed(sectionId, editorCollapsed) {
  await db.collection("songlistSections").doc(sectionId).set({ editorCollapsed, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await initEditor();
}

async function deleteSection(sectionId) {
  if (!confirm("Delete this section? Songs inside this custom section will be removed from the section only. The main lyrics database will not be touched.")) return;
  const items = sectionSongs.filter(item => item.sectionId === sectionId);
  for (const item of items) await db.collection("songlistSongs").doc(item.id).delete();
  await db.collection("songlistSections").doc(sectionId).delete();
  await initEditor();
}

async function addExistingSongToSection(sectionId) {
  const select = document.getElementById(`addSongSelect-${sectionId}`);
  const lyricsId = select?.value;
  if (!lyricsId) return alert("Choose a song first.");
  const song = getLyricsSongById(lyricsId);
  if (!song) return alert("Could not find that song in the lyrics database.");
  const existing = sectionSongs.some(item => item.sectionId === sectionId && item.lyricsId === lyricsId);
  if (existing) return alert("That song is already in this section.");
  await db.collection("songlistSongs").add({
    listId: getActiveRequestListId(), publicSetlistId: selectedPublicSetlist?.id || "", publicSetlistName: selectedPublicSetlist?.name || "",
    sectionId,
    lyricsId,
    title: song.title || "",
    artist: song.artist || "",
    year: song.year || "",
    visible: true,
    order: getSectionSongs(sectionId).length + 1,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await initEditor();
}

async function toggleSectionSongVisible(entryId, visible) {
  await db.collection("songlistSongs").doc(entryId).set({ visible, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await initEditor();
}

async function deleteSectionSong(entryId) {
  if (!confirm("Remove this song from this custom section?")) return;
  await db.collection("songlistSongs").doc(entryId).delete();
  await initEditor();
}

async function toggleFullSongVisible(lyricsId, visible) {
  await db.collection("lyrics").doc(lyricsId).set({ publicSongListVisible: visible }, { merge: true });
  await initEditor();
}

function focusSectionTitle(button) {
  const input = button.closest(".editor-section-head")?.querySelector(".section-title-edit");
  if (input) { input.focus(); input.select(); }
}

function enableSectionDragOrdering() {
  const container = document.getElementById("sectionsEditor");
  if (!container) return;
  let dragged = null;
  container.querySelectorAll(".editor-section").forEach(sectionEl => {
    sectionEl.addEventListener("dragstart", e => {
      if (!e.target.classList.contains("editor-section")) return;
      dragged = sectionEl;
      sectionEl.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    sectionEl.addEventListener("dragend", async () => {
      sectionEl.classList.remove("dragging");
      dragged = null;
      await saveSectionOrderFromDOM();
    });
    sectionEl.addEventListener("dragover", e => {
      e.preventDefault();
      if (!dragged || dragged === sectionEl) return;
      const box = sectionEl.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      after ? sectionEl.after(dragged) : sectionEl.before(dragged);
    });
  });
}

async function saveSectionOrderFromDOM() {
  const nodes = [...document.querySelectorAll("#sectionsEditor .editor-section")];
  for (let i = 0; i < nodes.length; i++) {
    await db.collection("songlistSections").doc(nodes[i].dataset.sectionId).set({ order: i + 1, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  await loadSections();
}

function enableSongDragOrdering() {
  let dragged = null;
  document.querySelectorAll(".section-song-row").forEach(row => {
    row.addEventListener("dragstart", e => {
      dragged = row;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", async () => {
      row.classList.remove("dragging");
      const sectionId = row.dataset.sectionId;
      dragged = null;
      await saveSongOrderFromDOM(sectionId);
    });
    row.addEventListener("dragover", e => {
      e.preventDefault();
      if (!dragged || dragged === row) return;
      if (dragged.dataset.sectionId !== row.dataset.sectionId) return;
      const box = row.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      after ? row.after(dragged) : row.before(dragged);
    });
  });
}

async function saveSongOrderFromDOM(sectionId) {
  const rows = [...document.querySelectorAll(`.section-song-row[data-section-id="${sectionId}"]`)];
  for (let i = 0; i < rows.length; i++) {
    await db.collection("songlistSongs").doc(rows[i].dataset.entryId).set({ order: i + 1, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  await loadSectionSongs();
}

window.addEventListener("DOMContentLoaded", () => {

  const signupCloseBtn = document.getElementById("signupCloseBtn");
  const signupSubmitBtn = document.getElementById("signupSubmitBtn");

  if (signupCloseBtn) signupCloseBtn.onclick = closeSignupModal;
  if (signupSubmitBtn) signupSubmitBtn.onclick = submitSongSignup;

  if (document.body.dataset.page === "editor") {
    initEditor().catch(error => {
      console.error(error);
      alert(error.message || "Error loading editor.");
    });
  }
  if (document.body.dataset.page === "public-songlist") {
    initPublicSongList().catch(error => {
      console.error(error);
      const container = document.getElementById("publicSongList");
      if (container) container.innerHTML = `<div class="editor-section-empty">Error loading song list: ${escapeHTML(error.message)}</div>`;
    });
  }
});

/** Discourage screenshots **/

document.addEventListener("contextmenu", e => e.preventDefault());

document.addEventListener("keydown", e => {
  if (
    e.key === "PrintScreen" ||
    (e.ctrlKey && e.key.toLowerCase() === "s") ||
    (e.ctrlKey && e.key.toLowerCase() === "p")
  ) {
    e.preventDefault();
  }
});
/** ********************** **/

/************************************************************
 * V4 PUBLIC MOCK DESIGN FUNCTIONAL FIXES
 ************************************************************/
let activeCustomSectionId = null;
let submittedQueue = [];
let favouriteSongs = JSON.parse(localStorage.getItem("lkPublicFavourites") || "[]");

function saveFavourites() {
  localStorage.setItem("lkPublicFavourites", JSON.stringify(favouriteSongs));
}

function setBottomTabActive(name) {
  document.querySelectorAll(".bottom-tabs button").forEach(btn => btn.classList.remove("active"));
  const buttons = [...document.querySelectorAll(".bottom-tabs button")];
  if (name === "songlist") buttons[0]?.classList.add("active");
  if (name === "queue") buttons[1]?.classList.add("active");
  if (name === "favourites") buttons[2]?.classList.add("active");
}

function closeBottomPanels() {
  document.getElementById("queuePanel")?.classList.add("hidden");
  document.getElementById("favouritesPanel")?.classList.add("hidden");
  setBottomTabActive("songlist");
}

function switchBottomTab(tab) {
  if (tab === "queue") {
    renderQueuePanel();
    document.getElementById("favouritesPanel")?.classList.add("hidden");
    document.getElementById("queuePanel")?.classList.remove("hidden");
    setBottomTabActive("queue");
    return;
  }

  if (tab === "favourites") {
    renderFavouritesPanel();
    document.getElementById("queuePanel")?.classList.add("hidden");
    document.getElementById("favouritesPanel")?.classList.remove("hidden");
    setBottomTabActive("favourites");
  }
}

function openInfoModal() {
  document.getElementById("infoModal")?.classList.remove("hidden");
  setBottomTabActive("info");
}

function closeInfoModal() {
  document.getElementById("infoModal")?.classList.add("hidden");
  setBottomTabActive("songlist");
}

function renderQueuePanel() {
  const box = document.getElementById("queuePanelContent");
  if (!box) return;

  const activeItems = requestCart.map(item => ({ ...item, pendingCart: true }));
  const sentItems = submittedQueue.map(item => ({ ...item, sent: true }));
  const all = [...activeItems, ...sentItems];

  if (!all.length) {
    box.innerHTML = `<p class="queue-empty">No songs in your queue yet. Tap + beside a song to add it.</p>`;
    return;
  }

  box.innerHTML = all.map((item, index) => `
    <div class="queue-row">
      <div>
        <strong>${index + 1}. ${escapeHTML(item.title)}</strong>
        <span>${escapeHTML(item.artist)}${item.year ? " • " + escapeHTML(item.year) : ""}${item.sent ? " • sent to host" : " • not sent yet"}</span>
      </div>
      ${item.pendingCart ? `<button class="signup-song-btn" type="button" onclick="removeSongFromCart('${escapeHTML(songKey(item))}'); renderQueuePanel();">×</button>` : `<span class="song-year">✓</span>`}
    </div>
  `).join("");
}

function renderFavouritesPanel() {
  const box = document.getElementById("favouritesPanelContent");
  if (!box) return;

  if (!favouriteSongs.length) {
    const suggestions = getVisibleFullSongs().slice(0, 8);
    box.innerHTML = `<p class="queue-empty">No favourites saved yet. Here are quick picks:</p>` + suggestions.map(song => `
      <div class="fav-row">
        <div><strong>${escapeHTML(song.title)}</strong><span>${escapeHTML(song.artist)}${song.year ? " • " + escapeHTML(song.year) : ""}</span></div>
        <button type="button" onclick='toggleFavouriteFromJson("${encodeURIComponent(JSON.stringify(song))}"); renderFavouritesPanel();'>☆</button>
      </div>
    `).join("");
    return;
  }

  box.innerHTML = favouriteSongs.map(song => `
    <div class="fav-row">
      <div><strong>${escapeHTML(song.title)}</strong><span>${escapeHTML(song.artist)}${song.year ? " • " + escapeHTML(song.year) : ""}</span></div>
      <button type="button" onclick='addSongToCartFromButton("${encodeURIComponent(JSON.stringify(song))}", false); switchBottomTab("queue");'>+</button>
    </div>
  `).join("");
}

function toggleFavouriteFromJson(encoded) {
  const song = JSON.parse(decodeURIComponent(encoded));
  const key = songKey(song);
  if (favouriteSongs.some(item => songKey(item) === key)) {
    favouriteSongs = favouriteSongs.filter(item => songKey(item) !== key);
  } else {
    favouriteSongs.push(song);
  }
  saveFavourites();
}

function renderCategoryNav() {
  const nav = document.getElementById("categoryNav");
  if (!nav) return;
  nav.innerHTML = "";

  const visibleSections = sections.filter(section => section.visible !== false).sort(sortByOrderThenTitle);

  visibleSections.forEach((section, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-card";
    btn.innerHTML = `<b>${CATEGORY_ICONS[index] || "🎵"}</b><strong>${escapeHTML(section.title)}</strong><span>${categorySubText(section.title, index)}</span>`;
    btn.onclick = () => openCustomSection(section.id, index);
    nav.appendChild(btn);
  });

  const fullBtn = document.createElement("button");
  fullBtn.type = "button";
  fullBtn.className = "category-card full-category-card";
  fullBtn.innerHTML = `<b>★</b><strong>FULL SONG LIST</strong><span>All songs A–Z</span>`;
  fullBtn.onclick = () => toggleFullSongList(true);
  nav.appendChild(fullBtn);
}

function openCustomSection(sectionId, index) {
  fullSongListOpen = false;
  activeCustomSectionId = sectionId;
  renderPublicSongList();
  document.getElementById(`customSection-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleFullSongList(forceOpen = false) {
  fullSongListOpen = forceOpen ? true : !fullSongListOpen;
  if (fullSongListOpen) activeCustomSectionId = null;
  renderPublicSongList();
  document.getElementById("fullSongListSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
window.toggleFullSongList = toggleFullSongList;

function renderPublicCustomSections(container, search) {
  sections.filter(section => section.visible !== false).sort(sortByOrderThenTitle).forEach((section, sectionIndex) => {
    const items = getSectionSongs(section.id)
      .map(getSectionSongDisplay)
      .filter(song => song.visible !== false)
      .filter(song => !search || getSongText(song).includes(search));

    if (!items.length && search) return;

    const sectionEl = document.createElement("section");
    sectionEl.className = "song-section public-section custom-section";
    sectionEl.id = `customSection-${sectionIndex}`;

    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "section-red-header";

    const body = document.createElement("div");
    body.className = "public-section-songs section-body-card";

    const shouldOpen = !fullSongListOpen && (activeCustomSectionId ? activeCustomSectionId === section.id : section.openByDefault);
    body.style.display = shouldOpen ? "block" : "none";

    function updateHeading() {
      const isOpen = body.style.display !== "none";
      heading.innerHTML = `<span>${escapeHTML(section.title)}</span><em>${isOpen ? "VIEW LESS" : "VIEW ALL"} →</em>`;
    }

    heading.onclick = () => {
      const open = body.style.display !== "none";
      fullSongListOpen = false;
      activeCustomSectionId = open ? null : section.id;
      renderPublicSongList();
    };

    updateHeading();
    renderPlainSongList(body, items);
    sectionEl.appendChild(heading);
    sectionEl.appendChild(body);
    container.appendChild(sectionEl);
  });
}

function renderPublicFullList(container, search) {
  const fullSongs = getVisibleFullSongs().filter(song => !search || getSongText(song).includes(search));
  const wrapper = document.createElement("section");
  wrapper.id = "fullSongListSection";
  wrapper.className = `full-song-list-wrapper ${fullSongListOpen ? "open" : "closed"}`;

  const banner = document.createElement("button");
  banner.type = "button";
  banner.className = "full-song-list-toggle";
  banner.onclick = () => toggleFullSongList(false);
  banner.innerHTML = `<span>★ FULL SONG LIST ★</span><small>BROWSE ALL SONGS A–Z</small><b>${fullSongListOpen ? "⌃" : "›"}</b>`;
  wrapper.appendChild(banner);

  if (!fullSongListOpen) {
    container.appendChild(wrapper);
    return;
  }

  const { order, groups } = alphabetGroups(fullSongs);
  let counter = 1;
  order.forEach(groupName => {
    const groupSongs = groups[groupName];
    if (!groupSongs.length) return;
    const section = document.createElement("section");
    section.className = "song-section full-alpha-section";
    section.innerHTML = `<div class="song-section-box"><h2 class="alphabet-subheader alpha-heading">${escapeHTML(groupName)}</h2><ol start="${counter}"></ol></div>`;
    const ol = section.querySelector("ol");
    groupSongs.forEach(song => {
      const li = document.createElement("li");
      li.className = isAlreadyPlayedToday(song) ? "already-played-song" : "";
      li.innerHTML = `<div class="song-info song-info-with-year"><div class="song-text-main"><span>${escapeHTML(song.title)}</span><em>${escapeHTML(song.artist)}</em></div>${signupButtonHTML(song)}</div>`;
      ol.appendChild(li);
      counter++;
    });
    wrapper.appendChild(section);
  });

  container.appendChild(wrapper);
}

function renderPlainSongList(container, list) {
  const ol = document.createElement("ol");
  ol.className = "custom-song-list";
  list.forEach(song => {
    const li = document.createElement("li");
    li.className = isAlreadyPlayedToday(song) ? "already-played-song" : "";
    li.innerHTML = `<div class="song-info song-info-with-year"><div class="song-text-main"><span>${escapeHTML(song.title)}</span><em>${escapeHTML(song.artist)}</em></div>${signupButtonHTML(song)}</div>`;
    ol.appendChild(li);
  });
  container.appendChild(ol);
}

async function submitSongSignup() {
  const name = document.getElementById("signupName").value.trim();
  if (!name) {
    document.getElementById("signupMessage").innerText = "Please enter your name.";
    return;
  }
  if (!requestCart.length) {
    document.getElementById("signupMessage").innerText = "Please add at least one song.";
    return;
  }

  const submitBtn = document.getElementById("signupSubmitBtn");
  submitBtn.disabled = true;
  submitBtn.innerText = "SENDING...";

  const sessionInfo = await getCurrentSignupSession(false);
  if (!sessionInfo) {
    submitBtn.disabled = false;
    submitBtn.innerText = "SIGN UP";
    showRequestsClosedOnly();
    return;
  }

  const sentSnapshot = requestCart.map(item => ({ ...item }));

  try {
    const shared = {
      listId: getActiveRequestListId(),
      publicSetlistId: selectedPublicSetlist?.id || "",
      publicSetlistName: selectedPublicSetlist?.name || "",
      sessionId: sessionInfo.sessionId,
      isTestSession: sessionInfo.isTestSession,
      status: "active",
      singerName: name,
      name,
      location: document.getElementById("signupLocation").value.trim(),
      ageRange: document.getElementById("signupAgeRange").value,
      rating: document.getElementById("signupRating").value,
      note: document.getElementById("signupNote").value.trim(),
      source: "public-songlist",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    for (const item of requestCart) {
      await db.collection("publicSongRequests").add({
        ...shared,
        songId: item.id || "",
        songTitle: item.title || "",
        artist: item.artist || "",
        songArtist: item.artist || "",
        year: item.year || "",
        requestAnyway: !!item.requestAnyway,
        alreadyPlayedToday: !!item.alreadyPlayedToday
      });
    }

    submittedQueue = sentSnapshot;
    document.getElementById("signupMessage").innerHTML = `Thank you! ${sentSnapshot.length} request${sentSnapshot.length === 1 ? "" : "s"} received.`;
    requestCart = [];
    updateCartCount();
    setTimeout(() => {
      closeSignupModal();
      switchBottomTab("queue");
    }, 1000);
  } catch (error) {
    console.error(error);
    document.getElementById("signupMessage").innerText = "Could not send request. Please try again.";
  }

  submitBtn.disabled = false;
  submitBtn.innerText = "SIGN UP";
}
window.submitSongSignup = submitSongSignup;
window.switchBottomTab = switchBottomTab;
window.closeBottomPanels = closeBottomPanels;
window.openInfoModal = openInfoModal;
window.closeInfoModal = closeInfoModal;
window.toggleFavouriteFromJson = toggleFavouriteFromJson;


/************************************************************
 * Final requested refinements
 * - Queue popup shows all requests from current session
 * - How It Works button opens Info popup
 * - Favourites disabled in HTML/CSS
 * - Artist display fixes: "Zutons, The" -> "The Zutons"
 * - Compact search controls + artist-only search dropdown
 ************************************************************/
function formatArtistName(artist) {
  let value = String(artist || "").trim();
  if (!value) return "";

  const match = value.match(/^(.+),\s*(The|A|An)$/i);
  if (match) {
    const name = match[1].trim();
    const article = match[2].trim();
    return `${article.charAt(0).toUpperCase()}${article.slice(1).toLowerCase()} ${name}`;
  }

  return value;
}

function getSongText(song) {
  return `${song.title || ""} ${formatArtistName(song.artist)} ${song.year || ""}`.toLowerCase();
}

async function loadLyricsSongs() {
  const snap = await db.collection("lyrics").get();
  lyricsSongs = snap.docs.map(doc => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      title: data.title || "",
      artist: formatArtistName(data.artist || ""),
      year: data.year || "",
      publicSongListVisible: data.publicSongListVisible !== false
    };
  }).filter(song => song.title).sort(sortByTitle);
}

function getSectionSongDisplay(item) {
  const source = getLyricsSongById(item.lyricsId);
  return {
    id: item.lyricsId || item.id,
    entryId: item.id,
    lyricsId: item.lyricsId,
    title: item.title || source?.title || "",
    artist: formatArtistName(item.artist || source?.artist || ""),
    year: item.year || source?.year || "",
    visible: item.visible !== false,
    order: item.order || 0
  };
}

function signupButtonHTML(song) {
  const displaySong = {
    ...song,
    artist: formatArtistName(song.artist)
  };
  const alreadyPlayed = isAlreadyPlayedToday(displaySong);
  const key = songKey(displaySong);
  const json = encodeURIComponent(JSON.stringify({
    id: displaySong.id || displaySong.lyricsId || "",
    title: displaySong.title || "",
    artist: displaySong.artist || "",
    year: displaySong.year || ""
  }));

  return `
    <div class="song-right-side ${alreadyPlayed ? "already-played-side" : ""}">
      ${alreadyPlayed ? `<span class="already-played-label">! ALREADY PLAYED TODAY</span>` : ""}
      <strong class="song-year">${escapeHTML(displaySong.year)}</strong>
      <button
        class="signup-song-btn ${alreadyPlayed ? "request-anyway-btn" : ""} ${isInCart(displaySong) ? "in-cart" : ""}"
        type="button"
        data-song-key="${escapeHTML(key)}"
        title="${alreadyPlayed ? "Request anyway" : "Add to request"}"
        onclick="addSongToCartFromButton('${json}', ${alreadyPlayed ? "true" : "false"})">
        ${alreadyPlayed ? "➜" : "+"}
      </button>
    </div>`;
}

function renderSearchResults() {
  const input = document.getElementById("searchInput");
  const mode = document.getElementById("searchModeSelect")?.value || "all";
  const box = document.getElementById("searchResultsBox");
  if (!input || !box) return;

  const search = input.value.toLowerCase().trim();
  if (!search) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const unique = new Map();
  getVisibleFullSongs().forEach(song => {
    unique.set(song.id || `${song.title}-${song.artist}`, {
      ...song,
      artist: formatArtistName(song.artist)
    });
  });

  const results = [...unique.values()]
    .filter(song => {
      const artistText = formatArtistName(song.artist).toLowerCase();
      if (mode === "artist") return artistText.includes(search);
      return `${song.title || ""} ${artistText} ${song.year || ""}`.toLowerCase().includes(search);
    })
    .sort(sortByTitle);

  box.innerHTML = "";

  if (!results.length) {
    box.innerHTML = `<div class="search-result-row empty">No songs found</div>`;
    box.classList.remove("hidden");
    return;
  }

  results.slice(0, 20).forEach(song => {
    const row = document.createElement("div");
    row.className = "search-result-row";
    row.innerHTML = `
      <div class="song-text-main">
        <strong>${escapeHTML(song.title)}</strong>
        <span>${escapeHTML(formatArtistName(song.artist))}</span>
      </div>
      ${signupButtonHTML(song)}
    `;
    box.appendChild(row);
  });

  box.classList.remove("hidden");
}

function openInfoModal() {
  document.getElementById("infoModal")?.classList.remove("hidden");
  setBottomTabActive("info");
}

async function getActiveSessionIdForQueue() {
  if (currentSignupSession?.sessionId) return currentSignupSession.sessionId;

  try {
    const snap = await db.collection("karaokeControl").doc("currentSession").get();
    const data = snap.exists ? snap.data() : {};
    if (data.active === true && data.sessionId) {
      currentSignupSession = { sessionId: data.sessionId, isTestSession: false };
      requestsOpen = true;
      return data.sessionId;
    }
  } catch (error) {
    console.error(error);
  }

  return "";
}

function isQueueVisibleStatus(status) {
  const clean = String(status || "active").toLowerCase();
  return ["active", "pending", "waiting", "queued", "requested"].includes(clean);
}

function isFinalUnavailableStatus(status) {
  const clean = String(status || "").toLowerCase();
  return ["completed", "played", "sung"].includes(clean);
}

async function fetchCurrentSessionRequests() {
  const sessionId = await getActiveSessionIdForQueue();
  if (!sessionId) return [];

  const snap = await db.collection("publicSongRequests")
    .where("sessionId", "==", sessionId)
    .get();

  const rows = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    // QUEUE POPUP RULE:
    // Show only requests still waiting/active for the current session.
    // Completed, abandoned, deleted, cancelled etc. stay out of the public queue.
    .filter(row => isQueueVisibleStatus(row.status));

  rows.sort((a, b) => {
    const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return at - bt;
  });

  return rows;
}

async function renderQueuePanel() {
  const box = document.getElementById("queuePanelContent");
  if (!box) return;

  box.innerHTML = `<p class="queue-empty">Loading current session queue...</p>`;

  let requests = [];
  try {
    requests = await fetchCurrentSessionRequests();
  } catch (error) {
    console.error(error);
    box.innerHTML = `<p class="queue-empty">Could not load the queue. Please try again.</p>`;
    return;
  }

  const pendingCart = requestCart.map(item => ({ ...item, pendingCart: true }));

  if (!requests.length && !pendingCart.length) {
    box.innerHTML = `<p class="queue-empty">No song requests in the current session yet.</p>`;
    return;
  }

  const sessionRows = requests.map((item, index) => `
    <div class="queue-row session-request-row">
      <div class="queue-number-pill">${index + 1}</div>
      <div>
        <strong>${escapeHTML(item.songTitle || item.title || "Untitled Song")}</strong>
        <span>${escapeHTML(formatArtistName(item.songArtist || item.artist || ""))}</span>
      </div>
      <span class="queue-singer-name">${escapeHTML(item.singerName || item.name || "Unknown singer")}</span>
    </div>
  `).join("");

  const cartRows = pendingCart.length ? `
    <p class="queue-session-note">Not sent yet on this device:</p>
    ${pendingCart.map((item, index) => `
      <div class="queue-row session-request-row">
        <div class="queue-number-pill">+</div>
        <div>
          <strong>${escapeHTML(item.title)}</strong>
          <span>${escapeHTML(formatArtistName(item.artist))}${item.year ? " • " + escapeHTML(item.year) : ""}</span>
        </div>
        <button class="signup-song-btn" type="button" onclick="removeSongFromCart('${escapeHTML(songKey(item))}'); renderQueuePanel();">×</button>
      </div>
    `).join("")}
  ` : "";

  box.innerHTML = `
    <p class="queue-session-note">Current session requests:</p>
    ${sessionRows || ""}
    ${cartRows}
  `;
}

function switchBottomTab(tab) {
  if (tab === "queue") {
    document.getElementById("favouritesPanel")?.classList.add("hidden");
    document.getElementById("queuePanel")?.classList.remove("hidden");
    setBottomTabActive("queue");
    renderQueuePanel();
    return;
  }

  if (tab === "favourites") {
    showCartToast("Favourites are coming soon");
    setBottomTabActive("songlist");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const mode = document.getElementById("searchModeSelect");
  if (mode) mode.addEventListener("change", renderSearchResults);
});

window.renderQueuePanel = renderQueuePanel;
window.switchBottomTab = switchBottomTab;
window.openInfoModal = openInfoModal;

/************************************************************
 * v6 fixes
 * - Search artist dropdown lists artists and shows all songs by selected artist
 * - Current-session requested/played songs update every second
 * - Requested/played songs cannot be chosen again
 * - Smaller category buttons
 ************************************************************/
let sessionRequestedKeys = new Set();
let sessionPlayedKeys = new Set();
let lastSessionSongStateSignature = "";

function normalizeSongKey(title, artist) {
  return `${String(title || "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, "").trim()}|${formatArtistName(artist || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim()}`;
}

function getNormalizedSongKey(song) {
  return normalizeSongKey(song?.title || song?.songTitle || "", song?.artist || song?.songArtist || "");
}

function getSongSessionState(song) {
  const key = getNormalizedSongKey(song);
  if (sessionPlayedKeys.has(key) || isAlreadyPlayedToday(song)) {
    return { unavailable: true, type: "played", label: "! ALREADY PLAYED TODAY" };
  }
  if (sessionRequestedKeys.has(key)) {
    return { unavailable: true, type: "requested", label: "! ALREADY REQUESTED" };
  }
  return { unavailable: false, type: "available", label: "" };
}

function populateArtistFilter() {
  const select = document.getElementById("artistFilterSelect");
  if (!select) return;
  const previous = select.value;
  const artists = [...new Set(getVisibleFullSongs().map(song => formatArtistName(song.artist)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  select.innerHTML = `<option value="">Search by artist</option>` + artists.map(artist =>
    `<option value="${escapeHTML(artist)}">${escapeHTML(artist)}</option>`
  ).join("");
  if (artists.includes(previous)) select.value = previous;
}

function signupButtonHTML(song) {
  const displaySong = { ...song, artist: formatArtistName(song.artist) };
  const state = getSongSessionState(displaySong);
  const key = songKey(displaySong);
  const json = encodeURIComponent(JSON.stringify({
    id: displaySong.id || displaySong.lyricsId || "",
    title: displaySong.title || "",
    artist: displaySong.artist || "",
    year: displaySong.year || ""
  }));

  if (state.unavailable) {
    return `
      <div class="song-right-side unavailable-side ${state.type === "played" ? "already-played-side" : "already-requested-side"}">
        <span class="already-played-label ${state.type === "requested" ? "already-requested-label" : ""}">${state.label}</span>
        <strong class="song-year">${escapeHTML(displaySong.year)}</strong>
        <button class="signup-song-btn unavailable-song-btn" type="button" disabled title="This song is unavailable for this session">×</button>
      </div>`;
  }

  return `
    <div class="song-right-side">
      <strong class="song-year">${escapeHTML(displaySong.year)}</strong>
      <button
        class="signup-song-btn ${isInCart(displaySong) ? "in-cart" : ""}"
        type="button"
        data-song-key="${escapeHTML(key)}"
        title="Add to request"
        onclick="addSongToCartFromButton('${json}', false)">
        +
      </button>
    </div>`;
}

function addSongToCart(song, requestAnyway = false) {
  if (!requestsOpen) { showRequestsClosedOnly(); return; }
  const state = getSongSessionState(song);
  if (state.unavailable) {
    showCartToast(state.type === "played" ? "This song has already been played today." : "This song is already requested in the current session.");
    return;
  }
  const key = songKey(song);
  if (!requestCart.some(item => songKey(item) === key)) {
    requestCart.push({
      id: song.id || song.lyricsId || "",
      title: song.title || "",
      artist: formatArtistName(song.artist || ""),
      year: song.year || "",
      requestAnyway: false,
      alreadyPlayedToday: false
    });
  }
  updateCartCount();
  showCartToast(`${song.title || "Song"} added to your requests`);
}

function renderSearchResults() {
  const input = document.getElementById("searchInput");
  const artistSelect = document.getElementById("artistFilterSelect");
  const box = document.getElementById("searchResultsBox");
  if (!input || !box) return;

  const search = input.value.toLowerCase().trim();
  const selectedArtist = artistSelect?.value || "";

  if (!search && !selectedArtist) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const unique = new Map();
  getVisibleFullSongs().forEach(song => unique.set(song.id || `${song.title}-${song.artist}`, { ...song, artist: formatArtistName(song.artist) }));

  const results = [...unique.values()].filter(song => {
    const artist = formatArtistName(song.artist);
    if (selectedArtist) return artist.toLowerCase() === selectedArtist.toLowerCase();
    return `${song.title || ""} ${artist} ${song.year || ""}`.toLowerCase().includes(search);
  }).sort(sortByTitle);

  box.innerHTML = "";

  if (!results.length) {
    box.innerHTML = `<div class="search-result-row empty">No songs found</div>`;
    box.classList.remove("hidden");
    return;
  }

  results.slice(0, selectedArtist ? 80 : 20).forEach(song => {
    const state = getSongSessionState(song);
    const row = document.createElement("div");
    row.className = `search-result-row ${state.unavailable ? "already-played-song" : ""}`;
    row.innerHTML = `
      <div class="song-text-main">
        <strong>${escapeHTML(song.title)}</strong>
        <span>${escapeHTML(formatArtistName(song.artist))}</span>
      </div>
      ${signupButtonHTML(song)}
    `;
    box.appendChild(row);
  });

  box.classList.remove("hidden");
}

function clearSearchResults() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResultsBox");
  const artistSelect = document.getElementById("artistFilterSelect");
  if (input) input.value = "";
  if (artistSelect) artistSelect.value = "";
  if (box) { box.innerHTML = ""; box.classList.add("hidden"); }
}

async function refreshSessionSongStates() {
  const sessionId = await getActiveSessionIdForQueue();
  if (!sessionId) {
    sessionRequestedKeys = new Set();
    sessionPlayedKeys = new Set();
    return;
  }

  const requested = new Set();
  const played = new Set();

  try {
    const reqSnap = await db.collection("publicSongRequests").where("sessionId", "==", sessionId).get();
    reqSnap.forEach(doc => {
      const data = doc.data() || {};
      const key = normalizeSongKey(data.songTitle || data.title, data.songArtist || data.artist);
      if (!key || key === "|") return;
      const status = String(data.status || "active").toLowerCase();
      if (isFinalUnavailableStatus(status)) played.add(key);
      else if (isQueueVisibleStatus(status)) requested.add(key);
    });
  } catch (error) {
    console.error("Could not refresh publicSongRequests", error);
  }

  try {
    const perfSnap = await db.collection("performanceLogs").where("sessionId", "==", sessionId).get();
    perfSnap.forEach(doc => {
      const data = doc.data() || {};
      const key = normalizeSongKey(data.songTitle || data.title, data.songArtist || data.artist);
      if (key && key !== "|") played.add(key);
    });
  } catch (error) {
    // Safe fallback if this collection is not readable on the public page.
    console.warn("Could not refresh performanceLogs", error);
  }

  const signature = JSON.stringify({ requested: [...requested].sort(), played: [...played].sort() });
  if (signature === lastSessionSongStateSignature) return;

  sessionRequestedKeys = requested;
  sessionPlayedKeys = played;
  lastSessionSongStateSignature = signature;

  renderPublicSongList();
  renderSearchResults();
  updateCartCount();
}

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(populateArtistFilter, 400);
  const artistSelect = document.getElementById("artistFilterSelect");
  if (artistSelect) artistSelect.addEventListener("change", () => {
    const input = document.getElementById("searchInput");
    if (artistSelect.value && input) input.value = "";
    renderSearchResults();
  });
  refreshSessionSongStates();
  setInterval(refreshSessionSongStates, 1000);
});

/************************************************************
 * v7 corrections
 * - View Less truly collapses sections.
 * - Artist dropdown is populated after song data loads and filters instantly.
 * - Requested/played labels stay on one row and songs cannot be added again.
 * - Queue popup has sticky header, red close button, and bottom signup button.
 ************************************************************/
let customSectionOpenStateV7 = {};

function populateArtistFilter() {
  const select = document.getElementById("artistFilterSelect");
  if (!select) return;

  const previous = select.value || "";
  const artists = [...new Set((lyricsSongs || [])
    .filter(song => song && song.publicSongListVisible !== false)
    .map(song => formatArtistName(song.artist))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  select.innerHTML = `<option value="">Search by artist</option>` + artists.map(artist =>
    `<option value="${escapeHTML(artist)}">${escapeHTML(artist)}</option>`
  ).join("");

  if (previous && artists.includes(previous)) select.value = previous;
}

function clearSearchResults() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResultsBox");
  const artistSelect = document.getElementById("artistFilterSelect");
  if (input) input.value = "";
  if (artistSelect) artistSelect.value = "";
  if (box) {
    box.innerHTML = "";
    box.classList.add("hidden");
  }
}

function renderSearchResults() {
  const input = document.getElementById("searchInput");
  const artistSelect = document.getElementById("artistFilterSelect");
  const box = document.getElementById("searchResultsBox");
  if (!input || !box) return;

  const search = input.value.toLowerCase().trim();
  const selectedArtist = artistSelect?.value || "";

  if (!search && !selectedArtist) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const unique = new Map();
  getVisibleFullSongs().forEach(song => {
    unique.set(song.id || `${song.title}-${song.artist}`, {
      ...song,
      artist: formatArtistName(song.artist)
    });
  });

  const results = [...unique.values()].filter(song => {
    const artist = formatArtistName(song.artist);
    if (selectedArtist) return artist.toLowerCase() === selectedArtist.toLowerCase();
    return `${song.title || ""} ${artist} ${song.year || ""}`.toLowerCase().includes(search);
  }).sort(sortByTitle);

  box.innerHTML = "";

  if (!results.length) {
    box.innerHTML = `<div class="search-result-row empty">No songs found</div>`;
    box.classList.remove("hidden");
    return;
  }

  results.slice(0, selectedArtist ? 120 : 20).forEach(song => {
    const state = getSongSessionState(song);
    const row = document.createElement("div");
    row.className = `search-result-row ${state.unavailable ? "already-played-song" : ""}`;
    row.innerHTML = `
      <div class="song-text-main">
        <strong>${escapeHTML(song.title)}</strong>
        <span>${escapeHTML(formatArtistName(song.artist))}</span>
      </div>
      ${signupButtonHTML(song)}
    `;
    box.appendChild(row);
  });

  box.classList.remove("hidden");
}

function signupButtonHTML(song) {
  const displaySong = { ...song, artist: formatArtistName(song.artist) };
  const state = getSongSessionState(displaySong);
  const key = songKey(displaySong);
  const json = encodeURIComponent(JSON.stringify({
    id: displaySong.id || displaySong.lyricsId || "",
    title: displaySong.title || "",
    artist: displaySong.artist || "",
    year: displaySong.year || ""
  }));

  if (state.unavailable) {
    return `
      <div class="song-right-side unavailable-side ${state.type === "played" ? "already-played-side" : "already-requested-side"}">
        <span class="already-played-label ${state.type === "requested" ? "already-requested-label" : ""}">${state.label}</span>
        <strong class="song-year">${escapeHTML(displaySong.year)}</strong>
        <button class="signup-song-btn unavailable-song-btn" type="button" disabled title="This song is unavailable for this session">×</button>
      </div>`;
  }

  return `
    <div class="song-right-side">
      <strong class="song-year">${escapeHTML(displaySong.year)}</strong>
      <button
        class="signup-song-btn ${isInCart(displaySong) ? "in-cart" : ""}"
        type="button"
        data-song-key="${escapeHTML(key)}"
        title="Add to request"
        onclick="addSongToCartFromButton('${json}', false)">
        +
      </button>
    </div>`;
}

function addSongToCart(song, requestAnyway = false) {
  if (!requestsOpen) {
    showRequestsClosedOnly();
    return;
  }

  const state = getSongSessionState(song);
  if (state.unavailable) {
    showCartToast(state.type === "played"
      ? "This song has already been played today."
      : "This song is already requested in the current session.");
    return;
  }

  const key = songKey(song);
  if (!requestCart.some(item => songKey(item) === key)) {
    requestCart.push({
      id: song.id || song.lyricsId || "",
      title: song.title || "",
      artist: formatArtistName(song.artist || ""),
      year: song.year || "",
      requestAnyway: false,
      alreadyPlayedToday: false
    });
  }

  updateCartCount();
  showCartToast(`${song.title || "Song"} added to your requests`);
}

function renderCategoryNav() {
  // Feature category cards under Search were intentionally removed.
}

function openCustomSection(sectionId, index) {
  fullSongListOpen = false;
  customSectionOpenStateV7 = {};
  sections.forEach(section => { customSectionOpenStateV7[section.id] = false; });
  customSectionOpenStateV7[sectionId] = true;
  activeCustomSectionId = sectionId;
  renderPublicSongList();
  document.getElementById(`customSection-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleFullSongList(forceOpen = false) {
  fullSongListOpen = forceOpen ? true : !fullSongListOpen;
  if (fullSongListOpen) {
    activeCustomSectionId = null;
    sections.forEach(section => { customSectionOpenStateV7[section.id] = false; });
  }
  renderPublicSongList();
  document.getElementById("fullSongListSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
window.toggleFullSongList = toggleFullSongList;

function renderPublicSongList() {
  const container = document.getElementById("publicSongList");
  if (!container) return;
  container.innerHTML = "";
  populateArtistFilter();
  renderCategoryNav();
  renderPublicCustomSections(container, "");
  renderPublicFullList(container, "");
}

function renderPublicCustomSections(container, search) {
  PUBLIC_CATEGORY_DEFS.forEach((def, sectionIndex) => {
    const ids = publicCategoryConfig[def.key] || [];

    const items = ids
      .map(id => getLyricsSongById(id))
      .filter(Boolean)
      .filter(song =>
        !(selectedPublicSongIds instanceof Set) ||
        selectedPublicSongIds.has(song.id)
      )
      .filter(song => !search || getSongText(song).includes(search));

    const sectionEl = document.createElement("section");
    sectionEl.className = "song-section public-section custom-section featured-public-category";
    sectionEl.id = `publicCategory-${def.key}`;

    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "section-red-header featured-category-header";

    const body = document.createElement("div");
    body.className = "public-section-songs section-body-card";

    const shouldOpen = publicCategoryOpenState[def.key] === true;
    body.style.display = shouldOpen ? "block" : "none";

    heading.innerHTML = `
      <span><b class="featured-category-icon">${def.icon}</b> ${escapeHTML(def.title)}</span>
      <em>${items.length} SONG${items.length === 1 ? "" : "S"} · ${shouldOpen ? "VIEW LESS" : "VIEW ALL"} →</em>
    `;

    heading.onclick = () => {
      publicCategoryOpenState[def.key] = !shouldOpen;
      renderPublicSongList();
      setTimeout(() => {
        document.getElementById(`publicCategory-${def.key}`)?.scrollIntoView({
          behavior:"smooth",
          block:"nearest"
        });
      }, 0);
    };

    if (items.length) {
      renderPlainSongList(body, items);
    } else {
      body.innerHTML = `<div class="public-category-empty">No songs assigned to this category yet.</div>`;
    }

    sectionEl.appendChild(heading);
    sectionEl.appendChild(body);
    container.appendChild(sectionEl);
  });
}


function renderPublicFullList(container, search) {
  const fullSongs = getVisibleFullSongs().filter(song => !search || getSongText(song).includes(search));
  const wrapper = document.createElement("section");
  wrapper.id = "fullSongListSection";
  wrapper.className = `full-song-list-wrapper ${fullSongListOpen ? "open" : "closed"}`;

  const banner = document.createElement("button");
  banner.type = "button";
  banner.className = "full-song-list-toggle";
  banner.onclick = () => toggleFullSongList(false);
  banner.innerHTML = `<span>★ FULL SONG LIST ★</span><small>BROWSE ALL SONGS A–Z</small><b>${fullSongListOpen ? "↑" : "↓"}</b>`;
  wrapper.appendChild(banner);

  if (!fullSongListOpen) {
    container.appendChild(wrapper);
    return;
  }

  const { order, groups } = alphabetGroups(fullSongs);
  let counter = 1;
  order.forEach(groupName => {
    const groupSongs = groups[groupName];
    if (!groupSongs.length) return;
    const section = document.createElement("section");
    section.className = "song-section full-alpha-section";
    section.innerHTML = `<div class="song-section-box"><h2 class="alphabet-subheader alpha-heading">${escapeHTML(groupName)}</h2><ol start="${counter}"></ol></div>`;
    const ol = section.querySelector("ol");
    groupSongs.forEach(song => {
      const li = document.createElement("li");
      li.className = getSongSessionState(song).unavailable ? "already-played-song" : "";
      li.innerHTML = `<div class="song-info song-info-with-year"><div class="song-text-main"><span>${escapeHTML(song.title)}</span><em>${escapeHTML(formatArtistName(song.artist))}</em></div>${signupButtonHTML(song)}</div>`;
      ol.appendChild(li);
      counter++;
    });
    wrapper.appendChild(section);
  });

  container.appendChild(wrapper);
}

function renderPlainSongList(container, list) {
  const ol = document.createElement("ol");
  ol.className = "custom-song-list";
  list.forEach(song => {
    const li = document.createElement("li");
    li.className = getSongSessionState(song).unavailable ? "already-played-song" : "";
    li.innerHTML = `<div class="song-info song-info-with-year"><div class="song-text-main"><span>${escapeHTML(song.title)}</span><em>${escapeHTML(formatArtistName(song.artist))}</em></div>${signupButtonHTML(song)}</div>`;
    ol.appendChild(li);
  });
  container.appendChild(ol);
}

async function renderQueuePanel() {
  const box = document.getElementById("queuePanelContent");
  if (!box) return;

  box.innerHTML = `<p class="queue-empty">Loading current session queue...</p>`;

  let requests = [];
  try {
    requests = await fetchCurrentSessionRequests();
  } catch (error) {
    console.error(error);
    box.innerHTML = `<p class="queue-empty">Could not load the queue. Please try again.</p>`;
    return;
  }

  const pendingCart = requestCart.map(item => ({ ...item, pendingCart: true }));
  const canSubmitPendingCart = pendingCart.length > 0;

  if (!requests.length && !pendingCart.length) {
    box.innerHTML = `
      <p class="queue-empty">No active song requests in the current session yet.</p>
      <button class="queue-signup-submit disabled" type="button" disabled>SIGN UP TO SING</button>
    `;
    return;
  }

  const sessionRows = requests.map((item, index) => `
    <div class="queue-row session-request-row">
      <div class="queue-number-pill">${index + 1}</div>
      <div class="queue-song-cell">
        <strong>${escapeHTML(item.songTitle || item.title || "Untitled Song")}</strong>
        <span>${escapeHTML(formatArtistName(item.songArtist || item.artist || ""))}</span>
      </div>
      <span class="queue-singer-name">${escapeHTML(item.singerName || item.name || "Unknown singer")}</span>
    </div>
  `).join("");

  const cartRows = pendingCart.length ? `
    <p class="queue-session-note queue-pending-note">Not sent yet from this device:</p>
    ${pendingCart.map(item => `
      <div class="queue-row session-request-row pending-cart-row">
        <div class="queue-number-pill">+</div>
        <div class="queue-song-cell">
          <strong>${escapeHTML(item.title)}</strong>
          <span>${escapeHTML(formatArtistName(item.artist))}${item.year ? " • " + escapeHTML(item.year) : ""}</span>
        </div>
        <button class="queue-remove-btn" type="button" onclick="removeSongFromCart('${escapeHTML(songKey(item))}'); renderQueuePanel();">×</button>
      </div>
    `).join("")}
  ` : "";

  box.innerHTML = `
    ${sessionRows ? `<p class="queue-session-note">Current requests:</p>${sessionRows}` : ""}
    ${cartRows}
    <button
      class="queue-signup-submit ${canSubmitPendingCart ? "" : "disabled"}"
      type="button"
      ${canSubmitPendingCart ? `onclick="openSignupModal()"` : "disabled"}>
      SIGN UP TO SING
    </button>
  `;
}

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    populateArtistFilter();
    const artistSelect = document.getElementById("artistFilterSelect");
    if (artistSelect) {
      artistSelect.onchange = () => {
        const input = document.getElementById("searchInput");
        if (artistSelect.value && input) input.value = "";
        renderSearchResults();
      };
    }
  }, 1200);
});


/* ========================================================================
   PHONE UX + PUBLIC QUEUE FINAL OVERRIDES — 2026-09-02
   These definitions intentionally appear last because this historical file
   contains older duplicate implementations above.
   ======================================================================== */

function updateCartCount() {
  document.querySelectorAll(".cart-count").forEach(el => {
    el.innerText = String(requestCart.length);
  });

  document.querySelectorAll(".signup-song-btn").forEach(btn => {
    const key = btn.dataset.songKey;
    if (!key) return;
    btn.classList.toggle(
      "in-cart",
      requestCart.some(item => songKey(item) === key)
    );
  });

  const quick = document.getElementById("quickSignupBar");
  if (quick) {
    quick.classList.toggle("has-items", requestCart.length > 0);
  }
}

async function fetchPublicRunOrder() {
  const sessionId = await getActiveSessionIdForQueue();
  if (!sessionId) return [];

  try {
    const snap = await db
      .collection("karaokeControl")
      .doc("runOrder")
      .get();

    const data = snap.exists ? (snap.data() || {}) : {};
    if (data.sessionId && data.sessionId !== sessionId) return [];

    const terminal = new Set([
      "played",
      "completed",
      "abandoned",
      "left",
      "deleted",
      "deletedbyhost",
      "declined"
    ]);

    return (Array.isArray(data.items) ? data.items : [])
      .filter(item => !terminal.has(String(item.status || "").toLowerCase()));
  } catch (error) {
    console.error("Could not load Run Order:", error);
    return [];
  }
}

async function fetchPendingPublicRequests() {
  const sessionId = await getActiveSessionIdForQueue();
  if (!sessionId) return [];

  try {
    const snap = await db
      .collection("publicSongRequests")
      .where("sessionId", "==", sessionId)
      .get();

    const pendingStatuses = new Set([
      "",
      "pending",
      "active",
      "waiting",
      "requested"
    ]);

    return snap.docs
      .map(doc => ({ id:doc.id, ...(doc.data() || {}) }))
      .filter(item =>
        pendingStatuses.has(String(item.status || "").toLowerCase())
      )
      .sort((a,b) => {
        const ad = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bd = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return ad - bd;
      });
  } catch (error) {
    console.error("Could not load pending public requests:", error);
    return [];
  }
}

function publicQueueRow(item, index, playing = false) {
  return `
    <div class="queue-row session-request-row public-run-row${playing ? " is-playing" : ""}">
      <div class="queue-number-pill">${index + 1}</div>
      <div class="queue-song-cell">
        <strong>${escapeHTML(item.songTitle || item.title || "Untitled Song")}</strong>
        <span>${escapeHTML(formatArtistName(item.artist || item.songArtist || ""))}</span>
        ${playing ? `<small class="queue-playing-label">● PLAYING NOW</small>` : ""}
      </div>
      <span class="queue-singer-name">${escapeHTML(item.singerName || "Host")}</span>
    </div>
  `;
}

async function renderQueuePanel() {
  const box = document.getElementById("queuePanelContent");
  if (!box) return;

  box.innerHTML = `<p class="queue-empty">Loading live queue...</p>`;

  const [runOrder, pendingRequests] = await Promise.all([
    fetchPublicRunOrder(),
    fetchPendingPublicRequests()
  ]);

  const runRows = runOrder.map((item,index) =>
    publicQueueRow(
      item,
      index,
      String(item.status || "").toLowerCase() === "playing"
    )
  ).join("");

  const pendingRows = pendingRequests.map((item,index) => `
    <div class="queue-row session-request-row pending-public-row">
      <div class="queue-number-pill">${index + 1}</div>
      <div class="queue-song-cell">
        <strong>${escapeHTML(item.songTitle || item.title || "Untitled Song")}</strong>
        <span>${escapeHTML(formatArtistName(item.songArtist || item.artist || ""))}</span>
      </div>
      <span class="queue-singer-name">${escapeHTML(item.singerName || item.name || "Singer")}</span>
    </div>
  `).join("");

  const unsentRows = requestCart.map(item => `
    <div class="queue-row session-request-row pending-cart-row">
      <div class="queue-number-pill">+</div>
      <div class="queue-song-cell">
        <strong>${escapeHTML(item.title)}</strong>
        <span>${escapeHTML(formatArtistName(item.artist))}${item.year ? " • " + escapeHTML(item.year) : ""}</span>
      </div>
      <button class="queue-remove-btn" type="button"
        onclick="removeSongFromCart('${escapeHTML(songKey(item))}'); renderQueuePanel();">×</button>
    </div>
  `).join("");

  box.innerHTML = `
    <section class="public-queue-section">
      <h3 class="public-queue-section-title">CURRENT PERFORMANCE ORDER</h3>
      <p class="public-queue-section-subtitle">Songs already accepted by the host.</p>
      ${runRows || `<p class="queue-empty">No songs have been added to the performance order yet.</p>`}
    </section>

    <section class="public-queue-section">
      <h3 class="public-queue-section-title">PENDING REQUESTS</h3>
      <p class="public-queue-section-subtitle">Waiting for the host to accept.</p>
      ${pendingRows || `<p class="queue-empty">No pending singer requests.</p>`}
    </section>

    ${
      unsentRows
        ? `<section class="public-queue-section">
             <h3 class="public-queue-section-title">YOUR UNSENT SELECTIONS</h3>
             ${unsentRows}
             <button class="queue-signup-submit" type="button" onclick="openSignupModal()">SIGN UP TO SING</button>
           </section>`
        : ""
    }
  `;
}

function switchBottomTab(tab) {
  if (tab !== "queue") return;

  document.getElementById("queuePanel")?.classList.remove("hidden");
  setBottomTabActive("queue");
  renderQueuePanel();
}

function closeBottomPanels() {
  document.getElementById("queuePanel")?.classList.add("hidden");
  setBottomTabActive("songlist");
}

function setBottomTabActive(tab) {
  const buttons = document.querySelectorAll(".bottom-tabs button");
  buttons.forEach(button => button.classList.remove("active"));

  if (tab === "queue") {
    document.querySelector(".bottom-tab-queue")?.classList.add("active");
  } else if (tab === "info") {
    document.querySelector(".bottom-tab-info")?.classList.add("active");
  } else {
    document.querySelector(".bottom-tab-songlist")?.classList.add("active");
  }
}

/* Search-field mobile behavior:
   - results are directly under the search box
   - bring the search box to the top when the keyboard opens
*/
window.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("searchInput");
  const wrap = input?.closest(".search-wrap");

  if (input && wrap) {
    input.addEventListener("focus", () => {
      setTimeout(() => {
        wrap.scrollIntoView({
          behavior:"smooth",
          block:"start"
        });
      }, 180);
    });
  }

  updateCartCount();
});

window.renderQueuePanel = renderQueuePanel;
window.switchBottomTab = switchBottomTab;
window.closeBottomPanels = closeBottomPanels;


/* ========================================================================
   PUBLIC BREAK STATUS — 2026-09-02
   ======================================================================== */
let publicBreakSessionUnsubscribe = null;

function setPublicBreakNotice(open) {
  const notice = document.getElementById("publicBreakNotice");
  if (!notice) return;

  notice.classList.toggle("hidden", !open);
}

function listenPublicBreakStatus() {
  db.collection("karaokeControl")
    .doc("currentSession")
    .onSnapshot(doc => {
      const data = doc.exists ? (doc.data() || {}) : {};
      const sessionId = String(
        data.sessionId ||
        data.activeSessionId ||
        ""
      ).trim();

      if (publicBreakSessionUnsubscribe) {
        publicBreakSessionUnsubscribe();
        publicBreakSessionUnsubscribe = null;
      }

      if (data.active !== true || !sessionId) {
        setPublicBreakNotice(false);
        return;
      }

      publicBreakSessionUnsubscribe = db
        .collection("performanceSessions")
        .doc(sessionId)
        .onSnapshot(sessionDoc => {
          const session = sessionDoc.exists
            ? (sessionDoc.data() || {})
            : {};

          setPublicBreakNotice(session.breakOpen === true);

          // Keep an open Queue panel current during a break.
          const queuePanel = document.getElementById("queuePanel");
          if (
            queuePanel &&
            !queuePanel.classList.contains("hidden") &&
            typeof renderQueuePanel === "function"
          ) {
            renderQueuePanel();
          }
        }, error => {
          console.error("Could not listen for public break status:", error);
          setPublicBreakNotice(false);
        });
    }, error => {
      console.error("Could not listen for current public session:", error);
      setPublicBreakNotice(false);
    });
}

// Replaced by startRealtimePublicQueueMonitor() below.


/* ========================================================================
   REAL-TIME PUBLIC KARAOKE QUEUE — 2026-09-02
   One current-session listener owns Run Order, pending requests, break state,
   and automatic closure when the session ends.
   ======================================================================== */

const publicQueueRealtimeState = {
  sessionId: "",
  runOrder: [],
  pending: [],
  breakOpen: false,
  breakStartedAt: null,
  ready: false
};

let publicQueueRunOrderUnsub = null;
let publicQueuePendingUnsub = null;
let publicQueueSessionUnsub = null;
let publicQueueControlUnsub = null;

function stopPublicQueueSessionListeners() {
  if (publicQueueRunOrderUnsub) {
    publicQueueRunOrderUnsub();
    publicQueueRunOrderUnsub = null;
  }

  if (publicQueuePendingUnsub) {
    publicQueuePendingUnsub();
    publicQueuePendingUnsub = null;
  }

  if (publicQueueSessionUnsub) {
    publicQueueSessionUnsub();
    publicQueueSessionUnsub = null;
  }
}

function isQueuePanelVisible() {
  const panel = document.getElementById("queuePanel");
  return !!panel && !panel.classList.contains("hidden");
}

function closePublicQueuePanel() {
  document.getElementById("queuePanel")?.classList.add("hidden");
  setBottomTabActive("songlist");
}

function currentPublicQueueItems() {
  const terminal = new Set([
    "played",
    "completed",
    "abandoned",
    "left",
    "deleted",
    "deletedbyhost",
    "declined"
  ]);

  return (Array.isArray(publicQueueRealtimeState.runOrder)
    ? publicQueueRealtimeState.runOrder
    : []
  ).filter(item =>
    !terminal.has(String(item?.status || "").toLowerCase())
  );
}

function currentPlayingPublicQueueItem() {
  return currentPublicQueueItems().find(item =>
    String(item?.status || "").toLowerCase() === "playing"
  ) || null;
}

function renderRealtimeQueuePanel() {
  const box = document.getElementById("queuePanelContent");
  if (!box) return;

  if (!requestsOpen || !publicQueueRealtimeState.sessionId) {
    box.innerHTML = `
      <p class="queue-empty">The Live Karaoke session is no longer active.</p>
    `;
    return;
  }

  const runOrder = currentPublicQueueItems();
  const pendingRequests = Array.isArray(publicQueueRealtimeState.pending)
    ? publicQueueRealtimeState.pending
    : [];

  const playing = currentPlayingPublicQueueItem();

  let stateRow = "";

  if (publicQueueRealtimeState.breakOpen) {
    stateRow = `
      <div class="public-queue-live-state is-break">
        <span>☕</span>
        <div>
          <strong>CURRENTLY ON BREAK</strong>
          <small>The performance will continue shortly.</small>
        </div>
      </div>
    `;
  } else if (playing) {
    stateRow = `
      <div class="public-queue-live-state is-playing">
        <span>▶</span>
        <div>
          <strong>NOW PLAYING: ${escapeHTML(playing.songTitle || playing.title || "Song")}</strong>
          <small>${escapeHTML(formatArtistName(playing.artist || playing.songArtist || ""))}</small>
        </div>
      </div>
    `;
  } else {
    stateRow = `
      <div class="public-queue-live-state">
        <span>♫</span>
        <div>
          <strong>WAITING FOR THE NEXT SONG</strong>
          <small>The host will start the next performance shortly.</small>
        </div>
      </div>
    `;
  }

  const runRows = runOrder.map((item,index) =>
    publicQueueRow(
      item,
      index,
      String(item.status || "").toLowerCase() === "playing"
    )
  ).join("");

  const pendingRows = pendingRequests.map((item,index) => `
    <div class="queue-row session-request-row pending-public-row">
      <div class="queue-number-pill">${index + 1}</div>
      <div class="queue-song-cell">
        <strong>${escapeHTML(item.songTitle || item.title || "Untitled Song")}</strong>
        <span>${escapeHTML(formatArtistName(item.songArtist || item.artist || ""))}</span>
      </div>
      <span class="queue-singer-name">${escapeHTML(item.singerName || item.name || "Singer")}</span>
    </div>
  `).join("");

  const unsentRows = requestCart.map(item => `
    <div class="queue-row session-request-row pending-cart-row">
      <div class="queue-number-pill">+</div>
      <div class="queue-song-cell">
        <strong>${escapeHTML(item.title)}</strong>
        <span>${escapeHTML(formatArtistName(item.artist))}${item.year ? " • " + escapeHTML(item.year) : ""}</span>
      </div>
      <button class="queue-remove-btn" type="button"
        onclick="removeSongFromCart('${escapeHTML(songKey(item))}'); renderRealtimeQueuePanel();">×</button>
    </div>
  `).join("");

  box.innerHTML = `
    ${stateRow}

    <section class="public-queue-section">
      <h3 class="public-queue-section-title">
        CURRENT PERFORMANCE ORDER
        <span class="live-count">(${runOrder.length})</span>
      </h3>
      <p class="public-queue-section-subtitle">
        Updates automatically as the host performs and changes the order.
      </p>
      ${runRows || `<p class="queue-empty">No songs are currently in the performance order.</p>`}
    </section>

    <section class="public-queue-section">
      <h3 class="public-queue-section-title">
        PENDING REQUESTS
        <span class="live-count">(${pendingRequests.length})</span>
      </h3>
      <p class="public-queue-section-subtitle">Waiting for the host to accept.</p>
      ${pendingRows || `<p class="queue-empty">No pending singer requests.</p>`}
    </section>

    ${
      unsentRows
        ? `<section class="public-queue-section">
             <h3 class="public-queue-section-title">YOUR UNSENT SELECTIONS</h3>
             ${unsentRows}
             <button class="queue-signup-submit" type="button" onclick="openSignupModal()">SIGN UP TO SING</button>
           </section>`
        : ""
    }
  `;
}

function renderQueuePanel() {
  renderRealtimeQueuePanel();
}

function subscribePublicQueueForSession(sessionId) {
  stopPublicQueueSessionListeners();

  publicQueueRealtimeState.sessionId = sessionId;
  publicQueueRealtimeState.runOrder = [];
  publicQueueRealtimeState.pending = [];
  publicQueueRealtimeState.breakOpen = false;
  publicQueueRealtimeState.breakStartedAt = null;
  publicQueueRealtimeState.ready = false;

  publicQueueRunOrderUnsub = db
    .collection("karaokeControl")
    .doc("runOrder")
    .onSnapshot(doc => {
      const data = doc.exists ? (doc.data() || {}) : {};

      publicQueueRealtimeState.runOrder =
        !data.sessionId || data.sessionId === sessionId
          ? (Array.isArray(data.items) ? data.items : [])
          : [];

      publicQueueRealtimeState.ready = true;

      if (isQueuePanelVisible()) {
        renderRealtimeQueuePanel();
      }
    }, error => {
      console.error("Realtime Run Order listener failed:", error);
    });

  publicQueuePendingUnsub = db
    .collection("publicSongRequests")
    .where("sessionId", "==", sessionId)
    .onSnapshot(snapshot => {
      const pendingStatuses = new Set([
        "",
        "pending",
        "active",
        "waiting",
        "requested"
      ]);

      publicQueueRealtimeState.pending = snapshot.docs
        .map(doc => ({ id:doc.id, ...(doc.data() || {}) }))
        .filter(item =>
          pendingStatuses.has(String(item.status || "").toLowerCase())
        )
        .sort((a,b) => {
          const ad = a.createdAt?.toDate
            ? a.createdAt.toDate().getTime()
            : 0;
          const bd = b.createdAt?.toDate
            ? b.createdAt.toDate().getTime()
            : 0;
          return ad - bd;
        });

      if (isQueuePanelVisible()) {
        renderRealtimeQueuePanel();
      }
    }, error => {
      console.error("Realtime pending request listener failed:", error);
    });

  publicQueueSessionUnsub = db
    .collection("performanceSessions")
    .doc(sessionId)
    .onSnapshot(doc => {
      const session = doc.exists ? (doc.data() || {}) : {};

      publicQueueRealtimeState.breakOpen =
        session.breakOpen === true;

      publicQueueRealtimeState.breakStartedAt =
        session.currentBreakStartedAt ||
        session.breakStartedAt ||
        null;

      setPublicBreakNotice(publicQueueRealtimeState.breakOpen);

      if (isQueuePanelVisible()) {
        renderRealtimeQueuePanel();
      }
    }, error => {
      console.error("Realtime performance-session listener failed:", error);
      setPublicBreakNotice(false);
    });
}

function handlePublicSessionClosed() {
  stopPublicQueueSessionListeners();

  publicQueueRealtimeState.sessionId = "";
  publicQueueRealtimeState.runOrder = [];
  publicQueueRealtimeState.pending = [];
  publicQueueRealtimeState.breakOpen = false;
  publicQueueRealtimeState.breakStartedAt = null;
  publicQueueRealtimeState.ready = false;

  requestsOpen = false;
  currentSignupSession = null;
  requestCart = [];

  setPublicBreakNotice(false);
  updateCartCount();
  closePublicQueuePanel();
  showRequestsClosedOnly();
}

function startRealtimePublicQueueMonitor() {
  if (publicQueueControlUnsub) return;

  publicQueueControlUnsub = db
    .collection("karaokeControl")
    .doc("currentSession")
    .onSnapshot(doc => {
      const data = doc.exists ? (doc.data() || {}) : {};
      const sessionId = String(
        data.sessionId ||
        data.activeSessionId ||
        ""
      ).trim();

      const active =
        data.active === true &&
        !!sessionId;

      if (!active) {
        handlePublicSessionClosed();
        return;
      }

      requestsOpen = true;
      currentSignupSession = {
        sessionId,
        isTestSession:false
      };

      showRequestsOpenPage();

      if (publicQueueRealtimeState.sessionId !== sessionId) {
        subscribePublicQueueForSession(sessionId);
      } else if (isQueuePanelVisible()) {
        renderRealtimeQueuePanel();
      }
    }, error => {
      console.error("Realtime current-session listener failed:", error);
    });
}

window.addEventListener("DOMContentLoaded", startRealtimePublicQueueMonitor);
window.renderQueuePanel = renderRealtimeQueuePanel;
