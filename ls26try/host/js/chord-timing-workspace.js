/* Manual timing workspace. All edits are local; only explicit load/save use
 * the injected Stage 3 store. No transport, metronome, taps or playback hooks. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../../shared/timing-model.js'),require('../../shared/chord-foundation.js'));
  else root.LS26TimingWorkspace=factory(root.LS26Timing,root.LS26Chords);
})(typeof window==='object'?window:globalThis,function(model,chords){
  'use strict';
  function mount({document,window,root,songId,getSong,store,dialogs,allowSave=false,auth=null,ownerEmail='',reloadSong=()=>window.location.reload()}){
    const tab=document.getElementById('chordTimingTab'),lyricsTab=document.getElementById('lyricsChordsTab');
    root.innerHTML=`
      <div class="ct-heading"><div><h2>CHORD TIMING</h2><p id="ctStatus" role="status" aria-live="polite"></p><small id="ctMeterSummary"></small></div>
        <button type="button" id="ctReviewToggle" hidden>REVIEW TIMING</button></div>
      <p id="ctNotice" class="ct-notice" role="status"></p>
      <div class="ct-recovery"><button type="button" id="ctReload" hidden>RELOAD LATEST TIMING</button><button type="button" id="ctReloadSong" hidden>RELOAD SONG</button></div>
      <div class="ct-reading-area">
        <aside id="ctReview" class="ct-review" hidden aria-label="Review older timing">
          <h3>Older timing to review</h3><p>Choose an older entry, then select its current chord in the song. Nothing is assigned automatically.</p>
          <div id="ctUnresolved"></div><p id="ctReviewTarget"></p><p id="ctMeterReview" hidden></p>
          <div class="ct-review-actions"><button type="button" id="ctAssign">ASSIGN TO SELECTED CHORD</button><button type="button" id="ctDiscard">DISCARD OLD TIMING</button><button type="button" id="ctAcceptMeter" hidden>USE CURRENT METER</button></div>
        </aside>
        <div id="ctSong" class="ct-song" tabindex="0" aria-label="Song chords; select a chord to edit its duration"></div>
      </div>
      <div class="ct-dock" aria-label="Timing controls">
        <div id="ctSelection" class="ct-selection" aria-live="polite">Select a chord</div>
        <div class="ct-navigation">
          <button type="button" id="ctPrevious">PREVIOUS CHORD</button>
          <button type="button" id="ctMinus" aria-label="Decrease selected duration by half a beat">−0.5</button>
          <output id="ctDuration" aria-label="Selected duration">— beats</output>
          <button type="button" id="ctPlus" aria-label="Increase selected duration by half a beat">+0.5</button>
          <button type="button" id="ctNext">NEXT CHORD</button>
        </div>
        <div class="ct-presets" aria-label="Set duration in beats">${[.5,1,1.5,2,3,4,6,8].map(n=>`<button type="button" data-ct-preset="${n}" aria-label="Set ${n} beats">${n}</button>`).join('')}</div>
        <div class="ct-actions"><button type="button" id="ctSave" class="ct-primary">SAVE TIMING</button><button type="button" id="ctUndo">↶ UNDO</button><button type="button" id="ctClear">CLEAR</button><button type="button" id="ctCustomToggle" aria-expanded="false">CUSTOM…</button><button type="button" id="ctPerformanceEnter">TAP TIMING</button></div>
        <div id="ctPerformance" class="ct-performance-controls" hidden>
          <div class="ct-performance-summary"><strong id="ctTapCurrent"></strong><span id="ctTapNext"></span><output id="ctTapBeat" role="status"></output></div>
          <div class="ct-performance-options"><label>Count-in <select id="ctCountIn"><option value="0">NONE</option><option value="1" selected>1 BAR</option><option value="2">2 BARS</option></select></label><label><input id="ctClick" type="checkbox" checked> Metronome click</label><button type="button" id="ctBpmMinus" aria-label="Lower performance BPM">BPM −</button><output id="ctTapBpm"></output><button type="button" id="ctBpmPlus" aria-label="Raise performance BPM">BPM +</button></div>
          <div class="ct-performance-actions"><button type="button" id="ctTapPlay">PLAY</button><button type="button" id="ctTapNextChord" class="ct-primary">NEXT CHORD / TAP</button><button type="button" id="ctTapUndo">UNDO LAST TAP</button><button type="button" id="ctTapExit">STOP / EXIT TAP TIMING</button></div>
        </div>
        <form id="ctCustom" class="ct-custom" hidden><label>Duration in beats <input id="ctCustomValue" type="number" min="0.5" step="0.5" inputmode="decimal"></label><button type="submit">APPLY</button></form>
        <p id="ctSaveNote" class="ct-save-note"></p>
      </div>`;
    const $=id=>root.querySelector('#'+id),copy=model.clone;
    let active=false,busy=false,loaded=false,draft=null,base,clean='',history=[],selectedId=null,reviewId=null;
    let song=null,loadError='',conflict='',message='',reconciled=false,editorScroll=0;
    let performanceMode=false,audio=null,tapSession=null,tempo=null,performanceFrame=null;
    let ownerAuthorized=!ownerEmail,authCheck=0;
    let authMessage=ownerEmail?'Checking your sign-in for timing saving…':'';
    const canSave=()=>allowSave&&ownerAuthorized;
    // Check the same exact token email used by the owner's Firestore rule.
    // Never log/retain the token or claims, and never change sign-in settings.
    async function verifyOwner(user){
      const check=++authCheck;
      ownerAuthorized=false;
      authMessage=user?'Checking your sign-in for timing saving…':'Sign in with your owner account in LiveSuite Admin, then reload this page to save timing.';
      draw();
      if(!user)return false;
      try{
        const result=await user.getIdTokenResult();
        if(check!==authCheck||auth.currentUser!==user)return false;
        ownerAuthorized=result.claims?.email===ownerEmail;
        authMessage=ownerAuthorized?'':'Only the signed-in owner can save timing. Your local changes stay on this page.';
      }catch(error){
        if(check!==authCheck||auth?.currentUser!==user)return false;
        authMessage='Could not verify your sign-in. Sign in again through LiveSuite Admin to save timing. Your local changes stay here.';
      }
      draw();return ownerAuthorized;
    }
    const serial=()=>draft?JSON.stringify(draft):'';
    const dirty=()=>Boolean(draft&&serial()!==clean);
    const selected=()=>draft?.events.find(e=>e.id===selectedId);
    const currentIndex=()=>draft?.events.findIndex(e=>e.id===selectedId)??-1;
    const older=()=>draft?.unresolved.find(x=>x.event.id===reviewId);
    const beats=value=>value===undefined?'— beats':value+' beats';
    function remember(){history.push({draft:copy(draft),selectedId,reviewId});if(history.length>60)history.shift();}
    function chooseValid(){
      if(!selected())selectedId=draft?.events[0]?.id||null;
      if(!older())reviewId=draft?.unresolved[0]?.event.id||null;
    }
    function reveal(){
      const button=$('ctSong').querySelector(`[data-ct-index="${currentIndex()}"]`),pane=$('ctSong');
      if(!button)return;
      const a=button.getBoundingClientRect(),b=pane.getBoundingClientRect(),pad=16;
      const delta=a.top<b.top+pad?a.top-b.top-pad:a.bottom>b.bottom-pad?a.bottom-b.bottom+pad:0;
      if(delta)pane.scrollBy?.({top:delta,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
    function fitViewport(){
      if(!active)return;
      const height=window.visualViewport?.height||window.innerHeight;
      if(!Number.isFinite(height))return;
      document.body.style.setProperty('--ct-viewport-height',height+'px');
    }
    function buildSong(){
      const pane=$('ctSong'),scroll=pane.scrollTop;pane.replaceChildren();
      const extracted=chords.extractSections(song.sections||[],document);
      extracted.sections.forEach((section,si)=>{
        const article=document.createElement('article');article.className='ct-section';
        const heading=document.createElement('h3');heading.textContent=section.title||`Section ${si+1} · ${section.type}`;article.append(heading);
        section.lines.forEach((text,li)=>{
          const line=document.createElement('div');line.className='ct-line';let end=0;
          draft.events.forEach((event,index)=>{
            const a=event.sourceAnchor;if(a.sectionIndex!==si||a.lineIndex!==li)return;
            line.append(document.createTextNode(text.slice(end,a.start)));
            const button=document.createElement('button');button.type='button';button.className='ct-chord';button.dataset.ctIndex=String(index);
            const name=document.createElement('strong');name.textContent=event.chord;
            const duration=document.createElement('small');duration.className='ct-chord-duration';button.append(name,duration);line.append(button);end=a.end;
          });
          line.append(document.createTextNode(text.slice(end)));article.append(line);
        });
        pane.append(article);
      });
      if(!draft.events.length){const empty=document.createElement('p');empty.textContent='No recognized chords in this song yet. Add chords in Lyrics & Chords first.';pane.prepend(empty);}
      pane.scrollTop=scroll;
    }
    function draw(){
      chooseValid();const event=selected(),index=currentIndex(),state=draft?model.status(draft):'UNTIMED';
      root.setAttribute('aria-busy',String(busy));
      tab.disabled=busy;lyricsTab.disabled=busy;
      tab.textContent=dirty()?'CHORD TIMING •':'CHORD TIMING';
      tab.setAttribute('aria-label',dirty()?'Chord Timing, unsaved changes':'Chord Timing');
      $('ctStatus').textContent=busy?'Working…':loadError?'Saved timing unavailable':state==='NEEDS_REVIEW'?'Some older timing needs your review':state==='PARTIAL'||state==='UNTIMED'?'Choose durations for untimed chords':reconciled?'Timing updated to match current song':'Timing ready';
      $('ctMeterSummary').textContent=draft?`${draft.meter.beatsPerBar}/${draft.meter.beatUnit}${draft.meter.assumed?' (assumed)':''} · durations in quarter-note beats`:'';
      $('ctNotice').textContent=message;
      $('ctSaveNote').textContent=!songId?'Save this song in Lyrics & Chords first. Timing changes stay on this page.':!allowSave?'Online timing saving needs setup. Changes stay on this page.':!ownerAuthorized?authMessage:loadError?'Saved timing could not be loaded. Saving is unavailable until a successful reload.':dirty()?'Unsaved timing changes':'No unsaved timing changes';
      if(dirty()&&(!canSave()||loadError||!songId))$('ctSaveNote').textContent+=' Unsaved timing changes.';
      $('ctReload').hidden=!loadError&&!conflict;
      $('ctReloadSong').hidden=conflict!=='SOURCE_CHANGED'&&conflict!=='SONG_MISSING';
      $('ctReviewToggle').hidden=!draft?.reviewReasons.length;
      $('ctReviewToggle').setAttribute('aria-expanded',String(!$('ctReview').hidden));
      if(!draft?.reviewReasons.length)$('ctReview').hidden=true;
      const section=event?draft.source.sections[event.sourceAnchor.sectionIndex]:null;
      $('ctSelection').textContent=event?`${event.chord} · ${section.title||'Section '+(event.sourceAnchor.sectionIndex+1)} · Chord ${index+1} of ${draft.events.length} · Previous: ${draft.events[index-1]?.chord||'—'} · Next: ${draft.events[index+1]?.chord||'—'}`:'No chord selected';
      $('ctDuration').textContent=beats(event?.durationBeats);
      root.querySelectorAll('[data-ct-index]').forEach(button=>{
        const e=draft.events[Number(button.dataset.ctIndex)],chosen=e.id===selectedId;
        button.classList.toggle('is-selected',chosen);button.setAttribute('aria-pressed',String(chosen));
        button.setAttribute('aria-label',`${e.chord}, chord ${Number(button.dataset.ctIndex)+1}, ${e.durationBeats===undefined?'untimed':beats(e.durationBeats)}`);
        button.querySelector('small').textContent=e.durationBeats===undefined?'—':String(e.durationBeats);button.disabled=busy;
      });
      for(const id of ['ctPlus','ctMinus','ctClear','ctCustomToggle'])$(id).disabled=busy||!event;
      root.querySelectorAll('[data-ct-preset]').forEach(button=>button.disabled=busy||!event);
      $('ctPrevious').disabled=busy||index<=0;$('ctNext').disabled=busy||!event||index>=draft.events.length-1;
      $('ctSave').disabled=busy||!draft||!dirty()||!songId||!canSave()||base===undefined||Boolean(loadError||conflict);
      $('ctUndo').disabled=busy||!history.length;
      $('ctPerformanceEnter').disabled=busy||!draft?.events.length||Boolean(draft?.reviewReasons.length)||!window.LS26SongAudio||!window.LS26TapTiming;
      $('ctPerformance').hidden=!performanceMode;
      if(performanceMode){
        root.querySelectorAll('[data-ct-index],[data-ct-preset]').forEach(button=>button.disabled=true);
        for(const id of ['ctPlus','ctMinus','ctPrevious','ctNext','ctClear','ctCustomToggle','ctAssign','ctDiscard','ctAcceptMeter'])$(id).disabled=true;
        $('ctSave').disabled=$('ctSave').disabled||audio?.snapshot().state==='playing';
        drawPerformance();
      }
      for(const id of ['ctReload','ctReloadSong','ctReviewToggle'])$(id).disabled=busy;
      const rows=$('ctUnresolved');rows.replaceChildren();
      draft?.unresolved.forEach((item,i)=>{
        const button=document.createElement('button'),a=item.event.sourceAnchor;
        button.type='button';button.dataset.ctOld=String(i);button.disabled=busy;button.setAttribute('aria-pressed',String(item.event.id===reviewId));
        button.textContent=`${item.event.chord} · ${beats(item.event.durationBeats)} · Previous section ${a.sectionIndex+1}, line ${a.lineIndex+1}, chord ${a.slotIndex+1}`;rows.append(button);
      });
      $('ctReviewTarget').textContent=older()?`Assign older ${older().event.chord} (${beats(older().event.durationBeats)}) to ${event?event.chord+' · chord '+(index+1):'a selected chord'}. ${event?.durationBeats!==undefined?'Clear the current duration first to replace it.':'Select any current occurrence below; then confirm assignment.'}`:'No older chord selected.';
      $('ctAssign').disabled=busy||!older()||!event||event.durationBeats!==undefined;
      $('ctDiscard').disabled=busy||!older();
      $('ctAcceptMeter').hidden=!draft?.reviewReasons.includes('meter-changed');$('ctAcceptMeter').disabled=busy;
      $('ctMeterReview').hidden=$('ctAcceptMeter').hidden;
      $('ctMeterReview').textContent=draft?`The meter changed. Confirm the current ${draft.meter.beatsPerBar}/${draft.meter.beatUnit} meter for this timing. Durations still count quarter-note beats.`:'';
    }
    async function run(action){
      if(busy)return false;busy=true;draw();
      try{return await action();}catch(error){message='Could not complete that change: '+error.message;return false;}
      finally{busy=false;draw();}
    }
    async function loadCurrent(force=false){
      const currentSong=copy(getSong());
      const source=await model.buildSource(currentSong,document);
      if(!loaded||force){
        const result=songId?await store.load(songId,currentSong):{status:'UNTIMED',timing:null,base:null,source};
        loaded=true;
        if(!['UNTIMED','VALID','RECONCILED','PARTIAL','NEEDS_REVIEW'].includes(result.status)){
          loadError=result.status;base=undefined;message='Could not load saved timing. Retry when available. Local edits will not replace any saved timing.';
          if(!draft){draft=await model.createDraft(source);song=currentSong;clean=serial();}
        }else{
          draft=result.timing||await model.createDraft(result.source);song=currentSong;base=result.base;loadError='';conflict='';
          reconciled=result.status==='RECONCILED';clean=result.sourceChanged?'':serial();history=[];message=reconciled?'Timing updated to match current song. Save when ready.':'';
        }
      }else if(draft&&draft.source.fingerprint!==source.fingerprint){
        const result=await model.reconcile(draft,source);draft=result.timing;song=currentSong;history=[];reconciled=result.status==='RECONCILED';
        message='Timing now reflects the current lyrics. Check any older timing that needs review.';
      }else if(!loadError)song=currentSong;
      chooseValid();buildSong();
    }
    async function enter(){return run(async()=>{
      if(!active)editorScroll=window.scrollY||0;
      active=true;root.hidden=false;document.body.classList.add('ct-open');document.documentElement.classList.add('ct-open');tab.setAttribute('aria-selected','true');lyricsTab.setAttribute('aria-selected','false');
      await loadCurrent();fitViewport();window.requestAnimationFrame?.(fitViewport);root.focus({preventScroll:true});return true;
    });}
    async function exit(){return run(async()=>{
      if(dirty()&&!await dialogs.confirm('Keep your unsaved timing draft on this page and switch to Lyrics & Chords? Leaving the page will lose unsaved timing.',{title:'Unsaved timing',confirmText:'KEEP DRAFT & SWITCH'}))return false;
      stopPerformance();active=false;root.hidden=true;document.body.classList.remove('ct-open');document.documentElement.classList.remove('ct-open');document.body.style.removeProperty('--ct-viewport-height');tab.setAttribute('aria-selected','false');lyricsTab.setAttribute('aria-selected','true');lyricsTab.focus({preventScroll:true});window.scrollTo?.({top:editorScroll,behavior:'instant'});return true;
    });}
    function select(index){if(busy||performanceMode||!draft?.events[index])return;selectedId=draft.events[index].id;draw();reveal();}
    function duration(value){
      if(busy||performanceMode||!selected())return false;
      try{const next=model.setDuration(draft,selectedId,value);if(JSON.stringify(next)===serial())return false;remember();draft=next;message='';draw();return true;}
      catch(error){message='Enter a positive duration in steps of 0.5 beats, or use Clear.';draw();return false;}
    }
    function step(amount){const value=selected()?.durationBeats;if(amount<0&&value===undefined)return;duration((value||0)+amount<=0?null:(value||0)+amount);}
    function undo(){if(performanceMode)return undoTap();if(busy||!history.length)return;const previous=history.pop();draft=previous.draft;selectedId=previous.selectedId;reviewId=previous.reviewId;message='Timing change undone.';draw();}
    function drawPerformance(){
      if(!performanceMode||!audio)return;
      const state=audio.snapshot(),session=tapSession?.snapshot(),event=selected();
      $('ctTapCurrent').textContent=`CURRENT: ${event?.chord||'—'}`;
      $('ctTapNext').textContent=`NEXT: ${draft.events[(session?.index??currentIndex())+1]?.chord||'Finish last chord'}`;
      $('ctTapBeat').textContent=state.state==='playing'&&state.beat<0?`COUNT-IN · ${Math.ceil(-state.beat*2)/2} beats to start`:session?.complete?'Capture complete · Save when ready':`${state.state.toUpperCase()} · ${Math.max(0,state.beat-(session?.startBeat||0)).toFixed(2)} quarter-note beats`;
      $('ctTapBpm').textContent=`${tempo?.get()||96} BPM`;
      $('ctTapPlay').textContent=state.state==='playing'?'PAUSE':state.state==='paused'?'RESUME':'PLAY';
      $('ctTapPlay').disabled=busy||audio.pending||Boolean(session?.complete);
      $('ctTapNextChord').textContent=session?.index===draft.events.length-1?'FINISH CHORD / TAP':'NEXT CHORD / TAP';
      $('ctTapNextChord').disabled=busy||state.state!=='playing'||state.beat<0||Boolean(session?.complete);
      $('ctTapUndo').disabled=busy||!session?.undoCount;$('ctCountIn').disabled=state.state!=='stopped';
    }
    function performanceUi(){if(!performanceMode)return;drawPerformance();performanceFrame=window.requestAnimationFrame?.(performanceUi);}
    function enterPerformance(){
      if(busy||!draft?.events.length||draft.reviewReasons.length||!window.LS26SongAudio||!window.LS26TapTiming)return false;
      performanceMode=true;root.classList.add('ct-performance');setCustom(false,false);
      if(!tempo)tempo=window.LS26PerformanceTempo.create({song:getSong(),storage:window.sessionStorage,key:`ls26:currentBpm:${window.firebase?.app?.().options.projectId||'local'}:${songId}`,onChange:value=>{audio?.setBpm(value);drawPerformance();}});
      if(!audio)audio=window.LS26SongAudio.create({window,getSettings:()=>({bpm:tempo.get(),beats:draft.meter.beatsPerBar,beatUnit:draft.meter.beatUnit,volume:$('ctClick').checked?65:0,division:1}),onState:()=>{if(performanceMode)draw();}});
      tapSession=window.LS26TapTiming.create({clock:audio,events:draft.events,getDuration:id=>draft.events.find(e=>e.id===id)?.durationBeats,
        onDuration:(id,value,{undo=false}={})=>{if(undo)history.pop();else remember();draft=model.setDuration(draft,id,value);},
        onSelect:index=>{selectedId=draft.events[index].id;draw();reveal();}});
      message='Press Play, wait for the count-in, then tap each harmony change. The last tap finishes the final chord.';draw();performanceUi();return true;
    }
    async function playPerformance(){
      if(!performanceMode||busy||audio.pending)return false;
      if(audio.snapshot().state==='playing'){audio.pause();draw();return true;}
      try{
        if(audio.snapshot().state==='paused')await audio.resume();
        else{tapSession.begin(currentIndex());await audio.start({countInBeats:Number($('ctCountIn').value)*draft.meter.beatsPerBar*4/draft.meter.beatUnit});}
        draw();return true;
      }catch(error){message=error.message;draw();return false;}
    }
    function captureTap(){if(!performanceMode||busy)return false;const result=tapSession.capture();if(!result)return false;if(result.complete)audio.pause();message=`Captured ${result.duration} beats. Changes remain local until Save Timing.`;draw();return result;}
    function undoTap(){if(!performanceMode||busy||!tapSession.undo())return false;message='Last tap undone. Retap the harmony change, or pause to correct.';draw();reveal();return true;}
    function stopPerformance(){if(!performanceMode)return;performanceMode=false;audio?.stop();tapSession?.end();window.cancelAnimationFrame?.(performanceFrame);root.classList.remove('ct-performance');message='Tap Timing stopped. Your local durations are kept.';draw();}
    function setCustom(open,focus=true){$('ctCustom').hidden=!open;root.classList.toggle('ct-custom-open',open);$('ctCustomToggle').setAttribute('aria-expanded',String(open));$('ctCustomToggle').textContent=open?'CLOSE CUSTOM':'CUSTOM…';if(focus)(open?$('ctCustomValue'):$('ctCustomToggle')).focus();}
    async function save(){return run(async()=>{
      if(!allowSave||!songId||base===undefined||loadError||conflict||!dirty()||performanceMode&&audio?.snapshot().state==='playing')return false;
      if(ownerEmail&&!await verifyOwner(auth?.currentUser))return false;
      const source=await model.buildSource(getSong(),document);
      if(source.fingerprint!==draft.source.fingerprint){message='The lyrics changed. Return to Lyrics & Chords, then reopen Chord Timing to review.';return false;}
      const result=await store.save(songId,{timing:draft,base});
      if(result.status==='SAVED'){draft=result.timing;base=result.base;clean=serial();history=[];reconciled=false;message='Timing saved.';return true;}
      if(result.status==='CONFLICT'){
        conflict=result.code;message=result.code==='TIMING_CHANGED'?'Newer timing was saved elsewhere. Your draft is still here. Reload latest timing to continue.':'The saved song changed or is no longer available. Your draft is still here. Save/reload the song before saving timing.';
      }else{message='Timing was not saved. Your local changes are still here. Check access or connection and try again.';}
      return false;
    });}
    async function reload(){return run(async()=>{
      if(dirty()&&!await dialogs.confirm('Discard your local timing changes and load the latest saved timing?',{title:'Reload timing',confirmText:'RELOAD LATEST'}))return false;
      await loadCurrent(true);return !loadError;
    });}
    async function resolve(kind){return run(async()=>{
      const old=older(),target=selected();
      if(kind!=='meter'&&!old)return false;
      if(kind==='assign'&&(!target||target.durationBeats!==undefined))return false;
      const text=kind==='assign'?`Assign older ${old.event.chord} (${beats(old.event.durationBeats)}) to ${target.chord}, chord ${currentIndex()+1}, in ${draft.source.sections[target.sourceAnchor.sectionIndex].title||'this section'}?`:kind==='discard'?`Discard older ${old.event.chord} (${beats(old.event.durationBeats)})? You can undo this before saving.`:'Accept the current song meter for these quarter-note beat durations?';
      if(!await dialogs.confirm(text,{title:'Review timing',confirmText:kind==='assign'?'ASSIGN TIMING':kind==='discard'?'DISCARD OLD TIMING':'ACCEPT METER'}))return false;
      const options={expectedFingerprint:draft.source.fingerprint};
      if(kind==='assign'){options.matches=[{eventId:old.event.id,candidateIndex:currentIndex(),allowSymbolChange:true}];options.discardEventIds=[target.id];}
      if(kind==='discard')options.discardEventIds=[old.event.id];
      if(kind==='meter')options.acceptMeter=true;
      const result=await model.reconcile(draft,draft.source,options);remember();draft=result.timing;
      if(kind==='assign')selectedId=old.event.id;chooseValid();message='Review decision applied locally.';return true;
    });}
    root.addEventListener('click',event=>{
      const button=event.target.closest?.('button');if(!button||button.disabled)return;
      if(button.dataset.ctIndex!==undefined)return select(Number(button.dataset.ctIndex));
      if(button.dataset.ctOld!==undefined){const index=Number(button.dataset.ctOld);reviewId=draft.unresolved[index].event.id;draw();root.querySelector(`[data-ct-old="${index}"]`)?.focus({preventScroll:true});return;}
      if(button.dataset.ctPreset!==undefined)return duration(Number(button.dataset.ctPreset));
      const actions={ctPrevious:()=>select(currentIndex()-1),ctNext:()=>select(currentIndex()+1),ctMinus:()=>step(-.5),ctPlus:()=>step(.5),ctClear:()=>duration(null),ctUndo:undo,ctSave:save,ctReload:reload,
        ctPerformanceEnter:enterPerformance,ctTapPlay:playPerformance,ctTapNextChord:captureTap,ctTapUndo:undoTap,ctTapExit:stopPerformance,
        ctBpmMinus:()=>tempo.set(tempo.get()-1),ctBpmPlus:()=>tempo.set(tempo.get()+1),
        ctAssign:()=>resolve('assign'),ctDiscard:()=>resolve('discard'),ctAcceptMeter:()=>resolve('meter'),
        ctReviewToggle:()=>{$('ctReview').hidden=!$('ctReview').hidden;draw();},
        ctCustomToggle:()=>setCustom($('ctCustom').hidden),
        ctReloadSong:()=>run(async()=>{if(await dialogs.confirm('Reload the song? Unsaved lyrics and timing on this page will be lost.',{title:'Reload song',confirmText:'RELOAD SONG'})){clean=serial();reloadSong();}})};
      actions[button.id]?.();
    });
    $('ctCustom').addEventListener('submit',event=>{event.preventDefault();const raw=$('ctCustomValue').value.trim();if(raw&&duration(Number(raw)))setCustom(false);});
    $('ctClick').onchange=()=>audio?.refresh();
    root.addEventListener('keydown',event=>{
      if(!active||busy||event.isComposing||event.altKey||event.target.closest?.('input,textarea,select,[role="textbox"],[role="combobox"],[contenteditable]:not([contenteditable="false"])'))return;
      if(performanceMode&&event.repeat&&[' ','Enter'].includes(event.key)){event.preventDefault();return;}
      let action;
      if(performanceMode&&!event.ctrlKey&&!event.metaKey)action={' ':captureTap,Enter:playPerformance}[event.key];
      if(!action&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.shiftKey)action=undo;
      else if(!action&&!performanceMode&&!event.ctrlKey&&!event.metaKey)action={ArrowLeft:()=>select(currentIndex()-1),ArrowRight:()=>select(currentIndex()+1),'+':()=>step(.5),'-':()=>step(-.5)}[event.key];
      if(action){event.preventDefault();event.stopPropagation();action();}
    });
    window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
    window.addEventListener('resize',fitViewport);window.visualViewport?.addEventListener?.('resize',fitViewport);
    tab.disabled=false;tab.onclick=enter;lyricsTab.onclick=()=>active?exit():undefined;
    draw();
    if(ownerEmail){
      // Authentication notifications are local SDK state, not Firestore listeners.
      const observe=auth?.onIdTokenChanged||auth?.onAuthStateChanged;
      if(observe)observe.call(auth,user=>{void verifyOwner(user);});
      else void verifyOwner(auth?.currentUser);
    }
    return Object.freeze({enter,exit,select,step,setDuration:duration,undo,save,reload,assign:()=>resolve('assign'),discard:()=>resolve('discard'),acceptMeter:()=>resolve('meter'),
      enterPerformance,playPerformance,captureTap,undoTap,stopPerformance,
      performanceSnapshot:()=>({mode:performanceMode,transport:audio?.snapshot(),session:tapSession?.snapshot()}),
      snapshot:()=>({active,busy,loaded,dirty:dirty(),draft:draft?copy(draft):null,selectedId,reviewId,base:base===undefined?undefined:copy(base),conflict,loadError,undoCount:history.length})});
  }
  return Object.freeze({mount});
});
