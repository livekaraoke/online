/* LyricView top performance controls. Reuses the existing Singer sync and
 * metronome state; it creates no parallel playback or Firestore state. */
(() => {
  'use strict';
  if(!/\/host\/lyricview\.html$/i.test(String(location.pathname||''))||window.__ls26PerformanceControlCards)return;
  window.__ls26PerformanceControlCards=true;
  const SYNC_KEY='ls26:syncSingerScroll';
  try{if(localStorage.getItem(SYNC_KEY)===null)localStorage.setItem(SYNC_KEY,'true');}catch(_){}
  const $=id=>document.getElementById(id);
  function installStyles(){
    if(document.getElementById('ls26PerformanceControlCardStyles'))return;
    const style=document.createElement('style');style.id='ls26PerformanceControlCardStyles';style.textContent=`
      #guitarTuningCard.host-guitar-tuning-card{width:min(252px,calc(100% - 44px))!important;padding:10px 16px!important}
      .ls26-performance-control-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,252px) minmax(0,1fr);gap:14px;align-items:stretch;width:100%;box-sizing:border-box;margin:12px 0 16px;padding:0 18px}
      .ls26-performance-control-row .host-guitar-tuning-spacer{width:100%!important;height:86px!important;min-width:0!important;margin:0!important;padding:0!important}
      .ls26-performance-control-card{display:grid;align-content:center;gap:8px;min-height:86px;box-sizing:border-box;padding:11px 14px;border:1px solid rgba(43,91,111,.78);border-radius:11px;background:linear-gradient(180deg,rgba(5,32,43,.93),rgba(4,24,33,.93));box-shadow:inset 0 0 0 1px rgba(20,188,226,.04);color:#dcecf1}
      .ls26-performance-control-card>small{color:#20c7e9;font-size:.68rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase}
      .ls26-performance-control-card .ls26-quick-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#d7e7ec;font-size:.78rem;font-weight:800;line-height:1.25;cursor:pointer}
      .ls26-performance-control-card .ls26-quick-toggle input{width:21px;height:21px;accent-color:#16d8ff;flex:0 0 auto}
      .ls26-performance-control-card .ls26-quick-toggle+ .ls26-quick-toggle{padding-top:5px;border-top:1px solid rgba(80,125,143,.26)}
      @media(max-width:760px){.ls26-performance-control-row{grid-template-columns:1fr 1fr;padding-top:82px}.ls26-performance-control-row .host-guitar-tuning-spacer{display:none!important}.ls26-performance-control-card{min-height:78px}}
      @media(max-width:520px){.ls26-performance-control-row{grid-template-columns:1fr;padding-left:10px;padding-right:10px}}
    `;document.head.appendChild(style);
  }
  function syncSingerValue(enabled,notify=true){
    const on=enabled!==false;try{localStorage.setItem(SYNC_KEY,String(on));}catch(_){}
    if($('quickSingerSyncToggle'))$('quickSingerSyncToggle').checked=on;if($('ls26SyncSingerScroll'))$('ls26SyncSingerScroll').checked=on;
    if(notify)window.dispatchEvent(new CustomEvent('ls26:singer-scroll-sync-changed',{detail:{enabled:on,source:'top-card'}}));
  }
  function build(){
    installStyles();const spacer=document.querySelector('.host-guitar-tuning-spacer');if(!spacer||document.getElementById('ls26PerformanceControlRow'))return;
    const row=document.createElement('div');row.id='ls26PerformanceControlRow';row.className='ls26-performance-control-row';row.innerHTML=`
      <section class="ls26-performance-control-card" aria-label="Singer sync controls"><small>SINGER SYNC</small><label class="ls26-quick-toggle"><span>Sync Singer auto-scroll with LyricView</span><input id="quickSingerSyncToggle" type="checkbox"></label></section>
      <div class="host-guitar-tuning-spacer" aria-hidden="true"></div>
      <section class="ls26-performance-control-card" aria-label="Performance metronome controls"><small>PERFORMANCE / METRONOME</small><label class="ls26-quick-toggle"><span>Count-in</span><input id="quickCountInToggle" type="checkbox"></label><label class="ls26-quick-toggle"><span>Visual Beat Flash</span><input id="quickVisualBeatToggle" type="checkbox"></label></section>`;
    spacer.replaceWith(row);
    let sync=true;try{sync=localStorage.getItem(SYNC_KEY)!=='false';}catch(_){}syncSingerValue(sync,false);
    const click=window.LS26Click;
    if($('quickCountInToggle'))$('quickCountInToggle').checked=click?.countInEnabled!==false;
    if($('quickVisualBeatToggle'))$('quickVisualBeatToggle').checked=click?.visualEnabled===true;
    $('quickSingerSyncToggle').onchange=e=>syncSingerValue(e.target.checked,true);
    $('quickCountInToggle').onchange=e=>window.dispatchEvent(new CustomEvent('ls26:count-in-setting-request',{detail:{enabled:e.target.checked,source:'top-card'}}));
    $('quickVisualBeatToggle').onchange=e=>window.dispatchEvent(new CustomEvent('ls26:visual-beat-settings-request',{detail:{visual:e.target.checked,source:'top-card'}}));
    window.addEventListener('ls26:singer-scroll-sync-changed',event=>{if(event.detail?.source==='top-card')return;syncSingerValue(event.detail?.enabled!==false,false);});
    window.addEventListener('ls26:count-in-setting',event=>{if($('quickCountInToggle'))$('quickCountInToggle').checked=event.detail?.enabled!==false;});
    window.addEventListener('ls26:visual-beat-settings',event=>{if(typeof event.detail?.visual==='boolean'&&$('quickVisualBeatToggle'))$('quickVisualBeatToggle').checked=event.detail.visual;});
    window.addEventListener('storage',event=>{if(event.key===SYNC_KEY)syncSingerValue(event.newValue!=='false',false);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(build,0),{once:true});else setTimeout(build,0);
})();
