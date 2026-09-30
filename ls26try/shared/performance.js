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
    const karaoke=$('performanceQuickInfo');
    const karaokeCard=$('sendToKaraokeBtn')?.closest('.song-info-card');
    const karaokePreferences=document.createElement('div');
    karaokePreferences.className='ls26-karaoke-preferences';
    karaokePreferences.innerHTML=`
      <button id="ls26AutoSendKaraoke" class="ls26-auto-send-karaoke" type="button" aria-pressed="true">
        <span>AUTO SEND TO KARAOKE ON PLAY</span>
        <strong id="ls26AutoSendKaraokeState">ON</strong>
      </button>
      <label class="ls26-karaoke-toggle"><input type="checkbox" id="ls26SyncSingerScroll"> Sync singer auto-scroll with LyricView</label>
      <label class="ls26-karaoke-toggle"><input type="checkbox" id="ls26ShowKaraoke"> Show karaoke tools</label>`;
    const karaokeHeading=karaokeCard?.querySelector('h3');
    if(karaokeHeading)karaokeHeading.insertAdjacentElement('afterend',karaokePreferences);
    else drawer.querySelector('.song-info-scroll').prepend(karaokePreferences);

    const hide=document.createElement('button');hide.type='button';hide.className='ls26-hide-karaoke';hide.textContent='×';hide.setAttribute('aria-label','Hide karaoke tools');karaoke.querySelector('.performance-quick-karaoke').append(hide);
    function showKaraoke(show){karaoke.hidden=!show;$('ls26ShowKaraoke').checked=show;try{localStorage.setItem('ls26:showKaraokeTools',String(show));}catch(_){}}
    let show=true;try{show=localStorage.getItem('ls26:showKaraokeTools')!=='false';}catch(_){}showKaraoke(show);
    hide.onclick=()=>showKaraoke(false);$('ls26ShowKaraoke').onchange=e=>showKaraoke(e.target.checked);

    const autoSendButton=$('ls26AutoSendKaraoke');
    const autoSendState=$('ls26AutoSendKaraokeState');
    const autoSendKey='ls26:autoSendToKaraoke';
    function setAutoSend(enabled){
      const on=enabled!==false;
      autoSendButton?.setAttribute('aria-pressed',String(on));
      autoSendButton?.classList.toggle('active',on);
      if(autoSendState)autoSendState.textContent=on?'ON':'OFF';
      try{localStorage.setItem(autoSendKey,String(on));}catch(_){}
    }
    let autoSend=true;try{autoSend=localStorage.getItem(autoSendKey)!=='false';}catch(_){}setAutoSend(autoSend);
    if(autoSendButton)autoSendButton.onclick=()=>setAutoSend(autoSendButton.getAttribute('aria-pressed')!=='true');

    const singerSyncToggle=$('ls26SyncSingerScroll');
    const singerSyncKey='ls26:syncSingerScroll';
    function setSingerSync(enabled, notify=false){
      const on=enabled===true;
      if(singerSyncToggle)singerSyncToggle.checked=on;
      try{localStorage.setItem(singerSyncKey,String(on));}catch(_){}
      if(notify){
        window.dispatchEvent(new CustomEvent('ls26:singer-scroll-sync-changed',{detail:{enabled:on}}));
      }
    }
    let singerSync=false;try{singerSync=localStorage.getItem(singerSyncKey)==='true';}catch(_){}setSingerSync(singerSync);
    if(singerSyncToggle)singerSyncToggle.onchange=e=>setSingerSync(e.target.checked,true);

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
      <label class="ls26-bpm-nav-toggle"><input id="ls26ShowNavBpm" type="checkbox"> Show current BPM between navigation arrows</label>
      <button id="ls26ResetBpm" type="button">↻ RESET TO ORIGINAL</button>`;
    drawer.querySelector('.song-info-scroll').prepend(panel);
    function sync(){
      const song=window.LS26Performance?.song();if(!song)return;
      const current=window.LS26Performance.getBpm();
      $('ls26CurrentBpm').value=current;
      $('ls26OriginalBpm').textContent=song.originalBpm||'—';
      $('ls26ResetBpm').disabled=!(Number(song.originalBpm)>0);
      const navValue=$('navCurrentBpmValue');if(navValue)navValue.textContent=current||'—';
    }
    const navBpmLabel=$('navCurrentBpmLabel');
    function showNavBpm(show){
      if(navBpmLabel)navBpmLabel.hidden=!show;
      if($('ls26ShowNavBpm'))$('ls26ShowNavBpm').checked=show;
      try{localStorage.setItem('ls26:showNavCurrentBpm',String(show));}catch(_){}
    }
    let showNavBpmPreference=true;
    try{showNavBpmPreference=localStorage.getItem('ls26:showNavCurrentBpm')!=='false';}catch(_){}
    showNavBpm(showNavBpmPreference);
    $('ls26ShowNavBpm').onchange=e=>showNavBpm(e.target.checked);
    function close(){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');infoAction?.setAttribute('aria-expanded','false');}
    const startup=document.createElement('label');startup.className='ls26-info-startup';startup.innerHTML='<input id="ls26InfoStartup" type="checkbox"> Open on LyricView startup';drawer.querySelector('.song-info-scroll').append(startup);
    const preferenceKey='ls26:infoOpenOnStartup';
    try{$('ls26InfoStartup').checked=localStorage.getItem(preferenceKey)==='true';}catch(_){}
    $('ls26InfoStartup').onchange=e=>{try{localStorage.setItem(preferenceKey,String(e.target.checked));}catch(_){}};
    function applyStartup(){const open=$('ls26InfoStartup').checked;drawer.classList.toggle('open',open);drawer.setAttribute('aria-hidden',String(!open));infoAction?.setAttribute('aria-expanded',String(open));infoAction?.classList.toggle('active',open);sync();}
    const metro=document.createElement('section');metro.className='song-info-card lv-metronome';panel.after(metro);window.LS26LyricMetronome?.mount(metro);
    applyStartup();
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
    window.addEventListener('ls26:song-ready',()=>{applyStartup();sticky();});
    window.addEventListener('ls26:tempo-changed',sync);
    window.addEventListener('ls26:song-started',()=>{if(!$('ls26InfoStartup').checked)$('closeSongInfoBtn').click();});
    let frame;
    function sticky(){
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const quick=$('performanceQuickInfo');
        if(!quick)return;
        quick.classList.remove('ls26-released');
      });
    }
    window.addEventListener('scroll',sticky,{passive:true});
  }
  function adminHandoff(){
    const id=new URLSearchParams(location.search).get('endSession');if(!id||!location.pathname.endsWith('/admin.html'))return;
    let done=false,attempts=0,timer=null,observer=null;
    const finish=()=>{
      if(timer)clearInterval(timer);
      observer?.disconnect();
    };
    const attempt=()=>{
      if(done)return;
      attempts++;
      const activeId=window.LK?.state?.currentSessionId||"";
      if(activeId&&typeof window.confirmEndPerformance==="function"){
        done=true;finish();
        if(activeId!==id){LS26.toast('The active session changed. Review it before ending.');return;}
        window.confirmEndPerformance();
        return;
      }
      if(attempts>=40)finish();
    };
    observer=new MutationObserver(attempt);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true});
    timer=setInterval(attempt,250);
    attempt();
  }
  document.addEventListener('DOMContentLoaded',()=>{setup();adminHandoff();});
})();
