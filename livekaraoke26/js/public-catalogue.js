/* Public repertoire: the admin-selected Lyrics Suite setlist and its lyrics IDs. */
(() => {
  "use strict";

  async function load(db) {
    if(window.LK_PUBLIC_CATALOGUE_V1?.["live-karaoke"])return LKPublicCatalogue.load(db,"live-karaoke");
    const control = db.collection("karaokeControl");
    const [listSnap, settingsSnap, sessionSnap] = await Promise.all([
      control.doc("publicSongList").get(),
      control.doc("liveKaraokeWebsiteSettings").get(),
      control.doc("currentSession").get()
    ]);
    const data = snap => snap.exists ? (snap.data() || {}) : {};
    const list = data(listSnap), settings = data(settingsSnap), session = data(sessionSnap);
    const active = session.active === true && !!(session.sessionId || session.activeSessionId);
    const setlistId = String((active ? list.setlistId : settings.defaultBrowseSetlistId) || list.setlistId || "").trim();

    if (setlistId) {
      const snapshot = await db.collection("lyricsSetlists").doc(setlistId).get();
      if (!snapshot.exists) throw new Error(`Public setlist ${setlistId} does not exist.`);
      const setlist = { ...snapshot.data(), id:snapshot.id };
      const ids = [...new Set((Array.isArray(setlist.songIds) ? setlist.songIds : []).map(String))];
      const chunks = [];
      for (let i=0; i<ids.length; i+=10) chunks.push(ids.slice(i,i+10));
      const groups = await Promise.all(chunks.map(chunk => db.collection("lyrics")
        .where(firebase.firestore.FieldPath.documentId(), "in", chunk).get()));
      const byId = new Map();
      groups.forEach(group => group.docs.forEach(doc => byId.set(doc.id, { ...doc.data(), id:doc.id })));
      const missingIds = ids.filter(id => !byId.has(id));
      if (missingIds.length) console.warn("Public setlist references missing lyrics", missingIds);
      const songs = ids.map(id => byId.get(id)).filter(Boolean);
      return { songs, setlist, diagnostics:{source:"lyricsSetlists + lyrics",setlistId,selectedIds:ids.length,loadedSongs:songs.length,missingIds} };
    }

    // Same legacy policy as /list/: only used when admin has not selected a setlist.
    // Read failures never silently switch to a different or shipped catalogue.
    const snapshot = await db.collection("lyrics").get();
    const songs = snapshot.docs.map(doc => ({ ...doc.data(), id:doc.id }))
      .filter(song => song.title && song.publicSongListVisible !== false);
    return { songs, setlist:null, diagnostics:{source:"lyrics (no public setlist configured)",setlistId:"",loadedSongs:songs.length} };
  }

  window.LiveKaraokeCatalogue = { load };
})();
