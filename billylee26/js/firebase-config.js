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

  function wrapCollection(ref, name){
    if (name !== "publicSongRequests") return ref;
    return new Proxy(ref, {
      get(target, prop){
        if (prop === "add") return data => secureCreate(data);
        if (prop === "doc") return id => wrapRequestDocument(id === undefined ? target.doc() : target.doc(id));
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
