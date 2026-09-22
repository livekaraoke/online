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
    const row=document.createElement('div');row.className='ls26-actions';row.innerHTML='<button id="ls26PlaySong">▶ PLAY SONG</button><button id="ls26EditSong">✎ EDIT SONG</button><button id="ls26SongInfo">ⓘ SONG INFO</button>';
    title.append(row);$('songInfoBtn').hidden=true;header.append(title);
    const drawer=$('songInfoDrawer');
    const panel=document.createElement('section');panel.className='song-info-card ls26-bpm-panel';panel.innerHTML=`<label for="ls26CurrentBpm">Current BPM</label><div class="ls26-stepper"><button id="ls26BpmMinus" aria-label="Lower BPM">−</button><input id="ls26CurrentBpm" aria-label="Current BPM" type="number" min="1" max="400"><button id="ls26BpmPlus" aria-label="Raise BPM">＋</button></div><p>Original BPM <strong id="ls26OriginalBpm">—</strong></p><button id="ls26ResetBpm">↻ Reset</button>`;
    drawer.querySelector('.song-info-scroll').prepend(panel);
    function sync(){const song=window.LS26Performance?.song();if(!song)return;$('ls26CurrentBpm').value=song.userBpm||song.originalBpm||96;$('ls26OriginalBpm').textContent=song.originalBpm||'—';$('ls26ResetBpm').disabled=!(Number(song.originalBpm)>0);}
    function close(){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');$('ls26SongInfo').setAttribute('aria-expanded','false');}
    close();$('ls26SongInfo').setAttribute('aria-controls','songInfoDrawer');
    $('ls26SongInfo').onclick=()=>{if(drawer.classList.contains('open')){close();return;}drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');$('ls26SongInfo').setAttribute('aria-expanded','true');sync();};
    $('ls26PlaySong').onclick=()=>window.LS26Performance?.play();$('ls26EditSong').onclick=()=>$('editSongBtn').click();
    $('ls26CurrentBpm').onchange=e=>{window.LS26Performance?.setBpm(e.target.value);sync();};
    $('ls26BpmMinus').onclick=()=>{window.LS26Performance?.setBpm(Number($('ls26CurrentBpm').value)-1);sync();};$('ls26BpmPlus').onclick=()=>{window.LS26Performance?.setBpm(Number($('ls26CurrentBpm').value)+1);sync();};
    $('ls26ResetBpm').onclick=()=>{const song=window.LS26Performance?.song();if(Number(song?.originalBpm)>0)LS26Performance.setBpm(song.originalBpm);sync();};

    function measure(){const h=header?.getBoundingClientRect().height||0;document.documentElement.style.setProperty('--ls-stack-h',h+'px');document.documentElement.style.setProperty('--ls-drawer-top',(h+6)+'px');const dock=document.querySelector('.host-bottom-dock'),height=dock?.getBoundingClientRect().height||100;document.documentElement.style.setProperty('--ls-dock-h',height+'px');document.documentElement.style.setProperty('--ls-drawer-bottom',Math.max(12,innerHeight-(dock?.getBoundingClientRect().top||innerHeight)+12)+'px');}
    new MutationObserver(()=>{$('ls26SongInfo').setAttribute('aria-expanded',String(drawer.classList.contains('open')));measure();}).observe(drawer,{attributes:true,attributeFilter:['class']});
    const observer=new ResizeObserver(measure);observer.observe(stack);if(header)observer.observe(header);const dock=document.querySelector(".host-bottom-dock");if(dock)observer.observe(dock);window.addEventListener("resize",measure);measure();
    window.addEventListener('ls26:song-ready',()=>{close();sync();if(new URLSearchParams(location.search).get('play')==='1')LS26Performance.play();sticky();});
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
