/* Copyright © 2026 LiveSuite. All rights reserved.
 * Performance action strip, Song Info BPM controls, sticky metadata release,
 * and legacy admin handoff. This module performs no database writes.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  function setup(){
    const stack=$('hostStickyStack');if(!stack)return;
    const header=$('ls26StickyHeader'),title=stack.querySelector('.host-view-topbar');
    const editAction=$('quickEditSongBtn');
    const infoAction=$('songInfoBtn');
    title.querySelector('.ls26-actions')?.remove();
    if(infoAction)infoAction.hidden=false;
    header.append(title);
    const drawer=$('songInfoDrawer');
    const karaoke=$('performanceQuickInfo'),toggle=document.createElement('label');toggle.className='ls26-karaoke-toggle';toggle.innerHTML='<input type="checkbox" id="ls26ShowKaraoke"> Show karaoke tools';drawer.querySelector('.song-info-scroll').prepend(toggle);
    const hide=document.createElement('button');hide.type='button';hide.className='ls26-hide-karaoke';hide.textContent='×';hide.setAttribute('aria-label','Hide karaoke tools');karaoke.querySelector('.performance-quick-karaoke').append(hide);
    function showKaraoke(show){karaoke.hidden=!show;$('ls26ShowKaraoke').checked=show;try{localStorage.setItem('ls26:showKaraokeTools',String(show));}catch(_){}}
    let show=true;try{show=localStorage.getItem('ls26:showKaraokeTools')!=='false';}catch(_){}showKaraoke(show);
    hide.onclick=()=>showKaraoke(false);$('ls26ShowKaraoke').onchange=e=>showKaraoke(e.target.checked);

    const panel=document.createElement('section');panel.className='song-info-card ls26-bpm-panel';panel.innerHTML=`
      <div class="ls26-bpm-panel-head">
        <div><small>PERFORMANCE TEMPO</small><strong>Current BPM</strong></div>
        <span class="ls26-bpm-live-label">LIVE</span>
      </div>
      <div class="ls26-stepper ls26-bpm-stepper">
        <button id="ls26BpmMinus" aria-label="Lower BPM">−</button>
        <label class="ls26-bpm-current-value" for="ls26CurrentBpm">
          <input id="ls26CurrentBpm" aria-label="Current BPM" type="number" min="1" max="400">
          <small>BPM</small>
        </label>
        <button id="ls26BpmPlus" aria-label="Raise BPM">＋</button>
      </div>
      <div class="ls26-bpm-original-row"><span>Original BPM</span><strong id="ls26OriginalBpm">—</strong></div>
      <button id="ls26ResetBpm" type="button">↻ RESET TO ORIGINAL</button>`;
    drawer.querySelector('.song-info-scroll').prepend(panel);
    function sync(){const song=window.LS26Performance?.song();if(!song)return;$('ls26CurrentBpm').value=song.userBpm||song.originalBpm||96;$('ls26OriginalBpm').textContent=song.originalBpm||'—';$('ls26ResetBpm').disabled=!(Number(song.originalBpm)>0);}
    function close(){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');infoAction?.setAttribute('aria-expanded','false');}
    close();
    if(infoAction){
      infoAction.setAttribute('aria-controls','songInfoDrawer');
      infoAction.onclick=()=>{if(drawer.classList.contains('open')){close();return;}drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');infoAction.setAttribute('aria-expanded','true');sync();};
    }
    if(editAction)editAction.onclick=()=>$('editSongBtn').click();
    $('ls26CurrentBpm').onchange=e=>{window.LS26Performance?.setBpm(e.target.value);sync();};
    $('ls26BpmMinus').onclick=()=>{window.LS26Performance?.setBpm(Number($('ls26CurrentBpm').value)-1);sync();};$('ls26BpmPlus').onclick=()=>{window.LS26Performance?.setBpm(Number($('ls26CurrentBpm').value)+1);sync();};
    $('ls26ResetBpm').onclick=()=>{const song=window.LS26Performance?.song();if(Number(song?.originalBpm)>0)LS26Performance.setBpm(song.originalBpm);sync();};

    function measure(){const h=header?.getBoundingClientRect().height||0;document.documentElement.style.setProperty('--ls-stack-h',h+'px');document.documentElement.style.setProperty('--ls-drawer-top',(h+6)+'px');const dock=document.querySelector('.host-bottom-dock'),height=dock?.getBoundingClientRect().height||100;document.documentElement.style.setProperty('--ls-dock-h',height+'px');document.documentElement.style.setProperty('--ls-drawer-bottom',Math.max(12,innerHeight-(dock?.getBoundingClientRect().top||innerHeight)+12)+'px');}
    new MutationObserver(()=>{infoAction?.setAttribute('aria-expanded',String(drawer.classList.contains('open')));measure();}).observe(drawer,{attributes:true,attributeFilter:['class']});
    const observer=new ResizeObserver(measure);observer.observe(stack);if(header)observer.observe(header);const dock=document.querySelector(".host-bottom-dock");if(dock)observer.observe(dock);window.addEventListener("resize",measure);measure();
    window.addEventListener('ls26:song-ready',()=>{close();sync();sticky();});
    window.addEventListener('ls26:song-started',()=>{$('closeSongInfoBtn').click();});
    let frame;
    function sticky(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const sections=window.LS26Performance?.sections()||[],quick=$('performanceQuickInfo');if(!quick||sections.length<2)return;const threshold=sections[1].getBoundingClientRect().top+scrollY-(header?.getBoundingClientRect().height||0)-24;quick.classList.toggle('ls26-released',scrollY>=threshold);});}
    window.addEventListener('scroll',sticky,{passive:true});
  }
  function adminHandoff(){
    const id=new URLSearchParams(location.search).get('endSession');if(!id||!location.pathname.endsWith('/admin.html'))return;
    let done=false;
    const observer=new MutationObserver(()=>{
      if(done||!window.LK?.state?.currentSessionId||!window.confirmEndPerformance)return;
      done=true;observer.disconnect();
      if(LK.state.currentSessionId!==id){LS26.toast('The active session changed. Review it before ending.');return;}
      window.confirmEndPerformance();
    });observer.observe(document.body,{subtree:true,childList:true,attributes:true});
  }
  document.addEventListener('DOMContentLoaded',()=>{setup();adminHandoff();});
})();
