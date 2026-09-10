/* Copyright © 2026 LiveSuite. All rights reserved.
 * Bounded, project/user-scoped reference-data cache. No polling or writes.
 * Live session/request/run-order documents always use their existing listeners.
 */
(() => {
  'use strict';
  const pending = new Map();
  const TTL = 15 * 60 * 1000;
  const scope = () => `${firebase.app().options.projectId}:${firebase.auth?.().currentUser?.uid || 'host'}`;
  const key = name => `ls26:cache:${scope()}:${name}`;
  function pack(value) {
    if (value?.toMillis) return {__lsTimestamp:value.toMillis()};
    if (Array.isArray(value)) return value.map(pack);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v)]));
    return value;
  }
  function unpack(value) {
    if (value?.__lsTimestamp !== undefined) return firebase.firestore.Timestamp.fromMillis(value.__lsTimestamp);
    if (Array.isArray(value)) return value.map(unpack);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unpack(v)]));
    return value;
  }
  const snapshot = rows => ({docs:rows.map(row=>({id:row.id,data:()=>unpack(row.data)})), size:rows.length});
  async function collection(name, force=false) {
    if (!['lyrics','lyricsSetlists','upcomingEvents'].includes(name)) throw Error('Cache not permitted for live data');
    const k=key(name);
    if (pending.has(k)) return pending.get(k);
    if (!force) {
      try { const cached=JSON.parse(sessionStorage.getItem(k)); if(cached && Date.now()-cached.at<TTL) return snapshot(cached.rows); } catch (_) {}
    }
    const work=(async()=>{
      const result=await (window.db||window.LK.db).collection(name).get();
      try { sessionStorage.setItem(k,JSON.stringify({at:Date.now(),rows:result.docs.map(d=>({id:d.id,data:pack(d.data())}))})); } catch (_) { /* Storage full: live result remains usable. */ }
      return result;
    })();
    pending.set(k,work);
    try { return await work; } finally { pending.delete(k); }
  }
  function invalidate(name) { try {sessionStorage.removeItem(key(name));}catch(_){} }
  window.LS26Data={collection,invalidate};
})();
