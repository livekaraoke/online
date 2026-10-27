/* LyricView -> legacy fullscreen Prompter remote.
 * Same-origin tabs/windows only: BroadcastChannel, storage-event fallback.
 * No Firestore writes, new listeners or duplicated auto-scroll state.
 */
(() => {
  'use strict';
  const CHANNEL='ls26-prompter-remote-v1',STORAGE='ls26:prompter-remote-command-v1';
  const $=id=>document.getElementById(id);
  let channel=null,lastRequest='',timeout=null;
  const panel=document.createElement('aside');
  panel.id='ls26PrompterRemote';
  panel.setAttribute('aria-label','Fullscreen Prompter remote');
  panel.hidden=true;
  panel.innerHTML=`
    <div class="ls26-prompter-remote-head"><strong>PROMPTER REMOTE</strong>
      <span id="ls26PrompterRemoteStatus" role="status">Open Prompter tab</span></div>
    <div class="ls26-prompter-remote-row">
      <button type="button" data-remote="toggle" id="ls26PrompterRemotePlay" aria-label="Play or pause Prompter autoscroll">▶</button>
      <button type="button" data-remote="slower" aria-label="Decrease Prompter scroll speed">−</button>
      <output id="ls26PrompterRemoteSpeed" aria-label="Prompter scroll speed">—</output>
      <button type="button" data-remote="faster" aria-label="Increase Prompter scroll speed">+</button>
    </div>
    <div class="ls26-prompter-remote-row ls26-prompter-remote-nav">
      <button type="button" data-remote="up" aria-label="Scroll Prompter up">↑ UP</button>
      <button type="button" data-remote="down" aria-label="Scroll Prompter down">↓ DOWN</button>
    </div>`;

  const show=visible=>{
    panel.hidden=!visible;
    if(visible)send('status');
  };
  const post=packet=>{
    try{channel?.postMessage(packet);}catch(_){}
    try{localStorage.setItem(STORAGE,JSON.stringify(packet));}catch(_){}
  };
  const send=action=>{
    if(panel.hidden)return;
    const id=String(Date.now())+'-'+Math.random().toString(36).slice(2,8);
    lastRequest=id;
    post({v:1,kind:'command',id,action,at:Date.now()});
    clearTimeout(timeout);
    timeout=setTimeout(()=>{
      // Only report unavailable if this specific command received no response.
      if(lastRequest===id)$('ls26PrompterRemoteStatus').textContent='Open Prompter tab';
    },1500);
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
    play.textContent=packet.playing?'Ⅱ':'▶';
    play.setAttribute('aria-pressed',String(Boolean(packet.playing)));
    play.setAttribute('aria-label',packet.playing?'Pause Prompter autoscroll':'Play Prompter autoscroll');
  };
  function start(){
    document.body.append(panel);
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
