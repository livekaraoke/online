/* LiveSuite LyricView -> Singer Screen bridge v3.3.
 * BroadcastChannel gives same-device low-latency updates; Firestore remains the
 * rate-limited cross-device fallback. Count-in never withholds the lyrics. */
(() => {
  'use strict';
  if(!/\/host\/lyricview\.html$/i.test(String(location.pathname||''))||window.__ls26SingerBridgeV3)return;
  window.__ls26SingerBridgeV3=true;window.__ls26SingerBridgeV2=true;
  const COLLECTION='karaokeControl',DOC='liveLyrics',CHANNEL='ls26-singer-live-v3',LOCAL_SYNC_MS=50,REMOTE_SYNC_MS=2000;
  const songId=String(new URLSearchParams(location.search).get('id')||'').trim();
  let channel=null;try{if('BroadcastChannel'in window)channel=new BroadcastChannel(CHANNEL);}catch(_){}
  let state=null,localTimer=0,countInActive=false,lastRemoteAt=0,lastProgressSample=null;
  const lyricMapCache=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  async function waitForReady(){for(let i=0;i<150;i++){if(window.db&&window.LS26Performance?.song?.()&&document.getElementById('autoScrollBtn'))return true;await sleep(100);}return false;}
  const currentSong=()=>window.LS26Performance?.song?.()||null;
  function currentBpm(){const song=currentSong()||{};return clamp(Number(window.LS26Performance?.getBpm?.()||song.userBpm||song.originalBpm||96)||96,20,400);}
  const isPlaying=()=>Boolean(window.LS26Performance?.isScrolling?.());
  function followOn(){try{return Boolean(window.LS26TimedView?.enabled?.());}catch(_){return false;}}
  function syncEnabled(){try{return localStorage.getItem('ls26:syncSingerScroll')!=='false';}catch(_){return true;}}
  function meta(){const song=currentSong()||{};return{title:String(song.title||document.querySelector('#topbarSongTitle strong')?.textContent||'Untitled').trim(),artist:String(song.artist||document.querySelector('#topbarSongTitle span')?.textContent||'').replace(/^\s*[·-]\s*/,'').trim()};}
  const ref=()=>window.db.collection(COLLECTION).doc(DOC);
  function postLocal(){if(!state)return;const message={type:'state',state:{...state},sentAtMs:Date.now()};try{channel?.postMessage(message);}catch(_){}if(!channel)try{localStorage.setItem('ls26:singer-v3-state',JSON.stringify(message));}catch(_) {}}
  async function writeRemote(){
    if(!state||!songId)return;const payload={...state,updatedAtMs:Date.now()};state=payload;lastRemoteAt=Date.now();
    try{await ref().set({reset:false,currentLyricsSongId:songId,currentSongId:songId,songTitle:payload.title,songArtist:payload.artist,displayState:payload.phase==='preview'?'preview':'song',singerV3:payload,singerPlayback:{state:payload.countingIn?'countin':payload.phase,songId,bpm:payload.bpm,countInBeat:payload.countInBeat||0,updatedAtMs:payload.updatedAtMs}},{merge:true});}catch(error){console.warn('Singer v3 bridge update failed:',error);}
  }
  function publish(partial,{remote=false}={}){if(!state)return;state={...state,...partial,bpm:currentBpm(),updatedAtMs:Date.now()};postLocal();if(remote)void writeRemote();}
  function sectionLyricMap(sectionIndex){const key=Number(sectionIndex);if(!lyricMapCache.has(key))lyricMapCache.set(key,window.LS26SingerLines.section(currentSong()?.sections?.[key]||{},document));return lyricMapCache.get(key);}
  function lyricTargetForChord(sectionIndex,lineIndex){const row=window.LS26SingerLines.target(sectionLyricMap(sectionIndex),lineIndex);return row?{lineIndex:row.sourceLineIndex,text:row.text}:{lineIndex:-1,text:''};}
  function firstLyricSync(){
    const sections=currentSong()?.sections||[];for(let sourceIndex=0;sourceIndex<sections.length;sourceIndex++){const row=sectionLyricMap(sourceIndex).find(item=>item.kind==='lyric');if(row)return{sourceIndex,activeLineIndex:row.sourceLineIndex,currentLyricLineIndex:row.sourceLineIndex,currentLyricText:row.text,sectionProgress:0,progressRatePerMs:0,followOn:followOn(),updatedAtMs:Date.now()};}return null;
  }
  function visibleSections(){const sections=Array.isArray(window.LS26Performance?.sections?.())?window.LS26Performance.sections():[];return sections.filter(el=>el&&el.isConnected&&!el.hidden&&getComputedStyle(el).display!=='none');}
  function performanceAnchor(){const header=document.getElementById('ls26StickyHeader'),quick=document.getElementById('performanceQuickInfo'),tuning=document.getElementById('guitarTuningCard'),head=(header?.getBoundingClientRect().height||0)+(quick&&!quick.classList.contains('past-karaoke-tools-window')?(quick.getBoundingClientRect().height||0):0)+(tuning&&!tuning.classList.contains('past-tuning-window')?(tuning.getBoundingClientRect().height||0):0);return Math.max(head+70,innerHeight*.40);}
  function activeSectionFromViewport(sections,anchor){let best=sections[0]||null,bestDistance=Infinity;sections.forEach(el=>{const top=el.getBoundingClientRect().top;if(top<=anchor+30){const distance=Math.abs(anchor-top);if(distance<bestDistance){best=el;bestDistance=distance;}}});return best;}
  function buildSync(){
    if(!syncEnabled())return null;
    const timed=followOn()?window.LS26TimedView?.snapshot?.():null;
    if(timed?.event){const {sectionIndex,lineIndex}=timed.event.sourceAnchor,target=lyricTargetForChord(sectionIndex,lineIndex);return{sourceIndex:sectionIndex,activeLineIndex:lineIndex,currentLyricLineIndex:target.lineIndex,currentLyricText:target.text,sectionProgress:Number(timed.progress||0),progressRatePerMs:0,followOn:true,updatedAtMs:Date.now()};}
    if(countInActive)return firstLyricSync();
    const sections=visibleSections(),anchor=performanceAnchor(),activeChord=document.querySelector('.ls26-active-chord[data-ls26-section-index]');let active=null,sourceIndex=-1,activeLineIndex=-1,currentLyricLineIndex=-1,currentLyricText='';
    if(activeChord){sourceIndex=Number(activeChord.dataset.ls26SectionIndex);activeLineIndex=Number(activeChord.dataset.ls26LineIndex);active=sections.find(el=>Number(el.dataset.sectionIndex)===sourceIndex)||null;const target=lyricTargetForChord(sourceIndex,activeLineIndex);currentLyricLineIndex=target.lineIndex;currentLyricText=target.text;}
    if(!active){active=activeSectionFromViewport(sections,anchor);sourceIndex=Number(active?.dataset?.sectionIndex);if(!Number.isFinite(sourceIndex))sourceIndex=Math.max(0,sections.indexOf(active));}
    const index=Math.max(0,sections.indexOf(active)),previous=sections[index-1]||null,next=sections[index+1]||null,activeTop=active?.getBoundingClientRect().top??anchor,nextTop=next?.getBoundingClientRect().top??activeTop,span=Math.max(1,nextTop-activeTop),progress=next?clamp((anchor-activeTop)/span,0,1):0,now=Date.now();let rate=0;
    if(lastProgressSample&&lastProgressSample.sourceIndex===sourceIndex&&now-lastProgressSample.at>30)rate=clamp((progress-lastProgressSample.progress)/(now-lastProgressSample.at),0,.02);lastProgressSample={sourceIndex,progress,at:now};const maxHostScroll=Math.max(1,document.documentElement.scrollHeight-innerHeight);
    return{sourceIndex,previousSourceIndex:Number(previous?.dataset?.sectionIndex??-1),nextSourceIndex:Number(next?.dataset?.sectionIndex??-1),sectionProgress:Number(progress.toFixed(4)),progressRatePerMs:Number(rate.toFixed(8)),activeLineIndex:Number.isFinite(activeLineIndex)?activeLineIndex:-1,currentLyricLineIndex:Number.isFinite(currentLyricLineIndex)?currentLyricLineIndex:-1,currentLyricText,scrollFraction:Number(clamp(scrollY/maxHostScroll,0,1).toFixed(5)),followOn:followOn(),updatedAtMs:now};
  }
  function pushSync({forceRemote=false}={}){if(!state||!isPlaying())return;const remote=forceRemote||Date.now()-lastRemoteAt>=REMOTE_SYNC_MS;state={...state,phase:'playing',playing:true,countingIn:countInActive,syncEnabled:syncEnabled(),sync:buildSync(),countInBeat:state.countInBeat||0,updatedAtMs:Date.now()};postLocal();if(remote)void writeRemote();}
  function stopSync(){clearInterval(localTimer);localTimer=0;}function startSync(){if(syncEnabled()&&!localTimer)localTimer=setInterval(()=>pushSync(),LOCAL_SYNC_MS);}
  function onTransportState(event){
    const snap=event.detail||{};
    if(snap.state==='playing'&&isPlaying()){
      const target=followOn()?(Number(window.LS26TimedView?.startBeat?.())||0):0;countInActive=Number(snap.beat)<target-1e-5;
      publish({phase:'playing',playing:true,countingIn:countInActive,countInBeat:0,syncEnabled:syncEnabled(),sync:buildSync()},{remote:true});startSync();
    }else if((snap.state==='paused'||snap.state==='stopped')&&state?.phase!=='preview'&&state?.phase!=='paused'&&state?.phase!=='complete'){
      countInActive=false;stopSync();publish({phase:'paused',playing:false,countingIn:false,countInBeat:0,syncEnabled:syncEnabled(),sync:buildSync()},{remote:true});
    }
  }
  function onBeat(event){
    if(!isPlaying())return;const beat=event.detail||{};
    if(beat.countIn){countInActive=true;publish({phase:'playing',playing:true,countingIn:true,countInBeat:beat.beat,syncEnabled:syncEnabled(),sync:buildSync()},{remote:Date.now()-lastRemoteAt>=REMOTE_SYNC_MS});startSync();}
    else if(countInActive){countInActive=false;publish({phase:'playing',playing:true,countingIn:false,countInBeat:0,syncEnabled:syncEnabled(),sync:buildSync()},{remote:true});startSync();}
  }
  function onSyncChange(enabled){
    try{localStorage.setItem('ls26:syncSingerScroll',String(enabled!==false));}catch(_){}
    if(!state)return;if(enabled===false){stopSync();publish({syncEnabled:false,sync:null},{remote:true});}else{publish({syncEnabled:true,sync:isPlaying()?buildSync():state.sync},{remote:true});if(isPlaying())startSync();}
  }
  async function start(){
    if(!songId||!(await waitForReady()))return;const {title,artist}=meta();state={version:3,songId,title,artist,bpm:currentBpm(),phase:'preview',playing:false,countingIn:false,countInBeat:0,countInBeatAtMs:0,syncEnabled:syncEnabled(),sync:null,updatedAtMs:Date.now()};postLocal();void writeRemote();
    window.addEventListener('ls26:transport-state',onTransportState);window.addEventListener('ls26:metronome-beat',onBeat);
    window.addEventListener('ls26:scroll-state',event=>{if(event.detail?.playing){const snap=window.LS26Click?.driver?.()?.snapshot?.();countInActive=snap?.state==='playing'&&Number(snap.beat)<0;publish({phase:'playing',playing:true,countingIn:countInActive,countInBeat:0,syncEnabled:syncEnabled(),sync:buildSync()},{remote:true});startSync();}else if(state?.phase!=='paused'&&state?.phase!=='complete'){countInActive=false;stopSync();publish({phase:'paused',playing:false,countingIn:false,countInBeat:0,syncEnabled:syncEnabled(),sync:buildSync()},{remote:true});}});
    window.addEventListener('ls26:singer-scroll-sync-changed',event=>onSyncChange(event.detail?.enabled!==false));window.addEventListener('storage',event=>{if(event.key==='ls26:syncSingerScroll')onSyncChange(event.newValue!=='false');});
    window.addEventListener('ls26:song-finished',()=>{countInActive=false;stopSync();publish({phase:'complete',playing:false,countingIn:false,countInBeat:0,syncEnabled:syncEnabled(),sync:buildSync()},{remote:true});});
    if(channel)channel.onmessage=event=>{if(event.data?.type==='request-state')postLocal();};window.addEventListener('pagehide',()=>{stopSync();try{channel?.close();}catch(_){}},{once:true});
  }
  window.LS26SingerBridge=Object.freeze({countingIn:()=>countInActive,syncEnabled});void start();
})();
