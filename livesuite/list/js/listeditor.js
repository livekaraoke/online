(() => {
  "use strict";

  const CATEGORY_DEFS = [
    ["mostPopular", "MOST POPULAR"],
    ["partyAnthems", "PARTY ANTHEMS"],
    ["easyToSing", "EASY TO SING"],
    ["newAdditions", "NEW ADDITIONS"]
  ];

  const state = {
    setlistId:"",
    setlistName:"",
    songIds:[],
    songs:[],
    categories:{
      mostPopular:new Set(),
      partyAnthems:new Set(),
      easyToSing:new Set(),
      newAdditions:new Set()
    }
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  function setStatus(text, ok=false) {
    const el = $("leSaveStatus");
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? "#70df91" : "";
  }

  async function loadSelectedSetlist() {
    const config = await db.collection("karaokeControl").doc("publicSongList").get();
    const data = config.exists ? (config.data() || {}) : {};
    const setlistId = data.setlistId || "";

    if (!setlistId) {
      throw new Error("No Public Song List is selected in Admin.");
    }

    const snap = await db.collection("lyricsSetlists").doc(setlistId).get();
    if (!snap.exists) throw new Error("The selected public setlist no longer exists.");

    const setlist = snap.data() || {};
    state.setlistId = snap.id;
    state.setlistName = setlist.name || data.setlistName || "Untitled Setlist";
    state.songIds = Array.isArray(setlist.songIds) ? setlist.songIds : [];

    $("leSetlistName").textContent = state.setlistName;
    $("leSongCount").textContent = String(state.songIds.length);
  }

  async function loadSongs() {
    const chunks = [];
    for (let i=0;i<state.songIds.length;i+=10) chunks.push(state.songIds.slice(i,i+10));

    const result = [];
    for (const ids of chunks) {
      if (!ids.length) continue;
      const snap = await db.collection("lyrics")
        .where(firebase.firestore.FieldPath.documentId(),"in",ids)
        .get();
      snap.docs.forEach(doc => result.push({id:doc.id,...(doc.data()||{})}));
    }

    const order = new Map(state.songIds.map((id,index)=>[id,index]));
    state.songs = result.sort((a,b)=>(order.get(a.id)??99999)-(order.get(b.id)??99999));
  }

  async function loadCategories() {
    const snap = await db.collection("karaokeControl").doc("publicSongCategories").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const cfg = data.setlists?.[state.setlistId] || {};

    CATEGORY_DEFS.forEach(([key]) => {
      state.categories[key] = new Set(
        Array.isArray(cfg[key])
          ? cfg[key].filter(id => state.songIds.includes(id))
          : []
      );
    });
  }

  function render() {
    const query = ($("leSearchInput").value || "").trim().toLowerCase();
    const songs = state.songs.filter(song =>
      !query ||
      `${song.title||""} ${song.artist||""}`.toLowerCase().includes(query)
    );

    $("leSongRows").innerHTML = songs.length
      ? songs.map(song => `
        <div class="le-song-row" data-song-id="${esc(song.id)}">
          <div class="le-song-main">
            <strong>${esc(song.title || "Untitled Song")}</strong>
            <span>${esc(song.artist || "")}${song.year ? ` · ${esc(song.year)}` : ""}</span>
          </div>
          ${CATEGORY_DEFS.map(([key,label]) => `
            <label class="le-check" title="${esc(label)}">
              <input type="checkbox" data-category="${key}" data-song="${esc(song.id)}"
                ${state.categories[key].has(song.id) ? "checked" : ""}>
            </label>
          `).join("")}
        </div>
      `).join("")
      : `<div class="le-empty">No songs match your search.</div>`;
  }

  async function save() {
    setStatus("Saving…");

    const snap = await db.collection("karaokeControl").doc("publicSongCategories").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const setlists = {...(data.setlists || {})};

    setlists[state.setlistId] = {
      setlistName:state.setlistName,
      mostPopular:[...state.categories.mostPopular],
      partyAnthems:[...state.categories.partyAnthems],
      easyToSing:[...state.categories.easyToSing],
      newAdditions:[...state.categories.newAdditions],
      updatedAtMs:Date.now()
    };

    await db.collection("karaokeControl").doc("publicSongCategories").set({
      setlists,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});

    setStatus("Saved", true);
  }

  $("leSongRows").addEventListener("change", event => {
    const input = event.target.closest("input[data-category][data-song]");
    if (!input) return;

    const set = state.categories[input.dataset.category];
    if (!set) return;

    if (input.checked) set.add(input.dataset.song);
    else set.delete(input.dataset.song);

    setStatus("Unsaved changes");
  });

  $("leSearchInput").addEventListener("input", render);
  $("leSaveBtn").addEventListener("click", () => save().catch(error => {
    console.error(error);
    setStatus(error.message || "Save failed");
  }));

  (async () => {
    try {
      setStatus("Loading…");
      await loadSelectedSetlist();
      await loadSongs();
      await loadCategories();
      render();
      setStatus("Ready");
    } catch (error) {
      console.error(error);
      $("leSongRows").innerHTML = `<div class="le-empty">${esc(error.message)}</div>`;
      setStatus("Error");
    }
  })();
})();
