/* Copyright © 2026 LiveSuite. Singer Screen controller.
 * Sole owner of settings, rendering, local/remote sync, focus and scrolling.
 * Source mapping is shared with LyricView; idle/paused states schedule no loop. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),CHANNEL='ls26-singer-live-v3';
 const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch(_){return fallback;}};
 const save=(key,value)=>{try{localStorage.setItem(key,String(value));}catch(_){}};
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const num=(key,fallback,min,max)=>clamp(Number(read(key,fallback))||fallback,min,max);
 let song=null,songId='',pendingId='',loadGeneration=0,latest=null,channel=null,unsubscribe=null;
 let lines=[],sections=new Map(),lineMap=new Map(),focused=null,frame=0,moveTarget=0,focusPct=.4;
 let localReceivedAt=0,localStamp=0,localPaused=false,destroyed=false,renderedPhase='',viewKey='',reloadToken=null;
 let guidance='normal',auto=true,speed=1,showBottom=true;
 const lyrics=document.createElement('main');lyrics.id='ls26SingerV31Lyrics';lyrics.hidden=true;
 document.querySelector('.singer-topbar').after(lyrics);
 const stateView=document.createElement('div');stateView.id='ls26SingerV31State';stateView.hidden=true;
 stateView.innerHTML='<div class="ls26-singer-state-card"><span class="ls26-singer-state-kicker">CURRENTLY SHOWING</span><h1></h1><h2></h2><div class="ls26-singer-count" hidden></div></div>';
 document.body.append(stateView);
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
    #singerSettings{z-index:2147483646!important;pointer-events:auto!important}
    #singerSettings:not(.hidden){display:block!important}
    #ls26SingerV31Lyrics{display:block;box-sizing:border-box;max-width:980px;margin:0 auto;padding:var(--ls26-singer-top-runway,120px) 5vw max(34vh,var(--ls26-singer-bottom-runway,260px));color:#fff;min-height:170vh}
    #ls26SingerV31Lyrics[hidden]{display:none!important}
    .ls26-singer-v31-section{margin:0 0 36px}
    .ls26-singer-v31-section h2{margin:0 0 12px;font-size:.78em;letter-spacing:.07em;text-transform:uppercase;opacity:.78}
    .ls26-singer-v31-body{font-weight:760;line-height:1.42}
    .ls26-singer-v31-line{display:block;box-sizing:border-box;min-height:1.25em;margin:.07em 0;padding:.05em .14em;border-left:4px solid transparent;border-radius:7px;transform-origin:left center;transition:opacity .15s ease,background-color .15s ease}
    .ls26-singer-v31-line.is-current{font-size:var(--ls26-singer-current-scale,1.72em)!important;opacity:1!important;font-weight:950!important;border-left-color:var(--ls26-singer-current-colour,#16d8ff)!important;background:linear-gradient(90deg,color-mix(in srgb,var(--ls26-singer-current-colour,#16d8ff) 20%,transparent),color-mix(in srgb,var(--ls26-singer-current-colour,#16d8ff) 4%,transparent) 72%,transparent)!important;text-shadow:0 0 16px color-mix(in srgb,var(--ls26-singer-current-colour,#16d8ff) 20%,transparent);filter:none!important}
    .ls26-singer-v31-line.is-context{font-size:var(--ls26-singer-context-scale,1.48em)!important;opacity:.96!important;font-weight:850!important;filter:none!important}
    .ls26-singer-v31-line.is-muted{font-size:var(--ls26-singer-muted-scale,.82em)!important;opacity:var(--ls26-singer-muted-opacity,.60)!important;filter:saturate(.72)}
    .ls26-singer-v31-line.is-chord-line{padding-top:calc(.05em + var(--ls26-singer-chord-before,0px));padding-bottom:calc(.05em + var(--ls26-singer-chord-after,0px));font-size:.92em!important;opacity:.84!important;font-weight:900!important;letter-spacing:.025em;color:#eafcff}
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
    body.singer-standby-mode #standbyView *,body.singer-standby-mode #standbyView *::before,body.singer-standby-mode #standbyView *::after{animation:none!important}
    #karaokeScrollTrack{display:none!important}
    #singerSettings:not(.hidden){visibility:visible!important;opacity:1!important}
    .ls26-singer-v31-line{white-space:pre-wrap}
  `;
  document.head.appendChild(style);

 function text(node,value){if(node&&node.textContent!==String(value||''))node.textContent=String(value||'');}
 function stopMovement(){if(frame)cancelAnimationFrame(frame);frame=0;}
 function updateHeader(){
  const h=Math.ceil(document.querySelector('.singer-topbar').getBoundingClientRect().height||82);
  const anchor=Math.max(h+44,innerHeight*focusPct),root=document.documentElement.style;
  root.setProperty('--ls26-singer-header-h',h+'px');
  root.setProperty('--ls26-singer-top-runway',Math.max(34,anchor-h)+'px');
  root.setProperty('--ls26-singer-bottom-runway',Math.max(220,innerHeight-anchor+180)+'px');
 }
 function applySettings(){
  const previousGuidance=guidance;
  guidance=read('karaokeGuidanceMode','normal');if(!['normal','pro','guitaroke'].includes(guidance))guidance='normal';
  const choices={guidance,theme:read('ls26:singerTheme','default'),font:read('ls26:singerFont','default'),size:read('ls26:singerTextSize','normal'),spacing:read('ls26:singerSpacing','normal')};
  Object.assign(document.body.dataset,choices);
  for(const [key,value] of Object.entries(choices))document.querySelectorAll(`button[data-${key}]`).forEach(b=>b.classList.toggle('active',b.dataset[key]===value));
  const root=document.documentElement.style;
  focusPct=num('ls26:singerFocusPosition',40,20,65)/100;
  for(const [name,key,def,min,max,unit] of [
   ['current-scale','CurrentLineScale',1.72,1,2.5,'em'],['context-scale','ContextLineScale',1.48,.9,2.3,'em'],['muted-scale','MutedLineScale',.82,.45,1.4,'em'],['muted-opacity','MutedOpacity',.60,.2,1,'']
  ])root.setProperty('--ls26-singer-'+name,num('ls26:singer'+key,def,min,max)+unit);
  root.setProperty('--ls26-singer-chord-before',num('ls26:singerChordSpaceAbove',0,0,40)+'px');
  root.setProperty('--ls26-singer-chord-after',num('ls26:singerChordSpaceBelow',0,0,40)+'px');
  const colour=read('ls26:singerCurrentLineColour','#16d8ff');root.setProperty('--ls26-singer-current-colour',/^#[0-9a-f]{6}$/i.test(colour)?colour:'#16d8ff');
  const background=read('ls26:karaokeSingerBackground','#00131a');root.setProperty('--singer-custom-background',/^#[0-9a-f]{6}$/i.test(background)?background:'#00131a');
  $('singerBackgroundColor').value=background;text($('singerBackgroundColorValue'),background.toUpperCase());
  auto=read('ls26:singerAutoScroll','true')!=='false';speed=num('ls26:singerScrollSpeed',1,.25,3);showBottom=read('ls26:karaokeSingerBottomBar','true')!=='false';
  $('singerAutoScroll').checked=auto;$('singerShowBottomBar').checked=showBottom;
  text($('singerSpeedLabel'),speed.toFixed(2)+'×');text($('singerBottomSpeed'),speed.toFixed(2)+'×');
  if(song&&guidance!==previousGuidance){renderSong();show();}
  updateHeader();updateControls();if(!auto)stopMovement();else follow();
 }
 window.addEventListener('ls26:prompter-settings',applySettings);
 function updateControls(){
  $('singerControls').classList.toggle('hidden',!showBottom||lyrics.hidden);
  text($('singerPlayBtn'),latest?.phase==='playing'&&!localPaused?'Ⅱ':'▶');
 }
 function installControls(){
  const button=document.createElement('button');button.type='button';button.dataset.guidance='guitaroke';button.textContent='Guitaroke';document.querySelector('.guidance-options').append(button);
  const settings=$('singerSettings');
  const globalControls=document.createElement('div');globalControls.innerHTML='<button type="button" data-load-global>Reload global defaults</button><p role="status" data-global-status>Global defaults are saved in Admin → Prompter → Settings. Adjustments here stay on this device.</p>';settings.append(globalControls);
  const globalStatus=globalControls.querySelector('[data-global-status]');
  globalControls.querySelector('[data-load-global]').onclick=async()=>{const result=await window.LS26PrompterSettings.load(true);globalStatus.textContent=result.error?'Global settings unavailable; local settings retained.':result.remote?'Global defaults loaded.':'No global defaults saved yet.';};

  $('singerSettingsBtn').disabled=false;
  $('singerSettingsBtn').onclick=()=>settings.classList.toggle('hidden');
  $('closeSingerSettings').onclick=()=>settings.classList.add('hidden');
  $('fullscreenSingerBtn').onclick=async()=>{
   try{if(document.fullscreenElement||document.webkitFullscreenElement){if(document.exitFullscreen)await document.exitFullscreen();else document.webkitExitFullscreen?.();}
    else if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch(_){await document.documentElement.requestFullscreen();}}
    else document.documentElement.webkitRequestFullscreen?.();
   }catch(error){console.warn('Singer fullscreen request failed:',error);}
  };
  const keys={guidance:'karaokeGuidanceMode',theme:'ls26:singerTheme',font:'ls26:singerFont',size:'ls26:singerTextSize',spacing:'ls26:singerSpacing'};
  settings.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;for(const [key,storage]of Object.entries(keys))if(b.dataset[key]){
   save(storage,b.dataset[key]);if(key==='theme')save('ls26:karaokeSingerBackground',({warm:'#160d07',contrast:'#000000',default:'#00131a'})[b.dataset[key]]||'#00131a');applySettings();
  }});
  $('singerBackgroundColor').oninput=e=>{save('ls26:karaokeSingerBackground',e.target.value);applySettings();};
  $('singerShowBottomBar').onchange=e=>{save('ls26:karaokeSingerBottomBar',e.target.checked);applySettings();};
  $('singerAutoScroll').onchange=e=>{save('ls26:singerAutoScroll',e.target.checked);localPaused=false;applySettings();};
  for(const [id,delta]of [['singerSpeedDown',-.25],['singerMinusBtn',-.25],['singerSpeedUp',.25],['singerPlusBtn',.25]])$(id).onclick=()=>{save('ls26:singerScrollSpeed',clamp(speed+delta,.25,3));applySettings();};
  $('singerPlayBtn').onclick=()=>{localPaused=!localPaused;updateControls();if(localPaused)stopMovement();else follow();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')settings.classList.add('hidden');});
 }
 function renderSong(){
  viewKey='';lyrics.replaceChildren();lines=[];sections=new Map();lineMap=new Map();focused=null;
  (song.sections||[]).forEach((section,sourceIndex)=>{
   const rows=window.LS26SingerLines.section(section,document);if(!rows.length)return;
   const block=document.createElement('section');block.className='ls26-singer-v31-section';block.dataset.sourceIndex=sourceIndex;
   if(section.title){const h=document.createElement('h2');h.textContent=section.title;block.append(h);}
   const body=document.createElement('div');body.className='ls26-singer-v31-body';block.append(body);
   for(const row of rows){
    if(row.kind==='chord'&&guidance!=='guitaroke')continue;
    const line=document.createElement('div');line.dataset.sourceLineIndex=row.sourceLineIndex;
    if(row.kind==='cue'){line.className='ls26-singer-performance-cue';line.textContent=row.text;if(row.size)line.style.fontSize=row.size+'px';if(row.colour)line.style.color=row.colour;}
    else{
     line.className='ls26-singer-v31-line'+(row.kind==='chord'?' is-chord-line':' is-muted');
     if(guidance==='normal')line.textContent=row.text;else line.innerHTML=guidance==='guitaroke'?row.guitarHtml:row.html;
     if(row.kind==='lyric'){lines.push(line);lineMap.set(sourceIndex+':'+row.sourceLineIndex,line);}
    }
    body.append(line);
   }
   sections.set(sourceIndex,block);lyrics.append(block);
  });
  const end=document.createElement('div');end.className='singer-end';end.textContent='[ END ]';lyrics.append(end);
 }
 function currentLine(sync){
  if(!sync)return lines[0]||null;
  const key=sync.sourceIndex+':'+sync.currentLyricLineIndex;
  if(lineMap.has(key))return lineMap.get(key);
  if(sync.followOn)return null; // Never text-match a repeated lyric or shift an uncertain anchor.
  const block=sections.get(Number(sync.sourceIndex));
  const candidates=lines.filter(line=>block?.contains(line));
  return candidates[Math.min(candidates.length-1,Math.floor(clamp(Number(sync.sectionProgress)||0,0,1)*candidates.length))]||null;
 }
 function focus(sync){
  const next=currentLine(sync);if(!next||next===focused)return;
  focused=next;const index=lines.indexOf(next);
  lines.forEach((line,i)=>{const distance=Math.abs(i-index);line.classList.toggle('is-current',distance===0);line.classList.toggle('is-context',distance===1||distance===2);line.classList.toggle('is-muted',distance>2);});
 }
 function move(){
  frame=0;if(destroyed||document.hidden||lyrics.hidden||latest?.phase!=='playing'||localPaused||!auto)return;
  const delta=moveTarget-scrollY;
  if(Math.abs(delta)<1)return;
  scrollTo(0,scrollY+delta*clamp(.15*speed,.08,.45));frame=requestAnimationFrame(move);
 }
 function follow(){
  if(lyrics.hidden||latest?.phase!=='playing'||localPaused||!auto||document.hidden)return;
  const sync=latest.sync;
  const anchor=Math.max(document.querySelector('.singer-topbar').getBoundingClientRect().bottom+44,innerHeight*focusPct);
  let target;
  if(focused&&(sync?.followOn||sync?.currentLyricLineIndex>=0))target=focused.getBoundingClientRect().top+scrollY-anchor;
  else{
   const block=sections.get(Number(sync?.sourceIndex)),list=[...sections.values()],next=list[list.indexOf(block)+1];
   if(!block)return;
   const top=block.getBoundingClientRect().top+scrollY;
   const end=next?next.getBoundingClientRect().top+scrollY:top+block.offsetHeight;
   target=top+(end-top)*clamp(Number(sync?.sectionProgress)||0,0,1)-anchor;
  }
  moveTarget=clamp(target,0,Math.max(0,document.documentElement.scrollHeight-innerHeight));
  if(!frame&&Math.abs(moveTarget-scrollY)>1)frame=requestAnimationFrame(move);
 }
 function show(){
  if(!latest)return;
  const sync=latest.sync;
  const key=JSON.stringify([latest.songId,latest.phase,latest.title,latest.artist,latest.countInBeat,Boolean(song),guidance,sync?.sourceIndex,sync?.currentLyricLineIndex,sync?.followOn,sync?.followOn?0:sync?.sectionProgress]);
  if(key===viewKey)return;viewKey=key;
  const phase=latest.phase,displayLyrics=Boolean(song)&&['playing','paused','complete'].includes(phase);
  const changed=renderedPhase!==phase;renderedPhase=phase;
  document.body.classList.toggle('ls26-singer-v31-active',phase!=='idle');document.body.classList.toggle('singer-standby-mode',phase==='idle');
  lyrics.hidden=!displayLyrics;stateView.hidden=displayLyrics||phase==='idle';
  text($('singerTitle'),song?.title||latest.title||'KARAOKE LYRIC VIEW');
  text($('singerArtist'),window.ArtistNames?.display?.(song?.artist||latest.artist)||song?.artist||latest.artist||'');
  if(!displayLyrics){
   text(stateView.querySelector('.ls26-singer-state-kicker'),phase==='countin'?'GET READY':phase==='idle'?'READY FOR THE NEXT SINGER':'CURRENTLY SHOWING');
   text(stateView.querySelector('h1'),phase==='idle'?'':song?.title||latest.title||'');text(stateView.querySelector('h2'),phase==='idle'?'':$('singerArtist').textContent);
   const count=stateView.querySelector('.ls26-singer-count');count.hidden=phase!=='countin';text(count,Number(latest.countInBeat)>0?latest.countInBeat:'…');
  }
  if(changed)updateHeader();
  if(displayLyrics){focus(latest.sync);follow();}
  if(phase!=='playing')stopMovement();updateControls();
 }
 async function loadSong(id){
  pendingId=id;const generation=++loadGeneration;
  try{const doc=await window.db.collection('lyrics').doc(id).get();if(destroyed||generation!==loadGeneration)return;
   pendingId='';if(!doc.exists)throw Error('The selected song is not in the lyrics database.');
   song=window.LyricsCommon.normalizeSong(doc.data(),doc.id);songId=id;renderSong();show();
  }catch(error){if(generation===loadGeneration){pendingId='';text(stateView.querySelector('h2'),error.message);}console.warn('Singer could not load song:',error);}
 }
 function accept(next,local=false){
  if(!next||Number(next.version)!==3||destroyed)return;
  const stamp=Number(next.updatedAtMs)||0;
  // Firestore echoes cannot move a local performance backwards.
  if(!local&&localReceivedAt&&Date.now()-localReceivedAt<5000)return;
  if(local){if(stamp<localStamp)return;localStamp=stamp;localReceivedAt=Date.now();}
  else if(latest&&stamp<Number(latest.updatedAtMs||0))return;
  const id=String(next.songId||'');latest=next;
  if(latest.phase==='idle'||!id){loadGeneration++;pendingId='';song=null;songId='';lines=[];focused=null;latest={...next,phase:'idle'};show();return;}
  if(id!==songId){if(pendingId!==id){song=null;stopMovement();show();void loadSong(id);}return;}
  show();
 }
 function control(data){
  const phase=String(data?.displayState||'');
  if(['idle','auto-send-off','finished'].includes(phase)||data?.reset){accept({version:3,phase:'idle',songId:'',updatedAtMs:Date.now()});return;}
  const token=data?.forceReloadToken;
  if(token&&reloadToken&&token!==reloadToken){songId='';viewKey='';localReceivedAt=0;}if(token)reloadToken=token;
  const id=String(data?.currentLyricsSongId||data?.currentSongId||data?.songId||'');
  if(data?.singerV3&&data.singerV3.songId===id){accept(data.singerV3);return;}
  accept({version:3,songId:id,phase:id?'preview':'idle',title:data?.songTitle||'',artist:data?.songArtist||'',updatedAtMs:Date.now()});
 }
 installControls();applySettings();
 if(window.db)unsubscribe=window.db.collection('karaokeControl').doc('liveLyrics').onSnapshot(doc=>control(doc.exists?doc.data():{}),error=>console.warn('Singer control unavailable:',error));
 try{channel=new BroadcastChannel(CHANNEL);channel.onmessage=e=>{if(e.data?.type==='state')accept(e.data.state,true);};channel.postMessage({type:'request-state'});}catch(_){}
 window.addEventListener('storage',e=>{
  if(e.key==='ls26:singer-v3-state'&&e.newValue){try{const message=JSON.parse(e.newValue);if(message.type==='state')accept(message.state,true);}catch(_){}return;}
  if(e.key==='karaokeGuidanceMode'||e.key?.startsWith('ls26:singer')||e.key?.startsWith('ls26:karaokeSinger'))applySettings();
 });
 window.addEventListener('resize',()=>{updateHeader();follow();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMovement();else{show();channel?.postMessage({type:'request-state'});}});
 window.addEventListener('pagehide',()=>{destroyed=true;loadGeneration++;stopMovement();unsubscribe?.();channel?.close();},{once:true});
 void window.LS26PrompterSettings?.load();
})();
