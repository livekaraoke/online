/* LyricView metronome settings, moved into More Settings & Details.
 * Reuses the existing LS26Click state/events, with no separate playback state. */
(() => {
  'use strict';
  if(!/\/host\/lyricview(?:\.html)?\/?$/i.test(String(location.pathname||''))||window.__ls26PerformanceControlCards)return;
  window.__ls26PerformanceControlCards=true;
  const $=id=>document.getElementById(id);
  function build(){
    const container=$('performanceMoreDetailsCard')?.querySelector('.performance-more-details-content');
    if(!container||$('ls26MetronomeCard'))return;
    const style=document.createElement('style');
    style.id='ls26MetronomeCardStyles';
    style.textContent=`
      #guitarTuningCard.host-guitar-tuning-card{width:min(252px,calc(100% - 44px))!important;padding:10px 16px!important}
      .host-lyric-view-page #ls26MetronomeCard{
        flex:0 1 310px;width:min(310px,100%);min-height:90px;
        box-sizing:border-box;display:grid;align-content:center;gap:9px;
        padding:11px 14px;border:1px solid rgba(43,91,111,.78);
        border-radius:11px;background:linear-gradient(180deg,rgba(5,32,43,.93),rgba(4,24,33,.93));
        color:#dcecf1;
      }
      #ls26MetronomeCard>small{color:#20c7e9;font-size:.68rem;font-weight:900;letter-spacing:.11em}
      #ls26MetronomeCard .ls26-quick-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#d7e7ec;font-size:.78rem;font-weight:800;line-height:1.25;cursor:pointer}
      #ls26MetronomeCard .ls26-quick-toggle input{width:22px;height:22px;accent-color:#16d8ff;flex:0 0 auto}
      #ls26MetronomeCard .ls26-quick-toggle+.ls26-quick-toggle{padding-top:6px;border-top:1px solid rgba(80,125,143,.26)}
    `;
    document.head.appendChild(style);
    const card=document.createElement('section');
    card.id='ls26MetronomeCard';
    card.setAttribute('aria-label','Metronome controls');
    card.innerHTML='<small>METRONOME</small><label class="ls26-quick-toggle"><span>Count-in</span><input id="quickCountInToggle" type="checkbox"></label><label class="ls26-quick-toggle"><span>Visual Beat Flash</span><input id="quickVisualBeatToggle" type="checkbox"></label>';
    container.append(card);
    const click=window.LS26Click;
    $('quickCountInToggle').checked=click?.countInEnabled!==false;
    $('quickVisualBeatToggle').checked=click?.visualEnabled===true;
    $('quickCountInToggle').onchange=e=>window.dispatchEvent(new CustomEvent('ls26:count-in-setting-request',{detail:{enabled:e.target.checked,source:'metronome-card'}}));
    $('quickVisualBeatToggle').onchange=e=>window.dispatchEvent(new CustomEvent('ls26:visual-beat-settings-request',{detail:{visual:e.target.checked,source:'metronome-card'}}));
    window.addEventListener('ls26:count-in-setting',event=>{$('quickCountInToggle').checked=event.detail?.enabled!==false;});
    window.addEventListener('ls26:visual-beat-settings',event=>{if(typeof event.detail?.visual==='boolean')$('quickVisualBeatToggle').checked=event.detail.visual;});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(build,0),{once:true});else setTimeout(build,0);
})();
