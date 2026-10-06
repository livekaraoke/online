(() => {
  "use strict";

  const globalSettings=window.LS26PrompterSettings;
  const {DEFAULTS,KEYS}=globalSettings;
  const $=id=>document.getElementById(id);
  const read=(name)=>{try{const v=localStorage.getItem(KEYS[name]);return v==null?DEFAULTS[name]:v;}catch(_){return DEFAULTS[name];}};
  const bool=value=>String(value)!=="false";
  const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

  const controls={
    guidance:$("prompterGuidance"),theme:$("prompterTheme"),font:$("prompterFont"),size:$("prompterTextSize"),spacing:$("prompterSpacing"),
    background:$("prompterBackground"),bottomBar:$("prompterBottomBar"),autoScroll:$("prompterAutoScroll"),speed:$("prompterSpeed"),
    focus:$("prompterFocus"),currentScale:$("prompterCurrentScale"),contextScale:$("prompterContextScale"),mutedScale:$("prompterMutedScale"),mutedOpacity:$("prompterMutedOpacity"),currentColour:$("prompterCurrentColour"),chordAbove:$("prompterChordAbove"),chordBelow:$("prompterChordBelow")
  };
  const outputs={speed:$("prompterSpeedValue"),focus:$("prompterFocusValue"),currentScale:$("prompterCurrentScaleValue"),contextScale:$("prompterContextScaleValue"),mutedScale:$("prompterMutedScaleValue"),mutedOpacity:$("prompterMutedOpacityValue")};
  const status=$("prompterSettingsStatus"),preview=$("prompterPreview");

  function updateContextCopy(){
    const label=controls.contextScale?.closest("label");
    if(label&&label.firstChild?.nodeType===Node.TEXT_NODE)label.firstChild.nodeValue="Previous & next two lines size";
    if(!preview)return;
    const lines=[...preview.querySelectorAll(".prompter-preview-line")];
    if(lines[4]){lines[4].className="prompter-preview-line context";lines[4].textContent="Line below the current line";}
    if(lines[5]){lines[5].className="prompter-preview-line context";lines[5].textContent="Line two below the current line";}
    if(!preview.querySelector("[data-prompter-later-line]")){
      const later=document.createElement("span");later.className="prompter-preview-line muted";later.dataset.prompterLaterLine="1";later.textContent="Later lyric line";preview.appendChild(later);
    }
  }

  function load(){
    controls.guidance.value=read("guidance");controls.theme.value=read("theme");controls.font.value=read("font");controls.size.value=read("size");controls.spacing.value=read("spacing");
    controls.background.value=read("background");controls.bottomBar.checked=bool(read("bottomBar"));controls.autoScroll.checked=bool(read("autoScroll"));controls.speed.value=number(read("speed"),DEFAULTS.speed);
    controls.focus.value=number(read("focus"),DEFAULTS.focus);controls.currentScale.value=number(read("currentScale"),DEFAULTS.currentScale);controls.contextScale.value=number(read("contextScale"),DEFAULTS.contextScale);
    controls.mutedScale.value=number(read("mutedScale"),DEFAULTS.mutedScale);controls.mutedOpacity.value=number(read("mutedOpacity"),DEFAULTS.mutedOpacity);controls.currentColour.value=read("currentColour");
    controls.chordAbove.value=read("chordAbove");controls.chordBelow.value=read("chordBelow");
    updateContextCopy();refresh();
  }
  function refresh(){
    outputs.speed.textContent=`${Number(controls.speed.value).toFixed(2)}×`;outputs.focus.textContent=`${controls.focus.value}%`;
    outputs.currentScale.textContent=`${Number(controls.currentScale.value).toFixed(2)}×`;outputs.contextScale.textContent=`${Number(controls.contextScale.value).toFixed(2)}×`;
    outputs.mutedScale.textContent=`${Number(controls.mutedScale.value).toFixed(2)}×`;outputs.mutedOpacity.textContent=`${Math.round(Number(controls.mutedOpacity.value)*100)}%`;
    preview.style.setProperty("--preview-bg",controls.background.value);preview.style.setProperty("--preview-current",controls.currentColour.value);preview.style.setProperty("--preview-current-scale",controls.currentScale.value);
    preview.style.setProperty("--preview-context-scale",controls.contextScale.value);preview.style.setProperty("--preview-muted-scale",controls.mutedScale.value);preview.style.setProperty("--preview-muted-opacity",controls.mutedOpacity.value);
  }
  let loading=true,dirty=false;
  function values(){const out={};for(const [key,control]of Object.entries(controls))out[key]=control.type==='checkbox'?control.checked:control.value;return globalSettings.normalize(out);}
  function changed(){dirty=true;globalSettings.apply(values());refresh();status.textContent='Unsaved global changes. Preview cached on this device; press Save Global Settings to share.';}
  async function reload(){loading=true;Object.values(controls).forEach(c=>c.disabled=true);const result=await globalSettings.load(true);load();dirty=false;loading=false;Object.values(controls).forEach(c=>c.disabled=false);status.textContent=result.error?'Offline or access unavailable. Using local settings; global save will check access again.':result.remote?'Global settings loaded.':'No global defaults saved yet. Review these settings before the first save.';}
  Object.values(controls).forEach(control=>control.addEventListener(control.type==='range'||control.type==='color'?'input':'change',()=>{if(!loading)changed();}));
  $('savePrompterSettings').onclick=async()=>{if(loading)return;const button=$('savePrompterSettings');loading=true;button.disabled=true;Object.values(controls).forEach(c=>c.disabled=true);try{await globalSettings.save(values());dirty=false;status.textContent='Global Prompter settings saved. Other devices load them next session or after Reload Global Settings.';}catch(error){status.textContent=error.message;}finally{loading=false;button.disabled=false;Object.values(controls).forEach(c=>c.disabled=false);}};
  $('reloadPrompterSettings').onclick=async()=>{if(loading)return;if(dirty&&!await LS26Dialogs.confirm('Discard local settings edits and reload the global defaults?'))return;await reload();};
  $('resetPrompterSettings').onclick=async()=>{if(loading)return;if(!await LS26Dialogs.confirm('Preview default Prompter settings? Save Global Settings to publish them.'))return;globalSettings.apply(DEFAULTS);load();changed();};
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  load();void reload();
})();
