(() => {
  "use strict";

  const DEFAULTS={
    guidance:"normal",theme:"default",font:"default",size:"normal",spacing:"normal",
    background:"#00131a",bottomBar:true,autoScroll:true,speed:1,
    focus:40,currentScale:1.72,contextScale:1.48,mutedScale:.82,mutedOpacity:.60,currentColour:"#16d8ff"
  };
  const KEYS={
    guidance:"karaokeGuidanceMode",theme:"ls26:singerTheme",font:"ls26:singerFont",size:"ls26:singerTextSize",spacing:"ls26:singerSpacing",
    background:"ls26:karaokeSingerBackground",bottomBar:"ls26:karaokeSingerBottomBar",autoScroll:"ls26:singerAutoScroll",speed:"ls26:singerScrollSpeed",
    focus:"ls26:singerFocusPosition",currentScale:"ls26:singerCurrentLineScale",contextScale:"ls26:singerContextLineScale",mutedScale:"ls26:singerMutedLineScale",mutedOpacity:"ls26:singerMutedOpacity",currentColour:"ls26:singerCurrentLineColour"
  };
  const $=id=>document.getElementById(id);
  const read=(name)=>{try{const v=localStorage.getItem(KEYS[name]);return v==null?DEFAULTS[name]:v;}catch(_){return DEFAULTS[name];}};
  const write=(name,value)=>{try{localStorage.setItem(KEYS[name],String(value));}catch(_){}};
  const bool=value=>String(value)!=="false";
  const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

  const controls={
    guidance:$("prompterGuidance"),theme:$("prompterTheme"),font:$("prompterFont"),size:$("prompterTextSize"),spacing:$("prompterSpacing"),
    background:$("prompterBackground"),bottomBar:$("prompterBottomBar"),autoScroll:$("prompterAutoScroll"),speed:$("prompterSpeed"),
    focus:$("prompterFocus"),currentScale:$("prompterCurrentScale"),contextScale:$("prompterContextScale"),mutedScale:$("prompterMutedScale"),mutedOpacity:$("prompterMutedOpacity"),currentColour:$("prompterCurrentColour")
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
    updateContextCopy();refresh();
  }
  function refresh(){
    outputs.speed.textContent=`${Number(controls.speed.value).toFixed(2)}×`;outputs.focus.textContent=`${controls.focus.value}%`;
    outputs.currentScale.textContent=`${Number(controls.currentScale.value).toFixed(2)}×`;outputs.contextScale.textContent=`${Number(controls.contextScale.value).toFixed(2)}×`;
    outputs.mutedScale.textContent=`${Number(controls.mutedScale.value).toFixed(2)}×`;outputs.mutedOpacity.textContent=`${Math.round(Number(controls.mutedOpacity.value)*100)}%`;
    preview.style.setProperty("--preview-bg",controls.background.value);preview.style.setProperty("--preview-current",controls.currentColour.value);preview.style.setProperty("--preview-current-scale",controls.currentScale.value);
    preview.style.setProperty("--preview-context-scale",controls.contextScale.value);preview.style.setProperty("--preview-muted-scale",controls.mutedScale.value);preview.style.setProperty("--preview-muted-opacity",controls.mutedOpacity.value);
  }
  function saveAll(){
    ["guidance","theme","font","size","spacing","speed","focus","currentScale","contextScale","mutedScale","mutedOpacity"].forEach(name=>write(name,controls[name].value));
    write("background",controls.background.value);write("currentColour",controls.currentColour.value);write("bottomBar",controls.bottomBar.checked);write("autoScroll",controls.autoScroll.checked);
    refresh();if(status){status.textContent="Prompter settings saved on this device. They will be used the next time the Singer Screen loads.";status.classList.add("is-success");}
  }
  function reset(){
    Object.entries(KEYS).forEach(([name,key])=>{try{localStorage.removeItem(key);}catch(_){}});load();saveAll();if(status)status.textContent="Prompter settings reset to defaults.";
  }

  Object.values(controls).forEach(control=>{
    if(!control)return;control.addEventListener(control.type==="range"||control.type==="color"?"input":"change",saveAll);
  });
  $("resetPrompterSettings")?.addEventListener("click",reset);
  load();
})();