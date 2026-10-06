/* LiveSuite Singer Screen v2.
 * Adds remembered Guidance (including Guitaroke), host-synchronised movement,
 * preview/count-in states and three-line lyric focus without changing song data.
 */
(() => {
  'use strict';
  if (!/\/host\/karaoke-lyric-view\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerScreenV2) return;
  window.__ls26SingerScreenV2=true;

  const CONTROL_COLLECTION='karaokeControl',CONTROL_DOC='liveLyrics';
  const KEY={
    guidance:'karaokeGuidanceMode',theme:'ls26:singerTheme',font:'ls26:singerFont',size:'ls26:singerTextSize',spacing:'ls26:singerSpacing',auto:'ls26:singerAutoScroll',speed:'ls26:singerScrollSpeed'
  };
  let guidance=read(KEY.guidance,'normal');
  let theme=read(KEY.theme,'default'),font=read(KEY.font,'default'),size=read(KEY.size,'normal'),spacing=read(KEY.spacing,'normal');
  let autoFallback=read(KEY.auto,'true')!=='false';
  let localSpeed=Math.max(.25,Math.min(3,Number(read(KEY.speed,'1'))||1));
  let control=null,song=null,songId='',reloadToken='',controlUnsub=null;
  let movementFrame=0,countFrame=0,lastSyncSource=null;

  function read(key,fallback){try{return localStorage.getItem(key)||fallback;}catch(_){return fallback;}}
  function save(key,value){try{localStorage.setItem(key,String(value));}catch(_){}}
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const style=document.createElement('style');
  style.id='ls26SingerScreenV2Style';
  style.textContent=`
    body.ls26-singer-v2-active #standbyView,body.ls26-singer-v2-active #autoSendIdleView,body.ls26-singer-v2-active #songFinishedView,body.ls26-singer-v2-active #songLoadingView,body.ls26-singer-v2-active #singerLyrics{display:none!important}
    #ls26SingerV2Lyrics{display:block;box-sizing:border-box;padding:calc(var(--singer-sync-top-runway,90px) + 10px) 5vw max(30vh,var(--singer-sync-bottom-runway,240px));color:#fff;min-height:150vh}
    #ls26SingerV2Lyrics[hidden]{display:none!important}
    .ls26-singer-v2-section{margin:0 0 34px;transition:opacity .22s ease}
    .ls26-singer-v2-section h2{margin:0 0 12px;font-size:.78em;letter-spacing:.06em;text-transform:uppercase;opacity:.78}
    .ls26-singer-v2-body{font-weight:700;line-height:1.42}
    .ls26-singer-line{display:block;min-height:1.2em;margin:.06em 0;transform-origin:left center;transition:font-size .28s ease,opacity .28s ease,filter .28s ease}
    .ls26-singer-line.is-featured{font-size:1.25em;opacity:1;filter:none}
    .ls26-singer-line.is-current{font-weight:900}
    .ls26-singer-line.is-muted{font-size:.88em;opacity:.47;filter:saturate(.74)}
    .ls26-singer-line.is-chord-line{font-size:.88em;opacity:.82;font-weight:900;letter-spacing:.025em}
    body[data-guidance="normal"] #ls26SingerV2Lyrics .ls26-pro-format{font-style:normal!important;text-decoration:none!important}
    body[data-guidance="guitaroke"] #ls26SingerV2Lyrics .ls26-singer-line.is-chord-line{font-size:1em;opacity:.95;color:#eafcff}
    .ls26-singer-performance-cue{margin:14px auto;padding:9px 14px;width:max-content;max-width:90%;border:1px solid currentColor;border-radius:9px;text-align:center;font-weight:900}
    #ls26SingerV2State{position:fixed;z-index:120000;inset:0;display:flex;align-items:center;justify-content:center;padding:90px 30px 30px;background:var(--singer-custom-background,#00131a);text-align:center;color:#fff}
    #ls26SingerV2State[hidden]{display:none!important}
    .ls26-singer-state-card{width:min(820px,92vw)}
    .ls26-singer-state-kicker{display:block;margin-bottom:18px;color:#16d8ff;font-size:clamp(16px,2vw,25px);font-weight:950;letter-spacing:.14em}
    .ls26-singer-state-card h1{margin:0 0 10px;font-size:clamp(34px,6vw,78px);line-height:1.03}
    .ls26-singer-state-card h2{margin:0;color:#9fc5d1;font-size:clamp(22px,3.4vw,42px)}
    .ls26-singer-count{margin-top:24px;font-size:clamp(92px,20vw,220px);font-weight:950;line-height:1;color:#fff;text-shadow:0 0 35px rgba(0,220,255,.45)}
    .guidance-options button[data-guidance="guitaroke"]{border-color:rgba(255,190,60,.48)!important;color:#ffd16d!important}
    .guidance-options button[data-guidance="guitaroke"].active{background:rgba(255,177,35,.16)!important;border-color:#ffbb35!important;color:#ffe29a!important}
    body[data-theme="warm"] #ls26SingerV2Lyrics{color:#fff5e9}
    body[data-theme="contrast"] #ls26SingerV2Lyrics{color:#fff}
    body[data-font="arial"] #ls26SingerV2Lyrics{font-family:Arial,sans-serif}
    body[data-font="dyslexic"] #ls26SingerV2Lyrics{font-family:OpenDyslexic,Arial,sans-serif}
    body[data-size="small"] #ls26SingerV2Lyrics{font-size:.86em}body[data-size="large"] #ls26SingerV2Lyrics{font-size:1.17em}body[data-size="xlarge"] #ls26SingerV2Lyrics{font-size:1.35em}
    body[data-spacing="loose"] #ls26SingerV2Lyrics .ls26-singer-v2-body{line-height:1.62}body[data-spacing="looser"] #ls26SingerV2Lyrics .ls26-singer-v2-body{line-height:1.85}
  `;
  (document.head||document.documentElement).appendChild(style);

  const lyrics=document.createElement('main');lyrics.id='ls26SingerV2Lyrics';lyrics.hidden=true;
  const state=document.createElement('div');state.id='ls26SingerV2State';state.hidden=true;
  state.innerHTML='<div class="ls26-singer-state-card"><span class="ls26-singer-state-kicker">CURRENTLY SHOWING</span><h1 id="ls26SingerStateTitle">Song</h1><h2 id="ls26SingerStateArtist">Artist</h2><div id="ls26SingerCount" class="ls26-singer-count" hidden>1</div></div>';
  const topbar=document.querySelector('.singer-topbar');
  if(topbar?.nextSibling)topbar.parentNode.insertBefore(lyrics,topbar.nextSibling);else document.body.appendChild(lyrics);
  document.body.appendChild(state);

  function addGuitarokeOption(){
    const group=document.querySelector('.guidance-options');if(!group)return;
    if(!group.querySelector('[data-guidance="guitaroke"]')){
      const button=document.createElement('button');button.type='button';button.dataset.guidance='guitaroke';button.textContent='Guitaroke';group.appendChild(button);
    }
    const help=group.closest('label')?.querySelector('.settings-help');
    if(help)help.textContent='Normal Mode shows clean lyrics. Lyrics Pro keeps lyric formatting. Guitaroke also shows the song chords.';
  }
  function setButtons(selector,key,value){document.querySelectorAll(selector).forEach(button=>button.classList.toggle('active',button.dataset[key]===value));}
  function applySettings(){
    addGuitarokeOption();
    document.body.dataset.guidance=guidance;
    document.body.dataset.theme=theme;document.body.dataset.font=font;document.body.dataset.size=size;document.body.dataset.spacing=spacing;
    setButtons('[data-guidance]','guidance',guidance);setButtons('[data-theme]','theme',theme);setButtons('[data-font]','font',font);setButtons('[data-size]','size',size);setButtons('[data-spacing]','spacing',spacing);
    const auto=document.getElementById('singerAutoScroll');if(auto)auto.checked=autoFallback;
    const speedLabel=document.getElementById('singerSpeedLabel'),bottomSpeed=document.getElementById('singerBottomSpeed');
    if(speedLabel)speedLabel.textContent=`${localSpeed.toFixed(2)}×`;if(bottomSpeed)bottomSpeed.textContent=`${localSpeed.toFixed(2)}×`;
  }

  document.addEventListener('click',event=>{
    const g=event.target.closest?.('[data-guidance]');
    if(g){event.preventDefault();event.stopImmediatePropagation();guidance=['normal','pro','guitaroke'].includes(g.dataset.guidance)?g.dataset.guidance:'normal';save(KEY.guidance,guidance);applySettings();if(song)renderSong();return;}
    const setting=event.target.closest?.('[data-theme],[data-font],[data-size],[data-spacing]');
    if(setting){setTimeout(()=>{
      if(setting.dataset.theme){theme=setting.dataset.theme;save(KEY.theme,theme)}
      if(setting.dataset.font){font=setting.dataset.font;save(KEY.font,font)}
      if(setting.dataset.size){size=setting.dataset.size;save(KEY.size,size)}
      if(setting.dataset.spacing){spacing=setting.dataset.spacing;save(KEY.spacing,spacing)}
      applySettings();
    },0);}
    if(event.target.closest?.('#singerSpeedDown,#singerMinusBtn')){localSpeed=Math.max(.25,localSpeed-.25);save(KEY.speed,localSpeed);setTimeout(applySettings,0);}
    if(event.target.closest?.('#singerSpeedUp,#singerPlusBtn')){localSpeed=Math.min(3,localSpeed+.25);save(KEY.speed,localSpeed);setTimeout(applySettings,0);}
  },true);
  document.addEventListener('change',event=>{if(event.target?.id==='singerAutoScroll'){autoFallback=event.target.checked;save(KEY.auto,autoFallback);}},true);

  function cleanGuitarokeHTML(section){
    const root=document.createElement('div');root.innerHTML=window.LyricsCommon?.stripEditorControls?.(section?.html||'')||String(section?.html||'');
    root.querySelectorAll('.tab-block,.viewer-tab,.tab-line,.tab-dashes,.tab-note,.tab-cell,.note-cell,.host-only,.host-note,.my-note,.ls26-inline-host-note,.chord-diagram,.chords-legend,.ls26-time-signature-change,script,style,button').forEach(node=>node.remove());
    root.querySelectorAll('[contenteditable]').forEach(node=>node.removeAttribute('contenteditable'));
    root.querySelectorAll('[data-host-note]').forEach(node=>node.remove());
    root.querySelectorAll('.ls26-inline-performance-note').forEach(node=>{
      const text=String(node.dataset.performanceNote||'').trim();
      if(!text){node.remove();return;}
      const cue=document.createElement('div');cue.className='ls26-singer-performance-cue';cue.textContent=text;
      const size=Math.max(10,Math.min(40,Number(node.dataset.performanceNoteSize)||18));
      const colour=/^#[0-9a-f]{6}$/i.test(node.dataset.performanceNoteColor||'')?node.dataset.performanceNoteColor:'#75F2A0';
      cue.style.fontSize=`${size}px`;cue.style.color=colour;node.replaceWith(cue);
    });
    return root.innerHTML.trim();
  }
  function sectionHtml(section){
    const base=window.LyricsCommon?.singerHTMLFromSection?.(section)||'';
    if(guidance!=='guitaroke')return base;
    if(section?.visibleOnSingerScreen===false)return base; // hidden section: only patched Performance Notes survive
    if(String(section?.type||'').toLowerCase()==='tab')return base;
    return cleanGuitarokeHTML(section)||base;
  }
  function chordOnly(text){
    const line=String(text||'').trim();if(!line||line.length>120)return false;
    const tokens=line.split(/\s+/).filter(Boolean);if(!tokens.length||tokens.length>16)return false;
    return tokens.every(token=>/^([A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?|[|:()xX0-9.\-+*]+)$/.test(token));
  }
  function wrapLines(body){
    const blockChildren=[...body.children].filter(el=>['DIV','P','PRE','LI'].includes(el.tagName));
    if(blockChildren.length){
      blockChildren.forEach(el=>{if(el.classList.contains('ls26-singer-performance-cue')||el.classList.contains('performance-cue'))return;el.classList.add('ls26-singer-line');if(chordOnly(el.textContent))el.classList.add('is-chord-line');});
      return;
    }
    const groups=[[]];
    [...body.childNodes].forEach(node=>{if(node.nodeType===1&&node.tagName==='BR')groups.push([]);else groups[groups.length-1].push(node);});
    if(groups.length<=1){body.classList.add('ls26-singer-line');if(chordOnly(body.textContent))body.classList.add('is-chord-line');return;}
    body.replaceChildren();
    groups.forEach(nodes=>{
      const line=document.createElement('div');line.className='ls26-singer-line';nodes.forEach(node=>line.appendChild(node));
      if(!line.textContent.trim()&&!line.querySelector('*'))return;
      if(chordOnly(line.textContent))line.classList.add('is-chord-line');body.appendChild(line);
    });
  }
  function renderSong(){
    if(!song)return;
    lyrics.innerHTML='';
    (song.sections||[]).forEach((section,sourceIndex)=>{
      if(!window.LyricsCommon?.sectionVisibleOnSingerScreen?.(section))return;
      if(String(section.type||'').toLowerCase()==='separator')return;
      const html=sectionHtml(section);if(!html)return;
      if(['performancenote','performance-note'].includes(String(section.type||'').toLowerCase())){
        const cue=document.createElement('div');cue.className='ls26-singer-performance-cue ls26-singer-v2-section';cue.dataset.sourceIndex=String(sourceIndex);cue.innerHTML=html;lyrics.appendChild(cue);return;
      }
      const block=document.createElement('section');block.className='ls26-singer-v2-section';block.dataset.sourceIndex=String(sourceIndex);
      if(section.title){const h=document.createElement('h2');h.textContent=section.title;block.appendChild(h);}
      const body=document.createElement('div');body.className='ls26-singer-v2-body';body.innerHTML=html;block.appendChild(body);wrapLines(body);lyrics.appendChild(block);
    });
    const end=document.createElement('div');end.className='singer-end';end.textContent='[ END ]';lyrics.appendChild(end);
    requestAnimationFrame(()=>{updateLineFocus();updateRunways();});
  }

  function updateRunways(){
    const top=document.querySelector('.singer-topbar')?.getBoundingClientRect().height||0;
    const anchor=Math.max(top+45,window.innerHeight*.40);
    document.documentElement.style.setProperty('--singer-sync-top-runway',`${Math.round(anchor-top)}px`);
    document.documentElement.style.setProperty('--singer-sync-bottom-runway',`${Math.round(Math.max(180,window.innerHeight-anchor+160))}px`);
  }
  function lineCandidates(){return [...lyrics.querySelectorAll('.ls26-singer-line:not(.is-chord-line)')].filter(el=>el.offsetParent!==null&&el.textContent.trim());}
  function updateLineFocus(){
    if(lyrics.hidden)return;
    const lines=lineCandidates();if(!lines.length)return;
    const anchor=Math.max((document.querySelector('.singer-topbar')?.getBoundingClientRect().bottom||0)+40,window.innerHeight*.40);
    let current=0,best=Infinity;
    lines.forEach((line,index)=>{const rect=line.getBoundingClientRect(),distance=Math.abs(rect.top-anchor);if(rect.top<=anchor+28&&distance<best){current=index;best=distance;}});
    lines.forEach((line,index)=>{
      const featured=index>=current&&index<=current+2;
      line.classList.toggle('is-current',index===current);line.classList.toggle('is-featured',featured);line.classList.toggle('is-muted',!featured);
    });
  }
  function singerSections(){return [...lyrics.querySelectorAll('.ls26-singer-v2-section[data-source-index]')];}
  function resolveSection(sync,sections){
    const wanted=Number(sync?.activeSourceIndex),exact=sections.find(el=>Number(el.dataset.sourceIndex)===wanted);if(exact)return exact;
    return [...sections].reverse().find(el=>Number(el.dataset.sourceIndex)<=wanted)||sections[0]||null;
  }
  function projectedProgress(sync){
    const base=Math.max(0,Math.min(1,Number(sync?.sectionProgress)||0)),rate=Math.max(0,Number(sync?.progressRatePerMs)||0),elapsed=Math.max(0,Math.min(3500,Date.now()-Number(sync?.updatedAtMs||Date.now())));return Math.max(0,Math.min(1,base+(rate*elapsed)));
  }
  function movementTick(){
    cancelAnimationFrame(movementFrame);movementFrame=0;
    if(!control||!song||lyrics.hidden)return;
    const playback=control.singerPlayback||{},playing=playback.state==='playing';
    if(playing){
      const sync=control.singerSync,sections=singerSections();
      if(sync?.enabled&&sections.length){
        const active=resolveSection(sync,sections);
        if(active){
          const activeSource=Number(active.dataset.sourceIndex),next=sections.find(el=>Number(el.dataset.sourceIndex)===Number(sync.nextSourceIndex))||sections.find(el=>Number(el.dataset.sourceIndex)>activeSource)||null;
          const progress=projectedProgress(sync),activeTop=active.getBoundingClientRect().top+scrollY,nextTop=next?(next.getBoundingClientRect().top+scrollY):activeTop;
          const semanticTop=activeTop+((nextTop-activeTop)*progress),anchor=Math.max((document.querySelector('.singer-topbar')?.getBoundingClientRect().bottom||0)+40,innerHeight*.40);
          const max=Math.max(0,document.documentElement.scrollHeight-innerHeight),target=Math.max(0,Math.min(max,semanticTop-anchor)),delta=target-scrollY;
          if(lastSyncSource!==activeSource){scrollTo(0,target);lastSyncSource=activeSource;}else if(Math.abs(delta)>.3)scrollBy(0,delta*.10);
        }
      }else if(autoFallback){scrollBy(0,.42*localSpeed);}
    }
    updateLineFocus();
    movementFrame=requestAnimationFrame(movementTick);
  }

  function showPreview(){
    document.body.classList.add('ls26-singer-v2-active');
    state.hidden=false;lyrics.hidden=true;
    state.querySelector('.ls26-singer-state-kicker').textContent='CURRENTLY SHOWING';
    state.querySelector('#ls26SingerStateTitle').textContent=song?.title||control?.songTitle||'Untitled Song';
    state.querySelector('#ls26SingerStateArtist').textContent=window.ArtistNames?.display?.(song?.artist||control?.songArtist)||song?.artist||control?.songArtist||'';
    state.querySelector('#ls26SingerCount').hidden=true;
    const settings=document.getElementById('singerSettingsBtn');if(settings){settings.disabled=false;settings.setAttribute('aria-disabled','false');}
    scrollTo(0,0);
  }
  function showLyrics(){
    document.body.classList.add('ls26-singer-v2-active');state.hidden=true;lyrics.hidden=false;
    const settings=document.getElementById('singerSettingsBtn');if(settings){settings.disabled=false;settings.setAttribute('aria-disabled','false');}
    updateRunways();movementTick();
  }
  function showCountIn(playback){
    cancelAnimationFrame(countFrame);showPreview();
    const count=state.querySelector('#ls26SingerCount');count.hidden=false;
    state.querySelector('.ls26-singer-state-kicker').textContent='GET READY';
    const bpm=Math.max(20,Math.min(400,Number(playback?.bpm)||96)),beatMs=60000/bpm,start=Number(playback?.countInStartMs)||Date.now(),beats=Math.max(1,Number(playback?.countInBeats)||4),playAt=Number(playback?.playAtMs)||start+(beats*beatMs);
    const tick=()=>{
      const now=Date.now();
      if(now>=playAt){count.hidden=true;showLyrics();return;}
      const index=Math.max(0,Math.min(beats-1,Math.floor(Math.max(0,now-start)/beatMs)));count.textContent=String(index+1);
      countFrame=requestAnimationFrame(tick);
    };tick();
  }
  function applyPlayback(){
    if(!control||!song)return;
    const playback=control.singerPlayback||{};
    if(playback.state==='countin'){showCountIn(playback);return;}
    if(playback.state==='playing'||playback.state==='paused'){showLyrics();return;}
    showPreview();
  }

  async function loadSong(id,force=false){
    if(!id)return;
    if(id===songId&&song&&!force){applyPlayback();return;}
    songId=id;
    try{
      const snap=await window.db.collection('lyrics').doc(id).get();
      if(!snap.exists)return;
      song=window.LyricsCommon?.normalizeSong?.(snap.data(),snap.id)||{...snap.data(),firebaseId:snap.id};renderSong();applyPlayback();
    }catch(error){console.warn('Singer v2 could not load song:',error);}
  }
  function handleControl(data){
    control=data||{};
    const id=String(control.currentLyricsSongId||control.currentSongId||control.songId||'').trim();
    const token=String(control.forceReloadToken||'');
    if(!id||['idle','auto-send-off','finished'].includes(String(control.displayState||'').toLowerCase())){
      document.body.classList.remove('ls26-singer-v2-active');state.hidden=true;lyrics.hidden=true;song=null;songId='';reloadToken='';cancelAnimationFrame(movementFrame);return;
    }
    const force=token&&token!==reloadToken;reloadToken=token;
    void loadSong(id,force);
    if(song&&id===songId)applyPlayback();
  }
  function startControlListener(){
    if(!window.db)return;
    controlUnsub=window.db.collection(CONTROL_COLLECTION).doc(CONTROL_DOC).onSnapshot(doc=>handleControl(doc.exists?doc.data():{}),error=>console.warn('Singer v2 control unavailable:',error));
  }

  function start(){
    applySettings();
    window.addEventListener('resize',()=>{updateRunways();updateLineFocus();});
    window.addEventListener('scroll',updateLineFocus,{passive:true});
    startControlListener();
  }
  start();
})();
