/* Legacy Prompter-specific settings and accessible scrolling controls.
   Does not create Firestore listeners or change song selection. */
(() => {
  'use strict';

  const STORE = 'ls26_legacy_prompter_prefs_v1';
  const defaults = {
    theme: 'default', font: 'verdana', lineSpacing: '1.5',
    charSpacing: '0px', fontSizeOffset: 0, scrollZones: true, slaveLyrics: false
  };
  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }
  const prefs = { ...defaults, ...readSaved() };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (_) {} };
  const byId = id => document.getElementById(id);
  const blocksSelector = '.verse,.chorus,.chorusrepeat,.bridge,.note,.action,.section';
  const fontFamilies = { verdana: 'Verdana', arial: 'Arial', mono: 'Courier New' };
  const themes = {
    default: { background: 'black', verse: 'white' },
    warm: { background: '#0a0a0a', verse: '#FFD966' },
    highcontrast: { background: 'black', verse: '#00FF00' }
  };

  function applyStyles() {
    const theme = themes[prefs.theme] || themes.default;
    document.body.style.background = theme.background;
    document.querySelectorAll('.verse').forEach(el =>
      el.style.setProperty('color', theme.verse, 'important'));
    document.querySelectorAll(blocksSelector).forEach(el => {
      el.style.fontFamily = fontFamilies[prefs.font] || fontFamilies.verdana;
      el.style.lineHeight = prefs.lineSpacing;
      el.style.letterSpacing = prefs.charSpacing;
    });
    window.applyTextSizes?.();
  }
  window.applySavedPrompterStyles = applyStyles;

  function intercept(name, preference) {
    const original = window[name];
    if (typeof original !== 'function') return null;
    window[name] = function(value, ...args) {
      const result = original.call(this, value, ...args);
      prefs[preference] = value;
      save();
      applyStyles();
      return result;
    };
    return original;
  }
  const setThemeOriginal = intercept('setTheme', 'theme');
  const setFontOriginal = intercept('setFont', 'font');
  const setLineOriginal = intercept('setLineSpacing', 'lineSpacing');
  const setCharOriginal = intercept('setCharSpacing', 'charSpacing');
  const setSizeOriginal = window.changeFontSize;
  if (typeof setSizeOriginal === 'function') {
    window.changeFontSize = function(change, event) {
      const result = setSizeOriginal.call(this, change, event);
      prefs.fontSizeOffset = Math.max(-10, Math.min(10,
        (Number(prefs.fontSizeOffset) || 0) + (change > 0 ? 2 : -2)));
      save();
      return result;
    };
  }

  function setActiveGroup(selector, index, value, method) {
    const buttons = Array.from(document.querySelectorAll(selector));
    if (!buttons.length || typeof method !== 'function') return;
    const button = buttons[index] || buttons[0];
    method(value, { target: button });
  }

  function syncAutoScrollVisibility() {
    const hidden = (() => {
      try { return localStorage.getItem('karaoke_hide_autoscroll') === '1'; }
      catch (_) { return false; }
    })();
    const controls = byId('autoScrollControls');
    const toggle = byId('toggleAutoscrollBtn');
    controls?.classList.toggle('hidden', hidden);
    if (toggle) {
      toggle.textContent = hidden ? 'AUTO-SCROLL: OFF' : 'AUTO-SCROLL: ON';
      toggle.classList.toggle('active', !hidden);
    }
  }

  function updateScrollZones() {
    const enabled = prefs.scrollZones !== false;
    document.body.classList.toggle('prompter-scroll-zones-hidden', !enabled);
    const toggle = byId('prompterScrollZonesToggle');
    if (toggle) toggle.checked = enabled;
  }

  function updateSlaveLyrics(enabled, changeUrl) {
    const toggle = byId('slaveLyricsToggle');
    if (!toggle) return;
    toggle.checked = enabled;
    prefs.slaveLyrics = enabled;
    save();
    if (changeUrl) {
      const url = new URL(location.href);
      if (enabled) url.searchParams.set('slave', '1');
      else url.searchParams.delete('slave');
      history.replaceState(null, '', url.href);
    }
    if (enabled) window.startSlaveLyrics?.();
    else window.stopSlaveLyrics?.();
  }

  function restore() {
    setActiveGroup('.theme-group button', ['default','warm','highcontrast'].indexOf(prefs.theme),
      prefs.theme, setThemeOriginal);
    setActiveGroup('.font-group button', ['verdana','arial','mono'].indexOf(prefs.font),
      prefs.font, setFontOriginal);
    setActiveGroup('.lspacing button', ['1.5','1.75','2'].indexOf(String(prefs.lineSpacing)),
      prefs.lineSpacing, setLineOriginal);
    setActiveGroup('.cspacing button', ['0px','0.5px','1px'].indexOf(prefs.charSpacing),
      prefs.charSpacing, setCharOriginal);

    if (typeof setSizeOriginal === 'function') {
      const amount = Math.max(-10, Math.min(10, Number(prefs.fontSizeOffset) || 0));
      for (let step = 0; step < Math.abs(amount) / 2; step++) {
        setSizeOriginal(amount > 0 ? 2 : -2);
      }
    }
    applyStyles();
    syncAutoScrollVisibility();
    updateScrollZones();
    // Explicit ?slave=1 overrides a locally stored off setting on initial entry.
    const enableSlave = new URLSearchParams(location.search).get('slave') === '1' ||
      prefs.slaveLyrics === true;
    updateSlaveLyrics(enableSlave, false);
  }

  // Tap to advance a substantial amount; long-press for continuous motion.
  // Native swipes can still pan the page because the targets use touch-action: pan-y.
  function installScrollTarget(id, direction) {
    const button = byId(id);
    if (!button) return;
    let pointerId = null, timer = null, frame = null, lastTime = null, held = false;

    function pulse() {
      // Restart the CSS animation on every press, including successive quick taps.
      button.classList.remove('prompter-scroll-pulse');
      void button.offsetWidth;
      button.classList.add('prompter-scroll-pulse');
    }
    button.addEventListener('animationend', event => {
      if (event.animationName === 'prompter-scroll-tap-pulse') {
        button.classList.remove('prompter-scroll-pulse');
      }
    });

    function stop() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      lastTime = null;
      const wasHeld = held;
      held = false;
      pointerId = null;
      return wasHeld;
    }

    function animate(timestamp) {
      if (!held) { frame = null; return; }
      if (lastTime !== null) {
        const delta = Math.min(0.05, (timestamp - lastTime) / 1000);
        window.scrollBy(0, direction * 210 * delta);
      }
      lastTime = timestamp;
      frame = requestAnimationFrame(animate);
    }

    function step() {
      window.stopAutoScroll?.();
      window.scrollBy({ top: direction * Math.max(60, window.innerHeight * .15),
        behavior: 'smooth' });
    }

    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || pointerId !== null) return;
      window.stopAutoScroll?.();
      pulse();
      pointerId = event.pointerId;
      held = false;
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
      timer = setTimeout(() => {
        timer = null;
        if (pointerId === null) return;
        held = true;
        frame = requestAnimationFrame(animate);
      }, 220);
    });

    button.addEventListener('pointerup', event => {
      if (pointerId !== event.pointerId) return;
      const wasHeld = stop();
      if (!wasHeld) step();
    });
    button.addEventListener('pointercancel', () => { stop(); });
    button.addEventListener('lostpointercapture', () => {
      if (pointerId !== null) stop();
    });
    button.addEventListener('click', event => {
      if (event.detail === 0) { pulse(); step(); } // keyboard and accessibility activation
    });
    button.addEventListener('contextmenu', event => event.preventDefault());
    window.addEventListener('blur', () => { stop(); });
  }

  function initialize() {
    byId('prompterScrollZonesToggle')?.addEventListener('change', event => {
      prefs.scrollZones = Boolean(event.target.checked);
      save();
      updateScrollZones();
    });
    byId('slaveLyricsToggle')?.addEventListener('change', event => {
      updateSlaveLyrics(Boolean(event.target.checked), true);
    });
    byId('prompterFullscreenViewerBtn')?.addEventListener('click', () => {
      if (window.parent !== window && window.parent.__ls26PrompterShell === true) {
        void window.parent.__ls26PrompterToggleFullscreen?.();
        return;
      }
      const url = new URL('fullscreen.html', location.href);
      url.search = location.search;
      url.hash = location.hash;
      location.assign(url.href);
    });

    installScrollTarget('prompterScrollUp', -1);
    installScrollTarget('prompterScrollDown', 1);
    // The original script's window.onload installs default active states.
    // Restore after that, and also reapply whenever new lyrics are rendered.
    window.addEventListener('load', restore);
  }
  if (document.readyState === 'complete') initialize();
  else initialize(); // script is at the end of body; elements already exist
})();
