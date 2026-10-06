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
  let watchTimer = 0;
  let manualCountTimer = 0;
  let manualCountFinishTimer = 0;
  let programmaticStart = false;
  let countInActive = false;
  let lastPlaying = false;
  let lastRemoteAt = 0;
  let lastRemoteSection = null;
  let lastRemoteLyric = '';
  let lastProgressSample = null;
  const lyricMapCache = new Map();

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const norm = value => String(value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

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

  function chordOnly(text) {
    const line = String(text || '').trim();
    if (!line || line.length > 120) return false;
    const tokens = line.split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 16) return false;
    return tokens.every(token => /^([A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?|[|:()xX0-9.\-+*]+)$/.test(token));
  }

  function visualLines(html) {
    const root = document.createElement('div');
    root.innerHTML = String(html || '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(div|p|pre|li|h[1-6])>/gi, '\n</$1>');
    root.querySelectorAll('script,style,.ls26-inline-host-note,[data-host-note]').forEach(node => node.remove());
    return String(root.textContent || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(line => line.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim());
  }

  function sectionLyricMap(sectionIndex) {
    const key = Number(sectionIndex);
    if (lyricMapCache.has(key)) return lyricMapCache.get(key);
    const section = currentSong()?.sections?.[key];
    if (!section) return [];
    const source = visualLines(section.html || section.text || '');
    const singerHtml = window.LyricsCommon?.singerHTMLFromSection?.(section) || '';
    const displayed = visualLines(singerHtml).filter(Boolean);
    const mapped = [];
    let cursor = 0;
    displayed.forEach(text => {
      const wanted = norm(text);
      if (!wanted) return;
      let match = -1;
      for (let i = cursor; i < source.length; i += 1) {
        const candidate = norm(source[i]);
        if (!candidate) continue;
        if (candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate)) { match = i; break; }
      }
      if (match >= 0) {
        mapped.push({ sourceLineIndex:match, text });
        cursor = match + 1;
      }
    });
    lyricMapCache.set(key, mapped);
    return mapped;
  }

  function lyricTargetForChord(sectionIndex, lineIndex) {
    const sections = currentSong()?.sections || [];
    const section = sections[Number(sectionIndex)];
    if (!section) return { lineIndex:-1, text:'' };
    const lines = visualLines(section.html || section.text || '');
    const start = Number.isFinite(Number(lineIndex)) ? Number(lineIndex) : 0;
    let target = -1;
    for (let i = Math.max(0, start); i < lines.length; i += 1) {
      const text = lines[i];
      if (!text || chordOnly(text)) continue;
      if (/^(time\s+\d+\/\d+|performance note|host note|improv\b)/i.test(text)) continue;
      target = i;
      break;
    }
    if (target < 0) return { lineIndex:-1, text:'' };
    const map = sectionLyricMap(sectionIndex);
    const exact = map.find(row => row.sourceLineIndex === target) || map.find(row => row.sourceLineIndex >= target);
    return exact ? { lineIndex:exact.sourceLineIndex, text:exact.text } : { lineIndex:target, text:lines[target] };
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
    const lyricKey = `${sync.sourceIndex}:${sync.currentLyricLineIndex}:${norm(sync.currentLyricText)}`;
    const sectionChanged = sync.sourceIndex !== lastRemoteSection;
    const lyricChanged = lyricKey !== lastRemoteLyric;
    const remote = forceRemote || sectionChanged || lyricChanged || Date.now() - lastRemoteAt >= REMOTE_SYNC_MS;
    state = { ...state, phase:'playing', playing:true, sync, countInBeat:0, updatedAtMs:Date.now() };
    postLocal();
    if (remote) {
      lastRemoteSection = sync.sourceIndex;
      lastRemoteLyric = lyricKey;
      void writeRemote();
    }
  }

  function clearManualCountIn() {
    clearInterval(manualCountTimer); manualCountTimer = 0;
    clearTimeout(manualCountFinishTimer); manualCountFinishTimer = 0;
  }

  function startManualCountIn() {
    if (countInActive) return;
    clearManualCountIn();
    countInActive = true;
    const bpm = currentBpm();
    const beatMs = 60000 / bpm;
    let beat = 1;
    const fire = () => publish({ phase:'countin', playing:false, countInBeat:beat, countInBeatAtMs:Date.now(), sync:null }, { remote:true });
    fire();
    manualCountTimer = setInterval(() => {
      beat += 1;
      if (beat <= 4) fire();
    }, beatMs);
    manualCountFinishTimer = setTimeout(() => {
      clearManualCountIn();
      countInActive = false;
      programmaticStart = true;
      try { document.getElementById('autoScrollBtn')?.click(); }
      finally { programmaticStart = false; }
      publish({ phase:'playing', playing:true, countInBeat:0, sync:buildSync() }, { remote:true });
      pushSync({ forceRemote:true });
    }, beatMs * 4);
  }

  function onTransportSync(event) {
    if (!followOn()) return;
    const detail = event.detail || {};
    if (detail.phase === 'countin') {
      countInActive = true;
      publish({
        phase:'countin',
        playing:false,
        countInBeat:clamp(Number(detail.beat) || 1, 1, 32),
        countInBeatAtMs:Number(detail.atMs) || Date.now(),
        sync:null
      }, { remote:true });
      return;
    }
    if (detail.phase === 'playing') {
      countInActive = false;
      publish({ phase:'playing', playing:true, countInBeat:0, countInBeatAtMs:0, sync:buildSync() }, { remote:true });
      pushSync({ forceRemote:true });
    }
  }

  function installPlayInterlock() {
    const button = document.getElementById('autoScrollBtn');
    if (!button) return;

    window.addEventListener('click', event => {
      if (programmaticStart || event.target?.closest?.('#autoScrollBtn') !== button) return;
      const starting = !isPlaying();
      if (!starting) {
        clearManualCountIn();
        countInActive = false;
        setTimeout(() => publish({ phase:'paused', playing:false, countInBeat:0, sync:buildSync() }, { remote:true }), 0);
        return;
      }

      if (!followOn()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        startManualCountIn();
      } else {
        countInActive = true;
        publish({ phase:'countin', playing:false, countInBeat:0, countInBeatAtMs:Date.now(), sync:null }, { remote:true });
      }
    }, true);
  }

  function startLoops() {
    localTimer = setInterval(() => {
      if (isPlaying() && !countInActive) pushSync();
    }, LOCAL_SYNC_MS);

    watchTimer = setInterval(() => {
      const playing = isPlaying();
      if (playing !== lastPlaying && !countInActive) {
        if (playing) {
          publish({ phase:'playing', playing:true, countInBeat:0, sync:buildSync() }, { remote:true });
          pushSync({ forceRemote:true });
        } else {
          const complete = !document.getElementById('endCompletionPanel')?.hidden;
          publish({ phase:complete ? 'complete' : 'paused', playing:false, countInBeat:0, sync:buildSync() }, { remote:true });
        }
        lastPlaying = playing;
      }
    }, 200);
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
    await writeRemote();
    installPlayInterlock();
    window.addEventListener('ls26:singer-transport-sync', onTransportSync);
    startLoops();
    lastPlaying = isPlaying();

    window.addEventListener('pagehide', () => {
      clearInterval(localTimer); clearInterval(watchTimer); clearManualCountIn();
      try { channel?.close(); } catch (_) {}
    }, { once:true });
  }

  void start();
})();
