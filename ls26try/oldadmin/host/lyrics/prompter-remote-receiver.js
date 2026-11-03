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
  let channel=null, unsubscribeRemote=null, firstCloudSnapshot=true, lastCloudId='';
  let mode='idle', feedbackTimer=null;

  const stage=document.createElement('div');
  stage.id='ls26SingerRemoteStage';
  stage.setAttribute('aria-live','polite');
  stage.innerHTML=`
    <div class="ls26-singer-artwork ls26-singer-artwork-preview">
      <img src="song-about-to-begin.jpg" alt="Live Karaoke - song about to begin. Please wait." draggable="false">
      <div class="ls26-singer-song-info">
        <strong id="ls26SingerUpcomingTitle"></strong>
        <span id="ls26SingerUpcomingArtist"></span>
        <small id="ls26SingerUpcomingYear"></small>
      </div>
    </div>
    <div class="ls26-singer-artwork ls26-singer-artwork-idle">
      <img src="waiting-for-next-singer.jpg" alt="Live Karaoke - waiting for next singer." draggable="false">
    </div>
    <div class="ls26-singer-stage-cue"><strong>INSTRUMENTAL</strong><span>(wait for signal)</span></div>`;
  document.body.appendChild(stage);

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
  };
  const stopTimer=()=>{if(feedbackTimer!==null)clearTimeout(feedbackTimer);feedbackTimer=null;};
  const armTimer=()=>{
    stopTimer();
    if(mode==='ended')feedbackTimer=setTimeout(()=>applyMode('idle'),20000);
  };
  const state=id=>{
    const label=document.getElementById('scrollToggleBtn')?.textContent?.trim()||'';
    const speed=document.getElementById('scrollSpeedDisplay')?.textContent?.trim()||'';
    const packet={v:1,kind:'state',id,playing:mode==='running'&&label==='⏸',speed,mode,at:Date.now()};
    try{channel?.postMessage(packet);}catch(_){}
    try{localStorage.setItem(STORAGE,JSON.stringify(packet));}catch(_){}
  };
  const applyMode=next=>{
    if(!['idle','waiting','running','instrumental','ended'].includes(next))return;
    stopTimer();
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
  };

  applyMode('idle');
  window.addEventListener('ls26:prompter-song-changed',event=>{
    // Preload/reload song data silently. Only a fresh SEND LYRICS cue
    // replaces the waiting-for-next-singer artwork.
    if(event.detail?.cue!==true)return;
    updateSong(event.detail||{});
    applyMode('waiting');
    state('song-'+Date.now());
  });
  window.addEventListener('ls26:prompter-feedback-complete',()=>{
    if(mode==='ended'){applyMode('idle');state('feedback-'+Date.now());}
  });
  // The 20-second end-screen timeout is inactivity-based, not a hard
  // deadline. Tapping the rating card or its info dialog restarts it.
  document.addEventListener('pointerdown',event=>{
    if(mode!=='ended')return;
    if(event.target.closest?.('#prompterEndRating,#prompterRatingGuide'))armTimer();
  },true);
  document.addEventListener('keydown',event=>{
    if(mode!=='ended')return;
    if(event.target.closest?.('#prompterEndRating,#prompterRatingGuide'))armTimer();
  },true);

  const receive=packet=>{
    if(!packet||packet.v!==1||packet.kind!=='command'||!valid.has(packet.action)||typeof packet.id!=='string'||packet.id.length>80)return;
    if(seen.has(packet.id))return;
    seen.add(packet.id);if(seen.size>60)seen.clear();
    try{
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
          else if(mode==='running'||mode==='instrumental')applyMode('ended');
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
  if(sharedDb?.collection){
    try{
      unsubscribeRemote=sharedDb.collection('karaokeControl').doc('liveLyrics')
        .onSnapshot(snapshot=>{
          const packet=snapshot.exists?snapshot.data()?.prompterRemoteCommand:null;
          const id=typeof packet?.id==='string'?packet.id:'';
          if(firstCloudSnapshot){firstCloudSnapshot=false;lastCloudId=id;return;}
          if(!id||id===lastCloudId)return;
          lastCloudId=id;receive(packet);
        },error=>console.warn('Prompter cross-device listener failed:',error));
    }catch(error){console.warn('Prompter remote listener unavailable:',error);}
  }
  window.addEventListener('pagehide',()=>{stopTimer();channel?.close();unsubscribeRemote?.();},{once:true});
  state('ready-'+Date.now());
})();