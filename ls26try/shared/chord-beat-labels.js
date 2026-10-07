/* Visual duration labels for timed chords. Read-only: never writes timing data. */
(() => {
  'use strict';
  if (window.LS26ChordBeatLabels) return;

  const cache = new Map();
  const scriptUrl = document.currentScript?.src || location.href;
  const ACTIVE_CHANNEL = 'ls26-active-chord-v1';
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const read = (key,fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } };
  let lyricTiming=null;

  function applyChordSettings(){
    const raw=read('ls26:singerChordCurrentColour','#16d8ff');
    const colour=/^#[0-9a-f]{6}$/i.test(raw)?raw:'#16d8ff';
    const opacity=clamp(Number(read('ls26:singerChordInactiveOpacity','.68'))||.68,.15,1);
    const root=document.documentElement.style;
    root.setProperty('--ls26-chord-current-colour',colour);
    root.setProperty('--ls26-chord-inactive-opacity',String(opacity));
  }

  function installStyles() {
    if (document.getElementById('ls26ChordBeatLabelStyles')) return;
    const style = document.createElement('style');
    style.id = 'ls26ChordBeatLabelStyles';
    style.textContent = `
      .ls26-chord-beat-marker{position:relative;display:inline-block;box-sizing:content-box;height:1em;margin-left:.14em;vertical-align:middle;pointer-events:none;user-select:none;line-height:1;color:inherit}
      .ls26-chord-beat-marker::after{content:attr(data-ls26-beat-dots);position:absolute;left:0;top:50%;transform:translateY(-50%);white-space:nowrap;color:inherit;font-size:.40em;font-weight:950;line-height:1;letter-spacing:.08em;opacity:1;text-shadow:none}
      .host-section-body .ls26-timed-chord{opacity:var(--ls26-chord-inactive-opacity,.68)!important;transition:opacity .12s ease,color .12s ease,outline-color .12s ease,background-color .12s ease!important}
      .host-section-body .ls26-timed-chord.ls26-active-chord{opacity:1!important;color:var(--ls26-chord-current-colour,#16d8ff)!important;outline-color:var(--ls26-chord-current-colour,#16d8ff)!important;background:color-mix(in srgb,var(--ls26-chord-current-colour,#16d8ff) 15%,transparent)!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--ls26-chord-current-colour,#16d8ff) 10%,transparent)!important}
      #ls26SingerV31Lyrics .ls26-singer-timed-chord{display:inline-block;opacity:var(--ls26-chord-inactive-opacity,.68);transition:opacity .12s ease,color .12s ease,outline-color .12s ease,background-color .12s ease}
      #ls26SingerV31Lyrics .ls26-singer-timed-chord.ls26-singer-active-chord{opacity:1!important;color:var(--ls26-chord-current-colour,#16d8ff)!important;outline:2px solid var(--ls26-chord-current-colour,#16d8ff)!important;outline-offset:3px;border-radius:4px;background:color-mix(in srgb,var(--ls26-chord-current-colour,#16d8ff) 15%,transparent)!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--ls26-chord-current-colour,#16d8ff) 10%,transparent)!important}
      body:not([data-guidance="guitaroke"]) #ls26SingerV31Lyrics .ls26-chord-beat-marker,body:not([data-guidance="guitaroke"]) #ls26SingerV31Lyrics .ls26-singer-timed-chord{opacity:inherit!important}
    `;
    document.head.appendChild(style);
  }

  function durationDots(value) {
    const beats = Number(value);
    if (!Number.isFinite(beats) || beats <= 0) return null;
    const rounded = Math.round(beats * 2) / 2;
    if (rounded > 16) return {text:`● ×${rounded}`,width:2.9,label:`${rounded} beats`};
    const full = Math.floor(rounded + 1e-9),half = rounded - full >= .49;
    const parts = Array(full).fill('●');if (half) parts.push('◐');
    return {text:parts.join(' '),width:Math.max(.48,(full+(half ? .65 : 0))*.52+.10),label:`${rounded} ${rounded===1?'beat':'beats'}`};
  }

  async function loadTiming(songId) {
    const id = String(songId || '').trim();if (!id || !window.db) return null;
    if (cache.has(id)) return cache.get(id);
    const promise = window.db.doc(`lyrics/${id}/musicalTiming/v1`).get().then(snap => snap.exists ? (snap.data() || null) : null).catch(error => { console.warn('Chord beat labels unavailable:', error); return null; });
    cache.set(id,promise);return promise;
  }

  function markerFor(event,doc=document) {
    const dots=durationDots(event?.durationBeats);if(!dots)return null;
    const marker=doc.createElement('span');marker.className='ls26-chord-beat-marker';marker.dataset.ls26BeatEvent=String(event.id||'');marker.dataset.ls26BeatDots=dots.text;marker.style.width=`${dots.width}em`;marker.title=dots.label;marker.setAttribute('aria-hidden','true');return marker;
  }
  function existing(root,event){const id=String(event?.id||'');return id?[...root.querySelectorAll('.ls26-chord-beat-marker')].find(node=>node.dataset.ls26BeatEvent===id)||null:null;}
  function timedTarget(root,event){const id=String(event?.id||'');return id?[...root.querySelectorAll('.ls26-timed-chord[data-ls26-event-id]')].find(node=>node.dataset.ls26EventId===id)||null:null;}
  function closestChordElement(node,root,symbol){let parent=node?.parentElement||null;while(parent&&parent!==root){if(parent.matches?.('.inserted-chord,.chord-token,[data-chord],[data-original-chord],span,b,strong')){const text=String(parent.textContent||'').trim();if(text===symbol||window.LS26Chords?.parse?.(text)?.symbol===symbol)return parent;}parent=parent.parentElement;}return null;}

  function wrapSingerTextChord(root,seg,start,end,event,marker){
    if(!seg?.node||seg.node.nodeType!==3)return null;
    const text=String(seg.node.nodeValue||''),a=clamp(Number(seg.offset||0)+start-Number(seg.start||0),0,text.length),b=clamp(Number(seg.offset||0)+end-Number(seg.start||0),a,text.length);if(b<=a)return null;
    const doc=root.ownerDocument||document,range=doc.createRange();range.setStart(seg.node,a);range.setEnd(seg.node,b);
    const wrap=doc.createElement('span');wrap.className='ls26-singer-timed-chord';wrap.dataset.ls26EventId=String(event.id||'');wrap.append(range.extractContents());wrap.append(marker);range.insertNode(wrap);return wrap;
  }

  function insertAtAnchor(root,event,{lineIndexOverride=null,singer=false}={}) {
    if(!root||!event?.sourceAnchor||existing(root,event))return false;
    const marker=markerFor(event,root.ownerDocument||document);if(!marker)return false;
    if(!singer){const target=timedTarget(root,event);if(!target)return false;target.append(marker);return true;}

    const a=event.sourceAnchor,symbol=String(event.chord||event.symbol||'').trim();if(!symbol)return false;
    const lines=window.LS26Chords?.logicalLines?.(root,{locations:true,original:true})||[],lineIndex=lineIndexOverride===null?Number(a.lineIndex):Number(lineIndexOverride),row=lines[lineIndex];if(!row)return false;
    const start=Number(a.start),end=Number(a.end);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||String(row.text||'').slice(start,end).trim()!==symbol)return false;
    const seg=(row.segments||[]).find(part=>part.start<end&&part.end>=end);if(!seg)return false;
    const chordEl=seg.element||closestChordElement(seg.node,root,symbol);
    if(chordEl){chordEl.classList.add('ls26-singer-timed-chord');chordEl.dataset.ls26EventId=String(event.id||'');chordEl.append(marker);return true;}
    return Boolean(wrapSingerTextChord(root,seg,start,end,event,marker));
  }

  function decorateLyricView(timing) {
    installStyles();applyChordSettings();if(!timing?.events?.length)return 0;
    let count=0;timing.events.forEach(event=>{if(Number(event.durationBeats)>0){const body=document.querySelector(`.host-section[data-section-index="${Number(event.sourceAnchor?.sectionIndex)}"] .host-section-body`);if(body&&insertAtAnchor(body,event))count++;}});return count;
  }
  function decorateSinger(timing) {
    installStyles();applyChordSettings();const root=document.getElementById('ls26SingerV31Lyrics');if(!root||!timing?.events?.length)return 0;
    let count=0;root.querySelectorAll('.ls26-singer-v31-section').forEach(section=>{const sectionIndex=Number(section.dataset.sourceIndex);section.querySelectorAll('.ls26-singer-v31-line.is-chord-line[data-source-line-index]').forEach(line=>{const sourceLineIndex=Number(line.dataset.sourceLineIndex);timing.events.filter(event=>Number(event.sourceAnchor?.sectionIndex)===sectionIndex&&Number(event.sourceAnchor?.lineIndex)===sourceLineIndex).sort((a,b)=>Number(b.sourceAnchor?.start||0)-Number(a.sourceAnchor?.start||0)).forEach(event=>{if(insertAtAnchor(line,event,{lineIndexOverride:0,singer:true}))count++;});});});return count;
  }

  async function ensurePrompterSettings(){
    if(!window.LS26PrompterSettings)await new Promise(resolve=>{const script=document.createElement('script');script.src=new URL('prompter-settings.js?v=20261007-singer-display-v2',scriptUrl).href;script.onload=script.onerror=resolve;document.head.appendChild(script);});
    try{await window.LS26PrompterSettings?.load?.();}catch(_){}applyChordSettings();
  }
  async function refreshLyricView(){if(!/\/host\/lyricview\.html$/i.test(location.pathname))return;const song=window.LS26Performance?.song?.(),id=String(song?.id||new URLSearchParams(location.search).get('id')||'').trim();if(!song||!id)return;lyricTiming=await loadTiming(id);if(lyricTiming)decorateLyricView(lyricTiming);}

  let singerSongId='',singerTiming=null,singerLookupTimer=0;
  async function refreshSingerSong(){if(!/\/host\/karaoke-lyric-view\.html$/i.test(location.pathname)||!window.db)return;try{const snap=await window.db.doc('karaokeControl/liveLyrics').get(),data=snap.exists?(snap.data()||{}):{},id=String(data.currentLyricsSongId||data.currentSongId||data.songId||data.singerV3?.songId||'').trim();if(!id)return;if(id!==singerSongId){singerSongId=id;singerTiming=await loadTiming(id);}if(singerTiming)decorateSinger(singerTiming);}catch(error){console.warn('Singer chord beat labels unavailable:',error);}}
  function queueSingerRefresh(){clearTimeout(singerLookupTimer);singerLookupTimer=setTimeout(refreshSingerSong,80);}

  function installHostTimingObserver(){
    if(!/\/host\/lyricview\.html$/i.test(location.pathname))return;const root=document.getElementById('lyricsContent');if(!root)return;
    let queued=false;new MutationObserver(records=>{if(!lyricTiming||queued||!records.some(record=>record.type==='childList'))return;queued=true;requestAnimationFrame(()=>{queued=false;decorateLyricView(lyricTiming);});}).observe(root,{subtree:true,childList:true});
  }
  function installActiveChordSync(){
    let channel=null;try{channel=new BroadcastChannel(ACTIVE_CHANNEL);}catch(_){}
    if(/\/host\/lyricview\.html$/i.test(location.pathname)){
      const send=()=>{const active=document.querySelector('.host-section-body .ls26-active-chord[data-ls26-event-id]');if(active&&channel)channel.postMessage({type:'active-chord',eventId:active.dataset.ls26EventId||''});};
      const root=document.getElementById('lyricsContent');if(root)new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'&&r.attributeName==='class'))send();}).observe(root,{subtree:true,attributes:true,attributeFilter:['class']});window.addEventListener('ls26:metronome-beat',send);
    }
    if(/\/host\/karaoke-lyric-view\.html$/i.test(location.pathname)&&channel)channel.onmessage=event=>{if(event.data?.type!=='active-chord')return;const id=String(event.data.eventId||'');document.querySelectorAll('#ls26SingerV31Lyrics .ls26-singer-timed-chord').forEach(node=>node.classList.toggle('ls26-singer-active-chord',Boolean(id)&&node.dataset.ls26EventId===id));};
    if(channel)window.addEventListener('pagehide',()=>channel.close(),{once:true});
  }

  function init(){
    installStyles();applyChordSettings();void ensurePrompterSettings();installHostTimingObserver();installActiveChordSync();
    window.addEventListener('ls26:prompter-settings',()=>{applyChordSettings();if(lyricTiming)decorateLyricView(lyricTiming);if(singerTiming)requestAnimationFrame(()=>decorateSinger(singerTiming));});
    window.addEventListener('storage',event=>{if(event.key==='ls26:singerChordCurrentColour'||event.key==='ls26:singerChordInactiveOpacity')applyChordSettings();});
    if(/\/host\/lyricview\.html$/i.test(location.pathname)){window.addEventListener('ls26:song-ready',refreshLyricView);void refreshLyricView();}
    if(/\/host\/karaoke-lyric-view\.html$/i.test(location.pathname)){const title=document.getElementById('singerTitle'),lyrics=document.getElementById('ls26SingerV31Lyrics');if(title)new MutationObserver(queueSingerRefresh).observe(title,{childList:true,subtree:true,characterData:true});if(lyrics)new MutationObserver(()=>{if(singerTiming)decorateSinger(singerTiming);}).observe(lyrics,{childList:true,subtree:true});window.addEventListener('storage',event=>{if(event.key==='karaokeGuidanceMode'&&singerTiming)requestAnimationFrame(()=>decorateSinger(singerTiming));});queueSingerRefresh();}
  }

  window.LS26ChordBeatLabels=Object.freeze({loadTiming,decorateLyricView,decorateSinger,refreshLyricView,durationDots});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
