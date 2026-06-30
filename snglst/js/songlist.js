const MAIN_LIST_ID = "venue-main-public-song-list";
const LISTS_COLLECTION = "songlists";
const SECTIONS_COLLECTION = "songlistSections";

let editorSections = [];

function normaliseText(str) {
  return String(str || "")
    .trim()
    .replace(/\s+/g, " ");
}

function makeSong(title = "", artist = "") {
  return {
    title: normaliseText(title),
    artist: normaliseText(artist)
  };
}

function sortSongs(songs) {
  return [...songs].sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""), undefined, {
      sensitivity: "base"
    })
  );
}

function isFeaturedSection(section) {
  return section.type === "featured";
}

async function ensureMainList() {
  const ref = db.collection(LISTS_COLLECTION).doc(MAIN_LIST_ID);
  const doc = await ref.get();

  if (!doc.exists) {
    await ref.set({
      name: "Venue Main Public Song List",
      slug: MAIN_LIST_ID,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  return ref;
}

/* ========================= PUBLIC PAGE ========================= */

async function initPublicSongList() {
  await ensureMainList();

  db.collection("songlistSections")
  .where("listId", "==", MAIN_LIST_ID)

      renderPublicSongList(sections);
    }, error => {
      console.error(error);
      document.getElementById("publicListContent").innerHTML =
        `<p class="loading-message">Could not load song list.</p>`;
    });
}

function renderPublicSongList(sections) {
  const content = document.getElementById("publicListContent");

  const featured = sections.filter(s => s.type === "featured");
  const songSections = sections.filter(s => s.type !== "featured");

  let html = "";

  if (featured.length) {
    html += `<section class="featured"><div class="featured-grid">`;

    featured.forEach(section => {
      const isClosed = section.collapsed === true;

      html += `
        <div class="featured-box">
          <h2 class="collapsible-title" onclick="togglePublicSection(this)">
            ${escapeHTML(section.title || "Featured")}
            <span>${isClosed ? "▼ (Click to View)" : "▲ (Click to Hide)"}</span>
          </h2>

          <ul class="collapsible-body ${isClosed ? "hidden-section" : ""}">
            ${(section.songs || []).map(song => `
              <li>
                <strong>${escapeHTML(song.title)}</strong>
                <span>${escapeHTML(song.artist)}</span>
              </li>
            `).join("")}
          </ul>
        </div>
      `;
    });

    html += `</div></section>`;
  }

  html += `
    <section class="song-list-title">
      <h1>★ SONG LIST ★</h1>
    </section>
  `;

  let songNumber = 1;

  songSections.forEach(section => {
    const songs = section.songs || [];
    const isClosed = section.collapsed === true;

    html += `
      <section class="song-section">
        <div class="song-section-grid">
          <div class="song-section-box">
            <h2 class="collapsible-title" onclick="togglePublicSection(this)">
              ${escapeHTML(section.title || "SONGS")}
              <span>${isClosed ? "▼ (Click to View)" : "▲ (Click to Hide)"}</span>
            </h2>

            <ol start="${songNumber}" class="collapsible-body ${isClosed ? "hidden-section" : ""}">
              ${songs.map(song => `
                <li>
                  <div class="song-info">
                    <span>${escapeHTML(song.title)}</span>
                    <em>${escapeHTML(song.artist)}</em>
                  </div>
                </li>
              `).join("")}
            </ol>
          </div>
        </div>
      </section>
    `;

    songNumber += songs.length;
  });

  content.innerHTML = html;
}

function togglePublicSection(titleEl) {
  const body = titleEl.parentElement.querySelector(".collapsible-body");
  const label = titleEl.querySelector("span");

  if (!body) return;

  const isHidden = body.classList.toggle("hidden-section");
  label.innerText = isHidden ? "▼ (Click to View)" : "▲ (Click to Hide)";
}

/* ========================= EDITOR ========================= */

async function initEditor() {
  await ensureMainList();

  await loadEditorData();
}


async function loadEditorData() {
  const listDoc = await db.collection(LISTS_COLLECTION).doc(MAIN_LIST_ID).get();

  if (listDoc.exists) {
    const data = listDoc.data();

    const listNameInput = document.getElementById("listNameInput");
    if (listNameInput) {
      listNameInput.value = data.name || "Venue Main Public Song List";
    }
  }

  const snap = await db.collection(SECTIONS_COLLECTION)
    .where("listId", "==", MAIN_LIST_ID)
    .orderBy("order", "asc")
    .get();

  editorSections = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  renderEditor();
}

function renderEditor() {
  const wrap = document.getElementById("sectionEditorList");

  wrap.innerHTML = editorSections.map((section, sectionIndex) => `
    <div class="editor-section-card">
      <div class="editor-section-head">
        <input
          value="${escapeAttr(section.title || "")}"
          onchange="editorSections[${sectionIndex}].title = this.value"
        >

        <select onchange="editorSections[${sectionIndex}].type = this.value">
          <option value="featured" ${section.type === "featured" ? "selected" : ""}>Featured</option>
          <option value="songs" ${section.type !== "featured" ? "selected" : ""}>Song Section</option>
        </select>

        <label>
          <input
            type="checkbox"
            ${section.collapsed ? "checked" : ""}
            onchange="editorSections[${sectionIndex}].collapsed = this.checked"
          >
          Closed by default
        </label>

        <button onclick="moveEditorSection(${sectionIndex}, -1)">▲</button>
        <button onclick="moveEditorSection(${sectionIndex}, 1)">▼</button>
        <button onclick="deleteEditorSection(${sectionIndex})">Delete</button>
      </div>

      <div class="editor-song-rows">
        ${(section.songs || []).map((song, songIndex) => `
          <div class="editor-song-row">
            <input
              placeholder="Song title"
              value="${escapeAttr(song.title || "")}"
              onchange="editorSections[${sectionIndex}].songs[${songIndex}].title = this.value"
            >

            <input
              placeholder="Artist"
              value="${escapeAttr(song.artist || "")}"
              onchange="editorSections[${sectionIndex}].songs[${songIndex}].artist = this.value"
            >

            <button onclick="moveEditorSong(${sectionIndex}, ${songIndex}, -1)">▲</button>
            <button onclick="moveEditorSong(${sectionIndex}, ${songIndex}, 1)">▼</button>
            <button onclick="deleteEditorSong(${sectionIndex}, ${songIndex})">✕</button>
          </div>
        `).join("")}
      </div>

      <button class="editor-btn small" onclick="addEditorSong(${sectionIndex})">+ Add Song</button>
    </div>
  `).join("");
}



function addEditorSong(sectionIndex) {
  if (!Array.isArray(editorSections[sectionIndex].songs)) {
    editorSections[sectionIndex].songs = [];
  }

  editorSections[sectionIndex].songs.push(makeSong());
  renderEditor();
}

function deleteEditorSong(sectionIndex, songIndex) {
  editorSections[sectionIndex].songs.splice(songIndex, 1);
  renderEditor();
}

function moveEditorSong(sectionIndex, songIndex, direction) {
  const songs = editorSections[sectionIndex].songs;
  const newIndex = songIndex + direction;

  if (newIndex < 0 || newIndex >= songs.length) return;

  const temp = songs[songIndex];
  songs[songIndex] = songs[newIndex];
  songs[newIndex] = temp;

  renderEditor();
}

function moveEditorSection(index, direction) {
  const newIndex = index + direction;

  if (newIndex < 0 || newIndex >= editorSections.length) return;

  const temp = editorSections[index];
  editorSections[index] = editorSections[newIndex];
  editorSections[newIndex] = temp;

  renderEditor();
}

function deleteEditorSection(index) {
  if (!confirm("Delete this section?")) return;

  editorSections.splice(index, 1);
  renderEditor();
}


async function saveEditorSongList() {
  const listName =
    document.getElementById("listNameInput")?.value.trim() ||
    "Venue Main Public Song List";

  await db.collection(LISTS_COLLECTION).doc(MAIN_LIST_ID).set({
    name: listName,
    slug: MAIN_LIST_ID,
    isDefault: true,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const oldSnap = await db.collection(SECTIONS_COLLECTION)
    .where("listId", "==", MAIN_LIST_ID)
    .get();

  const batch = db.batch();

  oldSnap.forEach(doc => {
    batch.delete(doc.ref);
  });

  editorSections.forEach((section, index) => {
    const ref = db.collection(SECTIONS_COLLECTION).doc();

    const songs = section.type !== "featured"
      ? sortSongs(section.songs || [])
      : (section.songs || []);

    batch.set(ref, {
      listId: MAIN_LIST_ID,
      title: section.title || "Untitled Section",
      type: section.type || "songs",
      collapsed: section.collapsed === true,
      songs,
      order: index,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();

  await loadEditorData();
}


/* ========================= SEED OLD LIST ========================= */

async function seedFromOldPublicSongList() {
  if (!confirm("Replace the Venue Main Public Song List with the old public song list data?")) {
    return;
  }

  editorSections = JSON.parse(JSON.stringify(OLD_PUBLIC_SONG_LIST_SECTIONS));
  await saveEditorSongList();

  alert("Seed complete. All old public song list songs were imported.");
}

const OLD_PUBLIC_SONG_LIST_SECTIONS = [
  {
    type: "featured",
    title: "★ MOST POPULAR SONGS",
    collapsed: false,
    songs: [
      makeSong("Mr. Brightside", "The Killers"),
      makeSong("Paint It Black", "The Rolling Stones"),
      makeSong("Wonderwall", "Oasis"),
      makeSong("Pretty Woman", "Roy Orbison"),
      makeSong("Zombie", "The Cranberries"),
      makeSong("Valerie", "Amy Winehouse"),
      makeSong("Creep", "Radiohead"),
      makeSong("What’s Up", "4 Non Blondes"),
      makeSong("I Will Survive", "Gloria Gaynor"),
      makeSong("Hotel California", "The Eagles")
    ]
  },
  {
    type: "featured",
    title: "🔥 PARTY ANTHEMS",
    collapsed: false,
    songs: [
      makeSong("Sweet Home Alabama", "Lynyrd Skynyrd"),
      makeSong("Sex on Fire", "Kings of Leon"),
      makeSong("Seven Nation Army", "The White Stripes"),
      makeSong("Summer of ’69", "Bryan Adams"),
      makeSong("Born to Be Wild", "Steppenwolf")
    ]
  },
  {
    type: "featured",
    title: "♥ EASY TO SING",
    collapsed: false,
    songs: [
      makeSong("Stand by Me", "Ben E. King"),
      makeSong("Three Little Birds", "Bob Marley"),
      makeSong("Let It Be", "The Beatles"),
      makeSong("Chasing Cars", "Snow Patrol"),
      makeSong("Ring of Fire", "Johnny Cash")
    ]
  },
  {
    type: "songs",
    title: "A – B",
    collapsed: false,
    songs: [
      makeSong("Ain’t No Sunshine", "Bill Withers"),
      makeSong("All Along the Watchtower", "Jimi Hendrix"),
      makeSong("All Summer Long", "Kid Rock"),
      makeSong("All the Small Things", "Blink-182"),
      makeSong("Angels", "Robbie Williams"),
      makeSong("Angie", "The Rolling Stones"),
      makeSong("Another Brick in the Wall (part 2)", "Pink Floyd"),
      makeSong("Another One Bites the Dust", "Queen"),
      makeSong("Bad Moon Rising", "CCR"),
      makeSong("Bad Romance", "Lady Gaga"),
      makeSong("Basket Case", "Green Day"),
      makeSong("Beds Are Burning", "Midnight Oil"),
      makeSong("Behind Blue Eyes", "The Who"),
      makeSong("Bella Ciao", "Misc. – unknown"),
      makeSong("Big Me", "Foo Fighters"),
      makeSong("Bittersweet Symphony", "The Verve"),
      makeSong("Bohemian Like You", "The Dandy Warhols"),
      makeSong("Born to Be Wild", "Steppenwolf"),
      makeSong("Boulevard of Broken Dreams", "Green Day"),
      makeSong("Breakfast at Tiffany’s", "Deep Blue Something")
    ]
  },
  {
    type: "songs",
    title: "C – D",
    collapsed: false,
    songs: [
      makeSong("Californication", "Red Hot Chili Peppers"),
      makeSong("Call Me the Breeze", "Lynyrd Skynyrd"),
      makeSong("Can’t Get Enough", "Bad Company"),
      makeSong("Can’t Take My Eyes Off You", "Frankie Valli / Muse"),
      makeSong("Changes", "Black Sabbath"),
      makeSong("Chasing Cars", "Snow Patrol"),
      makeSong("Clocks", "Coldplay"),
      makeSong("Cocaine", "Eric Clapton"),
      makeSong("Come as You Are", "Nirvana"),
      makeSong("Come Together", "The Beatles"),
      makeSong("Could You Be Loved", "Bob Marley"),
      makeSong("Crazy Little Thing Called Love", "Queen"),
      makeSong("Creep", "Radiohead"),
      makeSong("Dakota", "Stereophonics"),
      makeSong("Dani California", "Red Hot Chili Peppers"),
      makeSong("Do I Wanna Know", "Arctic Monkeys"),
      makeSong("Don’t Look Back in Anger", "Oasis"),
      makeSong("Don’t Stop Me Now", "Queen"),
      makeSong("Down Under", "Men At Work"),
      makeSong("Dreams", "Fleetwood Mac"),
      makeSong("Drive", "Incubus"),
      makeSong("Drops of Jupiter", "Train")
    ]
  },
  {
    type: "songs",
    title: "E – H",
    collapsed: false,
    songs: [
      makeSong("Every Breath You Take", "The Police"),
      makeSong("Every Rose Has Its Thorn", "Poison"),
      makeSong("Fat Bottomed Girls", "Queen"),
      makeSong("Feel Like Making Love", "Bad Company"),
      makeSong("Flowers", "Miley Cyrus"),
      makeSong("Free Bird", "Lynyrd Skynyrd"),
      makeSong("Friday I’m in Love", "The Cure"),
      makeSong("Gimme All Your Lovin’", "ZZ Top"),
      makeSong("Go with the Flow", "Queens Of The Stone Age"),
      makeSong("Good Riddance", "Green Day"),
      makeSong("Hard to Handle", "The Black Crowes"),
      makeSong("Have You Ever Seen the Rain", "CCR"),
      makeSong("Here Without You", "Three Doors Down"),
      makeSong("Hey Jude", "The Beatles"),
      makeSong("Highway to Hell", "AC/DC"),
      makeSong("Home Sweet Home", "Mötley Crüe"),
      makeSong("Hotel California", "The Eagles"),
      makeSong("House of the Rising Sun", "The Animals"),
      makeSong("How You Remind Me", "Nickelback")
    ]
  },
  {
    type: "songs",
    title: "I – L",
    collapsed: false,
    songs: [
      makeSong("I See Fire", "Ed Sheeran"),
      makeSong("I Want to Break Free", "Queen"),
      makeSong("I Will Survive", "Gloria Gaynor"),
      makeSong("Imagine", "John Lennon"),
      makeSong("In the Summertime", "Mungo Jerry"),
      makeSong("Ironic", "Alanis Morissette"),
      makeSong("It’s My Life", "Bon Jovi"),
      makeSong("Johnny B Goode", "Chuck Berry"),
      makeSong("Jolene", "Dolly Parton"),
      makeSong("Knockin’ on Heaven’s Door", "Dylan / Guns N’ Roses"),
      makeSong("Kryptonite", "Three Doors Down"),
      makeSong("La Bamba", "Ritchie Valens"),
      makeSong("La Grange", "ZZ Top"),
      makeSong("Learn to Fly", "Foo Fighters"),
      makeSong("Legs", "ZZ Top"),
      makeSong("Let It Be", "The Beatles"),
      makeSong("Let Me Entertain You", "Robbie Williams"),
      makeSong("Lithium", "Nirvana"),
      makeSong("Live Forever", "Oasis"),
      makeSong("Livin’ on a Prayer", "Bon Jovi"),
      makeSong("Losing My Religion", "R.E.M."),
      makeSong("Love Me Do", "The Beatles")
    ]
  },
  {
    type: "songs",
    title: "M – P",
    collapsed: false,
    songs: [
      makeSong("Man On the Moon", "R.E.M."),
      makeSong("Mr Brightside", "The Killers"),
      makeSong("Mustang Sally", "Wilson Pickett"),
      makeSong("My Girl", "The Temptations"),
      makeSong("Nobody’s Wife", "Anouk"),
      makeSong("Old Town Road", "Lil Nas X & Billy R. Cyrus"),
      makeSong("One", "U2"),
      makeSong("Otherside", "Red Hot Chili Peppers"),
      makeSong("Paint It Black", "The Rolling Stones"),
      makeSong("Paranoid", "Black Sabbath"),
      makeSong("Penny Arcade", "Roy Orbison"),
      makeSong("People Are Strange", "The Doors"),
      makeSong("Personal Jesus", "Depeche Mode"),
      makeSong("Pretty Woman", "Roy Orbison"),
      makeSong("Proud Mary", "CCR"),
      makeSong("Psycho Killer", "Talking Heads"),
      makeSong("Purple Rain", "Prince")
    ]
  },
  {
    type: "songs",
    title: "R – S",
    collapsed: false,
    songs: [
      makeSong("Rebel Rebel", "David Bowie"),
      makeSong("Rebel Yell", "Billy Idol"),
      makeSong("Red Red Wine", "UB40"),
      makeSong("Ring of Fire", "Johnny Cash"),
      makeSong("Roadhouse Blues", "The Doors"),
      makeSong("Rockin’ in the Free World", "Neil Young"),
      makeSong("Ruby", "Kaiser Chiefs"),
      makeSong("Runaway Train", "Soul Asylum"),
      makeSong("Satisfaction (I Can’t Get No)", "The Rolling Stones"),
      makeSong("Save Tonight", "Eagle-Eye Cherry"),
      makeSong("Scientist, The", "Coldplay"),
      makeSong("Self Esteem", "The Offspring"),
      makeSong("Seven Nation Army", "The White Stripes"),
      makeSong("Sex on Fire", "Kings of Leon"),
      makeSong("Sharp Dressed Man", "ZZ Top"),
      makeSong("Should I Stay or Should I Go", "The Clash"),
      makeSong("Simple Man", "Lynyrd Skynyrd"),
      makeSong("Sing", "Travis"),
      makeSong("Smells Like Teen Spirit", "Nirvana"),
      makeSong("Smoke on the Water", "Deep Purple"),
      makeSong("So Far Away", "Dire Straits"),
      makeSong("Somebody Told Me", "The Killers"),
      makeSong("Stand by Me", "Ben E. King"),
      makeSong("Stand by Me", "Oasis"),
      makeSong("Summer of ‘69", "Bryan Adams"),
      makeSong("Sunshine of Your Love", "Cream"),
      makeSong("Sweet Caroline", "Neil Diamond"),
      makeSong("Sweet Child O’ Mine", "Guns N’ Roses"),
      makeSong("Sweet Home Alabama", "Lynyrd Skynyrd")
    ]
  },
  {
    type: "songs",
    title: "T – Z",
    collapsed: false,
    songs: [
      makeSong("Tainted Love", "Soft Cell"),
      makeSong("Take Me Home, Country Roads", "John Denver"),
      makeSong("Teenage Dirtbag", "Wheatus"),
      makeSong("The Chain", "Fleetwood Mac"),
      makeSong("The Man Who Sold the World", "David Bowie / Nirvana"),
      makeSong("These Boots Are Made for Walking", "Nancy Sinatra"),
      makeSong("Three Little Birds", "Bob Marley"),
      makeSong("Two out of Three Ain’t Bad", "Meatloaf"),
      makeSong("Under Pressure", "Queen"),
      makeSong("Under the Bridge", "Red Hot Chili Peppers"),
      makeSong("Valerie", "The Zutons / Amy Winehouse"),
      makeSong("What a Wonderful World", "Louis Armstrong"),
      makeSong("What’s Up", "4 Non Blondes"),
      makeSong("Where Is My Mind", "The Pixies"),
      makeSong("Wherever You Will Go", "The Calling"),
      makeSong("Whiskey in the Jar", "Thin Lizzy / Metallica"),
      makeSong("White Wedding", "Billy Idol"),
      makeSong("Whole Lotta Rosie", "AC/DC"),
      makeSong("Wicked Game", "H.I.M. / Chris Isaak"),
      makeSong("Wild Thing", "The Troggs"),
      makeSong("Wind of Change", "Scorpions"),
      makeSong("Wish You Were Here", "Pink Floyd"),
      makeSong("With or Without You", "U2"),
      makeSong("Wonderful Tonight", "Eric Clapton"),
      makeSong("Wonderwall", "Oasis"),
      makeSong("Word Up", "Cameo / Korn"),
      makeSong("Xemx", "The Tramps"),
      makeSong("Yellow", "Coldplay"),
      makeSong("You Sexy Thing", "Hot Chocolate"),
      makeSong("You Spin Me Round", "Dead or Alive"),
      makeSong("Zombie", "The Cranberries")
    ]
  }
];

/* ========================= HELPERS ========================= */

function escapeHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return escapeHTML(str).replace(/"/g, "&quot;");
}


async function seedVenueMainList() {
  if (!confirm("This will delete the current Venue Main Public Song List and seed it from scratch. Continue?")) {
    return;
  }

  editorSections = JSON.parse(JSON.stringify(OLD_PUBLIC_SONG_LIST_SECTIONS));

  await saveEditorSongList();

  alert("Venue Main Public Song List seeded from scratch.");
}