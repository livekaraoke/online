(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const fields=[
    "showTopStatusWhenInactive","statusValueFontSize","statusLabelFontSize",
    "userBpmColor","originalBpmColor","keyColor","capoColor",
    "displayColourRed","displayColourCyan","displayColourBlue","displayColourGreen",
    "displayColourMagenta","displayColourYellow","displayColourBlack","displayColourWhite",
    "displayColourOrange","displayColourGray","displayColourLightGray","displayColourBrightPurple",
    "lyricSongValueFontSize","lyricSectionHeaderSize","lyricPauseCountdownFontSize","lyricPauseCountdownColor",
    "lyricNavVerticalSize","lyricNavHorizontalSize","lyricTextScale",
    "lyricNavHorizontalGap","lyricNavVerticalGap",
    "lyricNavIdleOpacity","lyricNavActiveOpacity","lyricNavPressedOpacity","lyricNavFeedbackDuration",
    "chordLineSpaceAbove","chordLineSpaceBelow",
    "lyricLeadInHeight","lyricSectionActivationOffset",
    "karaokeSingerActivePosition",
    "lyricPastSectionOpacity","lyricUpcomingSectionOpacity","lyricUpcomingFadeDistance","lyricPreviousFadeDistance",
    "lyricSectionFocusDuringPlayback","lyricSectionFocusWhenStopped",
    "chordFollowCurrentColor","chordStartHereColor","improvCountdownColor",
    "metronomeBeat1Color","metronomeBeat2Color","metronomeBeat3Color","metronomeBeat4Color",
    "metronomeFlashBrightness","metronomeEdgeThickness","metronomeFlashDuration",
    "metronomeShowBeatNumber","metronomeNumberSize","metronomeNumberOpacity","metronomeNumberVerticalPosition",
    "libraryRowHeight","appVersion","reduceGlow"
  ];
  const requestLifecycleRef=()=>window.LK?.db?.collection("noteSettings")?.doc("livesuiteAppSettings");

  function setupAccordions(){
    document.querySelectorAll('.settings-card').forEach(card=>{
      const button=card.querySelector(':scope>h2 .settings-card-toggle');
      if(!button||button.dataset.bound==='1')return;
      button.dataset.bound='1';
      card.classList.remove('is-open');
      card.classList.add('is-collapsed');
      button.setAttribute('aria-expanded','false');
      button.addEventListener('click',()=>{
        const open=!card.classList.contains('is-open');
        card.classList.toggle('is-open',open);
        card.classList.toggle('is-collapsed',!open);
        button.setAttribute('aria-expanded',String(open));
      });
    });
  }

  function put(settings){
    fields.forEach(id=>{
      const el=$(id); if(!el)return;
      if(el.type==="checkbox")el.checked=!!settings[id];
      else el.value=settings[id];
      const out=document.querySelector(`[data-output="${id}"]`);
      if(out){
        const units={
          lyricTextScale:"%",lyricNavIdleOpacity:"%",lyricNavActiveOpacity:"%",lyricNavPressedOpacity:"%",
          lyricPastSectionOpacity:"%",lyricUpcomingSectionOpacity:"%",lyricNavFeedbackDuration:"ms",
          karaokeSingerActivePosition:"%",
          metronomeFlashBrightness:"%",metronomeNumberOpacity:"%",
          metronomeNumberVerticalPosition:"%",metronomeFlashDuration:"ms"
        };
        out.value=el.value+(id.includes("Color")?"":units[id]||"px");
      }
    });
  }
  function collect(){
    const out={};
    fields.forEach(id=>{
      const el=$(id); if(!el)return;
      out[id]=el.type==="checkbox"?el.checked:(el.type==="number"||el.type==="range"?Number(el.value):el.value);
    });
    return out;
  }
  async function loadRequestLifecycleSetting(){
    const el=$("autoOpenRequestsOnSessionStart");
    if(!el)return;
    el.checked=true;
    try{
      const ref=requestLifecycleRef();
      if(!ref)return;
      const snap=await ref.get();
      if(snap.exists)el.checked=(snap.data()||{}).autoOpenRequestsOnSessionStart!==false;
    }catch(error){
      console.warn("Could not load request lifecycle settings",error);
    }
  }
  async function saveRequestLifecycleSetting(value){
    const ref=requestLifecycleRef();
    if(!ref)return;
    await ref.set({
      autoOpenRequestsOnSessionStart:value!==false,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
  }
  const VERSION_RE=/^\d\.\d\.\d{2}$/;
  function validVersion(report=false){
    const el=$("appVersion");
    if(!el)return true;
    const ok=VERSION_RE.test(String(el.value||"").trim());
    el.setCustomValidity(ok?"":"Use version format 0.0.00, for example 3.1.48.");
    if(report&&!ok)el.reportValidity();
    return ok;
  }
  function setStatus(text,state=""){
    const el=$("settingsStatus");
    if(!el)return;
    el.textContent=text;
    el.classList.toggle("is-unsaved",state==="unsaved");
    el.classList.toggle("is-error",state==="error");
  }
  function preview(){const s=LS26Settings.apply(collect());put(s);setStatus("Unsaved changes","unsaved");}

  document.addEventListener("DOMContentLoaded",async()=>{
    window.LK?.sidebar?.loadSidebar?.();
    setupAccordions();
    put(LS26Settings.get());
    try{put(await LS26Settings.syncRemoteOncePerSession(true));}catch(_){}
    await loadRequestLifecycleSetting();
    document.querySelectorAll("[data-setting]").forEach(el=>el.addEventListener("input",()=>{
      if(el.id==="appVersion"&&!validVersion(false)){
        setStatus("App version must use 0.0.00 format","error");
        return;
      }
      preview();
    }));
    $("autoOpenRequestsOnSessionStart")?.addEventListener("input",()=>setStatus("Unsaved changes","unsaved"));
    $("saveSettingsBtn").onclick=async()=>{
      if(!validVersion(true)){setStatus("App version must use 0.0.00 format","error");return;}
      const b=$("saveSettingsBtn");b.disabled=true;setStatus("Saving…");
      try{
        put(await LS26Settings.save(collect()));
        await saveRequestLifecycleSetting($("autoOpenRequestsOnSessionStart")?.checked!==false);
        setStatus("Settings saved");
      }
      catch(error){setStatus(error.message||"Could not save settings","error");}
      finally{b.disabled=false;}
    };
    $("resetSettingsBtn").onclick=async()=>{
      if(!await LS26Dialogs.confirm("Reset LiveSuite App Settings to their defaults?"))return;
      put(LS26Settings.reset());
      if($("autoOpenRequestsOnSessionStart"))$("autoOpenRequestsOnSessionStart").checked=true;
      await LS26Settings.save(LS26Settings.DEFAULTS);
      await saveRequestLifecycleSetting(true);
      setStatus("Defaults restored");
    };
  });
})();