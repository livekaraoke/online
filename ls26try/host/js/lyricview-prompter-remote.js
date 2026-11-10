/* LyricView -> legacy fullscreen Prompter remote.
 * Same-device fast path: BroadcastChannel/localStorage.
 * Cross-device: one merge write per press to existing karaokeControl/liveLyrics.
 * Cloud writes confirm delivery to Firestore, not execution on another tablet.
 */
(() => {
  'use strict';
  const CHANNEL='ls26-prompter-remote-v1',STORAGE='ls26:prompter-remote-command-v1';
  const POSITION_KEY='ls26:prompter-remote-bottom-position-v4';
  const FIXED_TOP_POSITION_KEY='ls26:prompter-remote-fixed-position-v3';
  const PAGE_POSITION_KEY='ls26:prompter-remote-page-position-v2';
  const OLD_POSITION_KEY='ls26:prompter-remote-position-v1';
  const $=id=>document.getElementById(id);
  let channel=null,lastRequest='',timeout=null,cloudWriteChain=Promise.resolve(),unsubscribeCloud=null;
  let loadedSong={songId:'',title:'',artist:'',year:''},lastSongSignature='',lastCueToken='';
  let drag=null,customPosition=false,positionRestored=false,userMoved=false;
  // Height-only resizes often mean Chrome's address/navigation bars hid on scroll.
  // They must never shift the remote or rewrite its saved screen position.
  let placementWidth=window.innerWidth;
  const panel=document.createElement('aside');
  panel.id='ls26PrompterRemote';
  panel.setAttribute('aria-label','Fullscreen Prompter remote');
  panel.hidden=true;
  panel.innerHTML=`
    <div class="ls26-prompter-remote-head" title="Drag to move Prompter Remote"><strong>PROMPTER REMOTE</strong>
      <span id="ls26PrompterRemoteStatus" role="status">Open Prompter tab</span>
    </div>
    <div class="ls26-prompter-remote-controls">
      <button type="button" data-remote="toggle" id="ls26PrompterRemotePlay" aria-pressed="false" aria-label="Play Prompter autoscroll">▶</button>
      <button type="button" data-remote="slower" aria-label="Decrease Prompter scroll speed">−</button>
      <button type="button" data-remote="faster" aria-label="Increase Prompter scroll speed">+</button>
      <button type="button" class="ls26-prompter-remote-arrow" data-remote="up" aria-label="Scroll Prompter up" title="Scroll Prompter up"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg></button>
      <button type="button" class="ls26-prompter-remote-arrow" data-remote="down" aria-label="Scroll Prompter down" title="Scroll Prompter down"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg></button>
    </div>
    <div class="ls26-prompter-remote-stage-actions">
      <button type="button" data-remote="song" id="ls26PrompterSongCue">START SONG</button>
      <button type="button" data-remote="instrumental" id="ls26PrompterInstrumental" aria-pressed="false" disabled>INSTRUMENTAL / HOLD</button>
    </div>`;
  let singerMode='waiting';
  const setSingerMode=mode=>{
    if(!['idle','waiting','running','instrumental','ended'].includes(mode))return;
    singerMode=mode;
    const hold=$('ls26PrompterInstrumental'),song=$('ls26PrompterSongCue');
    if(hold){
      hold.disabled=mode==='waiting'||mode==='ended';
      hold.setAttribute('aria-pressed',String(mode==='instrumental'));
      hold.textContent=mode==='instrumental'?'RESUME LYRICS':'INSTRUMENTAL / HOLD';
    }
    if(song){song.disabled=mode==='idle';song.textContent=mode==='running'||mode==='instrumental'?'END SONG':mode==='ended'?'START AGAIN':'START SONG';}
  };

  const setPlayState=playing=>{
    const button=$('ls26PrompterRemotePlay');
    if(!button)return;
    button.textContent=playing?'■':'▶';
    button.setAttribute('aria-pressed',String(playing));
    button.setAttribute('aria-label',playing?'Stop Prompter autoscroll':'Play Prompter autoscroll');
  };
  // Android Chrome collapses its top browser chrome as lyrics scroll. A
  // fixed TOP coordinate then moves up with that chrome in the physical screen,
  // unlike the bottom playback dock. Anchor the remote by BOTTOM instead.
  // All drag and persisted coordinates use the viewport's bottom edge.
  const viewportBottom=rect=>window.innerHeight-rect.bottom;
  const place=(x,bottomOffset)=>{
    const rect=panel.getBoundingClientRect();
    const left=Math.max(8,Math.min(x,Math.max(8,innerWidth-rect.width-8)));
    const bottom=Math.max(8,Math.min(bottomOffset,Math.max(8,innerHeight-rect.height-8)));
    Object.assign(panel.style,{left:left+'px',top:'auto',right:'auto',bottom:bottom+'px',transform:'none'});
    customPosition=true;
  };
  const savePosition=()=>{
    if(!customPosition)return;
    const r=panel.getBoundingClientRect();
    try{localStorage.setItem(POSITION_KEY,JSON.stringify({x:r.left,bottom:viewportBottom(r)}));}catch(_){}
  };
  const placeDefault=()=>{
    // Leave the fixed pixel bottom CSS anchor live, just like the playback dock.
    // In particular NEVER freeze the initial top pixel coordinate.
    Object.assign(panel.style,{left:'',top:'',right:'',bottom:'',transform:''});
    customPosition=false;
  };
  const restorePosition=()=>{
    if(positionRestored)return;
    positionRestored=true;
    try{
      const saved=JSON.parse(localStorage.getItem(POSITION_KEY)||'null');
      if(Number.isFinite(saved?.x)&&Number.isFinite(saved?.bottom)){
        userMoved=true;place(saved.x,saved.bottom);return;
      }
      // Convert earlier top-anchored saved positions once to bottom offsets.
      // This preserves user placement while avoiding subsequent Chrome jumps.
      const topSaved=JSON.parse(localStorage.getItem(FIXED_TOP_POSITION_KEY)||'null');
      if(Number.isFinite(topSaved?.x)&&Number.isFinite(topSaved?.y)){
        userMoved=true;
        place(topSaved.x,innerHeight-topSaved.y-panel.getBoundingClientRect().height);
        savePosition();return;
      }
      const page=JSON.parse(localStorage.getItem(PAGE_POSITION_KEY)||'null');
      if(Number.isFinite(page?.x)&&Number.isFinite(page?.y)){
        userMoved=true;
        place(page.x,innerHeight-(page.y-window.scrollY)-panel.getBoundingClientRect().height);
        savePosition();return;
      }
      const old=JSON.parse(localStorage.getItem(OLD_POSITION_KEY)||'null');
      if(Number.isFinite(old?.x)&&Number.isFinite(old?.y)){
        userMoved=true;
        place(old.x,innerHeight-old.y-panel.getBoundingClientRect().height);
        savePosition();return;
      }
    }catch(_){}
    placeDefault();
  };
  const enableDragging=()=>{
    const bar=panel.querySelector('.ls26-prompter-remote-head');
    bar.addEventListener('pointerdown',e=>{
      // The title is draggable; stage controls are independent touch actions.
      if(e.target.closest('button'))return;
      if(e.pointerType==='mouse'&&e.button!==0)return;
      const r=panel.getBoundingClientRect();
      drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,left:r.left,bottom:viewportBottom(r)};
      bar.setPointerCapture(e.pointerId);
      bar.classList.add('is-dragging');
      e.preventDefault();
    });
    bar.addEventListener('pointermove',e=>{
      if(drag?.id!==e.pointerId)return;
      place(drag.left+e.clientX-drag.startX,drag.bottom-(e.clientY-drag.startY));
    });
    const end=e=>{
      if(drag?.id!==e.pointerId)return;
      drag=null;userMoved=true;bar.classList.remove('is-dragging');savePosition();
      if(bar.hasPointerCapture(e.pointerId))bar.releasePointerCapture(e.pointerId);
    };
    bar.addEventListener('pointerup',end);
    bar.addEventListener('pointercancel',end);
    bar.addEventListener('lostpointercapture',e=>{
      if(drag?.id===e.pointerId){
        drag=null;userMoved=true;bar.classList.remove('is-dragging');savePosition();
      }
    });
  };
  const show=visible=>{
    panel.hidden=!visible;
    if(visible)restorePosition();
    if(visible){$('ls26PrompterRemoteStatus').textContent='Cross-tablet ready';observeCloud();send('status');}
    else if(unsubscribeCloud){unsubscribeCloud();unsubscribeCloud=null;}
  };
  const getCurrentState=id=>({
    v:1,kind:'state',id,at:Date.now(),origin:'remote',
    mode:singerMode,playing:$('ls26PrompterRemotePlay')?.getAttribute('aria-pressed')==='true',
    songId:loadedSong.songId,title:loadedSong.title,artist:loadedSong.artist
  });
  const songFromDoc=data=>{
    if(!data||typeof data!=='object')return {songId:'',title:'',artist:'',year:''};
    const modern=data.prompterLyricsSource==='modern';
    const songId=String(modern?(data.prompterSongId||''):(data.currentSongId||data.currentLyricsSongId||data.songId||'')).trim();
    if(!songId)return {songId:'',title:'',artist:'',year:''};
    const song=data.song||{};
    return {
      songId,
      title:String(data.prompterSongTitle||data.songTitle||data.title||song.title||'').trim(),
      artist:String(data.prompterSongArtist||data.songArtist||data.artist||song.artist||'').trim(),
      year:String(data.prompterSongYear||data.songYear||data.year||song.year||'').trim()
    };
  };
  const syncSong=next=>{
    const signature=JSON.stringify(next);
    if(signature===lastSongSignature)return;
    loadedSong=next;lastSongSignature=signature;
    window.LS26PrompterRemoteCurrentSong={...next};
    window.dispatchEvent(new CustomEvent('ls26:prompter-remote-song',{detail:{...next}}));
  };
  const observeCloud=()=>{
    if(unsubscribeCloud)return;
    const sharedDb=window.db||window.LK?.db;
    if(!sharedDb?.collection)return;
    try{
      unsubscribeCloud=sharedDb.collection('karaokeControl').doc('liveLyrics')
        .onSnapshot(snapshot=>{
          if(!snapshot.exists)return;
          const data=snapshot.data()||{};
          syncSong(songFromDoc(data));
          const cueToken=String(data.prompterRequestToken||'');
          const newCue=Boolean(cueToken&&lastCueToken&&cueToken!==lastCueToken);
          lastCueToken=cueToken;
          const state=data.prompterRemoteState;
          if(state?.v===1&&state.kind==='state'&&
             ['idle','waiting','running','instrumental','ended'].includes(state.mode)){
            // Ignore a previous song's stage when new lyrics were just sent.
            if(!newCue || state.mode==='waiting')receive(state);
            else {setSingerMode('waiting');setPlayState(false);}
          }else if(newCue || (loadedSong.songId&&singerMode==='idle')){
            setSingerMode('waiting');setPlayState(false);
          }
        },error=>{console.warn('Prompter remote state subscription failed:',error);
          const status=$('ls26PrompterRemoteStatus');if(status)status.textContent='Sync unavailable';});
    }catch(error){console.warn('Prompter remote state unavailable:',error);}
  };
  const post=packet=>{
    try{channel?.postMessage(packet);}catch(_){}
    try{localStorage.setItem(STORAGE,JSON.stringify(packet));}catch(_){}
  };
  const send=action=>{
    if(panel.hidden)return;
    const id=String(Date.now())+'-'+Math.random().toString(36).slice(2,8);
    lastRequest=id;
    const wasPlaying=$('ls26PrompterRemotePlay')?.getAttribute('aria-pressed')==='true';
    const previousMode=singerMode;
    if(action==='toggle'&&singerMode==='running')setPlayState(!wasPlaying);
    if(action==='song'){
      const next=singerMode==='running'||singerMode==='instrumental'?'ended':'running';
      setSingerMode(next);
      // Revealing lyrics is not the same as starting autoscroll.
      setPlayState(false);
    }
    if(action==='instrumental'){
      const next=singerMode==='instrumental'?'running':'instrumental';
      setSingerMode(next);setPlayState(next==='running');
    }
    const packet={v:1,kind:'command',id,action,at:Date.now()};
    const projected=getCurrentState(id);
    // Optional idempotent targets prevent two controllers starting or ending
    // the same song twice when they tap at nearly the same moment.
    if(action==='song'||action==='instrumental')packet.targetMode=projected.mode;
    if(action==='toggle')packet.targetPlaying=projected.playing;
    post(packet);
    clearTimeout(timeout);
    const status=$('ls26PrompterRemoteStatus');
    if(action==='status'){
      // Local-tab discovery is free; remote availability cannot be verified here.
      timeout=setTimeout(()=>{if(lastRequest===id)status.textContent='Cross-tablet ready';},1500);
      return;
    }
    status.textContent='Sending…';
    const sharedDb=window.db||window.LK?.db;
    if(!sharedDb?.collection){
      if(['toggle','song','instrumental'].includes(action))setPlayState(wasPlaying);
      setSingerMode(previousMode);
      status.textContent='Cloud sync unavailable';return;
    }
    // Serialize taps to prevent ordered +/-/Play commands overtaking each other.
    // Never write on autoscroll frames or touch singer lyrics/scroll sync fields.
    cloudWriteChain=cloudWriteChain.catch(()=>{}).then(()=>
      sharedDb.collection('karaokeControl').doc('liveLyrics')
        .set({prompterRemoteCommand:packet,prompterRemoteState:projected},{merge:true})
    ).then(()=>{
      if(lastRequest===id&&!status.textContent.startsWith('Connected'))
        status.textContent='Sent via Firestore';
    }).catch(error=>{
      console.warn('Prompter cross-tablet command failed:',error);
      if(lastRequest===id&&!status.textContent.startsWith('Connected')){
        if(['toggle','song','instrumental'].includes(action))setPlayState(wasPlaying);
        setSingerMode(previousMode);
        status.textContent='Sync failed — check sign-in';
      }
    });
  };
  const receive=packet=>{
    if(!packet||packet.v!==1||packet.kind!=='state'||!packet.id)return;
    // The Prompter also broadcasts a ready status with no matching request.
    const status=$('ls26PrompterRemoteStatus'),play=$('ls26PrompterRemotePlay');
    if(!status||!play)return;
    // State from a Firestore command is an intended state, not a singer-device
    // acknowledgement. Only the singer's direct state message confirms it.
    if(packet.origin!=='remote'){
      clearTimeout(timeout);
      lastRequest='';
      status.textContent='Connected';
    }
    setPlayState(Boolean(packet.playing));
    if(packet.mode)setSingerMode(packet.mode);
    window.LS26PrompterRemoteCurrentState={...packet};
    window.dispatchEvent(new CustomEvent('ls26:prompter-remote-state',{detail:{...packet}}));
  };
  function start(){
    // Standalone Admin phone controller embeds this exact remote rather than
    // maintaining a duplicate set of Firestore command handlers.
    const phoneMount=document.getElementById('phonePrompterRemoteMount');
    (phoneMount||document.body).append(panel);
    if(!phoneMount)enableDragging();
    window.addEventListener('resize',()=>{
      const width=window.innerWidth;
      // Ignore height-only browser UI changes, including Chrome on Android
      // showing/hiding its address bar when scrolling the lyrics.
      if(Math.abs(width-placementWidth)<24)return;
      placementWidth=width;
      if(panel.hidden)return;
      if(!userMoved){placeDefault();return;}
      if(customPosition){
        const r=panel.getBoundingClientRect();
        place(r.left,viewportBottom(r));
        savePosition();
      }
    });
    panel.addEventListener('click',event=>{
      const action=event.target.closest('button[data-remote]')?.dataset.remote;
      if(action&&['toggle','slower','faster','up','down','instrumental','song'].includes(action))send(action);
    });
    try{
      channel=new BroadcastChannel(CHANNEL);
      channel.onmessage=e=>receive(e.data);
    }catch(_){channel=null;}
    window.addEventListener('storage',event=>{
      if(event.key!==STORAGE||!event.newValue)return;
      try{receive(JSON.parse(event.newValue));}catch(_){}
    });
    window.addEventListener('ls26:prompter-remote-visibility',event=>show(event.detail?.visible===true));
    window.addEventListener('ls26:prompter-lyrics-sent',event=>{
      setSingerMode('waiting');setPlayState(false);
      // The sender's liveLyrics SEND LYRICS write is the authoritative cue.
      // This local reset is immediate while the Firestore snapshot arrives.
    });
    // The host's actual song-completion action must also finish the singer
    // stage when it is running, regardless of which remote is visible.
    window.addEventListener('ls26:song-finished',()=>{
      if(singerMode==='running'||singerMode==='instrumental')send('song');
    });
    // This setting is owned by performance.js; Karaoke Tools is separate.
    // Preserve the old default when a standalone/older page lacks the toggle.
    show($('ls26ShowPrompterRemote')?.checked ?? $('ls26ShowKaraoke')?.checked===true);
    window.addEventListener('pagehide',()=>{clearTimeout(timeout);channel?.close();unsubscribeCloud?.();},{once:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
