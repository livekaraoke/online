/* Fullscreen Prompter receiver for LyricView's optional cross-device remote.
 * Same-device fast path plus one listener on existing karaokeControl/liveLyrics.
 * Uses authoritative scroll/speed/arrow controls. No per-frame writes.
 */
(() => {
  'use strict';
  const CHANNEL='ls26-prompter-remote-v1',STORAGE='ls26:prompter-remote-command-v1';
  const valid=new Set(['status','toggle','slower','faster','up','down','instrumental','song']);
  const seen=new Set();
  let channel=null,unsubscribeRemote=null,firstCloudSnapshot=true,lastCloudId='';
  let mode='waiting';
  // Presentation-only gate: no extra scroll engine or session history writes.
  const stage=document.createElement('div');
  stage.id='ls26SingerRemoteStage';
  stage.setAttribute('aria-live','polite');
  stage.innerHTML='<div class="ls26-singer-stage-cue"><strong>INSTRUMENTAL</strong><span>(wait for signal)</span></div>';
  document.body.appendChild(stage);
  const applyMode=next=>{
    if(!['waiting','running','instrumental','ended'].includes(next))return;
    if(next!=='running'&&typeof stopAutoScroll==='function')stopAutoScroll();
    mode=next;
    document.body.dataset.ls26SingerStage=next;
    if(next==='running'&&typeof autoScrollActive!=='undefined'&&!autoScrollActive&&typeof toggleAutoScroll==='function')toggleAutoScroll();
    window.dispatchEvent(new CustomEvent('ls26:prompter-stage-changed',{detail:{mode:next}}));
  };
  applyMode('waiting');
  window.addEventListener('ls26:prompter-song-changed',()=>{
    applyMode('waiting');
    state('song-'+Date.now());
  });
  const state=id=>{
    const label=document.getElementById('scrollToggleBtn')?.textContent?.trim()||'';
    const speed=document.getElementById('scrollSpeedDisplay')?.textContent?.trim()||'';
    const packet={v:1,kind:'state',id,playing:label==='⏸',speed,mode,at:Date.now()};
    try{channel?.postMessage(packet);}catch(_){}
    try{localStorage.setItem(STORAGE,JSON.stringify(packet));}catch(_){}
  };
  const receive=packet=>{
    if(!packet||packet.v!==1||packet.kind!=='command'||!valid.has(packet.action)||typeof packet.id!=='string'||packet.id.length>80)return;
    if(seen.has(packet.id))return;
    seen.add(packet.id);
    if(seen.size>60)seen.clear();
    try {
      switch(packet.action){
        case 'toggle':
          if(mode==='running'&&typeof toggleAutoScroll==='function')toggleAutoScroll();
          break;
        case 'instrumental':
          if(mode==='running')applyMode('instrumental');
          else if(mode==='instrumental')applyMode('running');
          break;
        case 'song':
          if(mode==='waiting'||mode==='ended')applyMode('running');
          else applyMode('ended');
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
    channel.onmessage=e=>receive(e.data);
  }catch(_){channel=null;}
  window.addEventListener('storage',e=>{
    if(e.key!==STORAGE||!e.newValue)return;
    try{receive(JSON.parse(e.newValue));}catch(_){}
  });
  // Use song.html's existing Firestore instance; no new project or permissions.
  // An initial persisted command is NOT a fresh press: skip the first snapshot.
  const sharedDb=window.db||(typeof db!=='undefined'?db:null);
  if(sharedDb?.collection){
    try{
      unsubscribeRemote=sharedDb.collection('karaokeControl').doc('liveLyrics')
        .onSnapshot(snapshot=>{
          const packet=snapshot.exists?snapshot.data()?.prompterRemoteCommand:null;
          const id=typeof packet?.id==='string'?packet.id:'';
          if(firstCloudSnapshot){firstCloudSnapshot=false;lastCloudId=id;return;}
          if(!id||id===lastCloudId)return;
          lastCloudId=id;
          receive(packet);
        },error=>console.warn('Prompter cross-device listener failed:',error));
    }catch(error){console.warn('Prompter remote listener unavailable:',error);}
  }
  window.addEventListener('pagehide',()=>{channel?.close();unsubscribeRemote?.();},{once:true});
  // Lets the host remote discover a newly opened or reloaded Prompter.
  state('ready-'+Date.now());
})();
