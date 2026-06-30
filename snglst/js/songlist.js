const SYSTEM_MAIN_LIST_ID = "venuemainpubliclist";

let allLyricsSongs = [];
let songLists = [];
let currentListId = SYSTEM_MAIN_LIST_ID;
let currentList = null;
let currentSections = [];
let selectedSectionId = null;
let publicSearch = "";

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function cleanTitle(title) {
  return String(title || "").trim();
}

function sortSongsAZ(songs) {
  return [...songs].sort((a, b) => {
    const aa = cleanTitle(a.sortTitle || a.title);
    const bb = cleanTitle(b.sortTitle || b.title);
    return aa.localeCompare(bb, undefined, { sensitivity: "base" });
  });
}

function songBelongsToList(song, listId) {
  if (Array.isArray(song.songLists)) return song.songLists.includes(listId);
  if (song.publicList === listId) return true;
  if (song.visibility === "public" && listId === SYSTEM_MAIN_LIST_ID) return true;
  return false;
}

function songBadge(song, listId) {
  if (song.visibility === "private" || !songBelongsToList(song, listId)) {
    return `<span class="song-badge private">PRIVATE</span>`;
  }

  if (listId === SYSTEM_MAIN_LIST_ID) {
    return `<span class="song-badge public">PUBLIC</span>`;
  }

  return `<span class="song-badge list">LIST</span>`;
}

/* PUBLIC PAGE */

window.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("songlistContent")) {
    initPublicSongList();
  }
});

async function initPublicSongList() {
  const params = new URLSearchParams(window.location.search);
  currentListId = params.get("list") || await getDefaultListId();

  document.getElementById("publicSongSearch").addEventListener("input", e => {
    publicSearch = e.target.value.toLowerCase().trim();
    renderPublicSongList();
  });

  await loadPublicData();
  renderPublicSongList();
}

async function getDefaultListId() {
  const snap = await db.collection("songlists")
    .where("defaultList", "==", true)
    .limit(1)
    .get();

  if (!snap.empty) return snap.docs[0].id;
  return SYSTEM_MAIN_LIST_ID;
}

async function loadPublicData() {
  const listDoc = await db.collection("songlists").doc(currentListId).get();

  if (!listDoc.exists) {
    currentListId = SYSTEM_MAIN_LIST_ID;
    currentList = {
      name: "Venue Main Public Song List",
      isSystem: true,
      defaultList: true
    };
  } else {
    currentList = { id: listDoc.id, ...listDoc.data() };
  }

  const sectionSnap = await db.collection("songlistSections")
    .where("listId", "==", currentListId)
    .get();

  currentSections = sectionSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const lyricsSnap = await db.collection("lyrics").get();
  allLyricsSongs = lyricsSnap.docs.map(doc => ({
    firebaseId: doc.id,
    id: doc.id,
    ...doc.data()
  }));
}

function renderPublicSongList() {
  document.getElementById("publicListTitle").innerText =
    currentList?.name || "Live Karaoke Song List";

  const container = document.getElementById("songlistContent");
  container.innerHTML = "";

  const visibleSongs = allLyricsSongs.filter(song => {
    if (!songBelongsToList(song, currentListId)) return false;

    const q = `${song.title || ""} ${song.artist || ""} ${song.publicNote || ""}`.toLowerCase();

    return !publicSearch || q.includes(publicSearch);
  });

  document.getElementById("songCount").innerText =
    `${visibleSongs.length} songs available`;

  renderAlphaNav(visibleSongs);

  currentSections.forEach(section => {
    container.appendChild(renderPublicSection(section, visibleSongs));
  });
}

function renderAlphaNav(songs) {
  const nav = document.getElementById("alphaNav");
  const letters = [...new Set(sortSongsAZ(songs).map(s => {
    return cleanTitle(s.sortTitle || s.title).charAt(0).toUpperCase();
  }))].filter(Boolean);

  nav.innerHTML = letters.map(letter =>
    `<button onclick="scrollToLetter('${letter}')">${letter}</button>`
  ).join("");
}

function scrollToLetter(letter) {
  const el = document.getElementById(`letter-${letter}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPublicSection(section, visibleSongs) {
  const wrap = document.createElement("section");
  wrap.className = "song-section";

  const box = document.createElement("div");
  box.className = "song-section-box";

  const isClosed = section.collapsed === true;
  const title = document.createElement("h2");
  title.className = "collapsible-title";
  title.innerHTML = `${section.title || "Section"} <span>${isClosed ? "▼ (Click to View)" : "▲ (Click to Hide)"}</span>`;

  const content = document.createElement("div");
  content.className = isClosed ? "section-inner collapsed" : "section-inner";

  title.onclick = () => {
    content.classList.toggle("collapsed");
    const closed = content.classList.contains("collapsed");
    title.innerHTML = `${section.title || "Section"} <span>${closed ? "▼ (Click to View)" : "▲ (Click to Hide)"}</span>`;
  };

  if (section.type === "alphabetical") {
    content.innerHTML = renderAlphabeticalSongs(visibleSongs);
  } else if (section.type === "featured" || section.type === "custom") {
    const ids = section.songIds || [];
    const songs = ids.map(id => allLyricsSongs.find(s => s.firebaseId === id || s.id === id)).filter(Boolean);
    content.innerHTML = renderSimpleSongList(sortSongsAZ(songs));
  } else if (section.type === "cta") {
    content.innerHTML = renderCTA(section);
  } else if (section.type === "ad") {
    content.innerHTML = renderAd(section);
  } else if (section.type === "html") {
    content.innerHTML = section.content || "";
  } else {
    content.innerHTML = `<div class="text-block">${escapeHTML(section.content || "")}</div>`;
  }

  box.appendChild(title);
  box.appendChild(content);
  wrap.appendChild(box);

  return wrap;
}

function renderAlphabeticalSongs(songs) {
  const sorted = sortSongsAZ(songs);
  let html = "";
  let currentLetter = "";
  let count = 1;

  sorted.forEach(song => {
    const letter = cleanTitle(song.sortTitle || song.title).charAt(0).toUpperCase() || "#";

    if (letter !== currentLetter) {
      currentLetter = letter;
      html += `<h3 id="letter-${letter}" class="letter-heading">${letter}</h3><ol start="${count}">`;
    }

    html += renderSongLI(song);
    count++;

    const next = sorted[count - 1];
    const nextLetter = next ? cleanTitle(next.sortTitle || next.title).charAt(0).toUpperCase() : null;

    if (nextLetter !== currentLetter) html += `</ol>`;
  });

  return html;
}

function renderSimpleSongList(songs) {
  return `<ol>${songs.map(renderSongLI).join("")}</ol>`;
}

function renderSongLI(song) {
  const note = song.publicNote ? `<b class="public-note">${escapeHTML(song.publicNote)}</b>` : "";

  return `
    <li>
      <div class="song-info">
        <span>${escapeHTML(song.title || "Untitled")} ${note}</span>
        <em>${escapeHTML(song.artist || "Unknown Artist")}</em>
      </div>
    </li>
  `;
}

function renderCTA(section) {
  const btn = section.buttonText && section.buttonUrl
    ? `<a class="cta-btn" href="${escapeAttr(section.buttonUrl)}">${escapeHTML(section.buttonText)}</a>`
    : "";

  return `
    <div class="cta-box">
      <p>${escapeHTML(section.content || "")}</p>
      ${btn}
    </div>
  `;
}

function renderAd(section) {
  const btn = section.buttonText && section.buttonUrl
    ? `<a class="cta-btn" href="${escapeAttr(section.buttonUrl)}">${escapeHTML(section.buttonText)}</a>`
    : "";

  return `
    <div class="ad-box">
      <p>${escapeHTML(section.content || "")}</p>
      ${btn}
    </div>
  `;
}

/* EDITOR */

async function initEditor() {
  await loadEditorData();
  renderEditorLists();
}

async function loadEditorData() {
  const listsSnap = await db.collection("songlists").get();
  songLists = listsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  if (!songLists.some(l => l.id === SYSTEM_MAIN_LIST_ID)) {
    await seedVenueMainList();
    return;
  }

  const lyricsSnap = await db.collection("lyrics").orderBy("title").get();
  allLyricsSongs = lyricsSnap.docs.map(doc => ({
    firebaseId: doc.id,
    id: doc.id,
    ...doc.data()
  }));
}

function renderEditorLists() {
  const select = document.getElementById("listSelect");
  select.innerHTML = "";

  songLists
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach(list => {
      const opt = document.createElement("option");
      opt.value = list.id;
      opt.textContent = list.name || list.id;
      select.appendChild(opt);
    });

  select.value = currentListId;
  loadSelectedList();
}

async function loadSelectedList() {
  currentListId = document.getElementById("listSelect").value || SYSTEM_MAIN_LIST_ID;
  currentList = songLists.find(l => l.id === currentListId);

  document.getElementById("listNameInput").value = currentList?.name || "";
  document.getElementById("defaultListCheck").checked = currentList?.defaultList === true;

  const sectionSnap = await db.collection("songlistSections")
    .where("listId", "==", currentListId)
    .get();

  currentSections = sectionSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  renderSectionEditorList();
}

function renderSectionEditorList() {
  const box = document.getElementById("sectionEditorList");
  box.innerHTML = "";

  currentSections.forEach((section, index) => {
    const row = document.createElement("div");
    row.className = "editor-section-row";
    row.innerHTML = `
      <strong>${escapeHTML(section.title)}</strong>
      <span>${section.type}</span>
      <small>${section.collapsed ? "Starts Closed" : "Starts Open"}</small>
      <button onclick="selectSection('${section.id}')">Edit</button>
      <button onclick="moveSectionOrder('${section.id}', -1)">▲</button>
      <button onclick="moveSectionOrder('${section.id}', 1)">▼</button>
      <button onclick="deleteSection('${section.id}')">Delete</button>
    `;
    box.appendChild(row);
  });
}

async function createSongList() {
  const name = document.getElementById("newListName").value.trim();
  if (!name) return alert("Enter a list name.");

  const id = slugify(name);

  await db.collection("songlists").doc(id).set({
    name,
    isSystem: false,
    defaultList: false,
    order: Date.now(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById("newListName").value = "";
  currentListId = id;
  await loadEditorData();
  renderEditorLists();
}

async function deleteCurrentList() {
  if (currentListId === SYSTEM_MAIN_LIST_ID) {
    alert("Venue Main Public List cannot be deleted.");
    return;
  }

  if (!confirm("Delete this list and its sections?")) return;

  const sectionSnap = await db.collection("songlistSections")
    .where("listId", "==", currentListId)
    .get();

  const batch = db.batch();

  sectionSnap.docs.forEach(doc => batch.delete(doc.ref));
  batch.delete(db.collection("songlists").doc(currentListId));

  await batch.commit();

  currentListId = SYSTEM_MAIN_LIST_ID;
  await loadEditorData();
  renderEditorLists();
}

async function saveListSettings() {
  const name = document.getElementById("listNameInput").value.trim();
  const defaultList = document.getElementById("defaultListCheck").checked;

  if (!name) return alert("List name required.");

  if (defaultList) {
    const batch = db.batch();
    const snap = await db.collection("songlists").get();

    snap.docs.forEach(doc => {
      batch.update(doc.ref, { defaultList: doc.id === currentListId });
    });

    await batch.commit();
  }

  await db.collection("songlists").doc(currentListId).set({
    name,
    defaultList,
    isSystem: currentListId === SYSTEM_MAIN_LIST_ID
  }, { merge: true });

  await loadEditorData();
  renderEditorLists();
}

async function createSection() {
  const title = document.getElementById("newSectionTitle").value.trim();
  const type = document.getElementById("newSectionType").value;
  const collapsed = document.getElementById("newSectionCollapsed").checked;

  if (!title) return alert("Section title required.");

  await db.collection("songlistSections").add({
    listId: currentListId,
    title,
    type,
    collapsed,
    order: Date.now(),
    songIds: [],
    content: "",
    buttonText: "",
    buttonUrl: "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById("newSectionTitle").value = "";
  await loadSelectedList();
}

async function selectSection(sectionId) {
  selectedSectionId = sectionId;

  const section = currentSections.find(s => s.id === sectionId);
  if (!section) return;

  document.getElementById("selectedSectionInfo").innerHTML = `
    <h3>${escapeHTML(section.title)}</h3>
    <p>Type: ${escapeHTML(section.type)}</p>
  `;

  const songArea = document.getElementById("songPickerArea");
  const contentArea = document.getElementById("customContentArea");

  if (["featured", "custom"].includes(section.type)) {
    songArea.classList.remove("hidden");
    contentArea.classList.add("hidden");
    renderSongPicker();
  } else if (["cta", "ad", "text", "html"].includes(section.type)) {
    songArea.classList.add("hidden");
    contentArea.classList.remove("hidden");

    document.getElementById("sectionContentInput").value = section.content || "";
    document.getElementById("sectionButtonText").value = section.buttonText || "";
    document.getElementById("sectionButtonUrl").value = section.buttonUrl || "";
  } else {
    songArea.classList.add("hidden");
    contentArea.classList.add("hidden");
  }
}

function renderSongPicker() {
  const section = currentSections.find(s => s.id === selectedSectionId);
  if (!section) return;

  const q = document.getElementById("songPickerSearch").value.toLowerCase().trim();
  const selected = section.songIds || [];

  const results = sortSongsAZ(allLyricsSongs)
    .filter(song => {
      const hay = `${song.title || ""} ${song.artist || ""}`.toLowerCase();
      return !q || hay.includes(q);
    })
    .slice(0, 250);

  document.getElementById("songPickerResults").innerHTML = results.map(song => {
    const checked = selected.includes(song.firebaseId) ? "checked" : "";
    return `
      <label class="picker-song">
        <input type="checkbox" ${checked} onchange="toggleSectionSong('${song.firebaseId}', this.checked)">
        <strong>${escapeHTML(song.title || "Untitled")}</strong>
        <span>${escapeHTML(song.artist || "")}</span>
        ${songBadge(song, currentListId)}
      </label>
    `;
  }).join("");
}

async function toggleSectionSong(songId, checked) {
  const section = currentSections.find(s => s.id === selectedSectionId);
  if (!section) return;

  let ids = section.songIds || [];

  if (checked && !ids.includes(songId)) ids.push(songId);
  if (!checked) ids = ids.filter(id => id !== songId);

  await db.collection("songlistSections").doc(selectedSectionId).update({
    songIds: ids
  });

  section.songIds = ids;

  await toggleSongInList(songId, checked);
}

async function toggleSongInList(songId, checked) {
  const ref = db.collection("lyrics").doc(songId);
  const doc = await ref.get();
  if (!doc.exists) return;

  const song = doc.data();
  let lists = Array.isArray(song.songLists) ? song.songLists : [];

  if (checked && !lists.includes(currentListId)) lists.push(currentListId);
  if (!checked) lists = lists.filter(id => id !== currentListId);

  await ref.set({
    songLists: lists,
    visibility: lists.length ? "public" : "private"
  }, { merge: true });
}

async function saveSectionContent() {
  if (!selectedSectionId) return;

  await db.collection("songlistSections").doc(selectedSectionId).update({
    content: document.getElementById("sectionContentInput").value,
    buttonText: document.getElementById("sectionButtonText").value,
    buttonUrl: document.getElementById("sectionButtonUrl").value
  });

  alert("Section content saved.");
  await loadSelectedList();
}

async function moveSectionOrder(sectionId, direction) {
  const index = currentSections.findIndex(s => s.id === sectionId);
  const otherIndex = index + direction;

  if (index < 0 || otherIndex < 0 || otherIndex >= currentSections.length) return;

  const a = currentSections[index];
  const b = currentSections[otherIndex];

  await db.collection("songlistSections").doc(a.id).update({ order: b.order || 0 });
  await db.collection("songlistSections").doc(b.id).update({ order: a.order || 0 });

  await loadSelectedList();
}

async function deleteSection(sectionId) {
  if (!confirm("Delete this section?")) return;
  await db.collection("songlistSections").doc(sectionId).delete();
  await loadSelectedList();
}

async function seedVenueMainList() {
  await db.collection("songlists").doc(SYSTEM_MAIN_LIST_ID).set({
    name: "Venue Main Public Song List",
    isSystem: true,
    defaultList: true,
    order: 0,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const existing = await db.collection("songlistSections")
    .where("listId", "==", SYSTEM_MAIN_LIST_ID)
    .get();

  if (existing.empty) {
    const seedSections = [
      ["★ MOST POPULAR SONGS", "featured", false],
      ["🔥 PARTY ANTHEMS", "featured", false],
      ["♥ EASY TO SING", "featured", false],
      ["★ FULL SONG LIST ★", "alphabetical", false],
      ["THANK YOU", "cta", false]
    ];

    const batch = db.batch();

    seedSections.forEach((s, i) => {
      const ref = db.collection("songlistSections").doc();
      batch.set(ref, {
        listId: SYSTEM_MAIN_LIST_ID,
        title: s[0],
        type: s[1],
        collapsed: s[2],
        order: i + 1,
        songIds: [],
        content: s[1] === "cta" ? "YOU SING, I PLAY, EVERYONE HAS FUN!" : "",
        buttonText: s[1] === "cta" ? "← BACK TO MAIN PAGE" : "",
        buttonUrl: s[1] === "cta" ? "../index.html" : ""
      });
    });

    await batch.commit();
  }

  alert("Venue Main Public List created/checked.");
  await loadEditorData();
  renderEditorLists();
}

/* UTILS */

function escapeHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return String(str || "")
    .replace(/"/g, "&quot;");
}

async function seedFromOldPublicSongList() {
  const url = "https://livekaraoke.github.io/online/snglst/songList.html";

  const ok = confirm("Import songs from old public song list?");
  if (!ok) return;

  const res = await fetch(url);
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, "text/html");

  await seedVenueMainList();

  const listId = SYSTEM_MAIN_LIST_ID;

  const lyricsSnap = await db.collection("lyrics").get();
  const existingSongs = lyricsSnap.docs.map(d => ({
    firebaseId: d.id,
    ...d.data()
  }));

  function normalise(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function bestMatchSong(lineText) {
    const cleanLine = normalise(lineText);

    let best = null;

    existingSongs.forEach(song => {
      const titleKey = normalise(song.title);

      if (!titleKey) return;

      if (cleanLine.startsWith(titleKey)) {
        if (!best || titleKey.length > normalise(best.title).length) {
          best = song;
        }
      }
    });

    return best;
  }

  const sectionMap = {
    "★ MOST POPULAR SONGS": [],
    "PARTY ANTHEMS": [],
    "♥ EASY TO SING": [],
    "★ FULL SONG LIST ★": []
  };

  let currentSection = "";

  [...doc.body.querySelectorAll("h1, h2, li")].forEach(el => {
    const text = el.innerText.replace(/\s+/g, " ").trim();

    if (!text) return;

    if (el.tagName === "H1" && text.includes("SONG LIST")) {
      currentSection = "★ FULL SONG LIST ★";
      return;
    }

    if (el.tagName === "H2") {
      if (text.includes("MOST POPULAR")) currentSection = "★ MOST POPULAR SONGS";
      else if (text.includes("PARTY ANTHEMS")) currentSection = "PARTY ANTHEMS";
      else if (text.includes("EASY TO SING")) currentSection = "♥ EASY TO SING";
      return;
    }

    if (el.tagName !== "LI" || !currentSection) return;

    const lineText = text.replace(/^\d+\.\s*/, "").trim();
    const matchedSong = bestMatchSong(lineText);

    if (matchedSong) {
      sectionMap[currentSection].push(matchedSong.firebaseId);
    }
  });

  const batch = db.batch();

  for (const ids of Object.values(sectionMap)) {
    ids.forEach(songId => {
      const song = existingSongs.find(s => s.firebaseId === songId);
      if (!song) return;

      const lists = Array.isArray(song.songLists) ? song.songLists : [];

      if (!lists.includes(listId)) lists.push(listId);

      batch.set(db.collection("lyrics").doc(songId), {
        songLists: lists,
        visibility: "public"
      }, { merge: true });
    });
  }

  await batch.commit();

  const sectionSnap = await db.collection("songlistSections")
    .where("listId", "==", listId)
    .get();

  const sections = sectionSnap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  for (const [title, ids] of Object.entries(sectionMap)) {
    const section = sections.find(s =>
      String(s.title || "").toLowerCase().includes(
        title.replace(/[★♥]/g, "").trim().toLowerCase()
      )
    );

    if (!section) continue;

    if (title === "★ FULL SONG LIST ★") continue;

    await db.collection("songlistSections").doc(section.id).set({
      songIds: ids,
      collapsed: false
    }, { merge: true });
  }

  alert("Venue Main Public Song List seeded from old song list.");
  await loadEditorData();
  await loadSelectedList();
}
