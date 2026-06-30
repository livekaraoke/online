const MAIN_LIST_ID = "venue-main-public-song-list";

let currentList = null;
let sections = [];
let songs = [];

/* ---------- HELPERS ---------- */

function makeSong(title, artist = "", sectionId = "main") {
  return {
    title: title.trim(),
    artist: artist.trim(),
    sectionId,
    visible: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}

function sortSections() {
  sections.sort((a, b) => {
    const orderA = Number(a.order || 0);
    const orderB = Number(b.order || 0);

    if (orderA !== orderB) return orderA - orderB;

    return (a.title || "").localeCompare(b.title || "", undefined, {
      sensitivity: "base"
    });
  });
}

function sortSongs() {
  songs.sort((a, b) =>
    (a.title || "").localeCompare(b.title || "", undefined, {
      sensitivity: "base"
    })
  );
}

async function ensureMainList() {
  const ref = db.collection("songlists").doc(MAIN_LIST_ID);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      name: "Venue Main Public Song List",
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

  sections = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  sortSections();
}

async function loadSongs() {
  const snap = await db.collection("songlistSongs")
    .where("listId", "==", MAIN_LIST_ID)
    .get();

  songs = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  sortSongs();
}

function sectionLabel(section) {
  return section.openByDefault
    ? `${section.title} ▲ (Click to Hide)`
    : `${section.title} ▼ (Click to View)`;
}

/* ---------- PUBLIC PAGE ---------- */

async function initPublicSongList() {
  await ensureMainList();
  await loadSections();
  await loadSongs();

  document.getElementById("listTitle").innerText =
    currentList.name || "Venue Main Public Song List";

  renderPublicSongList();

  document.getElementById("searchInput").addEventListener("input", renderPublicSongList);
}

function renderPublicSongList() {
  const container = document.getElementById("publicSongList");
  const search = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();

  container.innerHTML = "";

  const visibleSongs = songs.filter(song => {
    if (song.visible === false) return false;

    const text = `${song.title || ""} ${song.artist || ""}`.toLowerCase();
    return !search || text.includes(search);
  });

  sections.forEach(section => {
    const sectionSongs = visibleSongs.filter(song => song.sectionId === section.id);
    if (!sectionSongs.length && search) return;

    const sectionBox = document.createElement("section");
    sectionBox.className = "public-section";

    const title = document.createElement("h2");
    title.className = "public-section-title";
    title.dataset.open = section.openByDefault ? "true" : "false";
    title.innerText = sectionLabel(section);

    const songWrap = document.createElement("div");
    songWrap.className = "public-section-songs";
    songWrap.style.display = section.openByDefault ? "block" : "none";

    title.onclick = () => {
      const isOpen = songWrap.style.display !== "none";
      songWrap.style.display = isOpen ? "none" : "block";
      title.innerText = isOpen
        ? `${section.title} ▼ (Click to View)`
        : `${section.title} ▲ (Click to Hide)`;
    };

    sectionSongs.forEach(song => {
      const row = document.createElement("div");
      row.className = "public-song-row";
      row.innerHTML = `
        <strong>${song.title || ""}</strong>
        <span>${song.artist || ""}</span>
      `;
      songWrap.appendChild(row);
    });

    sectionBox.appendChild(title);
    sectionBox.appendChild(songWrap);
    container.appendChild(sectionBox);
  });

  const noSectionSongs = visibleSongs.filter(song => !song.sectionId || song.sectionId === "main");

  if (noSectionSongs.length) {
    const sectionBox = document.createElement("section");
    sectionBox.className = "public-section";

    const title = document.createElement("h2");
    title.className = "public-section-title";
    title.innerText = "Songs ▲ (Click to Hide)";

    const songWrap = document.createElement("div");
    songWrap.className = "public-section-songs";

    title.onclick = () => {
      const isOpen = songWrap.style.display !== "none";
      songWrap.style.display = isOpen ? "none" : "block";
      title.innerText = isOpen
        ? "Songs ▼ (Click to View)"
        : "Songs ▲ (Click to Hide)";
    };

    noSectionSongs.forEach(song => {
      const row = document.createElement("div");
      row.className = "public-song-row";
      row.innerHTML = `
        <strong>${song.title || ""}</strong>
        <span>${song.artist || ""}</span>
      `;
      songWrap.appendChild(row);
    });

    sectionBox.appendChild(title);
    sectionBox.appendChild(songWrap);
    container.appendChild(sectionBox);
  }
}

/* ---------- EDITOR ---------- */

async function initEditor() {
  await ensureMainList();
  await loadSections();
  await loadSongs();

  document.getElementById("listNameInput").value =
    currentList.name || "Venue Main Public Song List";

  renderSectionDropdown();
  renderEditorSongList();
}

function renderSectionDropdown() {
  const select = document.getElementById("songSectionSelect");
  if (!select) return;

  select.innerHTML = `<option value="main">No Section / Main Songs</option>`;

  sections.forEach(section => {
    const opt = document.createElement("option");
    opt.value = section.id;
    opt.textContent = section.title;
    select.appendChild(opt);
  });
}

function renderEditorSongList() {
  const container = document.getElementById("editorSongList");
  if (!container) return;

  container.innerHTML = "";

  sections.forEach(section => {
    const sectionSongs = songs.filter(song => song.sectionId === section.id);

    const box = document.createElement("div");
    box.className = "editor-section";

    box.innerHTML = `
      <div class="editor-section-head">
        <strong>${section.title}</strong>
        <span>${section.openByDefault ? "Open by default" : "Closed by default"}</span>
        <button onclick="toggleSectionDefault('${section.id}', ${section.openByDefault ? "false" : "true"})">
          ${section.openByDefault ? "Set Closed" : "Set Open"}
        </button>
        <button onclick="deleteSection('${section.id}')">Delete Section</button>
      </div>
    `;

    sectionSongs.forEach(song => {
      box.appendChild(createEditorSongRow(song));
    });

    container.appendChild(box);
  });

  const mainSongs = songs.filter(song => !song.sectionId || song.sectionId === "main");

  if (mainSongs.length) {
    const box = document.createElement("div");
    box.className = "editor-section";

    box.innerHTML = `
      <div class="editor-section-head">
        <strong>Main Songs</strong>
      </div>
    `;

    mainSongs.forEach(song => {
      box.appendChild(createEditorSongRow(song));
    });

    container.appendChild(box);
  }
}

function createEditorSongRow(song) {
  const row = document.createElement("div");
  row.className = "editor-song-row";

  row.innerHTML = `
    <div>
      <strong>${song.title || ""}</strong>
      <span>${song.artist || ""}</span>
    </div>

    <button onclick="toggleSongVisible('${song.id}', ${song.visible === false ? "true" : "false"})">
      ${song.visible === false ? "Show" : "Hide"}
    </button>

    <button onclick="deleteSong('${song.id}')">Delete</button>
  `;

  return row;
}

async function saveListSettings() {
  const name = document.getElementById("listNameInput").value.trim();

  await db.collection("songlists").doc(MAIN_LIST_ID).set({
    name: name || "Venue Main Public Song List",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await initEditor();
  alert("List settings saved.");
}

async function addSection() {
  const title = document.getElementById("sectionTitleInput").value.trim();
  const openByDefault = document.getElementById("sectionOpenInput").checked;

  if (!title) {
    alert("Enter a section title.");
    return;
  }

  await db.collection("songlistSections").add({
    listId: MAIN_LIST_ID,
    title,
    openByDefault,
    order: sections.length + 1,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById("sectionTitleInput").value = "";

  await initEditor();
}

async function addSong() {
  const title = document.getElementById("songTitleInput").value.trim();
  const artist = document.getElementById("songArtistInput").value.trim();
  const sectionId = document.getElementById("songSectionSelect").value || "main";

  if (!title) {
    alert("Enter a song title.");
    return;
  }

  await db.collection("songlistSongs").add({
    listId: MAIN_LIST_ID,
    title,
    artist,
    sectionId,
    visible: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById("songTitleInput").value = "";
  document.getElementById("songArtistInput").value = "";

  await initEditor();
}

async function toggleSongVisible(songId, visible) {
  await db.collection("songlistSongs").doc(songId).set({
    visible
  }, { merge: true });

  await initEditor();
}

async function deleteSong(songId) {
  if (!confirm("Delete this song?")) return;

  await db.collection("songlistSongs").doc(songId).delete();
  await initEditor();
}

async function toggleSectionDefault(sectionId, openByDefault) {
  await db.collection("songlistSections").doc(sectionId).set({
    openByDefault
  }, { merge: true });

  await initEditor();
}

async function deleteSection(sectionId) {
  if (!confirm("Delete this section? Songs inside it will move to Main Songs.")) return;

  await db.collection("songlistSections").doc(sectionId).delete();

  const affectedSongs = songs.filter(song => song.sectionId === sectionId);

  for (const song of affectedSongs) {
    await db.collection("songlistSongs").doc(song.id).set({
      sectionId: "main"
    }, { merge: true });
  }

  await initEditor();
}

/* ---------- SEED OLD LIST ---------- */

async function seedFromOldPublicSongList() {
  const ok = confirm("Seed the public song list with the old song list data?");
  if (!ok) return;

  await ensureMainList();

  const seedSectionRef = await db.collection("songlistSections").add({
    listId: MAIN_LIST_ID,
    title: "Venue Main Public Song List",
    openByDefault: true,
    order: 1,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  const seedSongs = [
    makeSong("Blaze of Glory", "Bon Jovi", seedSectionRef.id),
    makeSong("City of New Orleans", "Willie Nelson", seedSectionRef.id),
    makeSong("Bed of Roses", "Bon Jovi", seedSectionRef.id),
    makeSong("Hallelujah", "Leonard Cohen", seedSectionRef.id),
    makeSong("Riders on the Storm", "The Doors", seedSectionRef.id),
    makeSong("Forever Blowing Bubbles", "John Kellette", seedSectionRef.id),
    makeSong("An American Trilogy", "Elvis Presley", seedSectionRef.id),
    makeSong("I Got You Babe", "Sonny & Cher / UB40", seedSectionRef.id),
    makeSong("Uncle John's Band", "Grateful Dead", seedSectionRef.id),
    makeSong("Enjoy the Silence", "Depeche Mode", seedSectionRef.id),
    makeSong("You Don't Love Me No No No", "Dawn Penn", seedSectionRef.id),
    makeSong("Narcotic", "Liquido", seedSectionRef.id),
    makeSong("Guitar Boogie", "Tommy Emmanuel", seedSectionRef.id),
    makeSong("R U Mine?", "Arctic Monkeys", seedSectionRef.id),
    makeSong("Wind Beneath My Wings", "Bette Midler", seedSectionRef.id),
    makeSong("My Sweet Lord", "George Harrison", seedSectionRef.id),
    makeSong("My Way", "Frank Sinatra", seedSectionRef.id),
    makeSong("Twist and Shout", "The Beatles", seedSectionRef.id),
    makeSong("Redemption Song", "Bob Marley", seedSectionRef.id)
  ];

  for (const song of seedSongs) {
    await db.collection("songlistSongs").add({
      ...song,
      listId: MAIN_LIST_ID
    });
  }

  await initEditor();
  alert("Seed complete.");
}