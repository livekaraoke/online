/* Singer Screen response polish: faster same-device focus/scroll and section-title positioning. */
(() => {
  'use strict';
  if (!/\/host\/karaoke-lyric-view\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerScreenPolish) return;
  window.__ls26SingerScreenPolish = true;

  const CHANNEL = 'ls26-singer-live-v3';
  const read = (key,fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } };
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

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
    `;
    document.head.appendChild(style);
  }

  function sectionTitleX() {
    const mode = String(read('ls26:singerSectionTitleAlign','left')).toLowerCase();
    if (mode === 'center') return 50;
    if (mode === 'right') return 100;
    if (mode === 'custom') return clamp(Number(read('ls26:singerSectionTitleX','0')) || 0,0,100);
    return 0;
  }

  function applyTitlePosition() {
    installStyles();
    const x = sectionTitleX();
    const root = document.documentElement.style;
    root.setProperty('--ls26-singer-section-title-left',`${x}%`);
    root.setProperty('--ls26-singer-section-title-shift',`${-x}%`);
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

  function fastFocus(line) {
    if (!line) return;
    const lines = currentLines();
    const index = lines.indexOf(line);
    if (index < 0) return;
    lines.forEach((item,i) => {
      const distance = Math.abs(i-index);
      item.classList.toggle('is-current',distance === 0);
      item.classList.toggle('is-context',distance === 1 || distance === 2);
      item.classList.toggle('is-muted',distance > 2);
    });
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
    if (!state || state.phase !== 'playing' || !state.sync) return;
    const key = `${state.songId || ''}:${state.sync.sourceIndex}:${state.sync.currentLyricLineIndex}`;
    const line = findLine(state.sync);
    if (!line) return;
    fastFocus(line);
    if (key !== lastKey) {
      lastKey = key;
      requestAnimationFrame(() => nudge(line));
    }
  }

  function observeBuiltInFocus() {
    const root = document.getElementById('ls26SingerV31Lyrics');
    if (!root) return;
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') continue;
        const node = mutation.target;
        if (node?.classList?.contains('ls26-singer-v31-line') && node.classList.contains('is-current')) {
          requestAnimationFrame(() => nudge(node));
          break;
        }
      }
    });
    observer.observe(root,{subtree:true,attributes:true,attributeFilter:['class']});
  }

  function init() {
    installStyles();
    applyTitlePosition();
    observeBuiltInFocus();
    window.addEventListener('ls26:prompter-settings',applyTitlePosition);
    window.addEventListener('storage',event => {
      if (event.key === 'ls26:singerSectionTitleAlign' || event.key === 'ls26:singerSectionTitleX') applyTitlePosition();
    });
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = event => { if (event.data?.type === 'state') applyState(event.data.state); };
      window.addEventListener('pagehide',() => channel.close(),{once:true});
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
