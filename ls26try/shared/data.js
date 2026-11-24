/* Copyright © 2026 LiveSuite. All rights reserved.
 * Bounded, project/user-scoped reference-data cache. No polling or writes.
 * Live session/request/run-order documents always use their existing listeners.
 */
(() => {
  'use strict';
  const dataScriptUrl=document.currentScript?.src||location.href;
  const pending=new Map(),memory=new Map(),versions=new Map(),invalidations=new Map(),TTL=15*60*1000;
  let authReady=null;
  const scope=()=>firebase.app().options.projectId+':'+(firebase.auth?.().currentUser?.uid||'host');
  const key=name=>'ls26:cache:'+scope()+':'+name;
  function waitForAuth(){
    const auth=firebase.auth?.();
    if(!auth||auth.currentUser||!auth.onAuthStateChanged)return Promise.resolve();
    if(!authReady)authReady=new Promise(resolve=>{
      let off;const done=()=>{resolve();queueMicrotask(()=>off?.());};
      off=auth.onAuthStateChanged(done,done);
    });
    return authReady;
  }
  function pack(value){if(value?.toMillis)return{__lsTimestamp:value.toMillis()};if(Array.isArray(value))return value.map(pack);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v)]));return value;}
  function unpack(value){if(value?.__lsTimestamp!==undefined)return firebase.firestore.Timestamp.fromMillis(value.__lsTimestamp);if(Array.isArray(value))return value.map(unpack);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unpack(v)]));return value;}
  const snapshot=rows=>({docs:rows.map(row=>({id:row.id,data:()=>unpack(row.data)})),size:rows.length});
  // Compact large reference collections without changing their data or TTL.
  // Browsers without compression retain the previous JSON cache format.
  async function encode(entry){
    const json=JSON.stringify(entry);
    if(json.length<65536||typeof CompressionStream!=='function'||typeof DecompressionStream!=='function')return json;
    try{
      const stream=new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
      let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
      const compressed='gzip:'+btoa(binary);
      return compressed.length<json.length?compressed:json;
    }catch(_){return json;}
  }
  async function decode(raw){
    if(!raw)return null;
    if(!raw.startsWith('gzip:'))return JSON.parse(raw);
    const bytes=Uint8Array.from(atob(raw.slice(5)),c=>c.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  const fresh=entry=>entry&&Array.isArray(entry.rows)&&Date.now()-entry.at<TTL;
  async function collection(name,force=false){
    if(!['lyrics','lyricsSetlists','upcomingEvents'].includes(name))throw Error('Cache not permitted for live data');
    await waitForAuth();await invalidations.get(name);
    const k=key(name),version=versions.get(name)||0;
    if(pending.has(k))return pending.get(k);
    const work=(async()=>{
      if(!force){
        const entry=memory.get(k);if(fresh(entry))return snapshot(entry.rows);
        try{const cached=await decode(sessionStorage.getItem(k));if(fresh(cached)&&(versions.get(name)||0)===version){memory.set(k,cached);return snapshot(cached.rows);}}catch(_){}
      }
      const result=await(window.db||window.LK.db).collection(name).get();
      const entry={at:Date.now(),rows:result.docs.map(doc=>({id:doc.id,data:pack(doc.data())}))};
      if((versions.get(name)||0)===version){
        memory.set(k,entry);
        try{const encoded=await encode(entry);if((versions.get(name)||0)===version)sessionStorage.setItem(k,encoded);}catch(error){console.warn('LiveSuite reference cache could not be stored:',name,error?.name||error);}
      }
      return result;
    })();
    pending.set(k,work);
    try{return await work;}finally{if(pending.get(k)===work)pending.delete(k);}
  }
  function invalidate(name){
    versions.set(name,(versions.get(name)||0)+1);
    const clear=()=>{const k=key(name);memory.delete(k);pending.delete(k);try{sessionStorage.removeItem(k);}catch(_){}};
    try{clear();}catch(_){}
    const task=waitForAuth().then(clear).catch(()=>{});
    invalidations.set(name,task);task.finally(()=>{if(invalidations.get(name)===task)invalidations.delete(name);});
  }
  window.LS26Data={collection,invalidate};
  function loadSharedHelper(src,id){if(document.getElementById(id))return;const script=document.createElement('script');script.id=id;script.src=new URL(src,dataScriptUrl).href;script.async=false;document.body.appendChild(script);}
  function loadFocusedHelpers(){
    const path=String(location.pathname||'');
    if(window.firebase?.auth&&firebase.apps?.length)loadSharedHelper('public-catalogue-publisher.js?v=20261124-read-cache-v1','ls26PublicCataloguePublisherLoader');
    if(document.getElementById('topStatusContainer')){loadSharedHelper('manual-request.js?v=20261006-manual-request-v2','ls26ManualRequestLoader');loadSharedHelper('manual-request-button-layout.js?v=20261006-manual-request-layout-v1','ls26ManualRequestLayoutLoader');}
    if(/\/admin-new\/performance-sessions\.html$/i.test(path))loadSharedHelper('session-history-fixes.js?v=20261006-request-history-fix-v1','ls26SessionHistoryFixLoader');
    // LyricView receives the helper here; Singer Screen loads it directly so it
    // is available before the first Guitaroke render without a duplicate fetch.
    if(/\/host\/lyricview\.html$/i.test(path))loadSharedHelper('chord-beat-labels.js?v=20261007-singer-suite-v4','ls26ChordBeatLabelsLoader');
  }
  if(document.readyState==='complete')loadFocusedHelpers();else window.addEventListener('load',loadFocusedHelpers,{once:true});
})();
