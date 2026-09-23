/* LiveSuite user-facing appearance/settings layer. */
(() => {
  "use strict";
  const STORAGE_KEY = "ls26:appSettings:v1";
  const DOC_PATH = ["noteSettings","livesuiteAppSettings"];
  const DEFAULTS = Object.freeze({
    showTopStatusWhenInactive: true,
    statusValueFontSize: 22,
    statusLabelFontSize: 11,
    userBpmColor: "#00e88a",
    originalBpmColor: "#00cafa",
    keyColor: "#00cafa",
    capoColor: "#ffdb58",
    lyricNavVerticalSize: 96,
    lyricNavHorizontalSize: 72,
    lyricTextScale: 100,
    libraryRowHeight: 62,
    reduceGlow: false
  });

  function clamp(value,min,max,fallback){
    const n=Number(value);
    return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
  }
  function colour(value,fallback){
    const s=String(value||"").trim();
    return /^#[0-9a-f]{6}$/i.test(s)?s:fallback;
  }
  function normalise(raw={}){
    return {
      showTopStatusWhenInactive: raw.showTopStatusWhenInactive !== false,
      statusValueFontSize: clamp(raw.statusValueFontSize,14,34,DEFAULTS.statusValueFontSize),
      statusLabelFontSize: clamp(raw.statusLabelFontSize,8,18,DEFAULTS.statusLabelFontSize),
      userBpmColor: colour(raw.userBpmColor,DEFAULTS.userBpmColor),
      originalBpmColor: colour(raw.originalBpmColor,DEFAULTS.originalBpmColor),
      keyColor: colour(raw.keyColor,DEFAULTS.keyColor),
      capoColor: colour(raw.capoColor,DEFAULTS.capoColor),
      lyricNavVerticalSize: clamp(raw.lyricNavVerticalSize,58,140,DEFAULTS.lyricNavVerticalSize),
      lyricNavHorizontalSize: clamp(raw.lyricNavHorizontalSize,52,120,DEFAULTS.lyricNavHorizontalSize),
      lyricTextScale: clamp(raw.lyricTextScale,75,150,DEFAULTS.lyricTextScale),
      libraryRowHeight: clamp(raw.libraryRowHeight,48,92,DEFAULTS.libraryRowHeight),
      reduceGlow: raw.reduceGlow === true
    };
  }
  function readLocal(){
    try{return normalise({...DEFAULTS,...JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")});}
    catch(_){return {...DEFAULTS};}
  }
  function writeLocal(settings){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));}catch(_){}
  }
  function apply(settings){
    const s=normalise(settings);
    const root=document.documentElement;
    root.style.setProperty("--ls26-status-value-size",s.statusValueFontSize+"px");
    root.style.setProperty("--ls26-status-label-size",s.statusLabelFontSize+"px");
    root.style.setProperty("--ls26-user-bpm-color",s.userBpmColor);
    root.style.setProperty("--ls26-original-bpm-color",s.originalBpmColor);
    root.style.setProperty("--ls26-key-color",s.keyColor);
    root.style.setProperty("--ls26-capo-color",s.capoColor);
    root.style.setProperty("--ls26-nav-vertical-size",s.lyricNavVerticalSize+"px");
    root.style.setProperty("--ls26-nav-horizontal-size",s.lyricNavHorizontalSize+"px");
    root.style.setProperty("--ls26-lyric-text-scale",String(s.lyricTextScale/100));
    root.style.setProperty("--ls26-library-row-height",s.libraryRowHeight+"px");
    root.classList.toggle("ls26-hide-inactive-status",!s.showTopStatusWhenInactive);
    root.classList.toggle("ls26-reduce-glow",s.reduceGlow);
    window.dispatchEvent(new CustomEvent("ls26:settings-applied",{detail:{...s}}));
    return s;
  }
  let current=apply(readLocal());

  async function loadRemote(){
    const db=window.db||window.LK?.db||window.firebase?.firestore?.();
    if(!db)return current;
    try{
      const snap=await db.collection(DOC_PATH[0]).doc(DOC_PATH[1]).get();
      if(snap.exists){
        current=apply({...current,...(snap.data()||{})});
        writeLocal(current);
      }
    }catch(error){console.warn("LiveSuite settings remote load skipped:",error);}
    return current;
  }
  async function syncRemoteOncePerSession(force=false){
    const syncKey="ls26:appSettings:remoteSynced";
    try{
      if(!force && sessionStorage.getItem(syncKey)==="1")return {...current};
    }catch(_){}
    const db=window.db||window.LK?.db||window.firebase?.firestore?.();
    if(!db)return {...current};
    const loaded=await loadRemote();
    try{sessionStorage.setItem(syncKey,"1");}catch(_){}
    return loaded;
  }
  async function save(next){
    current=apply({...current,...next});
    writeLocal(current);
    const db=window.db||window.LK?.db||window.firebase?.firestore?.();
    if(db){
      await db.collection(DOC_PATH[0]).doc(DOC_PATH[1]).set({
        ...current,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
      try{sessionStorage.setItem("ls26:appSettings:remoteSynced","1");}catch(_){}
    }
    return {...current};
  }
  function reset(){current=apply({...DEFAULTS});writeLocal(current);return {...current};}
  window.LS26Settings={DEFAULTS,get:()=>({...current}),normalise,apply,loadRemote,syncRemoteOncePerSession,save,reset};

  // Sync once per browser session, not once per page. This keeps settings
  // portable between devices without generating repeated Firestore reads.
  const sync=()=>syncRemoteOncePerSession(false).catch(error=>console.warn("LiveSuite settings sync skipped:",error));
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(sync,0));
  else setTimeout(sync,0);
})();
