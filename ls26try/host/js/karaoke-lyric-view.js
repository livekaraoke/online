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
 const colour=(key,fallback)=>{const value=String(read(key,fallback));return /^#[0-9a-f]{6}$/i.test(value)?value:fallback;};
 let song=null,songId='',pendingId='',loadGeneration=0,latest=null,channel=null,unsubscribe=null;
 let lines=[],sections=new Map(),lineMap=new Map(),focused=null,frame=0,moveTarget=0,focusPct=.4,moveLastAt=0,manualHoldUntil=0;
 let localReceivedAt=0,localStamp=0,localPaused=false,destroyed=false,renderedPhase='',viewKey='',reloadToken=null;
 let guidance='normal',auto=true,speed=1,showBottom=true,smoothingMs=720;
 const lyrics=document.createElement('main');lyrics.id='ls26SingerV31Lyrics';lyrics.hidden=true;
 document.querySelector('.singer-topbar').after(lyrics);
 const stateView=document.createElement('div');stateView.id='ls26SingerV31State';stateView.hidden=true;
 stateView.innerHTML='<div class="ls26-singer-state-card"><span class="ls26-singer-state-kicker">UP NEXT</span><h1></h1><h2></h2><div class="ls26-singer-ready" aria-hidden="true"><i></i><i></i><i></i></div></div>';
 document.body.append(stateView);
 const style=document.createElement('style');style.id='ls26SingerScreenV32Style';style.textContent=`
  body.ls26-singer-v31-active #standbyView,body.ls26-singer-v31-active #autoSendIdleView,body.ls26-singer-v31-active #songFinishedView,body.ls26-singer-v31-active #songLoadingView,body.ls26-singer-v31-active #singerLyrics{display:none!important}
  body.ls26-singer-v31-active{overflow-x:hidden!important;background:var(--singer-custom-background,#00131a)!important}
  body.ls26-singer-v31-active .singer-topbar{position:sticky!important;top:0!important;z-index:130100!important}
  #singerSettings{z-index:2147483646!important;pointer-events:auto!important}#singerSettings:not(.hidden){display:block!important;visibility:visible!important;opacity:1!important}
  #ls26SingerV31Lyrics{display:block;box-sizing:border-box;max-width:980px;margin:0 auto;padding:var(--ls26-singer-top-runway,120px) 5vw max(34vh,var(--ls26-singer-bottom-runway,260px));color:#fff;min-height:170vh;transition:opacity .24s ease,transform .24s ease}
  #ls26SingerV31Lyrics[hidden]{display:none!important}#ls26SingerV31Lyrics.ls26-entering{animation:ls26SingerLyricsIn .24s ease-out both}@keyframes ls26SingerLyricsIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .ls26-singer-v31-section{margin:0 0 32px}.ls26-singer-v31-section h2{position:relative;left:var(--ls26-singer-section-title-left,0%);transform:translateX(var(--ls26-singer-section-title-shift,0%));display:inline-flex;align-items:center;width:max-content;max-width:100%;box-sizing:border-box;margin:0 0 12px;padding:5px 10px;border:1px solid var(--ls26-section-source-colour,#9fb7c2);border-left-width:3px;border-radius:7px;background:color-mix(in srgb,var(--ls26-section-source-colour,#9fb7c2) 10%,transparent);color:var(--ls26-section-source-colour,#cbd7dc);font-size:.72em;font-weight:900;line-height:1.15;letter-spacing:.08em;text-transform:uppercase;opacity:.9}
  body[data-section-colour-mode="custom"] #ls26SingerV31Lyrics .ls26-singer-v31-section h2{border-color:var(--ls26-singer-section-custom-colour,#42f35c);background:color-mix(in srgb,var(--ls26-singer-section-custom-colour,#42f35c) 10%,transparent);color:var(--ls26-singer-section-custom-colour,#42f35c)}
  .ls26-singer-v31-body{font-weight:var(--ls26-singer-lyrics-weight,760);line-height:1.42;letter-spacing:var(--ls26-singer-character-spacing,0px)}
  .ls26-singer-v31-line{display:block;box-sizing:border-box;min-height:0;margin:.08em 0;padding:.04em .14em;border-left:4px solid transparent;border-radius:7px;transform-origin:left center;white-space:pre-wrap;transition:opacity .16s ease,background-color .15s ease,font-size .18s ease}
  .ls26-singer-v31-line.is-current{font-size:var(--ls26-singer-current-scale,1.72em)!important;opacity:1!important;font-weight:var(--ls26-singer-current-weight,900)!important;border-left-color:var(--ls26-singer-current-colour,#16d8ff)!important;background:linear-gradient(90deg,color-mix(in srgb,var(--ls26-singer-current-colour,#16d8ff) 20%,transparent),color-mix(in srgb,var(--ls26-singer-current-colour,#16d8ff) 4%,transparent) 72%,transparent)!important;text-shadow:0 0 16px color-mix(in srgb,var(--ls26-singer-current-colour,#16d8ff) 20%,transparent);filter:none!important}
  .ls26-singer-v31-line.is-context{font-size:var(--ls26-singer-context-scale,1.48em)!important;filter:none!important}.ls26-singer-v31-line.is-muted{font-size:var(--ls26-singer-muted-scale,.82em)!important;opacity:var(--ls26-singer-muted-opacity,.60)!important;filter:saturate(.72)}
  .ls26-singer-v31-line[data-ls26-gradient="1"]{font-size:var(--ls26-gradual-size,1em)!important;opacity:var(--ls26-gradual-opacity,1)!important;filter:none!important}
  .ls26-singer-v31-line.is-chord-line{padding-top:calc(.04em + var(--ls26-singer-chord-before,0px));padding-bottom:calc(.04em + var(--ls26-singer-chord-after,0px));font-size:.92em!important;font-weight:900!important;letter-spacing:.025em;color:#eafcff}
  body:not([data-guidance="guitaroke"]) #ls26SingerV31Lyrics .is-chord-line{display:none!important;margin:0!important;padding:0!important;min-height:0!important;height:0!important}
  body[data-guidance="normal"] #ls26SingerV31Lyrics .ls26-pro-format{font-style:normal!important;text-decoration:none!important}
  .ls26-singer-performance-cue{display:block;width:max-content;max-width:90%;margin:12px auto;padding:7px 11px;text-align:center;font-weight:850;color:#a7bbc4}
  .ls26-singer-performance-cue.ls26-performance-note{width:min(760px,90%);box-sizing:border-box;margin:var(--ls26-singer-performance-note-spacing,20px) auto;padding:var(--ls26-singer-performance-note-padding,14px);border:1px solid var(--ls26-singer-performance-note-border,#45c979);border-left-width:4px;border-radius:11px;background:linear-gradient(135deg,color-mix(in srgb,var(--ls26-singer-performance-note-border,#45c979) 10%,rgba(3,18,26,.92)),rgba(3,18,26,.78));box-shadow:0 8px 24px rgba(0,0,0,.18),inset 0 0 0 1px color-mix(in srgb,var(--ls26-singer-performance-note-border,#45c979) 8%,transparent);color:var(--ls26-singer-performance-note-colour,#75f2a0);font-size:var(--ls26-singer-performance-note-size,24px);font-weight:900;line-height:1.25;letter-spacing:.025em}
  .ls26-singer-v31-section.ls26-performance-note-only>h2{display:none!important}
  #ls26SingerV31State{position:fixed;z-index:120000;left:0;right:0;bottom:0;top:var(--ls26-singer-header-h,82px);display:flex;align-items:center;justify-content:center;padding:30px;background:var(--singer-custom-background,#00131a);text-align:center;color:#fff;transition:opacity .2s ease}
  #ls26SingerV31State[hidden]{display:none!important}.ls26-singer-state-card{width:min(860px,92vw)}.ls26-singer-state-kicker{display:block;margin-bottom:18px;color:#16d8ff;font-size:clamp(16px,2vw,25px);font-weight:950;letter-spacing:.16em}.ls26-singer-state-card h1{margin:0 0 10px;font-size:clamp(34px,6vw,78px);line-height:1.03}.ls26-singer-state-card h2{margin:0;color:#9fc5d1;font-size:clamp(22px,3.4vw,42px)}
  .ls26-singer-ready{display:flex;justify-content:center;gap:10px;margin-top:30px}.ls26-singer-ready i{display:block;width:10px;height:10px;border-radius:50%;background:#16d8ff;box-shadow:0 0 16px rgba(22,216,255,.45);animation:ls26Ready 1.25s ease-in-out infinite}.ls26-singer-ready i:nth-child(2){animation-delay:.16s}.ls26-singer-ready i:nth-child(3){animation-delay:.32s}@keyframes ls26Ready{0%,70%,100%{opacity:.24;transform:scale(.72)}35%{opacity:1;transform:scale(1.12)}}
  .guidance-options button[data-guidance="guitaroke"]{border-color:rgba(255,190,60,.48)!important;color:#ffd16d!important}.guidance-options button[data-guidance="guitaroke"].active{background:rgba(255,177,35,.16)!important;border-color:#ffbb35!important;color:#ffe29a!important}
  body[data-theme="warm"] #ls26SingerV31Lyrics{color:#fff5e9}body[data-theme="contrast"] #ls26SingerV31Lyrics{color:#fff}body[data-font="arial"] #ls26SingerV31Lyrics{font-family:Arial,sans-serif}body[data-font="dyslexic"] #ls26SingerV31Lyrics{font-family:OpenDyslexic,Arial,sans-serif}body[data-size="small"] #ls26SingerV31Lyrics{font-size:.86em}body[data-size="large"] #ls26SingerV31Lyrics{font-size:1.17em}body[data-size="xlarge"] #ls26SingerV31Lyrics{font-size:1.35em}body[data-spacing="loose"] #ls26SingerV31Lyrics .ls26-singer-v31-body{line-height:1.62}body[data-spacing="looser"] #ls26SingerV31Lyrics .ls26-singer-v31-body{line-height:1.85}
  body.singer-standby-mode #standbyView *,body.singer-standby-mode #standbyView *::before,body.singer-standby-mode #standbyView *::after{animation:none!important}#karaokeScrollTrack{display:none!important}
 `;document.head.appendChild(style);
 function text(node,value){if(node&&node.textContent!==String(value||''))node.textContent=String(value||'');}
 function stopMovement(){if(frame)cancelAnimationFrame(frame);frame=0;moveLastAt=0;}
 function sectionColour(section){
  const explicit=String(section?.style?.titleColor||'').trim();if(/^#[0-9a-f]{6}$/i.test(explicit))return explicit;
  const key=String(section?.title||section?.type||'').trim().toUpperCase();
  if(/CHORUS/.test(key))return '#42f35c';if(/PRE.?CHORUS/.test(key))return '#ffb45c';if(/ENDING|OUTRO|END/.test(key))return '#ffd400';if(/INTERLUDE|INTRO|INSTRUMENTAL|SOLO/.test(key))return '#58c7e8';return '#cbd7dc';
 }
 function performanceNoteText(title,value){
  const raw=String(value||'').trim(),match=raw.match(/\(([^()]+)\)\s*$/),note=(match?.[1]||raw).trim();
  const heading=String(title||'').trim().toUpperCase();return heading?`${heading} - (${note})`:`(${note})`;
 }
 function updateHeader(){
  const h=Math.ceil(document.querySelector('.singer-topbar').getBoundingClientRect().height||82),anchor=Math.max(h+44,innerHeight*focusPct),root=document.documentElement.style;
  root.setProperty('--ls26-singer-header-h',h+'px');root.setProperty('--ls26-singer-top-runway',Math.max(34,anchor-h)+'px');root.setProperty('--ls26-singer-bottom-runway',Math.max(220,innerHeight-anchor+180)+'px');
 }
 function titlePosition(){
  const mode=String(read('ls26:singerSectionTitleAlign','left')).toLowerCase(),raw=clamp(Number(read('ls26:singerSectionTitleX','0'))||0,-20,100),root=document.documentElement.style;
  if(mode==='center'){root.setProperty('--ls26-singer-section-title-left','50%');root.setProperty('--ls26-singer-section-title-shift','-50%');}
  else if(mode==='right'){root.setProperty('--ls26-singer-section-title-left','100%');root.setProperty('--ls26-singer-section-title-shift','-100%');}
  else if(mode==='custom'&&raw<0){root.setProperty('--ls26-singer-section-title-left',raw+'px');root.setProperty('--ls26-singer-section-title-shift','0%');}
  else if(mode==='custom'){root.setProperty('--ls26-singer-section-title-left',raw+'%');root.setProperty('--ls26-singer-section-title-shift',(-raw)+'%');}
  else{root.setProperty('--ls26-singer-section-title-left','0%');root.setProperty('--ls26-singer-section-title-shift','0%');}
 }
 function applySettings(){
  const previousGuidance=guidance;guidance=read('karaokeGuidanceMode','normal');if(!['normal','pro','guitaroke'].includes(guidance))guidance='normal';
  const choices={guidance,theme:read('ls26:singerTheme','default'),font:read('ls26:singerFont','default'),size:read('ls26:singerTextSize','normal'),spacing:read('ls26:singerSpacing','normal')};Object.assign(document.body.dataset,choices);document.body.dataset.sectionColourMode=read('ls26:singerSectionColourMode','follow');
  for(const [key,value] of Object.entries(choices))document.querySelectorAll(`button[data-${key}]`).forEach(b=>b.classList.toggle('active',b.dataset[key]===value));
  const root=document.documentElement.style;focusPct=num('ls26:singerFocusPosition',40,20,65)/100;smoothingMs=num('ls26:singerScrollSmoothingMs',720,180,1600);
  for(const [name,key,def,min,max,unit] of [['current-scale','CurrentLineScale',1.72,1,2.5,'em'],['context-scale','ContextLineScale',1.48,.9,2.3,'em'],['muted-scale','MutedLineScale',.82,.45,1.4,'em'],['muted-opacity','MutedOpacity',.60,.2,1,'']])root.setProperty('--ls26-singer-'+name,num('ls26:singer'+key,def,min,max)+unit);
  const weight=Math.round(num('ls26:singerLyricsWeight',760,400,900)/50)*50;root.setProperty('--ls26-singer-lyrics-weight',String(weight));root.setProperty('--ls26-singer-current-weight',String(Math.min(950,weight+100)));root.setProperty('--ls26-singer-character-spacing',num('ls26:singerCharacterSpacing',0,-.5,3)+'px');
  root.setProperty('--ls26-singer-chord-before',num('ls26:singerChordSpaceAbove',0,0,40)+'px');root.setProperty('--ls26-singer-chord-after',num('ls26:singerChordSpaceBelow',0,0,40)+'px');
  root.setProperty('--ls26-singer-current-colour',colour('ls26:singerCurrentLineColour','#16d8ff'));root.setProperty('--singer-custom-background',colour('ls26:karaokeSingerBackground','#00131a'));
  root.setProperty('--ls26-singer-section-custom-colour',colour('ls26:singerSectionCustomColour','#42f35c'));titlePosition();
  root.setProperty('--ls26-singer-performance-note-colour',colour('ls26:singerPerformanceNoteColour','#75f2a0'));root.setProperty('--ls26-singer-performance-note-border',colour('ls26:singerPerformanceNoteBorderColour','#45c979'));root.setProperty('--ls26-singer-performance-note-size',num('ls26:singerPerformanceNoteSize',24,12,48)+'px');root.setProperty('--ls26-singer-performance-note-padding',num('ls26:singerPerformanceNotePadding',14,4,36)+'px');root.setProperty('--ls26-singer-performance-note-spacing',num('ls26:singerPerformanceNoteSpacing',20,0,60)+'px');
  const background=colour('ls26:karaokeSingerBackground','#00131a');$('singerBackgroundColor').value=background;text($('singerBackgroundColorValue'),background.toUpperCase());
  auto=read('ls26:singerAutoScroll','true')!=='false';speed=num('ls26:singerScrollSpeed',1,.25,3);showBottom=read('ls26:karaokeSingerBottomBar','true')!=='false';$('singerAutoScroll').checked=auto;$('singerShowBottomBar').checked=showBottom;text($('singerSpeedLabel'),speed.toFixed(2)+'×');text($('singerBottomSpeed'),speed.toFixed(2)+'×');
  if(song&&guidance!==previousGuidance){renderSong();show(true);}updateHeader();updateControls();if(!auto)stopMovement();else follow();
 }
 window.addEventListener('ls26:prompter-settings',applySettings);
 function updateControls(){$('singerControls').classList.toggle('hidden',!showBottom||lyrics.hidden);text($('singerPlayBtn'),latest?.phase==='playing'&&!localPaused?'Ⅱ':'▶');}
 function installControls(){
  if(!document.querySelector('.guidance-options button[data-guidance="guitaroke"]')){const button=document.createElement('button');button.type='button';button.dataset.guidance='guitaroke';button.textContent='Guitaroke';document.querySelector('.guidance-options').append(button);}
  const settings=$('singerSettings'),globalControls=document.createElement('div');globalControls.innerHTML='<button type="button" data-load-global>Reload global defaults</button><p role="status" data-global-status>Global defaults are saved in Admin → Prompter → Settings. Adjustments here stay on this device.</p>';settings.append(globalControls);
  const globalStatus=globalControls.querySelector('[data-global-status]');globalControls.querySelector('[data-load-global]').onclick=async()=>{const result=await window.LS26PrompterSettings.load(true);globalStatus.textContent=result.error?'Global settings unavailable; local settings retained.':result.remote?'Global defaults loaded.':'No global defaults saved yet.';};
  $('singerSettingsBtn').disabled=false;$('singerSettingsBtn').onclick=()=>settings.classList.toggle('hidden');$('closeSingerSettings').onclick=()=>settings.classList.add('hidden');
  $('fullscreenSingerBtn').onclick=async()=>{try{if(document.fullscreenElement||document.webkitFullscreenElement){if(document.exitFullscreen)await document.exitFullscreen();else document.webkitExitFullscreen?.();}else if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch(_){await document.documentElement.requestFullscreen();}}else document.documentElement.webkitRequestFullscreen?.();}catch(error){console.warn('Singer fullscreen request failed:',error);}};
  const keys={guidance:'karaokeGuidanceMode',theme:'ls26:singerTheme',font:'ls26:singerFont',size:'ls26:singerTextSize',spacing:'ls26:singerSpacing'};
  settings.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;for(const [key,storage]of Object.entries(keys))if(b.dataset[key]){save(storage,b.dataset[key]);if(key==='theme')save('ls26:karaokeSingerBackground',({warm:'#160d07',contrast:'#000000',default:'#00131a'})[b.dataset[key]]||'#00131a');applySettings();}});
  $('singerBackgroundColor').oninput=e=>{save('ls26:karaokeSingerBackground',e.target.value);applySettings();};$('singerShowBottomBar').onchange=e=>{save('ls26:karaokeSingerBottomBar',e.target.checked);applySettings();};$('singerAutoScroll').onchange=e=>{save('ls26:singerAutoScroll',e.target.checked);localPaused=false;applySettings();};
  for(const [id,delta]of [['singerSpeedDown',-.25],['singerMinusBtn',-.25],['singerSpeedUp',.25],['singerPlusBtn',.25]])$(id).onclick=()=>{save('ls26:singerScrollSpeed',clamp(speed+delta,.25,3));applySettings();};
  $('singerPlayBtn').onclick=()=>{localPaused=!localPaused;updateControls();if(localPaused)stopMovement();else follow();};document.addEventListener('keydown',e=>{if(e.key==='Escape')settings.classList.add('hidden');});
 }
 function renderSong(){
  viewKey='';lyrics.replaceChildren();lines=[];sections=new Map();lineMap=new Map();focused=null;
  (song.sections||[]).forEach((section,sourceIndex)=>{
   const rows=window.LS26SingerLines.section(section,document);if(!rows.length)return;
   const block=document.createElement('section');block.className='ls26-singer-v31-section';block.dataset.sourceIndex=sourceIndex;block.style.setProperty('--ls26-section-source-colour',sectionColour(section));
   if(section.title){const h=document.createElement('h2');h.textContent=section.title;block.append(h);}
   const body=document.createElement('div');body.className='ls26-singer-v31-body';block.append(body);let substantive=0,performanceOnly=true;
   for(const row of rows){
    if(row.kind==='chord'&&guidance!=='guitaroke')continue;
    const line=document.createElement('div');line.dataset.sourceLineIndex=row.sourceLineIndex;
    if(row.kind==='cue'){
      line.className='ls26-singer-performance-cue'+(row.performance?' ls26-performance-note':'');line.textContent=row.performance?performanceNoteText(row.sectionTitle||section.title,row.text):row.text;if(!row.performance)performanceOnly=false;
    }else{
      line.className='ls26-singer-v31-line'+(row.kind==='chord'?' is-chord-line':' is-muted');
      if(guidance==='normal')line.textContent=row.text;else line.innerHTML=guidance==='guitaroke'?row.guitarHtml:row.html;
      if(row.kind==='lyric'){lines.push(line);lineMap.set(sourceIndex+':'+row.sourceLineIndex,line);substantive++;performanceOnly=false;}else if(row.kind==='chord'){substantive++;performanceOnly=false;}
    }
    body.append(line);
   }
   if(performanceOnly&&body.querySelector('.ls26-performance-note'))block.classList.add('ls26-performance-note-only');
   if(!body.children.length)return;sections.set(sourceIndex,block);lyrics.append(block);
  });
  const end=document.createElement('div');end.className='singer-end';end.textContent='[ END ]';lyrics.append(end);
 }
 function currentLine(sync){
  if(!sync)return lines[0]||null;const key=sync.sourceIndex+':'+sync.currentLyricLineIndex;if(lineMap.has(key))return lineMap.get(key);if(sync.followOn)return null;
  const block=sections.get(Number(sync.sourceIndex)),candidates=lines.filter(line=>block?.contains(line));return candidates[Math.min(candidates.length-1,Math.floor(clamp(Number(sync.sectionProgress)||0,0,1)*candidates.length))]||null;
 }
 function fadeSettings(){return {current:num('ls26:singerCurrentLineScale',1.72,1,2.5),pastSize:num('ls26:singerPastSizeRatio',.88,.5,1),past1:num('ls26:singerPast1Opacity',.70,.05,1),past2:num('ls26:singerPast2Opacity',.40,.05,1),pastFar:num('ls26:singerPastFarOpacity',.20,.02,1),next1Size:num('ls26:singerNext1SizeRatio',.95,.5,1),next1:num('ls26:singerNext1Opacity',.90,.05,1),next2Size:num('ls26:singerNext2SizeRatio',.90,.5,1),next2:num('ls26:singerNext2Opacity',.86,.05,1),nearSize:num('ls26:singerFutureNearSizeRatio',.80,.45,1),near:num('ls26:singerFutureNearOpacity',.80,.02,1),midSize:num('ls26:singerFutureMidSizeRatio',.72,.45,1),midStart:num('ls26:singerFutureMidStartOpacity',.60,.02,1),midEnd:num('ls26:singerFutureMidEndOpacity',.40,.02,1),farSize:num('ls26:singerFutureFarSizeRatio',.70,.4,1),farStart:num('ls26:singerFutureFarStartOpacity',.20,.02,1),farEnd:num('ls26:singerFutureFarEndOpacity',.05,.02,1)};}
 function gradient(relative,s){if(relative===0)return{size:s.current,opacity:1};if(relative<0)return{size:s.current*s.pastSize,opacity:relative===-1?s.past1:relative===-2?s.past2:s.pastFar};if(relative===1)return{size:s.current*s.next1Size,opacity:s.next1};if(relative===2)return{size:s.current*s.next2Size,opacity:s.next2};if(relative<=4)return{size:s.current*s.nearSize,opacity:s.near};if(relative<=7){const t=(relative-5)/2;return{size:s.current*s.midSize,opacity:s.midStart+(s.midEnd-s.midStart)*t};}const t=clamp((relative-8)/5,0,1);return{size:s.current*s.farSize,opacity:s.farStart+(s.farEnd-s.farStart)*t};}
 function focus(sync){
  const next=currentLine(sync);if(!next)return;focused=next;const index=lines.indexOf(next),settings=fadeSettings();
  lines.forEach((line,i)=>{const relative=i-index,value=gradient(relative,settings),distance=Math.abs(relative);line.classList.toggle('is-current',relative===0);line.classList.toggle('is-context',distance===1||distance===2);line.classList.toggle('is-muted',distance>2);line.dataset.ls26Gradient='1';line.style.setProperty('--ls26-gradual-size',Math.max(.45,value.size).toFixed(3)+'em');line.style.setProperty('--ls26-gradual-opacity',String(clamp(value.opacity,.02,1)));});
 }
 function syncEnabled(){return latest?.syncEnabled!==false&&read('ls26:syncSingerScroll','true')!=='false';}
 function move(now=performance.now()){
  frame=0;if(destroyed||document.hidden||lyrics.hidden||latest?.phase!=='playing'||localPaused||!auto||!syncEnabled()||Date.now()<manualHoldUntil)return;
  const delta=moveTarget-scrollY;if(Math.abs(delta)<.5){moveLastAt=0;return;}
  const elapsed=clamp(moveLastAt?now-moveLastAt:16,8,48);moveLastAt=now;const tau=Math.max(120,smoothingMs/Math.max(.55,speed)),ease=1-Math.exp(-elapsed/tau),maxStep=elapsed*(.18+.22*speed);const step=Math.sign(delta)*Math.min(Math.abs(delta)*ease,maxStep);
  scrollTo(0,scrollY+step);frame=requestAnimationFrame(move);
 }
 function follow(){
  if(lyrics.hidden||latest?.phase!=='playing'||localPaused||!auto||!syncEnabled()||document.hidden||Date.now()<manualHoldUntil)return;const sync=latest.sync;const anchor=Math.max(document.querySelector('.singer-topbar').getBoundingClientRect().bottom+44,innerHeight*focusPct);let target;
  if(focused&&(sync?.followOn||sync?.currentLyricLineIndex>=0))target=focused.getBoundingClientRect().top+scrollY-anchor;else{const block=sections.get(Number(sync?.sourceIndex)),list=[...sections.values()],next=list[list.indexOf(block)+1];if(!block)return;const top=block.getBoundingClientRect().top+scrollY,end=next?next.getBoundingClientRect().top+scrollY:top+block.offsetHeight;target=top+(end-top)*clamp(Number(sync?.sectionProgress)||0,0,1)-anchor;}
  moveTarget=clamp(target,0,Math.max(0,document.documentElement.scrollHeight-innerHeight));if(!frame&&Math.abs(moveTarget-scrollY)>.5)frame=requestAnimationFrame(move);
 }
 function show(force=false){
  if(!latest)return;const sync=latest.sync,key=JSON.stringify([latest.songId,latest.phase,latest.title,latest.artist,Boolean(song),guidance,latest.syncEnabled,sync?.sourceIndex,sync?.currentLyricLineIndex,sync?.followOn,sync?.followOn?0:sync?.sectionProgress]);if(!force&&key===viewKey)return;viewKey=key;
  const phase=latest.phase,displayLyrics=Boolean(song)&&['playing','countin','paused','complete'].includes(phase),changed=renderedPhase!==phase,wasPreview=renderedPhase==='preview';renderedPhase=phase;
  document.body.classList.toggle('ls26-singer-v31-active',phase!=='idle');document.body.classList.toggle('singer-standby-mode',phase==='idle');lyrics.hidden=!displayLyrics;stateView.hidden=displayLyrics||phase==='idle';text($('singerTitle'),song?.title||latest.title||'KARAOKE LYRIC VIEW');text($('singerArtist'),window.ArtistNames?.display?.(song?.artist||latest.artist)||song?.artist||latest.artist||'');
  if(!displayLyrics){text(stateView.querySelector('.ls26-singer-state-kicker'),phase==='idle'?'READY FOR THE NEXT SINGER':'UP NEXT');text(stateView.querySelector('h1'),phase==='idle'?'':song?.title||latest.title||'');text(stateView.querySelector('h2'),phase==='idle'?'':$('singerArtist').textContent);}
  if(changed)updateHeader();if(displayLyrics){focus(sync);if(wasPreview||changed){lyrics.classList.remove('ls26-entering');void lyrics.offsetWidth;lyrics.classList.add('ls26-entering');setTimeout(()=>lyrics.classList.remove('ls26-entering'),280);}follow();}if(phase!=='playing')stopMovement();updateControls();
 }
 async function loadSong(id){pendingId=id;const generation=++loadGeneration;try{const doc=await window.db.collection('lyrics').doc(id).get();if(destroyed||generation!==loadGeneration)return;pendingId='';if(!doc.exists)throw Error('The selected song is not in the lyrics database.');song=window.LyricsCommon.normalizeSong(doc.data(),doc.id);songId=id;renderSong();show(true);}catch(error){if(generation===loadGeneration){pendingId='';text(stateView.querySelector('h2'),error.message);}console.warn('Singer could not load song:',error);}}
 function accept(next,local=false){
  if(!next||Number(next.version)!==3||destroyed)return;const stamp=Number(next.updatedAtMs)||0;if(!local&&localReceivedAt&&Date.now()-localReceivedAt<5000)return;if(local){if(stamp<localStamp)return;localStamp=stamp;localReceivedAt=Date.now();}else if(latest&&stamp<Number(latest.updatedAtMs||0))return;const id=String(next.songId||'');latest=next;
  if(latest.phase==='idle'||!id){loadGeneration++;pendingId='';song=null;songId='';lines=[];focused=null;latest={...next,phase:'idle'};show(true);return;}if(id!==songId){if(pendingId!==id){song=null;stopMovement();show(true);void loadSong(id);}return;}show();
 }
 function control(data){
  const phase=String(data?.displayState||'');if(['idle','auto-send-off','finished'].includes(phase)||data?.reset){accept({version:3,phase:'idle',songId:'',updatedAtMs:Date.now()});return;}const token=data?.forceReloadToken;if(token&&reloadToken&&token!==reloadToken){songId='';viewKey='';localReceivedAt=0;}if(token)reloadToken=token;const id=String(data?.currentLyricsSongId||data?.currentSongId||data?.songId||'');if(data?.singerV3&&data.singerV3.songId===id){accept(data.singerV3);return;}accept({version:3,songId:id,phase:id?'preview':'idle',title:data?.songTitle||'',artist:data?.songArtist||'',syncEnabled:true,updatedAtMs:Date.now()});
 }
 function manualHold(event){if(event.target?.closest?.('#singerSettings,.singer-topbar,#singerControls'))return;manualHoldUntil=Date.now()+2600;stopMovement();setTimeout(()=>{if(Date.now()>=manualHoldUntil)follow();},2650);}
 installControls();applySettings();
 if(window.db)unsubscribe=window.db.collection('karaokeControl').doc('liveLyrics').onSnapshot(doc=>control(doc.exists?doc.data():{}),error=>console.warn('Singer control unavailable:',error));
 try{channel=new BroadcastChannel(CHANNEL);channel.onmessage=e=>{if(e.data?.type==='state')accept(e.data.state,true);};channel.postMessage({type:'request-state'});}catch(_){}
 window.addEventListener('storage',e=>{if(e.key==='ls26:singer-v3-state'&&e.newValue){try{const message=JSON.parse(e.newValue);if(message.type==='state')accept(message.state,true);}catch(_){}return;}if(e.key==='karaokeGuidanceMode'||e.key==='ls26:syncSingerScroll'||e.key?.startsWith('ls26:singer')||e.key?.startsWith('ls26:karaokeSinger'))applySettings();});
 window.addEventListener('wheel',manualHold,{passive:true});window.addEventListener('touchstart',manualHold,{passive:true});
 window.addEventListener('resize',()=>{updateHeader();follow();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMovement();else{show(true);channel?.postMessage({type:'request-state'});}});window.addEventListener('pagehide',()=>{destroyed=true;loadGeneration++;stopMovement();unsubscribe?.();channel?.close();},{once:true});void window.LS26PrompterSettings?.load();
})();
