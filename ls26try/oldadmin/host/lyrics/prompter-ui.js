/* Legacy Prompter-specific settings and accessible scrolling controls.
   Does not create Firestore listeners or change song selection. */
(() => {
  'use strict';

  const STORE = 'ls26_legacy_prompter_prefs_v1';
  const defaults = {
    theme: 'default', font: 'verdana', lineSpacing: '1.5', lineGap: 8,
    noteGapAbove: 48, noteGapBelow: 48,
    charSpacing: '0px', fontSizeOffset: 0, scrollZones: true, slaveLyrics: false,
    wideLyrics: false, arrowOpacity: 55, arrowSize: 100, devConsole: false
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

  function applyLineGap() {
    const gap = clampPreference(prefs.lineGap, 8, 0, 28, 2);
    const spacing = ['1.5', '1.75', '2'].includes(String(prefs.lineSpacing))
      ? Number(prefs.lineSpacing) : 1.5;
    // Legacy files encode lyric lines with <br>, so extra line-height adds
    // vertical space without altering lyrics, whitespace, or chord positions.
    // Exclude modern sections: their discrete lyric rows use a CSS margin.
    document.querySelectorAll(
      '#lyrics-container .verse:not(.modern-prompter-section),' +
      '#lyrics-container .chorus,#lyrics-container .chorusrepeat,' +
      '#lyrics-container .bridge'
    ).forEach(el => {
      el.style.lineHeight = `calc(${spacing}em + ${gap}px)`;
    });
    document.documentElement.style.setProperty('--prompter-line-gap', gap + 'px');
    const input = byId('prompterLineGap');
    const output = byId('prompterLineGapValue');
    if (input) input.value = String(gap);
    if (output) output.textContent = gap + ' px';
  }

  function applyNoteSpacing() {
    const above = clampPreference(prefs.noteGapAbove, 48, 0, 160, 8);
    const below = clampPreference(prefs.noteGapBelow, 48, 0, 160, 8);
    document.documentElement.style.setProperty('--prompter-note-extra-above', above + 'px');
    document.documentElement.style.setProperty('--prompter-note-extra-below', below + 'px');
    const aboveSlider = byId('prompterNoteGapAbove');
    const belowSlider = byId('prompterNoteGapBelow');
    const aboveOutput = byId('prompterNoteGapAboveValue');
    const belowOutput = byId('prompterNoteGapBelowValue');
    if (aboveSlider) aboveSlider.value = String(above);
    if (belowSlider) belowSlider.value = String(below);
    if (aboveOutput) aboveOutput.textContent = above + ' px';
    if (belowOutput) belowOutput.textContent = below + ' px';
  }

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
    applyLineGap();
    applyNoteSpacing();
    window.applyTextSizes?.();
    scheduleWideLyricsLayout();
    scheduleHeaderOpacity();
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
      scheduleWideLyricsLayout();
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

  // The legacy Prompter uses explicit <br> lyric lines and automatic wrapping.
  // A visual transform preserves those line breaks and the original chord spacing.
  // Reserve the scaled height in document flow so the final lines remain scrollable.
  let wideFrame = null;
  let wideApplied = false;

  function updateWidthButton() {
    const button = byId('prompterFitWidthToggle');
    if (!button) return;
    const active = prefs.wideLyrics === true;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Restore normal lyric width' : 'Fit lyrics to screen width');
    button.title = active ? 'Restore original lyrics layout' : 'Fit lyrics to the screen without adding line breaks';
    const caption = button.querySelector('.prompter-width-caption');
    if (caption) caption.textContent = active ? 'RESET' : 'FIT';
  }

  function resetWideLyricsLayout() {
    const lyrics = byId('lyrics-container');
    if (!lyrics) return;
    lyrics.style.transform = '';
    lyrics.style.transformOrigin = '';
    lyrics.style.marginLeft = '';
    lyrics.style.marginBottom = '';
    lyrics.style.width = '';
    wideApplied = false;
    document.body.classList.remove('prompter-wide-lyrics');
  }

  function measureWidestLyricLine(lyrics) {
    // Read unwrapped intrinsic widths without editing lyric text or changing
    // permanent white-space rules. <br> boundaries remain meaningful.
    let longest = 0;
    const blocks = lyrics.querySelectorAll('.verse,.chorus,.chorusrepeat,.bridge,.note,.action,.section');
    blocks.forEach(block => {
      const originalWidth = block.style.width;
      const originalSpace = block.style.whiteSpace;
      try {
        block.style.width = 'max-content';
        block.style.whiteSpace = 'nowrap';
        longest = Math.max(longest, block.getBoundingClientRect().width);
      } finally {
        block.style.width = originalWidth;
        block.style.whiteSpace = originalSpace;
      }
    });
    return longest;
  }

  function layoutWideLyrics() {
    wideFrame = null;
    const lyrics = byId('lyrics-container');
    if (!lyrics) return;
    if (prefs.wideLyrics !== true) {
      if (wideApplied) resetWideLyricsLayout();
      return;
    }
    // Measure the original layout (not the already transformed dimensions).
    lyrics.style.transform = '';
    lyrics.style.marginLeft = '';
    lyrics.style.marginBottom = '';
    lyrics.style.width = '';
    const originalBox = lyrics.getBoundingClientRect();
    const availableWidth = Math.max(1, document.documentElement.clientWidth - 20);
    const longest = Math.max(1, measureWidestLyricLine(lyrics));
    const safeWidth = Math.max(1, longest);
    // Enlarge only to the space available. Never reduce below normal size.
    const scale = Math.max(1, Math.min(1.22, availableWidth / safeWidth));
    const leftShift = Math.max(0, originalBox.left - 10);
    lyrics.style.width = originalBox.width + 'px';
    lyrics.style.marginLeft = -leftShift + 'px';
    lyrics.style.transformOrigin = 'top left';
    lyrics.style.transform = 'scale(' + scale + ')';
    // CSS transforms do not change layout height; compensate at the bottom.
    lyrics.style.marginBottom = Math.ceil(lyrics.offsetHeight * (scale - 1)) + 'px';
    document.body.classList.add('prompter-wide-lyrics');
    wideApplied = true;
  }

  function scheduleWideLyricsLayout() {
    if (wideFrame !== null) cancelAnimationFrame(wideFrame);
    wideFrame = requestAnimationFrame(layoutWideLyrics);
  }

  function toggleWideLyrics() {
    prefs.wideLyrics = prefs.wideLyrics !== true;
    save();
    updateWidthButton();
    scheduleWideLyricsLayout();
  }

  function updateScrollZones() {
    const enabled = prefs.scrollZones !== false;
    document.body.classList.toggle('prompter-scroll-zones-hidden', !enabled);
    document.body.classList.toggle('prompter-scroll-restricted', enabled);
    const toggle = byId('prompterScrollZonesToggle');
    if (toggle) toggle.checked = enabled;
  }

  const clampPreference = (value, fallback, min, max, step) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min,
      min + Math.round((n - min) / step) * step)) : fallback;
  };

  function updateArrowAppearance() {
    const opacity = clampPreference(prefs.arrowOpacity, 55, 20, 100, 5);
    const size = clampPreference(prefs.arrowSize, 100, 70, 150, 10);
    const base = Math.max(124, Math.min(180,
      (Number(window.innerWidth) || document.documentElement.clientWidth || 1024) * .16));
    document.documentElement.style.setProperty('--prompter-arrow-opacity', String(opacity / 100));
    document.documentElement.style.setProperty('--prompter-arrow-diameter',
      Math.round(base * size / 100) + 'px');
    const opacityInput = byId('prompterArrowOpacity');
    const sizeInput = byId('prompterArrowSize');
    if (opacityInput) opacityInput.value = String(opacity);
    if (sizeInput) sizeInput.value = String(size);
    if (byId('prompterArrowOpacityValue')) byId('prompterArrowOpacityValue').textContent = opacity + '%';
    if (byId('prompterArrowSizeValue')) byId('prompterArrowSizeValue').textContent = size + '%';
  }

  function updateDevConsole() {
    const visible = prefs.devConsole === true;
    document.body.classList.toggle('prompter-dev-visible', visible);
    const panel = byId('devPanel');
    if (panel) {
      // Logging may set display:block; visibility stays controlled by the class.
      panel.style.display = 'block';
      panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    const toggle = byId('prompterDevConsoleToggle');
    if (toggle) toggle.checked = visible;
  }

  function setDevConsoleVisible(visible) {
    prefs.devConsole = Boolean(visible);
    save();
    updateDevConsole();
  }
  window.prompterToggleDevConsole = () => setDevConsoleVisible(prefs.devConsole !== true);

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
    updateArrowAppearance();
    updateDevConsole();
    updateWidthButton();
    scheduleWideLyricsLayout();
    scheduleHeaderOpacity();
    // Explicit ?slave=1 overrides a locally stored off setting on initial entry.
    const enableSlave = new URLSearchParams(location.search).get('slave') === '1' ||
      prefs.slaveLyrics === true;
    updateSlaveLyrics(enableSlave, false);
  }

  // Share one eased tap animation between both arrow zones, so rapid taps and
  // opposite directions never run competing browser scroll animations.
  let arrowTapFrame = null;
  let arrowTapTarget = null;
  function cancelArrowTapAnimation() {
    if (arrowTapFrame !== null) cancelAnimationFrame(arrowTapFrame);
    arrowTapFrame = null;
    arrowTapTarget = null;
  }

  function smoothArrowStep(direction) {
    const startY = window.scrollY;
    const stepAmount = direction * Math.max(60, window.innerHeight * .15);
    const documentHeight = Math.max(document.documentElement.scrollHeight || 0,
      document.body.scrollHeight || 0);
    const previousTarget = arrowTapTarget === null ? startY : arrowTapTarget;
    const targetY = Math.max(0, Math.min(
      documentHeight > 0 ? Math.max(0, documentHeight - window.innerHeight) : Infinity,
      previousTarget + stepAmount
    ));
    if (arrowTapFrame !== null) cancelAnimationFrame(arrowTapFrame);
    arrowTapFrame = null;
    arrowTapTarget = targetY;
    window.deferAutoScroll?.(1000);
    if (Math.abs(targetY - startY) < .5) {
      arrowTapTarget = null;
      return;
    }
    const duration = 560;
    let startedAt = null;
    function animateStep(timestamp) {
      if (startedAt === null) startedAt = timestamp;
      const fraction = Math.min(1, Math.max(0, (timestamp - startedAt) / duration));
      const ease = fraction * fraction * (3 - 2 * fraction);
      window.scrollTo(0, startY + (targetY - startY) * ease);
      if (fraction < 1) arrowTapFrame = requestAnimationFrame(animateStep);
      else {
        arrowTapFrame = null;
        arrowTapTarget = null;
      }
    }
    arrowTapFrame = requestAnimationFrame(animateStep);
  }

  // A quick tap uses a 560ms eased step; long-press scrolls continuously.
  function installScrollTarget(id, direction) {
    const button = byId(id);
    if (!button) return;
    let pointerId = null, timer = null, frame = null, lastTime = null, held = false;
    let startX = 0, startY = 0, moved = false;

    function pulse() {
      // Restart the CSS animation on every press, including successive quick taps.
      button.classList.remove('prompter-scroll-pulse');
      void button.offsetWidth;
      button.classList.add('prompter-scroll-pulse');
    }
    button.addEventListener('animationend', event => {
      if (event.animationName === 'prompter-scroll-tap-pulse' ||
          event.animationName === 'prompter-scroll-up-tap-pulse') {
        button.classList.remove('prompter-scroll-pulse');
      }
    });

    function stop() {
      if (pointerId !== null) window.setAutoScrollManualGesture?.(false);
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
      smoothArrowStep(direction);
    }

    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || pointerId !== null) return;
      window.setAutoScrollManualGesture?.(true);
      pulse();
      pointerId = event.pointerId;
      held = false;
      moved = false;
      startX = event.clientX || 0;
      startY = event.clientY || 0;
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
      timer = setTimeout(() => {
        timer = null;
        if (pointerId === null) return;
        cancelArrowTapAnimation();
        held = true;
        frame = requestAnimationFrame(animate);
      }, 220);
    });

    button.addEventListener('pointermove', event => {
      if (pointerId !== event.pointerId || moved) return;
      if (Math.hypot((event.clientX || 0) - startX,
            (event.clientY || 0) - startY) > 18) {
        moved = true;
        stop(); // swiping the right zone must neither pan nor accidentally tap
      }
    });
    button.addEventListener('pointerup', event => {
      if (pointerId !== event.pointerId) return;
      const wasHeld = stop();
      if (!wasHeld && !moved) step();
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

  // With the arrow zones enabled, allow native scroll only from the left strip.
  // Disabling the arrow zones restores native scrolling everywhere.
  // Programmatic arrows and Auto Scroll remain unaffected.
  let manualTouchStartedInStrip = false;
  let manualTouchAutoScrollGesture = false;
  const manualStripWidth = () =>
    (document.documentElement.clientWidth || window.innerWidth || 0) * .26;
  const inAllowedManualArea = (x, y) => {
    const bar = document.querySelector('.top-bar');
    const lowerBound = bar?.getBoundingClientRect?.().bottom || 116;
    return x >= 0 && x <= manualStripWidth() && y >= lowerBound;
  };
  const inSidebar = target => Boolean(target?.closest?.('#controlPanel'));

  function installRestrictedManualScrolling() {
    document.addEventListener('touchstart', event => {
      const touch = event.touches?.[0];
      const sidebarTouch = inSidebar(event.target);
      const restricted = prefs.scrollZones !== false;
      manualTouchStartedInStrip = Boolean(touch &&
        (sidebarTouch || !restricted || inAllowedManualArea(touch.clientX, touch.clientY)));
      const isControl = Boolean(event.target?.closest?.(
        '.top-bar,#autoScrollControls,button,a,input,select,textarea'));
      manualTouchAutoScrollGesture = manualTouchStartedInStrip && !sidebarTouch && !isControl;
      if (manualTouchAutoScrollGesture) {
        cancelArrowTapAnimation();
        window.setAutoScrollManualGesture?.(true);
      }
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', event => {
      if (event.touches?.length > 1) return; // preserve pinch zoom
      if (prefs.scrollZones !== false && !manualTouchStartedInStrip && event.cancelable) {
        event.preventDefault();
      }
    }, { capture: true, passive: false });
    document.addEventListener('touchend', event => {
      if (!event.touches?.length) {
        if (manualTouchAutoScrollGesture) window.setAutoScrollManualGesture?.(false);
        manualTouchAutoScrollGesture = false;
        manualTouchStartedInStrip = false;
      }
    }, { capture: true, passive: true });
    document.addEventListener('touchcancel', () => {
      if (manualTouchAutoScrollGesture) window.setAutoScrollManualGesture?.(false);
      manualTouchAutoScrollGesture = false;
      manualTouchStartedInStrip = false;
    }, { capture: true, passive: true });
    document.addEventListener('wheel', event => {
      if (inSidebar(event.target)) return;
      if (prefs.scrollZones === false ||
          inAllowedManualArea(event.clientX, event.clientY)) {
        cancelArrowTapAnimation();
        window.deferAutoScroll?.(650);
        return;
      }
      if (event.cancelable) event.preventDefault();
    }, { capture: true, passive: false });
    // Prevent long-press highlighting and the Android text-selection callout
    // only in the lyric content, and only while arrow controls are enabled.
    const isLyricText = target => Boolean(target?.closest?.('#lyrics-container'));
    document.addEventListener('selectstart', event => {
      if (prefs.scrollZones !== false && isLyricText(event.target) && event.cancelable) {
        event.preventDefault();
      }
    }, { capture: true });
    document.addEventListener('contextmenu', event => {
      if (prefs.scrollZones !== false && isLyricText(event.target) && event.cancelable) {
        event.preventDefault();
      }
    }, { capture: true });
  }

  // Fade only the header background; keep the buttons readable on stage.
  let headerFrame = null;
  function updateHeaderOpacity() {
    headerFrame = null;
    const bar = document.querySelector('.top-bar');
    const lyrics = byId('lyrics-container');
    const first = lyrics?.querySelector?.('.section,.verse,.chorus,.chorusrepeat,.bridge');
    if (!bar || !first) return;
    bar.classList.toggle('prompter-over-lyrics',
      first.getBoundingClientRect().top <= bar.getBoundingClientRect().bottom);
  }
  function scheduleHeaderOpacity() {
    if (headerFrame !== null) return;
    headerFrame = requestAnimationFrame(updateHeaderOpacity);
  }

  function initialize() {
    installRestrictedManualScrolling();
    window.addEventListener('scroll', scheduleHeaderOpacity, { passive: true });
    byId('prompterFitWidthToggle')?.addEventListener('click', toggleWideLyrics);
    window.addEventListener('resize', () => {
      updateArrowAppearance();
      scheduleHeaderOpacity();
      if (prefs.wideLyrics === true) scheduleWideLyricsLayout();
    });
    byId('prompterScrollZonesToggle')?.addEventListener('change', event => {
      prefs.scrollZones = Boolean(event.target.checked);
      if (!prefs.scrollZones) cancelArrowTapAnimation();
      if (!prefs.scrollZones && manualTouchAutoScrollGesture) {
        window.setAutoScrollManualGesture?.(false);
        manualTouchAutoScrollGesture = false;
      }
      save();
      updateScrollZones();
    });
    byId('prompterLineGap')?.addEventListener('input', event => {
      prefs.lineGap = clampPreference(event.target.value, 8, 0, 28, 2);
      save();
      applyLineGap();
      // Rescale the FIT view to account for the updated document height.
      if (prefs.wideLyrics === true) scheduleWideLyricsLayout();
    });
    const changeNoteGap = (preference, event) => {
      prefs[preference] = clampPreference(event.target.value, 48, 0, 160, 8);
      save();
      applyNoteSpacing();
      if (prefs.wideLyrics === true) scheduleWideLyricsLayout();
    };
    byId('prompterNoteGapAbove')?.addEventListener('input', event =>
      changeNoteGap('noteGapAbove', event));
    byId('prompterNoteGapBelow')?.addEventListener('input', event =>
      changeNoteGap('noteGapBelow', event));
    byId('prompterArrowOpacity')?.addEventListener('input', event => {
      prefs.arrowOpacity = clampPreference(event.target.value, 55, 20, 100, 5);
      save();
      updateArrowAppearance();
    });
    byId('prompterArrowSize')?.addEventListener('input', event => {
      prefs.arrowSize = clampPreference(event.target.value, 100, 70, 150, 10);
      save();
      updateArrowAppearance();
    });
    byId('prompterDevConsoleToggle')?.addEventListener('change', event => {
      setDevConsoleVisible(event.target.checked);
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
