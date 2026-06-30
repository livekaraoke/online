const MAIN_LIST_ID = "venue-main-public-song-list";

let currentList = null;
let sections = [];
let songs = [];

/* =========================================================
   OLD PUBLIC SONG LIST SEED DATA
========================================================= */

const OLD_PUBLIC_SECTIONS = [
  {
    title: "A – B",
    openByDefault: true,
    order: 1,
    songs: [
      ["Ain’t No Sunshine", "Bill Withers"],
      ["All Along the Watchtower", "Jimi Hendrix"],
      ["All Summer Long", "Kid Rock"],
      ["All the Small Things", "Blink-182"],
      ["Angels", "Robbie Williams"],
      ["Angie", "The Rolling Stones"],
      ["Another Brick in the Wall (part 2)", "Pink Floyd"],
      ["Another One Bites the Dust", "Queen"],
      ["Bad Moon Rising", "CCR"],
      ["Bad Romance", "Lady Gaga"],
      ["Basket Case", "Green Day"],
      ["Beds Are Burning", "Midnight Oil"],
      ["Behind Blue Eyes", "The Who"],
      ["Bella Ciao", "Misc. – unknown"],
      ["Big Me", "Foo Fighters"],
      ["Bittersweet Symphony", "The Verve"],
      ["Bohemian Like You", "The Dandy Warhols"],
      ["Born to Be Wild", "Steppenwolf"],
      ["Boulevard of Broken Dreams", "Green Day"],
      ["Breakfast at Tiffany’s", "Deep Blue Something"]
    ]
  },
  {
    title: "C – D",
    openByDefault: true,
    order: 2,
    songs: [
      ["Californication", "Red Hot Chili Peppers"],
      ["Call Me the Breeze", "Lynyrd Skynyrd"],
      ["Can’t Get Enough", "Bad Company"],
      ["Can’t Take My Eyes Off You", "Frankie Valli / Muse"],
      ["Changes", "Black Sabbath"],
      ["Chasing Cars", "Snow Patrol"],
      ["Clocks", "Coldplay"],
      ["Cocaine", "Eric Clapton"],
      ["Come as You Are", "Nirvana"],
      ["Come Together", "The Beatles"],
      ["Could You Be Loved", "Bob Marley"],
      ["Crazy Little Thing Called Love", "Queen"],
      ["Creep", "Radiohead"],
      ["Dakota", "Stereophonics"],
      ["Dani California", "Red Hot Chili Peppers"],
      ["Do I Wanna Know", "Arctic Monkeys"],
      ["Don’t Look Back in Anger", "Oasis"],
      ["Don’t Stop Me Now", "Queen"],
      ["Down Under", "Men At Work"],
      ["Dreams", "Fleetwood Mac"],
      ["Drive", "Incubus"],
      ["Drops of Jupiter", "Train"]
    ]
  },
  {
    title: "E – H",
    openByDefault: true,
    order: 3,
    songs: [
      ["Every Breath You Take", "The Police"],
      ["Every Rose Has Its Thorn", "Poison"],
      ["Fat Bottomed Girls", "Queen"],
      ["Feel Like Making Love", "Bad Company"],
      ["Flowers", "Miley Cyrus"],
      ["Free Bird", "Lynyrd Skynyrd"],
      ["Friday I’m in Love", "The Cure"],
      ["Gimme All Your Lovin’", "ZZ Top"],
      ["Go with the Flow", "Queens Of The Stone Age"],
      ["Good Riddance", "Green Day"],
      ["Hard to Handle", "The Black Crowes"],
      ["Have You Ever Seen the Rain", "CCR"],
      ["Here Without You", "Three Doors Down"],
      ["Hey Jude", "The Beatles"],
      ["Highway to Hell", "AC/DC"],
      ["Home Sweet Home", "Mötley Crüe"],
      ["Hotel California", "The Eagles"],
      ["House of the Rising Sun", "The Animals"],
      ["How You Remind Me", "Nickelback"]
    ]
  },
  {
    title: "I – L",
    openByDefault: true,
    order: 4,
    songs: [
      ["I See Fire", "Ed Sheeran"],
      ["I Want to Break Free", "Queen"],
      ["I Will Survive", "Gloria Gaynor"],
      ["Imagine", "John Lennon"],
      ["In the Summertime", "Mungo Jerry"],
      ["Ironic", "Alanis Morissette"],
      ["It’s My Life", "Bon Jovi"],
      ["Johnny B Goode", "Chuck Berry"],
      ["Jolene", "Dolly Parton"],
      ["Knockin’ on Heaven’s Door", "Dylan / Guns N’ Roses"],
      ["Kryptonite", "Three Doors Down"],
      ["La Bamba", "Ritchie Valens"],
      ["La Grange", "ZZ Top"],
      ["Learn to Fly", "Foo Fighters"],
      ["Legs", "ZZ Top"],
      ["Let It Be", "The Beatles"],
      ["Let Me Entertain You", "Robbie Williams"],
      ["Lithium", "Nirvana"],
      ["Live Forever", "Oasis"],
      ["Livin’ on a Prayer", "Bon Jovi"],
      ["Losing My Religion", "R.E.M."],
      ["Love Me Do", "The Beatles"]
    ]
  },
  {
    title: "M – P",
    openByDefault: true,
    order: 5,
    songs: [
      ["Man On the Moon", "R.E.M."],
      ["Mr Brightside", "The Killers"],
      ["Mustang Sally", "Wilson Pickett"],
      ["My Girl", "The Temptations"],
      ["Nobody’s Wife", "Anouk"],
      ["Old Town Road", "Lil Nas X & Billy R. Cyrus"],
      ["One", "U2"],
      ["Otherside", "Red Hot Chili Peppers"],
      ["Paint It Black", "The Rolling Stones"],
      ["Paranoid", "Black Sabbath"],
      ["Penny Arcade", "Roy Orbison"],
      ["People Are Strange", "The Doors"],
      ["Personal Jesus", "Depeche Mode"],
      ["Pretty Woman", "Roy Orbison"],
      ["Proud Mary", "CCR"],
      ["Psycho Killer", "Talking Heads"],
      ["Purple Rain", "Prince"]
    ]
  },
  {
    title: "R – S",
    openByDefault: true,
    order: 6,
    songs: [
      ["Rebel Rebel", "David Bowie"],
      ["Rebel Yell", "Billy Idol"],
      ["Red Red Wine", "UB40"],
      ["Ring of Fire", "Johnny Cash"],
      ["Roadhouse Blues", "The Doors"],
      ["Rockin’ in the Free World", "Neil Young"],
      ["Ruby", "Kaiser Chiefs"],
      ["Runaway Train", "Soul Asylum"],
      ["Satisfaction (I Can’t Get No)", "The Rolling Stones"],
      ["Save Tonight", "Eagle-Eye Cherry"],
      ["Scientist, The", "Coldplay"],
      ["Self Esteem", "The Offspring"],
      ["Seven Nation Army", "The White Stripes"],
      ["Sex on Fire", "Kings of Leon"],
      ["Sharp Dressed Man", "ZZ Top"],
      ["Should I Stay or Should I Go", "The Clash"],
      ["Simple Man", "Lynyrd Skynyrd"],
      ["Sing", "Travis"],
      ["Smells Like Teen Spirit", "Nirvana"],
      ["Smoke on the Water", "Deep Purple"],
      ["So Far Away", "Dire Straits"],
      ["Somebody Told Me", "The Killers"],
      ["Stand by Me", "Ben E. King"],
      ["Stand by Me", "Oasis"],
      ["Summer of ‘69", "Bryan Adams"],
      ["Sunshine of Your Love", "Cream"],
      ["Sweet Caroline", "Neil Diamond"],
      ["Sweet Child O’ Mine", "Guns N’ Roses"],
      ["Sweet Home Alabama", "Lynyrd Skynyrd"]
    ]
  },
  {
    title: "T – Z",
    openByDefault: true,
    order: 7,
    songs: [
      ["Tainted Love", "Soft Cell"],
      ["Take Me Home, Country Roads", "John Denver"],
      ["Teenage Dirtbag", "Wheatus"],
      ["The Chain", "Fleetwood Mac"],
      ["The Man Who Sold the World", "David Bowie / Nirvana"],
      ["These Boots Are Made for Walking", "Nancy Sinatra"],
      ["Three Little Birds", "Bob Marley"],
      ["Two out of Three Ain’t Bad", "Meatloaf"],
      ["Under Pressure", "Queen"],
      ["Under the Bridge", "Red Hot Chili Peppers"],
      ["Valerie", "The Zutons / Amy Winehouse"],
      ["What a Wonderful World", "Louis Armstrong"],
      ["What’s Up", "4 Non Blondes"],
      ["Where Is My Mind", "The Pixies"],
      ["Wherever You Will Go", "The Calling"],
      ["Whiskey in the Jar", "Thin Lizzy / Metallica"],
      ["White Wedding", "Billy Idol"],
      ["Whole Lotta Rosie", "AC/DC"],
      ["Wicked Game", "H.I.M. / Chris Isaak"],
      ["Wild Thing", "The Troggs"],
      ["Wind of Change", "Scorpions"],
      ["Wish You Were Here", "Pink Floyd"],
      ["With or Without You", "U2"],
      ["Wonderful Tonight", "Eric Clapton"],
      ["Wonderwall", "Oasis"],
      ["Word Up", "Cameo / Korn"],
      ["Xemx", "The Tramps"],
      ["Yellow", "Coldplay"],
      ["You Sexy Thing", "Hot Chocolate"],
      ["You Spin Me Round", "Dead or Alive"],
      ["Zombie", "The Cranberries"]
    ]
  }
];

/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function sortSectionsClient() {
  sections.sort((a, b) => {
    const orderA = Number(a.order || 0);
    const orderB = Number(b.order || 0);

    if (orderA !== orderB) return orderA - orderB;

    return String(a.title || "").localeCompare(String(b.title || ""), undefined, {
      sensitivity: "base"
    });
  });
}

function sortSongsClient(list) {
  return [...list].sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""), undefined, {
      sensitivity: "base"
    })
  );
}

function getTotalSeedSongs() {
  return OLD_PUBLIC_SECTIONS.reduce((sum, section) => sum + section.songs.length, 0);
}

/* =========================================================
   FIRESTORE LOADERS
   IMPORTANT: no orderBy here, so Firestore does NOT need composite indexes.
========================================================= */

async function ensureMainList() {
  const ref = db.collection("songlists").doc(MAIN_LIST_ID);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      name: "Venue Main Public Song List",
      publicName: "Venue Main Public Song List",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  const fresh = await ref.get();
  currentList = { id: fresh.id, ...fresh.data() };
  return currentList;
}

async function loadSections() {
  const snap = await db
    .collection("songlistSections")
    .where("listId", "==", MAIN_LIST_ID)
    .get();

  sections = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  sortSectionsClient();
}

async function loadSongs() {
  const snap = await db
    .collection("songlistSongs")
    .where("listId", "==", MAIN_LIST_ID)
    .get();

  songs = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  songs = sortSongsClient(songs);
}

async function reloadAll() {
  await ensureMainList();
  await loadSections();
  await loadSongs();
}

/* =========================================================
   PUBLIC PAGE
========================================================= */

async function initPublicSongList() {
  try {
    await reloadAll();

    const listTitle = document.getElementById("listTitle");
    if (listTitle) {
      listTitle.innerText =
        currentList.publicName ||
        currentList.name ||
        "Venue Main Public Song List";
    }

    renderPublicSongList();

    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", renderPublicSongList);
    }
  } catch (error) {
    console.error(error);
    showPageError("Could not load the public song list. Check Firestore read permissions.");
  }
}

function renderPublicSongList() {
  const container = document.getElementById("publicSongList");
  if (!container) return;

  const search = normalizeText(document.getElementById("searchInput")?.value || "");
  container.innerHTML = "";

  const visibleSongs = songs.filter(song => {
    if (song.visible === false) return false;

    const haystack = normalizeText(`${song.title || ""} ${song.artist || ""}`);
    return !search || haystack.includes(search);
  });

  let renderedAny = false;

  sections.forEach(section => {
    const sectionSongs = sortSongsClient(
      visibleSongs.filter(song => song.sectionId === section.id)
    );

    if (!sectionSongs.length && search) return;

    renderPublicSection(
      container,
      section.title || "Songs",
      sectionSongs,
      section.openByDefault !== false
    );

    renderedAny = true;
  });

  const mainSongs = sortSongsClient(
    visibleSongs.filter(song => !song.sectionId || song.sectionId === "main")
  );

  if (mainSongs.length) {
    renderPublicSection(container, "Songs", mainSongs, true);
    renderedAny = true;
  }

  if (!renderedAny) {
    container.innerHTML = `<div class="empty-message">No songs found.</div>`;
  }
}

function renderPublicSection(container, titleText, sectionSongs, openByDefault) {
  const sectionBox = document.createElement("section");
  sectionBox.className = "song-section public-section";

  const grid = document.createElement("div");
  grid.className = "song-section-grid";

  const box = document.createElement("div");
  box.className = "song-section-box";

  const title = document.createElement("h2");
  title.className = "public-section-title";
  title.style.cursor = "pointer";

  const songWrap = document.createElement("ol");
  songWrap.className = "public-section-songs";
  songWrap.style.display = openByDefault ? "block" : "none";

  function updateTitle() {
    const isOpen = songWrap.style.display !== "none";
    title.innerText = isOpen
      ? `${titleText} ▲ (Click to Hide)`
      : `${titleText} ▼ (Click to View)`;
  }

  title.onclick = () => {
    const isOpen = songWrap.style.display !== "none";
    songWrap.style.display = isOpen ? "none" : "block";
    updateTitle();
  };

  updateTitle();

  sectionSongs.forEach(song => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="song-info">
        <span>${escapeHTML(song.title)}</span>
        <em>${escapeHTML(song.artist)}</em>
      </div>
    `;
    songWrap.appendChild(li);
  });

  box.appendChild(title);
  box.appendChild(songWrap);
  grid.appendChild(box);
  sectionBox.appendChild(grid);
  container.appendChild(sectionBox);
}

/* =========================================================
   EDITOR PAGE
========================================================= */

async function initEditor() {
  try {
    await reloadAll();

    const listNameInput = document.getElementById("listNameInput");
    if (listNameInput) {
      listNameInput.value =
        currentList.publicName ||
        currentList.name ||
        "Venue Main Public Song List";
    }

    renderSectionDropdown();
    renderEditorSongList();
  } catch (error) {
    console.error(error);
    showPageError("Could not load editor data. Check Firestore permissions.");
  }
}

function renderSectionDropdown() {
  const select = document.getElementById("songSectionSelect");
  if (!select) return;

  select.innerHTML = `<option value="main">No Section / Main Songs</option>`;

  sections.forEach(section => {
    const opt = document.createElement("option");
    opt.value = section.id;
    opt.textContent = section.title || "Untitled Section";
    select.appendChild(opt);
  });
}

function renderEditorSongList() {
  const container = document.getElementById("editorSongList");
  if (!container) return;

  container.innerHTML = "";

  const total = document.createElement("div");
  total.className = "editor-count";
  total.innerText = `Total songs: ${songs.length}`;
  container.appendChild(total);

  sections.forEach(section => {
    const sectionSongs = sortSongsClient(
      songs.filter(song => song.sectionId === section.id)
    );

    const box = document.createElement("div");
    box.className = "editor-section";

    box.innerHTML = `
      <div class="editor-section-head">
        <strong>${escapeHTML(section.title)}</strong>
        <span>${section.openByDefault !== false ? "Open by default" : "Closed by default"}</span>
        <button type="button" onclick="toggleSectionDefault('${section.id}', ${section.openByDefault !== false ? "false" : "true"})">
          ${section.openByDefault !== false ? "Set Closed" : "Set Open"}
        </button>
        <button type="button" onclick="deleteSection('${section.id}')">Delete Section</button>
      </div>
    `;

    if (!sectionSongs.length) {
      const empty = document.createElement("div");
      empty.className = "editor-empty";
      empty.innerText = "No songs in this section.";
      box.appendChild(empty);
    }

    sectionSongs.forEach(song => {
      box.appendChild(createEditorSongRow(song));
    });

    container.appendChild(box);
  });

  const mainSongs = sortSongsClient(
    songs.filter(song => !song.sectionId || song.sectionId === "main")
  );

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
    <div class="editor-song-info">
      <strong>${escapeHTML(song.title)}</strong>
      <span>${escapeHTML(song.artist)}</span>
    </div>

    <button type="button" onclick="toggleSongVisible('${song.id}', ${song.visible === false ? "true" : "false"})">
      ${song.visible === false ? "Show" : "Hide"}
    </button>

    <button type="button" onclick="deleteSong('${song.id}')">Delete</button>
  `;

  return row;
}

async function saveListSettings() {
  try {
    const input = document.getElementById("listNameInput");
    const name = input ? input.value.trim() : "";

    await db.collection("songlists").doc(MAIN_LIST_ID).set({
      name: name || "Venue Main Public Song List",
      publicName: name || "Venue Main Public Song List",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await initEditor();
    alert("List settings saved.");
  } catch (error) {
    console.error(error);
    alert("Could not save list settings. Check Firestore write permissions.");
  }
}

async function addSection() {
  try {
    const titleInput = document.getElementById("sectionTitleInput");
    const openInput = document.getElementById("sectionOpenInput");

    const title = titleInput ? titleInput.value.trim() : "";
    const openByDefault = openInput ? openInput.checked : true;

    if (!title) {
      alert("Enter a section title.");
      return;
    }

    await db.collection("songlistSections").add({
      listId: MAIN_LIST_ID,
      title,
      openByDefault,
      order: sections.length + 1,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    titleInput.value = "";
    await initEditor();
  } catch (error) {
    console.error(error);
    alert("Could not add section. Check Firestore write permissions.");
  }
}

async function addSong() {
  try {
    const titleInput = document.getElementById("songTitleInput");
    const artistInput = document.getElementById("songArtistInput");
    const sectionSelect = document.getElementById("songSectionSelect");

    const title = titleInput ? titleInput.value.trim() : "";
    const artist = artistInput ? artistInput.value.trim() : "";
    const sectionId = sectionSelect ? sectionSelect.value || "main" : "main";

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
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    titleInput.value = "";
    artistInput.value = "";

    await initEditor();
  } catch (error) {
    console.error(error);
    alert("Could not add song. Check Firestore write permissions.");
  }
}

async function toggleSongVisible(songId, visible) {
  try {
    await db.collection("songlistSongs").doc(songId).set({
      visible,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await initEditor();
  } catch (error) {
    console.error(error);
    alert("Could not update song visibility.");
  }
}

async function deleteSong(songId) {
  try {
    if (!confirm("Delete this song?")) return;

    await db.collection("songlistSongs").doc(songId).delete();
    await initEditor();
  } catch (error) {
    console.error(error);
    alert("Could not delete song.");
  }
}

async function toggleSectionDefault(sectionId, openByDefault) {
  try {
    await db.collection("songlistSections").doc(sectionId).set({
      openByDefault,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await initEditor();
  } catch (error) {
    console.error(error);
    alert("Could not update section.");
  }
}

async function deleteSection(sectionId) {
  try {
    if (!confirm("Delete this section? Songs inside it will move to Main Songs.")) return;

    await db.collection("songlistSections").doc(sectionId).delete();

    const affectedSongs = songs.filter(song => song.sectionId === sectionId);

    for (const song of affectedSongs) {
      await db.collection("songlistSongs").doc(song.id).set({
        sectionId: "main",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    await initEditor();
  } catch (error) {
    console.error(error);
    alert("Could not delete section.");
  }
}

/* =========================================================
   SEED FULL OLD PUBLIC LIST
========================================================= */

async function seedFromOldPublicSongList() {
  try {
    const totalSeedSongs = getTotalSeedSongs();

    const ok = confirm(
      `Seed the public song list with the old full list?\n\nThis will seed ${totalSeedSongs} songs.`
    );

    if (!ok) return;

    await reloadAll();

    if (songs.length > 0 || sections.length > 0) {
      const replaceOk = confirm(
        `This public list already has ${songs.length} songs and ${sections.length} sections.\n\nDelete them and reseed the old full list?`
      );

      if (!replaceOk) return;

      await deleteExistingPublicListData();
    }

    const sectionIdByTitle = {};

    for (const section of OLD_PUBLIC_SECTIONS) {
      const sectionRef = await db.collection("songlistSections").add({
        listId: MAIN_LIST_ID,
        title: section.title,
        openByDefault: section.openByDefault,
        order: section.order,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      sectionIdByTitle[section.title] = sectionRef.id;

      for (const [title, artist] of section.songs) {
        await db.collection("songlistSongs").add({
          listId: MAIN_LIST_ID,
          title,
          artist,
          sectionId: sectionRef.id,
          visible: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    await initEditor();
    alert(`Seed complete. Added ${totalSeedSongs} songs in ${OLD_PUBLIC_SECTIONS.length} sections.`);
  } catch (error) {
    console.error(error);
    alert("Seed failed. Check Firestore write permissions.");
  }
}

async function deleteExistingPublicListData() {
  await loadSongs();
  await loadSections();

  for (const song of songs) {
    await db.collection("songlistSongs").doc(song.id).delete();
  }

  for (const section of sections) {
    await db.collection("songlistSections").doc(section.id).delete();
  }

  songs = [];
  sections = [];
}

/* =========================================================
   ERROR DISPLAY
========================================================= */

function showPageError(message) {
  const possibleContainers = [
    document.getElementById("publicSongList"),
    document.getElementById("editorSongList"),
    document.body
  ];

  const container = possibleContainers.find(Boolean);
  if (!container) return;

  const box = document.createElement("div");
  box.className = "page-error";
  box.innerText = message;

  container.prepend(box);
}

/* =========================================================
   AUTO INIT
========================================================= */

window.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.page === "editor") {
    initEditor();
  }

  if (document.body.dataset.page === "public-songlist") {
    initPublicSongList();
  }
});