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
    displayColourRed: "#ff3131",
    displayColourCyan: "#00dfe8",
    displayColourBlue: "#1828ff",
    displayColourGreen: "#42f35c",
    displayColourMagenta: "#f000dc",
    displayColourYellow: "#fff200",
    displayColourBlack: "#000000",
    displayColourWhite: "#ffffff",
    displayColourOrange: "#ff8a24",
    displayColourGray: "#777777",
    displayColourLightGray: "#d7d7d7",
    displayColourBrightPurple: "#c14cff",
    lyricNavVerticalSize: 96,
    lyricNavHorizontalSize: 72,
    lyricNavHorizontalGap: 0,
    lyricNavVerticalGap: 0,
    lyricNavIdleOpacity: 40,
    lyricNavActiveOpacity: 60,
    lyricNavPressedOpacity: 90,
    lyricNavFeedbackDuration: 1800,
    lyricSongValueFontSize: 21,
    lyricSectionHeaderSize: 3,
    lyricPauseCountdownFontSize: 56,
    lyricPauseCountdownColor: "#78e7ff",
    lyricPastSectionOpacity: 50,
    lyricUpcomingSectionOpacity: 50,
    lyricUpcomingFadeDistance: 180,
    lyricPreviousFadeDistance: 180,
    lyricSectionFocusDuringPlayback: true,
    lyricSectionFocusWhenStopped: false,
    lyricTextScale: 100,
    lyricLeadInHeight: 192,
    lyricSectionActivationOffset: 320,
    metronomeBeat1Color: "#ffd05a",
    metronomeBeat2Color: "#00cafa",
    metronomeBeat3Color: "#00cafa",
    metronomeBeat4Color: "#00cafa",
    metronomeFlashBrightness: 72,
    metronomeEdgeThickness: 8,
    metronomeFlashDuration: 120,
    metronomeShowBeatNumber: true,
    metronomeNumberSize: 220,
    metronomeNumberOpacity: 42,
    metronomeNumberVerticalPosition: 31,
    libraryRowHeight: 62,
    appVersion: "3.1.48",
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
  function version(value,fallback){
    const s=String(value||"").trim();
    return /^\d\.\d\.\d{2}$/.test(s)?s:fallback;
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
      displayColourRed: colour(raw.displayColourRed,DEFAULTS.displayColourRed),
      displayColourCyan: colour(raw.displayColourCyan,DEFAULTS.displayColourCyan),
      displayColourBlue: colour(raw.displayColourBlue,DEFAULTS.displayColourBlue),
      displayColourGreen: colour(raw.displayColourGreen,DEFAULTS.displayColourGreen),
      displayColourMagenta: colour(raw.displayColourMagenta,DEFAULTS.displayColourMagenta),
      displayColourYellow: colour(raw.displayColourYellow,DEFAULTS.displayColourYellow),
      displayColourBlack: colour(raw.displayColourBlack,DEFAULTS.displayColourBlack),
      displayColourWhite: colour(raw.displayColourWhite,DEFAULTS.displayColourWhite),
      displayColourOrange: colour(raw.displayColourOrange,DEFAULTS.displayColourOrange),
      displayColourGray: colour(raw.displayColourGray,DEFAULTS.displayColourGray),
      displayColourLightGray: colour(raw.displayColourLightGray,DEFAULTS.displayColourLightGray),
      displayColourBrightPurple: colour(raw.displayColourBrightPurple,DEFAULTS.displayColourBrightPurple),
      lyricNavVerticalSize: clamp(raw.lyricNavVerticalSize,58,140,DEFAULTS.lyricNavVerticalSize),
      lyricNavHorizontalSize: clamp(raw.lyricNavHorizontalSize,52,120,DEFAULTS.lyricNavHorizontalSize),
      lyricNavHorizontalGap: clamp(raw.lyricNavHorizontalGap,0,32,DEFAULTS.lyricNavHorizontalGap),
      lyricNavVerticalGap: clamp(raw.lyricNavVerticalGap,0,32,DEFAULTS.lyricNavVerticalGap),
      lyricNavIdleOpacity: clamp(raw.lyricNavIdleOpacity,10,90,DEFAULTS.lyricNavIdleOpacity),
      lyricNavActiveOpacity: clamp(raw.lyricNavActiveOpacity,20,95,DEFAULTS.lyricNavActiveOpacity),
      lyricNavPressedOpacity: clamp(raw.lyricNavPressedOpacity,40,100,DEFAULTS.lyricNavPressedOpacity),
      lyricNavFeedbackDuration: clamp(raw.lyricNavFeedbackDuration,500,10000,DEFAULTS.lyricNavFeedbackDuration),
      lyricSongValueFontSize: clamp(raw.lyricSongValueFontSize,16,32,DEFAULTS.lyricSongValueFontSize),
      lyricSectionHeaderSize: clamp(raw.lyricSectionHeaderSize,1,5,DEFAULTS.lyricSectionHeaderSize),
      lyricPauseCountdownFontSize: clamp(raw.lyricPauseCountdownFontSize,24,96,DEFAULTS.lyricPauseCountdownFontSize),
      lyricPauseCountdownColor: colour(raw.lyricPauseCountdownColor,DEFAULTS.lyricPauseCountdownColor),
      lyricPastSectionOpacity: clamp(raw.lyricPastSectionOpacity,0,100,DEFAULTS.lyricPastSectionOpacity),
      lyricUpcomingSectionOpacity: clamp(raw.lyricUpcomingSectionOpacity,0,100,DEFAULTS.lyricUpcomingSectionOpacity),
      lyricUpcomingFadeDistance: clamp(raw.lyricUpcomingFadeDistance,0,800,DEFAULTS.lyricUpcomingFadeDistance),
      lyricPreviousFadeDistance: clamp(raw.lyricPreviousFadeDistance,0,800,DEFAULTS.lyricPreviousFadeDistance),
      lyricSectionFocusDuringPlayback: raw.lyricSectionFocusDuringPlayback !== false,
      lyricSectionFocusWhenStopped: raw.lyricSectionFocusWhenStopped === true,
      lyricTextScale: clamp(raw.lyricTextScale,75,150,DEFAULTS.lyricTextScale),
      lyricLeadInHeight: clamp(raw.lyricLeadInHeight,80,360,DEFAULTS.lyricLeadInHeight),
      lyricSectionActivationOffset: clamp(raw.lyricSectionActivationOffset,0,520,DEFAULTS.lyricSectionActivationOffset),
      metronomeBeat1Color: colour(raw.metronomeBeat1Color,DEFAULTS.metronomeBeat1Color),
      metronomeBeat2Color: colour(raw.metronomeBeat2Color,DEFAULTS.metronomeBeat2Color),
      metronomeBeat3Color: colour(raw.metronomeBeat3Color,DEFAULTS.metronomeBeat3Color),
      metronomeBeat4Color: colour(raw.metronomeBeat4Color,DEFAULTS.metronomeBeat4Color),
      metronomeFlashBrightness: clamp(raw.metronomeFlashBrightness,10,100,DEFAULTS.metronomeFlashBrightness),
      metronomeEdgeThickness: clamp(raw.metronomeEdgeThickness,3,18,DEFAULTS.metronomeEdgeThickness),
      metronomeFlashDuration: clamp(raw.metronomeFlashDuration,60,260,DEFAULTS.metronomeFlashDuration),
      metronomeShowBeatNumber: raw.metronomeShowBeatNumber !== false,
      metronomeNumberSize: clamp(raw.metronomeNumberSize,100,320,DEFAULTS.metronomeNumberSize),
      metronomeNumberOpacity: clamp(raw.metronomeNumberOpacity,10,100,DEFAULTS.metronomeNumberOpacity),
      metronomeNumberVerticalPosition: clamp(raw.metronomeNumberVerticalPosition,18,72,DEFAULTS.metronomeNumberVerticalPosition),
      libraryRowHeight: clamp(raw.libraryRowHeight,48,92,DEFAULTS.libraryRowHeight),
      appVersion: version(raw.appVersion,DEFAULTS.appVersion),
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
    root.style.setProperty("--ls26-nav-horizontal-gap",s.lyricNavHorizontalGap+"px");
    root.style.setProperty("--ls26-nav-vertical-gap",s.lyricNavVerticalGap+"px");
    root.style.setProperty("--ls26-nav-idle-opacity",String(s.lyricNavIdleOpacity/100));
    root.style.setProperty("--ls26-nav-active-opacity",String(s.lyricNavActiveOpacity/100));
    root.style.setProperty("--ls26-nav-pressed-opacity",String(s.lyricNavPressedOpacity/100));
    root.style.setProperty("--ls26-nav-feedback-duration",s.lyricNavFeedbackDuration+"ms");
    root.style.setProperty("--ls26-title-meta-value-size",s.lyricSongValueFontSize+"px");
    root.style.setProperty("--ls26-pause-countdown-font-size",s.lyricPauseCountdownFontSize+"px");
    root.style.setProperty("--ls26-pause-countdown-color",s.lyricPauseCountdownColor);

    const sectionHeaderSizes={
      1:{font:15,height:34,padY:4,indicator:4,arrow:11,hint:7},
      2:{font:17,height:39,padY:5,indicator:6,arrow:12,hint:8},
      3:{font:19,height:44,padY:7,indicator:8,arrow:14,hint:9},
      4:{font:22,height:51,padY:8,indicator:10,arrow:16,hint:10},
      5:{font:25,height:58,padY:10,indicator:12,arrow:18,hint:11}
    };
    const headerSize=sectionHeaderSizes[Math.round(s.lyricSectionHeaderSize)]||sectionHeaderSizes[3];
    root.style.setProperty("--ls26-section-header-font-size",headerSize.font+"px");
    root.style.setProperty("--ls26-section-header-height",headerSize.height+"px");
    root.style.setProperty("--ls26-section-header-pad-y",headerSize.padY+"px");
    root.style.setProperty("--ls26-section-indicator-height",headerSize.indicator+"px");
    root.style.setProperty("--ls26-section-header-arrow-size",headerSize.arrow+"px");
    root.style.setProperty("--ls26-section-header-hint-size",headerSize.hint+"px");

    root.style.setProperty("--ls26-past-section-opacity",String(s.lyricPastSectionOpacity/100));
    root.style.setProperty("--ls26-upcoming-section-opacity",String(s.lyricUpcomingSectionOpacity/100));
    root.style.setProperty("--ls26-upcoming-fade-distance",s.lyricUpcomingFadeDistance+"px");
    root.style.setProperty("--ls26-previous-section-fade-distance",s.lyricPreviousFadeDistance+"px");
    root.style.setProperty("--ls26-lyric-text-scale",String(s.lyricTextScale/100));
    root.style.setProperty("--ls26-lyric-lead-in-height",s.lyricLeadInHeight+"px");
    root.style.setProperty("--ls26-section-activation-offset",s.lyricSectionActivationOffset+"px");
    root.style.setProperty("--ls26-metro-beat-1-color",s.metronomeBeat1Color);
    root.style.setProperty("--ls26-metro-beat-2-color",s.metronomeBeat2Color);
    root.style.setProperty("--ls26-metro-beat-3-color",s.metronomeBeat3Color);
    root.style.setProperty("--ls26-metro-beat-4-color",s.metronomeBeat4Color);
    root.style.setProperty("--ls26-metro-flash-opacity",String(s.metronomeFlashBrightness/100));
    root.style.setProperty("--ls26-metro-edge-thickness",s.metronomeEdgeThickness+"px");
    root.style.setProperty("--ls26-metro-number-size",s.metronomeNumberSize+"px");
    root.style.setProperty("--ls26-metro-number-font-size",Math.round(s.metronomeNumberSize*.45)+"px");
    root.style.setProperty("--ls26-metro-number-opacity",String(s.metronomeNumberOpacity/100));
    root.style.setProperty("--ls26-metro-number-top",s.metronomeNumberVerticalPosition+"%");
    root.classList.toggle("ls26-hide-metro-number",!s.metronomeShowBeatNumber);
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
