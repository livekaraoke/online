/* LyricView presentation helpers: repeated chord rows, top Chord Follow controls,
 * beat-dot progress, floating-card fade, and configured IMPROV chord loops.
 * DOM/local state only; no Firestore writes. */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;
  if (window.LS26LyricViewPerformanceEnhancements) return;

  const HIDE_KEY = 'ls26:hideRepeatedChordRows';
  const $ = id => document.getElementById(id);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value == null ? fallback : value; } catch (_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, String(value)); } catch (_) {} };
  let hideRepeated = read(HIDE_KEY, '1') !== '0';
  let lastActiveEvent = '';
  let activeBeatCount = 0;
  let improvLoop = { card:null, step:0, beatInStep:0 };
  let refreshTimer = 0;

  function installStyle() {
    if ($('ls26LyricPerformanceEnhancementStyle')) return;
    const style = document.createElement('style');
    style.id = 'ls26LyricPerformanceEnhancementStyle';
    style.textContent = `
      #performanceChordFollowCard{display:grid!important;gap:9px!important;margin-top:8px!important;padding:10px 12px!important;border:1px solid color-mix(in srgb,var(--ls-accent) 38%,var(--ls-border))!important;border-radius:10px!important;background:color-mix(in srgb,var(--ls-panel) 94%,transparent)!important;box-shadow:inset 0 0 0 1px rgba(0,202,250,.03)!important}
      #performanceChordFollowCard .ls26-pcf-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important}
      #performanceChordFollowCard .ls26-pcf-head strong{font-size:11px!important;letter-spacing:.08em!important;color:var(--ls-accent)!important}
      #performanceChordFollowCard .ls26-pcf-toggle{display:flex!important;align-items:center!important;gap:8px!important;min-height:34px!important;padding:5px 8px!important;border:1px solid var(--ls-border)!important;border-radius:7px!important;color:var(--ls-text)!important;font-size:10px!important;font-weight:800!important}
      #performanceChordFollowCard .ls26-pcf-toggle input{margin:0!important;accent-color:var(--ls-accent)!important}
      #performanceChordFollowCard .ls26-pcf-actions{display:grid!important;grid-template-columns:minmax(105px,1fr) auto auto!important;gap:6px!important}
      #performanceChordFollowCard button{min-height:34px!important;padding:5px 9px!important;border:1px solid var(--ls-border)!important;border-radius:7px!important;background:var(--ls-panel)!important;color:var(--ls-text)!important;font-size:10px!important;font-weight:900!important}
      #performanceChordFollowCard #ls26TopFollowBtn.active{border-color:var(--ls-accent)!important;color:var(--ls-accent)!important;background:color-mix(in srgb,var(--ls-accent) 9%,var(--ls-panel))!important}
      #performanceChordFollowCard #ls26TopRejoinBtn{border-color:var(--ls-warning)!important;color:var(--ls-warning)!important}
      #performanceChordFollowCard .ls26-pcf-options{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important}
      #performanceChordFollowCard .ls26-pcf-status{min-height:14px!important;color:var(--ls-muted)!important;font-size:9px!important;font-weight:750!important;line-height:1.2!important}
      .host-section-body .ls26-repeated-chord-row-hidden{height:0!important;min-height:0!important;max-height:0!important;margin-top:0!important;margin-bottom:0!important;padding-top:0!important;padding-bottom:0!important;border:0!important;overflow:hidden!important;opacity:0!important;line-height:0!important;pointer-events:none!important}
      #chordFollowFloatCard{transition:opacity 1.55s ease,transform 1.55s ease,filter 1.55s ease!important}
      body.ls26-follow-card-playing #chordFollowFloatCard{opacity:.055!important;transform:translateY(9px)!important;filter:saturate(.55)!important;pointer-events:none!important}
      .ls26-chord-beat-marker.ls26-progress-dots::after{display:none!important;content:none!important}
      .ls26-chord-beat-marker.ls26-progress-dots{display:inline-flex!important;align-items:center!important;gap:.12em!important;width:auto!important;min-width:.48em!important;height:1em!important;margin-left:.14em!important;vertical-align:middle!important}
      .ls26-progress-dot{display:inline-block!important;color:currentColor!important;font-size:.40em!important;font-weight:950!important;line-height:1!important;opacity:.50!important;transform:scale(.92);transition:opacity .10s ease,transform .10s ease,text-shadow .10s ease,color .10s ease!important}
      .ls26-progress-dot.is-filled{opacity:1!important;transform:scale(1.18)!important;color:var(--ls26-chord-current-colour,var(--ls-accent))!important;text-shadow:0 0 7px currentColor!important}
      .host-section-body a.lyrics-improv-link[data-improv-link]{min-height:144px!important;height:auto!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:14px!important;padding:18px 22px!important;font-size:0!important;line-height:1!important;text-decoration:none!important}
      .ls26-improv-symbol{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:10px!important;color:var(--ls-warning,#ffd05a)!important;filter:drop-shadow(0 0 9px color-mix(in srgb,var(--ls-warning,#ffd05a) 38%,transparent))!important}
      .ls26-improv-pause{display:inline-flex!important;gap:6px!important}
      .ls26-improv-pause i{display:block!important;width:9px!important;height:42px!important;border-radius:3px!important;background:currentColor!important}
      .ls26-improv-slash{font-size:52px!important;font-weight:300!important;line-height:.75!important;transform:rotate(-4deg)!important;opacity:.72!important}
      .ls26-improv-play{width:0!important;height:0!important;border-top:21px solid transparent!important;border-bottom:21px solid transparent!important;border-left:32px solid currentColor!important;filter:drop-shadow(0 0 5px currentColor)!important}
      .ls26-improv-progression{display:flex!important;align-items:center!important;justify-content:center!important;flex-wrap:wrap!important;gap:10px!important;font-size:16px!important;font-weight:950!important;letter-spacing:.02em!important}
      .ls26-improv-progression[hidden]{display:none!important}
      .ls26-improv-loop-chord{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:42px!important;padding:5px 9px!important;border:1px solid color-mix(in srgb,var(--ls-warning,#ffd05a) 32%,transparent)!important;border-radius:8px!important;color:color-mix(in srgb,var(--ls-warning,#ffd05a) 72%,var(--ls-text))!important;background:rgba(255,208,90,.04)!important;opacity:.62!important;transition:opacity .12s ease,transform .12s ease,box-shadow .12s ease,background .12s ease!important}
      .ls26-improv-loop-chord.is-current{opacity:1!important;transform:scale(1.12)!important;color:var(--ls-warning,#ffd05a)!important;background:color-mix(in srgb,var(--ls-warning,#ffd05a) 14%,transparent)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--ls-warning,#ffd05a) 48%,transparent),0 0 16px color-mix(in srgb,var(--ls-warning,#ffd05a) 18%,transparent)!important}
      @media(max-width:760px){#performanceChordFollowCard .ls26-pcf-actions{grid-template-columns:1fr 1fr 1fr!important}.ls26-improv-slash{font-size:46px!important}.ls26-improv-pause i{height:38px!important}.ls26-improv-play{border-top-width:19px!important;border-bottom-width:19px!important;border-left-width:29px!important}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function chordSignature(row) {
    const nodes = qa('.ls26-chord-token,.ls26-timed-chord,[data-ls26-chord-occurrence="1"],[data-chord-occurrence="1"]', row);
    const values = [];
    const seen = new Set();
    for (const node of nodes) {
      if (node.closest('.ls26-chord-beat-marker')) continue;
      const original = String(node.dataset?.ls26Canonical || node.dataset?.ls26Original || node.dataset?.originalChord || node.textContent || '').trim();
      if (!original) continue;
      const canonical = window.LS26Chords?.canonical?.(original) || original.replace(/^[(\[]|[)\]]$/g, '').trim();
      const key = `${node.dataset?.ls26EventId || ''}|${canonical}|${node.offsetLeft || 0}`;
      if (seen.has(key)) continue;
      seen.add(key); values.push(canonical);
    }
    if (values.length) return values.join('|');
    try {
      return (window.LS26Chords?.tokens?.(row.textContent || '') || []).map(item => window.LS26Chords?.canonical?.(item.symbol || item.text || item) || String(item.symbol || item.text || item)).join('|');
    } catch (_) { return ''; }
  }

  function applyRepeatedRows() {
    for (const body of qa('#lyricsContent .host-section-body')) {
      let previous = '';
      for (const row of qa('.ls26-chord-row', body)) {
        const signature = chordSignature(row);
        const repeated = Boolean(hideRepeated && previous && signature && signature === previous);
        row.classList.toggle('ls26-repeated-chord-row-hidden', repeated);
        row.setAttribute('aria-hidden', repeated ? 'true' : 'false');
        if (signature) previous = signature;
      }
    }
  }

  function originalControls() {
    return {
      card:$('chordFollowFloatCard'), follow:$('chordFollowBtn'), rejoin:$('rejoinChordBtn'), reset:$('resetChordTimingBtn'),
      visual:$('chordFollowVisualBeatFlash'), beat1:$('chordFollowBeat1Only'), status:$('chordFollowStatus')
    };
  }

  function followIsOn() {
    const c = originalControls();
    return Boolean(c.follow && (c.follow.classList.contains('active') || c.follow.getAttribute('aria-pressed') === 'true' || /FOLLOW:\s*ON/i.test(c.follow.textContent || '')));
  }

  function ensureTopCard() {
    let card = $('performanceChordFollowCard');
    if (card) return card;
    const hostNotes = $('performanceSongNoteCard');
    const reference = $('performanceSongReference');
    const anchor = hostNotes || reference;
    if (!anchor || !anchor.parentNode) return null;
    card = document.createElement('section');
    card.id = 'performanceChordFollowCard';
    card.className = 'song-info-card';
    card.innerHTML = `
      <div class="ls26-pcf-head"><strong>CHORD DISPLAY & FOLLOW</strong><label class="ls26-pcf-toggle"><input id="ls26HideRepeatedChordRows" type="checkbox"> HIDE REPEATED CHORD LINES</label></div>
      <div class="ls26-pcf-actions"><button id="ls26TopFollowBtn" type="button">FOLLOW: OFF</button><button id="ls26TopRejoinBtn" type="button">REJOIN</button><button id="ls26TopResetBtn" type="button">RESET</button></div>
      <div class="ls26-pcf-options"><label class="ls26-pcf-toggle"><input id="ls26TopVisualBeat" type="checkbox"> VISUAL BEAT FLASH</label><label class="ls26-pcf-toggle"><input id="ls26TopBeat1Only" type="checkbox"> BEAT 1 ONLY</label></div>
      <div id="ls26TopFollowStatus" class="ls26-pcf-status">Chord Follow controls mirror the performance card.</div>`;
    anchor.insertAdjacentElement('afterend', card);
    const hide = $('ls26HideRepeatedChordRows');
    hide.checked = hideRepeated;
    hide.addEventListener('change', () => { hideRepeated = hide.checked; write(HIDE_KEY, hideRepeated ? '1' : '0'); applyRepeatedRows(); });
    $('ls26TopFollowBtn').onclick = () => originalControls().follow?.click();
    $('ls26TopRejoinBtn').onclick = () => originalControls().rejoin?.click();
    $('ls26TopResetBtn').onclick = () => originalControls().reset?.click();
    $('ls26TopVisualBeat').onchange = event => { const target = originalControls().visual; if (target && target.checked !== event.target.checked) target.click(); };
    $('ls26TopBeat1Only').onchange = event => { const target = originalControls().beat1; if (target && target.checked !== event.target.checked) target.click(); };
    return card;
  }

  function syncTopCard() {
    if (!ensureTopCard()) return;
    const c = originalControls(), top = $('ls26TopFollowBtn');
    const on = followIsOn();
    if (top) { top.textContent = on ? 'FOLLOW: ON' : 'FOLLOW: OFF'; top.classList.toggle('active', on); top.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    const rejoin = $('ls26TopRejoinBtn'); if (rejoin) rejoin.disabled = !c.rejoin || c.rejoin.hidden;
    const reset = $('ls26TopResetBtn'); if (reset) reset.disabled = !c.reset || c.reset.hidden;
    if ($('ls26TopVisualBeat') && c.visual) $('ls26TopVisualBeat').checked = c.visual.checked;
    if ($('ls26TopBeat1Only') && c.beat1) $('ls26TopBeat1Only').checked = c.beat1.checked;
    if ($('ls26TopFollowStatus') && c.status) $('ls26TopFollowStatus').textContent = String(c.status.textContent || '').trim() || (on ? 'Chord Follow ready.' : 'Chord Follow off.');
    if (!on) clearDotProgress();
  }

  function enhanceBeatMarkers(root = document) {
    for (const marker of qa('.ls26-chord-beat-marker[data-ls26-beat-dots]', root)) {
      if (marker.dataset.ls26ProgressReady === '1') continue;
      const tokens = String(marker.dataset.ls26BeatDots || '').trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) continue;
      marker.dataset.ls26ProgressReady = '1';
      marker.classList.add('ls26-progress-dots');
      marker.textContent = '';
      tokens.forEach((token, index) => {
        const dot = document.createElement('span'); dot.className = 'ls26-progress-dot'; dot.textContent = token; dot.dataset.dotIndex = String(index); marker.appendChild(dot);
      });
    }
  }

  function clearDotProgress(except = null) {
    for (const node of qa('.ls26-progress-dot.is-filled')) if (!except || !except.contains(node)) node.classList.remove('is-filled');
    if (!except) { lastActiveEvent = ''; activeBeatCount = 0; }
  }

  function fillActiveDots() {
    if (!followIsOn()) { clearDotProgress(); return; }
    enhanceBeatMarkers();
    const active = document.querySelector('.host-section-body .ls26-active-chord[data-ls26-event-id]');
    if (!active) return;
    const id = String(active.dataset.ls26EventId || '');
    const marker = active.querySelector('.ls26-chord-beat-marker');
    if (!marker) return;
    const dots = qa('.ls26-progress-dot', marker);
    if (!dots.length) return;
    if (id !== lastActiveEvent) { lastActiveEvent = id; activeBeatCount = 0; clearDotProgress(marker); }
    activeBeatCount = Math.min(dots.length, activeBeatCount + 1);
    dots.forEach((dot, index) => dot.classList.toggle('is-filled', index < activeBeatCount));
  }

  function parseList(value) {
    if (!value) return [];
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return String(value).split(/[\s,|]+/).filter(Boolean); }
  }

  function configuredImprov(card) {
    const chords = parseList(card.dataset.improvChords).map(value => String(value).trim()).filter(Boolean);
    const raw = parseList(card.dataset.improvDurations).map(Number);
    const durations = chords.map((_, index) => Number.isFinite(raw[index]) && raw[index] > 0 ? raw[index] : 1);
    return { chords, durations };
  }

  function enhanceImprovCard(card) {
    if (!card || card.dataset.ls26ImprovVisual === '1') return;
    card.dataset.ls26ImprovVisual = '1';
    card.setAttribute('aria-label', 'Improvisation hold. Tap to continue.');
    const config = configuredImprov(card);
    card.textContent = '';
    const symbol = document.createElement('span');
    symbol.className = 'ls26-improv-symbol'; symbol.setAttribute('aria-hidden', 'true');
    symbol.innerHTML = '<span class="ls26-improv-pause"><i></i><i></i></span><span class="ls26-improv-slash">/</span><span class="ls26-improv-play"></span>';
    const progression = document.createElement('span'); progression.className = 'ls26-improv-progression'; progression.hidden = !config.chords.length;
    config.chords.forEach((chord, index) => { const chip = document.createElement('span'); chip.className = 'ls26-improv-loop-chord'; chip.dataset.improvStep = String(index); chip.textContent = chord; progression.appendChild(chip); });
    card.append(symbol, progression);
  }

  function enhanceImprovs(root = document) {
    qa('a.lyrics-song-link[data-improv-link]', root).forEach(enhanceImprovCard);
  }

  function activeImprovCard() { return document.querySelector('a.lyrics-song-link[data-improv-link].ls26-improv-active'); }
  function resetImprovLoop(card = null) {
    improvLoop = { card:null, step:0, beatInStep:0 };
    qa('.ls26-improv-loop-chord.is-current').forEach(node => node.classList.remove('is-current'));
    if (card) qa('.ls26-improv-loop-chord', card).forEach(node => node.classList.remove('is-current'));
  }

  function advanceImprovLoop(event) {
    const card = activeImprovCard();
    if (!card) { if (improvLoop.card) resetImprovLoop(); return; }
    enhanceImprovCard(card);
    const config = configuredImprov(card);
    if (!config.chords.length) return;
    if (Number(event.detail?.sub || 0) !== 0) return;
    if (improvLoop.card !== card) improvLoop = { card, step:0, beatInStep:0 };
    const chips = qa('.ls26-improv-loop-chord', card);
    chips.forEach((chip, index) => chip.classList.toggle('is-current', index === improvLoop.step));
    window.dispatchEvent(new CustomEvent('ls26:improv-loop-chord', { detail:{ chord:config.chords[improvLoop.step], index:improvLoop.step, card } }));
    improvLoop.beatInStep += 1;
    const duration = Math.max(.5, Number(config.durations[improvLoop.step]) || 1);
    if (improvLoop.beatInStep + 1e-7 >= duration) { improvLoop.step = (improvLoop.step + 1) % config.chords.length; improvLoop.beatInStep = 0; }
  }

  function transportPlaying(value) {
    document.body.classList.toggle('ls26-follow-card-playing', value === true);
    if (!value) syncTopCard();
  }

  function detectPlayButton() {
    const play = $('autoScrollBtn'); if (!play) return;
    const sync = () => transportPlaying(play.classList.contains('active') || play.getAttribute('aria-pressed') === 'true');
    new MutationObserver(sync).observe(play, { attributes:true, attributeFilter:['class','aria-pressed'] }); sync();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { applyRepeatedRows(); enhanceBeatMarkers(); enhanceImprovs(); ensureTopCard(); syncTopCard(); }, 80);
  }

  function init() {
    installStyle(); ensureTopCard(); applyRepeatedRows(); enhanceBeatMarkers(); enhanceImprovs(); syncTopCard(); detectPlayButton();
    const float = $('chordFollowFloatCard'); if (float) new MutationObserver(syncTopCard).observe(float, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class','hidden','aria-pressed','checked'] });
    const lyrics = $('lyricsContent'); if (lyrics) new MutationObserver(scheduleRefresh).observe(lyrics, { subtree:true, childList:true });
    window.addEventListener('ls26:song-ready', scheduleRefresh);
    window.addEventListener('ls26:transport-state', event => { const state = String(event.detail?.state || '').toLowerCase(); if (state) transportPlaying(state === 'playing'); if (state !== 'playing') clearDotProgress(); });
    window.addEventListener('ls26:scroll-state', event => { if (typeof event.detail?.playing === 'boolean') transportPlaying(event.detail.playing); });
    window.addEventListener('ls26:metronome-beat', event => { if (Number(event.detail?.sub || 0) === 0) requestAnimationFrame(fillActiveDots); advanceImprovLoop(event); });
    window.addEventListener('ls26:song-finished', () => { transportPlaying(false); clearDotProgress(); resetImprovLoop(); });
  }

  window.LS26LyricViewPerformanceEnhancements = Object.freeze({ applyRepeatedRows, enhanceBeatMarkers, enhanceImprovs, syncTopCard });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();
