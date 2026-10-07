/* Visual duration labels for timed chords. Read-only: never writes timing data. */
(() => {
  'use strict';
  if(window.LS26ChordBeatLabels)return;
  const cache=new Map(),ACTIVE_CHANNEL='ls26-active-chord-v1';
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch(_){return fallback;}};
  let lyricTiming=null,singerTiming=null,singerSongId='',singerTimer=0;
  function settings(){
    const raw=String(read('ls26:singerChordCurrentColour','#16d8ff')),colour=/^#[0-9a-f]{6}$/i.test(raw)?raw:'#16d8ff';
    document.documentElement.style.setProperty('--ls26-chord-current-colour',colour);
    document.documentElement.style.setProperty('--ls26-chord-inactive-opacity',String(clamp(Number(read('ls26:singerChordInactiveOpacity','.68'))||.68,.15,1)));
  }
  function setRunning(value){document.documentElement.classList.toggle('ls26-chord-playback-running',value===true);}
  function installStyles(){
    if(document.getElementById('ls26ChordBeatLabelStyles'))return;
    const style=document.createElement('style');style.id='ls26ChordBeatLabelStyles';style.textContent=`
      .ls26-chord-beat-marker{position:relative;display:inline-block;box-sizing:content-box;height:1em;margin-left:.14em;vertical-align:middle;pointer-events:none;user-select:none;line-height:1;color:inherit}
      .ls26-chord-beat-marker::after{content:attr(data-ls26-beat-dots);position:absolute;left:0;top:50%;transform:translateY(-50%);white-space:nowrap;color:inherit;font-size:.40em;font-weight:950;line-height:1;letter-spacing:.08em;opacity:.54}
      .host-section-body .ls26-timed-chord,#ls26SingerV31Lyrics .ls26-singer-timed-chord{opacity:1!important;transition:opacity .12s ease,color .12s ease,outline-color .12s ease,background-color .12s ease!important}
      html.ls26-chord-playback-running .host-section-body .ls26-timed-chord,html.ls26-chord-playback-running #ls26SingerV31Lyrics .ls26-singer-timed-chord{opacity:var(--ls26-chord-inactive-opacity,.68)!important}
      .host-section-body .ls26-timed-chord.ls26-active-chord,#ls26SingerV31Lyrics .ls26-singer-timed-chord.ls26-singer-active-chord{opacity:1!important;color:var(--ls26-chord-current-colour,#16d8ff)!important;background:color-mix(in srgb,var(--ls26-chord-current-colour,#16d8ff) 15%,transparent)!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--ls26-chord-current-colour,#16d8ff) 10%,transparent)!important}
      #ls26SingerV31Lyrics .ls26-singer-timed-chord.ls26-singer-active-chord{outline:2px solid var(--ls26-chord-current-colour,#16d8ff)!important;outline-offset:3px;border-radius:4px}
      .host-section-body .ls26-timed-chord.ls26-active-chord .ls26-chord-beat-marker::after,#ls26SingerV31Lyrics .ls26-singer-timed-chord.ls26-singer-active-chord .ls26-chord-beat-marker::after{opacity:1!important}
      body:not([data-guidance="guitaroke"]) #ls26SingerV31Lyrics .ls26-chord-beat-marker,body:not([data-guidance="guitaroke"]) #ls26SingerV31Lyrics .ls26-singer-timed-chord{display:none!important}
    `;document.head.appendChild(style);
  }
  function durationDots(value){
    const beats=Number(value);if(!Number.isFinite(beats)||beats<=0)return null;
    const rounded=Math.round(beats*2)/2;if(rounded>16)return{text:`● ×${rounded}`,width:2.9,label:`${rounded} beats`};
    const full=Math.floor(rounded+1e-9),half=rounded-full>=.49,parts=Array(full).fill('●');if(half)parts.push('◐');
    const units=full+(half ? .65 : 0);return{text:parts.join(' '),width:Math.max(.48,units*.52+.10),label:`${rounded} ${rounded===1?'beat':'beats'}`};
  }
  async function loadTiming(songId){
    const id=String(songId||'').trim();if(!id||!window.db)return null;if(cache.has(id))return cache.get(id);
    const work=window.db.doc(`lyrics/${id}/musicalTiming/v1`).get().then(s=>s.exists?(s.data()||null):null).catch(error=>{console.warn('Chord beat labels unavailable:',error);return null;});cache.set(id,work);return work;
  }
  function marker(event,doc=document){const dots=durationDots(event?.durationBeats);if(!dots)return null;const node=doc.createElement('span');node.className='ls26-chord-beat-marker';node.dataset.ls26BeatEvent=String(event.id||'');node.dataset.ls26BeatDots=dots.text;node.style.width=`${dots.width}em`;node.title=dots.label;node.setAttribute('aria-hidden','true');return node;}
  function hasMarker(root,id){return Boolean(id&&[...root.querySelectorAll('.ls26-chord-beat-marker')].some(node=>node.dataset.ls26BeatEvent===String(id)));}
  function decorateLyricView(timing){
    installStyles();settings();if(!timing?.events?.length)return 0;let count=0;
    for(const event of timing.events){if(Number(event.durationBeats)<=0)continue;const id=String(event.id||''),body=document.querySelector(`.host-section[data-section-index="${Number(event.sourceAnchor?.sectionIndex)}"] .host-section-body`);if(!body||hasMarker(body,id))continue;const target=[...body.querySelectorAll('.ls26-timed-chord[data-ls26-event-id]')].find(node=>node.dataset.ls26EventId===id);const dot=marker(event,body.ownerDocument||document);if(target&&dot){target.append(dot);count++;}}
    return count;
  }
  function closestChord(node,root,symbol){let parent=node?.parentElement;while(parent&&parent!==root){if(parent.matches?.('.inserted-chord,.chord-token,[data-chord],[data-original-chord],span,b,strong')){const value=String(parent.textContent||'').trim();if(value===symbol||window.LS26Chords?.parse?.(value)?.symbol===symbol)return parent;}parent=parent.parentElement;}return null;}
  function decorateSinger(timing){
    installStyles();settings();const root=document.getElementById('ls26SingerV31Lyrics');if(!root||document.body.dataset.guidance!=='guitaroke'||!timing?.events?.length)return 0;let count=0;
    for(const section of root.querySelectorAll('.ls26-singer-v31-section')){
      const sectionIndex=Number(section.dataset.sourceIndex);
      for(const line of section.querySelectorAll('.ls26-singer-v31-line.is-chord-line[data-source-line-index]')){
        const sourceLineIndex=Number(line.dataset.sourceLineIndex),events=timing.events.filter(e=>Number(e.sourceAnchor?.sectionIndex)===sectionIndex&&Number(e.sourceAnchor?.lineIndex)===sourceLineIndex).sort((a,b)=>Number(b.sourceAnchor?.start||0)-Number(a.sourceAnchor?.start||0));
        for(const event of events){const id=String(event.id||'');if(!id||hasMarker(line,id))continue;const a=event.sourceAnchor,symbol=String(event.chord||event.symbol||'').trim(),rows=window.LS26Chords?.logicalLines?.(line,{locations:true,original:true})||[],row=rows[0];if(!row)continue;const start=Number(a.start),end=Number(a.end);if(String(row.text||'').slice(start,end).trim()!==symbol)continue;const seg=(row.segments||[]).find(part=>part.start<end&&part.end>=end);if(!seg)continue;let target=seg.element||closestChord(seg.node,line,symbol);if(!target&&seg.node?.nodeType===3){const value=String(seg.node.nodeValue||''),from=clamp(Number(seg.offset||0)+start-Number(seg.start||0),0,value.length),to=clamp(Number(seg.offset||0)+end-Number(seg.start||0),from,value.length);if(to>from){const range=document.createRange();range.setStart(seg.node,from);range.setEnd(seg.node,to);target=document.createElement('span');target.append(range.extractContents());range.insertNode(target);}}
          const dot=marker(event,line.ownerDocument||document);if(target&&dot){target.classList.add('ls26-singer-timed-chord');target.dataset.ls26EventId=id;target.append(dot);count++;}}
      }
    }
    return count;
  }
  async function refreshLyricView(){if(!/\/host\/lyricview\.html$/i.test(location.pathname))return;const song=window.LS26Performance?.song?.(),id=String(song?.id||new URLSearchParams(location.search).get('id')||'').trim();if(!song||!id)return;lyricTiming=await loadTiming(id);if(lyricTiming)decorateLyricView(lyricTiming);}
  async function refreshSinger(){if(!/\/host\/karaoke-lyric-view\.html$/i.test(location.pathname)||!window.db)return;try{const snap=await window.db.doc('karaokeControl/liveLyrics').get(),data=snap.exists?(snap.data()||{}):{},id=String(data.currentLyricsSongId||data.currentSongId||data.songId||data.singerV3?.songId||'').trim();if(!id)return;if(id!==singerSongId){singerSongId=id;singerTiming=await loadTiming(id);}if(singerTiming)decorateSinger(singerTiming);}catch(error){console.warn('Singer chord beat labels unavailable:',error);}}
  function queueSinger(){clearTimeout(singerTimer);singerTimer=setTimeout(refreshSinger,80);}
  function installActiveSync(){let channel=null;try{channel=new BroadcastChannel(ACTIVE_CHANNEL);}catch(_){}
    if(/\/host\/lyricview\.html$/i.test(location.pathname)){const send=()=>{const active=document.querySelector('.host-section-body .ls26-active-chord[data-ls26-event-id]');channel?.postMessage({type:'active-chord',eventId:active?.dataset.ls26EventId||''});};const root=document.getElementById('lyricsContent');if(root)new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'&&r.attributeName==='class'))send();}).observe(root,{subtree:true,attributes:true,attributeFilter:['class']});window.addEventListener('ls26:metronome-beat',send);window.addEventListener('ls26:transport-state',send);}
    if(/\/host\/karaoke-lyric-view\.html$/i.test(location.pathname)&&channel)channel.onmessage=event=>{if(event.data?.type!=='active-chord')return;const id=String(event.data.eventId||'');document.querySelectorAll('#ls26SingerV31Lyrics .ls26-singer-timed-chord').forEach(node=>node.classList.toggle('ls26-singer-active-chord',Boolean(id)&&node.dataset.ls26EventId===id));};window.addEventListener('pagehide',()=>channel?.close(),{once:true});
  }
  function installPlayback(){setRunning(false);window.addEventListener('ls26:transport-state',event=>{const d=event.detail||{},beat=Number(d.beat);setRunning(d.state==='playing'&&(!Number.isFinite(beat)||beat>=-.000001));});window.addEventListener('ls26:metronome-beat',event=>setRunning(event.detail?.countIn!==true));window.addEventListener('ls26:scroll-state',event=>{if(event.detail?.playing===false)setRunning(false);});window.addEventListener('ls26:song-ready',()=>setRunning(false));window.addEventListener('ls26:song-finished',()=>setRunning(false));}
  function init(){
    installStyles();settings();installPlayback();installActiveSync();
    window.addEventListener('ls26:prompter-settings',()=>{settings();if(lyricTiming)decorateLyricView(lyricTiming);if(singerTiming)decorateSinger(singerTiming);});
    if(/\/host\/lyricview\.html$/i.test(location.pathname)){const root=document.getElementById('lyricsContent');if(root)new MutationObserver(()=>{if(lyricTiming)requestAnimationFrame(()=>decorateLyricView(lyricTiming));}).observe(root,{subtree:true,childList:true});window.addEventListener('ls26:song-ready',refreshLyricView);void refreshLyricView();}
    if(/\/host\/karaoke-lyric-view\.html$/i.test(location.pathname)){const root=document.getElementById('ls26SingerV31Lyrics');if(root)new MutationObserver(()=>{if(singerTiming&&document.body.dataset.guidance==='guitaroke')requestAnimationFrame(()=>decorateSinger(singerTiming));}).observe(root,{subtree:true,childList:true});window.addEventListener('storage',event=>{if(event.key==='karaokeGuidanceMode')queueSinger();});queueSinger();}
  }
  window.LS26ChordBeatLabels=Object.freeze({loadTiming,decorateLyricView,decorateSinger,refreshLyricView,durationDots});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
