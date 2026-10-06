/* Copyright © 2026 LiveSuite. All rights reserved.
 * Bounded, project/user-scoped reference-data cache. No polling or writes.
 * Live session/request/run-order documents always use their existing listeners.
 */
(() => {
  'use strict';
  const pagePath=String(location.pathname||'');
  if (/\/host\/karaoke-lyric-view\.html$/i.test(pagePath)) {
    try { window.__ls26SingerSavedGuidance = localStorage.getItem('karaokeGuidanceMode') || 'normal'; } catch (_) { window.__ls26SingerSavedGuidance='normal'; }
  }

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

  // Focused page helpers are loaded after the existing page has initialised so
  // they can extend, rather than replace, the established LiveSuite behaviour.
  function loadPageHelper(src, id) {
    if (document.getElementById(id)) return;
    const script=document.createElement('script');
    script.id=id;
    script.src=new URL(src,location.href).href;
    script.async=false;
    document.body.appendChild(script);
  }
  function loadFocusedHelpers() {
    const path=String(location.pathname||'');
    if (/\/host\/lyricscreator\.html$/i.test(path)) {
      loadPageHelper('js/inline-note-editor-v4.js?v=20261006-inline-note-editor-v4','ls26InlineNoteEditorV4Loader');
    } else if (/\/host\/karaoke-lyric-view\.html$/i.test(path)) {
      loadPageHelper('js/singer-screen-upgrades.js?v=20261006-singer-screen-v2','ls26SingerScreenV2Loader');
    } else if (/\/host\/lyricview\.html$/i.test(path)) {
      loadPageHelper('js/lyricview-singer-bridge.js?v=20261006-singer-bridge-v2','ls26SingerBridgeV2Loader');
    }
  }
  if (document.readyState === 'complete') loadFocusedHelpers();
  else window.addEventListener('load', loadFocusedHelpers, {once:true});
})();
