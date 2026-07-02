const MAIN_LIST_ID = "venue-main-public-song-list";
const DEFAULT_LIST_NAME = "Venue Main Public Song List";

let currentList = null;
let sections = [];
let sectionSongs = [];
let lyricsSongs = [];
let selectedSignupSong = null;

function signupButtonHTML(song) {
  const safeTitle = escapeHTML(song.title);
  const safeArtist = escapeHTML(song.artist);
  const safeYear = escapeHTML(song.year);

  return `
    <strong class="song-year">${safeYear}</strong>
    <button
      class="signup-song-btn"
      type="button"
      title="Sign up for this song"
      onclick="openSignupModal('${encodeURIComponent(song.id || "")}', '${encodeURIComponent(song.title || "")}', '${encodeURIComponent(song.artist || "")}', '${encodeURIComponent(song.year || "")}')">
      ✎
    </button>
  `;
}

function openSignupModal(songId, title, artist, year) {
  clearSearchResults();

  selectedSignupSong = {
    id: decodeURIComponent(songId || ""),
    title: decodeURIComponent(title || ""),
    artist: decodeURIComponent(artist || ""),
    year: decodeURIComponent(year || "")
  };

  document.getElementById("signupSongTitle").innerText = selectedSignupSong.title;
  document.getElementById("signupSongArtist").innerText = selectedSignupSong.artist;

  document.getElementById("signupName").value = "";
  document.getElementById("signupLocation").value = "";
  document.getElementById("signupAgeRange").value = "";
  document.getElementById("signupRating").value = "";
  document.getElementById("signupNote").value = "";
  document.getElementById("signupMessage").innerText = "";

  document.getElementById("signupModal").classList.remove("hidden");
  document.getElementById("signupName").focus();
}

function closeSignupModal() {
  document.getElementById("signupModal").classList.add("hidden");
  selectedSignupSong = null;
}

async function getCurrentSignupSession() {
  const snap = await db.collection("karaokeControl").doc("currentSession").get();
  const data = snap.exists ? snap.data() : {};

  if (data.activeSessionId) {
    return {
      sessionId: data.activeSessionId,
      isTestSession: false
    };
  }

  await db.collection("performanceSessions").doc("test-session").set({
    title: "Test Session",
    venue: "Test",
    status: "test",
    isActive: false,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return {
    sessionId: "test-session",
    isTestSession: true
  };
}

async function submitSongSignup() {
  if (!selectedSignupSong) return;

  const name = document.getElementById("signupName").value.trim();

  if (!name) {
    document.getElementById("signupMessage").innerText = "Please enter your name.";
    return;
  }

  const submitBtn = document.getElementById("signupSubmitBtn");
  submitBtn.disabled = true;
  submitBtn.innerText = "SENDING...";

  const sessionInfo = await getCurrentSignupSession();

  try {
    await db.collection("publicSongRequests").add({
      listId: MAIN_LIST_ID,

      sessionId: sessionInfo.sessionId,
      isTestSession: sessionInfo.isTestSession,
      status: "pending",
      
      songId: selectedSignupSong.id || "",
      songTitle: selectedSignupSong.title || "",
      artist: selectedSignupSong.artist || "",
      year: selectedSignupSong.year || "",

      singerName: name,
      location: document.getElementById("signupLocation").value.trim(),
      ageRange: document.getElementById("signupAgeRange").value,
      rating: document.getElementById("signupRating").value,
      note: document.getElementById("signupNote").value.trim(),

      /*status: "waiting",*/
      source: "public-songlist",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById("signupMessage").innerText =
      "Thank you! Your request has been received and will be attended to shortly.";

    setTimeout(closeSignupModal, 1800);

  } catch (error) {
    console.error(error);
    document.getElementById("signupMessage").innerText =
      "Could not send request. Please try again.";
  }

  submitBtn.disabled = false;
  submitBtn.innerText = "SIGN UP";
}

function renderSearchResults() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResultsBox");
  if (!input || !box) return;

  const search = input.value.toLowerCase().trim();

  if (!search) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const results = [
    ...getVisibleFullSongs(),
    ...sections.flatMap(section =>
      getSectionSongs(section.id)
        .map(getSectionSongDisplay)
        .filter(song => song.visible !== false)
    )
  ]
    .filter(song => getSongText(song).includes(search))
    .sort(sortByTitle);

  box.innerHTML = "";

  if (!results.length) {
    box.innerHTML = `<div class="search-result-row empty">No songs found</div>`;
    box.classList.remove("hidden");
    return;
  }

  results.forEach(song => {
    const row = document.createElement("div");
    row.className = "search-result-row";

    row.innerHTML = `
  <div class="song-text-main">
    <strong>${escapeHTML(song.title)}</strong>
    <span>${escapeHTML(song.artist)}</span>
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

  if (input) input.value = "";
  if (box) {
    box.innerHTML = "";
    box.classList.add("hidden");
  }
}

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanText(value) {
  return String(value || "").trim();
}

function sortByTitle(a, b) {
  return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
}

function sortByOrderThenTitle(a, b) {
  const orderA = Number(a.order || 0);
  const orderB = Number(b.order || 0);
  if (orderA !== orderB) return orderA - orderB;
  return sortByTitle(a, b);
}

function getSongText(song) {
  return `${song.title || ""} ${song.artist || ""} ${song.year || ""}`.toLowerCase();
}

function getLyricsSongById(id) {
  return lyricsSongs.find(song => song.id === id) || null;
}

function getVisibleFullSongs() {
  return lyricsSongs.filter(song => song.publicSongListVisible !== false).sort(sortByTitle);
}

function getFullSongCount() {
  return getVisibleFullSongs().length;
}

function getSectionSongs(sectionId) {
  return sectionSongs.filter(item => item.sectionId === sectionId).sort(sortByOrderThenTitle);
}

function getSectionSongDisplay(item) {
  const source = getLyricsSongById(item.lyricsId);
  return {
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
  if ("MNOPQ".includes(first)) return "M – P";
  if ("RS".includes(first)) return "R – S";
  return "T – Z";
}

function alphabetGroups(list) {
  const order = ["A – B", "C – D", "E – H", "I – L", "M – P", "R – S", "T – Z"];
  const groups = {};
  order.forEach(name => groups[name] = []);
  list.forEach(song => groups[getAlphaGroup(song.title)].push(song));
  return { order, groups };
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
  const snap = await db.collection("songlistSections")
    .where("listId", "==", MAIN_LIST_ID)
    .get();
  sections = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByOrderThenTitle);
}

async function loadSectionSongs() {
  const snap = await db.collection("songlistSongs")
    .where("listId", "==", MAIN_LIST_ID)
    .get();
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

async function initPublicSongList() {
  await reloadAll();

  renderPublicSongList();

  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearchBtn");

  if (searchInput) {
    searchInput.addEventListener("input", renderSearchResults);

    searchInput.addEventListener("blur", () => {
      setTimeout(clearSearchResults, 180);
    });
  }

  if (clearBtn) {
    clearBtn.onclick = () => clearSearchResults();
  }

  window.addEventListener("scroll", () => {
    const box = document.getElementById("searchResultsBox");
    const search = document.getElementById("searchInput");

    if (!box || !search || box.classList.contains("hidden")) return;

    const rect = search.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      clearSearchResults();
    }
  });
}

function renderPublicSongList() {
  const container = document.getElementById("publicSongList");
  if (!container) return;

  container.innerHTML = "";

  renderPublicCustomSections(container, "");
  renderPublicFullList(container, "");
}

function renderPublicCustomSections(container, search) {
  sections.filter(section => section.visible !== false).sort(sortByOrderThenTitle).forEach(section => {
    const items = getSectionSongs(section.id)
      .map(getSectionSongDisplay)
      .filter(song => song.visible !== false)
      .filter(song => !search || getSongText(song).includes(search));

    if (!items.length && search) return;

    const sectionEl = document.createElement("section");
    sectionEl.className = "song-section public-section collapsible-public-section custom-section";

    const grid = document.createElement("div");
    grid.className = "song-section-grid";

    const box = document.createElement("div");
    box.className = "song-section-box";

    const heading = document.createElement("h2");
    heading.className = "public-section-title";

    const body = document.createElement("div");
    body.className = "public-section-songs";
    body.style.display = section.openByDefault ? "block" : "none";

    function updateHeading() {
      const isOpen = body.style.display !== "none";
      heading.innerHTML = `
        <span class="section-name">${escapeHTML(section.title)}</span>
        <span class="section-toggle-text">
          ${isOpen ? "▲ (Click to Hide)" : "▼ (Click to View)"}
        </span>
      `;
    }

    heading.onclick = () => {
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      updateHeading();
    };

    updateHeading();
    renderPlainSongList(body, items);

    box.appendChild(heading);
    box.appendChild(body);
    grid.appendChild(box);
    sectionEl.appendChild(grid);
    container.appendChild(sectionEl);
  });
}

function renderPublicFullList(container, search) {
  const fullSongs = getVisibleFullSongs()
    .filter(song => !search || getSongText(song).includes(search));

  if (!fullSongs.length) return;

  const fullHeading = document.createElement("div");
  fullHeading.className = "full-song-list-heading";
  fullHeading.innerText = "★ FULL SONG LIST ★";
  container.appendChild(fullHeading);

  const { order, groups } = alphabetGroups(fullSongs);
  let counter = 1;

  order.forEach(groupName => {
    const groupSongs = groups[groupName];
    if (!groupSongs.length) return;

    const section = document.createElement("section");
    section.className = "song-section full-alpha-section";

    section.innerHTML = `
      <div class="song-section-grid">
        <div class="song-section-box">
          <h2 class="alphabet-subheader alpha-heading">${escapeHTML(groupName)}</h2>
          <ol start="${counter}"></ol>
        </div>
      </div>
    `;

    const ol = section.querySelector("ol");

    groupSongs.forEach(song => {
      const li = document.createElement("li");
      li.innerHTML = `
  <div class="song-info song-info-with-year">
    <div class="song-text-main">
      <span>${escapeHTML(song.title)}</span>
      <em>${escapeHTML(song.artist)}</em>
    </div>
    ${signupButtonHTML(song)}
  </div>
`;
      ol.appendChild(li);
      counter++;
    });

    container.appendChild(section);
  });
}

function renderPlainSongList(container, list) {
  const ol = document.createElement("ol");

  list.forEach(song => {
    const li = document.createElement("li");
    li.innerHTML = `
  <div class="song-info song-info-with-year">
    <div class="song-text-main">
      <span>${escapeHTML(song.title)}</span>
      <em>${escapeHTML(song.artist)}</em>
    </div>
    ${signupButtonHTML(song)}
  </div>
`;
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
    listId: MAIN_LIST_ID,
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
    listId: MAIN_LIST_ID,
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
