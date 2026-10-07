/* Visual duration labels for timed chords. Read-only: never writes timing data. */
(() => {
  'use strict';
  if (window.LS26ChordBeatLabels) return;

  const cache = new Map();
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const escId = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g,'_');

  function installStyles() {
    if (document.getElementById('ls26ChordBeatLabelStyles')) return;
    const style = document.createElement('style');
    style.id = 'ls26ChordBeatLabelStyles';
    style.textContent = `
      .ls26-chord-beat-marker{
        position:relative;
        display:inline-block;
        height:0;
        vertical-align:baseline;
        pointer-events:none;
        user-select:none;
      }
      .ls26-chord-beat-marker::after{
        content:attr(data-ls26-beat-dots);
        position:absolute;
        left:.16em;
        top:-.78em;
        white-space:nowrap;
        color:#74cfe6;
        font-size:.52em;
        font-weight:900;
        letter-spacing:.06em;
        opacity:.72;
        text-shadow:none;
      }
      .host-section-body .ls26-chord-beat-marker::after{
        top:-.72em;
        color:color-mix(in srgb,var(--ls-accent,#16d8ff) 68%,#d9f7ff);
      }
      #ls26SingerV31Lyrics .ls26-chord-beat-marker::after{
        top:-.74em;
        color:#8bdcf0;
        opacity:.78;
      }
      body:not([data-guidance="guitaroke"]) #ls26SingerV31Lyrics .ls26-chord-beat-marker{
        display:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function durationDots(value) {
    const beats = Number(value);
    if (!Number.isFinite(beats) || beats <= 0) return null;
    const rounded = Math.round(beats * 2) / 2;
    if (rounded > 16) return {text:`• ×${rounded}`,width:2.8,label:`${rounded} beats`};
    const full = Math.floor(rounded + 1e-9);
    const half = rounded - full >= .49;
    const parts = Array(full).fill('•');
    if (half) parts.push('·');
    const text = parts.join(' ');
    const units = full + (half ? .55 : 0);
    return {text,width:Math.max(.46,units * .48 + .12),label:`${rounded} ${rounded === 1 ? 'beat' : 'beats'}`};
  }

  async function loadTiming(songId) {
    const id = String(songId || '').trim();
    if (!id || !window.db) return null;
    if (cache.has(id)) return cache.get(id);
    const promise = window.db.doc(`lyrics/${id}/musicalTiming/v1`).get()
      .then(snap => snap.exists ? (snap.data() || null) : null)
      .catch(error => {
        console.warn('Chord beat labels unavailable:', error);
        return null;
      });
    cache.set(id,promise);
    return promise;
  }

  function markerFor(event,doc=document) {
    const dots = durationDots(event?.durationBeats);
    if (!dots) return null;
    const marker = doc.createElement('span');
    marker.className = 'ls26-chord-beat-marker';
    marker.dataset.ls26BeatEvent = String(event.id || '');
    marker.dataset.ls26BeatDots = dots.text;
    marker.style.width = `${dots.width}em`;
    marker.title = dots.label;
    marker.setAttribute('aria-hidden','true');
    return marker;
  }

  function existing(root,event) {
    const id = String(event?.id || '');
    return id ? root.querySelector(`.ls26-chord-beat-marker[data-ls26-beat-event="${CSS.escape ? CSS.escape(id) : escId(id)}"]`) : null;
  }

  function closestChordElement(node,root,symbol) {
    let parent = node?.parentElement || null;
    while (parent && parent !== root) {
      if (parent.matches?.('.inserted-chord,.chord-token,[data-chord],[data-original-chord],span,b,strong')) {
        const text = String(parent.textContent || '').trim();
        if (text === symbol || window.LS26Chords?.parse?.(text)?.symbol === symbol) return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  function insertAfterAnchor(root,event,{lineIndexOverride=null}={}) {
    if (!root || !event?.sourceAnchor || existing(root,event)) return false;
    const a = event.sourceAnchor;
    const symbol = String(event.chord || event.symbol || '').trim();
    if (!symbol) return false;
    const lines = window.LS26Chords?.logicalLines?.(root,{locations:true,original:true}) || [];
    const lineIndex = lineIndexOverride === null ? Number(a.lineIndex) : Number(lineIndexOverride);
    const row = lines[lineIndex];
    if (!row) return false;
    const start = Number(a.start), end = Number(a.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return false;
    if (String(row.text || '').slice(start,end).trim() !== symbol) return false;
    const marker = markerFor(event,root.ownerDocument || document);
    if (!marker) return false;

    const seg = (row.segments || []).find(part => part.start < end && part.end >= end);
    if (!seg) return false;

    if (seg.element) {
      seg.element.insertAdjacentElement('afterend',marker);
      return true;
    }

    const chordEl = closestChordElement(seg.node,root,symbol);
    if (chordEl) {
      chordEl.insertAdjacentElement('afterend',marker);
      return true;
    }

    if (!seg.node || seg.node.nodeType !== Node.TEXT_NODE) return false;
    const offset = clamp(Number(seg.offset || 0) + end - Number(seg.start || 0),0,String(seg.node.nodeValue || '').length);
    const range = (root.ownerDocument || document).createRange();
    range.setStart(seg.node,offset);
    range.collapse(true);
    range.insertNode(marker);
    return true;
  }

  function clearMarkers(root) {
    root?.querySelectorAll?.('.ls26-chord-beat-marker').forEach(node => node.remove());
  }

  function decorateLyricView(timing) {
    installStyles();
    if (!timing?.events?.length) return 0;
    let count = 0;
    timing.events.forEach(event => {
      if (!Number.isFinite(Number(event.durationBeats)) || Number(event.durationBeats) <= 0) return;
      const section = document.querySelector(`.host-section[data-section-index="${Number(event.sourceAnchor?.sectionIndex)}"]`);
      const body = section?.querySelector('.host-section-body');
      if (body && insertAfterAnchor(body,event)) count += 1;
    });
    return count;
  }

  function decorateSinger(timing) {
    installStyles();
    const root = document.getElementById('ls26SingerV31Lyrics');
    if (!root || !timing?.events?.length) return 0;
    let count = 0;
    root.querySelectorAll('.ls26-singer-v31-section').forEach(section => {
      const sectionIndex = Number(section.dataset.sourceIndex);
      section.querySelectorAll('.ls26-singer-v31-line.is-chord-line[data-source-line-index]').forEach(line => {
        const sourceLineIndex = Number(line.dataset.sourceLineIndex);
        const events = timing.events
          .filter(event => Number(event.sourceAnchor?.sectionIndex) === sectionIndex && Number(event.sourceAnchor?.lineIndex) === sourceLineIndex)
          .sort((a,b) => Number(b.sourceAnchor?.start || 0) - Number(a.sourceAnchor?.start || 0));
        events.forEach(event => { if (insertAfterAnchor(line,event,{lineIndexOverride:0})) count += 1; });
      });
    });
    return count;
  }

  async function refreshLyricView() {
    if (!/\/host\/lyricview\.html$/i.test(location.pathname)) return;
    const song = window.LS26Performance?.song?.();
    const id = String(song?.id || new URLSearchParams(location.search).get('id') || '').trim();
    if (!song || !id) return;
    const timing = await loadTiming(id);
    if (timing) decorateLyricView(timing);
  }

  let singerSongId = '';
  let singerTiming = null;
  let singerLookupTimer = 0;
  async function refreshSingerSong() {
    if (!/\/host\/karaoke-lyric-view\.html$/i.test(location.pathname) || !window.db) return;
    try {
      const snap = await window.db.doc('karaokeControl/liveLyrics').get();
      const data = snap.exists ? (snap.data() || {}) : {};
      const id = String(data.currentLyricsSongId || data.currentSongId || data.songId || data.singerV3?.songId || '').trim();
      if (!id) return;
      if (id !== singerSongId) {
        singerSongId = id;
        singerTiming = await loadTiming(id);
      }
      if (singerTiming) decorateSinger(singerTiming);
    } catch (error) {
      console.warn('Singer chord beat labels unavailable:', error);
    }
  }
  function queueSingerRefresh() {
    clearTimeout(singerLookupTimer);
    singerLookupTimer = setTimeout(refreshSingerSong,80);
  }

  function init() {
    installStyles();
    if (/\/host\/lyricview\.html$/i.test(location.pathname)) {
      window.addEventListener('ls26:song-ready',refreshLyricView);
      void refreshLyricView();
    }
    if (/\/host\/karaoke-lyric-view\.html$/i.test(location.pathname)) {
      const title = document.getElementById('singerTitle');
      const lyrics = document.getElementById('ls26SingerV31Lyrics');
      if (title) new MutationObserver(queueSingerRefresh).observe(title,{childList:true,subtree:true,characterData:true});
      if (lyrics) new MutationObserver(() => { if (singerTiming) decorateSinger(singerTiming); }).observe(lyrics,{childList:true,subtree:true});
      window.addEventListener('ls26:prompter-settings',() => { if (singerTiming) requestAnimationFrame(()=>decorateSinger(singerTiming)); });
      window.addEventListener('storage',event => { if (event.key === 'karaokeGuidanceMode' && singerTiming) requestAnimationFrame(()=>decorateSinger(singerTiming)); });
      queueSingerRefresh();
    }
  }

  window.LS26ChordBeatLabels = Object.freeze({loadTiming,decorateLyricView,decorateSinger,refreshLyricView});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
