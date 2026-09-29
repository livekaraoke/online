(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const fields=[
    "showTopStatusWhenInactive","statusValueFontSize","statusLabelFontSize",
    "userBpmColor","originalBpmColor","keyColor","capoColor",
    "lyricNavVerticalSize","lyricNavHorizontalSize","lyricTextScale",
    "lyricNavHorizontalGap","lyricNavVerticalGap",
    "lyricNavIdleOpacity","lyricNavActiveOpacity","lyricNavPressedOpacity","lyricNavFeedbackDuration",
    "lyricLeadInHeight","lyricSectionActivationOffset",
    "lyricPastSectionOpacity","lyricUpcomingSectionOpacity","lyricUpcomingFadeDistance",
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
  function preview(){const s=LS26Settings.apply(collect());put(s);$("settingsStatus").textContent="Previewing changes";}

  document.addEventListener("DOMContentLoaded",async()=>{
    window.LK?.sidebar?.loadSidebar?.();
    put(LS26Settings.get());
    try{put(await LS26Settings.syncRemoteOncePerSession(true));}catch(_){}
    document.querySelectorAll("[data-setting]").forEach(el=>el.addEventListener("input",()=>{
      if(el.id==="appVersion"){
        if(!validVersion(false)){
          $("settingsStatus").textContent="App version must use 0.0.00 format";
          return;
        }
      }
      preview();
    }));
    $("saveSettingsBtn").onclick=async()=>{
      if(!validVersion(true)){$("settingsStatus").textContent="App version must use 0.0.00 format";return;}
      const b=$("saveSettingsBtn");b.disabled=true;$("settingsStatus").textContent="Saving…";
      try{put(await LS26Settings.save(collect()));$("settingsStatus").textContent="Settings saved";}
      catch(error){$("settingsStatus").textContent=error.message||"Could not save settings";}
      finally{b.disabled=false;}
    };
    $("resetSettingsBtn").onclick=async()=>{
      if(!await LS26Dialogs.confirm("Reset LiveSuite App Settings to their defaults?"))return;
      put(LS26Settings.reset());
      await LS26Settings.save(LS26Settings.DEFAULTS);
      $("settingsStatus").textContent="Defaults restored";
    };
  });
})();
