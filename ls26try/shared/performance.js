/* Copyright © 2026 LiveSuite. All rights reserved.
 * Performance action strip, default Transpose drawer, sticky metadata release,
 * and legacy admin handoff. This module performs no database writes.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  function setup(){
    const stack=$('hostStickyStack');if(!stack)return;
    const header=$('ls26StickyHeader'),title=stack.querySelector('.host-view-topbar');
    const row=document.createElement('div');row.className='ls26-actions';row.innerHTML='<button id="ls26PlaySong">▶ PLAY SONG</button><button id="ls26EditSong">✎ EDIT SONG</button><button id="ls26SongInfo">ⓘ SONG INFO</button><button id="ls26Transpose">↕ TRANSPOSE</button>';
    title.append(row);$('songInfoBtn').hidden=true;
    const drawer=$('songInfoDrawer');
    const trans=[...drawer.querySelectorAll('.song-info-card')].find(x=>x.querySelector('h3')?.textContent==='TRANSPOSE');trans?.classList.add('ls26-transpose-card');
    const panel=document.createElement('section');panel.className='ls26-transpose-panel';panel.innerHTML=`<label>Original key<strong id="ls26OriginalKey">—</strong></label><label>Current key<strong id="ls26CurrentKey">—</strong></label><div class="ls26-stepper"><button id="ls26ShiftMinus" aria-label="Transpose down">−</button><strong id="ls26Shift">0</strong><button id="ls26ShiftPlus" aria-label="Transpose up">＋</button></div><small class="ls26-semitones">Semitones</small><label class="ls26-check"><input id="ls26ChordsCheck" type="checkbox" checked> Transpose chords</label><label class="ls26-check"><input id="ls26TabsCheck" type="checkbox" checked> Transpose guitar tabs</label><hr><label>Current BPM</label><div class="ls26-stepper"><button id="ls26BpmMinus" aria-label="Lower BPM">−</button><input id="ls26CurrentBpm" aria-label="Current BPM" type="number" min="1" max="400"><button id="ls26BpmPlus" aria-label="Raise BPM">＋</button></div><p>Original BPM <strong id="ls26OriginalBpm">—</strong></p><button id="ls26ResetTranspose">↻ Reset</button><small>Closes when song starts</small>`;
    drawer.querySelector('.song-info-scroll').prepend(panel);
    function sync(){const song=window.LS26Performance?.song();if(!song)return;const shift=Number($('chordTransposeValue').textContent)||0;$('ls26OriginalKey').textContent=song.key||'—';$('ls26CurrentKey').textContent=song.key?LyricsCommon.transposeChordText(song.key,shift):'—';$('ls26Shift').textContent=shift;$('ls26CurrentBpm').value=song.userBpm||song.originalBpm||96;$('ls26OriginalBpm').textContent=song.originalBpm||'—';}
    function open(kind){const wasOpen=drawer.classList.contains('open'),same=drawer.classList.contains('ls26-transpose-only')===(kind==='transpose');if(wasOpen&&same){$('closeSongInfoBtn').click();return;}drawer.classList.toggle('ls26-transpose-only',kind==='transpose');drawer.querySelector('.song-info-head strong').textContent=kind==='transpose'?'TRANSPOSE':'SONG INFO';drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');sync();}
    $('ls26Transpose').onclick=()=>open('transpose');$('ls26SongInfo').onclick=()=>open('info');$('ls26PlaySong').onclick=()=>window.LS26Performance?.play();$('ls26EditSong').onclick=()=>$('editSongBtn').click();
    function shift(delta){if($('ls26ChordsCheck').checked)$(delta>0?'chordPlus':'chordMinus').click();if($('ls26TabsCheck').checked)$(delta>0?'tabPlus':'tabMinus').click();sync();}
    $('ls26ShiftMinus').onclick=()=>shift(-1);$('ls26ShiftPlus').onclick=()=>shift(1);
    $('ls26CurrentBpm').onchange=e=>{window.LS26Performance?.setBpm(e.target.value);sync();};
    $('ls26BpmMinus').onclick=()=>{window.LS26Performance?.setBpm(Number($('ls26CurrentBpm').value)-1);sync();};$('ls26BpmPlus').onclick=()=>{window.LS26Performance?.setBpm(Number($('ls26CurrentBpm').value)+1);sync();};
    $('ls26ResetTranspose').onclick=()=>{['chord','tab'].forEach(kind=>{const value=Number($(kind+'TransposeValue').textContent)||0;for(let i=0;i<Math.abs(value);i++)$(kind+(value>0?'Minus':'Plus')).click();});const song=LS26Performance.song();if(Number(song.originalBpm)>0)LS26Performance.setBpm(song.originalBpm);sync();};
    $('ls26PrevSection').onclick=()=>$('navPrevBtn').click();$('ls26NextSection').onclick=()=>$('navNextBtn').click();
    function measure(){const h=header?.getBoundingClientRect().height||0;document.documentElement.style.setProperty('--ls-stack-h',h+'px');document.documentElement.style.setProperty('--ls-drawer-top',(h+title.getBoundingClientRect().height+12)+'px');const dock=document.querySelector('.host-bottom-dock');document.documentElement.style.setProperty('--ls-dock-h',(dock?.getBoundingClientRect().height||100)+'px');}
    new MutationObserver(()=>{document.body.classList.toggle('ls26-drawer-open',drawer.classList.contains('open'));measure();}).observe(drawer,{attributes:true,attributeFilter:['class']});
    const observer=new ResizeObserver(measure);observer.observe(stack);if(header)observer.observe(header);measure();
    window.addEventListener('ls26:song-ready',()=>{drawer.classList.remove('open');open('transpose');if(new URLSearchParams(location.search).get('play')==='1')LS26Performance.play();sticky();});
    window.addEventListener('ls26:song-started',()=>{$('closeSongInfoBtn').click();});
    let frame;
    function sticky(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const sections=window.LS26Performance?.sections()||[],quick=$('performanceQuickInfo');if(!quick||sections.length<2)return;const threshold=sections[1].getBoundingClientRect().top+scrollY-(header?.getBoundingClientRect().height||0);quick.classList.toggle('ls26-released',scrollY>=threshold);});}
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
