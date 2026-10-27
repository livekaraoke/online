/* LyricView -> legacy fullscreen Prompter remote.
 * Same-device fast path: BroadcastChannel/localStorage.
 * Cross-device: one merge write per press to existing karaokeControl/liveLyrics.
 * Cloud writes confirm delivery to Firestore, not execution on another tablet.
 */
(() => {
  'use strict';
  const CHANNEL='ls26-prompter-remote-v1',STORAGE='ls26:prompter-remote-command-v1';
  const POSITION_KEY='ls26:prompter-remote-page-position-v2';
  const OLD_POSITION_KEY='ls26:prompter-remote-position-v1';
  const $=id=>document.getElementById(id);
  let channel=null,lastRequest='',timeout=null,cloudWriteChain=Promise.resolve();
  let drag=null,customPosition=false,positionRestored=false,userMoved=false;
  const panel=document.createElement('aside');
  panel.id='ls26PrompterRemote';
  panel.setAttribute('aria-label','Fullscreen Prompter remote');
  panel.hidden=true;
  panel.innerHTML=`
    <div class="ls26-prompter-remote-head" title="Drag to move Prompter Remote"><strong>PROMPTER REMOTE</strong>
      <span id="ls26PrompterRemoteStatus" role="status">Open Prompter tab</span></div>
    <div class="ls26-prompter-remote-controls">
      <button type="button" data-remote="toggle" id="ls26PrompterRemotePlay" aria-pressed="false" aria-label="Play Prompter autoscroll">▶</button>
      <button type="button" data-remote="slower" aria-label="Decrease Prompter scroll speed">−</button>
      <output id="ls26PrompterRemoteSpeed" aria-label="Prompter scroll speed">—</output>
      <button type="button" data-remote="faster" aria-label="Increase Prompter scroll speed">+</button>
      <button type="button" class="ls26-prompter-remote-arrow" data-remote="up" aria-label="Scroll Prompter up" title="Scroll Prompter up"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg></button>
      <button type="button" class="ls26-prompter-remote-arrow" data-remote="down" aria-label="Scroll Prompter down" title="Scroll Prompter down"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg></button>
    </div>`;

  const setPlayState=playing=>{
    const button=$('ls26PrompterRemotePlay');
    if(!button)return;
    button.textContent=playing?'■':'▶';
    button.setAttribute('aria-pressed',String(playing));
    button.setAttribute('aria-label',playing?'Stop Prompter autoscroll':'Play Prompter autoscroll');
  };
  // Use page coordinates, not fixed viewport coordinates. The card travels
  // with the lyrics when the document scrolls; the sticky tools bar does not.
  const place=(x,pageY,limitToViewport=false)=>{
    const rect=panel.getBoundingClientRect();
    const maxX=Math.max(8,window.innerWidth-rect.width-8);
    const minY=window.scrollY+8;
    const maxY=Math.max(minY,window.scrollY+window.innerHeight-rect.height-8);
    const left=Math.max(8,Math.min(x,maxX));
    const top=limitToViewport?Math.max(minY,Math.min(pageY,maxY)):Math.max(8,pageY);
    Object.assign(panel.style,{left:left+'px',top:top+'px',right:'auto',bottom:'auto',transform:'none'});
    customPosition=true;
  };
  const savePosition=()=>{
    if(!customPosition)return;
    const r=panel.getBoundingClientRect();
    try{localStorage.setItem(POSITION_KEY,JSON.stringify({x:r.left,y:r.top+window.scrollY}));}catch(_){}
  };
  const placeDefault=()=>{
    const rect=panel.getBoundingClientRect();
    const safeBottom=Math.max(125,Math.min(190,window.innerHeight*0.12));
    const top=Math.max(window.scrollY+8,window.scrollY+window.innerHeight-safeBottom-rect.height);
    // Keep the responsive CSS horizontal anchor active until the user drags.
    Object.assign(panel.style,{left:'',top:top+'px',right:'',bottom:'auto',transform:''});
    customPosition=false;
  };
  const restorePosition=()=>{
    if(positionRestored)return;
    positionRestored=true;
    try{
      const p=JSON.parse(localStorage.getItem(POSITION_KEY)||'null');
      if(Number.isFinite(p?.x)&&Number.isFinite(p?.y)){userMoved=true;place(p.x,p.y);return;}
      // Migrate the earlier fixed card position to its current page position.
      const old=JSON.parse(localStorage.getItem(OLD_POSITION_KEY)||'null');
      if(Number.isFinite(old?.x)&&Number.isFinite(old?.y)){
        userMoved=true;
        place(old.x,old.y+window.scrollY);
        savePosition();
        return;
      }
    }catch(_){}
    placeDefault();
  };
  const enableDragging=()=>{
    const bar=panel.querySelector('.ls26-prompter-remote-head');
    bar.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      const r=panel.getBoundingClientRect();
      drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,left:r.left,top:r.top+window.scrollY,scrollY:window.scrollY};
      bar.setPointerCapture(e.pointerId);
      bar.classList.add('is-dragging');
      e.preventDefault();
    });
    bar.addEventListener('pointermove',e=>{
      if(drag?.id!==e.pointerId)return;
      place(drag.left+e.clientX-drag.startX,drag.top+e.clientY-drag.startY+(window.scrollY-drag.scrollY),true);
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
    if(visible){$('ls26PrompterRemoteStatus').textContent='Cross-tablet ready';send('status');}
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
    if(action==='toggle')setPlayState(!wasPlaying);
    const packet={v:1,kind:'command',id,action,at:Date.now()};
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
      if(action==='toggle')setPlayState(wasPlaying);
      status.textContent='Cloud sync unavailable';return;
    }
    // Serialize taps to prevent ordered +/-/Play commands overtaking each other.
    // Never write on autoscroll frames or touch singer lyrics/scroll sync fields.
    cloudWriteChain=cloudWriteChain.catch(()=>{}).then(()=>
      sharedDb.collection('karaokeControl').doc('liveLyrics')
        .set({prompterRemoteCommand:packet},{merge:true})
    ).then(()=>{
      if(lastRequest===id&&!status.textContent.startsWith('Connected'))
        status.textContent='Sent via Firestore';
    }).catch(error=>{
      console.warn('Prompter cross-tablet command failed:',error);
      if(lastRequest===id&&!status.textContent.startsWith('Connected')){
        if(action==='toggle')setPlayState(wasPlaying);
        status.textContent='Sync failed — check sign-in';
      }
    });
  };
  const receive=packet=>{
    if(!packet||packet.v!==1||packet.kind!=='state'||!packet.id)return;
    // The Prompter also broadcasts a ready status with no matching request.
    const status=$('ls26PrompterRemoteStatus'),speed=$('ls26PrompterRemoteSpeed'),play=$('ls26PrompterRemotePlay');
    if(!status||!speed||!play)return;
    clearTimeout(timeout);
    lastRequest='';
    status.textContent='Connected';
    if(packet.speed)speed.textContent=String(packet.speed);
    setPlayState(Boolean(packet.playing));
  };
  function start(){
    document.body.append(panel);
    enableDragging();
    window.addEventListener('resize',()=>{
      if(!panel.hidden){
        if(!userMoved){placeDefault();return;}
        if(customPosition){
          const r=panel.getBoundingClientRect();place(r.left,r.top+window.scrollY);savePosition();
        }
      }
    });
    panel.addEventListener('click',event=>{
      const action=event.target.closest('button[data-remote]')?.dataset.remote;
      if(action&&['toggle','slower','faster','up','down'].includes(action))send(action);
    });
    try{
      channel=new BroadcastChannel(CHANNEL);
      channel.onmessage=e=>receive(e.data);
    }catch(_){channel=null;}
    window.addEventListener('storage',event=>{
      if(event.key!==STORAGE||!event.newValue)return;
      try{receive(JSON.parse(event.newValue));}catch(_){}
    });
    window.addEventListener('ls26:karaoke-tools-visibility',event=>show(event.detail?.visible===true));
    // Preserve persisted setting; performance.js owns the checkbox and strip.
    show($('ls26ShowKaraoke')?.checked===true);
    window.addEventListener('pagehide',()=>{clearTimeout(timeout);channel?.close();},{once:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
