(function(){
  "use strict";

  const firebaseConfig = window.SITE_FIREBASE_CONFIG;

  if (!firebaseConfig) {
    console.error("Billy Lee Firebase configuration is unavailable. Check db/currentdb.js.");
    return;
  }

  window.BILLYLEE_FIREBASE_CONFIG = firebaseConfig;

  if (!window.firebase) {
    console.error("Firebase SDK has not loaded.");
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  const rawDb = firebase.firestore();
  const cryptoApi = window.crypto || window.msCrypto;
  const storage = window.localStorage;
  const prefix = "ls26.publicRequestCapability.";
  const PUBLIC_BROWSE_SETLIST_ID = "__live-karaoke-public-browse__";
  const PUBLIC_SONGLIST_ID = "venue-main-public-song-list";
  let publicBrowseSongsPromise = null;

  function tokenKey(requestId){
    return prefix + String(requestId || "");
  }

  function makeToken(){
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") return "";
    const bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  }

  function rememberToken(requestId, token){
    try { storage.setItem(tokenKey(requestId), token); } catch (_) {}
  }

  function readToken(requestId){
    try { return String(storage.getItem(tokenKey(requestId)) || ""); }
    catch (_) { return ""; }
  }

  async function secureCreate(data){
    const token = makeToken();
    if (!token) return rawDb.collection("publicSongRequests").add(data);

    const requestRef = rawDb.collection("publicSongRequests").doc();
    const proofRef = rawDb.collection("publicSongRequestOwners").doc(requestRef.id);
    const stamp = firebase.firestore.FieldValue.serverTimestamp();
    const batch = rawDb.batch();
    batch.set(requestRef, data || {});
    batch.set(proofRef, { token, createdAt: stamp, proofAt: stamp });
    await batch.commit();
    rememberToken(requestRef.id, token);
    return requestRef;
  }

  function secureSet(ref, data, options, originalSet){
    const token = readToken(ref.id);
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return options === undefined
        ? originalSet.call(ref, data)
        : originalSet.call(ref, data, options);
    }

    const proofRef = rawDb.collection("publicSongRequestOwners").doc(ref.id);
    const batch = rawDb.batch();
    if (options === undefined) batch.set(ref, data || {});
    else batch.set(ref, data || {}, options);
    batch.set(proofRef, {
      token,
      proofAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
    return batch.commit();
  }

  function bind(target, prop){
    const value = target[prop];
    return typeof value === "function" ? value.bind(target) : value;
  }

  function sessionIdFrom(data){
    return String(data?.sessionId || data?.activeSessionId || "").trim();
  }

  function sessionTypeFrom(data){
    return String(data?.sessionType || data?.type || data?.eventSnapshot?.type || "").trim().toLowerCase();
  }

  async function liveKaraokeSessionActive(){
    try {
      const snap = await rawDb.collection("karaokeControl").doc("currentSession").get();
      const data = snap.exists ? (snap.data() || {}) : {};
      const sessionId = sessionIdFrom(data);
      if (data.active !== true || !sessionId) return false;

      let type = sessionTypeFrom(data);
      if (!type) {
        const sessionSnap = await rawDb.collection("performanceSessions").doc(sessionId).get();
        type = sessionSnap.exists ? sessionTypeFrom(sessionSnap.data() || {}) : "";
      }
      return type === "live karaoke";
    } catch (error) {
      console.warn("Could not resolve Live Karaoke session state for public browsing", error);
      return false;
    }
  }

  function idFromSongSource(source, fallbackId){
    const direct = String(source?.lyricsId || source?.songId || source?.id || "").trim();
    if (direct) return direct;
    const url = String(source?.url || "");
    const match = url.match(/[?&]id=([^&#]+)/i);
    if (match?.[1]) {
      try { return decodeURIComponent(match[1]).trim(); }
      catch (_) { return match[1].trim(); }
    }
    return String(fallbackId || "").trim();
  }

  function normalisePublicSong(data, fallbackId){
    const source = data || {};
    return {
      ...source,
      id:idFromSongSource(source, fallbackId),
      title:String(source.title || source.songTitle || "").trim(),
      artist:source.artist || source.songArtist || "",
      year:source.year || "",
      publicSongListVisible:source.publicSongListVisible !== false,
      visible:source.visible !== false
    };
  }

  function dedupePublicSongs(rows){
    const map = new Map();
    rows.forEach(song => {
      const id = String(song?.id || "").trim();
      if (!id || !song?.title || song.visible === false || song.publicSongListVisible === false) return;
      if (!map.has(id)) map.set(id, song);
    });
    return [...map.values()].sort((a,b) =>
      String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity:"base" })
    );
  }

  function staticBrowseSongs(){
    const source = Array.isArray(window.songs) ? window.songs : [];
    return dedupePublicSongs(source.map((song,index) => normalisePublicSong(song, `static-${index + 1}`)));
  }

  async function publicBrowseSongs(){
    if (publicBrowseSongsPromise) return publicBrowseSongsPromise;

    publicBrowseSongsPromise = (async () => {
      // Primary source: the visitor-facing catalogue already used by the public
      // song-list page. This avoids rebuilding the list through lyricsSetlists.
      try {
        const publicSnap = await rawDb.collection("songlistSongs")
          .where("listId", "==", PUBLIC_SONGLIST_ID)
          .get();
        const publicRows = dedupePublicSongs(
          publicSnap.docs.map(doc => normalisePublicSong({ id:doc.id, ...(doc.data() || {}) }, doc.id))
        );
        if (publicRows.length) return publicRows;
      } catch (error) {
        console.warn("Public song-list catalogue unavailable; trying lyrics fallback", error);
      }

      // Secondary source: public lyrics documents.
      try {
        const lyricsSnap = await rawDb.collection("lyrics").get();
        const lyricRows = dedupePublicSongs(
          lyricsSnap.docs.map(doc => normalisePublicSong({ id:doc.id, ...(doc.data() || {}) }, doc.id))
        );
        if (lyricRows.length) return lyricRows;
      } catch (error) {
        console.warn("Public lyrics catalogue unavailable; using shipped song fallback", error);
      }

      // Last-resort source: the shipped karaoke catalogue loaded by request.html.
      // This keeps browsing usable even if public Firestore reads are unavailable.
      return staticBrowseSongs();
    })().catch(error => {
      publicBrowseSongsPromise = null;
      throw error;
    });

    return publicBrowseSongsPromise;
  }

  function syntheticSnapshot(id, data, originalRef){
    return {
      exists:true,
      id,
      ref:originalRef,
      data:() => ({ ...(data || {}) })
    };
  }

  function syntheticQuerySnapshot(rows){
    const docs = rows.map(song => syntheticSnapshot(
      String(song.id || ""),
      song,
      rawDb.collection("lyrics").doc(String(song.id || ""))
    ));
    return {
      docs,
      empty:docs.length === 0,
      size:docs.length,
      forEach(callback){ docs.forEach(callback); }
    };
  }

  function wrapRequestDocument(ref){
    return new Proxy(ref, {
      get(target, prop){
        if (prop === "set") {
          const originalSet = target.set;
          return (data, options) => secureSet(target, data, options, originalSet);
        }
        return bind(target, prop);
      }
    });
  }

  function wrapControlDocument(ref, id){
    if (id !== "publicSongList") return ref;
    return new Proxy(ref, {
      get(target, prop){
        if (prop === "get") {
          return async () => {
            // Active sessions keep the real configured LiveSuite public setlist.
            if (await liveKaraokeSessionActive()) return target.get();

            let original = null;
            try {
              original = await target.get();
            } catch (error) {
              console.warn("Public song-list control unavailable; using browse catalogue directly", error);
            }

            const publicSongs = await publicBrowseSongs();
            if (publicSongs.length) {
              const originalData = original?.exists ? (original.data() || {}) : {};
              return syntheticSnapshot(original?.id || "publicSongList", {
                ...originalData,
                setlistId:PUBLIC_BROWSE_SETLIST_ID,
                setlistName:"Live Karaoke Public Song List"
              }, original?.ref || target);
            }

            if (original) return original;
            return syntheticSnapshot("publicSongList", { setlistId:"", setlistName:"" }, target);
          };
        }
        return bind(target, prop);
      }
    });
  }

  function wrapSetlistDocument(ref, id){
    if (id !== PUBLIC_BROWSE_SETLIST_ID) return ref;
    return new Proxy(ref, {
      get(target, prop){
        if (prop === "get") {
          return async () => {
            const publicSongs = await publicBrowseSongs();
            return syntheticSnapshot(PUBLIC_BROWSE_SETLIST_ID, {
              name:"Live Karaoke Public Song List",
              songIds:publicSongs.map(song => song.id)
            }, target);
          };
        }
        return bind(target, prop);
      }
    });
  }

  function wrapLyricsQuery(query, requestedIds){
    return new Proxy(query, {
      get(target, prop){
        if (prop === "get") {
          return async () => {
            if (await liveKaraokeSessionActive()) return target.get();

            try {
              const wanted = new Set((requestedIds || []).map(String));
              const rows = (await publicBrowseSongs()).filter(song => wanted.has(String(song.id || "")));
              return syntheticQuerySnapshot(rows);
            } catch (error) {
              console.warn("Could not satisfy public song lookup from browse catalogue", error);
              return target.get();
            }
          };
        }
        return bind(target, prop);
      }
    });
  }

  function wrapLyricsCollection(ref){
    return new Proxy(ref, {
      get(target, prop){
        if (prop === "where") {
          return (fieldPath, operator, value) => {
            const query = target.where(fieldPath, operator, value);
            if (operator === "in" && Array.isArray(value)) return wrapLyricsQuery(query, value);
            return query;
          };
        }
        return bind(target, prop);
      }
    });
  }

  function wrapCollection(ref, name){
    if (name === "lyrics") return wrapLyricsCollection(ref);

    return new Proxy(ref, {
      get(target, prop){
        if (prop === "add" && name === "publicSongRequests") return data => secureCreate(data);
        if (prop === "doc") {
          return id => {
            const docRef = id === undefined ? target.doc() : target.doc(id);
            if (name === "publicSongRequests") return wrapRequestDocument(docRef);
            if (name === "karaokeControl") return wrapControlDocument(docRef, String(id || ""));
            if (name === "lyricsSetlists") return wrapSetlistDocument(docRef, String(id || ""));
            return docRef;
          };
        }
        return bind(target, prop);
      }
    });
  }

  window.BillyLeeDB = new Proxy(rawDb, {
    get(target, prop){
      if (prop === "collection") return name => wrapCollection(target.collection(name), name);
      return bind(target, prop);
    }
  });
})();