/* Singer Prompter stage and cross-device LyricView remote.
 * SEND LYRICS shows the preview art; START SONG reveals lyrics;
 * END SONG opens singer feedback; a rating/skip or 20 seconds idle
 * returns to the waiting-for-next-singer artwork.
 * The existing Firebase listener and lyric scrolling engine are reused.
 */
(() => {
  'use strict';
  const CHANNEL='ls26-prompter-remote-v1', STORAGE='ls26:prompter-remote-command-v1';
  const valid=new Set(['status','toggle','slower','faster','up','down','instrumental','song']);
  const seen=new Set();
  let channel=null, unsubscribeRemote=null, unsubscribeScroll=null;
  let mode='idle', feedbackTimer=null,cloudStateChain=Promise.resolve();
  let loadedSong={songId:'',title:'',artist:'',year:''};
  let activeCueToken='', pendingCue=false, automaticEnd=false, automaticEndId='';
  let endingTimer=null, endingDeadline=0, endingFrame=null, endingNumber=0;
  let manualEndingId='';
  const MANUAL_END_MS=4000;
  const marker=document.getElementById('prompterEndMarker');
  const countdown=document.getElementById('prompterEndingCountdown');
  const number=document.getElementById('prompterEndingCountdownNumber');
  const cancelEnding=()=>{
    if(endingTimer!==null)clearTimeout(endingTimer);
    endingTimer=null;endingDeadline=0;endingNumber=0;manualEndingId='';
    if(countdown){countdown.hidden=true;countdown.classList.remove('is-manual-ending');}
  };
  const atEnd=()=>{
    if(mode!=='running'||pendingCue||!marker||!loadedSong.songId||document.visibilityState==='hidden')return false;
    const lyrics=document.getElementById('lyrics-container');
    if(!lyrics||!lyrics.textContent.trim()||lyrics.querySelector('.modern-prompter-empty'))return false;
    const rect=marker.getBoundingClientRect();
    return rect.height>0&&rect.top+rect.height/2<=window.innerHeight/2;
  };
  const tickEnding=()=>{
    endingTimer=null;
    const manualId=manualEndingId;
    if(manualId ? (pendingCue||!['running','instrumental'].includes(mode)) : !atEnd()){
      cancelEnding();return;
    }
    const remaining=Math.max(0,endingDeadline-performance.now());
    if(remaining===0){
      cancelEnding();
      if(manualId){
        // The host already published the END SONG command and projected state.
        // Use the same rating transition without another cloud write.
        applyMode('ended');
        state(manualId);
      }else{
        automaticEnd=true;
        automaticEndId='auto-end-'+Date.now();
        applyMode('ended');
        state(automaticEndId,true);
      }
      return;
    }
    // Five visible numerals across the requested four seconds.
    const interval=manualId?MANUAL_END_MS/5:1000;
    const seconds=Math.ceil(remaining/interval);
    if(seconds!==endingNumber){
      endingNumber=seconds;
      if(number)number.textContent=String(seconds);
    }
    endingTimer=setTimeout(tickEnding,Math.min(remaining,Math.max(20,remaining-(seconds-1)*interval)));
  };
  const beginManualEnding=id=>{
    if(manualEndingId||pendingCue||!['running','instrumental'].includes(mode))return;
    // Manual END overrides an automatic marker countdown. Leave the current
    // lyrics/hold screen visible until this explicit countdown completes.
    cancelEnding();
    manualEndingId=id;
    endingDeadline=performance.now()+MANUAL_END_MS;
    if(countdown){countdown.classList.add('is-manual-ending');countdown.hidden=false;}
    tickEnding();
  };
  const checkEnding=()=>{
    endingFrame=null;
    if(manualEndingId)return;
    if(!atEnd()){cancelEnding();return;}
    if(endingDeadline!==0)return;
    endingDeadline=performance.now()+5000;
    if(countdown)countdown.hidden=false;
    tickEnding();
  };
  const scheduleEnding=()=>{
    if(endingFrame===null)endingFrame=requestAnimationFrame(checkEnding);
  };

  const stage=document.createElement('div');
  stage.id='ls26SingerRemoteStage';
  stage.setAttribute('aria-live','polite');
  stage.innerHTML=`
    <nav class="ls26-singer-stage-actions" aria-label="Prompter standby controls">
      <button id="ls26SingerLibraryLink" class="ls26-singer-stage-action" type="button" aria-label="Choose a song from the current session setlist" title="Session songs">
        <svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M12 9h18M12 18h18M12 27h18M5 9h1M5 18h1M5 27h1"/>
        </svg>
      </button>
      <button id="ls26SingerFullscreenToggle" class="ls26-singer-stage-action" type="button" aria-label="Enter fullscreen" title="Enter fullscreen" aria-pressed="false">
        <svg class="ls26-singer-fullscreen-enter" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M14 5H5v9M22 5h9v9M31 22v9h-9M5 22v9h9"/>
        </svg>
        <svg class="ls26-singer-fullscreen-exit" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M5 14h9V5M31 14h-9V5M22 31v-9h9M14 31v-9H5"/>
        </svg>
      </button>
    </nav>
    <div class="ls26-singer-artwork ls26-singer-artwork-preview">
      <img src="live-karaoke-artwork.jpg" alt="Live Karaoke - You Sing, I Play" draggable="false">
      <div class="ls26-singer-message ls26-singer-message-preview">PLEASE WAIT</div>
      <div class="ls26-singer-song-info">
        <strong id="ls26SingerUpcomingTitle"></strong>
        <span id="ls26SingerUpcomingArtist"></span>
        <small id="ls26SingerUpcomingYear"></small>
      </div>
    </div>
    <div class="ls26-singer-artwork ls26-singer-artwork-idle">
      <img src="live-karaoke-artwork.jpg" alt="Live Karaoke - You Sing, I Play" draggable="false">
      <div class="ls26-singer-message ls26-singer-message-idle">WAITING FOR<br>NEXT SINGER</div>
    </div>
    <div class="ls26-singer-stage-cue"><strong>INSTRUMENTAL</strong><span>(wait for signal)</span></div>`;
  document.body.appendChild(stage);

  // Use the same fullscreen document as the existing Prompter controls:
  // the outer document owns fullscreen when opened in the persistent viewer.
  const fullscreenDoc=(()=>{
    try{
      if(window.parent!==window&&window.parent.__ls26PrompterShell===true)
        return window.parent.document;
    }catch(_){}
    return document;
  })();
  const fullscreenButton=stage.querySelector('#ls26SingerFullscreenToggle');
  const syncFullscreenButton=()=>{
    const active=Boolean(fullscreenDoc.fullscreenElement);
    fullscreenButton.setAttribute('aria-pressed',String(active));
    fullscreenButton.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');
    fullscreenButton.title=active?'Exit fullscreen':'Enter fullscreen';
  };
  fullscreenButton.addEventListener('click',event=>{
    event.stopPropagation(); // Don't also trigger the legacy first-click fullscreen handler.
    try{
      const operation=fullscreenDoc.fullscreenElement
        ? fullscreenDoc.exitFullscreen()
        : fullscreenDoc.documentElement.requestFullscreen();
      Promise.resolve(operation).then(syncFullscreenButton)
        .catch(error=>console.warn('Prompter fullscreen unavailable:',error));
    }catch(error){console.warn('Prompter fullscreen unavailable:',error);}
  });
  fullscreenDoc.addEventListener('fullscreenchange',syncFullscreenButton);
  syncFullscreenButton();

  const label=(id,text)=>{
    const element=document.getElementById(id);
    if(element)element.textContent=String(text||'').trim();
  };
  const updateSong=(detail={})=>{
    const id=String(detail.songId||detail.id||new URLSearchParams(location.search).get('id')||'');
    const catalog=(Array.isArray(window.songs)?window.songs:[]).find(item=>{
      const found=String(item.url||'').match(/[?&]id=([^&#]+)/);
      if(!found)return false;
      try{return decodeURIComponent(found[1])===id;}catch(_){return found[1]===id;}
    })||{};
    const current=document.getElementById('songTitle');
    label('ls26SingerUpcomingTitle',detail.title||current?.querySelector('.song-main-title')?.textContent||catalog.title||'');
    label('ls26SingerUpcomingArtist',detail.artist||current?.querySelector('.song-artist')?.textContent||catalog.artist||'');
    const year=String(detail.year||catalog.year||'').trim().replace(/[()]/g,'');
    label('ls26SingerUpcomingYear',/^(18|19|20|21)\d{2}$/.test(year)?'('+year+')':'');
    activeCueToken=String(detail.cueToken||'');
    pendingCue=false;
    automaticEnd=false;automaticEndId='';
    loadedSong={
      songId:id,
      title:document.getElementById('ls26SingerUpcomingTitle')?.textContent?.trim()||'',
      artist:document.getElementById('ls26SingerUpcomingArtist')?.textContent?.trim()||'',
      year
    };
  };
  const stopTimer=()=>{if(feedbackTimer!==null)clearTimeout(feedbackTimer);feedbackTimer=null;};
  const armTimer=()=>{
    stopTimer();
    if(mode==='ended')feedbackTimer=setTimeout(()=>{
      applyMode('idle');
      state('idle-'+Date.now(),true);
    },20000);
  };
  const state=(id,publishCloud=false)=>{
    const label=document.getElementById('scrollToggleBtn')?.textContent?.trim()||'';
    const speed=document.getElementById('scrollSpeedDisplay')?.textContent?.trim()||'';
    const packet={
      v:1,kind:'state',origin:'prompter',id,
      playing:!manualEndingId&&mode==='running'&&label==='⏸',speed,
      mode:manualEndingId?'ended':mode,at:Date.now(),
      songId:loadedSong.songId,title:loadedSong.title,artist:loadedSong.artist,
      cueToken:activeCueToken
    };
    try{channel?.postMessage(packet);}catch(_){}
    try{localStorage.setItem(STORAGE,JSON.stringify(packet));}catch(_){}
    // The singer screen may be unsigned-in/public. Never open an anonymous
    // Firestore write path merely for remote feedback. If owner authenticated,
    // publish ONLY deliberate state transitions, not scroll frames or beats.
    let signedIn=false;
    try{signedIn=Boolean(window.firebase?.auth?.().currentUser);}catch(_){}
    if(publishCloud&&signedIn&&sharedDb?.collection){
      const guarded=automaticEnd&&(packet.mode==='ended'||packet.mode==='idle');
      const endId=automaticEndId;
      cloudStateChain=cloudStateChain.catch(()=>{}).then(()=>{
        const ref=sharedDb.collection('karaokeControl').doc('liveLyrics');
        if(!guarded)return ref.set({prompterRemoteState:packet},{merge:true});
        // The old countdown must never overwrite a newly sent song, or
        // a host START AGAIN on the same cue. No per-frame/countdown writes.
        if(!packet.cueToken||typeof sharedDb.runTransaction!=='function')return;
        return sharedDb.runTransaction(async tx=>{
          const snap=await tx.get(ref);
          const data=snap.data()||{};
          if(String(data.prompterRequestToken||'')!==packet.cueToken)return;
          const current=data.prompterRemoteState||{};
          if(packet.mode==='ended'&&current.mode!=='running')return;
          if(packet.mode==='idle'&&!(current.mode==='ended'&&current.id===endId))return;
          if(Number(current.at||0)>packet.at)return;
          tx.set(ref,{prompterRemoteState:packet},{merge:true});
        });
      }).catch(error=>console.warn('Prompter state sync failed:',error));
    }
    return packet;
  };
  const applyMode=next=>{
    if(!['idle','waiting','running','instrumental','ended'].includes(next))return;
    stopTimer();
    cancelEnding();
    if(next==='running'||next==='waiting'||next==='instrumental')automaticEnd=false;
    const starting=next==='running'&&(mode==='waiting'||mode==='ended'||mode==='idle');
    // START SONG only reveals the lyrics. The separate Play control owns
    // autoscroll; keep the Prompter paused until it is pressed explicitly.
    if((next!=='running'||starting)&&typeof stopAutoScroll==='function')stopAutoScroll();
    mode=next;
    document.body.dataset.ls26SingerStage=next;
    if(starting)window.scrollTo(0,0);
    // Keep the existing hold/resume behaviour for an instrumental section.
    if(next==='running'&&!starting&&typeof autoScrollActive!=='undefined'&&!autoScrollActive&&typeof toggleAutoScroll==='function')toggleAutoScroll();
    if(next==='ended')armTimer();
    window.dispatchEvent(new CustomEvent('ls26:prompter-stage-changed',{detail:{mode:next}}));
    if(next==='running')scheduleEnding();
  };

  applyMode('idle');
  window.addEventListener('scroll',scheduleEnding,{passive:true});
  window.addEventListener('resize',scheduleEnding,{passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){
      if(!manualEndingId)cancelEnding();
    }else if(manualEndingId){
      if(endingTimer!==null)clearTimeout(endingTimer);
      tickEnding();
    }else scheduleEnding();
  });
  window.addEventListener('ls26:prompter-song-changed',event=>{
    cancelEnding();
    // Local session-picker selections load directly into lyrics without
    // altering the host's SEND LYRICS command or starting autoscroll.
    if(event.detail?.picker===true){
      updateSong(event.detail||{});
      applyMode('running');
      state('picker-'+Date.now(),true);
      return;
    }
    // Preload/reload song data silently. Only a fresh SEND LYRICS cue
    // replaces the waiting-for-next-singer artwork.
    if(event.detail?.cue!==true)return;
    updateSong(event.detail||{});
    applyMode('waiting');
    state('song-'+Date.now(),true);
  });
  window.addEventListener('ls26:prompter-feedback-complete',()=>{
    if(mode==='ended'){applyMode('idle');state('feedback-'+Date.now(),true);}
  });
  // The 20-second end-screen timeout is inactivity-based, not a hard
  // deadline. Tapping the rating card or its info dialog restarts it.
  document.addEventListener('pointerdown',event=>{
    if(mode!=='ended')return;
    if(event.target.closest?.('#prompterEndRating,#prompterRatingGuide'))armTimer();
  },true);
  document.addEventListener('keydown',event=>{
    if(mode==='ended'&&event.target.closest?.('#prompterEndRating,#prompterRatingGuide'))armTimer();
    // The singer can use the keyboard or touch controls directly as well as
    // the remote. Publish the changed play/speed state on the next event loop.
    if(['Space','ArrowUp','ArrowDown'].includes(event.code))
      setTimeout(()=>state('manual-'+Date.now(),true),0);
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest?.('#autoScrollControls button,#scrollSpeedDisplay'))
      setTimeout(()=>state('manual-'+Date.now(),true),0);
  });

  const receive=packet=>{
    if(!packet||packet.v!==1||packet.kind!=='command'||!valid.has(packet.action)||typeof packet.id!=='string'||packet.id.length>80)return;
    if(seen.has(packet.id))return;
    seen.add(packet.id);if(seen.size>60)seen.clear();
    // Keep the remote's ended projection stable during its short delay.
    // An explicit START AGAIN is still an intentional restart.
    if(manualEndingId&&['toggle','instrumental'].includes(packet.action)){state(packet.id);return;}
    try{
      switch(packet.action){
        case 'toggle':
          if(mode==='running'&&typeof toggleAutoScroll==='function'){
            const playing=document.getElementById('scrollToggleBtn')?.textContent?.trim()==='⏸';
            if(typeof packet.targetPlaying!=='boolean'||playing!==packet.targetPlaying)
              toggleAutoScroll();
          }
          break;
        case 'instrumental':
          if(packet.targetMode==='instrumental'&&mode==='running')applyMode('instrumental');
          else if(packet.targetMode==='running'&&mode==='instrumental')applyMode('running');
          else if(!packet.targetMode){
            if(mode==='running')applyMode('instrumental');
            else if(mode==='instrumental')applyMode('running');
          }
          break;
        case 'song':
          if(packet.targetMode==='running'&&manualEndingId){
            cancelEnding();
            mode='waiting';
            applyMode('running');
          }else if(packet.targetMode==='ended'&&(mode==='running'||mode==='instrumental'))beginManualEnding(packet.id);
          else if(packet.targetMode==='running'&&(mode==='waiting'||mode==='ended'||mode==='idle'))applyMode('running');
          else if(!packet.targetMode){
            if(mode==='waiting'||mode==='ended')applyMode('running');
            else if(mode==='running'||mode==='instrumental')beginManualEnding(packet.id);
          }
          break;
        case 'slower':
          if(typeof changeScrollSpeed==='function')changeScrollSpeed(-0.10);
          break;
        case 'faster':
          if(typeof changeScrollSpeed==='function')changeScrollSpeed(0.10);
          break;
        case 'up':
          if(mode==='running')document.getElementById('prompterScrollUp')?.click();
          break;
        case 'down':
          if(mode==='running')document.getElementById('prompterScrollDown')?.click();
          break;
      }
    }catch(error){console.warn('Prompter remote command failed:',error);}
    state(packet.id);
  };
  try{
    channel=new BroadcastChannel(CHANNEL);
    channel.onmessage=event=>receive(event.data);
  }catch(_){channel=null;}
  window.addEventListener('storage',event=>{
    if(event.key!==STORAGE||!event.newValue)return;
    try{receive(JSON.parse(event.newValue));}catch(_){}
  });
  const sharedDb=window.db||(typeof db!=='undefined'?db:null);
  // Each document has its own baseline and last-command ID. Both feed the
  // same deduplicating receiver, including same-device BroadcastChannel.
  const cloudHandler=(arrowsOnly=false)=>{
    let first=true,lastId='';
    return snapshot=>{
      const data=snapshot.exists?snapshot.data():null;
      if(!arrowsOnly&&activeCueToken&&data?.prompterRequestToken&&String(data.prompterRequestToken)!==activeCueToken){
        pendingCue=true;cancelEnding();
      }
      const packet=data?.prompterRemoteCommand;
      const id=typeof packet?.id==='string'?packet.id:'';
      if(first){first=false;lastId=id;return;}
      if(!id||id===lastId)return;
      lastId=id;
      if(arrowsOnly&&packet.action!=='up'&&packet.action!=='down')return;
      receive(packet);
    };
  };
  if(sharedDb?.collection){
    try{
      unsubscribeRemote=sharedDb.collection('karaokeControl').doc('liveLyrics')
        .onSnapshot(cloudHandler(),error=>console.warn('Prompter cross-device listener failed:',error));
    }catch(error){console.warn('Prompter remote listener unavailable:',error);}
    try{
      unsubscribeScroll=sharedDb.collection('karaokeControl').doc('prompterScroll')
        .onSnapshot(cloudHandler(true),error=>console.warn('Prompter scroll listener failed:',error));
    }catch(error){console.warn('Prompter scroll listener unavailable:',error);}
  }
  window.addEventListener('pagehide',()=>{
    stopTimer();cancelEnding();
    if(endingFrame!==null)cancelAnimationFrame(endingFrame);
    channel?.close();unsubscribeRemote?.();unsubscribeScroll?.();
    fullscreenDoc.removeEventListener('fullscreenchange',syncFullscreenButton);
  },{once:true});
  state('ready-'+Date.now());
})();