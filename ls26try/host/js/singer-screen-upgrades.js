/* LiveSuite Singer Screen v3.1
 * Stable singer display: remembered settings, Guitaroke guidance, host sync,
 * exact count-in events, focused lyric highlighting, and lightweight scrolling.
 */
(() => {
  'use strict';
  if (!/\/host\/karaoke-lyric-view\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerScreenV31) return;
  window.__ls26SingerScreenV31 = true;
  window.__ls26SingerScreenV3 = true;
  window.__ls26SingerScreenV2 = true;

  const COLLECTION='karaokeControl', DOC='liveLyrics', CHANNEL='ls26-singer-live-v3';
  const KEY={
    guidance:'karaokeGuidanceMode',theme:'ls26:singerTheme',font:'ls26:singerFont',
    size:'ls26:singerTextSize',spacing:'ls26:singerSpacing',auto:'ls26:singerAutoScroll',speed:'ls26:singerScrollSpeed'
  };
  const read=(key,fallback)=>{try{return localStorage.getItem(key)||fallback;}catch(_){return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,String(value));}catch(_){}};
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const norm=v=>String(v||'').replace(/\u200b/g,'').replace(/\s+/g,' ').trim().toLowerCase();

  let guidance=read(KEY.guidance,'normal');
  let theme=read(KEY.theme,'default'),font=read(KEY.font,'default'),size=read(KEY.size,'normal'),spacing=read(KEY.spacing,'normal');
  let autoFallback=read(KEY.auto,'true')!=='false';
  let localSpeed=clamp(Number(read(KEY.speed,'1'))||1,.25,3);
  let song=null,songId='',latestState=null,latestSync=null,listener=null,channel=null,active=false;
  let movementFrame=0,lastMovementAt=0,firstMovement=true,currentFocusedLine=null;
  let lyricLineCache=[],sectionCache=[],lineTextMap=new Map(),sectionMap=new Map();

  try{if('BroadcastChannel'in window)channel=new BroadcastChannel(CHANNEL);}catch(_){}

  const style=document.createElement('style');
  style.id='ls26SingerScreenV31Style';
  style.textContent=`
    body.ls26-singer-v31-active #standbyView,
    body.ls26-singer-v31-active #autoSendIdleView,
    body.ls26-singer-v31-active #songFinishedView,
    body.ls26-singer-v31-active #songLoadingView,
    body.ls26-singer-v31-active #singerLyrics{display:none!important}
    body.ls26-singer-v31-active{overflow-x:hidden!important;background:var(--singer-custom-background,#00131a)!important}
    body.ls26-singer-v31-active .singer-topbar{position:sticky!important;top:0!important;z-index:130100!important}
    #singerSettings{z-index:130300!important}
    #singerSettings:not(.hidden){display:block!important}
    #ls26SingerV31Lyrics{display:block;box-sizing:border-box;max-width:980px;margin:0 auto;padding:var(--ls26-singer-top-runway,120px) 5vw max(34vh,var(--ls26-singer-bottom-runway,260px));color:#fff;min-height:170vh}
    #ls26SingerV31Lyrics[hidden]{display:none!important}
    .ls26-singer-v31-section{margin:0 0 36px}
    .ls26-singer-v31-section h2{margin:0 0 12px;font-size:.78em;letter-spacing:.07em;text-transform:uppercase;opacity:.78}
    .ls26-singer-v31-body{font-weight:760;line-height:1.42}
    .ls26-singer-v31-line{display:block;box-sizing:border-box;min-height:1.25em;margin:.07em 0;padding:.05em .14em;border-left:4px solid transparent;border-radius:7px;transform-origin:left center;transition:font-size .22s ease,opacity .22s ease,background-color .22s ease,border-color .22s ease,text-shadow .22s ease}
    .ls26-singer-v31-line.is-current{font-size:1.40em!important;opacity:1!important;font-weight:950!important;border-left-color:#16d8ff!important;background:linear-gradient(90deg,rgba(22,216,255,.20),rgba(22,216,255,.04) 72%,transparent)!important;text-shadow:0 0 16px rgba(22,216,255,.20);filter:none!important}
    .ls26-singer-v31-line.is-upcoming-featured{font-size:1.19em!important;opacity:.94!important;font-weight:850!important;filter:none!important}
    .ls26-singer-v31-line.is-muted{font-size:.88em!important;opacity:.46!important;filter:saturate(.72)}
    .ls26-singer-v31-line.is-chord-line{font-size:.92em!important;opacity:.84!important;font-weight:900!important;letter-spacing:.025em;color:#eafcff}
    body:not([data-guidance="guitaroke"]) #ls26SingerV31Lyrics .is-chord-line{display:none!important}
    body[data-guidance="normal"] #ls26SingerV31Lyrics .ls26-pro-format{font-style:normal!important;text-decoration:none!important}
    .ls26-singer-performance-cue{margin:14px auto;padding:9px 14px;width:max-content;max-width:90%;border:1px solid currentColor;border-radius:9px;text-align:center;font-weight:900}
    #ls26SingerV31State{position:fixed;z-index:120000;left:0;right:0;bottom:0;top:var(--ls26-singer-header-h,82px);display:flex;align-items:center;justify-content:center;padding:30px;background:var(--singer-custom-background,#00131a);text-align:center;color:#fff}
    #ls26SingerV31State[hidden]{display:none!important}
    .ls26-singer-state-card{width:min(860px,92vw)}
    .ls26-singer-state-kicker{display:block;margin-bottom:18px;color:#16d8ff;font-size:clamp(16px,2vw,25px);font-weight:950;letter-spacing:.14em}
    .ls26-singer-state-card h1{margin:0 0 10px;font-size:clamp(34px,6vw,78px);line-height:1.03}
    .ls26-singer-state-card h2{margin:0;color:#9fc5d1;font-size:clamp(22px,3.4vw,42px)}
    .ls26-singer-count{margin-top:28px;font-size:clamp(96px,20vw,220px);font-weight:950;line-height:1;color:#fff;text-shadow:0 0 35px rgba(0,220,255,.48)}
    .guidance-options button[data-guidance="guitaroke"]{border-color:rgba(255,190,60,.48)!important;color:#ffd16d!important}
    .guidance-options button[data-guidance="guitaroke"].active{background:rgba(255,177,35,.16)!important;border-color:#ffbb35!important;color:#ffe29a!important}
    body[data-theme="warm"] #ls26SingerV31Lyrics{color:#fff5e9}
    body[data-theme="contrast"] #ls26SingerV31Lyrics{color:#fff}
    body[data-font="arial"] #ls26SingerV31Lyrics{font-family:Arial,sans-serif}
    body[data-font="dyslexic"] #ls26SingerV31Lyrics{font-family:OpenDyslexic,Arial,sans-serif}
    body[data-size="small"] #ls26SingerV31Lyrics{font-size:.86em}
    body[data-size="large"] #ls26SingerV31Lyrics{font-size:1.17em}
    body[data-size="xlarge"] #ls26SingerV31Lyrics{font-size:1.35em}
    body[data-spacing="loose"] #ls26SingerV31Lyrics .ls26-singer-v31-body{line-height:1.62}
    body[data-spacing="looser"] #ls26SingerV31Lyrics .ls26-singer-v31-body{line-height:1.85}
  `;
  document.head.appendChild(style);

  let lyrics=document.getElementById('ls26SingerV31Lyrics');
  if(!lyrics){
    lyrics=document.createElement('main');lyrics.id='ls26SingerV31Lyrics';lyrics.hidden=true;
    const topbar=document.querySelector('.singer-topbar');
    if(topbar?.nextSibling)topbar.parentNode.insertBefore(lyrics,topbar.nextSibling);else document.body.appendChild(lyrics);
  }
  let stateView=document.getElementById('ls26SingerV31State');
  if(!stateView){
    stateView=document.createElement('div');stateView.id='ls26SingerV31State';stateView.hidden=true;
    stateView.innerHTML='<div class="ls26-singer-state-card"><span class="ls26-singer-state-kicker">CURRENTLY SHOWING</span><h1 id="ls26SingerStateTitle">Song</h1><h2 id="ls26SingerStateArtist">Artist</h2><div id="ls26SingerCount" class="ls26-singer-count" hidden>1</div></div>';
    document.body.appendChild(stateView);
  }

  function updateHeaderHeight(){
    const header=document.querySelector('.singer-topbar');
    const h=Math.ceil(header?.getBoundingClientRect().height||82),anchor=Math.max(h+48,innerHeight*.40);
    document.documentElement.style.setProperty('--ls26-singer-header-h',`${h}px`);
    document.documentElement.style.setProperty('--ls26-singer-top-runway',`${Math.round(Math.max(34,anchor-h))}px`);
    document.documentElement.style.setProperty('--ls26-singer-bottom-runway',`${Math.round(Math.max(220,innerHeight-anchor+180))}px`);
  }
  function ensureSettingsEnabled(){
    const b=document.getElementById('singerSettingsBtn');if(!b||!active)return;
    if(b.disabled)b.disabled=false;
    if(b.hasAttribute('disabled'))b.removeAttribute('disabled');
    if(b.getAttribute('aria-disabled')!=='false')b.setAttribute('aria-disabled','false');
  }
  function addGuitarokeOption(){
    const group=document.querySelector('.guidance-options');if(!group)return;
    if(!group.querySelector('[data-guidance="guitaroke"]')){
      const b=document.createElement('button');b.type='button';b.dataset.guidance='guitaroke';b.textContent='Guitaroke';group.appendChild(b);
    }
    const help=group.closest('label')?.querySelector('.settings-help');
    if(help)help.textContent='Normal Mode shows clean lyrics. Lyrics Pro keeps lyric formatting. Guitaroke also shows the song chords.';
  }
  function setButtons(selector,key,value){document.querySelectorAll(selector).forEach(b=>b.classList.toggle('active',b.dataset[key]===value));}
  function applySettings(){
    addGuitarokeOption();
    Object.assign(document.body.dataset,{guidance,theme,font,size,spacing});
    setButtons('[data-guidance]','guidance',guidance);setButtons('[data-theme]','theme',theme);setButtons('[data-font]','font',font);setButtons('[data-size]','size',size);setButtons('[data-spacing]','spacing',spacing);
    const auto=document.getElementById('singerAutoScroll');if(auto)auto.checked=autoFallback;
    const a=document.getElementById('singerSpeedLabel'),b=document.getElementById('singerBottomSpeed');
    if(a)a.textContent=`${localSpeed.toFixed(2)}×`;if(b)b.textContent=`${localSpeed.toFixed(2)}×`;
    ensureSettingsEnabled();
  }
  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement||document.webkitFullscreenElement){if(document.exitFullscreen)await document.exitFullscreen();else document.webkitExitFullscreen?.();return;}
      const root=document.documentElement;
      if(root.requestFullscreen){try{await root.requestFullscreen({navigationUI:'hide'});}catch(_){await root.requestFullscreen();}}
      else root.webkitRequestFullscreen?.();
    }catch(error){console.warn('Singer fullscreen request failed:',error);}
  }
  function installControls(){
    const settingsButton=document.getElementById('singerSettingsBtn'),settings=document.getElementById('singerSettings'),close=document.getElementById('closeSingerSettings'),fullscreen=document.getElementById('fullscreenSingerBtn');
    if(settingsButton)settingsButton.onclick=e=>{e.preventDefault();e.stopPropagation();if(active)settings?.classList.toggle('hidden');};
    if(close)close.onclick=e=>{e.preventDefault();settings?.classList.add('hidden');};
    if(fullscreen)fullscreen.onclick=e=>{e.preventDefault();e.stopPropagation();void toggleFullscreen();};
  }

  document.addEventListener('click',event=>{
    const g=event.target.closest?.('[data-guidance]');
    if(g){event.preventDefault();event.stopImmediatePropagation();guidance=['normal','pro','guitaroke'].includes(g.dataset.guidance)?g.dataset.guidance:'normal';save(KEY.guidance,guidance);applySettings();if(song)renderSong();return;}
    const s=event.target.closest?.('[data-theme],[data-font],[data-size],[data-spacing]');
    if(s){setTimeout(()=>{if(s.dataset.theme){theme=s.dataset.theme;save(KEY.theme,theme)}if(s.dataset.font){font=s.dataset.font;save(KEY.font,font)}if(s.dataset.size){size=s.dataset.size;save(KEY.size,size)}if(s.dataset.spacing){spacing=s.dataset.spacing;save(KEY.spacing,spacing)}applySettings();},0);}
    if(event.target.closest?.('#singerSpeedDown,#singerMinusBtn')){localSpeed=clamp(localSpeed-.25,.25,3);save(KEY.speed,localSpeed);setTimeout(applySettings,0);}
    if(event.target.closest?.('#singerSpeedUp,#singerPlusBtn')){localSpeed=clamp(localSpeed+.25,.25,3);save(KEY.speed,localSpeed);setTimeout(applySettings,0);}
  },true);
  document.addEventListener('change',event=>{if(event.target?.id==='singerAutoScroll'){autoFallback=event.target.checked;save(KEY.auto,autoFallback);}},true);

  function chordOnly(text){
    if(window.LyricsCommon?.isChordOnlyLine)return window.LyricsCommon.isChordOnlyLine(text);
    const line=String(text||'').trim();if(!line||line.length>120)return false;
    const tokens=line.split(/\s+/).filter(Boolean);return tokens.length>0&&tokens.every(t=>/^([A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?|[|:()xX0-9.\-+*]+)$/.test(t));
  }
  function cleanGuitarokeHTML(section){
    const root=document.createElement('div');root.innerHTML=window.LyricsCommon?.stripEditorControls?.(section?.html||'')||String(section?.html||'');
    root.querySelectorAll('.tab-block,.viewer-tab,.tab-line,.tab-dashes,.tab-note,.tab-cell,.note-cell,.host-only,.host-note,.my-note,.ls26-inline-host-note,.chord-diagram,.chords-legend,.ls26-time-signature-change,script,style,button').forEach(n=>n.remove());
    root.querySelectorAll('[contenteditable]').forEach(n=>n.removeAttribute('contenteditable'));root.querySelectorAll('[data-host-note]').forEach(n=>n.remove());
    root.querySelectorAll('.ls26-inline-performance-note').forEach(node=>{const text=String(node.dataset.performanceNote||'').trim();if(!text){node.remove();return;}const cue=document.createElement('div');cue.className='ls26-singer-performance-cue';cue.textContent=text;cue.style.fontSize=`${clamp(Number(node.dataset.performanceNoteSize)||18,10,40)}px`;cue.style.color=/^#[0-9a-f]{6}$/i.test(node.dataset.performanceNoteColor||'')?node.dataset.performanceNoteColor:'#75F2A0';node.replaceWith(cue);});
    return root.innerHTML.trim();
  }
  function sectionHtml(section){
    const base=window.LyricsCommon?.singerHTMLFromSection?.(section)||'';
    if(guidance!=='guitaroke'||section?.visibleOnSingerScreen===false||String(section?.type||'').toLowerCase()==='tab')return base;
    return cleanGuitarokeHTML(section)||base;
  }
  function sourceLines(section){
    const root=document.createElement('div');root.innerHTML=String(section?.html||section?.text||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(div|p|pre|li|h[1-6])>/gi,'\n</$1>');
    root.querySelectorAll('script,style,.ls26-inline-host-note,[data-host-note]').forEach(n=>n.remove());
    return String(root.textContent||'').replace(/\r/g,'').split('\n').map(line=>line.replace(/\u200b/g,'').replace(/\s+/g,' ').trim());
  }
  function wrapLines(body,section){
    const blocks=[...body.children].filter(el=>['DIV','P','PRE','LI'].includes(el.tagName));
    if(blocks.length){blocks.forEach(el=>{if(el.classList.contains('ls26-singer-performance-cue')||el.classList.contains('performance-cue'))return;el.classList.add('ls26-singer-v31-line');if(chordOnly(el.textContent))el.classList.add('is-chord-line');});}
    else{
      const groups=[[]];[...body.childNodes].forEach(node=>{if(node.nodeType===1&&node.tagName==='BR')groups.push([]);else groups[groups.length-1].push(node);});
      if(groups.length<=1){body.classList.add('ls26-singer-v31-line');if(chordOnly(body.textContent))body.classList.add('is-chord-line');}
      else{body.replaceChildren();groups.forEach(nodes=>{const line=document.createElement('div');line.className='ls26-singer-v31-line';nodes.forEach(n=>line.appendChild(n));if(!line.textContent.trim()&&!line.querySelector('*'))return;if(chordOnly(line.textContent))line.classList.add('is-chord-line');body.appendChild(line);});}
    }
    const raw=sourceLines(section);let cursor=0;
    body.querySelectorAll('.ls26-singer-v31-line').forEach(line=>{const text=norm(line.textContent);if(!text)return;let matched=-1;for(let i=cursor;i<raw.length;i++){const c=norm(raw[i]);if(!c)continue;if(c===text||c.includes(text)||text.includes(c)){matched=i;break;}}if(matched>=0){line.dataset.sourceLineIndex=String(matched);cursor=matched+1;}});
  }
  function rebuildCaches(){
    lyricLineCache=[...lyrics.querySelectorAll('.ls26-singer-v31-line:not(.is-chord-line)')].filter(line=>line.textContent.trim());
    sectionCache=[...lyrics.querySelectorAll('.ls26-singer-v31-section[data-source-index]')];sectionMap=new Map(sectionCache.map(el=>[Number(el.dataset.sourceIndex),el]));
    lineTextMap=new Map();lyricLineCache.forEach(line=>{const key=norm(line.textContent);if(key&&!lineTextMap.has(key))lineTextMap.set(key,line);});
  }
  function renderSong(){
    if(!song)return;lyrics.innerHTML='';
    (song.sections||[]).forEach((section,sourceIndex)=>{
      if(!window.LyricsCommon?.sectionVisibleOnSingerScreen?.(section)||String(section.type||'').toLowerCase()==='separator')return;
      const html=sectionHtml(section);if(!html)return;
      if(['performancenote','performance-note'].includes(String(section.type||'').toLowerCase())){const cue=document.createElement('div');cue.className='ls26-singer-performance-cue ls26-singer-v31-section';cue.dataset.sourceIndex=String(sourceIndex);cue.innerHTML=html;lyrics.appendChild(cue);return;}
      const block=document.createElement('section');block.className='ls26-singer-v31-section';block.dataset.sourceIndex=String(sourceIndex);
      if(section.title){const h=document.createElement('h2');h.textContent=section.title;block.appendChild(h);}
      const body=document.createElement('div');body.className='ls26-singer-v31-body';body.innerHTML=html;block.appendChild(body);wrapLines(body,section);
      if(guidance!=='guitaroke')body.querySelectorAll('.is-chord-line').forEach(line=>line.remove());lyrics.appendChild(block);
    });
    const end=document.createElement('div');end.className='singer-end';end.textContent='[ END ]';lyrics.appendChild(end);
    rebuildCaches();firstMovement=true;currentFocusedLine=null;requestAnimationFrame(()=>{updateHeaderHeight();applyLineFocus(latestSync);});
  }
  function currentLineFromSync(sync){
    if(!lyricLineCache.length)return null;
    const wantedText=norm(sync?.currentLyricText);
    if(wantedText){
      const exact=lineTextMap.get(wantedText);if(exact)return exact;
      for(const [text,line] of lineTextMap){if(text.includes(wantedText)||wantedText.includes(text))return line;}
    }
    const sourceIndex=Number(sync?.sourceIndex),lineIndex=Number(sync?.activeLineIndex);
    if(Number.isFinite(sourceIndex)&&Number.isFinite(lineIndex)&&lineIndex>=0){
      const section=sectionMap.get(sourceIndex);if(section){const candidates=[...section.querySelectorAll('.ls26-singer-v31-line:not(.is-chord-line)')];const after=candidates.find(line=>Number(line.dataset.sourceLineIndex)>lineIndex);if(after)return after;}
    }
    return currentFocusedLine||lyricLineCache[0];
  }
  function applyLineFocus(sync){
    if(lyrics.hidden||!lyricLineCache.length)return;
    const current=currentLineFromSync(sync)||lyricLineCache[0];if(current===currentFocusedLine)return;
    currentFocusedLine=current;const idx=lyricLineCache.indexOf(current);
    lyricLineCache.forEach((line,index)=>{line.classList.toggle('is-current',index===idx);line.classList.toggle('is-upcoming-featured',index===idx+1||index===idx+2);line.classList.toggle('is-muted',index<idx||index>idx+2);});
  }
  function projectedProgress(sync){const base=clamp(Number(sync?.sectionProgress)||0,0,1),rate=Math.max(0,Number(sync?.progressRatePerMs)||0),elapsed=clamp(Date.now()-Number(sync?.updatedAtMs||Date.now()),0,2500);return clamp(base+rate*elapsed,0,1);}
  function semanticTarget(sync){
    const headerBottom=document.querySelector('.singer-topbar')?.getBoundingClientRect().bottom||0,anchor=Math.max(headerBottom+44,innerHeight*.40);
    const line=currentLineFromSync(sync);if(line&&sync?.currentLyricText)return line.getBoundingClientRect().top+scrollY-anchor;
    const wanted=Number(sync?.sourceIndex);let section=sectionMap.get(wanted)||null;
    if(!section){for(let i=sectionCache.length-1;i>=0;i--){if(Number(sectionCache[i].dataset.sourceIndex)<=wanted){section=sectionCache[i];break;}}}
    if(!section){const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);return clamp((Number(sync?.scrollFraction)||0)*max,0,max);}
    const index=sectionCache.indexOf(section),next=sectionCache[index+1]||null,top=section.getBoundingClientRect().top+scrollY,nextTop=next?next.getBoundingClientRect().top+scrollY:top;
    return top+(nextTop-top)*projectedProgress(sync)-anchor;
  }
  function movementTick(ts){
    movementFrame=0;
    if(!active||!latestState||lyrics.hidden||latestState.phase!=='playing')return;
    if(ts-lastMovementAt>=33){
      lastMovementAt=ts;applyLineFocus(latestSync);
      if(latestSync){const max=Math.max(0,document.documentElement.scrollHeight-innerHeight),target=clamp(semanticTarget(latestSync),0,max),delta=target-scrollY;if(firstMovement&&Math.abs(delta)>innerHeight*.55){scrollTo(0,target);firstMovement=false;}else if(Math.abs(delta)>.6){scrollBy(0,delta*(Math.abs(delta)>innerHeight*.35?.16:.09));firstMovement=false;}}
      else if(autoFallback)scrollBy(0,.42*localSpeed);
    }
    movementFrame=requestAnimationFrame(movementTick);
  }
  function startMovement(){if(movementFrame||latestState?.phase!=='playing'||lyrics.hidden)return;lastMovementAt=0;movementFrame=requestAnimationFrame(movementTick);}
  function stopMovement(){if(movementFrame)cancelAnimationFrame(movementFrame);movementFrame=0;}
  function setTopbar(title,artist){const t=document.getElementById('singerTitle'),a=document.getElementById('singerArtist');if(t)t.textContent=title||'Untitled Song';if(a)a.textContent=artist||'';}
  function activate(){active=true;document.body.classList.add('ls26-singer-v31-active');document.body.classList.remove('ls26-singer-v3-active','ls26-singer-v2-active');ensureSettingsEnabled();updateHeaderHeight();}
  function stateArtist(){return window.ArtistNames?.display?.(song?.artist||latestState?.artist)||song?.artist||latestState?.artist||'';}
  function showPreview(){activate();stopMovement();lyrics.hidden=true;stateView.hidden=false;stateView.querySelector('.ls26-singer-state-kicker').textContent='CURRENTLY SHOWING';stateView.querySelector('#ls26SingerStateTitle').textContent=song?.title||latestState?.title||'Untitled Song';stateView.querySelector('#ls26SingerStateArtist').textContent=stateArtist();stateView.querySelector('#ls26SingerCount').hidden=true;setTopbar(song?.title||latestState?.title,stateArtist());scrollTo(0,0);}
  function showCountIn(){activate();stopMovement();lyrics.hidden=true;stateView.hidden=false;stateView.querySelector('.ls26-singer-state-kicker').textContent='GET READY';stateView.querySelector('#ls26SingerStateTitle').textContent=song?.title||latestState?.title||'Untitled Song';stateView.querySelector('#ls26SingerStateArtist').textContent=stateArtist();const count=stateView.querySelector('#ls26SingerCount');count.hidden=false;const beat=Number(latestState?.countInBeat);count.textContent=beat>=1&&beat<=4?String(beat):'…';setTopbar(song?.title||latestState?.title,stateArtist());}
  function showLyrics(){activate();stateView.hidden=true;lyrics.hidden=false;updateHeaderHeight();applyLineFocus(latestSync);if(latestState?.phase==='playing')startMovement();else stopMovement();}
  function applyState(){if(!latestState||!song)return;latestSync=latestState.sync||latestSync;if(latestState.phase==='preview'){showPreview();return;}if(latestState.phase==='countin'){showCountIn();return;}if(['playing','paused','complete'].includes(latestState.phase)){showLyrics();return;}showPreview();}
  async function loadSong(id){
    if(!id)return;if(song&&songId===id){applyState();return;}songId=id;
    try{const snap=await window.db.collection('lyrics').doc(id).get();if(!snap.exists)return;song=window.LyricsCommon?.normalizeSong?.(snap.data(),snap.id)||{...snap.data(),firebaseId:snap.id};renderSong();applyState();}catch(error){console.warn('Singer v3.1 could not load song:',error);}
  }
  function acceptState(next){
    if(!next||Number(next.version)!==3)return;latestState={...next};latestSync=next.sync||latestSync;const id=String(next.songId||'').trim();if(!id)return;
    if(!song||songId!==id)void loadSong(id);else applyState();ensureSettingsEnabled();
  }
  function handleControl(data){
    const v3=data?.singerV3;if(v3&&Number(v3.version)===3){acceptState(v3);return;}
    const id=String(data?.currentLyricsSongId||data?.currentSongId||data?.songId||'').trim();if(!id)return;
    acceptState({version:3,songId:id,title:data?.songTitle||'',artist:data?.songArtist||'',bpm:96,phase:String(data?.displayState||'').toLowerCase()==='preview'?'preview':'paused',playing:false,sync:null,updatedAtMs:Date.now()});
  }
  function startListeners(){
    if(window.db)listener=window.db.collection(COLLECTION).doc(DOC).onSnapshot(doc=>handleControl(doc.exists?doc.data():{}),error=>console.warn('Singer control unavailable:',error));
    if(channel)channel.onmessage=event=>{if(event.data?.type==='state')acceptState(event.data.state);};
    window.addEventListener('storage',event=>{if(event.key!=='ls26:singer-v3-state'||!event.newValue)return;try{const msg=JSON.parse(event.newValue);if(msg?.type==='state')acceptState(msg.state);}catch(_){}});
  }
  function start(){
    applySettings();installControls();updateHeaderHeight();startListeners();
    window.addEventListener('resize',()=>{updateHeaderHeight();applyLineFocus(latestSync);});
    window.addEventListener('orientationchange',()=>setTimeout(()=>{updateHeaderHeight();applyLineFocus(latestSync);},120));
    window.addEventListener('pagehide',()=>{stopMovement();try{listener?.();}catch(_){}try{channel?.close();}catch(_){}},{once:true});
  }
  start();
})();
