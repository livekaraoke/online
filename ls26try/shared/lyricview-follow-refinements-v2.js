/* LyricView follow refinements: compact beat pulse, navigation preference,
 * completion banner and inline marker presentation.
 * Meter/timeline ownership intentionally lives in lyricview-improv-timeline-sync-v2.js.
 */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;

  const $ = id => document.getElementById(id);
  const NAV_KEY = 'ls26:showLyricNavigation';
  let beatTimer = null;

  const style = document.createElement('style');
  style.id = 'ls26FollowRefinementsV2Style';
  style.textContent = `
    #chordFollowFloatCard .ls26-follow-status-wrap{grid-template-columns:minmax(0,1fr) 24px!important;gap:6px!important;align-items:center!important}
    #chordFollowFloatCard .ls26-follow-status-summary{text-align:center!important}
    #chordFollowFloatCard .ls26-follow-beat{width:24px!important;height:24px!important;font-size:11px!important;transition:background-color 55ms linear,color 55ms linear,border-color 55ms linear,box-shadow 55ms linear!important}
    #chordFollowFloatCard .ls26-follow-beat.is-flashing{background:var(--ls-accent)!important;border-color:var(--ls-accent)!important;color:var(--ls-bg)!important;box-shadow:0 0 14px color-mix(in srgb,var(--ls-accent) 55%,transparent)!important}
    #chordFollowFloatCard .ls26-follow-beat.is-orange.is-flashing{background:var(--ls26-improv-countdown-color,#ff8a24)!important;border-color:var(--ls26-improv-countdown-color,#ff8a24)!important;color:var(--ls-bg)!important;box-shadow:0 0 14px color-mix(in srgb,var(--ls26-improv-countdown-color,#ff8a24) 55%,transparent)!important}
    #chordFollowFloatCard .ls26-song-complete-banner{margin:6px 0 2px!important;text-align:center!important;color:#41e37a!important;font-size:13px!important;font-weight:950!important;letter-spacing:.035em!important;line-height:1!important}
    #chordFollowFloatCard .ls26-song-complete-banner[hidden]{display:none!important}
    .song-info-card.lv-metronome .ls26-nav-buttons-toggle{display:flex!important;align-items:center!important;gap:9px!important;margin:0!important;padding:8px 0!important;color:var(--ls-text)!important;font-size:13px!important;font-weight:700!important}
    .host-section-body .ls26-time-signature-change,.host-section-body .ls26-inline-performance-note,.host-section-body .ls26-inline-host-note{display:block!important;width:max-content!important;max-width:calc(100% - 28px)!important;margin:10px auto!important;text-align:center!important;white-space:normal!important;line-height:1.15!important}
    .host-section-body .ls26-time-signature-change{font-size:14px!important;padding:6px 10px!important}
    .host-section-body .ls26-inline-performance-note{padding:7px 12px!important}
    .host-section-body .ls26-inline-host-note{font-size:16px!important;padding:7px 12px!important;border:1px solid rgba(102,199,255,.62)!important;background:rgba(102,199,255,.10)!important;color:#9bdcff!important;border-radius:8px!important;font-weight:900!important}
    .host-section-body .ls26-inline-host-note::before{content:'HOST NOTE · ' attr(data-host-note)!important}
    html.ls26-hide-lyric-navigation .host-nav-pad{visibility:hidden!important;opacity:0!important;pointer-events:none!important}
    html.ls26-hide-lyric-navigation #chordFollowFloatCard{right:var(--ls26-nav-slot-right,14px)!important;left:auto!important;top:var(--ls26-nav-slot-top,58%)!important;bottom:auto!important;transform:translateY(-50%)!important}
  `;
  (document.head || document.documentElement).append(style);

  function currentStatusText() {
    return String($('chordFollowStatus')?.textContent || '').trim();
  }

  function installBeatPulse() {
    const beat = document.querySelector('#chordFollowFloatCard .ls26-follow-beat');
    if (!beat || beat.dataset.ls26PulseV2 === '1') return false;
    beat.dataset.ls26PulseV2 = '1';
    window.addEventListener('ls26:metronome-beat', () => {
      beat.classList.add('is-flashing');
      clearTimeout(beatTimer);
      beatTimer = setTimeout(() => beat.classList.remove('is-flashing'), 90);
    });
    window.addEventListener('ls26:transport-state', event => {
      if (event.detail?.state !== 'playing') beat.classList.remove('is-flashing');
    });
    return true;
  }

  function installCompletionBanner() {
    const card = $('chordFollowFloatCard');
    const status = $('chordFollowStatus');
    if (!card || !status) return false;
    let banner = card.querySelector('.ls26-song-complete-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'ls26-song-complete-banner';
      banner.textContent = 'SONG COMPLETE';
      banner.hidden = true;
      const wrap = card.querySelector('.ls26-follow-status-wrap');
      if (wrap) card.insertBefore(banner, wrap);
      else card.append(banner);
    }
    if (banner.dataset.ls26Observed === '1') return true;
    banner.dataset.ls26Observed = '1';
    const panel = $('endCompletionPanel');
    const sync = () => {
      const complete = /complete/i.test(currentStatusText()) || Boolean(panel && !panel.hidden);
      banner.hidden = !complete;
    };
    new MutationObserver(sync).observe(status, { subtree:true, childList:true, characterData:true, attributes:true });
    if (panel) new MutationObserver(sync).observe(panel, { attributes:true, attributeFilter:['hidden','class'] });
    window.addEventListener('ls26:song-ready', () => { banner.hidden = true; });
    sync();
    return true;
  }

  function readNavPreference() {
    try { return localStorage.getItem(NAV_KEY) !== 'false'; } catch (_) { return true; }
  }

  function applyNavVisibility(show, persist = true) {
    const visible = show !== false;
    const pad = document.querySelector('.host-nav-pad');
    if (pad) {
      const rect = pad.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        document.documentElement.style.setProperty('--ls26-nav-slot-right', Math.max(12, window.innerWidth - rect.right) + 'px');
        document.documentElement.style.setProperty('--ls26-nav-slot-top', (rect.top + rect.height / 2) + 'px');
      }
    }
    document.documentElement.classList.toggle('ls26-hide-lyric-navigation', !visible);
    if (pad) pad.setAttribute('aria-hidden', visible ? 'false' : 'true');
    const input = $('lvMetroShowNavigationButtons');
    if (input) input.checked = visible;
    if (persist) {
      try { localStorage.setItem(NAV_KEY, String(visible)); } catch (_) {}
    }
  }

  function installNavigationToggle() {
    const metro = document.querySelector('.song-info-card.lv-metronome');
    if (!metro) return false;
    let input = $('lvMetroShowNavigationButtons');
    if (!input) {
      const label = document.createElement('label');
      label.className = 'lv-metro-check ls26-nav-buttons-toggle';
      input = document.createElement('input');
      input.type = 'checkbox';
      input.id = 'lvMetroShowNavigationButtons';
      label.append(input, document.createTextNode(' Show up / down / left / right navigation buttons'));
      const followControls = $('lvMetroShowChordFollowControls')?.closest('label');
      if (followControls) metro.insertBefore(label, followControls);
      else metro.append(label);
      input.addEventListener('change', () => applyNavVisibility(input.checked, true));
    }
    applyNavVisibility(readNavPreference(), false);
    return true;
  }

  window.addEventListener('ls26:song-ready', () => setTimeout(installAll, 0));
  window.addEventListener('resize', () => {
    if (document.documentElement.classList.contains('ls26-hide-lyric-navigation')) applyNavVisibility(false, false);
  });

  function installAll() {
    installBeatPulse();
    installCompletionBanner();
    installNavigationToggle();
  }

  const start = () => {
    installAll();
    new MutationObserver(installAll).observe(document.body, { subtree:true, childList:true });
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      installAll();
      if (attempts > 120 && $('chordFollowFloatCard') && document.querySelector('.song-info-card.lv-metronome')) clearInterval(timer);
    }, 100);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();