/* LyricView follow refinements: compact beat pulse, navigation preference,
 * completion banner, and improvisation-safe dynamic meter locking. */
(() => {
  'use strict';
  if (!/\/host\/lyricview\.html$/i.test(String(location.pathname || ''))) return;

  const $ = id => document.getElementById(id);
  const NAV_KEY = 'ls26:showLyricNavigation';
  let beatTimer = null;
  let lockedMeter = null;
  let baseMeterMap = null;
  let meterMapWrapper = null;
  let timedViewWrapper = null;
  let baseTimedView = null;

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
    .host-section-body .ls26-time-signature-change,.host-section-body .ls26-inline-performance-note{display:block!important;width:max-content!important;max-width:calc(100% - 28px)!important;margin:10px auto!important;text-align:center!important;white-space:normal!important;line-height:1.15!important}
    .host-section-body .ls26-time-signature-change{font-size:13px!important;padding:6px 10px!important}
    .host-section-body .ls26-inline-performance-note{font-size:16px!important;padding:7px 12px!important}
    html.ls26-hide-lyric-navigation .host-nav-pad{display:none!important}
    html.ls26-hide-lyric-navigation #chordFollowFloatCard{right:14px!important;left:auto!important;top:58%!important;bottom:auto!important;transform:translateY(-50%)!important}
  `;
  (document.head || document.documentElement).append(style);

  function currentStatusText() {
    return String($('chordFollowStatus')?.textContent || '').trim();
  }

  function activeChordBeat() {
    const active = document.querySelector('.host-section-body .ls26-active-chord[data-ls26-start-beat]');
    const beat = Number(active?.dataset?.ls26StartBeat);
    if (Number.isFinite(beat)) return beat;
    try {
      const snap = window.LS26Click?.driver?.()?.snapshot?.();
      if (Number.isFinite(Number(snap?.beat))) return Number(snap.beat);
    } catch (_) {}
    return Number(window.LS26TimedView?.startBeat?.()) || 0;
  }

  function installMeterLock() {
    const map = window.LS26MeterMap;
    if (map && map !== meterMapWrapper && !map.__ls26ImprovMeterLock) {
      baseMeterMap = map;
      meterMapWrapper = {
        current(beat) { return lockedMeter ? { ...lockedMeter } : baseMeterMap.current(beat); },
        nextAfter(startBeat) { return lockedMeter ? null : baseMeterMap.nextAfter(startBeat); },
        segments() { return baseMeterMap.segments(); },
        rebuild() { return baseMeterMap.rebuild(); },
        __ls26ImprovMeterLock: true
      };
      window.LS26MeterMap = meterMapWrapper;
    }

    const timed = window.LS26TimedView;
    if (timed && timed !== timedViewWrapper && !timed.__ls26ImprovMeterView) {
      baseTimedView = timed;
      timedViewWrapper = { ...timed, meter: () => lockedMeter ? { ...lockedMeter } : baseTimedView.meter?.() };
      Object.defineProperty(timedViewWrapper, '__ls26ImprovMeterView', { value: true, enumerable: false });
      if (timed.__ls26DynamicMeterWrapper) Object.defineProperty(timedViewWrapper, '__ls26DynamicMeterWrapper', { value: true, enumerable: false });
      Object.defineProperty(timedViewWrapper, '__ls26ImprovMeterSource', { value: timed, enumerable: false });
      timedViewWrapper = Object.freeze(timedViewWrapper);
      window.LS26TimedView = timedViewWrapper;
    }
  }

  function lockMeterForImprov() {
    installMeterLock();
    if (lockedMeter || !baseMeterMap) return;
    const beat = activeChordBeat();
    const meter = baseMeterMap.current(beat);
    if (meter) lockedMeter = { ...meter };
  }

  function unlockMeterAfterImprov() {
    lockedMeter = null;
  }

  function syncImprovMeterLock() {
    const text = currentStatusText();
    if (/IMPROV HOLD|IMPROV EXIT QUEUED/i.test(text)) lockMeterForImprov();
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
    document.documentElement.classList.toggle('ls26-hide-lyric-navigation', !visible);
    const pad = document.querySelector('.host-nav-pad');
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

  function observeStatusForMeterLock() {
    const status = $('chordFollowStatus');
    if (!status || status.dataset.ls26MeterObserved === '1') return false;
    status.dataset.ls26MeterObserved = '1';
    new MutationObserver(syncImprovMeterLock).observe(status, { subtree:true, childList:true, characterData:true, attributes:true });
    syncImprovMeterLock();
    return true;
  }

  window.addEventListener('ls26:improv-release-countdown', event => {
    if (event.detail?.active === true) lockMeterForImprov();
    else unlockMeterAfterImprov();
  });

  window.addEventListener('ls26:song-ready', () => {
    lockedMeter = null;
    setTimeout(installAll, 0);
  });

  function installAll() {
    installMeterLock();
    installBeatPulse();
    installCompletionBanner();
    installNavigationToggle();
    observeStatusForMeterLock();
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
