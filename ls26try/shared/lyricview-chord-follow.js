/* Optional timed playback. One lazy load, then transport/local DOM only. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./chord-playback.js'),require('./timing-model.js'));else root.LS26ChordFollow=factory(root.LS26ChordPlayback,root.LS26Timing);})(typeof window==='object'?window:globalThis,function(playback,model){
 'use strict';
 function mount({document,window,songId,getSong,store,getAudio,onSection=()=>{},onFinish=()=>{},onTranspose=()=>{},onEnabled=()=>{}}){
  const dock=document.querySelector('.host-scroll-player'),button=document.createElement('button'),rejoin=document.createElement('button'),reset=document.createElement('button'),label=document.createElement('span');
  button.type=rejoin.type=reset.type='button';button.id='chordFollowBtn';button.textContent='FOLLOW: OFF';button.setAttribute('aria-label','Chord Follow off');button.setAttribute('aria-pressed','false');
  rejoin.id='rejoinChordBtn';rejoin.textContent='REJOIN CHORD';rejoin.hidden=true;reset.id='resetChordTimingBtn';reset.textContent='RESET BEAT';reset.hidden=true;
  label.id='chordFollowStatus';label.setAttribute('role','status');label.setAttribute('aria-live','polite');label.textContent='';label.hidden=true;
  const controls=document.createElement('div');controls.className='chord-follow-actions';controls.append(button,rejoin,reset);dock.append(controls);
  (dock.closest('.host-bottom-dock')||dock.parentNode).append(label);
  const sizeDock=()=>{const outer=dock.closest('.host-bottom-dock');if(outer)document.body.style.setProperty('--lv-dock-height',outer.getBoundingClientRect().height+'px');};
  const Observer=window.ResizeObserver;if(Observer)new Observer(sizeDock).observe(dock.closest('.host-bottom-dock')||dock);window.addEventListener('resize',sizeDock);sizeDock();
  let loaded=false,pending=null,result=null,track=null,nodes=new Map(),on=false,manual=false,frame=null,current=null,positionedLine=null,anticipated=null,finished=false,lastY=window.scrollY||0,programmaticUntil=0,sourceMeter=null;
  const api={enabled:()=>on,meter:()=>sourceMeter};
  const name=event=>nodes.get(event.id)?.textContent.trim()||event.chord;
  function visibleSections(){return track?.events.every(e=>{const card=document.querySelector(`.host-section[data-section-index="${e.sourceAnchor.sectionIndex}"]`);return card&&!card.classList.contains('collapsed')&&!card.classList.contains('session-visibility-hidden');});}
  async function load(){
   if(loaded)return result;if(pending)return pending;
   pending=store.load(songId,getSong()).then(value=>{loaded=true;result=value;return value;}).finally(()=>{pending=null;});return pending;
  }
  function clear(){for(const node of nodes.values())node.classList.remove('ls26-active-chord');current=null;}
  function stateLabel(){button.setAttribute('aria-pressed',String(on));button.classList.toggle('active',on);button.textContent=on?'FOLLOW: ON':'FOLLOW: OFF';button.setAttribute('aria-label',on?'Chord Follow on':'Chord Follow off');rejoin.hidden=!on||!manual;reset.hidden=!on;}
  function notify(message,unavailable=false){label.textContent=message;label.hidden=!message;label.classList.toggle('is-unavailable',unavailable);sizeDock();}
  function suspend(){if(!on)return;manual=true;if(programmaticUntil>Date.now())window.scrollTo?.({top:window.scrollY||0,behavior:'instant'});programmaticUntil=0;notify('Positioning paused · timing continues. Use REJOIN CHORD to resume following.');stateLabel();}
  function area(){const top=(document.getElementById('ls26StickyHeader')?.getBoundingClientRect().bottom||0)+12,bottom=(document.querySelector('.host-bottom-dock')?.getBoundingClientRect().top||window.innerHeight)-16;return {top,bottom,height:Math.max(80,bottom-top)};}
  function position(event,force=false,prepare=false){
   if(manual||!event)return;
   const node=nodes.get(event.id),card=node?.closest('.host-section');if(!node||card?.classList.contains('collapsed')||card?.classList.contains('session-visibility-hidden')){suspend();return;}
   const rect=node.getBoundingClientRect(),box=area(),line=event.sourceAnchor.sectionIndex+':'+event.sourceAnchor.lineIndex+':'+Math.round((rect.top+(window.scrollY||0))/16);
   const comfortable=rect.top>=box.top+box.height*.12&&rect.bottom<=box.top+box.height*.78;
   if(!force&&(comfortable||line===positionedLine&&rect.top>=box.top&&rect.bottom<=box.bottom))return;
   if(prepare&&rect.top>=box.top&&rect.bottom<=box.bottom-24)return;
   const target=box.top+box.height*(prepare?.60:.34),rawDelta=rect.top-target,delta=prepare?Math.max(0,Math.min(rawDelta,box.height*.35)):rawDelta;
   if(Math.abs(delta)<24&&!force)return;
   programmaticUntil=Date.now()+1000;window.scrollBy?.({top:delta,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});positionedLine=line;
  }
  function update(){
   if(!on||!track)return;
   const audio=getAudio(),state=audio?.snapshot(),hit=track.at(state?.beat??0);
   if(hit){
    const changed=current?.event.id!==hit.event.id;current=hit;
    if(changed){clear();current=hit;nodes.get(hit.event.id)?.classList.add('ls26-active-chord');onSection(hit.event.sourceAnchor.sectionIndex);position(hit.event);}
    const summary=`${name(hit.event)} · chord ${hit.index+1} of ${track.events.length}${state?.state==='paused'?' · paused':''}`;
    if(!manual&&label.textContent!==summary)notify(summary);
    const next=track.events[hit.index+1],remaining=hit.event.endBeat-state.beat;
    if(state?.state==='playing'&&next&&remaining<=Math.min(.75,hit.event.durationBeats*.25)&&anticipated!==hit.event.id){
      anticipated=hit.event.id;position(next,false,true);
    }
   }
   if(state?.state==='playing'&&!hit&&state.beat>=track.totalBeats-1e-9&&!finished){finished=true;audio.pause();notify('Timed song complete');onFinish();}
   if(frame===null)frame=window.requestAnimationFrame?.(()=>{frame=null;update();})??null;
  }
  async function enable(){
   if(on)return true;button.disabled=true;
   try{
    const saved=await load();
    if(!['VALID','RECONCILED'].includes(saved.status)||!(track=playback.timeline(saved.timing))){
      const c=model.summary(saved.timing,saved.source),reasons=[];
      if(saved.status==='UNTIMED')reasons.push('No saved timing exists.');
      else if(!saved.timing)reasons.push('Saved timing could not be loaded. Check access or connection; unsupported timing must be reviewed in LyricsCreator.');
      else{
        reasons.push(`${c.timed} of ${c.total} chords are timed.`);
        if(c.untimed)reasons.push(`${c.untimed} ${c.untimed===1?'chord still needs':'chords still need'} timing.`);
        if(c.unresolved)reasons.push(`${c.unresolved} previous chord timings need review.`);
        if(c.meterNeedsReview)reasons.push('The song meter needs review.');
      }
      notify('CHORD FOLLOW UNAVAILABLE\n'+reasons.join('\n')+'\nNormal auto-scroll remains available.',true);return false;
    }
    sourceMeter=saved.timing.meter;
    if(!visibleSections()){notify('CHORD FOLLOW UNAVAILABLE\nShow and expand all timed sections before enabling Chord Follow.',true);return false;}
    const bodies=new Map([...document.querySelectorAll('.host-section')].map(card=>[Number(card.dataset.sectionIndex),card.querySelector('.host-section-body')]));
    if(!nodes.size){nodes=playback.bind(track.events,bodies,document);onTranspose();}
    if(!getAudio())throw Error('The metronome is not ready. Reload the page.');
    on=true;manual=false;finished=false;positionedLine=null;anticipated=null;programmaticUntil=0;lastY=window.scrollY||0;stateLabel();onEnabled(true);getAudio().stop();update();return true;
   }catch(error){notify('CHORD FOLLOW UNAVAILABLE\n'+error.message+' Normal auto-scroll remains available.',true);return false;}
   finally{button.disabled=false;}
  }
  function disable(){const wasOn=on;on=false;manual=false;window.cancelAnimationFrame?.(frame);frame=null;clear();stateLabel();notify('Normal auto-scroll');if(wasOn)getAudio()?.pause();onEnabled(false);}
  function rejoinCurrent(){if(!on)return;manual=false;positionedLine=null;stateLabel();position(current?.event,true);notify(current?`${name(current.event)} · following`:'Following current chord');}
  function resetPosition(){if(!on)return;getAudio()?.stop();finished=false;clear();positionedLine=null;anticipated=null;update();}
  button.onclick=()=>on?disable():enable();rejoin.onclick=rejoinCurrent;reset.onclick=resetPosition;
  window.addEventListener('wheel',e=>{if(!e.target.closest?.('input,select,textarea,.song-info-drawer,.host-bottom-dock'))suspend();},{passive:true});
  let touch;
  window.addEventListener('touchstart',e=>{touch=e.touches?.[0]?{x:e.touches[0].clientX,y:e.touches[0].clientY,target:e.target}:null;},{passive:true});
  window.addEventListener('touchmove',e=>{if(touch&&e.touches?.[0]&&Math.abs(e.touches[0].clientY-touch.y)>8&&!touch.target.closest?.('button,input,select,textarea,.song-info-drawer,.host-bottom-dock'))suspend();},{passive:true});
  window.addEventListener('pointerdown',e=>{if((e.target===document.documentElement||e.target===document.body)&&e.clientX>=window.innerWidth-24)suspend();},{passive:true});
  window.addEventListener('keydown',e=>{if(!e.target.closest?.('input,textarea,select,button,[contenteditable],[role="textbox"]')&&['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(e.key))suspend();});
  // Scrollbar drags have no wheel/touch event. Own smooth scrolls are exempt;
  // an input gesture always suspends even during that exemption window.
  window.addEventListener('scroll',()=>{const y=window.scrollY||0;if(Math.abs(y-lastY)>2&&Date.now()>programmaticUntil)suspend();lastY=y;},{passive:true});
  document.addEventListener('click',e=>{if(e.target.closest?.('#navUpBtn,#navDownBtn,#navPrevBtn,#navNextBtn,.progress-section'))suspend();});
  window.addEventListener('pagehide',disable);
  return Object.freeze({...api,enable,disable,update,suspend,rejoin:rejoinCurrent,reset:resetPosition,position,
   snapshot:()=>({enabled:on,manual,loaded,status:result?.status,completeness:result?model.summary(result.timing,result.source):null,event:current?.event,index:current?.index,totalBeats:track?.totalBeats})});
 }
 return Object.freeze({mount});
});
