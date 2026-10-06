/* LiveSuite Singer Screen v3.3 focused fixes.
 * Exact lyric focus correction, five-line performance context, and controls
 * that remain operable throughout preview/count-in/playback/pause states.
 */
(() => {
  'use strict';
  if (!/\/host\/karaoke-lyric-view\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerScreenV33Fixes) return;
  window.__ls26SingerScreenV33Fixes = true;
  window.__ls26SingerScreenV32Fixes = true;

  const CHANNEL = 'ls26-singer-live-v3';
  const COLLECTION = 'karaokeControl';
  const DOC = 'liveLyrics';
  const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (_) { return fallback; } };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));
  const cssNumber = (key, fallback, min, max) => clamp(read(key, fallback), min, max);

  const style = document.createElement('style');
  style.id = 'ls26SingerScreenV33FixStyle';
  style.textContent = `
    #ls26SingerV31Lyrics .ls26-singer-v31-line.ls26-v33-current{
      font-size:var(--ls26-singer-current-scale,1.72em)!important;
      opacity:1!important;
      font-weight:950!important;
      border-left-color:var(--ls26-singer-current-colour,#16d8ff)!important;
      background:linear-gradient(90deg,color-mix(in srgb,var(--ls26-singer-current-colour,#16d8ff) 20%,transparent),color-mix(in srgb,var(--ls26-singer-current-colour,#16d8ff) 4%,transparent) 72%,transparent)!important;
      text-shadow:0 0 18px color-mix(in srgb,var(--ls26-singer-current-colour,#16d8ff) 28%,transparent)!important;
      filter:none!important;
    }
    #ls26SingerV31Lyrics .ls26-singer-v31-line.ls26-v33-context{
      font-size:var(--ls26-singer-context-scale,1.48em)!important;
      opacity:.96!important;
      font-weight:880!important;
      border-left-color:transparent!important;
      background:none!important;
      text-shadow:none!important;
      filter:none!important;
    }
    #ls26SingerV31Lyrics .ls26-singer-v31-line.ls26-v33-muted{
      font-size:var(--ls26-singer-muted-scale,.82em)!important;
      opacity:var(--ls26-singer-muted-opacity,.60)!important;
      font-weight:760!important;
      border-left-color:transparent!important;
      background:none!important;
      text-shadow:none!important;
      filter:saturate(.78)!important;
    }
    #singerSettings{z-index:2147483646!important}
    #singerSettings:not(.hidden){display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
    #singerSettingsBtn{pointer-events:auto!important}
  `;
  document.head.appendChild(style);

  function applyPrompterPreferences() {
    const focus = cssNumber('ls26:singerFocusPosition', 40, 20, 65);
    const current = cssNumber('ls26:singerCurrentLineScale', 1.72, 1, 2.5);
    const context = cssNumber('ls26:singerContextLineScale', 1.48, .9, 2.3);
    const muted = cssNumber('ls26:singerMutedLineScale', .82, .45, 1.4);
    const opacity = cssNumber('ls26:singerMutedOpacity', .60, .2, 1);
    const colour = /^#[0-9a-f]{6}$/i.test(read('ls26:singerCurrentLineColour', '#16d8ff')) ? read('ls26:singerCurrentLineColour', '#16d8ff') : '#16d8ff';
    document.documentElement.style.setProperty('--ls26-singer-focus-pct', String(focus / 100));
    document.documentElement.style.setProperty('--ls26-singer-current-scale', `${current}em`);
    document.documentElement.style.setProperty('--ls26-singer-context-scale', `${context}em`);
    document.documentElement.style.setProperty('--ls26-singer-muted-scale', `${muted}em`);
    document.documentElement.style.setProperty('--ls26-singer-muted-opacity', String(opacity));
    document.documentElement.style.setProperty('--ls26-singer-current-colour', colour);
  }

  let settingsObserver = null;
  function keepSettingsEnabled() {
    const button = document.getElementById('singerSettingsBtn');
    if (!button) return;
    if (button.disabled) button.disabled = false;
    if (button.hasAttribute('disabled')) button.removeAttribute('disabled');
    button.setAttribute('aria-disabled', 'false');
  }

  function installControls() {
    const settingsButton = document.getElementById('singerSettingsBtn');
    const settings = document.getElementById('singerSettings');
    const close = document.getElementById('closeSingerSettings');
    const fullscreen = document.getElementById('fullscreenSingerBtn');
    keepSettingsEnabled();

    if (settingsButton) {
      settingsButton.onclick = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        keepSettingsEnabled();
        settings?.classList.toggle('hidden');
      };
      settingsButton.onkeydown = event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        keepSettingsEnabled();
        settings?.classList.toggle('hidden');
      };
      settingsObserver = new MutationObserver(() => keepSettingsEnabled());
      settingsObserver.observe(settingsButton, { attributes:true, attributeFilter:['disabled','aria-disabled'] });
    }

    if (close) {
      close.onclick = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        settings?.classList.add('hidden');
      };
    }

    if (fullscreen) {
      fullscreen.onclick = async event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) await document.exitFullscreen();
            else document.webkitExitFullscreen?.();
          } else if (document.documentElement.requestFullscreen) {
            try { await document.documentElement.requestFullscreen({ navigationUI:'hide' }); }
            catch (_) { await document.documentElement.requestFullscreen(); }
          } else document.documentElement.webkitRequestFullscreen?.();
        } catch (error) {
          console.warn('Singer fullscreen request failed:', error);
        }
      };
    }
  }

  function allLyricLines() {
    return [...document.querySelectorAll('#ls26SingerV31Lyrics .ls26-singer-v31-line:not(.is-chord-line)')]
      .filter(line => line.textContent.trim());
  }

  function rawLineFromSync(sync) {
    if (!sync) return null;
    const sectionIndex = Number(sync.sourceIndex);
    const lineIndex = Number(sync.currentLyricLineIndex);
    if (Number.isFinite(sectionIndex) && Number.isFinite(lineIndex) && lineIndex >= 0) {
      const section = document.querySelector(`#ls26SingerV31Lyrics .ls26-singer-v31-section[data-source-index="${sectionIndex}"]`);
      if (section) {
        const exact = [...section.querySelectorAll('.ls26-singer-v31-line:not(.is-chord-line)')]
          .find(line => Number(line.dataset.sourceLineIndex) === lineIndex);
        if (exact) return exact;
      }
    }
    const wanted = String(sync.currentLyricText || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (wanted) {
      const lines = allLyricLines();
      return lines.find(line => line.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === wanted)
        || lines.find(line => {
          const text = line.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
          return text.includes(wanted) || wanted.includes(text);
        }) || null;
    }
    return null;
  }

  function correctedLineFromSync(sync) {
    const raw = rawLineFromSync(sync);
    if (!raw) return null;
    const lines = allLyricLines();
    const index = lines.indexOf(raw);
    if (index <= 0) return raw;
    return lines[index - 1];
  }

  function focusSingerLine(sync, { scroll=false } = {}) {
    const current = correctedLineFromSync(sync);
    if (!current) return;
    const lines = allLyricLines();
    const idx = lines.indexOf(current);
    if (idx < 0) return;

    lines.forEach((line, index) => {
      const distance = Math.abs(index - idx);
      line.classList.toggle('ls26-v33-current', distance === 0);
      line.classList.toggle('ls26-v33-context', distance === 1 || distance === 2);
      line.classList.toggle('ls26-v33-muted', distance > 2);
    });

    if (scroll) {
      const headerBottom = document.querySelector('.singer-topbar')?.getBoundingClientRect().bottom || 0;
      const pct = cssNumber('ls26:singerFocusPosition', 40, 20, 65) / 100;
      const anchor = Math.max(headerBottom + 44, innerHeight * pct);
      const target = Math.max(0, current.getBoundingClientRect().top + scrollY - anchor);
      const delta = target - scrollY;
      if (Math.abs(delta) > 1) scrollBy(0, delta * (Math.abs(delta) > innerHeight * .35 ? .24 : .16));
    }
  }

  let latest = null;
  let channel = null;
  let firestoreUnsub = null;
  let frame = 0;
  function applyState(state) {
    if (!state || Number(state.version) !== 3) return;
    latest = state;
    keepSettingsEnabled();
    requestAnimationFrame(() => focusSingerLine(state.sync, { scroll:state.phase === 'playing' }));
    if (state.phase === 'playing' && !frame) frame = requestAnimationFrame(tick);
    if (state.phase !== 'playing' && frame) { cancelAnimationFrame(frame); frame = 0; }
  }
  function tick() {
    frame = 0;
    if (!latest || latest.phase !== 'playing') return;
    keepSettingsEnabled();
    focusSingerLine(latest.sync, { scroll:true });
    frame = requestAnimationFrame(tick);
  }

  function startSyncListener() {
    try {
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = event => { if (event.data?.type === 'state') applyState(event.data.state); };
      }
    } catch (_) {}
    if (window.db) {
      try {
        firestoreUnsub = window.db.collection(COLLECTION).doc(DOC).onSnapshot(doc => {
          const state = doc.exists ? doc.data()?.singerV3 : null;
          if (state) applyState(state);
        });
      } catch (_) {}
    }
  }

  applyPrompterPreferences();
  installControls();
  startSyncListener();
  window.addEventListener('storage', event => {
    if (String(event.key || '').startsWith('ls26:singer') || event.key === 'karaokeGuidanceMode' || event.key === 'ls26:karaokeSingerBackground' || event.key === 'ls26:karaokeSingerBottomBar') {
      applyPrompterPreferences();
      keepSettingsEnabled();
    }
  });
  window.addEventListener('pagehide', () => {
    if (frame) cancelAnimationFrame(frame);
    settingsObserver?.disconnect();
    try { channel?.close(); } catch (_) {}
    try { firestoreUnsub?.(); } catch (_) {}
  }, { once:true });
})();
