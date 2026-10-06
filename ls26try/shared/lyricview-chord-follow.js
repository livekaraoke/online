/* Optional timed playback. One lazy load, then transport/local DOM only. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./chord-playback.js'),require('./timing-model.js'));
 else root.LS26ChordFollow=factory(root.LS26ChordPlayback,root.LS26Timing);
})(typeof window==='object'?window:globalThis,function(playback,model){
 'use strict';
 const IMPROV_SELECTOR='a.lyrics-song-link[data-improv-link]';

 function installQuickBarLayout(document){
  if(document.getElementById('ls26ChordFollowQuickBarFix'))return;
  const style=document.createElement('style');style.id='ls26ChordFollowQuickBarFix';style.textContent=`
body.host-lyric-view-page .performance-quick-karaoke{display:grid!important;grid-template-columns:76px minmax(185px,.85fr) 30px minmax(180px,220px) minmax(108px,1fr) 34px!important;grid-template-rows:auto!important;align-items:center!important;column-gap:6px!important;row-gap:3px!important;padding:6px 8px!important}
body.host-lyric-view-page .performance-quick-karaoke>.performance-quick-label{grid-column:1!important;grid-row:1!important;width:auto!important;min-width:0!important;margin:0!important;text-align:center!important}
body.host-lyric-view-page .performance-quick-primary{grid-column:2 / 4!important;grid-row:1!important;min-width:0!important}
body.host-lyric-view-page .performance-quick-primary .quick-split-action{display:grid!important;grid-template-columns:minmax(0,1fr) 30px!important;width:100%!important;min-width:0!important;margin:0!important}
body.host-lyric-view-page .performance-quick-primary #quickSendToKaraokeBtn{width:auto!important;min-width:0!important;min-height:34px!important;height:34px!important;padding:5px 8px!important;font-size:10px!important;white-space:nowrap!important}
body.host-lyric-view-page .performance-quick-primary #quickKaraokeMenuBtn{width:30px!important;min-width:30px!important;min-height:34px!important;height:34px!important;padding:0!important}
body.host-lyric-view-page .performance-quick-slave{grid-column:4 / 6!important;grid-row:1!important;display:grid!important;grid-template-columns:minmax(120px,190px) minmax(108px,1fr)!important;justify-content:end!important;gap:6px!important;min-width:0!important}
body.host-lyric-view-page .performance-quick-slave #quickSlaveLyricsSelect{width:100%!important;max-width:190px!important;min-width:0!important;min-height:34px!important;height:34px!important;padding:0 6px!important;font-size:10px!important}
body.host-lyric-view-page .performance-quick-slave #quickSendSlaveLyricsBtn{min-width:108px!important;min-height:34px!important;height:34px!important;padding:5px 8px!important;font-size:10px!important;white-space:nowrap!important}
body.host-lyric-view-page #performanceQuickInfo .ls26-hide-karaoke{grid-column:6!important;grid-row:1!important;width:34px!important;min-width:34px!important;height:34px!important;min-height:34px!important;font-size:26px!important}
.host-section-body .ls26-active-chord{outline:2px solid var(--ls-accent);outline-offset:3px;border-radius:4px;background:#00cafa25!important;box-shadow:0 0 0 4px #00cafa15;color:var(--ls-accent)!important}
#songInfoDrawer.song-info-drawer{z-index:2147482600!important}
#chordFollowFloatCard{position:fixed!important;width:clamp(220px,26vw,300px)!important;max-width:calc(100vw - 24px)!important;box-sizing:border-box!important;padding:7px!important;border:1px solid color-mix(in srgb,var(--ls-accent) 42%,var(--ls-border))!important;border-radius:10px!important;background:rgba(2,18,27,.96)!important;box-shadow:0 10px 28px rgba(0,0,0,.42),0 0 18px rgba(0,202,250,.08)!important;z-index:2147481550!important;backdrop-filter:blur(8px)!important}
#chordFollowFloatCard[hidden]{display:none!important}
#chordFollowFloatCard .chord-follow-card-head{display:flex!important;align-items:center!important;gap:5px!important;min-width:0!important}
#chordFollowFloatCard .chord-follow-actions{display:flex!important;align-items:center!important;gap:5px!important;flex:1 1 auto!important;min-width:0!important}
#chordFollowFloatCard button{min-width:0!important;min-height:34px!important;height:34px!important;padding:5px 8px!important;border:1px solid var(--ls-border)!important;border-radius:6px!important;background:var(--ls-panel)!important;color:var(--ls-text)!important;font-size:10px!important;font-weight:900!important;line-height:1!important;white-space:nowrap!important}
#chordFollowFloatCard #chordFollowBtn{flex:1 1 96px!important;min-width:92px!important}
#chordFollowFloatCard #chordFollowBtn.active{border-color:var(--ls-accent)!important;color:var(--ls-accent)!important;background:color-mix(in srgb,var(--ls-accent) 8%,var(--ls-panel))!important}
#chordFollowFloatCard #rejoinChordBtn{border-color:var(--ls-warning)!important;color:var(--ls-warning)!important}
#chordFollowFloatCard #resetChordTimingBtn{flex:0 1 auto!important}
#chordFollowFloatCard #closeChordFollowControls{flex:0 0 30px!important;width:30px!important;min-width:30px!important;padding:0!important;font-size:17px!important;color:var(--ls-muted)!important}
#chordFollowFloatCard [hidden]{display:none!important}
#chordFollowFloatCard #chordFollowStatus{display:block!important;min-width:0!important;max-width:100%!important;max-height:52px!important;margin:5px 1px 0!important;padding:0!important;overflow:auto!important;color:var(--ls-muted)!important;font-size:9px!important;font-weight:750!important;line-height:1.25!important;white-space:pre-line!important;overflow-wrap:anywhere!important}
#chordFollowFloatCard #chordFollowStatus[hidden]{display:none!important}
#chordFollowFloatCard #chordFollowStatus.is-unavailable{color:var(--ls-warning)!important}
.host-scroll-player .ls26-track-nav-btn{display:inline-grid!important;place-items:center!important;flex:0 0 42px!important;width:42px!important;min-width:42px!important;max-width:42px!important;height:42px!important;min-height:42px!important;max-height:42px!important;margin:0!important;padding:0!important;border:1px solid var(--ls-border)!important;border-radius:50%!important;background:rgba(3,21,31,.92)!important;color:var(--ls-text)!important;box-shadow:inset 0 0 0 1px rgba(0,202,250,.04)!important}
.host-scroll-player .ls26-track-nav-btn:hover,.host-scroll-player .ls26-track-nav-btn:focus-visible{border-color:var(--ls-accent)!important;color:var(--ls-accent)!important}
.host-scroll-player .ls26-track-nav-btn svg{display:block!important;width:21px!important;height:21px!important;fill:currentColor!important;stroke:none!important}
.host-scroll-player #nextRunOrderSongBtn.ls26-track-nav-btn{font-size:0!important;line-height:0!important}
.host-section-body ${IMPROV_SELECTOR}{cursor:pointer!important}
.host-section-body ${IMPROV_SELECTOR}.ls26-improv-active{outline:2px solid var(--ls-warning)!important;outline-offset:3px!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--ls-warning) 16%,transparent),0 0 24px color-mix(in srgb,var(--ls-warning) 20%,transparent)!important}
@media(max-width:900px){body.host-lyric-view-page .performance-quick-karaoke{grid-template-columns:62px minmax(160px,.8fr) 28px minmax(145px,165px) minmax(100px,1fr) 32px!important;column-gap:5px!important}body.host-lyric-view-page .performance-quick-primary .quick-split-action{grid-template-columns:minmax(0,1fr) 28px!important}body.host-lyric-view-page .performance-quick-primary #quickKaraokeMenuBtn{width:28px!important;min-width:28px!important}body.host-lyric-view-page .performance-quick-slave{grid-template-columns:minmax(105px,155px) minmax(100px,1fr)!important}body.host-lyric-view-page .performance-quick-slave #quickSlaveLyricsSelect{max-width:155px!important}#chordFollowFloatCard{width:250px!important}.host-scroll-player .ls26-track-nav-btn{flex-basis:40px!important;width:40px!important;min-width:40px!important;max-width:40px!important;height:40px!important;min-height:40px!important;max-height:40px!important}}
@media(max-width:700px){body.host-lyric-view-page .performance-quick-karaoke{grid-template-columns:58px minmax(150px,1.1fr) 28px 32px!important;grid-template-rows:auto auto!important}body.host-lyric-view-page .performance-quick-karaoke>.performance-quick-label{grid-column:1!important;grid-row:1!important}body.host-lyric-view-page .performance-quick-primary{grid-column:2 / 4!important;grid-row:1!important}body.host-lyric-view-page #performanceQuickInfo .ls26-hide-karaoke{grid-column:4!important;grid-row:1!important}body.host-lyric-view-page .performance-quick-slave{grid-column:1 / -1!important;grid-row:2!important;grid-template-columns:minmax(0,1fr) auto!important}body.host-lyric-view-page .performance-quick-slave #quickSlaveLyricsSelect{max-width:none!important}#chordFollowFloatCard{width:min(250px,calc(100vw - 24px))!important}}
`;(document.head||document.documentElement).append(style);
 }

 function mount({document,window,songId,getSong,store,getAudio,onSection=()=>{},onFinish=()=>{},onTranspose=()=>{},onEnabled=()=>{}}){
  installQuickBarLayout(document);
  const dock=document.querySelector('.host-scroll-player');
  const button=document.createElement('button'),rejoin=document.createElement('button'),reset=document.createElement('button'),close=document.createElement('button'),label=document.createElement('span'),card=document.createElement('section');
  button.type=rejoin.type=reset.type=close.type='button';
  button.id='chordFollowBtn';button.textContent='FOLLOW: OFF';button.setAttribute('aria-label','Chord Follow off');button.setAttribute('aria-pressed','false');
  rejoin.id='rejoinChordBtn';rejoin.textContent='REJOIN';rejoin.hidden=true;
  reset.id='resetChordTimingBtn';reset.textContent='RESET';reset.hidden=true;
  close.id='closeChordFollowControls';close.textContent='×';close.setAttribute('aria-label','Hide Chord Follow controls');close.title='Hide Chord Follow controls';
  label.id='chordFollowStatus';label.setAttribute('role','status');label.setAttribute('aria-live','polite');label.textContent='';label.hidden=true;
  const controls=document.createElement('div');controls.className='chord-follow-actions';controls.append(button,rejoin,reset);
  const head=document.createElement('div');head.className='chord-follow-card-head';head.append(controls,close);
  card.id='chordFollowFloatCard';card.className='performance-chord-follow';card.setAttribute('aria-label','Chord Follow controls');card.append(head,label);document.body.append(card);

  const sizeDock=()=>{const outer=dock?.closest('.host-bottom-dock');if(outer)document.body.style.setProperty('--lv-dock-height',outer.getBoundingClientRect().height+'px');};
  const Observer=window.ResizeObserver;if(Observer&&dock)new Observer(sizeDock).observe(dock.closest('.host-bottom-dock')||dock);window.addEventListener('resize',sizeDock);sizeDock();

  const FOLLOW_PREF_KEY='ls26.lyricview.chordFollow.enabled';
  const CONTROLS_PREF_KEY='ls26.lyricview.chordFollow.controlsVisible';
  const readFollowPreference=()=>{try{return window.localStorage?.getItem(FOLLOW_PREF_KEY)==='1';}catch{return false;}};
  const writeFollowPreference=value=>{try{window.localStorage?.setItem(FOLLOW_PREF_KEY,value?'1':'0');}catch{}};
  const readControlsPreference=()=>{try{const value=window.localStorage?.getItem(CONTROLS_PREF_KEY);return value===null||value==='1';}catch{return true;}};
  const writeControlsPreference=value=>{try{window.localStorage?.setItem(CONTROLS_PREF_KEY,value?'1':'0');}catch{}};

  let loaded=false,pending=null,result=null,track=null,nodes=new Map(),on=false,wanted=readFollowPreference(),controlsVisible=readControlsPreference();
  let manual=false,frame=null,current=null,positionedLine=null,finished=false,lastY=window.scrollY||0,programmaticUntil=0,sourceMeter=null,scrollFrame=null,countInPrepared=false;
  let suppressPlayRejoin=false,timingOffset=0,improvHeld=null,improvResumeBeat=null,improvHoldRawBeat=null;
  const handledImprovs=new WeakSet();
  const api={enabled:()=>on,wanted:()=>wanted,meter:()=>sourceMeter};
  const name=event=>nodes.get(event.id)?.textContent.trim()||event.chord;
  const allImprovs=()=>[...document.querySelectorAll(IMPROV_SELECTOR)];

  function visibleSections(){return track?.events.every(e=>{const section=document.querySelector(`.host-section[data-section-index="${e.sourceAnchor.sectionIndex}"]`);return section&&!section.classList.contains('collapsed')&&!section.classList.contains('session-visibility-hidden');});}
  async function load(){if(loaded)return result;if(pending)return pending;pending=store.load(songId,getSong()).then(value=>{loaded=true;result=value;return value;}).finally(()=>{pending=null;});return pending;}
  function clearActive(){for(const node of nodes.values())node.classList.remove('ls26-active-chord');}
  function clear(){clearActive();current=null;}
  function placeCard(){if(card.hidden)return;const nav=document.querySelector('.host-nav-pad'),rect=nav?.getBoundingClientRect?.();const right=rect?Math.max(12,window.innerWidth-rect.right):14;const bottom=rect?Math.max(100,window.innerHeight-rect.top+10):220;card.style.right=right+'px';card.style.bottom=bottom+'px';}
  function setControlsVisible(value,{persist=true,broadcast=false}={}){controlsVisible=Boolean(value);card.hidden=!controlsVisible;if(persist)writeControlsPreference(controlsVisible);if(controlsVisible)window.requestAnimationFrame?.(placeCard);if(broadcast)window.dispatchEvent(new CustomEvent('ls26:chord-follow-controls-visibility',{detail:{visible:controlsVisible,source:'follow-card'}}));}
  function stateLabel(){button.setAttribute('aria-pressed',String(wanted));button.classList.toggle('active',wanted);button.textContent=wanted?'FOLLOW: ON':'FOLLOW: OFF';button.setAttribute('aria-label',wanted?'Chord Follow on':'Chord Follow off');rejoin.hidden=!on||!manual;reset.hidden=!on;if(controlsVisible)window.requestAnimationFrame?.(placeCard);}
  function notify(message,unavailable=false){label.textContent=message;label.title=String(message||'').replace(/\s*\n\s*/g,' · ');label.hidden=!message;label.classList.toggle('is-unavailable',unavailable);sizeDock();if(controlsVisible)window.requestAnimationFrame?.(placeCard);}
  function cancelPositionAnimation(){if(scrollFrame!==null){window.cancelAnimationFrame?.(scrollFrame);scrollFrame=null;}}
  function suspend(){if(!on||improvHeld)return;manual=true;cancelPositionAnimation();programmaticUntil=0;notify('Positioning paused · timing continues. Use REJOIN to resume following.');stateLabel();}
  function area(){const top=(document.getElementById('ls26StickyHeader')?.getBoundingClientRect().bottom||0)+12,bottom=(document.querySelector('.host-bottom-dock')?.getBoundingClientRect().top||window.innerHeight)-16;return {top,bottom,height:Math.max(80,bottom-top)};}
  function viewportTarget(){const box=area();return box.top+box.height*.18;}
  function nodeScrollTarget(node){if(!node)return null;const section=node.closest?.('.host-section');if(section?.classList.contains('collapsed')||section?.classList.contains('session-visibility-hidden'))return null;const rect=node.getBoundingClientRect(),max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);return Math.max(0,Math.min(max,(window.scrollY||0)+rect.top-viewportTarget()));}
  function eventScrollTarget(event){const node=nodes.get(event.id),y=nodeScrollTarget(node);return y===null?null:{node,y};}
  function animateScrollTo(targetY,duration=1050){
   cancelPositionAnimation();const start=window.scrollY||0,delta=targetY-start;if(Math.abs(delta)<3){lastY=start;return;}
   if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){programmaticUntil=Date.now()+100;window.scrollTo?.(0,targetY);lastY=targetY;return;}
   const safeDuration=Math.max(350,Math.min(3600,Number(duration)||1050)),started=performance.now();programmaticUntil=Date.now()+safeDuration+220;
   const step=now=>{const t=Math.min(1,(now-started)/safeDuration),eased=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;window.scrollTo?.(0,start+(delta*eased));lastY=window.scrollY||0;if(t<1)scrollFrame=window.requestAnimationFrame?.(step)??null;else{scrollFrame=null;programmaticUntil=Date.now()+120;lastY=window.scrollY||0;}};
   scrollFrame=window.requestAnimationFrame?.(step)??null;
  }
  function position(event,force=false,duration=1050,rememberLine=true){
   if(manual||improvHeld||!event)return;
   const target=eventScrollTarget(event);if(!target){suspend();return;}
   const line=event.sourceAnchor.sectionIndex+':'+event.sourceAnchor.lineIndex;if(!force&&line===positionedLine)return;
   if(rememberLine)positionedLine=line;animateScrollTo(target.y,duration);
  }
  function positionNode(node,duration=900){const y=nodeScrollTarget(node);if(y!==null)animateScrollTo(y,duration);}
  function prepareCountIn(state){if(countInPrepared||manual||improvHeld||!track?.events?.length||!(state?.beat<0))return;const first=track.events[0],bpm=Math.max(1,Number(state.bpm)||96),remainingMs=Math.max(700,Math.min(3600,(-state.beat)*60000/bpm));position(first,true,remainingMs,false);countInPrepared=true;notify(`Count-in · ${name(first)} next`);}

  function follows(a,b){return Boolean(a&&b&&(a.compareDocumentPosition(b)&window.Node.DOCUMENT_POSITION_FOLLOWING));}
  function pendingImprovBetween(previousEvent,nextEvent){
   const end=nodes.get(nextEvent?.id);if(!end)return null;const start=previousEvent?nodes.get(previousEvent.id):null;
   return allImprovs().find(gate=>!handledImprovs.has(gate)&&gate!==improvHeld&&(!start||follows(start,gate))&&follows(gate,end))||null;
  }
  function enterImprovHold(gate,{rawBeat=null,resumeBeat=null,position=true}={}){
   if(!gate||improvHeld)return false;
   improvHeld=gate;improvHoldRawBeat=Number.isFinite(rawBeat)?rawBeat:null;improvResumeBeat=Number.isFinite(resumeBeat)?resumeBeat:null;
   cancelPositionAnimation();programmaticUntil=Date.now()+180;gate.classList.add('ls26-improv-active');gate.setAttribute('aria-current','step');
   if(position)positionNode(gate,900);
   notify('IMPROV HOLD · scrolling and Chord Follow are waiting. Metronome continues. Tap the IMPROV card to continue.');stateLabel();return true;
  }
  function resumeImprov(gate=improvHeld){
   if(!gate||gate!==improvHeld)return false;
   const state=getAudio()?.snapshot?.();
   if(on&&Number.isFinite(improvResumeBeat)&&Number.isFinite(state?.beat))timingOffset=Math.max(0,state.beat-improvResumeBeat);
   handledImprovs.add(gate);gate.classList.remove('ls26-improv-active');gate.removeAttribute('aria-current');improvHeld=null;improvHoldRawBeat=null;improvResumeBeat=null;
   if(on){manual=false;positionedLine=null;stateLabel();notify('Continuing to the next chord');update();}
   return true;
  }
  function resetImprovs(){
   if(improvHeld){improvHeld.classList.remove('ls26-improv-active');improvHeld.removeAttribute('aria-current');}
   improvHeld=null;improvResumeBeat=null;improvHoldRawBeat=null;timingOffset=0;
   allImprovs().forEach(gate=>{gate.classList.remove('ls26-improv-active');gate.removeAttribute('aria-current');});
  }
  function maybeHoldNormalScroll(){
   if(on||improvHeld||!window.LS26Performance?.isScrolling?.())return;
   const target=viewportTarget();const gate=allImprovs().find(item=>!handledImprovs.has(item)&&item.getBoundingClientRect().top<=target+4&&item.getBoundingClientRect().bottom>=target-44);
   if(gate)enterImprovHold(gate,{position:false});
  }
  function installScrollGuard(){
   if(window.__ls26ImprovScrollGuardInstalled)return;window.__ls26ImprovScrollGuardInstalled=true;
   const native=window.scrollBy?.bind(window);if(!native)return;
   window.scrollBy=function(...args){
    const held=window.LS26ImprovPause?.held?.();
    const first=args[0],dy=typeof first==='object'?Number(first?.top||0):Number(args[1]||0);
    if(held&&dy>0&&window.LS26Performance?.isScrolling?.())return;
    return native(...args);
   };
  }

  function queueUpdate(){if(frame===null)frame=window.requestAnimationFrame?.(()=>{frame=null;update();})??null;}
  function update(){
   if(!on||!track)return;
   const audio=getAudio(),state=audio?.snapshot();if(!state){queueUpdate();return;}
   if(state.state==='stopped'){countInPrepared=false;queueUpdate();return;}
   if(state.beat<0){if(state.state==='playing')prepareCountIn(state);queueUpdate();return;}
   if(improvHeld){queueUpdate();return;}
   const logicalBeat=Math.max(0,(Number(state.beat)||0)-timingOffset),hit=track.at(logicalBeat);
   if(hit){
    const changed=current?.event.id!==hit.event.id;
    if(changed){
     const gate=pendingImprovBetween(current?.event||null,hit.event);
     if(gate&&enterImprovHold(gate,{rawBeat:state.beat,resumeBeat:hit.event.startBeat,position:true})){queueUpdate();return;}
     clearActive();current=hit;nodes.get(hit.event.id)?.classList.add('ls26-active-chord');onSection(hit.event.sourceAnchor.sectionIndex);position(hit.event);
    }else current=hit;
    const summary=`${name(hit.event)} · chord ${hit.index+1} of ${track.events.length}${state?.state==='paused'?' · paused':''}`;if(!manual&&label.textContent!==summary)notify(summary);
   }
   if(state?.state==='playing'&&!hit&&logicalBeat>=track.totalBeats-1e-9&&!finished){finished=true;audio.pause();notify('Timed song complete');onFinish();}
   queueUpdate();
  }

  async function enable({initial=false}={}){
   if(on)return true;button.disabled=true;
   try{
    const saved=await load();
    if(!['VALID','RECONCILED'].includes(saved.status)||!(track=playback.timeline(saved.timing))){
     const c=model.summary(saved.timing,saved.source),reasons=[];
     if(saved.status==='UNTIMED')reasons.push('No saved timing exists.');
     else if(!saved.timing)reasons.push('Saved timing could not be loaded. Check access or connection; unsupported timing must be reviewed in LyricsCreator.');
     else{reasons.push(`${c.timed} of ${c.total} chords are timed.`);if(c.untimed)reasons.push(`${c.untimed} ${c.untimed===1?'chord still needs':'chords still need'} timing.`);if(c.unresolved)reasons.push(`${c.unresolved} previous chord timings need review.`);if(c.meterNeedsReview)reasons.push('The song meter needs review.');}
     notify('CHORD FOLLOW UNAVAILABLE\n'+reasons.join('\n')+'\nNormal auto-scroll remains available.',true);return false;
    }
    sourceMeter=saved.timing.meter;
    if(!visibleSections()){notify('CHORD FOLLOW UNAVAILABLE\nShow and expand all timed sections before enabling Chord Follow.',true);return false;}
    const bodies=new Map([...document.querySelectorAll('.host-section')].map(section=>[Number(section.dataset.sectionIndex),section.querySelector('.host-section-body')]));
    if(!nodes.size){nodes=playback.bind(track.events,bodies,document);onTranspose();}
    if(!getAudio())throw Error('The metronome is not ready. Reload the page.');
    on=true;manual=false;finished=false;positionedLine=null;countInPrepared=false;timingOffset=0;resetImprovs();cancelPositionAnimation();programmaticUntil=0;
    if(initial){window.scrollTo?.(0,0);lastY=0;}else lastY=window.scrollY||0;
    stateLabel();onEnabled(true);getAudio().stop();update();return true;
   }catch(error){notify('CHORD FOLLOW UNAVAILABLE\n'+error.message+' Normal auto-scroll remains available.',true);return false;}
   finally{button.disabled=false;}
  }
  function disable(){const wasOn=on;on=false;manual=false;countInPrepared=false;cancelPositionAnimation();window.cancelAnimationFrame?.(frame);frame=null;clear();stateLabel();notify('Normal auto-scroll');if(wasOn)getAudio()?.pause();onEnabled(false);}
  function rejoinCurrent(){if(!on||improvHeld)return;manual=false;positionedLine=null;stateLabel();position(current?.event||track?.events?.[0],true,1050);notify(current?`${name(current.event)} · following`:'Following first chord');}
  function resetPosition(){
   getAudio()?.stop();finished=false;countInPrepared=false;cancelPositionAnimation();clear();positionedLine=null;resetImprovs();manual=false;programmaticUntil=Date.now()+1300;stateLabel();
   window.scrollTo?.({top:0,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});lastY=0;if(on)update();
  }

  function setupTransportButtons(){
   const player=dock,next=document.getElementById('nextRunOrderSongBtn');if(!player||!next)return;
   next.classList.add('ls26-track-nav-btn','ls26-track-next');next.setAttribute('aria-label','Next song');next.title='Next song';next.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 6v20h3V6H6zm5 1 15 9-15 9V7z"/></svg>';
   let previous=document.getElementById('previousTrackResetBtn');if(!previous){previous=document.createElement('button');previous.id='previousTrackResetBtn';previous.type='button';previous.className='ls26-track-nav-btn ls26-track-previous';previous.setAttribute('aria-label','Restart song from the top');previous.title='Restart song from the top';previous.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M23 6v20h3V6h-3zm-2 1L6 16l15 9V7z"/></svg>';player.insertBefore(previous,next);}
   previous.onclick=()=>{
    if(window.LS26Performance?.isScrolling?.()){
     suppressPlayRejoin=true;try{document.getElementById('autoScrollBtn')?.click();}finally{suppressPlayRejoin=false;}
    }
    resetPosition();
   };
  }

  button.onclick=()=>{if(wanted){wanted=false;writeFollowPreference(false);disable();stateLabel();}else{wanted=true;writeFollowPreference(true);stateLabel();enable();}};
  rejoin.onclick=rejoinCurrent;reset.onclick=resetPosition;close.onclick=()=>setControlsVisible(false,{persist:true,broadcast:true});
  window.addEventListener('ls26:chord-follow-controls-visibility',event=>{if(event.detail?.source==='follow-card')return;setControlsVisible(event.detail?.visible!==false,{persist:true,broadcast:false});});

  const play=document.getElementById('autoScrollBtn');
  play?.addEventListener('click',()=>{if(suppressPlayRejoin)return;const starting=!window.LS26Performance?.isScrolling?.();if(starting&&on&&manual&&!improvHeld)rejoinCurrent();},true);

  window.addEventListener('wheel',e=>{if(!e.target.closest?.('input,select,textarea,.song-info-drawer,.host-bottom-dock,#chordFollowFloatCard'))suspend();},{passive:true});
  let touch;window.addEventListener('touchstart',e=>{touch=e.touches?.[0]?{x:e.touches[0].clientX,y:e.touches[0].clientY,target:e.target}:null;},{passive:true});
  window.addEventListener('touchmove',e=>{if(touch&&e.touches?.[0]&&Math.abs(e.touches[0].clientY-touch.y)>8&&!touch.target.closest?.('button,input,select,textarea,.song-info-drawer,.host-bottom-dock,#chordFollowFloatCard'))suspend();},{passive:true});
  window.addEventListener('pointerdown',e=>{if((e.target===document.documentElement||e.target===document.body)&&e.clientX>=window.innerWidth-24)suspend();},{passive:true});
  window.addEventListener('keydown',e=>{if(!e.target.closest?.('input,textarea,select,button,[contenteditable],[role="textbox"]')&&['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(e.key))suspend();});
  window.addEventListener('scroll',()=>{const y=window.scrollY||0;if(Math.abs(y-lastY)>2&&Date.now()>programmaticUntil)suspend();lastY=y;maybeHoldNormalScroll();},{passive:true});
  window.addEventListener('resize',()=>window.requestAnimationFrame?.(placeCard));window.addEventListener('orientationchange',()=>setTimeout(placeCard,120));
  document.addEventListener('click',e=>{
   const gate=e.target.closest?.(IMPROV_SELECTOR);if(gate){e.preventDefault();resumeImprov(gate);return;}
   if(e.target.closest?.('#navUpBtn,#navDownBtn,#navPrevBtn,#navNextBtn,.progress-section'))suspend();
  });
  window.addEventListener('pagehide',disable);

  installScrollGuard();
  setupTransportButtons();
  window.LS26ImprovPause=Object.freeze({held:()=>Boolean(improvHeld),resume:()=>resumeImprov(),reset:resetImprovs});
  setControlsVisible(controlsVisible,{persist:false});stateLabel();
  if(wanted){const autoEnable=()=>{if(wanted)enable({initial:true});};if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(autoEnable);else Promise.resolve().then(autoEnable);}
  return Object.freeze({...api,enable,disable,update,suspend,rejoin:rejoinCurrent,reset:resetPosition,position,setControlsVisible,snapshot:()=>({enabled:on,wanted,manual,controlsVisible,loaded,status:result?.status,completeness:result?model.summary(result.timing,result.source):null,event:current?.event,index:current?.index,totalBeats:track?.totalBeats,improvHeld:Boolean(improvHeld),timingOffset})});
 }
 return Object.freeze({mount});
});
