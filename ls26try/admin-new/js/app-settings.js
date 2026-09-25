(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const fields=[
    "showTopStatusWhenInactive","statusValueFontSize","statusLabelFontSize",
    "userBpmColor","originalBpmColor","keyColor","capoColor",
    "lyricNavVerticalSize","lyricNavHorizontalSize","lyricTextScale",
    "lyricNavHorizontalGap","lyricNavVerticalGap",
    "lyricLeadInHeight","lyricSectionActivationOffset",
    "metronomeBeat1Color","metronomeBeat2Color","metronomeBeat3Color","metronomeBeat4Color",
    "metronomeFlashBrightness","metronomeEdgeThickness","metronomeFlashDuration",
    "metronomeShowBeatNumber","metronomeNumberSize","metronomeNumberOpacity","metronomeNumberVerticalPosition",
    "libraryRowHeight","reduceGlow"
  ];
  function put(settings){
    fields.forEach(id=>{
      const el=$(id); if(!el)return;
      if(el.type==="checkbox")el.checked=!!settings[id];
      else el.value=settings[id];
      const out=document.querySelector(`[data-output="${id}"]`);
      if(out){
        const units={
          lyricTextScale:"%",metronomeFlashBrightness:"%",metronomeNumberOpacity:"%",
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
  function preview(){const s=LS26Settings.apply(collect());put(s);$("settingsStatus").textContent="Previewing changes";}

  document.addEventListener("DOMContentLoaded",async()=>{
    window.LK?.sidebar?.loadSidebar?.();
    put(LS26Settings.get());
    try{put(await LS26Settings.syncRemoteOncePerSession(true));}catch(_){}
    document.querySelectorAll("[data-setting]").forEach(el=>el.addEventListener("input",preview));
    $("saveSettingsBtn").onclick=async()=>{
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
