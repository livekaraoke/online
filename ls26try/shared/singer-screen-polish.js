/* Singer Screen response polish: fast focus, gradual lyric falloff, cue styling and title positioning. */
(() => {
  'use strict';
  if (!/\/host\/karaoke-lyric-view\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerScreenPolish) return;
  window.__ls26SingerScreenPolish = true;

  const CHANNEL = 'ls26-singer-live-v3';
  const read = (key,fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } };
  const num = (key,fallback,min,max) => Math.max(min,Math.min(max,Number(read(key,fallback)) || fallback));
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  let applyingFastFocus = false;

  function installStyles() {
    if (document.getElementById('ls26SingerScreenPolishStyles')) return;
    const style = document.createElement('style');
    style.id = 'ls26SingerScreenPolishStyles';
    style.textContent = `
      #ls26SingerV31Lyrics .ls26-singer-v31-section h2{
        position:relative;
        left:var(--ls26-singer-section-title-left,0%);
        transform:translateX(var(--ls26-singer-section-title-shift,0%));
        width:max-content;
        max-width:100%;
        box-sizing:border-box;
      }
      #ls26SingerV31Lyrics .ls26-singer-v31-line[data-ls26-gradient="1"]{
        font-size:var(--ls26-gradual-size,1em)!important;
        opacity:var(--ls26-gradual-opacity,1)!important;
        filter:none!important;
        transition:opacity .18s ease,font-size .18s ease,background-color .15s ease!important;
      }
      #ls26SingerV31Lyrics .ls26-singer-performance-cue.ls26-performance-note{
        display:block!important;
        width:100%!important;
        max-width:100%!important;
        box-sizing:border-box!important;
        margin:18px auto 26px!important;
        padding:4px 16px!important;
        border:0!important;
        background:transparent!important;
        color:var(--ls26-singer-performance-note-colour,#75f2a0)!important;
        font-size:var(--ls26-singer-performance-note-size,24px)!important;
        font-weight:950!important;
        line-height:1.2!important;
        letter-spacing:.025em!important;
        text-align:center!important;
        text-transform:none!important;
      }
      #ls26SingerV31Lyrics .ls26-singer-v31-section.ls26-performance-note-only>h2{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function applyTitlePosition() {
    installStyles();
    const mode = String(read('ls26:singerSectionTitleAlign','left')).toLowerCase();
    const raw = clamp(Number(read('ls26:singerSectionTitleX','0')) || 0,-20,100);
    const root = document.documentElement.style;
    if (mode === 'center') {
      root.setProperty('--ls26-singer-section-title-left','50%');root.setProperty('--ls26-singer-section-title-shift','-50%');
    } else if (mode === 'right') {
      root.setProperty('--ls26-singer-section-title-left','100%');root.setProperty('--ls26-singer-section-title-shift','-100%');
    } else if (mode === 'custom' && raw < 0) {
      root.setProperty('--ls26-singer-section-title-left',`${raw}px`);root.setProperty('--ls26-singer-section-title-shift','0%');
    } else if (mode === 'custom') {
      root.setProperty('--ls26-singer-section-title-left',`${raw}%`);root.setProperty('--ls26-singer-section-title-shift',`${-raw}%`);
    } else {
      root.setProperty('--ls26-singer-section-title-left','0%');root.setProperty('--ls26-singer-section-title-shift','0%');
    }
  }

  function applyPerformanceNotes() {
    const root=document.getElementById('ls26SingerV31Lyrics');if(!root)return;
    document.documentElement.style.setProperty('--ls26-singer-performance-note-colour',read('ls26:singerPerformanceNoteColour','#75f2a0'));
    document.documentElement.style.setProperty('--ls26-singer-performance-note-size',`${num('ls26:singerPerformanceNoteSize',24,12,48)}px`);
    root.querySelectorAll('.ls26-singer-performance-cue').forEach(cue=>{
      // Explicit performance notes carry inline colour/size from the source mapper;
      // ordinary cues such as [SOLO] do not.
      const explicit=Boolean(cue.style.color||cue.style.fontSize||cue.classList.contains('ls26-performance-note'));
      if(!explicit)return;
      cue.classList.add('ls26-performance-note');
      const section=cue.closest('.ls26-singer-v31-section');
      const heading=section?.querySelector(':scope > h2');
      const title=String(heading?.textContent||'').trim();
      if(!cue.dataset.ls26PerformanceNoteText)cue.dataset.ls26PerformanceNoteText=String(cue.textContent||'').trim();
      const note=cue.dataset.ls26PerformanceNoteText;
      cue.textContent=title?`${title} - (${note})`:`(${note})`;
      if(section){
        const substantive=[...section.querySelectorAll('.ls26-singer-v31-body > *')].filter(node=>node!==cue&&!node.classList.contains('ls26-performance-note'));
        section.classList.toggle('ls26-performance-note-only',substantive.length===0);
      }
    });
  }

  function currentLines() {
    return [...document.querySelectorAll('#ls26SingerV31Lyrics .ls26-singer-v31-line:not(.is-chord-line)')];
  }

  function findLine(sync) {
    const sectionIndex = Number(sync?.sourceIndex);
    const lineIndex = Number(sync?.currentLyricLineIndex);
    if (!Number.isFinite(sectionIndex) || !Number.isFinite(lineIndex) || lineIndex < 0) return null;
    const section = document.querySelector(`#ls26SingerV31Lyrics .ls26-singer-v31-section[data-source-index="${sectionIndex}"]`);
    return section?.querySelector(`.ls26-singer-v31-line[data-source-line-index="${lineIndex}"]:not(.is-chord-line)`) || null;
  }

  function fadeSettings(){
    return {
      current:num('ls26:singerCurrentLineScale',1.72,1,2.5),
      pastSize:num('ls26:singerPastSizeRatio',.88,.5,1),past1:num('ls26:singerPast1Opacity',.70,.05,1),past2:num('ls26:singerPast2Opacity',.40,.05,1),pastFar:num('ls26:singerPastFarOpacity',.20,.02,1),
      next1Size:num('ls26:singerNext1SizeRatio',.95,.5,1),next1:num('ls26:singerNext1Opacity',.90,.05,1),
      next2Size:num('ls26:singerNext2SizeRatio',.90,.5,1),next2:num('ls26:singerNext2Opacity',.86,.05,1),
      nearSize:num('ls26:singerFutureNearSizeRatio',.80,.45,1),near:num('ls26:singerFutureNearOpacity',.80,.02,1),
      midSize:num('ls26:singerFutureMidSizeRatio',.72,.45,1),midStart:num('ls26:singerFutureMidStartOpacity',.60,.02,1),midEnd:num('ls26:singerFutureMidEndOpacity',.40,.02,1),
      farSize:num('ls26:singerFutureFarSizeRatio',.70,.4,1),farStart:num('ls26:singerFutureFarStartOpacity',.20,.02,1),farEnd:num('ls26:singerFutureFarEndOpacity',.05,.02,1)
    };
  }

  function gradientFor(relative,s){
    if(relative===0)return {size:s.current,opacity:1};
    if(relative<0){
      const opacity=relative===-1?s.past1:relative===-2?s.past2:s.pastFar;
      return {size:s.current*s.pastSize,opacity};
    }
    if(relative===1)return {size:s.current*s.next1Size,opacity:s.next1};
    if(relative===2)return {size:s.current*s.next2Size,opacity:s.next2};
    if(relative<=4)return {size:s.current*s.nearSize,opacity:s.near};
    if(relative<=7){const t=(relative-5)/2;return {size:s.current*s.midSize,opacity:s.midStart+(s.midEnd-s.midStart)*t};}
    const t=clamp((relative-8)/5,0,1);return {size:s.current*s.farSize,opacity:s.farStart+(s.farEnd-s.farStart)*t};
  }

  function applyGradient(line) {
    if(!line)return;
    const lines=currentLines(),index=lines.indexOf(line);if(index<0)return;
    const settings=fadeSettings();
    lines.forEach((item,i)=>{
      const relative=i-index,value=gradientFor(relative,settings);
      item.dataset.ls26Gradient='1';
      item.style.setProperty('--ls26-gradual-size',`${Math.max(.45,value.size).toFixed(3)}em`);
      item.style.setProperty('--ls26-gradual-opacity',String(clamp(value.opacity,.02,1)));
    });
  }

  function fastFocus(line) {
    if (!line) return;
    const lines = currentLines();
    const index = lines.indexOf(line);
    if (index < 0) return;
    applyingFastFocus = true;
    try {
      lines.forEach((item,i) => {
        const distance = Math.abs(i-index);
        item.classList.toggle('is-current',distance === 0);
        item.classList.toggle('is-context',distance === 1||distance === 2);
        item.classList.toggle('is-muted',distance > 2);
      });
      applyGradient(line);
    } finally {
      queueMicrotask(() => { applyingFastFocus = false; });
    }
  }

  function autoScrollAllowed() {
    if (read('ls26:singerAutoScroll','true') === 'false') return false;
    const play = document.getElementById('singerPlayBtn');
    if (play && play.textContent.trim() === '▶') return false;
    return true;
  }

  function nudge(line) {
    if (!line || !autoScrollAllowed() || document.hidden) return;
    const topbar = document.querySelector('.singer-topbar');
    const focusPct = clamp((Number(read('ls26:singerFocusPosition','40')) || 40) / 100,.2,.65);
    const anchor = Math.max((topbar?.getBoundingClientRect().bottom || 0) + 44,innerHeight * focusPct);
    const target = line.getBoundingClientRect().top + scrollY - anchor;
    const max = Math.max(0,document.documentElement.scrollHeight - innerHeight);
    const clamped = clamp(target,0,max);
    const delta = clamped - scrollY;
    if (Math.abs(delta) < 12) return;
    const step = clamp(delta * .62,-300,300);
    scrollTo(0,clamp(scrollY + step,0,max));
  }

  let lastKey = '';
  function applyState(state) {
    if (!state || !['playing','paused'].includes(state.phase) || !state.sync) return;
    const key = `${state.songId || ''}:${state.sync.sourceIndex}:${state.sync.currentLyricLineIndex}`;
    const line = findLine(state.sync);
    if (!line) return;
    fastFocus(line);
    applyPerformanceNotes();
    if (state.phase==='playing'&&key !== lastKey) {
      lastKey = key;
      requestAnimationFrame(() => nudge(line));
    }
  }

  function refreshCurrent(){
    applyTitlePosition();applyPerformanceNotes();
    const current=document.querySelector('#ls26SingerV31Lyrics .ls26-singer-v31-line.is-current:not(.is-chord-line)');
    if(current)applyGradient(current);
  }

  function observeBuiltInFocus() {
    const root = document.getElementById('ls26SingerV31Lyrics');
    if (!root) return;
    const observer = new MutationObserver(mutations => {
      let contentChanged=false;
      for (const mutation of mutations) {
        if(mutation.type==='childList')contentChanged=true;
        if (applyingFastFocus||mutation.type !== 'attributes'||mutation.attributeName !== 'class') continue;
        const node = mutation.target;
        if (node?.classList?.contains('ls26-singer-v31-line') && node.classList.contains('is-current')) {
          applyGradient(node);requestAnimationFrame(() => nudge(node));
        }
      }
      if(contentChanged)requestAnimationFrame(()=>{applyPerformanceNotes();const current=root.querySelector('.ls26-singer-v31-line.is-current:not(.is-chord-line)');if(current)applyGradient(current);});
    });
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }

  function init() {
    installStyles();
    refreshCurrent();
    observeBuiltInFocus();
    window.addEventListener('ls26:prompter-settings',refreshCurrent);
    window.addEventListener('storage',event => { if(event.key?.startsWith('ls26:singer'))refreshCurrent(); });
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = event => { if (event.data?.type === 'state') applyState(event.data.state); };
      window.addEventListener('pagehide',() => channel.close(),{once:true});
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
