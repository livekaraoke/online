/* LiveSuite Singer Screen v3.
 * Reliable settings/fullscreen controls, Guitaroke guidance, exact same-device
 * transport/count-in sync and singer-line focus that follows the host display.
 */
(() => {
  'use strict';
  if (!/\/host\/karaoke-lyric-view\.html$/i.test(String(location.pathname || ''))) return;
  if (window.__ls26SingerScreenV3) return;
  window.__ls26SingerScreenV3 = true;
  // A cached dynamic v2 script may still be requested later by data.js.
  window.__ls26SingerScreenV2 = true;

  const COLLECTION = 'karaokeControl';
  const DOC = 'liveLyrics';
  const CHANNEL = 'ls26-singer-live-v3';
  const KEY = {
    guidance:'karaokeGuidanceMode',
    theme:'ls26:singerTheme',
    font:'ls26:singerFont',
    size:'ls26:singerTextSize',
    spacing:'ls26:singerSpacing',
    auto:'ls26:singerAutoScroll',
    speed:'ls26:singerScrollSpeed'
  };

  let guidance = read(KEY.guidance, 'normal');
  let theme = read(KEY.theme, 'default');
  let font = read(KEY.font, 'default');
  let size = read(KEY.size, 'normal');
  let spacing = read(KEY.spacing, 'normal');
  let autoFallback = read(KEY.auto, 'true') !== 'false';
  let localSpeed = clamp(Number(read(KEY.speed, '1')) || 1, .25, 3);

  let song = null;
  let songId = '';
  let latestState = null;
  let latestSync = null;
  let listener = null;
  let movementFrame = 0;
  let countFrame = 0;
  let active = false;
  let channel = null;
  let lastCurrentLine = null;
  let firstMovement = true;

  try { if ('BroadcastChannel' in window) channel = new BroadcastChannel(CHANNEL); } catch (_) {}

  function read(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) {} }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function norm(value) { return String(value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  const style = document.createElement('style');
  style.id = 'ls26SingerScreenV3Style';
  style.textContent = `
    body.ls26-singer-v3-active #standbyView,
    body.ls26-singer-v3-active #autoSendIdleView,
    body.ls26-singer-v3-active #songFinishedView,
    body.ls26-singer-v3-active #songLoadingView,
    body.ls26-singer-v3-active #singerLyrics{display:none!important}
    body.ls26-singer-v3-active{overflow-x:hidden!important;background:var(--singer-custom-background,#00131a)!important}
    body.ls26-singer-v3-active .singer-topbar{position:sticky!important;top:0!important;z-index:130100!important}
    #singerSettings{z-index:130300!important}
    #singerSettings:not(.hidden){display:block!important}
    #ls26SingerV3Lyrics{display:block;box-sizing:border-box;max-width:980px;margin:0 auto;padding:var(--ls26-singer-top-runway,120px) 5vw max(34vh,var(--ls26-singer-bottom-runway,260px));color:#fff;min-height:170vh}
    #ls26SingerV3Lyrics[hidden]{display:none!important}
    .ls26-singer-v3-section{margin:0 0 36px;transition:opacity .22s ease}
    .ls26-singer-v3-section h2{margin:0 0 12px;font-size:.78em;letter-spacing:.07em;text-transform:uppercase;opacity:.78}
    .ls26-singer-v3-body{font-weight:760;line-height:1.42}
    .ls26-singer-line{display:block;box-sizing:border-box;min-height:1.25em;margin:.07em 0;padding:.05em .14em;border-left:4px solid transparent;border-radius:7px;transform-origin:left center;transition:font-size .24s ease,opacity .24s ease,filter .24s ease,background-color .24s ease,border-color .24s ease,text-shadow .24s ease}
    .ls26-singer-line.is-current{font-size:1.38em!important;opacity:1!important;font-weight:950!important;border-left-color:#16d8ff!important;background:linear-gradient(90deg,rgba(22,216,255,.18),rgba(22,216,255,.035) 72%,transparent)!important;text-shadow:0 0 16px rgba(22,216,255,.18);filter:none!important}
    .ls26-singer-line.is-upcoming-featured{font-size:1.18em!important;opacity:.94!important;font-weight:850!important;filter:none!important}
    .ls26-singer-line.is-muted{font-size:.88em!important;opacity:.46!important;filter:saturate(.72)}
    .ls26-singer-line.is-chord-line{font-size:.92em!important;opacity:.84!important;font-weight:900!important;letter-spacing:.025em;color:#eafcff}
    body:not([data-guidance="guitaroke"]) #ls26SingerV3Lyrics .ls26-singer-line.is-chord-line{display:none!important}
    body[data-guidance="normal"] #ls26SingerV3Lyrics .ls26-pro-format{font-style:normal!important;text-decoration:none!important}
    .ls26-singer-performance-cue{margin:14px auto;padding:9px 14px;width:max-content;max-width:90%;border:1px solid currentColor;border-radius:9px;text-align:center;font-weight:900}
    #ls26SingerV3State{position:fixed;z-index:120000;left:0;right:0;bottom:0;top:var(--ls26-singer-header-h,82px);display:flex;align-items:center;justify-content:center;padding:30px;background:var(--singer-custom-background,#00131a);text-align:center;color:#fff}
    #ls26SingerV3State[hidden]{display:none!important}
    .ls26-singer-state-card{width:min(860px,92vw)}
    .ls26-singer-state-kicker{display:block;margin-bottom:18px;color:#16d8ff;font-size:clamp(16px,2vw,25px);font-weight:950;letter-spacing:.14em}
    .ls26-singer-state-card h1{margin:0 0 10px;font-size:clamp(34px,6vw,78px);line-height:1.03}
    .ls26-singer-state-card h2{margin:0;color:#9fc5d1;font-size:clamp(22px,3.4vw,42px)}
    .ls26-singer-count{margin-top:28px;font-size:clamp(96px,20vw,220px);font-weight:950;line-height:1;color:#fff;text-shadow:0 0 35px rgba(0,220,255,.48)}
    .guidance-options button[data-guidance="guitaroke"]{border-color:rgba(255,190,60,.48)!important;color:#ffd16d!important}
    .guidance-options button[data-guidance="guitaroke"].active{background:rgba(255,177,35,.16)!important;border-color:#ffbb35!important;color:#ffe29a!important}
    body[data-theme="warm"] #ls26SingerV3Lyrics{color:#fff5e9}
    body[data-theme="contrast"] #ls26SingerV3Lyrics{color:#fff}
    body[data-font="arial"] #ls26SingerV3Lyrics{font-family:Arial,sans-serif}
    body[data-font="dyslexic"] #ls26SingerV3Lyrics{font-family:OpenDyslexic,Arial,sans-serif}
    body[data-size="small"] #ls26SingerV3Lyrics{font-size:.86em}
    body[data-size="large"] #ls26SingerV3Lyrics{font-size:1.17em}
    body[data-size="xlarge"] #ls26SingerV3Lyrics{font-size:1.35em}
    body[data-spacing="loose"] #ls26SingerV3Lyrics .ls26-singer-v3-body{line-height:1.62}
    body[data-spacing="looser"] #ls26SingerV3Lyrics .ls26-singer-v3-body{line-height:1.85}
  `;
  (document.head || document.documentElement).appendChild(style);

  let lyrics = document.getElementById('ls26SingerV3Lyrics');
  if (!lyrics) {
    lyrics = document.createElement('main');
    lyrics.id = 'ls26SingerV3Lyrics';
    lyrics.hidden = true;
    const topbar = document.querySelector('.singer-topbar');
    if (topbar?.nextSibling) topbar.parentNode.insertBefore(lyrics, topbar.nextSibling);
    else document.body.appendChild(lyrics);
  }

  let stateView = document.getElementById('ls26SingerV3State');
  if (!stateView) {
    stateView = document.createElement('div');
    stateView.id = 'ls26SingerV3State';
    stateView.hidden = true;
    stateView.innerHTML = '<div class="ls26-singer-state-card"><span class="ls26-singer-state-kicker">CURRENTLY SHOWING</span><h1 id="ls26SingerStateTitle">Song</h1><h2 id="ls26SingerStateArtist">Artist</h2><div id="ls26SingerCount" class="ls26-singer-count" hidden>1</div></div>';
    document.body.appendChild(stateView);
  }

  function updateHeaderHeight() {
    const header = document.querySelector('.singer-topbar');
    const height = Math.ceil(header?.getBoundingClientRect().height || 82);
    document.documentElement.style.setProperty('--ls26-singer-header-h', `${height}px`);
    const anchor = Math.max(height + 48, innerHeight * .40);
    document.documentElement.style.setProperty('--ls26-singer-top-runway', `${Math.round(Math.max(34, anchor - height))}px`);
    document.documentElement.style.setProperty('--ls26-singer-bottom-runway', `${Math.round(Math.max(220, innerHeight - anchor + 180))}px`);
  }

  function ensureSettingsEnabled() {
    const button = document.getElementById('singerSettingsBtn');
    if (!button || !active) return;
    button.disabled = false;
    button.removeAttribute('disabled');
    button.setAttribute('aria-disabled', 'false');
  }

  function addGuitarokeOption() {
    const group = document.querySelector('.guidance-options');
    if (!group) return;
    if (!group.querySelector('[data-guidance="guitaroke"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.guidance = 'guitaroke';
      button.textContent = 'Guitaroke';
      group.appendChild(button);
    }
    const help = group.closest('label')?.querySelector('.settings-help');
    if (help) help.textContent = 'Normal Mode shows clean lyrics. Lyrics Pro keeps lyric formatting. Guitaroke also shows the song chords.';
  }

  function setButtons(selector, key, value) {
    document.querySelectorAll(selector).forEach(button => button.classList.toggle('active', button.dataset[key] === value));
  }

  function applySettings() {
    addGuitarokeOption();
    document.body.dataset.guidance = guidance;
    document.body.dataset.theme = theme;
    document.body.dataset.font = font;
    document.body.dataset.size = size;
    document.body.dataset.spacing = spacing;
    setButtons('[data-guidance]', 'guidance', guidance);
    setButtons('[data-theme]', 'theme', theme);
    setButtons('[data-font]', 'font', font);
    setButtons('[data-size]', 'size', size);
    setButtons('[data-spacing]', 'spacing', spacing);
    const auto = document.getElementById('singerAutoScroll');
    if (auto) auto.checked = autoFallback;
    const speedLabel = document.getElementById('singerSpeedLabel');
    const bottomSpeed = document.getElementById('singerBottomSpeed');
    if (speedLabel) speedLabel.textContent = `${localSpeed.toFixed(2)}×`;
    if (bottomSpeed) bottomSpeed.textContent = `${localSpeed.toFixed(2)}×`;
    ensureSettingsEnabled();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else document.webkitExitFullscreen?.();
        return;
      }
      const root = document.documentElement;
      if (root.requestFullscreen) {
        try { await root.requestFullscreen({ navigationUI:'hide' }); }
        catch (_) { await root.requestFullscreen(); }
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      }
    } catch (error) {
      console.warn('Singer fullscreen request failed:', error);
    }
  }

  function installControls() {
    const settingsButton = document.getElementById('singerSettingsBtn');
    const settings = document.getElementById('singerSettings');
    const close = document.getElementById('closeSingerSettings');
    const fullscreen = document.getElementById('fullscreenSingerBtn');

    if (settingsButton) {
      settingsButton.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        if (!active) return;
        settings?.classList.toggle('hidden');
      };
    }
    if (close) close.onclick = event => { event.preventDefault(); settings?.classList.add('hidden'); };
    if (fullscreen) fullscreen.onclick = event => { event.preventDefault(); event.stopPropagation(); void toggleFullscreen(); };

    if (settingsButton) {
      new MutationObserver(() => ensureSettingsEnabled()).observe(settingsButton, { attributes:true, attributeFilter:['disabled','aria-disabled'] });
    }
  }

  document.addEventListener('click', event => {
    const guidanceButton = event.target.closest?.('[data-guidance]');
    if (guidanceButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      guidance = ['normal','pro','guitaroke'].includes(guidanceButton.dataset.guidance) ? guidanceButton.dataset.guidance : 'normal';
      save(KEY.guidance, guidance);
      applySettings();
      if (song) renderSong();
      return;
    }

    const setting = event.target.closest?.('[data-theme],[data-font],[data-size],[data-spacing]');
    if (setting) {
      setTimeout(() => {
        if (setting.dataset.theme) { theme = setting.dataset.theme; save(KEY.theme, theme); }
        if (setting.dataset.font) { font = setting.dataset.font; save(KEY.font, font); }
        if (setting.dataset.size) { size = setting.dataset.size; save(KEY.size, size); }
        if (setting.dataset.spacing) { spacing = setting.dataset.spacing; save(KEY.spacing, spacing); }
        applySettings();
      }, 0);
    }

    if (event.target.closest?.('#singerSpeedDown,#singerMinusBtn')) {
      localSpeed = clamp(localSpeed - .25, .25, 3); save(KEY.speed, localSpeed); setTimeout(applySettings, 0);
    }
    if (event.target.closest?.('#singerSpeedUp,#singerPlusBtn')) {
      localSpeed = clamp(localSpeed + .25, .25, 3); save(KEY.speed, localSpeed); setTimeout(applySettings, 0);
    }
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.id === 'singerAutoScroll') {
      autoFallback = event.target.checked;
      save(KEY.auto, autoFallback);
    }
  }, true);

  function chordOnly(text) {
    if (window.LyricsCommon?.isChordOnlyLine) return window.LyricsCommon.isChordOnlyLine(text);
    const line = String(text || '').trim();
    if (!line || line.length > 120) return false;
    const tokens = line.split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every(token => /^([A-G](?:#|b)?(?:maj|min|m|sus|dim|aug|add)?\d*(?:\/[A-G](?:#|b)?)?|[|:()xX0-9.\-+*]+)$/.test(token));
  }

  function cleanGuitarokeHTML(section) {
    const root = document.createElement('div');
    root.innerHTML = window.LyricsCommon?.stripEditorControls?.(section?.html || '') || String(section?.html || '');
    root.querySelectorAll('.tab-block,.viewer-tab,.tab-line,.tab-dashes,.tab-note,.tab-cell,.note-cell,.host-only,.host-note,.my-note,.ls26-inline-host-note,.chord-diagram,.chords-legend,.ls26-time-signature-change,script,style,button').forEach(node => node.remove());
    root.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
    root.querySelectorAll('[data-host-note]').forEach(node => node.remove());
    root.querySelectorAll('.ls26-inline-performance-note').forEach(node => {
      const text = String(node.dataset.performanceNote || '').trim();
      if (!text) { node.remove(); return; }
      const cue = document.createElement('div');
      cue.className = 'ls26-singer-performance-cue';
      cue.textContent = text;
      const noteSize = clamp(Number(node.dataset.performanceNoteSize) || 18, 10, 40);
      const colour = /^#[0-9a-f]{6}$/i.test(node.dataset.performanceNoteColor || '') ? node.dataset.performanceNoteColor : '#75F2A0';
      cue.style.fontSize = `${noteSize}px`;
      cue.style.color = colour;
      node.replaceWith(cue);
    });
    return root.innerHTML.trim();
  }

  function sectionHtml(section) {
    const base = window.LyricsCommon?.singerHTMLFromSection?.(section) || '';
    if (guidance !== 'guitaroke') return base;
    if (section?.visibleOnSingerScreen === false) return base;
    if (String(section?.type || '').toLowerCase() === 'tab') return base;
    return cleanGuitarokeHTML(section) || base;
  }

  function sourceLines(section) {
    const root = document.createElement('div');
    root.innerHTML = String(section?.html || section?.text || '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(div|p|pre|li|h[1-6])>/gi, '\n</$1>');
    root.querySelectorAll('script,style,.ls26-inline-host-note,[data-host-note]').forEach(node => node.remove());
    return String(root.textContent || '').replace(/\r/g, '').split('\n').map(line => line.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim());
  }

  function wrapLines(body, section) {
    const blockChildren = [...body.children].filter(el => ['DIV','P','PRE','LI'].includes(el.tagName));
    if (blockChildren.length) {
      blockChildren.forEach(el => {
        if (el.classList.contains('ls26-singer-performance-cue') || el.classList.contains('performance-cue')) return;
        el.classList.add('ls26-singer-line');
        if (chordOnly(el.textContent)) el.classList.add('is-chord-line');
      });
    } else {
      const groups = [[]];
      [...body.childNodes].forEach(node => {
        if (node.nodeType === 1 && node.tagName === 'BR') groups.push([]);
        else groups[groups.length - 1].push(node);
      });
      if (groups.length <= 1) {
        body.classList.add('ls26-singer-line');
        if (chordOnly(body.textContent)) body.classList.add('is-chord-line');
      } else {
        body.replaceChildren();
        groups.forEach(nodes => {
          const line = document.createElement('div');
          line.className = 'ls26-singer-line';
          nodes.forEach(node => line.appendChild(node));
          if (!line.textContent.trim() && !line.querySelector('*')) return;
          if (chordOnly(line.textContent)) line.classList.add('is-chord-line');
          body.appendChild(line);
        });
      }
    }

    const raw = sourceLines(section);
    let cursor = 0;
    body.querySelectorAll('.ls26-singer-line').forEach(line => {
      const text = norm(line.textContent);
      if (!text) return;
      let matched = -1;
      for (let i = cursor; i < raw.length; i += 1) {
        const candidate = norm(raw[i]);
        if (!candidate) continue;
        if (candidate === text || candidate.includes(text) || text.includes(candidate)) { matched = i; break; }
      }
      if (matched >= 0) {
        line.dataset.sourceLineIndex = String(matched);
        cursor = matched + 1;
      }
    });
  }

  function renderSong() {
    if (!song) return;
    lyrics.innerHTML = '';
    (song.sections || []).forEach((section, sourceIndex) => {
      if (!window.LyricsCommon?.sectionVisibleOnSingerScreen?.(section)) return;
      if (String(section.type || '').toLowerCase() === 'separator') return;
      const html = sectionHtml(section);
      if (!html) return;

      if (['performancenote','performance-note'].includes(String(section.type || '').toLowerCase())) {
        const cue = document.createElement('div');
        cue.className = 'ls26-singer-performance-cue ls26-singer-v3-section';
        cue.dataset.sourceIndex = String(sourceIndex);
        cue.innerHTML = html;
        lyrics.appendChild(cue);
        return;
      }

      const block = document.createElement('section');
      block.className = 'ls26-singer-v3-section';
      block.dataset.sourceIndex = String(sourceIndex);
      if (section.title) {
        const h = document.createElement('h2');
        h.textContent = section.title;
        block.appendChild(h);
      }
      const body = document.createElement('div');
      body.className = 'ls26-singer-v3-body';
      body.innerHTML = html;
      block.appendChild(body);
      wrapLines(body, section);
      if (guidance !== 'guitaroke') body.querySelectorAll('.is-chord-line').forEach(line => line.remove());
      lyrics.appendChild(block);
    });

    const end = document.createElement('div');
    end.className = 'singer-end';
    end.textContent = '[ END ]';
    lyrics.appendChild(end);
    firstMovement = true;
    requestAnimationFrame(() => { updateHeaderHeight(); applyLineFocus(latestSync); });
  }

  function lyricLines() {
    return [...lyrics.querySelectorAll('.ls26-singer-line:not(.is-chord-line)')].filter(line => line.offsetParent !== null && line.textContent.trim());
  }

  function currentLineFromSync(sync) {
    const lines = lyricLines();
    if (!lines.length) return null;

    const wantedText = norm(sync?.currentLyricText);
    if (wantedText) {
      const exact = lines.find(line => norm(line.textContent) === wantedText);
      if (exact) return exact;
      const fuzzy = lines.find(line => {
        const text = norm(line.textContent);
        return text && (text.includes(wantedText) || wantedText.includes(text));
      });
      if (fuzzy) return fuzzy;
    }

    const sourceIndex = Number(sync?.sourceIndex);
    const lineIndex = Number(sync?.activeLineIndex);
    if (Number.isFinite(sourceIndex) && Number.isFinite(lineIndex) && lineIndex >= 0) {
      const section = lyrics.querySelector(`.ls26-singer-v3-section[data-source-index="${CSS.escape(String(sourceIndex))}"]`);
      const candidates = [...(section?.querySelectorAll?.('.ls26-singer-line:not(.is-chord-line)') || [])].filter(line => line.offsetParent !== null);
      const after = candidates.find(line => Number(line.dataset.sourceLineIndex) > lineIndex);
      if (after) return after;
    }

    const anchor = Math.max((document.querySelector('.singer-topbar')?.getBoundingClientRect().bottom || 0) + 42, innerHeight * .40);
    let current = lines[0];
    let best = Infinity;
    lines.forEach(line => {
      const top = line.getBoundingClientRect().top;
      if (top <= anchor + 30) {
        const distance = Math.abs(anchor - top);
        if (distance < best) { current = line; best = distance; }
      }
    });
    return current;
  }

  function applyLineFocus(sync) {
    if (lyrics.hidden) return;
    const lines = lyricLines();
    if (!lines.length) return;
    const current = currentLineFromSync(sync) || lines[0];
    const currentIndex = Math.max(0, lines.indexOf(current));
    lastCurrentLine = current;

    lines.forEach((line, index) => {
      line.classList.toggle('is-current', index === currentIndex);
      line.classList.toggle('is-upcoming-featured', index === currentIndex + 1 || index === currentIndex + 2);
      line.classList.toggle('is-muted', index < currentIndex || index > currentIndex + 2);
    });
  }

  function singerSections() {
    return [...lyrics.querySelectorAll('.ls26-singer-v3-section[data-source-index]')].filter(el => el.offsetParent !== null);
  }

  function projectedProgress(sync) {
    const base = clamp(Number(sync?.sectionProgress) || 0, 0, 1);
    const rate = Math.max(0, Number(sync?.progressRatePerMs) || 0);
    const elapsed = clamp(Date.now() - Number(sync?.updatedAtMs || Date.now()), 0, 3500);
    return clamp(base + rate * elapsed, 0, 1);
  }

  function semanticTarget(sync) {
    const headerBottom = document.querySelector('.singer-topbar')?.getBoundingClientRect().bottom || 0;
    const anchor = Math.max(headerBottom + 44, innerHeight * .40);
    const currentLine = currentLineFromSync(sync);
    if (currentLine && sync?.currentLyricText) {
      return currentLine.getBoundingClientRect().top + scrollY - anchor;
    }

    const sections = singerSections();
    const wanted = Number(sync?.sourceIndex);
    const activeSection = sections.find(el => Number(el.dataset.sourceIndex) === wanted)
      || [...sections].reverse().find(el => Number(el.dataset.sourceIndex) <= wanted)
      || sections[0]
      || null;
    if (!activeSection) {
      const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      return clamp((Number(sync?.scrollFraction) || 0) * max, 0, max);
    }

    const index = sections.indexOf(activeSection);
    const next = sections[index + 1] || null;
    const activeTop = activeSection.getBoundingClientRect().top + scrollY;
    const nextTop = next ? next.getBoundingClientRect().top + scrollY : activeTop;
    const progress = projectedProgress(sync);
    return activeTop + (nextTop - activeTop) * progress - anchor;
  }

  function movementTick() {
    cancelAnimationFrame(movementFrame);
    movementFrame = 0;
    if (!active || !latestState || lyrics.hidden) return;

    if (latestState.phase === 'playing') {
      if (latestSync) {
        const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        const target = clamp(semanticTarget(latestSync), 0, max);
        const delta = target - scrollY;
        if (firstMovement && Math.abs(delta) > innerHeight * .55) {
          scrollTo(0, target);
          firstMovement = false;
        } else if (Math.abs(delta) > .35) {
          const factor = Math.abs(delta) > innerHeight * .35 ? .18 : .105;
          scrollBy(0, delta * factor);
          firstMovement = false;
        }
      } else if (autoFallback) {
        scrollBy(0, .42 * localSpeed);
      }
      applyLineFocus(latestSync);
    } else {
      applyLineFocus(latestSync);
    }

    movementFrame = requestAnimationFrame(movementTick);
  }

  function setTopbar(title, artist) {
    const titleEl = document.getElementById('singerTitle');
    const artistEl = document.getElementById('singerArtist');
    if (titleEl) titleEl.textContent = title || 'Untitled Song';
    if (artistEl) artistEl.textContent = artist || '';
  }

  function activate() {
    active = true;
    document.body.classList.add('ls26-singer-v3-active');
    document.body.classList.remove('ls26-singer-v2-active');
    ensureSettingsEnabled();
    updateHeaderHeight();
  }

  function showPreview() {
    activate();
    cancelAnimationFrame(movementFrame); movementFrame = 0;
    lyrics.hidden = true;
    stateView.hidden = false;
    stateView.querySelector('.ls26-singer-state-kicker').textContent = 'CURRENTLY SHOWING';
    stateView.querySelector('#ls26SingerStateTitle').textContent = song?.title || latestState?.title || 'Untitled Song';
    stateView.querySelector('#ls26SingerStateArtist').textContent = window.ArtistNames?.display?.(song?.artist || latestState?.artist) || song?.artist || latestState?.artist || '';
    stateView.querySelector('#ls26SingerCount').hidden = true;
    setTopbar(song?.title || latestState?.title, window.ArtistNames?.display?.(song?.artist || latestState?.artist) || song?.artist || latestState?.artist || '');
    scrollTo(0, 0);
  }

  function showCountIn() {
    activate();
    cancelAnimationFrame(movementFrame); movementFrame = 0;
    lyrics.hidden = true;
    stateView.hidden = false;
    stateView.querySelector('.ls26-singer-state-kicker').textContent = 'GET READY';
    stateView.querySelector('#ls26SingerStateTitle').textContent = song?.title || latestState?.title || 'Untitled Song';
    stateView.querySelector('#ls26SingerStateArtist').textContent = window.ArtistNames?.display?.(song?.artist || latestState?.artist) || song?.artist || latestState?.artist || '';
    const count = stateView.querySelector('#ls26SingerCount');
    count.hidden = false;
    cancelAnimationFrame(countFrame);
    const tick = () => {
      if (!latestState || latestState.phase !== 'countin') return;
      const bpm = clamp(Number(latestState.bpm) || 96, 20, 400);
      const beatMs = 60000 / bpm;
      const base = Number(latestState.countInBeat) || 0;
      if (!base) count.textContent = '…';
      else {
        const elapsed = Math.max(0, Date.now() - Number(latestState.countInBeatAtMs || Date.now()));
        const predicted = clamp(base + Math.floor(elapsed / beatMs), 1, 4);
        count.textContent = String(predicted);
      }
      countFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  function showLyrics() {
    activate();
    cancelAnimationFrame(countFrame); countFrame = 0;
    stateView.hidden = true;
    lyrics.hidden = false;
    updateHeaderHeight();
    applyLineFocus(latestSync);
    if (!movementFrame) movementFrame = requestAnimationFrame(movementTick);
  }

  function showComplete() {
    showLyrics();
  }

  function applyState() {
    if (!latestState || !song) return;
    latestSync = latestState.sync || latestSync;
    if (latestState.phase === 'preview') { showPreview(); return; }
    if (latestState.phase === 'countin') { showCountIn(); return; }
    if (latestState.phase === 'playing' || latestState.phase === 'paused') { showLyrics(); return; }
    if (latestState.phase === 'complete') { showComplete(); return; }
    showPreview();
  }

  async function loadSong(id) {
    if (!id) return;
    if (song && songId === id) { applyState(); return; }
    songId = id;
    try {
      const snap = await window.db.collection('lyrics').doc(id).get();
      if (!snap.exists) return;
      song = window.LyricsCommon?.normalizeSong?.(snap.data(), snap.id) || { ...snap.data(), firebaseId:snap.id };
      renderSong();
      applyState();
    } catch (error) {
      console.warn('Singer v3 could not load song:', error);
    }
  }

  function acceptState(next) {
    if (!next || Number(next.version) !== 3) return;
    latestState = { ...next };
    latestSync = next.sync || latestSync;
    const id = String(next.songId || '').trim();
    if (!id) return;
    if (!song || songId !== id) void loadSong(id);
    else applyState();
  }

  function handleControl(data) {
    const v3 = data?.singerV3;
    if (v3 && Number(v3.version) === 3) {
      acceptState(v3);
      return;
    }
    const id = String(data?.currentLyricsSongId || data?.currentSongId || data?.songId || '').trim();
    if (!id) return;
    const fallback = {
      version:3,
      songId:id,
      title:data?.songTitle || '',
      artist:data?.songArtist || '',
      bpm:96,
      phase:String(data?.displayState || '').toLowerCase() === 'preview' ? 'preview' : 'paused',
      playing:false,
      sync:null,
      updatedAtMs:Date.now()
    };
    acceptState(fallback);
  }

  function startListeners() {
    if (window.db) {
      listener = window.db.collection(COLLECTION).doc(DOC).onSnapshot(
        doc => handleControl(doc.exists ? doc.data() : {}),
        error => console.warn('Singer v3 control unavailable:', error)
      );
    }
    if (channel) channel.onmessage = event => {
      if (event.data?.type === 'state') acceptState(event.data.state);
    };
    window.addEventListener('storage', event => {
      if (event.key !== 'ls26:singer-v3-state' || !event.newValue) return;
      try {
        const message = JSON.parse(event.newValue);
        if (message?.type === 'state') acceptState(message.state);
      } catch (_) {}
    });
  }

  function start() {
    applySettings();
    installControls();
    updateHeaderHeight();
    startListeners();
    window.addEventListener('resize', () => { updateHeaderHeight(); applyLineFocus(latestSync); });
    window.addEventListener('orientationchange', () => setTimeout(() => { updateHeaderHeight(); applyLineFocus(latestSync); }, 120));
    window.addEventListener('pagehide', () => {
      cancelAnimationFrame(movementFrame); cancelAnimationFrame(countFrame);
      try { listener?.(); } catch (_) {}
      try { channel?.close(); } catch (_) {}
    }, { once:true });
  }

  start();
})();
