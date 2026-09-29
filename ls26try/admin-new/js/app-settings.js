(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const fields=[
    "showTopStatusWhenInactive","statusValueFontSize","statusLabelFontSize",
    "userBpmColor","originalBpmColor","keyColor","capoColor",
    "lyricSongValueFontSize","lyricSectionHeaderSize","lyricPauseCountdownFontSize",
    "lyricNavVerticalSize","lyricNavHorizontalSize","lyricTextScale",
    "lyricNavHorizontalGap","lyricNavVerticalGap",
    "lyricNavIdleOpacity","lyricNavActiveOpacity","lyricNavPressedOpacity","lyricNavFeedbackDuration",
    "lyricLeadInHeight","lyricSectionActivationOffset",
    "lyricPastSectionOpacity","lyricUpcomingSectionOpacity","lyricUpcomingFadeDistance","lyricPreviousFadeDistance",
    "lyricSectionFocusDuringPlayback","lyricSectionFocusWhenStopped",
    "metronomeBeat1Color","metronomeBeat2Color","metronomeBeat3Color","metronomeBeat4Color",
    "metronomeFlashBrightness","metronomeEdgeThickness","metronomeFlashDuration",
    "metronomeShowBeatNumber","metronomeNumberSize","metronomeNumberOpacity","metronomeNumberVerticalPosition",
    "libraryRowHeight","appVersion","reduceGlow"
  ];
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
    put(LS26Settings.get());
    try{put(await LS26Settings.syncRemoteOncePerSession(true));}catch(_){}
    document.querySelectorAll("[data-setting]").forEach(el=>el.addEventListener("input",()=>{
      if(el.id==="appVersion"){
        if(!validVersion(false)){
          setStatus("App version must use 0.0.00 format","error");
          return;
        }
      }
      preview();
    }));
    $("saveSettingsBtn").onclick=async()=>{
      if(!validVersion(true)){setStatus("App version must use 0.0.00 format","error");return;}
      const b=$("saveSettingsBtn");b.disabled=true;setStatus("Saving…");
      try{put(await LS26Settings.save(collect()));setStatus("Settings saved");}
      catch(error){setStatus(error.message||"Could not save settings","error");}
      finally{b.disabled=false;}
    };
    $("resetSettingsBtn").onclick=async()=>{
      if(!await LS26Dialogs.confirm("Reset LiveSuite App Settings to their defaults?"))return;
      put(LS26Settings.reset());
      await LS26Settings.save(LS26Settings.DEFAULTS);
      setStatus("Defaults restored");
    };
  });
})();
