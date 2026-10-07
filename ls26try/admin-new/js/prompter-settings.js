(() => {
  "use strict";
  const globalSettings=window.LS26PrompterSettings;
  const {DEFAULTS,KEYS}=globalSettings;
  const $=id=>document.getElementById(id);
  const read=name=>{try{const v=localStorage.getItem(KEYS[name]);return v==null?DEFAULTS[name]:v;}catch(_){return DEFAULTS[name];}};
  const bool=value=>String(value)!=="false";
  const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const controls={
    guidance:$("prompterGuidance"),theme:$("prompterTheme"),font:$("prompterFont"),size:$("prompterTextSize"),spacing:$("prompterSpacing"),background:$("prompterBackground"),bottomBar:$("prompterBottomBar"),
    lyricsWeight:$("prompterLyricsWeight"),characterSpacing:$("prompterCharacterSpacing"),
    autoScroll:$("prompterAutoScroll"),syncSinger:$("prompterSyncSinger"),speed:$("prompterSpeed"),scrollSmoothingMs:$("prompterScrollSmoothingMs"),
    focus:$("prompterFocus"),currentScale:$("prompterCurrentScale"),contextScale:$("prompterContextScale"),mutedScale:$("prompterMutedScale"),mutedOpacity:$("prompterMutedOpacity"),currentColour:$("prompterCurrentColour"),
    sectionTitleAlign:$("prompterSectionTitleAlign"),sectionTitleX:$("prompterSectionTitleX"),sectionColourMode:$("prompterSectionColourMode"),sectionCustomColour:$("prompterSectionCustomColour"),
    performanceNoteColour:$("prompterPerformanceNoteColour"),performanceNoteSize:$("prompterPerformanceNoteSize"),performanceNoteBorderColour:$("prompterPerformanceNoteBorderColour"),performanceNotePadding:$("prompterPerformanceNotePadding"),performanceNoteSpacing:$("prompterPerformanceNoteSpacing"),
    chordCurrentColour:$("prompterChordCurrentColour"),chordInactiveOpacity:$("prompterChordInactiveOpacity"),chordAbove:$("prompterChordAbove"),chordBelow:$("prompterChordBelow"),
    pastSizeRatio:$("prompterPastSizeRatio"),past1Opacity:$("prompterPast1Opacity"),past2Opacity:$("prompterPast2Opacity"),pastFarOpacity:$("prompterPastFarOpacity"),
    next1SizeRatio:$("prompterNext1SizeRatio"),next1Opacity:$("prompterNext1Opacity"),next2SizeRatio:$("prompterNext2SizeRatio"),next2Opacity:$("prompterNext2Opacity"),
    futureNearSizeRatio:$("prompterFutureNearSizeRatio"),futureNearOpacity:$("prompterFutureNearOpacity"),futureMidSizeRatio:$("prompterFutureMidSizeRatio"),futureMidStartOpacity:$("prompterFutureMidStartOpacity"),futureMidEndOpacity:$("prompterFutureMidEndOpacity"),futureFarSizeRatio:$("prompterFutureFarSizeRatio"),futureFarStartOpacity:$("prompterFutureFarStartOpacity"),futureFarEndOpacity:$("prompterFutureFarEndOpacity")
  };
  const outputs={
    lyricsWeight:$("prompterLyricsWeightValue"),characterSpacing:$("prompterCharacterSpacingValue"),speed:$("prompterSpeedValue"),scrollSmoothingMs:$("prompterScrollSmoothingMsValue"),focus:$("prompterFocusValue"),sectionTitleX:$("prompterSectionTitleXValue"),currentScale:$("prompterCurrentScaleValue"),contextScale:$("prompterContextScaleValue"),mutedScale:$("prompterMutedScaleValue"),mutedOpacity:$("prompterMutedOpacityValue"),
    performanceNoteSize:$("prompterPerformanceNoteSizeValue"),performanceNotePadding:$("prompterPerformanceNotePaddingValue"),performanceNoteSpacing:$("prompterPerformanceNoteSpacingValue"),chordInactiveOpacity:$("prompterChordInactiveOpacityValue"),
    pastSizeRatio:$("prompterPastSizeRatioValue"),past1Opacity:$("prompterPast1OpacityValue"),past2Opacity:$("prompterPast2OpacityValue"),pastFarOpacity:$("prompterPastFarOpacityValue"),next1SizeRatio:$("prompterNext1SizeRatioValue"),next1Opacity:$("prompterNext1OpacityValue"),next2SizeRatio:$("prompterNext2SizeRatioValue"),next2Opacity:$("prompterNext2OpacityValue"),futureNearSizeRatio:$("prompterFutureNearSizeRatioValue"),futureNearOpacity:$("prompterFutureNearOpacityValue"),futureMidSizeRatio:$("prompterFutureMidSizeRatioValue"),futureMidStartOpacity:$("prompterFutureMidStartOpacityValue"),futureMidEndOpacity:$("prompterFutureMidEndOpacityValue"),futureFarSizeRatio:$("prompterFutureFarSizeRatioValue"),futureFarStartOpacity:$("prompterFutureFarStartOpacityValue"),futureFarEndOpacity:$("prompterFutureFarEndOpacityValue")
  };
  const status=$("prompterSettingsStatus"),preview=$("prompterPreview"),sectionTitlePreview=$("prompterSectionTitlePreview");
  const percent=value=>`${Math.round(Number(value)*100)}%`;
  function resolvedSectionTitle(){
    const mode=controls.sectionTitleAlign.value,raw=Math.max(-20,Math.min(100,Number(controls.sectionTitleX.value)||0));
    if(mode==='center')return {left:'50%',shift:'-50%'};
    if(mode==='right')return {left:'100%',shift:'-100%'};
    if(mode==='custom'&&raw<0)return {left:`${raw}px`,shift:'0%'};
    if(mode==='custom')return {left:`${raw}%`,shift:`${-raw}%`};
    return {left:'0%',shift:'0%'};
  }
  function load(){
    for(const [key,control] of Object.entries(controls)){
      if(!control)continue;const value=read(key);
      if(control.type==='checkbox')control.checked=bool(value);
      else if(control.tagName==='SELECT'||control.type==='color')control.value=String(value);
      else control.value=number(value,DEFAULTS[key]);
    }
    refresh();
  }
  function refresh(){
    outputs.lyricsWeight.textContent=String(Math.round(Number(controls.lyricsWeight.value)));
    outputs.characterSpacing.textContent=`${Number(controls.characterSpacing.value).toFixed(1).replace('.0','')}px`;
    outputs.speed.textContent=`${Number(controls.speed.value).toFixed(2)}×`;
    outputs.scrollSmoothingMs.textContent=`${Math.round(Number(controls.scrollSmoothingMs.value))}ms`;
    outputs.focus.textContent=`${controls.focus.value}%`;
    const sectionX=Number(controls.sectionTitleX.value)||0;outputs.sectionTitleX.textContent=sectionX<0?`${sectionX}px`:`${sectionX}%`;
    outputs.currentScale.textContent=`${Number(controls.currentScale.value).toFixed(2)}×`;outputs.contextScale.textContent=`${Number(controls.contextScale.value).toFixed(2)}×`;outputs.mutedScale.textContent=`${Number(controls.mutedScale.value).toFixed(2)}×`;outputs.mutedOpacity.textContent=percent(controls.mutedOpacity.value);
    outputs.performanceNoteSize.textContent=`${Math.round(Number(controls.performanceNoteSize.value))}px`;outputs.performanceNotePadding.textContent=`${Math.round(Number(controls.performanceNotePadding.value))}px`;outputs.performanceNoteSpacing.textContent=`${Math.round(Number(controls.performanceNoteSpacing.value))}px`;outputs.chordInactiveOpacity.textContent=percent(controls.chordInactiveOpacity.value);
    for(const key of ['pastSizeRatio','past1Opacity','past2Opacity','pastFarOpacity','next1SizeRatio','next1Opacity','next2SizeRatio','next2Opacity','futureNearSizeRatio','futureNearOpacity','futureMidSizeRatio','futureMidStartOpacity','futureMidEndOpacity','futureFarSizeRatio','futureFarStartOpacity','futureFarEndOpacity'])outputs[key].textContent=percent(controls[key].value);
    controls.sectionTitleX.disabled=controls.sectionTitleAlign.value!=="custom";controls.sectionCustomColour.disabled=controls.sectionColourMode.value!=="custom";
    preview.style.setProperty('--preview-bg',controls.background.value);preview.style.setProperty('--preview-current',controls.currentColour.value);preview.style.setProperty('--preview-current-scale',controls.currentScale.value);preview.style.setProperty('--preview-context-scale',controls.contextScale.value);preview.style.setProperty('--preview-muted-scale',controls.mutedScale.value);preview.style.setProperty('--preview-muted-opacity',controls.mutedOpacity.value);preview.style.setProperty('--preview-weight',controls.lyricsWeight.value);preview.style.setProperty('--preview-spacing',`${controls.characterSpacing.value}px`);
    if(sectionTitlePreview){const pos=resolvedSectionTitle();sectionTitlePreview.style.left=pos.left;sectionTitlePreview.style.transform=`translateX(${pos.shift})`;sectionTitlePreview.style.color=controls.sectionColourMode.value==='custom'?controls.sectionCustomColour.value:'#42f35c';}
  }
  let loading=true,dirty=false;
  function values(){const out={};for(const [key,control]of Object.entries(controls)){if(!control)continue;out[key]=control.type==='checkbox'?control.checked:control.value;}return globalSettings.normalize(out);}
  function changed(){dirty=true;globalSettings.apply(values());refresh();status.textContent='Unsaved global changes. Preview cached on this device; press Save Global Settings to share.';}
  async function reload(){loading=true;Object.values(controls).filter(Boolean).forEach(c=>c.disabled=true);const result=await globalSettings.load(true);load();dirty=false;loading=false;Object.values(controls).filter(Boolean).forEach(c=>c.disabled=false);refresh();status.textContent=result.error?'Offline or access unavailable. Using local settings; global save will check access again.':result.remote?'Global settings loaded.':'No global defaults saved yet. Review these settings before the first save.';}
  Object.values(controls).filter(Boolean).forEach(control=>control.addEventListener(control.type==='range'||control.type==='color'?'input':'change',()=>{if(!loading)changed();}));
  $('savePrompterSettings').onclick=async()=>{if(loading)return;const button=$('savePrompterSettings');loading=true;button.disabled=true;Object.values(controls).filter(Boolean).forEach(c=>c.disabled=true);try{await globalSettings.save(values());dirty=false;status.textContent='Global Prompter settings saved. Other devices load them next session or after Reload Global Settings.';}catch(error){status.textContent=error.message;}finally{loading=false;button.disabled=false;Object.values(controls).filter(Boolean).forEach(c=>c.disabled=false);refresh();}};
  $('reloadPrompterSettings').onclick=async()=>{if(loading)return;if(dirty&&!await LS26Dialogs.confirm('Discard local settings edits and reload the global defaults?'))return;await reload();};
  $('resetPrompterSettings').onclick=async()=>{if(loading)return;if(!await LS26Dialogs.confirm('Preview default Prompter settings? Save Global Settings to publish them.'))return;globalSettings.apply(DEFAULTS);load();changed();};
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  load();void reload();
})();
