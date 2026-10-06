/* LiveSuite LyricView -> Singer Screen bridge v3.2.
 * Keeps the singer display aligned with LyricView in both pixel-scroll and
 * Chord Follow modes. BroadcastChannel gives same-device tabs low-latency
 * updates; Firestore remains the cross-device fallback.
 */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerBridgeV3) return;
  window.__ls26SingerBridgeV3 = true;
  window.__ls26SingerBridgeV2 = true;

  const COLLECTION = 'karaokeControl';
  const DOC = 'liveLyrics';
  const CHANNEL = 'ls26-singer-live-v3';
  const LOCAL_SYNC_MS = 50;
  const REMOTE_SYNC_MS = 2000;
  const songId = String(new URLSearchParams(location.search).get('id') || '').trim();

  let channel = null;
  try { if ('BroadcastChannel' in window) channel = new BroadcastChannel(CHANNEL); } catch (_) {}

  let state = null;
  let localTimer = 0;

  let countInActive = false;

  let lastRemoteAt = 0;
  let lastProgressSample = null;
  const lyricMapCache = new Map();

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  async function waitForReady() {
    for (let i = 0; i < 150; i += 1) {
      if (window.db && window.LS26Performance?.song?.() && document.getElementById('autoScrollBtn')) return true;
      await sleep(100);
    }
    return false;
  }

  function currentSong() { return window.LS26Performance?.song?.() || null; }
  function currentBpm() {
    const song = currentSong() || {};
    return clamp(Number(window.LS26Performance?.getBpm?.() || song.userBpm || song.originalBpm || 96) || 96, 20, 400);
  }
  function isPlaying() { return Boolean(window.LS26Performance?.isScrolling?.()); }
  function followOn() {
    try { return Boolean(window.LS26TimedView?.enabled?.()); }
    catch (_) { return false; }
  }
  function meta() {
    const song = currentSong() || {};
    return {
      title: String(song.title || document.querySelector('#topbarSongTitle strong')?.textContent || 'Untitled').trim(),
      artist: String(song.artist || document.querySelector('#topbarSongTitle span')?.textContent || '').replace(/^\s*[·-]\s*/, '').trim()
    };
  }
  function ref() { return window.db.collection(COLLECTION).doc(DOC); }

  function postLocal() {
    if (!state) return;
    const message = { type:'state', state:{ ...state }, sentAtMs:Date.now() };
    try { channel?.postMessage(message); } catch (_) {}
    if (!channel) {
      try { localStorage.setItem('ls26:singer-v3-state', JSON.stringify(message)); } catch (_) {}
    }
  }

  async function writeRemote() {
    if (!state || !songId) return;
    const payload = { ...state, updatedAtMs:Date.now() };
    state = payload;
    lastRemoteAt = Date.now();
    try {
      await ref().set({
        reset:false,
        currentLyricsSongId:songId,
        currentSongId:songId,
        songTitle:payload.title,
        songArtist:payload.artist,
        displayState:payload.phase === 'preview' ? 'preview' : 'song',
        singerV3:payload,
        singerPlayback:{
          state:payload.phase === 'countin' ? 'countin' : payload.phase,
          songId,
          bpm:payload.bpm,
          countInBeat:payload.countInBeat || 0,
          updatedAtMs:payload.updatedAtMs
        }
      }, { merge:true });
    } catch (error) {
      console.warn('Singer v3 bridge update failed:', error);
    }
  }

  function publish(partial, { remote=false } = {}) {
    if (!state) return;
    state = { ...state, ...partial, bpm:currentBpm(), updatedAtMs:Date.now() };
    postLocal();
    if (remote) void writeRemote();
  }

  function sectionLyricMap(sectionIndex) {
    const key=Number(sectionIndex);
    if(!lyricMapCache.has(key))lyricMapCache.set(key,window.LS26SingerLines.section(currentSong()?.sections?.[key]||{},document));
    return lyricMapCache.get(key);
  }
  function lyricTargetForChord(sectionIndex,lineIndex) {
    const row=window.LS26SingerLines.target(sectionLyricMap(sectionIndex),lineIndex);
    return row?{lineIndex:row.sourceLineIndex,text:row.text}:{lineIndex:-1,text:''};
  }

  function visibleSections() {
    const sections = Array.isArray(window.LS26Performance?.sections?.()) ? window.LS26Performance.sections() : [];
    return sections.filter(el => el && el.isConnected && !el.hidden && getComputedStyle(el).display !== 'none');
  }

  function performanceAnchor() {
    const header = document.getElementById('ls26StickyHeader');
    const quick = document.getElementById('performanceQuickInfo');
    const tuning = document.getElementById('guitarTuningCard');
    const head = (header?.getBoundingClientRect().height || 0)
      + (quick && !quick.classList.contains('past-karaoke-tools-window') ? (quick.getBoundingClientRect().height || 0) : 0)
      + (tuning && !tuning.classList.contains('past-tuning-window') ? (tuning.getBoundingClientRect().height || 0) : 0);
    return Math.max(head + 70, innerHeight * .40);
  }

  function activeSectionFromViewport(sections, anchor) {
    let best = sections[0] || null;
    let bestDistance = Infinity;
    sections.forEach(el => {
      const top = el.getBoundingClientRect().top;
      if (top <= anchor + 30) {
        const distance = Math.abs(anchor - top);
        if (distance < bestDistance) { best = el; bestDistance = distance; }
      }
    });
    return best;
  }

  function buildSync() {
    // Timed playback needs source anchors only, never repeated layout scans.
    const timed=followOn()?window.LS26TimedView?.snapshot?.():null;
    if(timed?.event){
      const {sectionIndex,lineIndex}=timed.event.sourceAnchor,target=lyricTargetForChord(sectionIndex,lineIndex);
      return {sourceIndex:sectionIndex,activeLineIndex:lineIndex,currentLyricLineIndex:target.lineIndex,currentLyricText:target.text,followOn:true,updatedAtMs:Date.now()};
    }
    const sections = visibleSections();
    const anchor = performanceAnchor();
    const activeChord = document.querySelector('.ls26-active-chord[data-ls26-section-index]');
    let active = null;
    let sourceIndex = -1;
    let activeLineIndex = -1;
    let currentLyricLineIndex = -1;
    let currentLyricText = '';

    if (activeChord) {
      sourceIndex = Number(activeChord.dataset.ls26SectionIndex);
      activeLineIndex = Number(activeChord.dataset.ls26LineIndex);
      active = sections.find(el => Number(el.dataset.sectionIndex) === sourceIndex) || null;
      const target = lyricTargetForChord(sourceIndex, activeLineIndex);
      currentLyricLineIndex = target.lineIndex;
      currentLyricText = target.text;
    }

    if (!active) {
      active = activeSectionFromViewport(sections, anchor);
      sourceIndex = Number(active?.dataset?.sectionIndex);
      if (!Number.isFinite(sourceIndex)) sourceIndex = Math.max(0, sections.indexOf(active));
    }

    const index = Math.max(0, sections.indexOf(active));
    const previous = sections[index - 1] || null;
    const next = sections[index + 1] || null;
    const activeTop = active?.getBoundingClientRect().top ?? anchor;
    const nextTop = next?.getBoundingClientRect().top ?? activeTop;
    const span = Math.max(1, nextTop - activeTop);
    const progress = next ? clamp((anchor - activeTop) / span, 0, 1) : 0;
    const now = Date.now();
    let rate = 0;
    if (lastProgressSample && lastProgressSample.sourceIndex === sourceIndex && now - lastProgressSample.at > 30) {
      rate = clamp((progress - lastProgressSample.progress) / (now - lastProgressSample.at), 0, .02);
    }
    lastProgressSample = { sourceIndex, progress, at:now };

    const maxHostScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    return {
      sourceIndex,
      previousSourceIndex:Number(previous?.dataset?.sectionIndex ?? -1),
      nextSourceIndex:Number(next?.dataset?.sectionIndex ?? -1),
      sectionProgress:Number(progress.toFixed(4)),
      progressRatePerMs:Number(rate.toFixed(8)),
      activeLineIndex:Number.isFinite(activeLineIndex) ? activeLineIndex : -1,
      currentLyricLineIndex:Number.isFinite(currentLyricLineIndex) ? currentLyricLineIndex : -1,
      currentLyricText,
      scrollFraction:Number(clamp(scrollY / maxHostScroll, 0, 1).toFixed(5)),
      followOn:followOn(),
      updatedAtMs:now
    };
  }

  function pushSync({ forceRemote=false } = {}) {
    if (!state || !isPlaying() || countInActive) return;
    const sync = buildSync();
    const remote = forceRemote || Date.now() - lastRemoteAt >= REMOTE_SYNC_MS;
    state = { ...state, phase:'playing', playing:true, sync, countInBeat:0, updatedAtMs:Date.now() };
    postLocal();
    if (remote) {
      void writeRemote();
    }
  }

  function stopSync(){clearInterval(localTimer);localTimer=0;}
  function startSync(){if(!localTimer)localTimer=setInterval(()=>pushSync(),LOCAL_SYNC_MS);}
  function onTransportState(event){
    const snap=event.detail||{};
    if(snap.state==='playing'&&isPlaying()){
      const target=followOn()?(Number(window.LS26TimedView?.startBeat?.())||0):0;
      countInActive=Number(snap.beat)<target-1e-5;
      publish({phase:countInActive?'countin':'playing',playing:!countInActive,countInBeat:0,sync:countInActive?null:buildSync()},{remote:true});
      if(countInActive)stopSync();else startSync();
    } else if((snap.state==='paused'||snap.state==='stopped')&&state?.phase!=='preview'&&state?.phase!=='paused'&&state?.phase!=='complete'){
      countInActive=false;stopSync();publish({phase:'paused',playing:false,countInBeat:0,sync:buildSync()},{remote:true});
    }
  }
  function onBeat(event){
    if(!isPlaying())return;
    const beat=event.detail||{};
    if(beat.countIn){
      countInActive=true;stopSync();
      // This is the metronome's due audio beat, including dynamic meter.
      // Local delivery every beat; remote state remains rate limited.
      publish({phase:'countin',playing:false,countInBeat:beat.beat,sync:null},{remote:Date.now()-lastRemoteAt>=REMOTE_SYNC_MS});
    }else if(countInActive){
      countInActive=false;publish({phase:'playing',playing:true,countInBeat:0,sync:buildSync()},{remote:true});startSync();
    }
  }

  async function start() {
    if (!songId || !(await waitForReady())) return;
    const { title, artist } = meta();
    state = {
      version:3,
      songId,
      title,
      artist,
      bpm:currentBpm(),
      phase:'preview',
      playing:false,
      countInBeat:0,
      countInBeatAtMs:0,
      sync:null,
      updatedAtMs:Date.now()
    };
    postLocal();
    void writeRemote();
    window.addEventListener('ls26:transport-state',onTransportState);
    window.addEventListener('ls26:metronome-beat',onBeat);
    window.addEventListener('ls26:scroll-state',event=>{
      if(event.detail?.playing&&window.LS26Click?.driver?.().snapshot().state==='stopped')countInActive=true;
      if(!event.detail?.playing&&state?.phase!=='paused'&&state?.phase!=='complete'){countInActive=false;stopSync();publish({phase:'paused',playing:false,countInBeat:0,sync:buildSync()},{remote:true});}
    });
    window.addEventListener('ls26:song-finished',()=>{stopSync();publish({phase:'complete',playing:false,countInBeat:0,sync:buildSync()},{remote:true});});
    if(channel)channel.onmessage=event=>{if(event.data?.type==='request-state')postLocal();};

    window.addEventListener('pagehide', () => {
      stopSync();
      try { channel?.close(); } catch (_) {}
    }, { once:true });
  }

  window.LS26SingerBridge=Object.freeze({countingIn:()=>countInActive});
  void start();
})();
