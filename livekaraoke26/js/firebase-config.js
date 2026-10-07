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
  const CAPABILITY_PREFIX = "ls26.publicRequestCapability.";

  function randomCapability(){
    const cryptoApi = window.crypto || window.msCrypto;
    if(!cryptoApi || !cryptoApi.getRandomValues){
      throw new Error("Secure request capability generation is unavailable.");
    }
    const bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2,"0")).join("");
  }

  function capabilityKey(requestId){
    return CAPABILITY_PREFIX + String(requestId || "");
  }

  function rememberCapability(requestId, token){
    try{ localStorage.setItem(capabilityKey(requestId), token); }catch(_){}
  }

  function requestCapability(requestId){
    try{ return String(localStorage.getItem(capabilityKey(requestId)) || ""); }
    catch(_){ return ""; }
  }

  async function secureRequestCreate(data){
    const requestRef = rawDb.collection("publicSongRequests").doc();
    const proofRef = rawDb.collection("publicSongRequestOwners").doc(requestRef.id);
    const token = randomCapability();
    const stamp = firebase.firestore.FieldValue.serverTimestamp();
    const batch = rawDb.batch();

    batch.set(requestRef, data || {});
    batch.set(proofRef, {
      token,
      createdAt: stamp,
      proofAt: stamp
    });

    await batch.commit();
    rememberCapability(requestRef.id, token);
    return requestRef;
  }

  function secureRequestSet(ref, data, options, originalSet){
    const token = requestCapability(ref.id);

    // Requests created before the security cut-over have no private capability.
    // The server-side legacy transition rule decides whether their narrow
    // note/cancel update is still allowed.
    if(!/^[a-f0-9]{64}$/.test(token)){
      return options === undefined
        ? originalSet.call(ref, data)
        : originalSet.call(ref, data, options);
    }

    const proofRef = rawDb.collection("publicSongRequestOwners").doc(ref.id);
    const batch = rawDb.batch();

    if(options === undefined) batch.set(ref, data || {});
    else batch.set(ref, data || {}, options);

    batch.set(proofRef, {
      token,
      proofAt: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});

    return batch.commit();
  }

  function bound(target, prop){
    const value = target[prop];
    return typeof value === "function" ? value.bind(target) : value;
  }

  function wrapRequestDocument(ref){
    return new Proxy(ref, {
      get(target, prop){
        if(prop === "set"){
          const originalSet = target.set;
          return (data, options) => secureRequestSet(target, data, options, originalSet);
        }
        return bound(target, prop);
      }
    });
  }

  function wrapCollection(ref, name){
    if(name !== "publicSongRequests") return ref;

    return new Proxy(ref, {
      get(target, prop){
        if(prop === "add") return data => secureRequestCreate(data);
        if(prop === "doc"){
          return id => wrapRequestDocument(id === undefined ? target.doc() : target.doc(id));
        }
        return bound(target, prop);
      }
    });
  }

  window.BillyLeeDB = new Proxy(rawDb, {
    get(target, prop){
      if(prop === "collection") return name => wrapCollection(target.collection(name), name);
      return bound(target, prop);
    }
  });
})();
