/* Copyright © 2026 LiveSuite. All rights reserved.
 * Performance action strip, default Transpose drawer, sticky metadata release,
 * and legacy admin handoff. This module performs no database writes.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  function setup(){
    const stack=$('hostStickyStack');if(!stack)return;
    const row=document.createElement('div');row.className='ls26-actions';row.innerHTML='<button id="ls26PlaySong">▶ PLAY SONG</button><button id="ls26EditSong">✎ EDIT SONG</button><button id="ls26SongInfo">ⓘ SONG INFO</button><button id="ls26Transpose">↕ TRANSPOSE</button>';
    const title=stack.querySelector('.host-view-topbar');title.before(row);
    $('songInfoBtn').hidden=true;
    const drawer=$('songInfoDrawer');
    const trans=[...drawer.querySelectorAll('.song-info-card')].find(x=>x.querySelector('h3')?.textContent==='TRANSPOSE');trans?.classList.add('ls26-transpose-card');
    const bpm=document.createElement('section');bpm.className='song-info-card ls26-bpm-card';bpm.innerHTML='<h3>CURRENT BPM</h3><label><input id="ls26CurrentBpm" type="number" min="1" max="400" step="1" aria-label="Current BPM"></label><small>Performance setting · original BPM retained</small>';trans?.after(bpm);
    function open(kind){const wasOpen=drawer.classList.contains('open'),wasTranspose=drawer.classList.contains('ls26-transpose-only');if(wasOpen&&wasTranspose===(kind==='transpose')){$('closeSongInfoBtn').click();return;}drawer.classList.toggle('ls26-transpose-only',kind==='transpose');drawer.querySelector('.song-info-head strong').textContent=kind==='transpose'?'TRANSPOSE':'SONG INFO';drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');}
    $('ls26Transpose').onclick=()=>open('transpose');$('ls26SongInfo').onclick=()=>open('info');$('ls26PlaySong').onclick=()=>window.LS26Performance?.play();$('ls26EditSong').onclick=()=>$('editSongBtn').click();
    $('ls26CurrentBpm').onchange=e=>LS26Performance?.setBpm(e.target.value);
    $('ls26PrevSection').onclick=()=>$('navPrevBtn').click();$('ls26NextSection').onclick=()=>$('navNextBtn').click();
    window.addEventListener('ls26:song-ready',()=>{
      const song=LS26Performance.song();$('ls26CurrentBpm').value=song.userBpm||song.originalBpm||96;
      drawer.classList.remove('open');open('transpose');
      if(new URLSearchParams(location.search).get('play')==='1')LS26Performance.play();
      sticky();
    });
    window.addEventListener('ls26:song-started',()=>{$('closeSongInfoBtn').click();});
    const observer=new ResizeObserver(()=>{document.documentElement.style.setProperty('--ls-stack-h',stack.getBoundingClientRect().height+'px');const dock=document.querySelector('.host-bottom-dock');document.documentElement.style.setProperty('--ls-dock-h',(dock?.getBoundingClientRect().height||100)+'px');});observer.observe(stack);
    let frame;
    function sticky(){
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        const sections=window.LS26Performance?.sections()||[],quick=$('performanceQuickInfo');if(!quick||sections.length<2)return;
        // Compare document coordinates to avoid a threshold oscillation when the
        // sticky block releases. The block remains in normal document flow.
        const threshold=sections[1].getBoundingClientRect().top+scrollY-stack.getBoundingClientRect().height;
        quick.classList.toggle('ls26-released',scrollY>=threshold);
      });
    }
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
