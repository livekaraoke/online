/* LiveSuite LyricView -> Singer Screen bridge v2.
 * One preview write per loaded song, one playback write per state change, and
 * bounded 2-second progress updates while the song is actually playing.
 */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerBridgeV2) return;
  window.__ls26SingerBridgeV2 = true;

  const CONTROL_COLLECTION='karaokeControl';
  const CONTROL_DOC='liveLyrics';
  const SYNC_MS=2000;
  const songId=String(new URLSearchParams(location.search).get('id')||'').trim();
  let previewSent=false;
  let countInTimer=0;
  let countInPending=false;
  let lastPlaying=false;
  let lastSync=null;
  let syncTimer=0;

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function waitForReady(){
    for(let i=0;i<120;i+=1){
      if(window.db&&window.LS26Performance?.song?.()&&document.getElementById('autoScrollBtn'))return true;
      await sleep(100);
    }
    return false;
  }
  function currentSong(){return window.LS26Performance?.song?.()||null;}
  function currentBpm(){return Math.max(20,Math.min(400,Number(window.LS26Performance?.getBpm?.()||currentSong()?.userBpm||currentSong()?.originalBpm||96)||96));}
  function isPlaying(){return Boolean(window.LS26Performance?.isScrolling?.());}
  function followOn(){try{return Boolean(window.LS26TimedView?.enabled?.());}catch(_){return false;}}
  function controlRef(){return window.db.collection(CONTROL_COLLECTION).doc(CONTROL_DOC);}
  function songMeta(){
    const song=currentSong()||{};
    return {
      title:String(song.title||document.querySelector('#topbarSongTitle strong')?.textContent||'Untitled').trim(),
      artist:String(song.artist||document.querySelector('#topbarSongTitle span')?.textContent||'').replace(/^\s*[·-]\s*/,'').trim()
    };
  }
  async function write(data){
    try{await controlRef().set({...data,singerBridgeUpdatedAtMs:Date.now()},{merge:true});}
    catch(error){console.warn('Singer bridge update failed:',error);}
  }
  async function sendPreview(){
    if(!songId||previewSent)return;
    const {title,artist}=songMeta();
    previewSent=true;
    await write({
      currentLyricsSongId:songId,
      currentSongId:songId,
      songTitle:title,
      songArtist:artist,
      displayState:'preview',
      reset:false,
      singerPlayback:{state:'preview',songId,title,artist,updatedAtMs:Date.now()},
      singerSync:{enabled:false,playing:false,songId,activeSourceIndex:-1,previousSourceIndex:-1,nextSourceIndex:-1,sectionProgress:0,progressRatePerMs:0,updatedAtMs:Date.now()}
    });
  }

  function visibleSections(){
    const sections=Array.isArray(window.LS26Performance?.sections?.())?window.LS26Performance.sections():[];
    return sections.filter(el=>el&&el.isConnected&&!el.hidden&&getComputedStyle(el).display!=='none');
  }
  function performanceAnchor(){
    const header=document.getElementById('ls26StickyHeader');
    const quick=document.getElementById('performanceQuickInfo');
    const tuning=document.getElementById('guitarTuningCard');
    const head=(header?.getBoundingClientRect().height||0)+(quick&&!quick.classList.contains('past-karaoke-tools-window')?(quick.getBoundingClientRect().height||0):0)+(tuning&&!tuning.classList.contains('past-tuning-window')?(tuning.getBoundingClientRect().height||0):0);
    return Math.max(head+70,window.innerHeight*.40);
  }
  function activeSection(sections,anchor){
    const explicit=sections.find(el=>el.classList.contains('current-section')||el.dataset.focusState==='active');
    if(explicit)return explicit;
    let best=sections[0]||null,bestDistance=Infinity;
    sections.forEach(el=>{const top=el.getBoundingClientRect().top;const distance=Math.abs(top-anchor);if(top<=anchor+30&&distance<bestDistance){best=el;bestDistance=distance;}});
    return best;
  }
  function sourceIndex(el,fallback){
    const n=Number(el?.dataset?.sectionIndex ?? el?.dataset?.sourceIndex);
    return Number.isFinite(n)?n:fallback;
  }
  function buildSync(){
    const sections=visibleSections();
    if(!sections.length)return {enabled:true,playing:true,songId,activeSourceIndex:0,previousSourceIndex:-1,nextSourceIndex:-1,sectionProgress:0,progressRatePerMs:0,updatedAtMs:Date.now()};
    const anchor=performanceAnchor();
    const active=activeSection(sections,anchor)||sections[0];
    const index=Math.max(0,sections.indexOf(active));
    const previous=sections[index-1]||null,next=sections[index+1]||null;
    const activeTop=active.getBoundingClientRect().top;
    const nextTop=next?.getBoundingClientRect().top??activeTop;
    const span=Math.max(1,nextTop-activeTop);
    const progress=next?Math.max(0,Math.min(1,(anchor-activeTop)/span)):0;
    const now=Date.now();
    let rate=0;
    if(lastSync&&lastSync.active===active&&now-lastSync.at>50){
      rate=Math.max(0,Math.min(.02,(progress-lastSync.progress)/(now-lastSync.at)));
    }
    lastSync={active,progress,at:now};
    return {
      enabled:true,playing:true,songId,
      activeSourceIndex:sourceIndex(active,index),
      previousSourceIndex:sourceIndex(previous,-1),
      nextSourceIndex:sourceIndex(next,-1),
      sectionProgress:Number(progress.toFixed(4)),
      progressRatePerMs:Number(rate.toFixed(8)),
      pastOpacity:.48,upcomingOpacity:.56,previousOpacity:.58,activeOpacity:1,nextOpacity:.9,
      updatedAtMs:now
    };
  }
  async function writeSync(){
    if(!isPlaying()||countInPending)return;
    const sync=buildSync();
    await write({displayState:'song',singerPlayback:{state:'playing',songId,bpm:currentBpm(),updatedAtMs:Date.now()},singerSync:sync});
  }
  function startSyncLoop(){
    clearInterval(syncTimer);syncTimer=setInterval(()=>{if(isPlaying()&&!countInPending)void writeSync();},SYNC_MS);
    if(isPlaying()&&!countInPending)void writeSync();
  }
  function stopSyncLoop(){clearInterval(syncTimer);syncTimer=0;lastSync=null;}

  async function beginCountIn({delayHostStart=false}={}){
    clearTimeout(countInTimer);countInTimer=0;countInPending=true;
    const bpm=currentBpm(),beats=4,beatMs=60000/bpm,start=Date.now()+90,playAt=start+(beats*beatMs);
    await write({
      displayState:'song',
      singerPlayback:{state:'countin',songId,bpm,countInBeats:beats,countInStartMs:start,playAtMs:playAt,updatedAtMs:Date.now()},
      singerSync:{enabled:false,playing:false,songId,activeSourceIndex:-1,previousSourceIndex:-1,nextSourceIndex:-1,sectionProgress:0,progressRatePerMs:0,updatedAtMs:Date.now()}
    });
    countInTimer=setTimeout(async()=>{
      countInPending=false;
      if(delayHostStart&&!isPlaying())window.LS26Performance?.play?.();
      await write({displayState:'song',singerPlayback:{state:'playing',songId,bpm:currentBpm(),updatedAtMs:Date.now()}});
      lastPlaying=isPlaying();
      startSyncLoop();
    },Math.max(0,playAt-Date.now()));
  }

  function installPlayBridge(){
    const button=document.getElementById('autoScrollBtn');if(!button)return;
    button.addEventListener('click',event=>{
      const before=isPlaying();
      if(!before&&!countInPending&&!followOn()){
        // In normal auto-scroll mode, hold the host playback for exactly the
        // same four-beat singer count-in so both screens start together.
        event.preventDefault();event.stopImmediatePropagation();
        void beginCountIn({delayHostStart:true});
        return;
      }
      setTimeout(()=>{
        const after=isPlaying();
        if(!before&&after){void beginCountIn({delayHostStart:false});}
        else if(before&&!after){
          clearTimeout(countInTimer);countInPending=false;stopSyncLoop();
          void write({singerPlayback:{state:'paused',songId,bpm:currentBpm(),updatedAtMs:Date.now()},singerSync:{enabled:false,playing:false,songId,updatedAtMs:Date.now()}});
        }
        lastPlaying=after;
      },0);
    },true);
  }

  async function start(){
    if(!songId||!(await waitForReady()))return;
    await sendPreview();
    installPlayBridge();
    lastPlaying=isPlaying();
    setInterval(()=>{
      const playing=isPlaying();
      if(playing!==lastPlaying&&!countInPending){
        if(playing){void beginCountIn({delayHostStart:false});}
        else{stopSyncLoop();void write({singerPlayback:{state:'paused',songId,bpm:currentBpm(),updatedAtMs:Date.now()},singerSync:{enabled:false,playing:false,songId,updatedAtMs:Date.now()}});}
        lastPlaying=playing;
      }
    },300);
  }
  void start();
})();
